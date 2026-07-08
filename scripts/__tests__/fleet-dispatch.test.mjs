/**
 * Unit tests for scripts/fleet-dispatch.mjs's pure pieces (#41 Slice 2).
 *
 * `selectAndRoute` is pure — no Supabase, no GitHub, no Date — so these
 * tests exercise the eligibility filter + routeTask wiring + --max cap with
 * plain stub task objects. Live dispatch (Supabase writes, @claude issue
 * creation) can't be exercised in this sandbox (network egress blocked +
 * needs GITHUB_TOKEN) — see the session report for the --dry-run-against-
 * real-Supabase verification instead.
 */

import { describe, it, expect } from 'vitest';
import {
  selectAndRoute,
  selectToQueue,
  isMissingColumnError,
  DEFAULT_MAX,
  DEFAULT_QUEUE_MAX,
} from '../fleet-dispatch.mjs';

function task(overrides = {}) {
  return {
    key: 'github:hirobius/ops#1',
    title: 'Fix a typo in the footer',
    status: 'open',
    auto_ok: true,
    dispatch_url: null,
    dispatch_status: null,
    dispatch_count: 0,
    priority: null,
    effort: null,
    ...overrides,
  };
}

describe('selectAndRoute', () => {
  it('returns an empty array for an empty task list', () => {
    expect(selectAndRoute([])).toEqual([]);
  });

  it('returns an empty array when given a non-array', () => {
    expect(selectAndRoute(undefined)).toEqual([]);
    expect(selectAndRoute(null)).toEqual([]);
  });

  it('filters out tasks with auto_ok !== true', () => {
    const tasks = [task({ key: 'a', auto_ok: false }), task({ key: 'b', auto_ok: true })];
    const out = selectAndRoute(tasks);
    expect(out.map((s) => s.task.key)).toEqual(['b']);
  });

  it('filters out tasks that already have a dispatch_url (no re-dispatch)', () => {
    const tasks = [
      task({ key: 'a', dispatch_url: 'https://github.com/hirobius/ops/issues/1' }),
      task({ key: 'b', dispatch_url: null }),
    ];
    const out = selectAndRoute(tasks);
    expect(out.map((s) => s.task.key)).toEqual(['b']);
  });

  it('filters out tasks whose status is not open', () => {
    const tasks = [
      task({ key: 'a', status: 'done' }),
      task({ key: 'b', status: 'blocked' }),
      task({ key: 'c', status: 'open' }),
    ];
    const out = selectAndRoute(tasks);
    expect(out.map((s) => s.task.key)).toEqual(['c']);
  });

  it('applies routeTask to every eligible task', () => {
    const tasks = [
      task({ key: 'mech', title: 'Fix a typo', effort: 'S', priority: 'low' }),
      task({ key: 'judg', title: 'Rework the auth architecture', priority: 'high' }),
    ];
    const out = selectAndRoute(tasks);
    expect(out).toEqual([
      { task: tasks[0], tier: 'mechanical', model: 'sonnet' },
      { task: tasks[1], tier: 'judgment', model: 'opus' },
    ]);
  });

  it('defaults the cap to DEFAULT_MAX when no max is given', () => {
    const tasks = Array.from({ length: DEFAULT_MAX + 5 }, (_, i) => task({ key: `t${i}` }));
    const out = selectAndRoute(tasks);
    expect(out).toHaveLength(DEFAULT_MAX);
  });

  it('respects an explicit --max cap smaller than the eligible count', () => {
    const tasks = [task({ key: 'a' }), task({ key: 'b' }), task({ key: 'c' })];
    const out = selectAndRoute(tasks, { max: 2 });
    expect(out.map((s) => s.task.key)).toEqual(['a', 'b']);
  });

  it('returns fewer than max when eligible count is smaller than the cap', () => {
    const tasks = [task({ key: 'a' })];
    const out = selectAndRoute(tasks, { max: 5 });
    expect(out).toHaveLength(1);
  });

  it('max: 0 selects nothing', () => {
    const tasks = [task({ key: 'a' }), task({ key: 'b' })];
    expect(selectAndRoute(tasks, { max: 0 })).toEqual([]);
  });

  it('falls back to DEFAULT_MAX for a non-finite max (e.g. NaN from a bad --max flag)', () => {
    const tasks = Array.from({ length: DEFAULT_MAX + 2 }, (_, i) => task({ key: `t${i}` }));
    const out = selectAndRoute(tasks, { max: NaN });
    expect(out).toHaveLength(DEFAULT_MAX);
  });

  it('preserves eligible-list order (first eligible in, first selected)', () => {
    const tasks = [
      task({ key: 'skip', auto_ok: false }),
      task({ key: 'first' }),
      task({ key: 'second' }),
    ];
    const out = selectAndRoute(tasks, { max: 1 });
    expect(out.map((s) => s.task.key)).toEqual(['first']);
  });
});

describe('isMissingColumnError', () => {
  it('is false for a null/undefined error', () => {
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
  });

  it('is true for PostgREST code 42703 (undefined_column)', () => {
    expect(
      isMissingColumnError({ code: '42703', message: 'column tasks.auto_ok does not exist' }),
    ).toBe(true);
  });

  it('is true when the message matches "column ... does not exist" without the code', () => {
    expect(
      isMissingColumnError({ message: 'column "auto_ok" of relation "tasks" does not exist' }),
    ).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isMissingColumnError({ code: '23505', message: 'duplicate key value' })).toBe(false);
  });
});

describe('selectToQueue', () => {
  function nonAuto(overrides = {}) {
    return task({ auto_ok: false, ...overrides });
  }

  it('returns an empty array for an empty task list', () => {
    expect(selectToQueue([], new Set())).toEqual([]);
  });

  it('returns an empty array when given a non-array', () => {
    expect(selectToQueue(undefined, new Set())).toEqual([]);
    expect(selectToQueue(null, new Set())).toEqual([]);
  });

  it('filters out tasks with auto_ok === true (those self-dispatch instead)', () => {
    const tasks = [nonAuto({ key: 'a', auto_ok: true }), nonAuto({ key: 'b', auto_ok: false })];
    const out = selectToQueue(tasks, new Set());
    expect(out.map((t) => t.key)).toEqual(['b']);
  });

  it('filters out tasks that already have a dispatch_url', () => {
    const tasks = [
      nonAuto({ key: 'a', dispatch_url: 'https://github.com/hirobius/ops/issues/1' }),
      nonAuto({ key: 'b', dispatch_url: null }),
    ];
    const out = selectToQueue(tasks, new Set());
    expect(out.map((t) => t.key)).toEqual(['b']);
  });

  it('filters out tasks whose status is not open', () => {
    const tasks = [
      nonAuto({ key: 'a', status: 'done' }),
      nonAuto({ key: 'b', status: 'blocked' }),
      nonAuto({ key: 'c', status: 'open' }),
    ];
    const out = selectToQueue(tasks, new Set());
    expect(out.map((t) => t.key)).toEqual(['c']);
  });

  it('filters out tasks that already have a dispatch_status (queued/dispatched/failed/…)', () => {
    const tasks = [
      nonAuto({ key: 'a', dispatch_status: 'queued' }),
      nonAuto({ key: 'b', dispatch_status: 'failed' }),
      nonAuto({ key: 'c', dispatch_status: null }),
    ];
    const out = selectToQueue(tasks, new Set());
    expect(out.map((t) => t.key)).toEqual(['c']);
  });

  it('filters out tasks already seen (previously proposed/denied) — no re-queue spam', () => {
    const tasks = [nonAuto({ key: 'a' }), nonAuto({ key: 'b' })];
    const out = selectToQueue(tasks, new Set(['a']));
    expect(out.map((t) => t.key)).toEqual(['b']);
  });

  it('accepts a plain iterable (array) in place of a Set for seenTaskKeys', () => {
    const tasks = [nonAuto({ key: 'a' }), nonAuto({ key: 'b' })];
    const out = selectToQueue(tasks, ['a']);
    expect(out.map((t) => t.key)).toEqual(['b']);
  });

  it('treats an omitted seenTaskKeys as "nothing seen yet"', () => {
    const tasks = [nonAuto({ key: 'a' })];
    expect(selectToQueue(tasks, undefined).map((t) => t.key)).toEqual(['a']);
  });

  it('defaults the cap to DEFAULT_QUEUE_MAX when no max is given', () => {
    const tasks = Array.from({ length: DEFAULT_QUEUE_MAX + 5 }, (_, i) =>
      nonAuto({ key: `t${i}` }),
    );
    const out = selectToQueue(tasks, new Set());
    expect(out).toHaveLength(DEFAULT_QUEUE_MAX);
  });

  it('respects an explicit --queue-max cap smaller than the eligible count', () => {
    const tasks = [nonAuto({ key: 'a' }), nonAuto({ key: 'b' }), nonAuto({ key: 'c' })];
    const out = selectToQueue(tasks, new Set(), { max: 2 });
    expect(out.map((t) => t.key)).toEqual(['a', 'b']);
  });

  it('max: 0 selects nothing', () => {
    const tasks = [nonAuto({ key: 'a' }), nonAuto({ key: 'b' })];
    expect(selectToQueue(tasks, new Set(), { max: 0 })).toEqual([]);
  });

  it('falls back to DEFAULT_QUEUE_MAX for a non-finite max', () => {
    const tasks = Array.from({ length: DEFAULT_QUEUE_MAX + 2 }, (_, i) =>
      nonAuto({ key: `t${i}` }),
    );
    const out = selectToQueue(tasks, new Set(), { max: NaN });
    expect(out).toHaveLength(DEFAULT_QUEUE_MAX);
  });

  it('never selects a task that would also be eligible for auto-dispatch', () => {
    // A task that IS auto_ok should self-dispatch (selectAndRoute), never
    // land in the approvals queue too — the two passes are mutually exclusive.
    const tasks = [nonAuto({ key: 'a', auto_ok: true })];
    expect(selectToQueue(tasks, new Set())).toEqual([]);
    expect(selectAndRoute(tasks).map((s) => s.task.key)).toEqual(['a']);
  });
});
