/**
 * ServicesBar — start/stop toggles for the local-dev daemons on /ops
 * (hds-bridge, discord-bot). Rows are HDS Stacks closed by a Divider. The
 * status glyph, the label/hint (inherited body font, 1.5 line-height) and the
 * compact mono toggle keep local styles: StatusDot, <Text variant> and Button
 * would each change the rendered pixels (ops#425).
 */

import { useState, useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { Divider, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { useServicesStatus, type ServiceName, type ServiceState } from '../useServicesStatus';
import { opsApi } from '../../../lib/opsApi';

const SERVICE_SPECS: { id: ServiceName; label: string; hint: string }[] = [
  { id: 'hds-bridge', label: 'HDS Bridge', hint: 'Figma plugin · port 3005' },
  { id: 'discord-bot', label: 'Discord Bot', hint: 'Discord gateway · requires DISCORD_BOT_TOKEN' },
];

async function callService(name: ServiceName, action: 'start' | 'stop'): Promise<void> {
  await opsApi.post(`/api/services/${name}/${action}`);
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
    <Stack direction="column" style={s.root}>
      {SERVICE_SPECS.map((svc) => (
        <ServiceRow
          key={svc.id}
          spec={svc}
          state={states[svc.id]}
          inflight={!!inflight[svc.id]}
          onToggle={handleToggle}
        />
      ))}
    </Stack>
  );
}

interface RowProps {
  spec: { id: ServiceName; label: string; hint: string };
  state: ServiceState;
  inflight: boolean;
  onToggle: (id: ServiceName, state: ServiceState) => void;
}

function ServiceRow({ spec, state, inflight, onToggle }: RowProps) {
  // Tick every 30s while running to keep uptime display fresh
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
    <>
      <Stack direction="row" align="center" justify="space-between" gap="px12" style={s.row}>
        <Stack direction="row" align="center" gap="px8" style={s.identity}>
          <span style={{ ...s.dot, color: dot.color }} aria-hidden="true">
            {inflight ? '◐' : '●'}
          </span>
          <Stack direction="column" gap="px2" style={s.text}>
            <span style={s.label}>{spec.label}</span>
            <span style={s.hint}>{dynamicHint}</span>
          </Stack>
        </Stack>
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
      </Stack>
      <Divider />
    </>
  );
}

function dotStyle(status: ServiceState['status'], inflight: boolean): { color: string } {
  if (inflight) return { color: 'var(--semantic-color-content-accent)' };
  if (status === 'running') return { color: 'var(--semantic-color-feedback-success)' };
  return { color: 'var(--semantic-color-content-disabled)' };
}

const s = {
  root: { gap: 0 },
  row: {
    padding: `${hds.space.px8} 0`,
    minWidth: 0,
  },
  identity: {
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
    borderRadius: hds.borderRadius.sm,
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
