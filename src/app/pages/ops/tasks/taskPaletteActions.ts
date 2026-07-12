/**
 * taskPaletteActions — the row action set surfaced by the CommandPalette's
 * Level 2, once a task is selected (ops#142). Mirrors TaskActionsMenu.tsx's
 * conditional logic so the palette and the row's ⋯ menu never disagree on
 * what's actionable for a given task; both dispatch through the same
 * `act(key, action)` seam (useTaskActions) — no new mutation paths.
 *
 * `priority set` is deliberately NOT included: #138 landed the p0–p3
 * *display* chip (taskMeta.ts::priorityChip) but no `TaskAction` that
 * mutates priority — there is nothing to wire here yet. See the PR notes.
 */
import type { Task, TaskAction } from './types';

export interface PaletteAction {
  action: TaskAction;
  label: string;
}

/** The ordered action list for `t` — same eligibility rules as TaskActionsMenu. */
export function taskActionsFor(t: Task): PaletteAction[] {
  const dispatched = !!t.dispatch_url;
  const ralphReady = (t.tags ?? []).includes('ralph-ready');

  const actions: PaletteAction[] = [
    { action: 'dispatch', label: dispatched ? 'Re-dispatch' : 'Dispatch' },
    t.status === 'done'
      ? { action: 'reopen', label: 'Reopen' }
      : { action: 'done', label: 'Mark done' },
  ];

  if (dispatched) {
    actions.push(
      ralphReady
        ? { action: 'ralph_ready_off', label: 'Ralph-ready: turn off' }
        : { action: 'ralph_ready_on', label: 'Ralph-ready: turn on' },
    );
  }

  if (t.key.startsWith('github:')) {
    actions.push({ action: 'ralph_approve', label: 'Approve merge' });
  }

  return actions;
}
