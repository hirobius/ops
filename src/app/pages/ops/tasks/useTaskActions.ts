/**
 * useTaskActions — the board's single mutation seam (ops#136).
 *
 * Wraps POST /api/task-action (per-row actions) and POST /api/tasks (the
 * GitHub-issues import) with per-key busy tracking, always refetching after a
 * mutation so the poll reflects the write. Errors are swallowed here on
 * purpose — the board surfaces state via the next poll, same contract as the
 * pre-extraction page.
 */

import { useCallback, useState } from 'react';
import { opsApi } from '../../../lib/opsApi';
import type { TaskAction } from './types';

export interface UseTaskActionsResult {
  act: (key: string, action: TaskAction) => Promise<void>;
  busyKeys: ReadonlySet<string>;
  importing: boolean;
  importIssues: () => Promise<void>;
}

export function useTaskActions(refetch: () => void): UseTaskActionsResult {
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const act = useCallback(
    async (key: string, action: TaskAction) => {
      setBusyKeys((prev) => new Set(prev).add(key));
      try {
        await opsApi.post('/api/task-action', { key, action });
      } catch {
        /* surfaced on next poll */
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
