/* eslint-disable react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect to hydrate board from API */
/* eslint-disable react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { KanbanBoard } from './types';

/**
 * Polls the Hermes kanban API and exposes board state to the page.
 *
 * Lifecycle:
 *   - Visible tab → poll every BASE_INTERVAL_MS (5 s).
 *   - Hidden tab → no requests in flight.
 *   - 3 consecutive failures → backoff to OFFLINE_INTERVAL_MS (30 s) and
 *     flip `isOffline` so the page can render the offline banner.
 *   - First successful response after a failure run → reset to BASE.
 *
 * The hook owns one in-flight request at a time. If a poll lands while a
 * previous request is still pending, the new one is skipped — the next
 * tick will catch up.
 */

const BASE_INTERVAL_MS = 5_000;
const OFFLINE_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 3;
const REQUEST_TIMEOUT_MS = 4_000;
const ENDPOINT = '/api/hermes/board?tenant=hds';

export interface UseKanbanBoardResult {
  board: KanbanBoard | null;
  error: string | null;
  isOffline: boolean;
  /** True the very first time the hook is fetching, before any data exists. */
  isInitialLoading: boolean;
  /** Epoch ms of the last successful response, or null if none yet. */
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function useKanbanBoard(): UseKanbanBoardResult {
  const [board, setBoard] = useState<KanbanBoard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const failureCountRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const fetchOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(ENDPOINT, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: KanbanBoard = await res.json();
      if (!mountedRef.current) return;
      setBoard(data);
      setError(null);
      setIsOffline(false);
      setLastUpdatedAt(Date.now());
      failureCountRef.current = 0;
    } catch (err) {
      if (!mountedRef.current) return;
      failureCountRef.current += 1;
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      if (failureCountRef.current >= FAILURE_THRESHOLD) {
        setIsOffline(true);
      }
    } finally {
      clearTimeout(abortTimer);
      inFlightRef.current = false;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (document.visibilityState !== 'visible') return;
    const delay = isOffline ? OFFLINE_INTERVAL_MS : BASE_INTERVAL_MS;
    timerRef.current = setTimeout(() => {
      void fetchOnce().finally(scheduleNext);
    }, delay);
  }, [fetchOnce, isOffline]);

  // Initial fetch + polling lifecycle.
  useEffect(() => {
    mountedRef.current = true;
    void fetchOnce().finally(scheduleNext);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab just regained focus — refresh immediately, then resume cadence.
        void fetchOnce().finally(scheduleNext);
      } else if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetchOnce, scheduleNext]);

  const refetch = useCallback(() => {
    void fetchOnce().finally(scheduleNext);
  }, [fetchOnce, scheduleNext]);

  return {
    board,
    error,
    isOffline,
    isInitialLoading: board === null && !isOffline,
    lastUpdatedAt,
    refetch,
  };
}
