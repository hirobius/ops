/**
 * taskPaletteMatch — Level 1 fuzzy-match/ranking (ops#142). Red-first unit
 * coverage for the pure helper the CommandPalette's jump-to-task list is
 * built on.
 */
import { describe, it, expect } from 'vitest';
import { matchTasks } from './taskPaletteMatch';
import type { Task } from './types';

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

describe('matchTasks', () => {
  it('returns every task, unchanged order, for an empty or whitespace query', () => {
    const tasks = [task({ key: 'a', title: 'Alpha' }), task({ key: 'b', title: 'Beta' })];
    expect(matchTasks(tasks, '')).toEqual(tasks);
    expect(matchTasks(tasks, '   ')).toEqual(tasks);
  });

  it('matches by title, case-insensitively', () => {
    const target = task({ key: 'a', title: 'CommandPalette rollout' });
    const other = task({ key: 'b', title: 'Unrelated' });
    expect(matchTasks([other, target], 'palette')).toEqual([target]);
    expect(matchTasks([other, target], 'PALETTE')).toEqual([target]);
  });

  it('matches by the owner/repo#N ref for github-keyed tasks', () => {
    const target = task({ key: 'github:hirobius/ops#142', title: 'CommandPalette' });
    const other = task({ key: 'github:hirobius/ops#7', title: 'Something else' });
    expect(matchTasks([other, target], '142')).toEqual([target]);
    expect(matchTasks([other, target], 'ops#142')).toEqual([target]);
  });

  it('matches by lane', () => {
    const target = task({ key: 'a', lane: 'site-engine', title: 'Foo' });
    const other = task({ key: 'b', lane: 'ops', title: 'Bar' });
    expect(matchTasks([other, target], 'site-engine')).toEqual([target]);
  });

  it('falls back to a fuzzy subsequence match when there is no substring hit', () => {
    const target = task({ key: 'a', title: 'Approve Ralph merge' });
    // "arm" is a subsequence of "ApRove ralph Merge" — no contiguous substring.
    expect(matchTasks([target], 'arm')).toEqual([target]);
  });

  it('excludes tasks that match neither as a substring nor a subsequence', () => {
    const target = task({ key: 'a', title: 'Approve merge', lane: 'ops' });
    expect(matchTasks([target], 'xyz')).toEqual([]);
  });

  it('ranks a title substring match above a lane-only match', () => {
    const byTitle = task({ key: 'a', title: 'dispatch queue', lane: 'zzz' });
    const byLane = task({ key: 'b', title: 'unrelated', lane: 'dispatch-tools' });
    const ranked = matchTasks([byLane, byTitle], 'dispatch');
    expect(ranked.map((t) => t.key)).toEqual(['a', 'b']);
  });

  it('ranks an earlier substring hit above a later one within the same field', () => {
    const early = task({ key: 'a', title: 'Ops board declutter' });
    const late = task({ key: 'b', title: 'Board declutter for ops' });
    const ranked = matchTasks([late, early], 'ops');
    expect(ranked.map((t) => t.key)).toEqual(['a', 'b']);
  });

  it('ranks a tighter fuzzy subsequence span above a looser one', () => {
    const tight = task({ key: 'a', title: 'cmdk' });
    const loose = task({ key: 'b', title: 'c...m...d...k spread far apart' });
    const ranked = matchTasks([loose, tight], 'cmdk');
    expect(ranked.map((t) => t.key)).toEqual(['a', 'b']);
  });
});
