/**
 * src/app/pages/ops/useServicesStatus.ts — polls local dev-tooling process
 * status (HDS Bridge, Discord bot) for the ServicesBar start/stop widget.
 *
 * `/api/services/status` is served ONLY by the Vite dev server
 * (`scripts/service-manager-middleware.mjs`) — there is no matching
 * `api/services/status.ts` Vercel function. In production every poll 404s;
 * the catch block below swallows that and keeps the last known state
 * (`loading` forever, since it never got a first success), which is the
 * intended behavior — ServicesBar is dev-only chrome, not a prod feature,
 * and this hook must fail silent rather than surface a permanent error.
 *
 * `pid`/`startedAt` come from the middleware shelling out to `pgrep`/`ps`,
 * so they reflect the real OS process — including one started outside the
 * service manager (see `docs/superpowers/plans/2026-05-07-services-bar-process-info.md`).
 */
import { useState, useEffect } from 'react';

export type ServiceName   = 'hds-bridge' | 'discord-bot';
export type ServiceStatus = 'running' | 'stopped' | 'loading';

export interface ServiceState {
  status:     ServiceStatus;
  pid?:       number;
  startedAt?: string; // ISO string
}

const SERVICE_NAMES: ServiceName[] = ['hds-bridge', 'discord-bot'];

function initialState(): Record<ServiceName, ServiceState> {
  return Object.fromEntries(
    SERVICE_NAMES.map((n) => [n, { status: 'loading' as ServiceStatus }]),
  ) as Record<ServiceName, ServiceState>;
}

/**
 * Polls `/api/services/status` every 2s and returns the latest known state
 * per service. Network/404 errors are swallowed (see module doc) — the
 * hook never throws and never surfaces an error state to the caller.
 */
export function useServicesStatus(): Record<ServiceName, ServiceState> {
  const [state, setState] = useState<Record<ServiceName, ServiceState>>(initialState);

  useEffect(() => {
    let mounted = true;

    async function poll() {
      try {
        const res = await fetch('/api/services/status');
        if (!res.ok || !mounted) return;
        const data = (await res.json()) as Record<string, { status: string; pid?: number; startedAt?: string }>;
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
