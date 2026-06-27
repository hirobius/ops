import { usePoll } from '../../../lib/usePoll';
import type { ProposedUnitsPayload } from './threads-types';

const INTERVAL_MS = 60_000; // proposed-units.jsonl mutates slowly
const REQUEST_TIMEOUT_MS = 4_000;
const ENDPOINT = '/api/proposed-units';

export interface UseProposedUnitsResult {
  data: ProposedUnitsPayload | null;
  error: string | null;
  refetch: () => void;
}

/**
 * Polls /api/proposed-units. Same lifecycle as useOpenThreads but at a slower
 * cadence — agent proposals trickle in, not stream. Silent on errors.
 */
export function useProposedUnits(): UseProposedUnitsResult {
  const { data, error, refetch } = usePoll<ProposedUnitsPayload>(
    async (signal) => {
      const res = await fetch(ENDPOINT, { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as ProposedUnitsPayload;
    },
    { intervalMs: INTERVAL_MS, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  return { data, error, refetch };
}
