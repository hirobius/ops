/* hds-bypass: ops-internal page */

/**
 * KpiCards — two primary KPIs under the page header.
 *
 *   1. Active claims  — how many agents are working right now
 *   2. Today's cost   — sum of routing-log projectedUsd since 00:00 UTC
 *
 * Live-metrics treatment: display-sized number + eyebrow label + sub-line.
 * No card chrome, no border — the number is the surface. Tone bound to data.
 */

import type { CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { activeClaims, computeTodayCost, fmtUsd, type Unit } from './data';

interface Props {
  units: Unit[];
}

export function KpiCards({ units }: Props) {
  const active = activeClaims(units);
  const cost = computeTodayCost();

  const agentNames = Array.from(
    new Set(active.map((u) => u.claimedBy).filter(Boolean) as string[]),
  );
  const activeSub =
    active.length === 0
      ? 'idle'
      : agentNames.length > 0
        ? `by ${agentNames.slice(0, 2).join(' · ')}${agentNames.length > 2 ? ` +${agentNames.length - 2}` : ''}`
        : active
            .slice(0, 2)
            .map((u) => u.id)
            .join(', ') + (active.length > 2 ? ` +${active.length - 2}` : '');

  const costSub = `since 00:00 UTC · ${cost === 0 ? 'no spend' : 'auto-router'}`;

  return (
    <Stack direction="row" wrap="wrap" gap="px40" style={{ rowGap: hds.space.px24 }}>
      <Metric label="Active"     value={String(active.length)} sub={activeSub} tone="info" />
      <Metric label="Cost today" value={fmtUsd(cost)}          sub={costSub}
              tone={cost > 0 ? 'info' : 'neutral'} />
    </Stack>
  );
}

type Tone = 'neutral' | 'info' | 'success' | 'danger';

const TONE_COLOR: Record<Tone, string> = {
  neutral: 'var(--semantic-color-content-primary)',
  info: 'var(--semantic-color-content-primary)',
  success: 'var(--semantic-color-feedback-success)',
  danger: 'var(--semantic-color-feedback-error)',
};

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: Tone;
}) {
  return (
    <Stack direction="column" gap="px4" style={{ minWidth: 0, flex: '0 1 auto' }}>
      <span style={s.label}>{label}</span>
      <span style={{ ...s.value, color: TONE_COLOR[tone] }}>{value}</span>
      <span style={s.sub} title={sub}>{sub}</span>
    </Stack>
  );
}

const s = {
  label: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  value: {
    ...hds.typeStyles.display,
    margin: 0,
    lineHeight: 1,
  } as CSSProperties,
  sub: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
    maxWidth:     '24ch',
  } as CSSProperties,
};
