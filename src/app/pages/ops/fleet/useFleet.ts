import { usePoll } from '../../../lib/usePoll';
import type { FleetResponse, FleetProject } from './types';

/** Polls GET /api/projects; shared lifecycle (visibility pause, offline backoff) in usePoll. */

const BASE_INTERVAL_MS = 30_000;
const OFFLINE_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 10_000;
const ENDPOINT = '/api/projects';

export interface UseFleetResult {
  projects: FleetProject[] | null;
  generatedAt: string | null;
  error: string | null;
  isOffline: boolean;
  isInitialLoading: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function useFleet(): UseFleetResult {
  const { data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = usePoll<FleetResponse>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as FleetResponse;
    },
    { intervalMs: BASE_INTERVAL_MS, offlineIntervalMs: OFFLINE_INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return {
    projects: data?.projects ?? null,
    generatedAt: data?.generatedAt ?? null,
    error,
    isOffline,
    isInitialLoading,
    lastUpdatedAt,
    refetch,
  };
}
