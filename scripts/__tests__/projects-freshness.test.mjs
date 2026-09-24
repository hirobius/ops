import { describe, it, expect } from 'vitest';
import { deriveStatusFreshness, FRESHNESS_RECENT_MS } from '../../lib/projects/freshness.mjs';

/**
 * ops#417 — /ops renders each repo's status.json as fleet truth and cannot tell
 * when it is stale. On 2026-09-24 hds's was six commits and ~3h behind: it
 * described work from 06:40 while commits ran to 09:33, and recorded none of
 * the component site build nor the thing blocking it. The dashboard would have
 * shown that as current.
 *
 * These pin the bands. The comparison is deliberately pure — the I/O that
 * supplies the two timestamps lives in index.mjs and is not what can be wrong
 * here.
 */

const iso = (ms) => new Date(ms).toISOString();
const COMMIT = Date.UTC(2026, 8, 24, 9, 33, 7); // 2026-09-24T09:33:07Z
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('deriveStatusFreshness', () => {
  it('is current when the status was written after the last commit', () => {
    const r = deriveStatusFreshness(iso(COMMIT + HOUR), COMMIT);
    expect(r.state).toBe('current');
    expect(r.behindMs).toBe(0);
  });

  it('is current when they are exactly equal', () => {
    expect(deriveStatusFreshness(iso(COMMIT), COMMIT).state).toBe('current');
  });

  it('is recent one second behind — a status written moments before a push is not a problem', () => {
    const r = deriveStatusFreshness(iso(COMMIT - 1000), COMMIT);
    expect(r.state).toBe('recent');
    expect(r.behindMs).toBe(1000);
  });

  it('is still recent just inside the threshold', () => {
    expect(deriveStatusFreshness(iso(COMMIT - (FRESHNESS_RECENT_MS - 1000)), COMMIT).state).toBe(
      'recent',
    );
  });

  it('is stale exactly at the threshold — the boundary belongs to stale', () => {
    expect(deriveStatusFreshness(iso(COMMIT - FRESHNESS_RECENT_MS), COMMIT).state).toBe('stale');
  });

  it('is stale well past it, and reports how far behind', () => {
    const r = deriveStatusFreshness(iso(COMMIT - 3 * DAY), COMMIT);
    expect(r.state).toBe('stale');
    expect(r.behindMs).toBe(3 * DAY);
    expect(r.behindHours).toBe(72);
  });

  it('reproduces the hds case that prompted this', () => {
    const statusAt = Date.UTC(2026, 8, 24, 6, 40, 0); // what status.json claimed
    const r = deriveStatusFreshness(iso(statusAt), COMMIT);
    expect(r.state).toBe('recent'); // under a day, but visibly behind
    expect(r.behindHours).toBe(3);
  });

  // The whole failure mode is a confident-looking summary that happens to be
  // wrong. Anything we cannot evaluate must say so rather than pass as current.
  it.each([
    ['missing updatedAt', undefined],
    ['null updatedAt', null],
    ['empty string', ''],
    ['unparseable', 'last Tuesday'],
    ['a number, not a date string', 12345],
  ])('is unknown when updatedAt is %s', (_label, value) => {
    const r = deriveStatusFreshness(value, COMMIT);
    expect(r.state).toBe('unknown');
    expect(r.behindMs).toBeNull();
  });

  it('is unknown when there is no commit timestamp to compare against', () => {
    expect(deriveStatusFreshness(iso(COMMIT), null).state).toBe('unknown');
    expect(deriveStatusFreshness(iso(COMMIT), undefined).state).toBe('unknown');
  });

  it('never throws on junk input', () => {
    expect(() => deriveStatusFreshness({}, {})).not.toThrow();
    expect(deriveStatusFreshness({}, {}).state).toBe('unknown');
  });
});
