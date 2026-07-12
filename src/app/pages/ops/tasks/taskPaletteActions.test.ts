/**
 * taskPaletteActions — the CommandPalette's Level 2 action set (ops#142).
 * Same eligibility rules as TaskActionsMenu.tsx, tested in isolation.
 */
import { describe, it, expect } from 'vitest';
import { taskActionsFor } from './taskPaletteActions';
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

describe('taskActionsFor', () => {
  it('an open, undispatched task gets Dispatch + Mark done only', () => {
    const actions = taskActionsFor(task({}));
    expect(actions.map((a) => a.action)).toEqual(['dispatch', 'done']);
    expect(actions[0].label).toBe('Dispatch');
  });

  it('a done task gets Reopen instead of Mark done', () => {
    const actions = taskActionsFor(task({ status: 'done' }));
    expect(actions.map((a) => a.action)).toEqual(['dispatch', 'reopen']);
  });

  it('a dispatched task gets the Re-dispatch label and a ralph-ready toggle', () => {
    const actions = taskActionsFor(
      task({ dispatch_url: 'https://github.com/hirobius/ops/issues/7' }),
    );
    expect(actions.map((a) => a.action)).toEqual(['dispatch', 'done', 'ralph_ready_on']);
    expect(actions[0].label).toBe('Re-dispatch');
  });

  it('ralph_ready_off is offered once the ralph-ready tag is set', () => {
    const actions = taskActionsFor(
      task({
        dispatch_url: 'https://github.com/hirobius/ops/issues/7',
        tags: ['ralph-ready'],
      }),
    );
    expect(actions.map((a) => a.action)).toContain('ralph_ready_off');
    expect(actions.map((a) => a.action)).not.toContain('ralph_ready_on');
  });

  it('an undispatched task gets no ralph-ready toggle (needs a linked issue first)', () => {
    const actions = taskActionsFor(task({}));
    expect(actions.map((a) => a.action)).not.toContain('ralph_ready_on');
    expect(actions.map((a) => a.action)).not.toContain('ralph_ready_off');
  });

  it('a github:-keyed task gets Approve merge', () => {
    const actions = taskActionsFor(task({ key: 'github:hirobius/ops#142' }));
    expect(actions.map((a) => a.action)).toContain('ralph_approve');
  });

  it('a non-github-keyed task gets no Approve merge action', () => {
    const actions = taskActionsFor(task({ key: 'tracker:x' }));
    expect(actions.map((a) => a.action)).not.toContain('ralph_approve');
  });
});
