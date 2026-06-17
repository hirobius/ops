/* eslint-disable react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect to hydrate threads from API */
/* eslint-disable react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management */
import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Polls /api/threads while the tab is visible. Silent on errors — we
 * keep last-good `data` and surface `error` for debugging without
 * triggering an offline banner. Threads are auxiliary signal; the page
 * shouldn't go red just because the filesystem scan hiccupped.
 */
export function useOpenThreads(): UseOpenThreadsResult {
  const [data, setData] = useState<ThreadsPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const payload: ThreadsPayload = await res.json();
      if (!mountedRef.current) return;
      setData(payload);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      clearTimeout(abortTimer);
      inFlightRef.current = false;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (document.visibilityState !== 'visible') return;
    timerRef.current = setTimeout(() => {
      void fetchOnce().finally(scheduleNext);
    }, INTERVAL_MS);
  }, [fetchOnce]);

  useEffect(() => {
    mountedRef.current = true;
    void fetchOnce().finally(scheduleNext);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchOnce().finally(scheduleNext);
      } else if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchOnce, scheduleNext]);

  const refetch = useCallback(() => {
    void fetchOnce().finally(scheduleNext);
  }, [fetchOnce, scheduleNext]);

  return { data, error, refetch };
}
