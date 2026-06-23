/* hds-bypass: ops-internal widget. Raw grid layouts intentional for dense data tables. */
/* eslint-disable no-restricted-syntax -- ops-internal; grid layouts intentional for responsive data tables */

/**
 * CostBurnWidget — per-client, per-phase, per-agent cost burn rollups
 * with tier-distribution donut and time-windowed stat tiles.
 *
 * @category Internal
 * @tier utility
 *
 * Reads at build time:
 *  - docs/ai/routing-log.jsonl   (auto-assigner audit trail)
 *  - clients/*\/tasks.json       (per-task costSpent / costCeiling)
 *
 * SVG donut uses simple arc math — no chart library.
 */

/* hds-bypass: ops-internal widget. Inline styles intentional for data-driven SVG dimensions. */

import React, { useMemo, useState } from 'react';
import { Card } from '@hirobius/design-system';
import { Stat } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { useIsMobile } from '../../hooks/useIsMobile';
import hds from '@hirobius/design-system/tokens';

// ── Raw data imports ───────────────────────────────────────────────────────────

// routing-log.jsonl holds per-client task PII and is gitignored; this glob tolerates
// its absence (yields '' in clean/prod builds) instead of a hard import failure.
const _routingLogGlob = import.meta.glob<string>('../../../../docs/ai/routing-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const routingLogRaw = (Object.values(_routingLogGlob)[0] as string | undefined) ?? '';

const _tasksGlob = import.meta.glob<{ default: unknown }>('../../../../clients/*/tasks.json', {
  eager: true,
});

// ── Types ──────────────────────────────────────────────────────────────────────

interface RoutingEntry {
  assigner?: string;
  gate?: string;
  client?: string;
  taskId?: string;
  phaseId?: string;
  model?: string;
  tier?: string;
  projectedUsd?: number;
  spent?: number;
  projected?: number;
  at?: string;
}

interface Task {
  id?: string;
  costSpent?: number;
  costCeiling?: number;
  status?: string;
}

interface Swimlane {
  tasks?: Task[];
}

interface Phase {
  id?: string;
  name?: string;
  swimlanes?: Swimlane[];
}

interface TasksFile {
  phases?: Phase[];
}

// ── Parse routing log ──────────────────────────────────────────────────────────

function parseRoutingLog(): RoutingEntry[] {
  return routingLogRaw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as RoutingEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is RoutingEntry => e !== null);
}

// ── Parse tasks glob ───────────────────────────────────────────────────────────

function slugOf(path: string): string {
  return path.match(/clients\/([^/]+)\//)?.[1] ?? '';
}

interface ClientTaskData {
  slug: string;
  phases: Phase[];
}

function parseClientTasks(): ClientTaskData[] {
  return Object.entries(_tasksGlob).map(([path, mod]) => {
    const slug = slugOf(path);
    const raw = mod as Record<string, unknown>;
    const file = raw['default'] as TasksFile | undefined;
    return { slug, phases: file?.phases ?? [] };
  });
}

// ── Time window helpers ────────────────────────────────────────────────────────

type Window = 'today' | 'week' | 'lifetime';

function windowStart(w: Window): Date {
  const now = new Date();
  if (w === 'lifetime') return new Date(0);
  if (w === 'today') {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  // week: since last Monday 00:00
  const d = new Date(now);
  const day = d.getDay(); // 0=Sun..6=Sat
  const diffToMon = (day + 6) % 7; // days since Monday
  d.setDate(d.getDate() - diffToMon);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ── Aggregation ────────────────────────────────────────────────────────────────

interface CostRollups {
  totalByWindow: Record<Window, number>;
  byClient: Record<string, number>;
  byPhase: Record<string, number>;
  byModel: Record<string, number>;
  byTier: Record<string, number>;
}

function computeRollups(entries: RoutingEntry[], clientTasks: ClientTaskData[]): CostRollups {
  const rollups: CostRollups = {
    totalByWindow: { today: 0, week: 0, lifetime: 0 },
    byClient: {},
    byPhase: {},
    byModel: {},
    byTier: {},
  };

  const starts: Record<Window, Date> = {
    today: windowStart('today'),
    week: windowStart('week'),
    lifetime: windowStart('lifetime'),
  };

  // Only assigner entries carry cost — skip gate entries (they have `gate` key)
  const assignerEntries = entries.filter((e) => e.assigner && !e.gate);

  for (const e of assignerEntries) {
    const cost = e.projectedUsd ?? 0;
    const at = e.at ? new Date(e.at) : null;

    // Time windows
    const windows: Window[] = ['today', 'week', 'lifetime'];
    for (const w of windows) {
      if (!at || at >= starts[w]) {
        rollups.totalByWindow[w] += cost;
      }
    }

    // Per client
    if (e.client) {
      rollups.byClient[e.client] = (rollups.byClient[e.client] ?? 0) + cost;
    }

    // Per phase
    if (e.phaseId) {
      rollups.byPhase[e.phaseId] = (rollups.byPhase[e.phaseId] ?? 0) + cost;
    }

    // Per model
    if (e.model) {
      rollups.byModel[e.model] = (rollups.byModel[e.model] ?? 0) + cost;
    }

    // Per tier
    if (e.tier) {
      rollups.byTier[e.tier] = (rollups.byTier[e.tier] ?? 0) + cost;
    }
  }

  // Also add costSpent from tasks.json where tasks record it
  for (const { slug, phases } of clientTasks) {
    for (const phase of phases) {
      const allTasks = (phase.swimlanes ?? []).flatMap((sw) => sw.tasks ?? []);
      for (const task of allTasks) {
        if (task.costSpent && task.costSpent > 0) {
          rollups.byClient[slug] = (rollups.byClient[slug] ?? 0) + task.costSpent;
          if (phase.id) {
            rollups.byPhase[phase.id] = (rollups.byPhase[phase.id] ?? 0) + task.costSpent;
          }
        }
      }
    }
  }

  return rollups;
}

// ── Format helpers ─────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.001) return '<$0.001';
  return `$${n.toFixed(4).replace(/\.?0+$/, '')}`;
}

// ── Tier color palette ─────────────────────────────────────────────────────────

const TIER_COLORS: Record<string, string> = {
  'open-local': 'var(--semantic-color-feedback-success)',
  anthropic: 'var(--semantic-color-feedback-warning)',
  default: 'var(--semantic-color-border-default)',
};

function tierColor(tier: string): string {
  return TIER_COLORS[tier] ?? TIER_COLORS['default'];
}

// ── Donut SVG ──────────────────────────────────────────────────────────────────

interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

interface DonutProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
}

function polarToXY(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const sweep = endDeg - startDeg;
  if (Math.abs(sweep) >= 360) {
    const top = polarToXY(cx, cy, r, startDeg);
    const bot = polarToXY(cx, cy, r, startDeg + 180);
    return `M ${top.x} ${top.y} A ${r} ${r} 0 1 1 ${bot.x} ${bot.y} A ${r} ${r} 0 1 1 ${top.x} ${top.y} Z`;
  }
  const start = polarToXY(cx, cy, r, startDeg);
  const end = polarToXY(cx, cy, r, endDeg);
  const large = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${large} 1 ${end.x} ${end.y}`;
}

function Donut({ segments, size = 120, thickness = 22 }: DonutProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - thickness) / 2;

  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <svg width={size} height={size} aria-label="No cost data" role="img">
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke="var(--semantic-color-border-default)"
          strokeWidth={thickness}
        />
        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fontSize={10}
          fill="var(--semantic-color-content-secondary)"
        >
          $0
        </text>
      </svg>
    );
  }

  const arcs = segments.reduce<
    Array<(typeof segments)[0] & { pct: number; start: number; end: number }>
  >((acc, seg) => {
    const pct = seg.value / total;
    const start = acc.length > 0 ? acc[acc.length - 1].end : 0;
    const end = start + pct * 360;
    acc.push({ ...seg, pct, start, end });
    return acc;
  }, []);

  return (
    <svg width={size} height={size} aria-label="Tier cost distribution donut chart" role="img">
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={arcPath(cx, cy, r, arc.start, arc.end)}
          fill="none"
          stroke={arc.color}
          strokeWidth={thickness}
          strokeLinecap="butt"
        >
          <title>
            {arc.label}: {fmtUsd(arc.value)} ({(arc.pct * 100).toFixed(1)}%)
          </title>
        </path>
      ))}
    </svg>
  );
}

// ── Client bar row ─────────────────────────────────────────────────────────────

interface ClientBarProps {
  slug: string;
  cost: number;
  maxCost: number;
}

function ClientBar({ slug, cost, maxCost }: ClientBarProps) {
  const pct = maxCost > 0 ? (cost / maxCost) * 100 : 0;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: hds.space.px8,
        fontSize: hds.fontSize.xs,
      }}
    >
      <span
        style={{
          width: 140,
          color: 'var(--semantic-color-content-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {slug}
      </span>
      <div
        style={{
          flex: 1,
          height: hds.space.px8, // audit-ok: progress bar track height — thin bar, not a layout dimension
          background: 'var(--semantic-color-border-default)',
          borderRadius: hds.borderRadius[4],
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--semantic-color-content-accent)',
            borderRadius: hds.borderRadius[4],
            transition: `width ${hds.duration.normal} ease-out`,
          }}
        />
      </div>
      <span
        style={{
          width: 64,
          textAlign: 'right',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--semantic-color-content-primary)',
        }}
      >
        {fmtUsd(cost)}
      </span>
    </div>
  );
}

// ── Phase cost table ───────────────────────────────────────────────────────────

function PhaseTable({ byPhase }: { byPhase: Record<string, number> }) {
  const rows = Object.entries(byPhase).sort(([, a], [, b]) => b - a);
  if (rows.length === 0) {
    return (
      <p
        style={{
          fontSize: hds.fontSize.xs,
          color: 'var(--semantic-color-content-secondary)',
          margin: 0,
        }}
      >
        No phase data
      </p>
    );
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: hds.fontSize.xs }}>
      <thead>
        <tr>
          <th
            style={{
              ...hds.typeStyles.eyebrow,
              textAlign: 'left',
              padding: `${hds.space.px4} ${hds.space.px8} ${hds.space.px4} 0`,
              color: 'var(--semantic-color-content-secondary)',
            }}
          >
            Phase
          </th>
          <th
            style={{
              ...hds.typeStyles.eyebrow,
              textAlign: 'right',
              padding: `${hds.space.px4} 0`,
              color: 'var(--semantic-color-content-secondary)',
            }}
          >
            Cost
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([phase, cost]) => (
          <tr key={phase} style={{ borderTop: '1px solid var(--semantic-color-border-default)' }}>
            <td
              style={{
                padding: `${hds.space.px4} ${hds.space.px8} ${hds.space.px4} 0`,
                color: 'var(--semantic-color-content-primary)',
              }}
            >
              {phase}
            </td>
            <td
              style={{
                padding: `${hds.space.px4} 0`,
                textAlign: 'right',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {fmtUsd(cost)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Main widget ────────────────────────────────────────────────────────────────

const WINDOWS: { key: Window; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'lifetime', label: 'Lifetime' },
];

/** Cost burn widget — per-client/phase/agent rollups + tier-distribution donut. */
export default function CostBurnWidget() {
  const [activeWindow, setActiveWindow] = useState<Window>('week');
  const isMobile = useIsMobile();

  const { rollups, eventCount } = useMemo(() => {
    const entries = parseRoutingLog();
    const clientTasks = parseClientTasks();
    const r = computeRollups(entries, clientTasks);
    const count = entries.filter((e) => e.assigner && !e.gate).length;
    return { rollups: r, eventCount: count };
  }, []);

  const clientRows = Object.entries(rollups.byClient)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6);
  const maxClientCost = clientRows[0]?.[1] ?? 0;

  const tierSegments = Object.entries(rollups.byTier).map(([tier, value]) => ({
    label: tier,
    value,
    color: tierColor(tier),
  }));

  const modelRows = Object.entries(rollups.byModel).sort(([, a], [, b]) => b - a);

  return (
    <Stack direction="column" gap="normal">
      {/* Time-window stat tiles */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)',
          gap: hds.space.px16,
        }}
      >
        {WINDOWS.map((w) => (
          <button
            key={w.key}
            onClick={() => setActiveWindow(w.key)}
            className="hds-focus"
            // inline-ok: border + background are both conditional on activeWindow selection state
            style={{
              all: 'unset',
              cursor: 'pointer',
              display: 'block',
              padding: hds.space.px16,
              borderRadius: hds.borderRadius[8],
              border: `1px solid ${activeWindow === w.key ? 'var(--semantic-color-border-accent)' : 'var(--semantic-color-border-default)'}`,
              background:
                activeWindow === w.key
                  ? 'var(--semantic-color-surface-raised, rgba(0,0,0,0.04))'
                  : 'transparent',
              transition: `border-color ${hds.duration.fast} ease`,
            }}
            aria-pressed={activeWindow === w.key}
          >
            <Stat
              label={w.label}
              value={fmtUsd(rollups.totalByWindow[w.key])}
              sub={`${eventCount} routing event${eventCount !== 1 ? 's' : ''}`}
            />
          </button>
        ))}
      </div>

      {/* Client bars + tier donut */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr auto',
          gap: hds.space.px24,
          alignItems: 'start',
        }}
      >
        <Card padding="px16" gap="tight">
          <Card.Header>
            <Card.Title>Cost by client</Card.Title>
          </Card.Header>
          <Card.Body>
            {clientRows.length === 0 ? (
              <p
                style={{
                  fontSize: hds.fontSize.xs,
                  color: 'var(--semantic-color-content-secondary)',
                  margin: 0,
                }}
              >
                No client data yet
              </p>
            ) : (
              <Stack direction="column" gap="xs">
                {clientRows.map(([slug, cost]) => (
                  <ClientBar key={slug} slug={slug} cost={cost} maxCost={maxClientCost} />
                ))}
              </Stack>
            )}
          </Card.Body>
        </Card>

        <Card padding="px16" gap="tight">
          <Card.Header>
            <Card.Title>Tier distribution</Card.Title>
          </Card.Header>
          <Card.Body>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: hds.space.px12,
              }}
            >
              <Donut segments={tierSegments} size={120} thickness={24} />
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: hds.space.px4,
                  width: '100%',
                }}
              >
                {tierSegments.length === 0 ? (
                  <p
                    style={{
                      fontSize: hds.fontSize['2xs'],
                      color: 'var(--semantic-color-content-secondary)',
                      margin: 0,
                    }}
                  >
                    No tier data
                  </p>
                ) : (
                  tierSegments.map((seg) => (
                    <div
                      key={seg.label}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: hds.space.px6,
                        fontSize: hds.fontSize['2xs'],
                      }}
                    >
                      <div
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: seg.color,
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          flex: 1,
                          color: 'var(--semantic-color-content-secondary)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {seg.label}
                      </span>
                      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {fmtUsd(seg.value)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>

      {/* Phase cost table + model breakdown */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
          gap: hds.space.px16,
        }}
      >
        <Card padding="px16" gap="tight">
          <Card.Header>
            <Card.Title>Phase totals</Card.Title>
          </Card.Header>
          <Card.Body>
            <PhaseTable byPhase={rollups.byPhase} />
          </Card.Body>
        </Card>

        <Card padding="px16" gap="tight">
          <Card.Header>
            <Card.Title>By model</Card.Title>
          </Card.Header>
          <Card.Body>
            {modelRows.length === 0 ? (
              <p
                style={{
                  fontSize: hds.fontSize.xs,
                  color: 'var(--semantic-color-content-secondary)',
                  margin: 0,
                }}
              >
                No model data
              </p>
            ) : (
              <table
                style={{ width: '100%', borderCollapse: 'collapse', fontSize: hds.fontSize.xs }}
              >
                <thead>
                  <tr>
                    <th
                      style={{
                        ...hds.typeStyles.eyebrow,
                        textAlign: 'left',
                        padding: `${hds.space.px4} ${hds.space.px8} ${hds.space.px4} 0`,
                        color: 'var(--semantic-color-content-secondary)',
                      }}
                    >
                      Model
                    </th>
                    <th
                      style={{
                        ...hds.typeStyles.eyebrow,
                        textAlign: 'right',
                        padding: `${hds.space.px4} 0`,
                        color: 'var(--semantic-color-content-secondary)',
                      }}
                    >
                      Cost
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {modelRows.map(([model, cost]) => (
                    <tr
                      key={model}
                      style={{ borderTop: '1px solid var(--semantic-color-border-default)' }}
                    >
                      <td
                        style={{
                          padding: `${hds.space.px4} ${hds.space.px8} ${hds.space.px4} 0`,
                          color: 'var(--semantic-color-content-primary)',
                          fontFamily: hds.monoFamily,
                          fontSize: hds.fontSize['2xs'],
                        }}
                      >
                        {model}
                      </td>
                      <td
                        style={{
                          padding: `${hds.space.px4} 0`,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                        }}
                      >
                        {fmtUsd(cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card.Body>
        </Card>
      </div>
    </Stack>
  );
}
