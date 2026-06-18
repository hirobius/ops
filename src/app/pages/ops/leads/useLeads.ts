/* eslint-disable react-hooks/set-state-in-effect -- polling hook intentionally hydrates state from the API in an effect */
/* eslint-disable react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lead, LeadsResponse } from './types';

/**
 * Polls GET /api/leads and exposes the leads list to the board.
 *
 * Mirrors the lifecycle of useKanbanBoard: poll every BASE_INTERVAL_MS while the
 * tab is visible, pause when hidden, back off + flip `isOffline` after three
 * consecutive failures, reset on the first success. One in-flight request at a
 * time. Production reads come from Supabase via the serverless function; dev from
 * the Vite middleware — both behind the same /api/leads contract.
 */

const BASE_INTERVAL_MS = 5_000;
const OFFLINE_INTERVAL_MS = 30_000;
const FAILURE_THRESHOLD = 3;
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
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const failureCountRef = useRef(0);
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
      const data = (await res.json()) as LeadsResponse;
      if (!mountedRef.current) return;
      setLeads(data.leads ?? []);
      setError(null);
      setIsOffline(false);
      setLastUpdatedAt(Date.now());
      failureCountRef.current = 0;
    } catch (err) {
      if (!mountedRef.current) return;
      failureCountRef.current += 1;
      setError(err instanceof Error ? err.message : String(err));
      if (failureCountRef.current >= FAILURE_THRESHOLD) {
        setIsOffline(true);
      }
    } finally {
      clearTimeout(abortTimer);
      inFlightRef.current = false;
    }
  }, []);

  const scheduleNext = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (document.visibilityState !== 'visible') return;
    const delay = isOffline ? OFFLINE_INTERVAL_MS : BASE_INTERVAL_MS;
    timerRef.current = setTimeout(() => {
      void fetchOnce().finally(scheduleNext);
    }, delay);
  }, [fetchOnce, isOffline]);

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
    leads,
    error,
    isOffline,
    isInitialLoading: leads === null && !isOffline,
    lastUpdatedAt,
    refetch,
  };
}
