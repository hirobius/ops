/* hds-bypass: ops-internal page */

/**
 * StrengthTab — System Strength dashboard at /ops/atlas#strength.
 *
 * Reads docs/guardrails/strength-report.json (canonical state) and
 * docs/guardrails/strength-history.jsonl (daily snapshots) at build time.
 *
 * Renders:
 *   - Two composite scores side-by-side (A internal-integrity, B industry-benchmark)
 *   - Inline-SVG sparkline per score from history
 *   - Per-dimension bar chart with status badges (wired / needs-wiring / needs-data)
 *   - Delta vs yesterday + top movers
 *   - Link to the human-readable markdown report
 *
 * Existing primitives only: Badge, Card. No chart library — sparkline is a
 * hand-rolled SVG polyline.
 *
 * @category Internal
 * @tier utility
 */

import React from 'react';
import { Badge, Card, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import strengthRaw from '../../../../../docs/guardrails/strength-report.json';
import historyRaw from '../../../../../docs/guardrails/strength-history.jsonl?raw';
import { parseJsonlLines } from '../../../lib/jsonl';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Dimension {
  id: string;
  name: string;
  score: number | null;
  status: 'wired' | 'needs-wiring' | 'needs-data';
  weight: string;
  methodology: string;
  reason: string | null;
  raw?: Record<string, unknown>;
}

interface Score {
  composite: number | null;
  description: string;
  dimensions: Dimension[];
  wiredCoverage?: string;
}

interface StrengthReport {
  generated: string;
  regressionWarning: string | null;
  scoreA: Score;
  scoreB: Score;
}

interface HistoryEntry {
  ts: string;
  date: string;
  scoreA: { composite: number; wiredCoverage: string; dimensions: Record<string, number | null> };
  scoreB: { composite: number; wiredCoverage: string; dimensions: Record<string, number | null> };
}

// ── Parse history JSONL ──────────────────────────────────────────────────────

function parseHistory(raw: string): HistoryEntry[] {
  return parseJsonlLines<HistoryEntry>(raw).sort((a, b) => a.date.localeCompare(b.date));
}

// ── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) {
    return (
      <div style={s.sparkPlaceholder}>{values.length === 1 ? `${values[0]}` : 'no history'}</div>
    );
  }

  const width = 120;
  const height = 32;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const range = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} style={s.sparkline} aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Dimension bar ────────────────────────────────────────────────────────────

function DimensionBar({ dim }: { dim: Dimension }) {
  const isUnwired = dim.status !== 'wired';

  return (
    <div style={s.dimRow}>
      <div style={s.dimLabel}>
        <span style={s.dimId}>{dim.id}</span>
        <span style={s.dimName}>{dim.name}</span>
      </div>
      <div style={s.dimBarColumn}>
        {isUnwired ? (
          <div style={s.dimUnwired}>
            <Badge tone={dim.status === 'needs-wiring' ? 'neutral' : 'info'}>{dim.status}</Badge>
            {dim.reason && <span style={s.dimReason}>{dim.reason}</span>}
          </div>
        ) : (
          <>
            <div style={s.dimBarTrack}>
              <div style={{ ...s.dimBarFill, width: `${dim.score ?? 0}%` }} />
            </div>
            <span style={s.dimScore}>{dim.score}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Composite card ───────────────────────────────────────────────────────────

function CompositeCard({
  letter,
  score,
  history,
  color,
}: {
  letter: 'A' | 'B';
  score: Score;
  history: HistoryEntry[];
  color: string;
}) {
  const sparkValues = history.map((h) =>
    letter === 'A' ? h.scoreA.composite : h.scoreB.composite,
  );
  const composite = score.composite;
  const subtitle = letter === 'A' ? 'Internal Integrity' : 'Industry Benchmark';

  return (
    <Card tone="default" padding="component">
      <div style={s.compositeRoot}>
        <div style={s.compositeHeader}>
          <div>
            <div style={s.compositeLetter}>Score {letter}</div>
            <div style={s.compositeSubtitle}>{subtitle}</div>
          </div>
          {score.wiredCoverage && <Badge tone="neutral">wired {score.wiredCoverage}</Badge>}
        </div>
        <div style={s.compositeNumber}>
          {composite !== null ? composite : '—'}
          <span style={s.compositeMax}>/100</span>
        </div>
        <Sparkline values={sparkValues} color={color} />
        <div style={s.compositeDescription}>{score.description}</div>
      </div>
    </Card>
  );
}

// ── Recent changes ───────────────────────────────────────────────────────────

function RecentChanges({ history }: { history: HistoryEntry[] }) {
  if (history.length < 2) {
    return (
      <div style={s.changesEmpty}>
        Not enough history yet — first two daily snapshots needed for delta. Run{' '}
        <code style={s.code}>pnpm strength:snapshot</code> tomorrow.
      </div>
    );
  }

  const today = history[history.length - 1];
  const yesterday = history[history.length - 2];

  const deltaA = today.scoreA.composite - yesterday.scoreA.composite;
  const deltaB = today.scoreB.composite - yesterday.scoreB.composite;

  const dimMovers: { id: string; delta: number }[] = [];
  for (const [id, score] of Object.entries(today.scoreA.dimensions)) {
    const prev = yesterday.scoreA.dimensions[id];
    if (typeof score === 'number' && typeof prev === 'number' && score !== prev) {
      dimMovers.push({ id, delta: score - prev });
    }
  }
  for (const [id, score] of Object.entries(today.scoreB.dimensions)) {
    const prev = yesterday.scoreB.dimensions[id];
    if (typeof score === 'number' && typeof prev === 'number' && score !== prev) {
      dimMovers.push({ id, delta: score - prev });
    }
  }
  dimMovers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topMovers = dimMovers.slice(0, 3);

  return (
    <div style={s.changesRoot}>
      <div style={s.changesRow}>
        <span style={s.changesLabel}>Today vs yesterday:</span>
        <span style={s.deltaPair}>
          <DeltaPill label="A" delta={deltaA} />
          <DeltaPill label="B" delta={deltaB} />
        </span>
      </div>
      {topMovers.length > 0 && (
        <div style={s.changesRow}>
          <span style={s.changesLabel}>Top movers:</span>
          <span style={s.deltaPair}>
            {topMovers.map((m) => (
              <DeltaPill key={m.id} label={m.id} delta={m.delta} />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

function DeltaPill({ label, delta }: { label: string; delta: number }) {
  if (delta === 0) return <Badge tone="neutral">{label} 0</Badge>;
  const tone = delta > 0 ? 'success' : 'danger';
  const arrow = delta > 0 ? '▲' : '▼';
  return (
    <Badge tone={tone}>
      {label} {arrow} {Math.abs(delta)}
    </Badge>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export default function StrengthTab() {
  const report = strengthRaw as unknown as StrengthReport;
  const history = parseHistory(historyRaw);

  return (
    <Stack direction="column" gap="inset">
      {/* Header */}
      <div style={s.headerRow}>
        <div>
          <span style={s.headerTitle}>System Strength</span>
          <span style={s.headerMeta}>
            Generated {new Date(report.generated).toISOString().slice(0, 10)}
          </span>
        </div>
        {report.regressionWarning && (
          <Badge tone="danger">regression: {report.regressionWarning}</Badge>
        )}
      </div>

      {/* Composite scores */}
      <div style={s.compositesGrid}>
        <CompositeCard
          letter="A"
          score={report.scoreA}
          history={history}
          color="var(--semantic-color-feedback-success)"
        />
        <CompositeCard
          letter="B"
          score={report.scoreB}
          history={history}
          color="var(--semantic-color-content-accent)"
        />
      </div>

      {/* Recent changes */}
      <RecentChanges history={history} />

      {/* Dimensions A */}
      <section style={s.dimSection}>
        <div style={s.dimSectionHeader}>
          <span style={s.dimSectionTitle}>Internal Integrity</span>
          <span style={s.dimSectionMeta}>{report.scoreA.dimensions.length} dimensions</span>
        </div>
        <div style={s.dimList}>
          {report.scoreA.dimensions.map((dim) => (
            <DimensionBar key={dim.id} dim={dim} />
          ))}
        </div>
      </section>

      {/* Dimensions B */}
      <section style={s.dimSection}>
        <div style={s.dimSectionHeader}>
          <span style={s.dimSectionTitle}>Industry Benchmark</span>
          <span style={s.dimSectionMeta}>{report.scoreB.dimensions.length} dimensions</span>
        </div>
        <div style={s.dimList}>
          {report.scoreB.dimensions.map((dim) => (
            <DimensionBar key={dim.id} dim={dim} />
          ))}
        </div>
      </section>

      {/* Footer link */}
      <div style={s.footer}>
        <a
          href="../../../../../docs/guardrails/strength-report.md"
          className="hds-focus"
          style={s.footerLink}
        >
          Read full markdown report →
        </a>
        <span style={s.footerNote}>
          Spec: <code style={s.code}>docs/guardrails/strength-score-spec.md</code>
        </span>
      </div>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const GAP = hds.semantic.space.component.gap;
const _SECTION_INSET = hds.semantic.space.section.inset;

const s = {
  headerRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: GAP,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.space.px8,
  } satisfies React.CSSProperties,

  headerTitle: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
    marginRight: hds.space.px12,
  } satisfies React.CSSProperties,

  headerMeta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  compositesGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: GAP,
  } satisfies React.CSSProperties,

  compositeRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: hds.space.px8,
  } satisfies React.CSSProperties,

  compositeHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  } satisfies React.CSSProperties,

  compositeLetter: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-primary)',
    margin: 0,
  } satisfies React.CSSProperties,

  compositeSubtitle: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  } satisfies React.CSSProperties,

  compositeNumber: {
    ...hds.typeStyles.h1,
    fontSize: '64px',
    lineHeight: 1,
    color: 'var(--semantic-color-content-primary)',
    fontFamily: 'var(--semantic-typography-mono-font-family)',
  } satisfies React.CSSProperties,

  compositeMax: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-tertiary)',
    fontFamily: 'var(--semantic-typography-mono-font-family)',
  } satisfies React.CSSProperties,

  compositeDescription: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
    margin: 0,
  } satisfies React.CSSProperties,

  sparkline: {
    display: 'block',
  } satisfies React.CSSProperties,

  sparkPlaceholder: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
  } satisfies React.CSSProperties,

  changesRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: hds.space.px4,
    padding: `${hds.space.px8} ${hds.space.px12}`,
    backgroundColor: 'var(--semantic-color-surface-raised)',
    borderRadius: 'var(--semantic-radius-card)',
  } satisfies React.CSSProperties,

  changesEmpty: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
    padding: `${hds.space.px8} ${hds.space.px12}`,
    backgroundColor: 'var(--semantic-color-surface-raised)',
    borderRadius: 'var(--semantic-radius-card)',
  } satisfies React.CSSProperties,

  changesRow: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'center',
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  changesLabel: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,

  deltaPair: {
    display: 'flex',
    gap: hds.space.px4,
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  dimSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: hds.space.px8,
  } satisfies React.CSSProperties,

  dimSectionHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px8,
  } satisfies React.CSSProperties,

  dimSectionTitle: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-primary)',
    margin: 0,
  } satisfies React.CSSProperties,

  dimSectionMeta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  dimList: {
    display: 'flex',
    flexDirection: 'column',
    gap: hds.space.px4,
  } satisfies React.CSSProperties,

  dimRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, 280px) 1fr', // grid-ok: dimension label + bar; minmax floors label at 180px which fits >=320px viewport; bar takes remaining space
    gap: hds.space.px12,
    alignItems: 'center',
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
  } satisfies React.CSSProperties,

  dimLabel: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'baseline',
    minWidth: 0,
  } satisfies React.CSSProperties,

  dimId: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-accent)',
    flexShrink: 0,
    fontFamily: 'var(--semantic-typography-mono-font-family)',
  } satisfies React.CSSProperties,

  dimName: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  } satisfies React.CSSProperties,

  dimBarColumn: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'center',
  } satisfies React.CSSProperties,

  dimBarTrack: {
    flex: 1,
    height: '6px',
    backgroundColor: 'var(--semantic-color-surface-page)',
    borderRadius: hds.borderRadius.sm,
    overflow: 'hidden',
    minWidth: '60px',
  } satisfies React.CSSProperties,

  dimBarFill: {
    height: '100%',
    backgroundColor: 'var(--semantic-color-content-accent)',
    transition: `width ${hds.duration.normal} ease-out`,
  } satisfies React.CSSProperties,

  dimScore: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-primary)',
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    minWidth: '32px',
    textAlign: 'right',
  } satisfies React.CSSProperties,

  dimUnwired: {
    display: 'flex',
    gap: hds.space.px8,
    alignItems: 'center',
    flex: 1,
  } satisfies React.CSSProperties,

  dimReason: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  } satisfies React.CSSProperties,

  footer: {
    display: 'flex',
    gap: hds.space.px12,
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: hds.space.px8,
    borderTop: '1px solid var(--semantic-color-border-default)',
    flexWrap: 'wrap',
  } satisfies React.CSSProperties,

  footerLink: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-interaction-accent)',
    textDecoration: 'none',
  } satisfies React.CSSProperties,

  footerNote: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,

  code: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    padding: '0 4px',
    borderRadius: hds.borderRadius.sm,
  } satisfies React.CSSProperties,
} satisfies Record<string, React.CSSProperties>;
