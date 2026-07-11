/**
 * taskMeta — pure helpers behind the /ops/tasks board (ops#136 declutter).
 * Seams under test (pre-agreed): source→Ralph eligibility, ref parsing,
 * operator ordering (priority → due), grouping, and the chip tone pickers.
 */
import { describe, it, expect } from 'vitest';
import {
  isNoRalphSource,
  taskRef,
  compareTasks,
  groupTasks,
  priorityTone,
  dueTone,
  type GroupBy,
} from './taskMeta';
import type { Task } from './types';

const NOW = new Date('2026-07-11T12:00:00Z').getTime();

function task(overrides: Partial<Task>): Task {
  return {
    id: 'x',
    key: 'tracker:x',
    source: 'tracker',
    native_key: null,
    lane: 'ops',
    group: null,
    phase: null,
    title: 't',
    status: 'open',
    raw_status: null,
    derived: null,
    stage: null,
    priority: null,
    due: null,
    owner: null,
    effort: null,
    tags: null,
    deps: null,
    blocked_by: null,
    notes: null,
    subtasks: null,
    import_flags: null,
    sort_order: null,
    claimed_by: null,
    claimed_at: null,
    completed_at: null,
    dispatch_url: null,
    source_url: null,
    deleted_at: null,
    created_at: '2026-07-01T00:00:00Z',
    updated_at: '2026-07-01T00:00:00Z',
    auto_ok: null,
    tier: null,
    model: null,
    dispatch_status: null,
    dispatch_count: null,
    last_dispatched_at: null,
    ...overrides,
  };
}

describe('isNoRalphSource', () => {
  it('flags personal-repo github sources (Ralph only runs in hirobius repos)', () => {
    expect(isNoRalphSource('github:adr-eng/folio')).toBe(true);
    expect(isNoRalphSource('github:adr-eng/lilac-bonds')).toBe(true);
  });
  it('passes hirobius github sources', () => {
    expect(isNoRalphSource('github:hirobius/ops')).toBe(false);
    expect(isNoRalphSource('github:hirobius/site-engine')).toBe(false);
  });
  it('passes non-github sources (not Ralph-relevant either way)', () => {
    expect(isNoRalphSource('tracker')).toBe(false);
    expect(isNoRalphSource('backlog')).toBe(false);
    expect(isNoRalphSource('client')).toBe(false);
  });
});

describe('taskRef', () => {
  it('parses owner/repo#N from a github key', () => {
    expect(taskRef(task({ key: 'github:hirobius/ops#42' }))).toBe('hirobius/ops#42');
  });
  it('falls back to the dispatch_url issue URL', () => {
    expect(
      taskRef(task({ dispatch_url: 'https://github.com/hirobius/ops/issues/7' })),
    ).toBe('hirobius/ops#7');
  });
  it('is null for non-issue-backed tasks', () => {
    expect(taskRef(task({}))).toBeNull();
  });
});

describe('compareTasks — operator order', () => {
  it('ranks priority high > med > low > none', () => {
    const high = task({ priority: 'high' });
    const med = task({ priority: 'med' });
    const low = task({ priority: 'low' });
    const none = task({});
    expect(compareTasks(high, med)).toBeLessThan(0);
    expect(compareTasks(med, low)).toBeLessThan(0);
    expect(compareTasks(low, none)).toBeLessThan(0);
    expect(compareTasks(none, high)).toBeGreaterThan(0);
  });
  it('within equal priority, earlier due comes first and no-due sorts last', () => {
    const soon = task({ priority: 'high', due: '2026-07-12' });
    const later = task({ priority: 'high', due: '2026-08-01' });
    const noDue = task({ priority: 'high' });
    expect(compareTasks(soon, later)).toBeLessThan(0);
    expect(compareTasks(later, noDue)).toBeLessThan(0);
  });
  it('is 0 for equivalent tasks (stable sort keeps API order)', () => {
    expect(compareTasks(task({}), task({}))).toBe(0);
  });
});

describe('groupTasks', () => {
  const tasks = [
    task({ key: 'a', lane: 'ops', status: 'open', priority: 'low', due: '2026-07-09' }),
    task({ key: 'b', lane: 'hds', status: 'done', priority: 'high' }),
    task({ key: 'c', lane: 'ops', status: 'blocked', due: '2026-07-14' }),
    task({ key: 'd', lane: 'folio', status: 'open', priority: 'med', due: '2026-09-01' }),
  ];

  function keysOf(groups: [string, Task[]][]): Record<string, string[]> {
    return Object.fromEntries(groups.map(([label, ts]) => [label, ts.map((t) => t.key)]));
  }

  it('lane grouping preserves first-seen lane order (existing behavior)', () => {
    const groups = groupTasks(tasks, 'lane', NOW);
    expect(groups.map(([l]) => l)).toEqual(['ops', 'hds', 'folio']);
  });
  it('priority grouping orders high → med → low → no priority, omitting empty groups', () => {
    const groups = groupTasks(tasks, 'priority', NOW);
    expect(keysOf(groups)).toEqual({
      high: ['b'],
      med: ['d'],
      low: ['a'],
      'no priority': ['c'],
    });
  });
  it('due grouping buckets overdue / this week / later / no due against now', () => {
    const groups = groupTasks(tasks, 'due', NOW);
    expect(keysOf(groups)).toEqual({
      overdue: ['a'],
      'this week': ['c'],
      later: ['d'],
      'no due': ['b'],
    });
  });
  it('status grouping orders open → blocked → done', () => {
    const groups = groupTasks(tasks, 'status', NOW);
    expect(groups.map(([l]) => l)).toEqual(['open', 'blocked', 'done']);
  });
  it('sorts within each group by operator order (priority then due)', () => {
    const groups = groupTasks(tasks, 'lane', NOW);
    const ops = keysOf(groups)['ops'];
    // 'a' (low) outranks 'c' (no priority) within the ops lane.
    expect(ops).toEqual(['a', 'c']);
  });
  it('accepts every GroupBy without throwing', () => {
    for (const g of ['lane', 'priority', 'due', 'status'] as GroupBy[]) {
      expect(() => groupTasks(tasks, g, NOW)).not.toThrow();
    }
  });
});

describe('chip tones', () => {
  it('priorityTone: high=danger, med=warning, low=neutral', () => {
    expect(priorityTone('high')).toBe('danger');
    expect(priorityTone('med')).toBe('warning');
    expect(priorityTone('low')).toBe('neutral');
  });
  it('dueTone: overdue=danger, within 7 days=warning, later=neutral, none=null', () => {
    expect(dueTone('2026-07-09', NOW)).toBe('danger');
    expect(dueTone('2026-07-14', NOW)).toBe('warning');
    expect(dueTone('2026-09-01', NOW)).toBe('neutral');
    expect(dueTone(null, NOW)).toBeNull();
  });
});
