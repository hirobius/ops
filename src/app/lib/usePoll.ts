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
 *
 * **`intervalMs: 0` is manual mode**: fetch once on mount, refetch only when the
 * caller asks, and arm no timer ever. Added 2026-09-19 for cost, not taste — a
 * scheduled tick here is a serverless invocation that calls the GitHub API, and
 * a dashboard left open on a second monitor was billing for data nobody read. A
 * caller in manual mode owns surfacing `lastUpdatedAt` and a refresh control,
 * because nothing else will make the data current.
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

  // Latest fetcher without re-subscribing the effect every render. Written
  // in an effect (not render body) — refs must only be read/written outside
  // render; this still runs after every commit, before any timer/handler
  // that reads fetcherRef.current, so behavior is unchanged.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

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
    // Manual mode: fetch on mount and on `refetch`, and schedule NOTHING.
    // Guarding here rather than at the call sites is deliberate — every path
    // that could arm a timer (mount, tab re-show, post-fetch reschedule) goes
    // through this function, so one check closes all of them. Note a falsy
    // interval must not fall through to `setTimeout(..., 0)`: that is a hot
    // loop, not "no polling".
    if (intervalMs <= 0) return;
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
        // In manual mode a tab re-show is not a reason to spend a request —
        // the operator asks for fresh data with the refresh control. Without
        // this, alt-tabbing back would silently restore per-switch polling.
        if (intervalMs <= 0) return;
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
  }, [fetchOnce, scheduleNext, intervalMs]);

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
