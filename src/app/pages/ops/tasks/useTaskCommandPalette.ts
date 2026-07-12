/**
 * useTaskCommandPalette — the ⌘K / Ctrl-K state machine behind
 * TaskCommandPalette.tsx (ops#142). Owns open/close, the two-level
 * navigation (jump-to-task → that task's actions), and query text; the DS
 * `CommandPalette` component only renders what this returns. Kept
 * DS-independent on purpose so the flow is unit-tested without mounting the
 * design-system component.
 *
 * Level 1 → Level 2: selecting a task (Enter) both jumps to its row
 * (`onJump`) AND opens its action list, so an operator can act on it without
 * a second keystroke to "enter" the row — "type to find, act without
 * leaving the keyboard" (the issue's stated goal). Backspace-on-empty-query
 * in Level 2 backs out to Level 1; closing the palette (Escape / outside
 * click / firing an action) always resets to Level 1.
 *
 * Dispatches exclusively through the `act(key, action)` seam passed in
 * (the board's one mutation path, useTaskActions) — no new mutation paths.
 */
import { useCallback, useEffect, useState } from 'react';
import type { Task, TaskAction } from './types';
import { matchTasks } from './taskPaletteMatch';
import { taskActionsFor, type PaletteAction } from './taskPaletteActions';

export type PaletteLevel = 'tasks' | 'actions';

export interface UseTaskCommandPaletteResult {
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string;
  setQuery: (query: string) => void;
  level: PaletteLevel;
  selectedTask: Task | null;
  /** Level 1: `tasks` ranked against `query` (taskPaletteMatch::matchTasks). */
  matched: Task[];
  /** Level 2: the selected task's action set, filtered by `query`. */
  matchedActions: PaletteAction[];
  /** Level 1 Enter — jumps to the row and opens its action list. */
  selectTask: (task: Task) => void;
  /** Level 2 back-out — returns to Level 1 without closing the palette. */
  back: () => void;
  /** Level 2 Enter — fires the action via `act`, then closes the palette. */
  runAction: (action: TaskAction) => void;
}

export function useTaskCommandPalette(
  tasks: Task[],
  act: (key: string, action: TaskAction) => void,
  onJump: (task: Task) => void,
): UseTaskCommandPaletteResult {
  const [open, setOpenState] = useState(false);
  const [query, setQuery] = useState('');
  const [level, setLevel] = useState<PaletteLevel>('tasks');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next);
    if (!next) {
      setQuery('');
      setLevel('tasks');
      setSelectedTask(null);
    }
  }, []);

  // Global ⌘K / Ctrl-K — the palette owns its own shortcut so TasksPage
  // doesn't need a page-level keydown listener of its own.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setOpen]);

  const selectTask = useCallback(
    (task: Task) => {
      onJump(task);
      setSelectedTask(task);
      setLevel('actions');
      setQuery('');
    },
    [onJump],
  );

  const back = useCallback(() => {
    setLevel('tasks');
    setSelectedTask(null);
    setQuery('');
  }, []);

  const runAction = useCallback(
    (action: TaskAction) => {
      if (!selectedTask) return;
      act(selectedTask.key, action);
      setOpen(false);
    },
    [act, selectedTask, setOpen],
  );

  const matched = matchTasks(tasks, level === 'tasks' ? query : '');

  const allActions = selectedTask ? taskActionsFor(selectedTask) : [];
  const q = level === 'actions' ? query.trim().toLowerCase() : '';
  const matchedActions = q
    ? allActions.filter((a) => a.label.toLowerCase().includes(q))
    : allActions;

  return {
    open,
    setOpen,
    query,
    setQuery,
    level,
    selectedTask,
    matched,
    matchedActions,
    selectTask,
    back,
    runAction,
  };
}
