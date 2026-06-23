/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

/**
 * BriefingPage — focused /ops index. The "what changed since you slept" surface.
 *
 * Five blocks, top-down:
 *  - Stale claims     — orchestration units claimed > STALE_CLAIM_HOURS ago.
 *  - Today's blockers — clients/<slug>/checklist.json items where status === 'blocked'.
 *  - Top-3 burning    — highest-priority approved units, dependencies satisfied.
 *  - Risk Watch       — DPA / Stripe / SOW status from docs/business/biz-ops.json.
 *  - Today's cost     — sum of routing-log.jsonl entries where assigner === 'auto-assigner-v1'.
 *
 * The longer client/prospects/services workspace surface is being moved to
 * /ops/clients in unit 13w-ops-6.
 *
 * @category Internal
 * @tier utility
 */

import React from 'react';
import type { CSSProperties } from 'react';

import { Page } from '@hirobius/design-system';
import { Stack } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import { Stat } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import legacyTaskArchive from '../../../../docs/ai/_archive/legacy-task-systems-2026-05-11.json';
const orchestration = legacyTaskArchive.sources.orchestration;
import bizOps from '../../../../docs/business/biz-ops.json';
// routing-log.jsonl holds per-client task PII and is gitignored; this glob tolerates
// its absence (yields '' in clean/prod builds) instead of a hard import failure.
const _routingLogGlob = import.meta.glob<string>('../../../../docs/ai/routing-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const routingLogRaw = (Object.values(_routingLogGlob)[0] as string | undefined) ?? '';
import { PageHeader } from './PageHeader';
import { CLIENT_REGISTRY } from './clientRegistry';

// ── Tunables ──────────────────────────────────────────────────────────────────

/** Stale threshold. Claims older than this surface in the briefing. */
const STALE_CLAIM_HOURS = 4;

/** How many "next to start" items to surface. */
const BURNING_TOP_N = 3;

// ── Types ─────────────────────────────────────────────────────────────────────

type OUnit = {
  id: string;
  status: string;
  name?: string;
  priority?: number;
  tier?: string;
  approval?: string;
  claimedBy?: string;
  claimedAt?: string;
  dependsOn?: string[];
  hitl?: boolean;
};

type Severity = 'low' | 'medium' | 'high' | 'critical';
type RiskStatus = 'todo' | 'in-progress' | 'done' | 'blocked';

interface RiskRow {
  id: string;
  label: string;
  severity: Severity;
  status: RiskStatus;
  link?: string;
}

interface RoutingEntry {
  assigner?: string;
  gate?: string;
  projectedUsd?: number;
  at?: string;
}

interface Blocker {
  client: string;
  id: string;
  item: string;
  notes?: string;
}

// ── Stale claims ──────────────────────────────────────────────────────────────

const _units = (orchestration as { units: OUnit[] }).units;

function hoursSince(iso?: string): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 36e5;
}

const STALE_CLAIMS = _units
  .filter((u) => u.status === 'claimed' && hoursSince(u.claimedAt) > STALE_CLAIM_HOURS)
  .map((u) => ({ ...u, ageHours: hoursSince(u.claimedAt) }))
  .sort((a, b) => b.ageHours - a.ageHours);

// ── Burning items (top-N approved + ready) ────────────────────────────────────

const _doneSet = new Set(
  _units.filter((u) => u.status === 'done' || u.status === 'denied').map((u) => u.id),
);

const TIER_RANK: Record<string, number> = { T1: 1, T2: 2, T3: 3, T4: 4 };

const BURNING = _units
  .filter(
    (u) => u.status === 'approved' && !u.hitl && (u.dependsOn ?? []).every((d) => _doneSet.has(d)),
  )
  .sort((a, b) => {
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = TIER_RANK[a.tier ?? ''] ?? 99;
    const tb = TIER_RANK[b.tier ?? ''] ?? 99;
    if (ta !== tb) return ta - tb;
    return a.id < b.id ? -1 : 1;
  })
  .slice(0, BURNING_TOP_N);

// ── Today's blockers (across all clients) ─────────────────────────────────────

const TODAY_BLOCKERS: Blocker[] = Object.entries(CLIENT_REGISTRY).flatMap(([slug, files]) =>
  (files.checklist?.categories ?? []).flatMap((cat) =>
    (cat.items ?? [])
      .filter((i) => i.status === 'blocked')
      .map((i) => ({
        client: slug,
        id: i.id,
        item: i.item,
        notes: i.notes,
      })),
  ),
);

// ── Risk Watch ────────────────────────────────────────────────────────────────

const RISK_ROWS: RiskRow[] = bizOps as unknown as RiskRow[];

// ── Today's cost burn ─────────────────────────────────────────────────────────

function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

const TODAY_COST = (routingLogRaw as string)
  .split('\n')
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line) as RoutingEntry;
    } catch {
      return null;
    }
  })
  .filter((e): e is RoutingEntry => !!e)
  .filter((e) => e.assigner === 'auto-assigner-v1' && !e.gate && isToday(e.at))
  .reduce((sum, e) => sum + (e.projectedUsd ?? 0), 0);

// ── Format helpers ────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.001) return '<$0.001';
  return `$${n.toFixed(4).replace(/\.?0+$/, '')}`;
}

function fmtAge(h: number): string {
  if (!Number.isFinite(h)) return '∞';
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// ── Tone helpers ──────────────────────────────────────────────────────────────

type BadgeTone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';

function severityTone(s: Severity): BadgeTone {
  if (s === 'critical') return 'danger';
  if (s === 'high') return 'danger';
  if (s === 'medium') return 'warning';
  return 'info';
}

function statusTone(s: RiskStatus): BadgeTone {
  if (s === 'blocked') return 'danger';
  if (s === 'done') return 'success';
  if (s === 'in-progress') return 'warning';
  return 'neutral';
}

// ── Page ──────────────────────────────────────────────────────────────────────

/** @public */
export default function BriefingPage() {
  return (
    <Page>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Briefing' }]}
          title="Briefing"
          lede="What changed since you slept — claims aging out, blockers, what to start next."
        />

        {/* Quick stats */}
        <section>
          <div style={s.statRow}>
            <Stat
              label="Stale claims"
              value={String(STALE_CLAIMS.length)}
              tone={STALE_CLAIMS.length > 0 ? 'danger' : 'default'}
              sub={`> ${STALE_CLAIM_HOURS}h old`}
            />
            <Stat
              label="Blockers"
              value={String(TODAY_BLOCKERS.length)}
              tone={TODAY_BLOCKERS.length > 0 ? 'danger' : 'default'}
              sub="across all clients"
            />
            <Stat label="Cost (today)" value={fmtUsd(TODAY_COST)} sub="auto-assigner-v1" />
            <Stat
              label="Top picks ready"
              value={String(BURNING.length)}
              sub={`approved, deps met (capped at ${BURNING_TOP_N})`}
            />
          </div>
        </section>

        {/* Stale claims */}
        <section>
          <h2 style={s.sectionTitle}>Stale claims</h2>
          <p style={s.sectionNote}>
            Units claimed &gt; {STALE_CLAIM_HOURS}h ago. Either the agent crashed or the unit is
            genuinely long. Fresh agents may steal by overwriting{' '}
            <code style={s.inlineCode}>claimedBy</code>.
          </p>
          {STALE_CLAIMS.length === 0 ? (
            <p style={s.emptyNote}>No stale claims. Watchdog is happy.</p>
          ) : (
            <Stack direction="column" gap="gap">
              {STALE_CLAIMS.map((u) => (
                <div key={u.id} style={s.row}>
                  <code style={s.unitId}>{u.id}</code>
                  <span style={s.rowMeta}>{u.claimedBy ?? '—'}</span>
                  <Badge tone="warning">{fmtAge(u.ageHours)}</Badge>
                </div>
              ))}
            </Stack>
          )}
        </section>

        {/* Blockers */}
        <section>
          <h2 style={s.sectionTitle}>Today&apos;s blockers</h2>
          <p style={s.sectionNote}>
            Open items where <code style={s.inlineCode}>status: &quot;blocked&quot;</code> across
            every client checklist. The client column links to the per-client surface.
          </p>
          {TODAY_BLOCKERS.length === 0 ? (
            <p style={s.emptyNote}>No active blockers. All clients moving.</p>
          ) : (
            <Stack direction="column" gap="gap">
              {TODAY_BLOCKERS.map((b) => (
                <div key={`${b.client}-${b.id}`} style={s.row}>
                  <a
                    href={`/ops/clients/${b.client}`}
                    className="hds-focus"
                    style={s.rowClientLink}
                  >
                    <Badge tone="danger">{b.client}</Badge>
                  </a>
                  <span style={s.rowMain}>{b.item}</span>
                  {b.notes && <span style={s.rowMetaWrap}>{b.notes}</span>}
                </div>
              ))}
            </Stack>
          )}
        </section>

        {/* Burning items */}
        <section>
          <h2 style={s.sectionTitle}>Top {BURNING_TOP_N} burning items</h2>
          <p style={s.sectionNote}>
            Highest-priority approved units, dependencies satisfied — ready to claim. Sorted by
            priority, then tier, then id.
          </p>
          {BURNING.length === 0 ? (
            <p style={s.emptyNote}>
              Nothing eligible. Queue is drained or every approved unit is blocked.
            </p>
          ) : (
            <Stack direction="column" gap="gap">
              {BURNING.map((u) => (
                <div key={u.id} style={s.row}>
                  <code style={s.unitId}>{u.id}</code>
                  <Badge tone="info">P{u.priority ?? '—'}</Badge>
                  <Badge tone="neutral">{u.tier ?? '—'}</Badge>
                  <span style={s.rowMain}>{u.name ?? ''}</span>
                </div>
              ))}
            </Stack>
          )}
        </section>

        {/* Risk Watch */}
        <section>
          <h2 style={s.sectionTitle}>Risk Watch</h2>
          <p style={s.sectionNote}>
            Cross-client business risks — DPAs, payment infra, SOWs. Source:{' '}
            <code style={s.inlineCode}>docs/business/biz-ops.json</code>.
          </p>
          {RISK_ROWS.length === 0 ? (
            <p style={s.emptyNote}>
              No risks tracked. Edit <code style={s.inlineCode}>docs/business/biz-ops.json</code> to
              add rows.
            </p>
          ) : (
            <Stack direction="column" gap="gap">
              {RISK_ROWS.map((r) => (
                <div key={r.id} style={s.row}>
                  <Badge tone={severityTone(r.severity)}>{r.severity}</Badge>
                  {r.link ? (
                    <a href={`/${r.link}`} style={s.rowLink}>
                      {r.label}
                    </a>
                  ) : (
                    <span style={s.rowMain}>{r.label}</span>
                  )}
                  <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                </div>
              ))}
            </Stack>
          )}
        </section>

        {/* Other surfaces */}
        <section style={s.outboundLinks}>
          <a href="/ops/sessions" className="hds-focus" style={s.outboundLink}>
            Sessions →
          </a>
          <a href="/ops/build" className="hds-focus" style={s.outboundLink}>
            Build pipeline →
          </a>
          <a href="/ops/atlas" className="hds-focus" style={s.outboundLink}>
            Atlas →
          </a>
        </section>
      </Stack>
    </Page>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  sectionTitle: {
    ...hds.typeStyles.h2,
    margin: `0 0 ${hds.semantic.space.component.gap}`,
    color: 'var(--semantic-color-content-primary)',
  },
  sectionNote: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    margin: `0 0 ${hds.semantic.space.component.gap}`,
    maxWidth: '60ch',
  },
  emptyNote: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
    fontStyle: 'italic',
  },

  statRow: {
    display: 'flex',
    gap: 'var(--semantic-space-layout-normal)',
    flexWrap: 'wrap' as const,
  },

  row: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.semantic.space.component.gap,
    flexWrap: 'wrap' as const,
  },
  unitId: { ...hds.typeStyles.mono, margin: 0, color: 'var(--semantic-color-content-primary)' },
  rowMain: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-primary)',
    flex: '1 1 auto' as const,
    minWidth: '12ch',
  },
  rowMeta: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)' },
  rowMetaWrap: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    flexBasis: '100%' as const,
  },
  rowClientLink: { textDecoration: 'none' as const },
  rowLink: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none' as const,
    flex: '1 1 auto' as const,
  },

  inlineCode: { ...hds.typeStyles.mono, color: 'var(--semantic-color-content-primary)' },

  outboundLinks: {
    display: 'flex',
    gap: 'var(--semantic-space-layout-normal)',
    flexWrap: 'wrap' as const,
    borderTop: '1px solid var(--semantic-color-border-default)',
    paddingTop: hds.semantic.space.section.inset,
  },
  outboundLink: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none' as const,
  },
} satisfies Record<string, CSSProperties>;
