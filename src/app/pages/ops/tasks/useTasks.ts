import { usePoll } from '../../../lib/usePoll';
import type { Task, TasksResponse } from './types';

/** Polls GET /api/tasks; shared lifecycle (visibility pause, offline backoff) in usePoll. */

const BASE_INTERVAL_MS = 8_000;
const OFFLINE_INTERVAL_MS = 30_000;
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
  const { data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = usePoll<Task[]>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as TasksResponse;
      return body.tasks ?? [];
    },
    { intervalMs: BASE_INTERVAL_MS, offlineIntervalMs: OFFLINE_INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return { tasks: data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch };
}
