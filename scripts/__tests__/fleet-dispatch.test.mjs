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
import { selectAndRoute, applySafetyGates, isMissingColumnError, DEFAULT_MAX } from '../fleet-dispatch.mjs';

function task(overrides = {}) {
  return {
    key: 'github:hirobius/ops#1',
    title: 'Fix a typo in the footer',
    status: 'open',
    auto_ok: true,
    dispatch_url: null,
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

describe('applySafetyGates (issue #47 safety layer)', () => {
  const NOW = new Date('2026-07-08T12:00:00.000Z').getTime();

  function selected(overrides = {}) {
    return { task: task({ ...overrides }), tier: 'standard', model: 'sonnet' };
  }

  it('passes everything through when nothing is leased, overlapping, or over budget', () => {
    const gates = applySafetyGates([selected({ key: 'a' }), selected({ key: 'b' })], {
      now: NOW,
      inFlightTasks: [],
    });
    expect(gates.dispatchable.map((c) => c.task.key)).toEqual(['a', 'b']);
    expect(gates.blockedByLease).toEqual([]);
    expect(gates.blockedByOverlap).toEqual([]);
    expect(gates.blockedByBudget).toEqual([]);
  });

  it('blocks a candidate whose task currently holds an unexpired lease', () => {
    const leased = selected({
      key: 'leased',
      lease_expires_at: new Date(NOW + 60_000).toISOString(),
    });
    const gates = applySafetyGates([leased, selected({ key: 'free' })], {
      now: NOW,
      inFlightTasks: [],
    });
    expect(gates.blockedByLease.map((c) => c.task.key)).toEqual(['leased']);
    expect(gates.dispatchable.map((c) => c.task.key)).toEqual(['free']);
  });

  it('blocks a candidate whose declared touches overlap an in-flight task', () => {
    const candidate = selected({ key: 'a', touches: ['lib/tasks/tier.mjs'] });
    const gates = applySafetyGates([candidate], {
      now: NOW,
      inFlightTasks: [{ key: 'github:hirobius/ops#9', touches: ['lib/tasks/'] }],
    });
    expect(gates.dispatchable).toEqual([]);
    expect(gates.blockedByOverlap).toHaveLength(1);
    expect(gates.blockedByOverlap[0].conflictsWith).toBe('github:hirobius/ops#9');
  });

  it('blocks a candidate once the spend ceiling is exceeded', () => {
    const candidate = { task: task({ key: 'a' }), tier: 'judgment', model: 'opus' };
    const gates = applySafetyGates([candidate], {
      now: NOW,
      inFlightTasks: [],
      perRunCeilingUsd: 0.1,
    });
    expect(gates.dispatchable).toEqual([]);
    expect(gates.blockedByBudget.map((c) => c.task.key)).toEqual(['a']);
  });

  it('runs lease -> overlap -> budget in order, each narrowing what the next sees', () => {
    const leased = selected({ key: 'leased', lease_expires_at: new Date(NOW + 60_000).toISOString() });
    const overlapping = selected({ key: 'overlapping', touches: ['lib/x.mjs'] });
    const affordable = selected({ key: 'ok' });
    const gates = applySafetyGates([leased, overlapping, affordable], {
      now: NOW,
      inFlightTasks: [{ key: 'in-flight', touches: ['lib/x.mjs'] }],
    });
    expect(gates.blockedByLease.map((c) => c.task.key)).toEqual(['leased']);
    expect(gates.blockedByOverlap.map((c) => c.task.key)).toEqual(['overlapping']);
    expect(gates.dispatchable.map((c) => c.task.key)).toEqual(['ok']);
  });
});
