/**
 * useTaskActions — the board's single mutation seam (ops#136).
 *
 * Wraps POST /api/task-action (per-row actions) and POST /api/tasks (the
 * GitHub-issues import) with per-key busy tracking, always refetching after a
 * mutation so the poll reflects the write. Most callers fire-and-forget `act`
 * and let the board surface state via the next poll (its resolved
 * `TaskActionResult` is safe to ignore — the return type is `void`-compatible
 * for those call sites). The one exception is "Run Ralph" (ops#113): it
 * can't fail silently per its DoD, so `act` reports back `{ ok, body }`
 * rather than swallowing the response — a caller that needs to react (show a
 * toast) can, everyone else keeps ignoring it.
 */

import { useCallback, useState } from 'react';
import { opsApi } from '../../../lib/opsApi';
import type { TaskAction, TaskActionResult } from './types';

export interface UseTaskActionsResult {
  act: (key: string, action: TaskAction) => Promise<TaskActionResult>;
  busyKeys: ReadonlySet<string>;
  importing: boolean;
  importIssues: () => Promise<void>;
}

export function useTaskActions(refetch: () => void): UseTaskActionsResult {
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const act = useCallback(
    async (key: string, action: TaskAction): Promise<TaskActionResult> => {
      setBusyKeys((prev) => new Set(prev).add(key));
      try {
        const res = await opsApi.post('/api/task-action', { key, action });
        const body = await res.json().catch(() => null);
        return { ok: res.ok, body };
      } catch {
        return { ok: false, body: null };
      } finally {
        setBusyKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        refetch();
      }
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

  return { act, busyKeys, importing, importIssues };
}
