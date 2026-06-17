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
