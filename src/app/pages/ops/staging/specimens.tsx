/* hds-bypass: ops-internal staging surface — inline styles intentional for fast iteration. */
/* eslint-disable jsx-a11y/anchor-is-valid -- specimen demos use anchor-as-surface/action patterns intentionally */
/* eslint-disable no-restricted-syntax -- specimen demos render raw grid layouts to demonstrate the pattern under evaluation */

/**
 * Specimen catalog — declarative array of visual patterns under evaluation
 * on /ops/staging. Each entry pairs structured metadata (id, family, tags,
 * status…) with a render function. Metadata is queryable; renders are JSX.
 *
 * Adding a new specimen: append a `Specimen` to `SPECIMENS`. When an
 * external skill starts populating this surface, it can write entries to
 * an additional file and merge here — no chrome changes required.
 */

import type { ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';

import { Surface, Card, Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

import { PageHeader } from '../PageHeader';
import type { Specimen } from './types';

const specimenStyles = {
  scoreOverlay: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column' as const,
  } satisfies React.CSSProperties,
  specRowBase: {
    display: 'grid',
    gridTemplateColumns: 'minmax(140px, 1fr) 2fr', // grid-ok: internal staging surface; horizontal scroll acceptable
    alignItems: 'baseline',
    gap: hds.space.px16,
    padding: `${hds.space.px8} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  } satisfies React.CSSProperties,
  pillNavLinkBase: {
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.full,
    textDecoration: 'none',
  } satisfies React.CSSProperties,
  comparisonCallout: {
    padding: hds.space.px24,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[8],
    textAlign: 'center' as const,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: hds.space.px8,
  } satisfies React.CSSProperties,
  comparisonCtaBase: {
    marginTop: hds.space.px4,
    padding: `${hds.space.px8} ${hds.space.px16}`,
    background: 'var(--semantic-color-surface-base)',
    color: 'var(--semantic-color-content-accent)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.full,
    textDecoration: 'none',
  } satisfies React.CSSProperties,
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// Helper specimen renderings (stable building blocks reused across entries)
// ─────────────────────────────────────────────────────────────────────────────

function ResourceLinkCard({ label, desc }: { label: string; desc: string }) {
  return (
    <a
      href="#"
      onClick={(e) => e.preventDefault()}
      className="hds-focus"
      style={{ textDecoration: 'none', display: 'block' }}
    >
      <Surface
        padding="item"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: hds.space.px16,
        }}
      >
        <div>
          <p
            style={{
              ...hds.typeStyles.ui,
              margin: 0,
              color: 'var(--semantic-color-content-primary)',
            }}
          >
            {label}
          </p>
          <p
            style={{
              ...hds.typeStyles.ui,
              margin: 0,
              color: 'var(--semantic-color-content-secondary)',
            }}
          >
            {desc}
          </p>
        </div>
        <ArrowRight size={14} color="var(--semantic-color-content-secondary)" />
      </Surface>
    </a>
  );
}

function RankedMetricTile({ label, value, rank }: { label: string; value: string; rank: string }) {
  return (
    <Surface
      padding="item"
      style={{ display: 'flex', flexDirection: 'column', gap: hds.space.px4, minWidth: 0 }}
    >
      <span style={{ ...hds.typeStyles.eyebrow, color: 'var(--semantic-color-content-secondary)' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: hds.space.px8 }}>
        <span
          style={{
            ...hds.typeStyles.h2,
            margin: 0,
            color: 'var(--semantic-color-content-primary)',
          }}
        >
          {value}
        </span>
        <span
          style={{
            ...hds.typeStyles.mono,
            fontSize: hds.fontSize.xs,
            color: 'var(--semantic-color-content-secondary)',
          }}
        >
          {rank}
        </span>
      </div>
    </Surface>
  );
}

function ScoreDial({ label, score, max = 10 }: { label: string; score: number; max?: number }) {
  const pct = Math.max(0, Math.min(1, score / max));
  const size = 80;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOff = c * (1 - pct);
  const tone =
    pct >= 0.7
      ? 'var(--semantic-color-feedback-success)'
      : pct >= 0.4
        ? 'var(--semantic-color-feedback-warning)'
        : 'var(--semantic-color-feedback-error)';
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: hds.space.px6,
        minWidth: 0,
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke="var(--semantic-color-border-default)"
            strokeWidth={stroke}
            fill="none"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={tone}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={dashOff}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div style={specimenStyles.scoreOverlay}>
          <span
            style={{
              ...hds.typeStyles.h3,
              margin: 0,
              color: 'var(--semantic-color-content-primary)',
            }}
          >
            {score}
          </span>
          <span
            style={{
              ...hds.typeStyles.mono,
              fontSize: hds.fontSize['2xs'],
              color: 'var(--semantic-color-content-secondary)',
            }}
          >
            /{max}
          </span>
        </div>
      </div>
      <span
        style={{
          ...hds.typeStyles.ui,
          color: 'var(--semantic-color-content-secondary)',
          textAlign: 'center',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function SpecRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div style={specimenStyles.specRowBase}>
      <span
        style={{
          ...hds.typeStyles.ui,
          color: 'var(--semantic-color-content-secondary)',
          fontWeight: 500, // eyebrow-ok: specimen demo — medium weight for de-emphasis
        }}
      >
        {label}
      </span>
      <span style={{ ...hds.typeStyles.mono, color: 'var(--semantic-color-content-primary)' }}>
        {value}
      </span>
    </div>
  );
}

function PricingTable() {
  const rows = [
    { type: 'Input', m: '$0.130', k: '$0.000130' },
    { type: 'Output', m: '$0.400', k: '$0.000400' },
  ];
  return (
    <div
      style={{
        borderRadius: hds.borderRadius[8],
        overflow: 'hidden',
        border: '1px solid var(--semantic-color-border-default)',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr', // grid-ok: 3-col header
          padding: `${hds.space.px8} ${hds.space.px12}`,
          background: 'var(--semantic-color-surface-raised)',
          borderBottom: '1px solid var(--semantic-color-border-default)',
        }}
      >
        <span
          style={{ ...hds.typeStyles.eyebrow, color: 'var(--semantic-color-content-secondary)' }}
        >
          Token
        </span>
        <span
          style={{ ...hds.typeStyles.eyebrow, color: 'var(--semantic-color-content-secondary)' }}
        >
          Per 1M
        </span>
        <span
          style={{ ...hds.typeStyles.eyebrow, color: 'var(--semantic-color-content-secondary)' }}
        >
          Per 1K
        </span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.type}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr', // grid-ok: 3-col row
            padding: `${hds.space.px8} ${hds.space.px12}`,
            background: i % 2 === 0 ? 'transparent' : 'var(--semantic-color-surface-raised)',
          }}
        >
          <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-primary)' }}>
            {r.type}
          </span>
          <span style={{ ...hds.typeStyles.mono, color: 'var(--semantic-color-content-primary)' }}>
            {r.m}
          </span>
          <span
            style={{ ...hds.typeStyles.mono, color: 'var(--semantic-color-content-secondary)' }}
          >
            {r.k}
          </span>
        </div>
      ))}
    </div>
  );
}

function LiveMetric({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: hds.space.px4 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: hds.space.px4 }}>
        <span
          style={{
            ...hds.typeStyles.display,
            margin: 0,
            color: 'var(--semantic-color-content-primary)',
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)' }}>
            {unit}
          </span>
        )}
      </div>
      <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)' }}>
        {label}
      </span>
    </div>
  );
}

function PillNav({ items }: { items: string[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px8 }}>
      {items.map((item) => (
        <a
          key={item}
          href="#"
          onClick={(e) => e.preventDefault()}
          className="hds-focus"
          style={{ ...hds.typeStyles.ui, ...specimenStyles.pillNavLinkBase }}
        >
          {item}
        </a>
      ))}
    </div>
  );
}

function ModelCarouselCard({
  name,
  provider,
  tagBadge,
}: {
  name: string;
  provider: string;
  tagBadge: string;
}) {
  return (
    <Card padding="none">
      <Card.Header metadata={<Badge tone="neutral">{tagBadge}</Badge>}>
        <Card.Title>{name}</Card.Title>
        <Card.Description>{provider}</Card.Description>
      </Card.Header>
    </Card>
  );
}

function AnalysisSummaryCallout() {
  return (
    <div
      style={{
        padding: hds.space.px16,
        background: 'var(--semantic-color-surface-raised)',
        borderRadius: hds.borderRadius[8],
      }}
    >
      <p
        style={{
          ...hds.typeStyles.body,
          margin: 0,
          color: 'var(--semantic-color-content-primary)',
        }}
      >
        <strong>Sample summary callout.</strong> Lightweight focus block at the top of a long page —
        gray surface, no border, generous padding.
      </p>
    </div>
  );
}

function ComparisonCallout() {
  return (
    <div style={specimenStyles.comparisonCallout}>
      <h3
        style={{ ...hds.typeStyles.h3, margin: 0, color: 'var(--semantic-color-content-primary)' }}
      >
        How does this stack up?
      </h3>
      <p
        style={{
          ...hds.typeStyles.body,
          margin: 0,
          color: 'var(--semantic-color-content-secondary)',
          maxWidth: '50ch',
        }}
      >
        Compare against the rest of the fleet — performance, cost, posture.
      </p>
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        className="hds-focus"
        style={{ ...hds.typeStyles.ui, ...specimenStyles.comparisonCtaBase }}
      >
        Compare →
      </a>
    </div>
  );
}

function EditorialNote({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        ...hds.typeStyles.ui,
        margin: 0,
        color: 'var(--semantic-color-content-secondary)',
        fontStyle: 'italic',
      }}
    >
      {children}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Specimen catalog
// ─────────────────────────────────────────────────────────────────────────────

const SEED_DATE = '2026-05-06';

export const SPECIMENS: Specimen[] = [
  // ── Page header chrome ────────────────────────────────────────────────────
  {
    id: 'page-header-top-level',
    name: 'Top-level (no breadcrumb)',
    family: 'page-header',
    source: 'proposed',
    tags: ['header', 'chrome', 'anchor'],
    status: 'approved',
    notes:
      'For root /ops index. Display heading is the visual anchor; no breadcrumb at the top of the tree.',
    added: SEED_DATE,
    render: () => <PageHeader title="Briefing" />,
  },
  {
    id: 'page-header-with-breadcrumb',
    name: 'With breadcrumb',
    family: 'page-header',
    source: 'proposed',
    tags: ['header', 'chrome', 'breadcrumb'],
    status: 'approved',
    notes:
      "Standard for second-level pages. ' · ' separator, last crumb non-link in primary color.",
    added: SEED_DATE,
    render: () => (
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Atlas' }]}
        title="Atlas"
      />
    ),
  },
  {
    id: 'page-header-with-lede',
    name: 'With breadcrumb + lede',
    family: 'page-header',
    source: 'proposed',
    tags: ['header', 'chrome', 'breadcrumb', 'lede'],
    status: 'approved',
    notes: 'Lede is optional; show only when it adds info. No metadata chips, no badges.',
    added: SEED_DATE,
    render: () => (
      <PageHeader
        breadcrumbs={[
          { label: 'Ops', href: '/ops' },
          { label: 'Clients', href: '/ops/clients' },
          { label: 'Lilac Insure' },
        ]}
        title="Lilac Insure"
        lede="Insurance agency automation. Two active workstreams; retainer in flight."
      />
    ),
  },

  // ── Mini tiles ────────────────────────────────────────────────────────────
  {
    id: 'mini-tile-resource-link',
    name: 'External resource card',
    family: 'mini-tile',
    source: 'designforonline.com',
    tags: ['tile', 'link', 'arrow'],
    status: 'approved',
    notes: 'Surface w/ label + sub + ArrowRight. Cleaner than ExternalLink for in-app jumps.',
    added: SEED_DATE,
    render: () => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: hds.space.px8,
        }}
      >
        <ResourceLinkCard label="View on OpenRouter" desc="Live status + endpoints" />
        <ResourceLinkCard label="API Quickstart" desc="Curl + SDK examples" />
      </div>
    ),
  },

  // ── Plain stat blocks ─────────────────────────────────────────────────────
  {
    id: 'stat-block-live-metrics',
    name: 'Live metrics row (display sizing)',
    family: 'stat-block',
    source: 'designforonline.com',
    tags: ['metric', 'hero', 'display'],
    status: 'approved',
    notes: 'Display (Clash) sizing for a hero feel. Optional unit suffix; eyebrow caption.',
    added: SEED_DATE,
    render: () => (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: hds.space.px32 }}>
        <LiveMetric value="100" unit="%" label="Uptime" />
        <LiveMetric value="360" unit="ms" label="Best latency (TTFT)" />
        <LiveMetric value="61" unit="tok/s" label="Best throughput" />
        <LiveMetric value="1/1" label="Active endpoints" />
      </div>
    ),
  },

  // ── Ranked metrics ────────────────────────────────────────────────────────
  {
    id: 'ranked-metric-tile',
    name: 'Ranked metric tile',
    family: 'ranked-metric',
    source: 'designforonline.com',
    tags: ['metric', 'rank', 'tile'],
    status: 'review',
    notes:
      'Surface tile with eyebrow + h2 value + mono rank. Useful when a number only means something against a baseline.',
    added: SEED_DATE,
    render: () => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: hds.space.px8,
        }}
      >
        <RankedMetricTile label="Intelligence" value="26.3" rank="#321 / 544" />{' '}
        {/* audit-ok: rank label, not hex color */}
        <RankedMetricTile label="Input cost" value="$0.13" rank="#217 / 544" />{' '}
        {/* audit-ok: rank label, not hex color */}
        <RankedMetricTile label="Output cost" value="$0.40" rank="#211 / 544" />{' '}
        {/* audit-ok: rank label, not hex color */}
        <RankedMetricTile label="Context" value="131K" rank="#202 / 544" />{' '}
        {/* audit-ok: rank label, not hex color */}
      </div>
    ),
  },

  // ── Score visualizations ──────────────────────────────────────────────────
  {
    id: 'score-viz-ring-4up',
    name: 'Score ring (4-up)',
    family: 'score-viz',
    source: 'designforonline.com',
    tags: ['score', 'svg', 'data-viz'],
    status: 'review',
    notes: 'SVG arc. Thresholds: <40% red · <70% amber · ≥70% green. Tone bound to score.',
    added: SEED_DATE,
    render: () => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: /* grid-ok: 4-up score dials, ops-internal */ 'repeat(4, 1fr)',
          gap: hds.space.px16,
        }}
      >
        <ScoreDial label="Internal integrity" score={8.2} />
        <ScoreDial label="Industry benchmark" score={6.4} />
        <ScoreDial label="Coverage" score={3.8} />
        <ScoreDial label="Velocity" score={9.1} />
      </div>
    ),
  },

  // ── Header-only cards ─────────────────────────────────────────────────────
  {
    id: 'header-card-model-carousel',
    name: 'Model carousel card',
    family: 'header-card',
    source: 'designforonline.com',
    tags: ['card', 'related-items'],
    status: 'review',
    notes: 'Card.Header only with neutral metadata badge. Useful for related-item rails.',
    added: SEED_DATE,
    render: () => (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: hds.space.px16,
        }}
      >
        <ModelCarouselCard name="Sonnet 4.6" provider="Anthropic" tagBadge="Active" />
        <ModelCarouselCard name="Hermes3 Pro" provider="Local" tagBadge="Free" />
        <ModelCarouselCard name="Qwen 2.5 14B" provider="Local" tagBadge="Free" />
      </div>
    ),
  },

  // ── Body callouts ─────────────────────────────────────────────────────────
  {
    id: 'body-callout-analysis-summary',
    name: 'Analysis summary callout',
    family: 'body-callout',
    source: 'designforonline.com',
    tags: ['callout', 'tldr'],
    status: 'approved',
    notes: 'Plain raised surface, no card chrome. TLDR block at top of a long flow.',
    added: SEED_DATE,
    render: () => <AnalysisSummaryCallout />,
  },

  // ── Tables ────────────────────────────────────────────────────────────────
  {
    id: 'table-spec-2col',
    name: '2-column spec table',
    family: 'table',
    source: 'designforonline.com',
    tags: ['table', 'spec', 'dense'],
    status: 'approved',
    notes:
      'Bold label / mono value, subtle row dividers. Dense, scannable. Works for unit detail panels.',
    added: SEED_DATE,
    render: () => (
      <div>
        <SpecRow label="Reasoning" value="Disabled" />
        <SpecRow label="Input" value="Text" />
        <SpecRow label="Output" value="Text" />
        <SpecRow label="Context" value="131,072 tokens" />
        <SpecRow label="Tokenizer" value="Llama-3" />
        <SpecRow label="Released" value="2025-08-26" />
      </div>
    ),
  },
  {
    id: 'table-pricing-3col',
    name: 'Pricing table (3-col, alt rows)',
    family: 'table',
    source: 'designforonline.com',
    tags: ['table', 'pricing', 'currency'],
    status: 'review',
    notes: 'Eyebrow header + alternating row backgrounds. Mono for currency.',
    added: SEED_DATE,
    render: () => <PricingTable />,
  },

  // ── Pill nav ──────────────────────────────────────────────────────────────
  {
    id: 'pill-nav-cluster',
    name: 'Pill cluster',
    family: 'pill-nav',
    source: 'designforonline.com',
    tags: ['nav', 'pill', 'sub-nav'],
    status: 'review',
    notes:
      'Light background pills, dark text, rounded-full. Useful for /ops/atlas tab-row alternative or page-level secondary nav.',
    added: SEED_DATE,
    render: () => <PillNav items={['Compare units', 'Strength', 'Firing stats', 'Audit claims']} />,
  },

  // ── CTA bands ─────────────────────────────────────────────────────────────
  {
    id: 'cta-band-comparison',
    name: 'Centered comparison callout',
    family: 'cta-band',
    source: 'designforonline.com',
    tags: ['cta', 'empty-state', 'centered'],
    status: 'approved',
    notes:
      "Whole-band CTA — heading + body + button on raised surface. Better than 'Inbox empty' bare text.",
    added: SEED_DATE,
    render: () => <ComparisonCallout />,
  },

  // ── Inline meta ───────────────────────────────────────────────────────────
  {
    id: 'inline-meta-editorial-note',
    name: 'Editorial note (italic + date)',
    family: 'inline-meta',
    source: 'designforonline.com',
    tags: ['meta', 'provenance', 'italic'],
    status: 'approved',
    notes: "Lightweight provenance under data-driven sections — 'as of <date>' or 'assessed by X'.",
    added: SEED_DATE,
    render: () => (
      <EditorialNote>
        Assessed 2026-05-06 — sidecar regenerated by `pnpm audit:sidecar`.
      </EditorialNote>
    ),
  },
];
