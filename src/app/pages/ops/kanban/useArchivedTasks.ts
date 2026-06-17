/* eslint-disable react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect body to hydrate from API */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KanbanBoard, KanbanTask } from './types';

const ENDPOINT = '/api/hermes/board?tenant=hds&include_archived=true';
const REQUEST_TIMEOUT_MS = 8_000;
const REFRESH_INTERVAL_MS = 60_000;

export interface UseArchivedTasksResult {
  tasks: KanbanTask[] | null;
  fetchedAt: number | null;
  error: string | null;
  isLoading: boolean;
  refetch: () => void;
}

/**
 * Lazy fetch of the archived column. The kanban page passes
 * `enabled: false` until the archive disclosure is opened — there's no
 * point pulling 447 archived rows on every page load.
 *
 * On enable: fetches once immediately, then refreshes every 60s while
 * still enabled. Disable resets state and stops polling.
 */
export function useArchivedTasks({ enabled }: { enabled: boolean }): UseArchivedTasksResult {
  const [tasks, setTasks] = useState<KanbanTask[] | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const board: KanbanBoard = await res.json();
      const archivedCol = board.columns.find((c) => c.name === 'archived');
      if (!mountedRef.current) return;
      setTasks(archivedCol?.tasks ?? []);
      setFetchedAt(Date.now());
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(abortTimer);
      inFlightRef.current = false;
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      // Reset to "not yet fetched" so re-opening triggers a fresh load.
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return () => {
        mountedRef.current = false;
      };
    }

    void fetchOnce();
    const tick = () => {
      if (document.visibilityState !== 'visible') return;
      void fetchOnce().finally(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(tick, REFRESH_INTERVAL_MS);
      });
    };
    timerRef.current = setTimeout(tick, REFRESH_INTERVAL_MS);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [enabled, fetchOnce]);

  const refetch = useCallback(() => {
    void fetchOnce();
  }, [fetchOnce]);

  return { tasks, fetchedAt, error, isLoading, refetch };
}
