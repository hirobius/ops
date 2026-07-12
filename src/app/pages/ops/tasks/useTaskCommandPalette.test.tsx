/**
 * useTaskCommandPalette — ⌘K open + two-level navigation + action dispatch
 * (ops#142). Exercises the hook directly (no DS CommandPalette mount) via a
 * tiny harness component, same idiom as SkillsBar.test.tsx — this repo does
 * not have @testing-library/react installed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useTaskCommandPalette } from './useTaskCommandPalette';
import type { Task, TaskAction } from './types';

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

const TASKS = [
  task({ key: 'github:hirobius/ops#142', title: 'CommandPalette rollout' }),
  task({ key: 'github:hirobius/ops#7', title: 'Other task' }),
];

interface HarnessProps {
  tasks: Task[];
  act: (key: string, action: TaskAction) => void;
  onJump: (task: Task) => void;
  onState: (state: ReturnType<typeof useTaskCommandPalette>) => void;
}

function Harness({ tasks, act: dispatch, onJump, onState }: HarnessProps) {
  const state = useTaskCommandPalette(tasks, dispatch, onJump);
  onState(state);
  return null;
}

function makeContainer(): HTMLDivElement {
  const c = document.createElement('div');
  document.body.appendChild(c);
  return c;
}

function cleanup(container: HTMLDivElement, root: Root) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

describe('useTaskCommandPalette', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = makeContainer();
    root = createRoot(container);
  });

  afterEach(() => cleanup(container, root));

  function render(dispatch = vi.fn(), onJump = vi.fn()) {
    let latest!: ReturnType<typeof useTaskCommandPalette>;
    act(() => {
      root.render(
        <Harness
          tasks={TASKS}
          act={dispatch}
          onJump={onJump}
          onState={(s) => {
            latest = s;
          }}
        />,
      );
    });
    return {
      dispatch,
      onJump,
      get state() {
        return latest;
      },
    };
  }

  it('starts closed, on Level 1, with every task visible (no query yet)', () => {
    const h = render();
    expect(h.state.open).toBe(false);
    expect(h.state.level).toBe('tasks');
    expect(h.state.matched).toEqual(TASKS);
  });

  it('opens on Ctrl+K', () => {
    const h = render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
    });
    expect(h.state.open).toBe(true);
  });

  it('opens on Cmd+K (metaKey, for macOS)', () => {
    const h = render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    });
    expect(h.state.open).toBe(true);
  });

  it('plain "k" (no modifier) does not open the palette', () => {
    const h = render();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k' }));
    });
    expect(h.state.open).toBe(false);
  });

  it('selecting a task jumps to it and drills into Level 2 without closing', () => {
    const h = render();
    act(() => {
      h.state.setOpen(true);
    });
    act(() => {
      h.state.selectTask(TASKS[0]);
    });
    expect(h.onJump).toHaveBeenCalledWith(TASKS[0]);
    expect(h.state.open).toBe(true);
    expect(h.state.level).toBe('actions');
    expect(h.state.selectedTask).toEqual(TASKS[0]);
  });

  it('Level 2 lists the selected task action set (github-keyed → includes Approve merge)', () => {
    const h = render();
    act(() => h.state.setOpen(true));
    act(() => h.state.selectTask(TASKS[0]));
    expect(h.state.matchedActions.map((a) => a.action)).toContain('ralph_approve');
    expect(h.state.matchedActions.map((a) => a.action)).toContain('dispatch');
  });

  it('runAction dispatches through the act(key, action) seam and closes the palette', () => {
    const h = render();
    act(() => h.state.setOpen(true));
    act(() => h.state.selectTask(TASKS[0]));
    act(() => h.state.runAction('done'));
    expect(h.dispatch).toHaveBeenCalledWith('github:hirobius/ops#142', 'done');
    expect(h.state.open).toBe(false);
    expect(h.state.level).toBe('tasks');
    expect(h.state.selectedTask).toBeNull();
  });

  it('back() returns to Level 1 without closing the palette', () => {
    const h = render();
    act(() => h.state.setOpen(true));
    act(() => h.state.selectTask(TASKS[0]));
    act(() => h.state.back());
    expect(h.state.open).toBe(true);
    expect(h.state.level).toBe('tasks');
    expect(h.state.selectedTask).toBeNull();
  });

  it('closing the palette resets query, level, and selection', () => {
    const h = render();
    act(() => h.state.setOpen(true));
    act(() => h.state.setQuery('palette'));
    act(() => h.state.selectTask(TASKS[0]));
    act(() => h.state.setOpen(false));
    expect(h.state.query).toBe('');
    expect(h.state.level).toBe('tasks');
    expect(h.state.selectedTask).toBeNull();
  });

  it('Level 1 query fuzzy-filters the matched task list', () => {
    const h = render();
    act(() => h.state.setOpen(true));
    act(() => h.state.setQuery('142'));
    expect(h.state.matched).toEqual([TASKS[0]]);
  });

  it('Level 2 query filters the action list by label substring', () => {
    const h = render();
    act(() => h.state.setOpen(true));
    act(() => h.state.selectTask(TASKS[0]));
    act(() => h.state.setQuery('approve'));
    expect(h.state.matchedActions.map((a) => a.action)).toEqual(['ralph_approve']);
  });
});
