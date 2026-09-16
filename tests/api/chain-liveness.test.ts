/**
 * lib/chain/liveness.mjs — `published` must mean "is up", not "was deployed once".
 *
 * Stage 5 is the one link whose proof could be a dead link. Every other stage
 * counts a state transition that actually happened; this one counts "a URL is
 * stored in a column", which a 404 satisfies just as well as a live site.
 *
 * The rule the funnel already holds applies here too and is the thing most
 * likely to be got wrong: a URL we could NOT check is `unchecked`, never
 * `dead`. Silently folding unreachable-from-here into "down" would report the
 * pipeline as broken every time egress is blocked — which is exactly the
 * condition #322 was filed under, from a container that cannot reach
 * vercel.app at all.
 */
import { describe, it, expect, vi } from 'vitest';
import { summarizeLiveness, probeUrls, LIVE, DEAD, UNCHECKED } from '../../lib/chain/liveness.mjs';

describe('summarizeLiveness — counting', () => {
  it('splits stored URLs into live, dead and unchecked', () => {
    expect(
      summarizeLiveness({
        'https://a.example': LIVE,
        'https://b.example': LIVE,
        'https://c.example': DEAD,
        'https://d.example': UNCHECKED,
      }),
    ).toEqual({ stored: 4, live: 2, dead: 1, unchecked: 1 });
  });

  it('zeroes cleanly with nothing stored', () => {
    expect(summarizeLiveness({})).toEqual({ stored: 0, live: 0, dead: 0, unchecked: 0 });
  });

  // "cannot measure" is not "measured, none" — the same rule leadFunnel holds
  // when a column is missing. A probe we never ran must not read as a dead site.
  it('treats an unknown verdict as unchecked, never as dead', () => {
    const r = summarizeLiveness({ 'https://x.example': 'whatever' });
    expect(r).toEqual({ stored: 1, live: 0, dead: 0, unchecked: 1 });
  });

  it('tolerates a non-object rather than throwing', () => {
    expect(summarizeLiveness(null)).toEqual({ stored: 0, live: 0, dead: 0, unchecked: 0 });
  });

  it('never loses a URL — the three buckets always sum to stored', () => {
    const r = summarizeLiveness({
      a: LIVE,
      b: DEAD,
      c: UNCHECKED,
      d: LIVE,
      e: undefined,
    });
    expect(r.live + r.dead + r.unchecked).toBe(r.stored);
  });
});

describe('probeUrls — verdicts', () => {
  const okFetch = vi.fn(async () => ({ status: 200 }));

  it('counts 2xx as live', async () => {
    const r = await probeUrls(['https://a.example'], { fetchImpl: okFetch, cache: new Map() });
    expect(r['https://a.example']).toBe(LIVE);
  });

  // A preview URL behind a redirect is still up. Treating 3xx as dead would
  // report every site that moved to a custom domain as down.
  it('counts 3xx as live', async () => {
    const r = await probeUrls(['https://a.example'], {
      fetchImpl: async () => ({ status: 308 }),
      cache: new Map(),
    });
    expect(r['https://a.example']).toBe(LIVE);
  });

  it('counts 404 and 5xx as dead', async () => {
    const r = await probeUrls(['https://gone.example', 'https://broken.example'], {
      fetchImpl: async (u: string) => ({ status: u.includes('gone') ? 404 : 503 }),
      cache: new Map(),
    });
    expect(r['https://gone.example']).toBe(DEAD);
    expect(r['https://broken.example']).toBe(DEAD);
  });

  // The case that filed the issue: egress blocked. A thrown fetch means we
  // learned nothing, so the verdict is unchecked.
  it('counts a thrown fetch as UNCHECKED, not dead', async () => {
    const r = await probeUrls(['https://a.example'], {
      fetchImpl: async () => {
        throw new Error('EAI_AGAIN / proxy denied');
      },
      cache: new Map(),
    });
    expect(r['https://a.example']).toBe(UNCHECKED);
  });

  it('skips a malformed URL as unchecked without calling fetch', async () => {
    const spy = vi.fn();
    const r = await probeUrls(['not a url'], { fetchImpl: spy, cache: new Map() });
    expect(r['not a url']).toBe(UNCHECKED);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('probeUrls — caching, so one poll never fans out', () => {
  it('serves a cached verdict without re-fetching', async () => {
    const spy = vi.fn(async () => ({ status: 200 }));
    const cache = new Map();
    const opts = { fetchImpl: spy, cache, ttlMs: 60_000, now: () => 1_000 };

    await probeUrls(['https://a.example'], opts);
    await probeUrls(['https://a.example'], opts);
    await probeUrls(['https://a.example'], opts);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('re-probes once the TTL has passed', async () => {
    const spy = vi.fn(async () => ({ status: 200 }));
    const cache = new Map();
    let t = 1_000;

    await probeUrls(['https://a.example'], { fetchImpl: spy, cache, ttlMs: 1_000, now: () => t });
    t += 1_001;
    await probeUrls(['https://a.example'], { fetchImpl: spy, cache, ttlMs: 1_000, now: () => t });

    expect(spy).toHaveBeenCalledTimes(2);
  });

  // An UNCHECKED result means the probe failed, not that the site is down.
  // Caching it for the full hour would freeze a transient network blip into an
  // hour of "we don't know" — so failures expire fast and get retried.
  it('does not hold a failed probe for the full TTL', async () => {
    let fails = true;
    const spy = vi.fn(async () => {
      if (fails) throw new Error('blocked');
      return { status: 200 };
    });
    const cache = new Map();
    let t = 1_000;
    const opts = () => ({ fetchImpl: spy, cache, ttlMs: 3_600_000, now: () => t });

    expect((await probeUrls(['https://a.example'], opts()))['https://a.example']).toBe(UNCHECKED);
    fails = false;
    t += 60_000; // a minute later, well inside the hour-long success TTL
    expect((await probeUrls(['https://a.example'], opts()))['https://a.example']).toBe(LIVE);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('deduplicates a URL repeated in one call', async () => {
    const spy = vi.fn(async () => ({ status: 200 }));
    await probeUrls(['https://a.example', 'https://a.example'], {
      fetchImpl: spy,
      cache: new Map(),
    });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('returns an empty map for no URLs without calling fetch', async () => {
    const spy = vi.fn();
    expect(await probeUrls([], { fetchImpl: spy, cache: new Map() })).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });
});
