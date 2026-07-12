/**
 * taskMeta — pure helpers behind the /ops/tasks board (ops#136 declutter).
 * Seams under test (pre-agreed): source→Ralph eligibility, ref parsing,
 * operator ordering (priority → due), grouping, and the chip tone pickers.
 */
import { describe, it, expect } from 'vitest';
import {
  isNoRalphSource,
  taskRef,
  issueLinkFor,
  compareTasks,
  groupTasks,
  priorityTone,
  dueTone,
  matchesCategory,
  TASK_CATEGORIES,
  labelPriority,
  priorityChip,
  cardLabelTags,
  recentlyCompletedTasks,
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
    pr_url: null,
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
    expect(taskRef(task({ dispatch_url: 'https://github.com/hirobius/ops/issues/7' }))).toBe(
      'hirobius/ops#7',
    );
  });
  it('is null for non-issue-backed tasks', () => {
    expect(taskRef(task({}))).toBeNull();
  });
});

describe('issueLinkFor', () => {
  it('dispatch_url wins when both are set', () => {
    expect(
      issueLinkFor(
        task({
          dispatch_url: 'https://github.com/hirobius/ops/issues/7',
          source_url: 'https://github.com/hirobius/ops/issues/1',
        }),
      ),
    ).toBe('https://github.com/hirobius/ops/issues/7');
  });
  it('falls back to source_url when dispatch_url is unset', () => {
    expect(issueLinkFor(task({ source_url: 'https://github.com/hirobius/ops/issues/1' }))).toBe(
      'https://github.com/hirobius/ops/issues/1',
    );
  });
  it('is null when neither is set', () => {
    expect(issueLinkFor(task({}))).toBeNull();
  });
});

describe('labelPriority — p0–p3 from GitHub labels', () => {
  it('reads the p0–p3 label out of tags', () => {
    expect(labelPriority(task({ tags: ['enhancement', 'p1', 'ralph-ready'] }))).toBe('p1');
    expect(labelPriority(task({ tags: ['p0'] }))).toBe('p0');
  });
  it('is null when no p-label (or no tags) is present', () => {
    expect(labelPriority(task({ tags: ['bug', 'backlog'] }))).toBeNull();
    expect(labelPriority(task({ tags: null }))).toBeNull();
  });
  it('returns the most urgent when several are present', () => {
    expect(labelPriority(task({ tags: ['p3', 'p1'] }))).toBe('p1');
  });
});

describe('compareTasks — operator order', () => {
  it('ranks priority high > med > low > none (legacy DB column)', () => {
    const high = task({ priority: 'high' });
    const med = task({ priority: 'med' });
    const low = task({ priority: 'low' });
    const none = task({});
    expect(compareTasks(high, med)).toBeLessThan(0);
    expect(compareTasks(med, low)).toBeLessThan(0);
    expect(compareTasks(low, none)).toBeLessThan(0);
    expect(compareTasks(none, high)).toBeGreaterThan(0);
  });
  it('ranks p0 > p1 > p2 > p3 > none from labels', () => {
    const p0 = task({ tags: ['p0'] });
    const p1 = task({ tags: ['p1'] });
    const p2 = task({ tags: ['p2'] });
    const p3 = task({ tags: ['p3'] });
    const none = task({ tags: ['backlog'] });
    expect(compareTasks(p0, p1)).toBeLessThan(0);
    expect(compareTasks(p1, p2)).toBeLessThan(0);
    expect(compareTasks(p2, p3)).toBeLessThan(0);
    expect(compareTasks(p3, none)).toBeLessThan(0);
  });
  it('a p-label outranks a row with neither label nor DB priority', () => {
    expect(compareTasks(task({ tags: ['p3'] }), task({}))).toBeLessThan(0);
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
  it('priority grouping buckets by the p0–p3 label, ordered p0 → p3 → no priority', () => {
    const labelled = [
      task({ key: 'x', tags: ['p2'] }),
      task({ key: 'y', tags: ['p0'] }),
      task({ key: 'z', tags: ['backlog'] }), // no p-label
      task({ key: 'w', tags: ['p0', 'ralph-ready'] }),
    ];
    const groups = groupTasks(labelled, 'priority', NOW);
    expect(groups.map(([l]) => l)).toEqual(['p0', 'p2', 'no priority']);
    expect(keysOf(groups)).toEqual({ p0: ['y', 'w'], p2: ['x'], 'no priority': ['z'] });
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
  it('due grouping puts a task due TODAY in "this week", not "overdue"', () => {
    const today = task({ key: 'today', due: '2026-07-11' });
    const groups = groupTasks([today], 'due', NOW);
    expect(groups).toEqual([['this week', [today]]]);
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

describe('matchesCategory — routing/readiness filter', () => {
  it('all matches everything, including untagged rows', () => {
    expect(matchesCategory(task({}), 'all')).toBe(true);
    expect(matchesCategory(task({ tags: ['bug'] }), 'all')).toBe(true);
  });
  it('matches the label-borne categories from tags', () => {
    expect(matchesCategory(task({ tags: ['ralph-ready', 'p2'] }), 'ready')).toBe(true);
    expect(matchesCategory(task({ tags: ['needs-adrian'] }), 'needs-adrian')).toBe(true);
    expect(matchesCategory(task({ tags: ['needs-human'] }), 'needs-human')).toBe(true);
    expect(matchesCategory(task({ tags: ['backlog'] }), 'backlog')).toBe(true);
    expect(matchesCategory(task({ tags: ['ralph-parked'] }), 'parked')).toBe(true);
  });
  it('blocked matches EITHER the status column OR a blocked label', () => {
    expect(matchesCategory(task({ status: 'blocked' }), 'blocked')).toBe(true);
    expect(matchesCategory(task({ status: 'open', tags: ['blocked'] }), 'blocked')).toBe(true);
    expect(matchesCategory(task({ status: 'open', tags: ['backlog'] }), 'blocked')).toBe(false);
  });
  it('is non-exclusive — a backlog+ready row matches both', () => {
    const t = task({ tags: ['backlog', 'ralph-ready'] });
    expect(matchesCategory(t, 'backlog')).toBe(true);
    expect(matchesCategory(t, 'ready')).toBe(true);
  });
  it('does not match a category whose label is absent', () => {
    expect(matchesCategory(task({ tags: ['ralph-ready'] }), 'needs-adrian')).toBe(false);
    expect(matchesCategory(task({ tags: null }), 'backlog')).toBe(false);
  });
  it('every category is accepted without throwing', () => {
    for (const c of TASK_CATEGORIES) {
      expect(() => matchesCategory(task({ tags: ['backlog'] }), c)).not.toThrow();
    }
  });
});

describe('priorityChip — one leading priority chip', () => {
  it('prefers the p0–p3 label, upper-cased, toned p0=danger p1=warning', () => {
    expect(priorityChip(task({ tags: ['p0'] }))).toEqual({ label: 'P0', tone: 'danger' });
    expect(priorityChip(task({ tags: ['p1', 'enhancement'] }))).toEqual({
      label: 'P1',
      tone: 'warning',
    });
    expect(priorityChip(task({ tags: ['p2'] }))?.label).toBe('P2');
  });
  it('falls back to the legacy DB priority word when no p-label', () => {
    expect(priorityChip(task({ priority: 'high' }))).toEqual({ label: 'HIGH', tone: 'danger' });
  });
  it('is null when the task has neither', () => {
    expect(priorityChip(task({ tags: ['backlog'] }))).toBeNull();
  });
});

describe('cardLabelTags — routing/automation chips only', () => {
  it('keeps routing + automation labels', () => {
    expect(cardLabelTags(['needs-human', 'ralph-auto', 'ralph-approved'])).toEqual([
      'needs-human',
      'ralph-auto',
      'ralph-approved',
    ]);
  });
  it('drops phase, priority, and GitHub taxonomy noise', () => {
    expect(
      cardLabelTags(['ralph-ready', 'needs-adrian', 'backlog', 'p2', 'chore', 'enhancement', 'bug']),
    ).toEqual([]);
  });
  it('drops prefixed taxonomy (epic:/area:/status:) but keeps unknown custom labels', () => {
    expect(cardLabelTags(['epic:tailwind', 'area:figma', 'status:deferred', 'ralph-auto'])).toEqual([
      'ralph-auto',
    ]);
    expect(cardLabelTags(['some-custom-label'])).toEqual(['some-custom-label']);
  });
  it('is empty for null/absent tags', () => {
    expect(cardLabelTags(null)).toEqual([]);
    expect(cardLabelTags(undefined)).toEqual([]);
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
  it('a task due TODAY is due, not overdue (dates are end-of-day, not UTC midnight)', () => {
    expect(dueTone('2026-07-11', NOW)).toBe('warning');
  });
});

describe('recentlyCompletedTasks (ops#107)', () => {
  it('excludes tasks with no completed_at', () => {
    expect(recentlyCompletedTasks([task({ completed_at: null })], NOW)).toEqual([]);
  });

  it('includes a task completed within the last 24h', () => {
    const t = task({ key: 'tracker:a', completed_at: '2026-07-11T06:00:00Z' });
    expect(recentlyCompletedTasks([t], NOW)).toEqual([t]);
  });

  it('excludes a task completed more than 24h ago', () => {
    const t = task({ completed_at: '2026-07-09T12:00:00Z' });
    expect(recentlyCompletedTasks([t], NOW)).toEqual([]);
  });

  it('sorts newest-completed first', () => {
    const older = task({ key: 'tracker:older', completed_at: '2026-07-11T01:00:00Z' });
    const newer = task({ key: 'tracker:newer', completed_at: '2026-07-11T10:00:00Z' });
    expect(recentlyCompletedTasks([older, newer], NOW)).toEqual([newer, older]);
  });

  it('caps at 5 even when more are recently completed', () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      task({ key: `tracker:${i}`, completed_at: `2026-07-11T0${i}:00:00Z` }),
    );
    expect(recentlyCompletedTasks(tasks, NOW)).toHaveLength(5);
  });
});
