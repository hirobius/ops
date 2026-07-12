/**
 * Unit tests for scripts/fleet-watchdog.mjs (#41 Slice 5, ops#139).
 *
 * `findStale` is pure — no Supabase, no GitHub, no Date-inside (the caller
 * supplies `now`) — so these tests exercise the staleness rule + the
 * re-dispatch/flag decision with plain stub task objects.
 *
 * `reDispatch`/`flag` route their actual mutation through
 * `lib/tasks/actions.mjs::applyTaskAction` (ops#139) rather than writing
 * Supabase fields directly, so they're exercised here with `applyTaskAction`
 * mocked — no live Supabase/GitHub/network needed for that part either.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applyTaskAction } from '../../lib/tasks/actions.mjs';
import { notifyEvent } from '../../lib/ops/notify.mjs';
import { appendRun } from '../../lib/ops/run-log.mjs';
import {
  findStale,
  isMissingColumnError,
  reDispatch,
  flag,
  DEFAULT_STALE_HOURS,
  DEFAULT_MAX_RETRIES,
} from '../fleet-watchdog.mjs';

vi.mock('../../lib/tasks/actions.mjs', () => ({ applyTaskAction: vi.fn() }));
vi.mock('../../lib/ops/notify.mjs', () => ({ notifyEvent: vi.fn(async () => ({})) }));
vi.mock('../../lib/ops/run-log.mjs', () => ({ appendRun: vi.fn() }));

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

/**
 * `reDispatch`/`flag` used to write `dispatch_count`/`last_dispatched_at`/
 * `dispatch_status`/`status` directly via `setTaskFields` — a second,
 * divergent dispatch code path from `lib/tasks/actions.mjs` (ops#139). They
 * now route every mutation through `applyTaskAction`; these tests spy on it
 * to pin that seam and assert the notify/run-log side effects still fire.
 */
describe('reDispatch — mutates via applyTaskAction, not a direct write (ops#139)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const staleTask = {
    key: 'github:hirobius/ops#1',
    title: 'Fix a typo',
    dispatch_url: 'https://github.com/hirobius/ops/issues/1',
  };

  it('calls applyTaskAction with the redispatch action + comment/maxRetries, then notifies + logs', async () => {
    applyTaskAction.mockResolvedValue({ status: 200, body: { ok: true, dispatch_count: 3 } });
    const sb = {};
    const github = {};
    const ok = await reDispatch(sb, github, { task: staleTask, comment: true, maxRetries: 2 });
    expect(ok).toBe(true);
    expect(applyTaskAction).toHaveBeenCalledWith(
      sb,
      { key: staleTask.key, action: 'redispatch', comment: true, maxRetries: 2 },
      { github },
    );
    expect(notifyEvent).toHaveBeenCalledTimes(1);
    expect(notifyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'dispatched', task: staleTask.key, detail: 'retry 3/2' }),
    );
    expect(appendRun).toHaveBeenCalledTimes(1);
    expect(appendRun).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'fleet-watchdog', task: staleTask.key, outcome: 're-dispatched' }),
    );
  });

  it('returns false and skips notify/log when applyTaskAction fails', async () => {
    applyTaskAction.mockResolvedValue({ status: 500, body: { error: 'write failed' } });
    const ok = await reDispatch({}, {}, { task: staleTask, comment: false, maxRetries: 2 });
    expect(ok).toBe(false);
    expect(notifyEvent).not.toHaveBeenCalled();
    expect(appendRun).not.toHaveBeenCalled();
  });
});

describe('flag — mutates via applyTaskAction, not a direct write (ops#139)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const exhaustedTask = { key: 'github:hirobius/ops#2', title: 'Rework the auth architecture' };

  it('calls applyTaskAction with the flag action, then notifies + logs', async () => {
    applyTaskAction.mockResolvedValue({ status: 200, body: { ok: true } });
    const sb = {};
    const ok = await flag(sb, { task: exhaustedTask, maxRetries: 2 });
    expect(ok).toBe(true);
    expect(applyTaskAction).toHaveBeenCalledWith(sb, { key: exhaustedTask.key, action: 'flag' }, {});
    expect(notifyEvent).toHaveBeenCalledTimes(1);
    expect(notifyEvent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'blocked', task: exhaustedTask.key }),
    );
    expect(appendRun).toHaveBeenCalledTimes(1);
    expect(appendRun).toHaveBeenCalledWith(
      expect.objectContaining({ actor: 'fleet-watchdog', task: exhaustedTask.key, outcome: 'flagged' }),
    );
  });

  it('returns false and skips notify/log when applyTaskAction fails', async () => {
    applyTaskAction.mockResolvedValue({ status: 500, body: { error: 'write failed' } });
    const ok = await flag({}, { task: exhaustedTask, maxRetries: 2 });
    expect(ok).toBe(false);
    expect(notifyEvent).not.toHaveBeenCalled();
    expect(appendRun).not.toHaveBeenCalled();
  });
});
