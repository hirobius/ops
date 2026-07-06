/**
 * AgentTag — compact metadata cluster for an agent assignment.
 * @category Display
 * @tier utility
 * @internal — ops infrastructure, absorbed from @hirobius/design-system (the DS
 *   repo stripped its ops-flavored components; this repo now owns them and
 *   consumes only DS primitives — Badge, Stack, tokens).
 * @ai-intent Compact chip: assignee, tier (open-local / closed-frontier), USD budget spent.
 * @ai-rules Standalone. Drops into ActivityFeed, Card.Footer, table cells. Tier → tone by convention (open-local = info, closed-frontier = danger). costCeiling === 0 collapses cost to "free".
 */
/* hds-bypass: ops-domain component — fixed progress-rail measure (3px) and token-driven inline styles, not consumer HDS surface */

import React, { type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Badge, Stack } from '@hirobius/design-system';

/** @public */
export type AgentTier = 'open-local' | 'closed-frontier';

const TIER_TONE: Record<AgentTier, 'info' | 'danger'> = {
  'open-local': 'info',
  'closed-frontier': 'danger',
};

const TIER_LABEL: Record<AgentTier, string> = {
  'open-local': 'open · local',
  'closed-frontier': 'closed · frontier',
};

/** @public */
export interface AgentTagProps {
  /** Model identifier (e.g. "gemma4:e4b", "sonnet-4-6") or human handle. */
  assignee: string;
  /** Tier the assignee belongs to — drives badge tone + label. */
  modelTier: AgentTier;
  /** USD spent so far on this task. Defaults to 0. */
  costSpent?: number;
  /** USD ceiling for this task. 0 means free (local-tier). */
  costCeiling: number;
}

function formatUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}

const assigneeStyle: CSSProperties = {
  ...hds.typeStyles.technical,
  color: 'var(--semantic-color-content-primary)',
  whiteSpace: 'nowrap',
};

const costTextStyle: CSSProperties = {
  ...hds.typeStyles.caption,
  color: 'var(--semantic-color-content-secondary)',
  whiteSpace: 'nowrap',
};

const trackStyle: CSSProperties = {
  height: '3px',
  width: '100%',
  background: 'var(--semantic-color-border-default)',
  borderRadius: hds.borderRadius[2],
  overflow: 'hidden',
};

const fillTone: Record<AgentTier, string> = {
  'open-local': 'var(--semantic-color-feedback-info)',
  'closed-frontier': 'var(--semantic-color-feedback-error)',
};

/** @public */
export const AgentTag = React.forwardRef<HTMLDivElement, AgentTagProps>(function AgentTag(
  { assignee, modelTier, costSpent = 0, costCeiling },
  ref,
) {
  const isFree = costCeiling === 0;
  const pct = costCeiling > 0 ? Math.max(0, Math.min(100, (costSpent / costCeiling) * 100)) : 0;

  return (
    <Stack ref={ref} gap="gap" align="start" as="div" style={{ minWidth: 0 }}>
      <Stack direction="row" gap="gap" align="center" wrap="wrap">
        <span style={assigneeStyle}>{assignee}</span>
        <Badge tone={TIER_TONE[modelTier]}>{TIER_LABEL[modelTier]}</Badge>
        <span style={costTextStyle}>
          {isFree ? 'free' : `${formatUsd(costSpent)} / ${formatUsd(costCeiling)}`}
        </span>
      </Stack>
      {!isFree && (
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          aria-label={`Cost: ${formatUsd(costSpent)} of ${formatUsd(costCeiling)} spent`}
          style={trackStyle}
        >
          <div
            style={{
              height: '100%',
              width: `${pct}%`,
              background: fillTone[modelTier],
              borderRadius: hds.borderRadius[2],
              transition: `width ${hds.motion.expressive.duration}s ease-out`,
            }}
          />
        </div>
      )}
    </Stack>
  );
});
