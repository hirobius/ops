/* hds-bypass: ops-internal page */

/**
 * PillarRail — at-a-glance distribution of orchestration units across the
 * three business-realm pillars (BUILD / GROW / RUN) plus an UNCLASSIFIED
 * bucket for units the deterministic classifier couldn't place.
 *
 * Pillar is the WHY (business realm); cluster is the WHAT (technical
 * grouping). They are orthogonal — every unit can have both. See
 * scripts/classify-pillars.mjs for the classifier and
 * docs/knowledge/{build,grow,run}/ for the pillar definitions.
 *
 * Design notes (matches CLAUDE.md slot conventions):
 *   - No outlined cards; open bands separated by a side-rule.
 *   - Stat lives in the metadata slot at top-left, not inline with prose.
 *   - Filter chips at the bottom toggle the active pillar; they do not
 *     persist across sessions (state lives in the parent page).
 *   - Active chip uses border + tone, inactive uses raised surface only.
 */

import type { CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { computePillarBuckets, type PillarBucket, type Unit } from './data';

export type PillarFilter = 'BUILD' | 'GROW' | 'RUN' | 'UNCLASSIFIED' | null;

interface Props {
  units: Unit[];
  /** Currently-selected filter; null means "no filter active" */
  filter?: PillarFilter;
  /** Called when user toggles a chip; null means clear */
  onFilterChange?: (next: PillarFilter) => void;
}

const PILLAR_LABEL: Record<PillarBucket['pillar'], string> = {
  BUILD: 'BUILD',
  GROW: 'GROW',
  RUN: 'RUN',
  UNCLASSIFIED: 'UNCLASSIFIED',
};

const PILLAR_HINT: Record<PillarBucket['pillar'], string> = {
  BUILD: 'Product · DS · site · client deliverables',
  GROW: 'Sales · marketing · content · acquisition',
  RUN: 'Ops · infra · automation · hygiene',
  UNCLASSIFIED: 'Awaiting classifier review',
};

const PILLAR_TONE: Record<PillarBucket['pillar'], string> = {
  BUILD: 'var(--semantic-color-content-primary)',
  GROW: 'var(--semantic-color-content-primary)',
  RUN: 'var(--semantic-color-content-primary)',
  UNCLASSIFIED: 'var(--semantic-color-content-secondary)',
};

export function PillarRail({ units, filter = null, onFilterChange }: Props) {
  const buckets = computePillarBuckets(units);
  const total = buckets.reduce((acc, b) => acc + b.total, 0);

  return (
    <Stack as="section" direction="column" gap="px16" aria-label="Pillar distribution">
      <Stack
        direction="row"
        align="center"
        justify="space-between"
        gap="px8"
        style={{
          paddingBottom: hds.space.px4,
          borderBottom: '1px solid var(--semantic-color-border-default)',
        }}
      >
        <span style={s.sectionLabel}>Pillars</span>
        <span style={s.sectionHint}>{total} unit{total === 1 ? '' : 's'} · BUILD · GROW · RUN</span>
      </Stack>

      {/* Distribution: open bands separated by a side-rule, not cards */}
      <div style={s.bandRow}>
        {buckets.map((b, idx) => {
          const pct = total > 0 ? Math.round((b.total / total) * 100) : 0;
          return (
            <div
              key={b.pillar}
              style={{
                ...s.band,
                borderLeft:
                  idx === 0 ? 'none' : '1px solid var(--semantic-color-border-default)',
              }}
            >
              <Stack direction="column" gap="px4" style={{ minWidth: 0 }}>
                <span style={s.bandLabel}>{PILLAR_LABEL[b.pillar]}</span>
                <span style={{ ...s.bandValue, color: PILLAR_TONE[b.pillar] }}>{b.total}</span>
                <Stack direction="row" align="end" gap="px8">
                  <span style={s.bandSub}>
                    {b.open} open · {b.done} done
                  </span>
                  <span style={s.bandPct}>{pct}%</span>
                </Stack>
                <span style={s.bandHint} title={PILLAR_HINT[b.pillar]}>
                  {PILLAR_HINT[b.pillar]}
                </span>
              </Stack>
            </div>
          );
        })}
      </div>

      {/* Filter chips */}
      <Stack direction="row" wrap="wrap" gap="px8" align="center">
        <span style={s.filterLabel}>filter:</span>
        {buckets.map((b) => {
          const isActive = filter === b.pillar;
          return (
            <button
              key={b.pillar}
              type="button"
              className="hds-focus"
              aria-pressed={isActive}
              onClick={() => onFilterChange?.(isActive ? null : b.pillar)}
              style={{
                ...s.chip,
                ...(isActive ? s.chipActive : s.chipInactive),
              }}
            >
              <span>{PILLAR_LABEL[b.pillar]}</span>
              <span style={s.chipCount}>{b.total}</span>
            </button>
          );
        })}
        {filter !== null && (
          <button
            type="button"
            className="hds-focus"
            onClick={() => onFilterChange?.(null)}
            style={{ ...s.chip, ...s.chipClear }}
          >
            clear
          </button>
        )}
      </Stack>
    </Stack>
  );
}

const s = {
  sectionLabel: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  sectionHint: {
    ...hds.typeStyles.mono,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  bandRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    columnGap: hds.space.px24,
    rowGap: hds.space.px16,
  } as CSSProperties,
  band: {
    paddingLeft: hds.space.px16,
    paddingRight: hds.space.px8,
    minWidth: 0,
  } as CSSProperties,
  bandLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    letterSpacing: '0.08em',
    textTransform: 'uppercase' as const, // eyebrow-ok: pillar-band kicker
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  bandValue: {
    ...hds.typeStyles.display,
    margin: 0,
    lineHeight: 1,
  } as CSSProperties,
  bandSub: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  bandPct: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  bandHint: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '32ch',
  } as CSSProperties,
  filterLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    textTransform: 'uppercase' as const, // eyebrow-ok: chip-row kicker
    letterSpacing: '0.08em',
  } as CSSProperties,
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px8,
    padding: `${hds.space.px4} ${hds.space.px12}`,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    background: 'transparent',
    cursor: 'pointer',
    minHeight: '32px',
    borderRadius: hds.borderRadius[8],
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  chipInactive: {
    border: '1px solid transparent',
    background: 'var(--semantic-color-surface-raised)',
  } as CSSProperties,
  chipActive: {
    border: '1px solid var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-content-accent)',
    background: 'var(--semantic-color-surface-raised)',
  } as CSSProperties,
  chipClear: {
    border: '1px solid transparent',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  chipCount: {
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
};
