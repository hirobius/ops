import { usePoll } from '../../../lib/usePoll';
import type { DigestItem, DigestResponse } from './types';

/** Polls GET /api/digest; shared lifecycle (visibility pause, offline backoff) in usePoll. */

const BASE_INTERVAL_MS = 8_000;
const OFFLINE_INTERVAL_MS = 30_000;
const REQUEST_TIMEOUT_MS = 8_000;
const ENDPOINT = '/api/digest';

export interface UseDigestItemsResult {
  items: DigestItem[] | null;
  error: string | null;
  isOffline: boolean;
  isInitialLoading: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function useDigestItems(): UseDigestItemsResult {
  const { data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = usePoll<DigestItem[]>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as DigestResponse;
      return body.items ?? [];
    },
    { intervalMs: BASE_INTERVAL_MS, offlineIntervalMs: OFFLINE_INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return { items: data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch };
}
