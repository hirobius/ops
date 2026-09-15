# ServicesBar Process Info + Roadmap Watcher Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show PID + uptime inline in ServicesBar rows when a service is running (including externally-started processes), and remove the dead Roadmap Watcher service.

**Architecture:** The status API endpoint is enhanced to use `pgrep` + `ps` to detect processes started outside the service manager, returning `{ status, pid, startedAt }` per service. The React hook and row component consume the richer shape to render dynamic hint text. Roadmap Watcher is removed from all three layers (middleware, hook, component).

**Tech Stack:** Node.js (`pgrep`, `ps`, `execFileSync`), React, TypeScript

---

### Task 1: Remove Roadmap Watcher from all three layers

**Files:**

- Modify: `scripts/service-manager-middleware.mjs:19-32`
- Modify: `src/app/pages/ops/useServicesStatus.ts:3-13`
- Modify: `src/app/pages/ops/agentic-os/ServicesBar.tsx:7-11`

- [ ] **Step 1: Remove from middleware SERVICES map**

In `scripts/service-manager-middleware.mjs`, delete the `'roadmap-watcher'` entry:

```js
const SERVICES = {
  'hds-bridge': {
    label: 'HDS Bridge',
    args: ['--env-file=.env.local', 'scripts/hds-bridge.mjs'],
  },
  'discord-bot': {
    label: 'Discord Bot',
    args: ['--env-file=.env.local', 'scripts/discord-bot.mjs'],
  },
};
```

- [ ] **Step 2: Remove from hook type + array**

In `src/app/pages/ops/useServicesStatus.ts`, update the type and array:

```ts
export type ServiceName = 'hds-bridge' | 'discord-bot';
export type ServiceStatus = 'running' | 'stopped' | 'loading';

const SERVICE_NAMES: ServiceName[] = ['hds-bridge', 'discord-bot'];
```

- [ ] **Step 3: Remove from ServicesBar spec array**

In `src/app/pages/ops/agentic-os/ServicesBar.tsx`, update `SERVICE_SPECS`:

```ts
const SERVICE_SPECS: { id: ServiceName; label: string; hint: string }[] = [
  { id: 'hds-bridge', label: 'HDS Bridge', hint: 'Figma plugin · port 3005' },
  { id: 'discord-bot', label: 'Discord Bot', hint: 'Discord gateway · requires DISCORD_BOT_TOKEN' },
];
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add scripts/service-manager-middleware.mjs src/app/pages/ops/useServicesStatus.ts src/app/pages/ops/agentic-os/ServicesBar.tsx
git commit -m "chore(ops): remove dead roadmap-watcher service — TASKS.md gone, kanban replaced it"
```

---

### Task 2: Enhance middleware status endpoint with pgrep + ps detection

**Files:**

- Modify: `scripts/service-manager-middleware.mjs`

The status endpoint currently only reports processes the service manager spawned itself. This task makes it detect externally-started processes and return PID + startedAt for all running services.

- [ ] **Step 1: Add execFileSync import and psPattern to SERVICES**

Replace the top of `scripts/service-manager-middleware.mjs`:

```js
import { spawn, execFileSync } from 'node:child_process';
```

Add `psPattern` to each service in the SERVICES map:

```js
const SERVICES = {
  'hds-bridge': {
    label: 'HDS Bridge',
    args: ['--env-file=.env.local', 'scripts/hds-bridge.mjs'],
    psPattern: 'scripts/hds-bridge.mjs',
  },
  'discord-bot': {
    label: 'Discord Bot',
    args: ['--env-file=.env.local', 'scripts/discord-bot.mjs'],
    psPattern: 'scripts/discord-bot.mjs',
  },
};
```

- [ ] **Step 2: Add runningMeta map and startedAt tracking**

Below the existing `const running = new Map();` line, add:

```js
/** @type {Map<string, { startedAt: string }>} */
const runningMeta = new Map();
```

In the `start` action handler, after `running.set(name, proc)`, add:

```js
runningMeta.set(name, { startedAt: new Date().toISOString() });
proc.on('close', () => {
  running.delete(name);
  runningMeta.delete(name);
});
proc.on('error', () => {
  running.delete(name);
  runningMeta.delete(name);
});
```

Remove the old `proc.on('close', ...)` and `proc.on('error', ...)` lines that only called `running.delete(name)`.

- [ ] **Step 3: Add findProcess helper**

Add this function above the `createServiceManagerMiddleware` export:

```js
/**
 * Returns { pid, startedAt } for a process matching psPattern, or null.
 * Uses pgrep (finds PID) + ps etimes (elapsed seconds → startedAt ISO).
 */
function findProcess(psPattern) {
  try {
    const pgrepOut = execFileSync('pgrep', ['-f', psPattern], { encoding: 'utf8' }).trim();
    const pid = parseInt(pgrepOut.split('\n')[0], 10);
    if (!pid) return null;
    const etimesOut = execFileSync('ps', ['-p', String(pid), '-o', 'etimes='], {
      encoding: 'utf8',
    }).trim();
    const elapsedSeconds = parseInt(etimesOut, 10);
    const startedAt = new Date(Date.now() - elapsedSeconds * 1000).toISOString();
    return { pid, startedAt };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Update GET /status to return richer shape**

Replace the existing `GET /status` handler block:

```js
if (req.method === 'GET' && path === '/status') {
  const status = {};
  for (const [name, svc] of Object.entries(SERVICES)) {
    const proc = running.get(name);
    if (proc) {
      const meta = runningMeta.get(name);
      status[name] = { status: 'running', pid: proc.pid, startedAt: meta?.startedAt ?? null };
    } else {
      const found = findProcess(svc.psPattern);
      status[name] = found
        ? { status: 'running', pid: found.pid, startedAt: found.startedAt }
        : { status: 'stopped' };
    }
  }
  json(res, 200, status);
  return;
}
```

- [ ] **Step 5: Verify middleware has no syntax errors**

```bash
node --check scripts/service-manager-middleware.mjs
```

Expected: no output (clean parse).

- [ ] **Step 6: Commit**

```bash
git add scripts/service-manager-middleware.mjs
git commit -m "feat(ops): services status — pgrep detection + pid/startedAt in response"
```

---

### Task 3: Update hook and component to consume richer status shape

**Files:**

- Modify: `src/app/pages/ops/useServicesStatus.ts`
- Modify: `src/app/pages/ops/agentic-os/ServicesBar.tsx`

- [ ] **Step 1: Update useServicesStatus types and parsing**

Replace the entire contents of `src/app/pages/ops/useServicesStatus.ts`:

```ts
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
```

- [ ] **Step 2: Update ServicesBar to use ServiceState and show PID/uptime**

Replace the entire contents of `src/app/pages/ops/agentic-os/ServicesBar.tsx`:

```tsx
/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import hds from '../../../design-system/tokens';
import { useServicesStatus, type ServiceName, type ServiceState } from '../useServicesStatus';

const SERVICE_SPECS: { id: ServiceName; label: string; hint: string }[] = [
  { id: 'hds-bridge', label: 'HDS Bridge', hint: 'Figma plugin · port 3005' },
  { id: 'discord-bot', label: 'Discord Bot', hint: 'Discord gateway · requires DISCORD_BOT_TOKEN' },
];

async function callService(name: ServiceName, action: 'start' | 'stop'): Promise<void> {
  await fetch(`/api/services/${name}/${action}`, { method: 'POST' });
}

function formatUptime(startedAt: string): string {
  const elapsed = Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}m`;
  return `${Math.floor(elapsed / 3600)}h ${Math.floor((elapsed % 3600) / 60)}m`;
}

export function ServicesBar() {
  const states = useServicesStatus();
  const [inflight, setInflight] = useState<Partial<Record<ServiceName, boolean>>>({});

  const handleToggle = useCallback(
    async (id: ServiceName, current: ServiceState) => {
      if (inflight[id] || current.status === 'loading') return;
      const action = current.status === 'running' ? 'stop' : 'start';
      setInflight((prev) => ({ ...prev, [id]: true }));
      await callService(id, action);
      setTimeout(() => setInflight((prev) => ({ ...prev, [id]: false })), 3000);
    },
    [inflight],
  );

  return (
    <div style={s.root}>
      {SERVICE_SPECS.map((svc) => (
        <ServiceRow
          key={svc.id}
          spec={svc}
          state={states[svc.id]}
          inflight={!!inflight[svc.id]}
          onToggle={handleToggle}
        />
      ))}
    </div>
  );
}

interface RowProps {
  spec: { id: ServiceName; label: string; hint: string };
  state: ServiceState;
  inflight: boolean;
  onToggle: (id: ServiceName, state: ServiceState) => void;
}

function ServiceRow({ spec, state, inflight, onToggle }: RowProps) {
  // Re-render every 30s while running to keep uptime fresh
  const [, setTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (state.status === 'running') {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 30_000);
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [state.status]);

  const dot = dotStyle(state.status, inflight);
  const dynamicHint =
    state.status === 'running' && state.pid && state.startedAt
      ? `PID ${state.pid} · ${formatUptime(state.startedAt)}`
      : spec.hint;

  return (
    <div style={s.row}>
      <div style={s.identity}>
        <span style={{ ...s.dot, color: dot.color }} aria-hidden="true">
          {inflight ? '◐' : '●'}
        </span>
        <div style={s.text}>
          <span style={s.label}>{spec.label}</span>
          <span style={s.hint}>{dynamicHint}</span>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onToggle(spec.id, state)}
        disabled={inflight || state.status === 'loading'}
        aria-busy={inflight}
        className="hds-focus"
        style={{
          ...s.button,
          ...(state.status === 'running' && !inflight ? s.buttonStop : {}),
        }}
      >
        {inflight ? '…' : state.status === 'running' ? 'stop' : 'start'}
      </button>
    </div>
  );
}

function dotStyle(status: ServiceState['status'], inflight: boolean): { color: string } {
  if (inflight) return { color: 'var(--semantic-color-content-accent)' };
  if (status === 'running') return { color: 'var(--semantic-color-feedback-success)' };
  return { color: 'var(--semantic-color-content-disabled)' };
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px12,
    padding: `${hds.space.px8} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    minWidth: 0,
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    minWidth: 0,
    flex: 1,
  },
  dot: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    flexShrink: 0,
    lineHeight: 1,
  },
  text: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px2,
    minWidth: 0,
  },
  label: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  hint: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  button: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: '4px',
    padding: `${hds.space.px4} ${hds.space.px12}`,
    cursor: 'pointer',
    flexShrink: 0,
    minWidth: '52px',
    textAlign: 'center' as const,
  },
  buttonStop: {
    borderColor: 'var(--semantic-color-feedback-error)',
    color: 'var(--semantic-color-feedback-error)',
  },
} satisfies Record<string, CSSProperties>;
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Smoke-test in dev browser**

Start dev server if not running: `pnpm dev`

Open `/ops`, expand **Services**. Verify:

- Discord Bot row shows green dot + `PID 21906 · Xm` in the hint (exact elapsed time will vary)
- HDS Bridge row shows stopped state (grey dot, static hint) if not running
- Roadmap Watcher row is gone
- Stop button on Discord Bot row has red border

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/ops/useServicesStatus.ts src/app/pages/ops/agentic-os/ServicesBar.tsx
git commit -m "feat(ops): services bar — show PID + uptime inline, detect external processes"
```
