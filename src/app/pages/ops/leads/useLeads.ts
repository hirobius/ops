import { usePoll } from '../../../lib/usePoll';
import type { Lead, LeadsResponse } from './types';

/** Polls GET /api/leads; shared lifecycle (visibility pause, offline backoff) in usePoll. */

const BASE_INTERVAL_MS = 5_000;
const OFFLINE_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 6_000;
const ENDPOINT = '/api/leads';

export interface UseLeadsResult {
  leads: Lead[] | null;
  error: string | null;
  isOffline: boolean;
  isInitialLoading: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function useLeads(): UseLeadsResult {
  const { data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = usePoll<Lead[]>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as LeadsResponse;
      return body.leads ?? [];
    },
    { intervalMs: BASE_INTERVAL_MS, offlineIntervalMs: OFFLINE_INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return { leads: data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch };
}
