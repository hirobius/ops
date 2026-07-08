/**
 * lib/tasks/lease.mjs — claim/lease primitive (issue #47, B.2).
 *
 * `isLeased`/`filterUnleased` are pure — no Date-inside, `now` is
 * caller-supplied — so these tests exercise the expiry rule with plain stub
 * task objects. `claimLease`/`releaseLease` are one live-Supabase write each;
 * exercised here with a stub client (no real network) mirroring the shape
 * other lib/*.mjs tests use for Supabase-backed functions.
 */

import { describe, it, expect, vi } from 'vitest';
import { isLeased, filterUnleased, claimLease, releaseLease, DEFAULT_LEASE_MINUTES } from '../../lib/tasks/lease.mjs';

const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

describe('isLeased', () => {
  it('throws when `now` is not a finite number', () => {
    expect(() => isLeased({}, undefined)).toThrow(/numeric `now`/);
    expect(() => isLeased({}, NaN)).toThrow(/numeric `now`/);
  });

  it('is false when there is no lease_expires_at', () => {
    expect(isLeased({}, NOW)).toBe(false);
    expect(isLeased({ lease_expires_at: null }, NOW)).toBe(false);
  });

  it('is true when lease_expires_at is in the future', () => {
    expect(isLeased({ lease_expires_at: new Date(NOW + 60_000).toISOString() }, NOW)).toBe(true);
  });

  it('is false when lease_expires_at is in the past (expired, reclaimable)', () => {
    expect(isLeased({ lease_expires_at: new Date(NOW - 60_000).toISOString() }, NOW)).toBe(false);
  });

  it('is false for an unparseable lease_expires_at', () => {
    expect(isLeased({ lease_expires_at: 'not-a-date' }, NOW)).toBe(false);
  });
});

describe('filterUnleased', () => {
  it('drops currently-leased tasks and keeps the rest', () => {
    const tasks = [
      { key: 'a', lease_expires_at: new Date(NOW + 60_000).toISOString() },
      { key: 'b', lease_expires_at: new Date(NOW - 60_000).toISOString() },
      { key: 'c' },
    ];
    expect(filterUnleased(tasks, NOW).map((t) => t.key)).toEqual(['b', 'c']);
  });

  it('returns an empty array for a non-array', () => {
    expect(filterUnleased(undefined, NOW)).toEqual([]);
  });
});

function stubSupabase({ rows }) {
  const state = { lastFilters: {} };
  const builder = {
    update: vi.fn(() => builder),
    eq: vi.fn((col, val) => {
      state.lastFilters[col] = val;
      return builder;
    }),
    or: vi.fn((expr) => {
      state.lastFilters.or = expr;
      return builder;
    }),
    select: vi.fn(() => Promise.resolve({ data: rows, error: null })),
  };
  return { from: vi.fn(() => builder), _state: state };
}

describe('claimLease', () => {
  it('throws when `now` is not a finite number', async () => {
    const sb = stubSupabase({ rows: [] });
    await expect(claimLease(sb, 'k', { owner: 'x' })).rejects.toThrow(/numeric `now`/);
  });

  it('reports claimed:true when the conditional update affects a row', async () => {
    const sb = stubSupabase({ rows: [{ key: 'github:hirobius/ops#1' }] });
    const result = await claimLease(sb, 'github:hirobius/ops#1', { owner: 'fleet-dispatch', now: NOW });
    expect(result).toEqual({ claimed: true, error: null });
    expect(sb.from).toHaveBeenCalledWith('tasks');
  });

  it('reports claimed:false when the conditional update affects no rows (lost race)', async () => {
    const sb = stubSupabase({ rows: [] });
    const result = await claimLease(sb, 'github:hirobius/ops#1', { owner: 'fleet-dispatch', now: NOW });
    expect(result).toEqual({ claimed: false, error: null });
  });

  it('defaults ttlMinutes to DEFAULT_LEASE_MINUTES', async () => {
    const sb = stubSupabase({ rows: [{ key: 'k' }] });
    await claimLease(sb, 'k', { owner: 'x', now: NOW });
    const expected = new Date(NOW + DEFAULT_LEASE_MINUTES * 60_000).toISOString();
    const updateArg = sb.from.mock.results[0].value.update.mock.calls[0][0];
    expect(updateArg.lease_expires_at).toBe(expected);
    expect(updateArg.lease_owner).toBe('x');
  });

  it('propagates a Supabase error as claimed:false', async () => {
    const sb = {
      from: () => ({
        update: () => ({
          eq: () => ({
            or: () => ({
              select: () => Promise.resolve({ data: null, error: { message: 'boom' } }),
            }),
          }),
        }),
      }),
    };
    const result = await claimLease(sb, 'k', { owner: 'x', now: NOW });
    expect(result.claimed).toBe(false);
    expect(result.error).toEqual({ message: 'boom' });
  });
});

describe('releaseLease', () => {
  it('unconditionally clears lease_owner/lease_expires_at', () => {
    const sb = stubSupabase({ rows: [] });
    releaseLease(sb, 'k');
    const updateArg = sb.from.mock.results[0].value.update.mock.calls[0][0];
    expect(updateArg).toEqual({ lease_owner: null, lease_expires_at: null });
  });
});
