/**
 * useTaskActions — the board's single mutation seam (ops#136).
 *
 * Wraps POST /api/task-action (per-row actions) and POST /api/tasks (the
 * GitHub-issues import) with per-key busy tracking, always refetching after a
 * mutation so the poll reflects the write. Most callers fire-and-forget `act`
 * and let the board surface state via the next poll (its resolved
 * `TaskActionResult` is safe to ignore — the return type is `void`-compatible
 * for those call sites). The exceptions are "Run Ralph" (ops#113) and the
 * GitHub-issues import (ops#204): both can fail on a missing/rejected
 * `GITHUB_TOKEN`, and per CLAUDE.md's fail-loud rule that can't be a silent
 * no-op, so `act` reports back `{ ok, body }` and `importIssues` reports
 * failures straight to the toast rather than swallowing the response.
 */

import { useCallback, useState } from 'react';
import { opsApi } from '../../../lib/opsApi';
import type { TaskAction, TaskActionResult } from './types';

export interface UseTaskActionsResult {
  act: (
    key: string,
    action: TaskAction,
    payload?: Record<string, unknown>,
  ) => Promise<TaskActionResult>;
  busyKeys: ReadonlySet<string>;
  importing: boolean;
  importIssues: () => Promise<void>;
}

/** Pulls the backend's named, actionable `error` string out of a fetch response body, if present. */
function errorMessageOf(body: unknown, fallback: string): string {
  return body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : fallback;
}

export function useTaskActions(
  refetch: () => void,
  onNotify: (message: string, tone: 'success' | 'danger') => void,
): UseTaskActionsResult {
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const act = useCallback(
    async (
      key: string,
      action: TaskAction,
      payload?: Record<string, unknown>,
    ): Promise<TaskActionResult> => {
      setBusyKeys((prev) => new Set(prev).add(key));
      try {
        const res = await opsApi.post('/api/task-action', { key, action, ...payload });
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
      const res = await opsApi.post('/api/tasks');
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        onNotify(errorMessageOf(body, `Import failed — HTTP ${res.status}`), 'danger');
      }
    } catch (err) {
      onNotify(`Import failed — ${err instanceof Error ? err.message : 'network error'}`, 'danger');
    } finally {
      setImporting(false);
      refetch();
    }
  }, [refetch, onNotify]);

  return { act, busyKeys, importing, importIssues };
}
