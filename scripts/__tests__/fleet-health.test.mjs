// @vitest-environment node
/**
 * lib/health/verify-live.mjs (ported site-engine assertions) +
 * scripts/fleet-health.mjs's pure core. Stubbed fetch throughout — no network.
 */
import { describe, it, expect } from 'vitest';
import { verifyLive, verifyGated } from '../../lib/health/verify-live.mjs';
import { checkTargets } from '../fleet-health.mjs';

const LIVE_HTML =
  '<html><head><script type="application/ld+json">{"@type":"LocalBusiness","name":"Monroe"}</script></head><body>ok</body></html>';

/** Stub fetch: map of exact URL → { status, headers, body }. Unknown URL → 404. */
function stubFetch(routes) {
  return async (url) => {
    const r = routes[url] ?? { status: 404 };
    return {
      status: r.status,
      headers: { get: (name) => r.headers?.[name.toLowerCase()] ?? null },
      text: async () => r.body ?? '',
    };
  };
}

function liveRoutes(base, overrides = {}) {
  return {
    [base]: { status: 200, body: LIVE_HTML },
    [`${base}/sitemap-index.xml`]: { status: 200 },
    [`${base}/robots.txt`]: { status: 200 },
    [`${base}/thanks`]: { status: 200 },
    ...overrides,
  };
}

describe('verifyLive', () => {
  it('passes every check on a healthy live site', async () => {
    const results = await verifyLive('https://monroe.example', stubFetch(liveRoutes('https://monroe.example')));
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.pass)).toBe(true);
  });

  it('fails the noindex check when X-Robots-Tag leaks onto a live site', async () => {
    const routes = liveRoutes('https://monroe.example', {
      'https://monroe.example': {
        status: 200,
        body: LIVE_HTML,
        headers: { 'x-robots-tag': 'noindex' },
      },
    });
    const results = await verifyLive('https://monroe.example', stubFetch(routes));
    const check = results.find((r) => r.name === 'no noindex robots tag');
    expect(check?.pass).toBe(false);
  });

  it('fails the JSON-LD check when no LocalBusiness block exists', async () => {
    const routes = liveRoutes('https://monroe.example', {
      'https://monroe.example': { status: 200, body: '<html>no jsonld</html>' },
    });
    const results = await verifyLive('https://monroe.example', stubFetch(routes));
    const check = results.find((r) => r.name === 'LocalBusiness JSON-LD present');
    expect(check?.pass).toBe(false);
  });

  it('fails the /thanks check when it 404s', async () => {
    const routes = liveRoutes('https://monroe.example');
    delete routes['https://monroe.example/thanks'];
    const results = await verifyLive('https://monroe.example', stubFetch(routes));
    const check = results.find((r) => r.name === '/thanks reachable');
    expect(check?.pass).toBe(false);
  });
});

describe('verifyGated', () => {
  it('passes when the preview gate is closed (401 + auth + noindex)', async () => {
    const results = await verifyGated(
      'https://preview.example',
      stubFetch({
        'https://preview.example': {
          status: 401,
          headers: { 'www-authenticate': 'Basic realm="preview"', 'x-robots-tag': 'noindex' },
        },
      }),
    );
    expect(results.every((r) => r.pass)).toBe(true);
  });

  it('fails when the site answers 200 (gate fell open)', async () => {
    const results = await verifyGated(
      'https://preview.example',
      stubFetch({ 'https://preview.example': { status: 200, body: 'oops' } }),
    );
    expect(results.find((r) => r.name === 'home page returns 401')?.pass).toBe(false);
  });
});

describe('checkTargets (fleet-health core)', () => {
  it('aggregates per-target results and flags failures', async () => {
    const fetchImpl = stubFetch({
      ...liveRoutes('https://good.example'),
      'https://bad.example': { status: 500 },
    });
    const report = await checkTargets(
      [
        { url: 'https://good.example', mode: 'live', label: 'good' },
        { url: 'https://bad.example', mode: 'gated', label: 'bad' },
      ],
      { fetchImpl },
    );
    expect(report.targets).toHaveLength(2);
    expect(report.targets[0].ok).toBe(true);
    expect(report.targets[1].ok).toBe(false);
    expect(report.failures).toHaveLength(1);
    expect(report.failures[0].label).toBe('bad');
    expect(report.ok).toBe(false);
  });

  it('a fetch that throws becomes a failed target, not a crash', async () => {
    const report = await checkTargets([{ url: 'https://down.example', mode: 'live', label: 'down' }], {
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    expect(report.ok).toBe(false);
    expect(report.targets[0].ok).toBe(false);
    expect(report.targets[0].error).toMatch(/ECONNREFUSED/);
  });

  it('empty target list is ok:true with a zero summary', async () => {
    const report = await checkTargets([], { fetchImpl: stubFetch({}) });
    expect(report).toMatchObject({ ok: true, targets: [], failures: [] });
  });
});
