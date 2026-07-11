import * as React from 'react';
import { opsApi } from '../../lib/opsApi';
import { useTasks } from '../ops/tasks/useTasks';
import type { Task } from '../ops/tasks/types';
import type { ApprovalUnitSummary } from '../../components/approval-card';
import { deriveWorkState } from '../../../../lib/tasks/work-state.mjs';

/**
 * useApprovalsInbox — the tasks-store approvals inbox (epic #41, Slice 3).
 *
 * Shared between Approvals.tsx (list) and ApprovalDetail.tsx (single-key
 * view) so both read the same live `/api/tasks` poll and mutate through the
 * same `/api/task-action` calls, rather than duplicating fetch/optimistic
 * logic per page. Replaces the retired Figma-bridge dev-server fetch
 * entirely (that dev port was swept 2026-07-02).
 *
 * Auto-dispatch (`auto_ok=true`) tasks self-run without approval — this hook
 * only surfaces tasks explicitly `dispatch_status === 'queued'` (migration
 * 0008): proposed for dispatch but awaiting a human click.
 *
 *   Approve → POST /api/task-action { action: 'dispatch' } — opens the
 *     `@claude` GitHub issue; `applyTaskAction`'s dispatch handler stamps
 *     `dispatch_status: 'dispatched'`, so the task leaves this filter.
 *   Deny    → POST /api/task-action { action: 'unqueue' } — clears
 *     `dispatch_status` back to null (the task returns to the plain backlog).
 *
 * Optimistic UI: the acted-on key is hidden immediately (`removedKeys`), then
 * reconciled by the next poll. On a failed mutation the key is un-hidden
 * (rollback) and the error surfaces via `errorMessage`.
 */

export interface ApprovalsInboxResult {
  /** Tasks with dispatch_status === 'queued', minus any optimistically-removed keys. */
  queued: Task[];
  /** The full unfiltered tasks list from the poll (null until first load). */
  allTasks: Task[] | null;
  /** True once the first poll has resolved (success or failure). */
  loaded: boolean;
  /** Keys with a mutation in flight — disable that row's buttons. */
  busyKeys: ReadonlySet<string>;
  /** Most recent mutation error, if any. */
  errorMessage: string | null;
  /** Approve — dispatch the task (opens the @claude issue). */
  approve: (key: string) => void;
  /** Deny — unqueue the task back to the backlog. */
  deny: (key: string) => void;
}

async function postTaskAction(
  key: string,
  action: 'dispatch' | 'unqueue',
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await opsApi.post('/api/task-action', { key, action });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || body.error) {
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'request failed' };
  }
}

export function useApprovalsInbox(): ApprovalsInboxResult {
  const { tasks, isInitialLoading, refetch } = useTasks();
  const [removedKeys, setRemovedKeys] = React.useState<ReadonlySet<string>>(new Set());
  const [busyKeys, setBusyKeys] = React.useState<ReadonlySet<string>>(new Set());
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const queued = React.useMemo(
    () => (tasks ?? []).filter((t) => t.dispatch_status === 'queued' && !removedKeys.has(t.key)),
    [tasks, removedKeys],
  );

  const act = React.useCallback(
    async (key: string, action: 'dispatch' | 'unqueue') => {
      setRemovedKeys((prev) => new Set(prev).add(key));
      setBusyKeys((prev) => new Set(prev).add(key));
      const result = await postTaskAction(key, action);
      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      if (!result.ok) {
        // Rollback the optimistic hide.
        setRemovedKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        setErrorMessage(result.error ?? 'unknown server error');
        return;
      }
      setErrorMessage(null);
      refetch();
    },
    [refetch],
  );

  return {
    queued,
    allTasks: tasks,
    loaded: !isInitialLoading,
    busyKeys,
    errorMessage,
    approve: (key) => void act(key, 'dispatch'),
    deny: (key) => void act(key, 'unqueue'),
  };
}

/** Maps a tasks-store `Task` to the presentational `ApprovalCard`'s prop shape. */
export function taskToApprovalUnit(t: Task): ApprovalUnitSummary {
  const metaParts = [
    t.phase,
    t.priority ? `P:${t.priority}` : null,
    t.effort ? `E:${t.effort}` : null,
    t.owner ? `@${t.owner}` : null,
    t.due ? `due ${t.due}` : null,
  ].filter((p): p is string => Boolean(p));
  return {
    id: t.key,
    name: t.title,
    cluster: t.lane,
    source: t.source,
    description: metaParts.join('  ·  '),
    tier: t.tier,
    model: t.model,
    workState: deriveWorkState(t),
  };
}
