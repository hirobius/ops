import { usePoll } from '../../../lib/usePoll';
import type { Issue, IssuesResponse } from './types';

/** Polls GET /api/issues (all open GitHub issues across accessible repos). */

const BASE_INTERVAL_MS = 30_000; // GitHub data changes slowly; go easy on rate limits
const OFFLINE_INTERVAL_MS = 60_000;
const REQUEST_TIMEOUT_MS = 12_000;
const ENDPOINT = '/api/issues';

export interface UseIssuesResult {
  issues: Issue[] | null;
  error: string | null;
  isOffline: boolean;
  isInitialLoading: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function useIssues(): UseIssuesResult {
  const { data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = usePoll<Issue[]>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as IssuesResponse;
      return body.issues ?? [];
    },
    {
      intervalMs: BASE_INTERVAL_MS,
      offlineIntervalMs: OFFLINE_INTERVAL_MS,
      requestTimeoutMs: REQUEST_TIMEOUT_MS,
    },
  );
  return { issues: data, error, isOffline, isInitialLoading, lastUpdatedAt, refetch };
}
