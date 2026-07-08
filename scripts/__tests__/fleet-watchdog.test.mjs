/**
 * Unit tests for scripts/fleet-watchdog.mjs's pure pieces (#41 Slice 5).
 *
 * `findStale` is pure — no Supabase, no GitHub, no Date-inside (the caller
 * supplies `now`) — so these tests exercise the staleness rule + the
 * re-dispatch/flag decision with plain stub task objects. Live re-dispatch
 * (Supabase writes, @claude issue comments) can't be exercised in this
 * sandbox (network egress blocked + needs GITHUB_TOKEN) — see the session
 * report for the --dry-run verification instead.
 */

import { describe, it, expect } from 'vitest';
import {
  findStale,
  isMissingColumnError,
  DEFAULT_STALE_HOURS,
  DEFAULT_MAX_RETRIES,
} from '../fleet-watchdog.mjs';

const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();
const HOUR = 3_600_000;

function isoHoursAgo(hours) {
  return new Date(NOW - hours * HOUR).toISOString();
}

function task(overrides = {}) {
  return {
    key: 'github:hirobius/ops#1',
    title: 'Fix a typo in the footer',
    status: 'open',
    dispatch_status: 'dispatched',
    dispatch_count: 0,
    dispatch_url: 'https://github.com/hirobius/ops/issues/1',
    claimed_by: 'claude',
    last_dispatched_at: isoHoursAgo(48),
    ...overrides,
  };
}

describe('findStale', () => {
  it('requires a numeric `now` — throws rather than reading the clock itself', () => {
    expect(() => findStale([task()], {})).toThrow(/requires a numeric `now`/);
    expect(() => findStale([task()], { now: NaN })).toThrow(/requires a numeric `now`/);
  });

  it('returns an empty array for an empty task list', () => {
    expect(findStale([], { now: NOW })).toEqual([]);
  });

  it('returns an empty array when given a non-array', () => {
    expect(findStale(undefined, { now: NOW })).toEqual([]);
    expect(findStale(null, { now: NOW })).toEqual([]);
  });

  it('detects a stale dispatched task past the default threshold', () => {
    const t = task({ last_dispatched_at: isoHoursAgo(DEFAULT_STALE_HOURS + 1) });
    const out = findStale([t], { now: NOW });
    expect(out).toEqual([{ task: t, action: 're-dispatch' }]);
  });

  it('excludes a task dispatched within the staleness window (fresh)', () => {
    const t = task({ last_dispatched_at: isoHoursAgo(1) });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('respects a custom --stale-hours threshold', () => {
    const t = task({ last_dispatched_at: isoHoursAgo(5) });
    expect(findStale([t], { now: NOW, staleHours: 10 })).toEqual([]);
    expect(findStale([t], { now: NOW, staleHours: 4 })).toEqual([
      { task: t, action: 're-dispatch' },
    ]);
  });

  it('excludes tasks whose status is already done', () => {
    const t = task({ status: 'done', last_dispatched_at: isoHoursAgo(100) });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('excludes tasks whose status is already blocked', () => {
    const t = task({ status: 'blocked', last_dispatched_at: isoHoursAgo(100) });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('excludes tasks that are not dispatched (no dispatch_status, no claimed_by+dispatch_url)', () => {
    const t = task({ dispatch_status: null, claimed_by: null, dispatch_url: null });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('treats claimed_by=claude + dispatch_url set as dispatched even without dispatch_status', () => {
    const t = task({
      dispatch_status: null,
      claimed_by: 'claude',
      dispatch_url: 'https://github.com/hirobius/ops/issues/2',
    });
    const out = findStale([t], { now: NOW });
    expect(out).toEqual([{ task: t, action: 're-dispatch' }]);
  });

  it('excludes claimed_by=claude with no dispatch_url', () => {
    const t = task({ dispatch_status: null, claimed_by: 'claude', dispatch_url: null });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('excludes a dispatched task with no last_dispatched_at (cannot judge age)', () => {
    const t = task({ last_dispatched_at: null });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('excludes a dispatched task with an unparseable last_dispatched_at', () => {
    const t = task({ last_dispatched_at: 'not-a-date' });
    expect(findStale([t], { now: NOW })).toEqual([]);
  });

  it('decides re-dispatch when dispatch_count < maxRetries', () => {
    const t = task({ dispatch_count: 0 });
    expect(findStale([t], { now: NOW, maxRetries: DEFAULT_MAX_RETRIES })).toEqual([
      { task: t, action: 're-dispatch' },
    ]);
  });

  it('decides flag when dispatch_count >= maxRetries', () => {
    const t = task({ dispatch_count: DEFAULT_MAX_RETRIES });
    expect(findStale([t], { now: NOW, maxRetries: DEFAULT_MAX_RETRIES })).toEqual([
      { task: t, action: 'flag' },
    ]);
  });

  it('treats a missing dispatch_count as 0 for the retry comparison', () => {
    const t = task({ dispatch_count: undefined });
    expect(findStale([t], { now: NOW, maxRetries: 1 })).toEqual([
      { task: t, action: 're-dispatch' },
    ]);
  });

  it('respects a custom --max-retries threshold', () => {
    const t = task({ dispatch_count: 3 });
    expect(findStale([t], { now: NOW, maxRetries: 5 })).toEqual([
      { task: t, action: 're-dispatch' },
    ]);
    expect(findStale([t], { now: NOW, maxRetries: 2 })).toEqual([{ task: t, action: 'flag' }]);
  });

  it('handles a mixed batch: fresh, stale-retryable, stale-exhausted, done, blocked, undispatched', () => {
    const fresh = task({ key: 'fresh', last_dispatched_at: isoHoursAgo(1) });
    const retryable = task({ key: 'retryable', dispatch_count: 0 });
    const exhausted = task({ key: 'exhausted', dispatch_count: DEFAULT_MAX_RETRIES });
    const done = task({ key: 'done', status: 'done', last_dispatched_at: isoHoursAgo(100) });
    const blocked = task({
      key: 'blocked',
      status: 'blocked',
      last_dispatched_at: isoHoursAgo(100),
    });
    const undispatched = task({
      key: 'undispatched',
      dispatch_status: null,
      claimed_by: null,
      dispatch_url: null,
    });

    const out = findStale([fresh, retryable, exhausted, done, blocked, undispatched], { now: NOW });
    expect(out).toEqual([
      { task: retryable, action: 're-dispatch' },
      { task: exhausted, action: 'flag' },
    ]);
  });

  it('falls back to DEFAULT_STALE_HOURS/DEFAULT_MAX_RETRIES for non-finite overrides', () => {
    const t = task({ last_dispatched_at: isoHoursAgo(DEFAULT_STALE_HOURS + 1), dispatch_count: 0 });
    const out = findStale([t], { now: NOW, staleHours: NaN, maxRetries: NaN });
    expect(out).toEqual([{ task: t, action: 're-dispatch' }]);
  });
});

describe('isMissingColumnError', () => {
  it('is false for a null/undefined error', () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
  });

  it('is true for PostgREST code 42703 (undefined_column)', () => {
    expect(
      isMissingColumnError({
        code: '42703',
        message: 'column tasks.dispatch_status does not exist',
      }),
    ).toBe(true);
  });

  it('is true when the message matches "column ... does not exist" without the code', () => {
    expect(
      isMissingColumnError({
        message: 'column "dispatch_status" of relation "tasks" does not exist',
      }),
    ).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value' })).toBe(false);
  });
});
