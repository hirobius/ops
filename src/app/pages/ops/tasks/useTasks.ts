/* eslint-disable react-hooks/set-state-in-effect -- polling hook intentionally hydrates state from the API in an effect */
/* eslint-disable react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Task, TasksResponse } from './types';

/**
 * Polls GET /api/tasks and exposes the consolidated task list to the board.
 * Same lifecycle as useLeads/useKanbanBoard: poll while visible, pause when
 * hidden, back off + flag offline after 3 failures, reset on success.
 */

const BASE_INTERVAL_MS = 8_000;
const OFFLINE_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 3;
const REQUEST_TIMEOUT_MS = 8_000;
const ENDPOINT = '/api/tasks';

export interface UseTasksResult {
  tasks: Task[] | null;
  error: string | null;
  isOffline: boolean;
  isInitialLoading: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function useTasks(): UseTasksResult {
  const [tasks, setTasks] = useState<Task[] | null>(null);
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
      const data = (await res.json()) as TasksResponse;
      if (!mountedRef.current) return;
      setTasks(data.tasks ?? []);
      setError(null);
      setIsOffline(false);
      setLastUpdatedAt(Date.now());
      failureCountRef.current = 0;
    } catch (err) {
      if (!mountedRef.current) return;
      failureCountRef.current += 1;
      setError(err instanceof Error ? err.message : String(err));
      if (failureCountRef.current >= FAILURE_THRESHOLD) setIsOffline(true);
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

  useEffect(() => {
    mountedRef.current = true;
    void fetchOnce().finally(scheduleNext);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
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
    tasks,
    error,
    isOffline,
    isInitialLoading: tasks === null && !isOffline,
    lastUpdatedAt,
    refetch,
  };
}
