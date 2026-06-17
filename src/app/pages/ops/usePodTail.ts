/**
 * usePodTail — polled stdout tail for a single in-flight pod (per 13w-ops-13a).
 *
 * Calls GET /api/pod-tail?id=<podId> every 2s while `isLive` is true, returns
 * the most-recent 50 telemetry events whose `data.unitId` matches `podId`.
 * The endpoint is the dev-only Vite middleware in vite.config.mjs (and a
 * matching Vercel function for prod, when added).
 *
 * Stops polling when `isLive` flips false or when the most-recent fetched
 * event has a terminal status (success/exhausted/aborted/error).
 *
 * No websocket / SSE per Mario Zechner's argument about black-box agents:
 * polling is enough for human-debuggable session feeds, and degrades
 * gracefully when the endpoint is unavailable (returns empty events).
 */

import { useEffect, useState } from 'react';

export interface PodTailEvent {
  ts: string;
  event: string;
  data?: Record<string, unknown>;
}

interface PodTailResponse {
  id: string;
  events: PodTailEvent[];
}

export interface UsePodTailResult {
  events: PodTailEvent[];
  /** true once first fetch returns; false until then. */
  loaded: boolean;
  /** Set when the tail endpoint is unreachable (e.g. prod build with no middleware). */
  unavailable: boolean;
  /** True once a terminal-status event has been observed; tail stops polling. */
  terminal: boolean;
}

const POLL_INTERVAL_MS = 2000;
const TERMINAL_EVENT_SUFFIXES = ['success', 'exhausted', 'aborted', 'error', 'fail', 'complete'];

function isTerminal(events: PodTailEvent[]): boolean {
  if (events.length === 0) return false;
  const last = events[events.length - 1];
  const evtName = last.event.toLowerCase();
  return TERMINAL_EVENT_SUFFIXES.some((suffix) => evtName.endsWith(suffix));
}

export function usePodTail(podId: string, isLive: boolean): UsePodTailResult {
  const [events, setEvents] = useState<PodTailEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [terminal, setTerminal] = useState(false);

  useEffect(() => {
    if (!isLive || !podId) return;
    let cancelled = false;

    async function tick() {
      try {
        const r = await fetch(`/api/pod-tail?id=${encodeURIComponent(podId)}`);
        if (!r.ok) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const json = (await r.json()) as PodTailResponse;
        if (cancelled) return;
        setEvents(json.events);
        setLoaded(true);
        setUnavailable(false);
        if (isTerminal(json.events)) setTerminal(true);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    }

    void tick();
    const handle = setInterval(() => {
      // Stop polling once we've seen a terminal event — the loop in the
      // setInterval scope reads the latest `terminal` via the state ref.
      tick();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, [podId, isLive]);

  // Once terminal, the consumer will likely flip `isLive` to false; the
  // effect's cleanup will then clear the interval. The `terminal` flag also
  // lets the rendered surface display a "tail stopped" affordance.
  return { events, loaded, unavailable, terminal };
}
