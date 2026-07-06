/* eslint-disable react-hooks/set-state-in-effect -- polling primitive intentionally hydrates state from the fetcher in an effect */
/* eslint-disable react-hooks/immutability -- scheduleNext ref pattern + latest-fetcher ref are intentional for timer management */
import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * usePoll — the shared polling lifecycle behind the /ops dashboard's data hooks.
 *
 * One in-flight request at a time; polls while the tab is visible; pauses when
 * hidden and refreshes on re-show; cleans up its timer on unmount. If
 * `offlineIntervalMs` is set, it counts consecutive failures and, past
 * `failureThreshold`, backs off to that slower interval and flips `isOffline`
 * (reset on the next success). Omit `offlineIntervalMs` for the "stay silent,
 * keep polling at the base interval" behavior.
 *
 * Pass a `fetcher` that performs the request (using the provided AbortSignal) and
 * returns the already-extracted data — so each call site is one declaration, not
 * a copy of the whole timer/visibility/abort dance.
 */
export interface UsePollOptions {
  intervalMs: number;
  /** When set, enables failure-counting + backoff to this interval + isOffline. */
  offlineIntervalMs?: number;
  /** Consecutive failures before going offline (default 3). */
  failureThreshold?: number;
  /** Abort the request after this long (default 8000 ms). */
  requestTimeoutMs?: number;
}

export interface UsePollResult<T> {
  data: T | null;
  error: string | null;
  isOffline: boolean;
  isInitialLoading: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
}

export function usePoll<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  options: UsePollOptions,
): UsePollResult<T> {
  const { intervalMs, offlineIntervalMs, failureThreshold = 3, requestTimeoutMs = 8_000 } = options;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const failureCountRef = useRef(0);
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  // Latest fetcher without re-subscribing the effect every render.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const fetchOnce = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
      const result = await fetcherRef.current(controller.signal);
      if (!mountedRef.current) return;
      setData(result);
      setError(null);
      setIsOffline(false);
      setLastUpdatedAt(Date.now());
      failureCountRef.current = 0;
    } catch (err) {
      if (!mountedRef.current) return;
      failureCountRef.current += 1;
      setError(err instanceof Error ? err.message : String(err));
      if (offlineIntervalMs !== undefined && failureCountRef.current >= failureThreshold) {
        setIsOffline(true);
      }
    } finally {
      clearTimeout(abortTimer);
      inFlightRef.current = false;
    }
  }, [offlineIntervalMs, failureThreshold, requestTimeoutMs]);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (document.visibilityState !== 'visible') return;
    const delay = isOffline && offlineIntervalMs !== undefined ? offlineIntervalMs : intervalMs;
    timerRef.current = setTimeout(() => {
      void fetchOnce().finally(scheduleNext);
    }, delay);
  }, [fetchOnce, isOffline, intervalMs, offlineIntervalMs]);

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
    data,
    error,
    isOffline,
    isInitialLoading: data === null && !isOffline,
    lastUpdatedAt,
    refetch,
  };
}
