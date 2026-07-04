/* hds-bypass: ops-internal component. Inline styles intentional — recreates
 * a dropped design-system component (AgentTag, removed in
 * @hirobius/design-system@0.11.0) as an ops-domain concept. */

/**
 * AgentTag — compact metadata cluster for the /ops session feed's
 * ActivityFeed `meta` slot: which agent picked up a task, its dispatch
 * tier, and live cost-vs-ceiling.
 */

import * as React from 'react';
import { Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { AgentTier } from './types';

export interface AgentTagProps {
  assignee: string;
  modelTier: AgentTier;
  costSpent: number;
  costCeiling: number;
}

const TIER_TONE: Record<AgentTier, 'info' | 'warning'> = {
  'open-local': 'info',
  'closed-frontier': 'warning',
};

const TIER_LABEL: Record<AgentTier, string> = {
  'open-local': 'local',
  'closed-frontier': 'frontier',
};

function formatCost(value: number): string {
  return Number.isFinite(value) ? value.toFixed(2) : '0.00';
}

export const AgentTag = React.forwardRef<HTMLDivElement, AgentTagProps>(
  ({ assignee, modelTier, costSpent, costCeiling }, ref) => {
    return (
      <Stack ref={ref} direction="row" align="center" gap="tight" wrap="wrap">
        <Badge tone={TIER_TONE[modelTier]}>{TIER_LABEL[modelTier]}</Badge>
        <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)' }}>
          {assignee}
        </span>
        <span
          style={{
            ...hds.typeStyles.ui,
            color: 'var(--semantic-color-content-tertiary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          ${formatCost(costSpent)}/{formatCost(costCeiling)}
        </span>
      </Stack>
    );
  },
);

AgentTag.displayName = 'AgentTag';
