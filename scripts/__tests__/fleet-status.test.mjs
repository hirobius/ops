/**
 * Tests for lib/fleet-status.mjs — the fleet-status aggregator behind
 * GET /api/projects. Pure/offline (node:test) with a mock fetch — no network.
 *   node --test scripts/__tests__/fleet-status.test.mjs
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchFleetStatus, fetchRepoStatus, normalizeStatus } from '../../lib/fleet-status.mjs';

/** Build a mock fetch from a map of url-substring → { status, body }. */
function mockFetch(routes) {
  return async (url) => {
    const hit = Object.entries(routes).find(([frag]) => url.includes(frag));
    if (!hit) return { ok: false, status: 599, text: async () => 'no route' };
    const { status = 200, body = '' } = hit[1];
    return { ok: status >= 200 && status < 300, status, text: async () => body };
  };
}

const VALID = JSON.stringify({
  updatedAt: '2026-07-06T00:00:00Z',
  phase: 'active',
  headline: 'Pipeline live-verified.',
  next: ['do a thing (#1)', 'do another (#2)'],
  blocked: ['waiting on a key (#3)'],
});

test('normalizeStatus coerces a valid object and flags known phase', () => {
  const s = normalizeStatus(JSON.parse(VALID));
  assert.equal(s.phase, 'active');
  assert.equal(s.phaseKnown, true);
  assert.equal(s.headline, 'Pipeline live-verified.');
  assert.deepEqual(s.next, ['do a thing (#1)', 'do another (#2)']);
  assert.deepEqual(s.blocked, ['waiting on a key (#3)']);
});

test('normalizeStatus tolerates missing/garbage fields', () => {
  const s = normalizeStatus({ phase: 'weird-custom', next: 'not-an-array', junk: 1 });
  assert.equal(s.updatedAt, null);
  assert.equal(s.phase, 'weird-custom');
  assert.equal(s.phaseKnown, false); // passed through but flagged unknown
  assert.deepEqual(s.next, []);
  assert.deepEqual(s.blocked, []);
});

test('fetchRepoStatus returns ok:true with parsed status on 200', async () => {
  const row = await fetchRepoStatus(
    { owner: 'hirobius', repo: 'clients', label: 'Clients' },
    { token: 't', fetchImpl: mockFetch({ 'repos/hirobius/clients/contents/status.json': { body: VALID } }) },
  );
  assert.equal(row.ok, true);
  assert.equal(row.repo, 'clients');
  assert.equal(row.status.headline, 'Pipeline live-verified.');
});

test('fetchRepoStatus returns ok:false with a clear message on 404', async () => {
  const row = await fetchRepoStatus(
    { owner: 'hirobius', repo: 'ops' },
    { token: 't', fetchImpl: mockFetch({ 'contents/status.json': { status: 404 } }) },
  );
  assert.equal(row.ok, false);
  assert.match(row.error, /no status\.json/);
  assert.equal(row.label, 'hirobius/ops'); // falls back to owner/repo
});

test('fetchRepoStatus reports invalid JSON without throwing', async () => {
  const row = await fetchRepoStatus(
    { owner: 'hirobius', repo: 'clients' },
    { token: 't', fetchImpl: mockFetch({ 'contents/status.json': { body: '{ not json' } }) },
  );
  assert.equal(row.ok, false);
  assert.match(row.error, /not valid JSON/);
});

test('a ref threads through to the request URL and htmlUrl', async () => {
  let seenUrl = '';
  const fetchImpl = async (url) => {
    seenUrl = url;
    return { ok: true, status: 200, text: async () => VALID };
  };
  const row = await fetchRepoStatus({ owner: 'hirobius', repo: 'clients' }, { token: 't', fetchImpl, ref: 'claude/prospect-to-site' });
  assert.match(seenUrl, /\?ref=claude%2Fprospect-to-site$/);
  assert.match(row.htmlUrl, /\/blob\/claude\/prospect-to-site\/status\.json$/);
});

test('fetchFleetStatus aggregates all repos and never rejects on a mixed batch', async () => {
  const fetchImpl = mockFetch({
    'repos/hirobius/clients/contents/status.json': { body: VALID },
    'repos/hirobius/ops/contents/status.json': { status: 404 },
  });
  const data = await fetchFleetStatus({
    repos: [
      { owner: 'hirobius', repo: 'clients', label: 'Clients' },
      { owner: 'hirobius', repo: 'ops', label: 'Ops' },
    ],
    token: 't',
    fetchImpl,
    now: '2026-07-06T12:00:00Z',
  });
  assert.equal(data.generatedAt, '2026-07-06T12:00:00Z');
  assert.equal(data.projects.length, 2);
  assert.equal(data.projects[0].ok, true);
  assert.equal(data.projects[1].ok, false);
});
