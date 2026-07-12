/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * TaskCommandPalette — ⌘K / Ctrl-K jump-to-task + card actions (ops#142).
 *
 * All navigation/dispatch logic lives in useTaskCommandPalette (DS-free,
 * unit-tested); this component is a thin DS-mounting shell so the one part
 * of this feature that couldn't be verified in this session (see note
 * below) stays small and easy to fix in isolation.
 *
 * Level 1: fuzzy-matched tasks (title/ref/lane, taskPaletteMatch.ts).
 * Selecting one (Enter) scrolls to + focuses its row (`onJump`, wired to
 * TasksPage's data-task-key lookup) AND opens Level 2 — that task's action
 * set (taskPaletteActions.ts: Done/Reopen, Dispatch, Ralph-ready toggle,
 * Approve merge). Backspace on an empty Level-2 query goes back to Level 1.
 * Every action fires through `act(key, action)` — the board's existing
 * mutation seam (useTaskActions) — no new mutation paths.
 *
 * `priority set` (named in the issue as landing via #138) isn't offered:
 * #138 shipped the p0–p3 *display* chip only, no mutation action — see the
 * PR description.
 *
 * ⚠️ DS-verification note: this session had no package-registry access (no
 * `pnpm install`, `@hirobius/design-system` isn't present in node_modules
 * here), so the exact `CommandPalette` compound API below is inferred, not
 * confirmed against the real types — mirrored from this file's Menu usage
 * convention (TaskActionsMenu.tsx: Root / `.Trigger asChild` / `.Content` /
 * `.Item onSelect`) plus the aria-label + `[role="dialog"]` + built-in
 * Ctrl-K evidence in the (currently dead, `/hds`-routed) `tests/keyboard-
 * trap.spec.ts`. Run `pnpm typecheck` before merge to confirm prop names.
 */

import { Button, CommandPalette } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';
import type { Task, TaskAction } from './types';
import { taskRef } from './taskMeta';
import { useTaskCommandPalette } from './useTaskCommandPalette';

export interface TaskCommandPaletteProps {
  tasks: Task[];
  act: (key: string, action: TaskAction) => void;
  onJump: (task: Task) => void;
}

export function TaskCommandPalette({ tasks, act, onJump }: TaskCommandPaletteProps) {
  const {
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
  } = useTaskCommandPalette(tasks, act, onJump);

  function handleInputKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (level === 'actions' && e.key === 'Backspace' && query === '') back();
  }

  return (
    <CommandPalette open={open} onOpenChange={setOpen}>
      <CommandPalette.Trigger asChild>
        <Button size="sm" variant="secondary" aria-label="Jump to task (⌘K)">
          ⌘K Jump to task
        </Button>
      </CommandPalette.Trigger>
      <CommandPalette.Content
        aria-label={level === 'tasks' ? 'Jump to task' : `Actions for ${selectedTask?.title ?? ''}`}
      >
        {level === 'actions' && (
          <div style={s.breadcrumb}>← {selectedTask?.title} (Backspace to go back)</div>
        )}
        <CommandPalette.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          onKeyDown={handleInputKeyDown}
          placeholder={
            level === 'tasks'
              ? 'Jump to a task by title, #ref, or repo…'
              : `Filter actions for ${selectedTask?.title ?? ''}…`
          }
        />
        <CommandPalette.List>
          {level === 'tasks'
            ? matched.slice(0, 50).map((t) => (
                <CommandPalette.Item
                  key={t.key}
                  value={`${t.title} ${taskRef(t) ?? ''} ${t.lane}`}
                  onSelect={() => selectTask(t)}
                >
                  {t.title}
                </CommandPalette.Item>
              ))
            : matchedActions.map((a) => (
                <CommandPalette.Item key={a.action} value={a.label} onSelect={() => runAction(a.action)}>
                  {a.label}
                </CommandPalette.Item>
              ))}
        </CommandPalette.List>
      </CommandPalette.Content>
    </CommandPalette>
  );
}

const s = {
  breadcrumb: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    padding: `${hds.space.px4} ${hds.space.px8}`,
  },
} satisfies Record<string, CSSProperties>;
