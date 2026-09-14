/**
 * src/app/pages/ops/useServicesStatus — polls local-dev tool status for the
 * `/ops` agentic-os ServicesBar (hds-bridge, discord-bot).
 *
 * `GET /api/services/status` is served ONLY by the dev-only Connect
 * middleware `scripts/service-manager-middleware.mjs`, mounted in
 * `vite.config.mjs`; there is no production `api/services/status.ts`. In
 * prod every poll 404s and is swallowed by the empty `catch` below — that's
 * deliberate (keep last-known state, no error UI for a surface that isn't
 * meant to exist outside `pnpm dev`), not an unhandled error case.
 */
import { useState, useEffect } from 'react';

export type ServiceName = 'hds-bridge' | 'discord-bot';
export type ServiceStatus = 'running' | 'stopped' | 'loading';

export interface ServiceState {
  status: ServiceStatus;
  pid?: number;
  startedAt?: string; // ISO string
}

const SERVICE_NAMES: ServiceName[] = ['hds-bridge', 'discord-bot'];

function initialState(): Record<ServiceName, ServiceState> {
  return Object.fromEntries(
    SERVICE_NAMES.map((n) => [n, { status: 'loading' as ServiceStatus }]),
  ) as Record<ServiceName, ServiceState>;
}

export function useServicesStatus(): Record<ServiceName, ServiceState> {
  const [state, setState] = useState<Record<ServiceName, ServiceState>>(initialState);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch('/api/services/status');
        if (!res.ok || !mounted) return;
        const data = (await res.json()) as Record<
          string,
          { status: string; pid?: number; startedAt?: string }
        >;
        setState((prev) => {
          const next = { ...prev };
          for (const name of SERVICE_NAMES) {
            const val = data[name];
            if (!val) continue;
            if (val.status === 'running') {
              next[name] = { status: 'running', pid: val.pid, startedAt: val.startedAt };
            } else if (val.status === 'stopped') {
              next[name] = { status: 'stopped' };
            }
          }
          return next;
        });
      } catch {
        // keep last known state on network error
      }
    }

    poll();
    const id = setInterval(poll, 2000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  return state;
}
