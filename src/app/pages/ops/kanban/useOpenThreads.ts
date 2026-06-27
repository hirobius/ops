import { usePoll } from '../../../lib/usePoll';
import type { ThreadsPayload } from './threads-types';

const INTERVAL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 4_000;
const ENDPOINT = '/api/threads';

export interface UseOpenThreadsResult {
  data: ThreadsPayload | null;
  error: string | null;
  refetch: () => void;
}

/**
 * Polls /api/threads while the tab is visible. Silent on errors — we keep
 * last-good `data` and surface `error` for debugging without triggering an
 * offline banner (no `offlineIntervalMs`). Threads are auxiliary signal; the
 * page shouldn't go red just because the filesystem scan hiccupped.
 */
export function useOpenThreads(): UseOpenThreadsResult {
  const { data, error, refetch } = usePoll<ThreadsPayload>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ThreadsPayload;
    },
    { intervalMs: INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return { data, error, refetch };
}
