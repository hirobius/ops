/**
 * useTaskActions — the board's single mutation seam (ops#136).
 *
 * Wraps POST /api/task-action (per-row actions) and POST /api/tasks (the
 * GitHub-issues import) with per-key busy tracking, always refetching after a
 * mutation so the poll reflects the write. `act()` surfaces its outcome two
 * ways (ops#108): a per-key error message (rendered inline on the row) and an
 * `announcement` string for the page's `aria-live` status region.
 */

import { useCallback, useState } from 'react';
import { opsApi } from '../../../lib/opsApi';
import type { TaskAction } from './types';

export interface UseTaskActionsResult {
  act: (key: string, action: TaskAction) => Promise<void>;
  busyKeys: ReadonlySet<string>;
  /** Most recent action error per task key; cleared when that key's next action starts. */
  errors: ReadonlyMap<string, string>;
  /** Latest action outcome — feeds the page's `aria-live="polite"` status region. */
  announcement: string;
  importing: boolean;
  importIssues: () => Promise<void>;
}

// Past-tense, screen-reader-friendly label per action — used for both the
// aria-live announcement and the inline error prefix.
const ACTION_LABELS: Record<TaskAction, string> = {
  done: 'Marked done',
  reopen: 'Reopened',
  claim: 'Claimed',
  unclaim: 'Unclaimed',
  trash: 'Trashed',
  restore: 'Restored',
  dispatch: 'Dispatched',
  auto_on: 'Auto-dispatch turned on',
  auto_off: 'Auto-dispatch turned off',
  queue: 'Queued for approval',
  unqueue: 'Removed from approvals queue',
  ralph_ready_on: 'Ralph-ready turned on',
  ralph_ready_off: 'Ralph-ready turned off',
  ralph_approve: 'Approved merge',
};

async function postTaskAction(
  key: string,
  action: TaskAction,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await opsApi.post('/api/task-action', { key, action });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: body.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Request failed' };
  }
}

export function useTaskActions(refetch: () => void): UseTaskActionsResult {
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<string, string>>(new Map());
  const [announcement, setAnnouncement] = useState('');
  const [importing, setImporting] = useState(false);

  const act = useCallback(
    async (key: string, action: TaskAction) => {
      setBusyKeys((prev) => new Set(prev).add(key));
      setErrors((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Map(prev);
        next.delete(key);
        return next;
      });

      const label = ACTION_LABELS[action];
      const result = await postTaskAction(key, action);
      if (result.ok) {
        setAnnouncement(`${label}.`);
      } else {
        setErrors((prev) => new Map(prev).set(key, `${label} failed: ${result.error}`));
        setAnnouncement(`${label} failed: ${result.error}`);
      }

      setBusyKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      refetch();
    },
    [refetch],
  );

  const importIssues = useCallback(async () => {
    setImporting(true);
    try {
      await opsApi.post('/api/tasks');
    } catch {
      /* surfaced on next poll */
    } finally {
      setImporting(false);
      refetch();
    }
  }, [refetch]);

  return { act, busyKeys, errors, announcement, importing, importIssues };
}
