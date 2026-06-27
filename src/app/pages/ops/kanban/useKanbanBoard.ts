import { usePoll } from '../../../lib/usePoll';
import type { KanbanBoard } from './types';

/** Polls the Hermes kanban API; shared lifecycle (visibility pause, offline backoff) in usePoll. */

const BASE_INTERVAL_MS = 5_000;
const OFFLINE_INTERVAL_MS = 30_000;
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
  const { data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = usePoll<KanbanBoard>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as KanbanBoard;
    },
    { intervalMs: BASE_INTERVAL_MS, offlineIntervalMs: OFFLINE_INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return { board: data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch };
}
