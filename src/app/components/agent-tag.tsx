/* hds-bypass: ops-internal domain component (agent routing meta), not an HDS primitive. */
// AgentTag — compact assignee + model-tier + cost meta cluster rendered in the
// sessions feed's meta slot. Ops/orchestration domain, so it lives in the ops
// app rather than @hirobius/design-system.
import { Tag } from '@hirobius/design-system';

/** Routing tier: open local model vs closed frontier model. */
export type AgentTier = 'open-local' | 'closed-frontier';

export interface AgentTagProps {
  assignee: string;
  modelTier?: AgentTier;
  costSpent?: number;
  costCeiling?: number;
}

const TIER_LABEL: Record<AgentTier, string> = {
  'open-local': 'local',
  'closed-frontier': 'frontier',
};

export function AgentTag({ assignee, modelTier, costSpent, costCeiling }: AgentTagProps) {
  const showCost =
    typeof costSpent === 'number' && typeof costCeiling === 'number' && costCeiling > 0;
  return (
    <span
      className="inline-flex items-center gap-2 text-xs text-muted-foreground"
      data-role="agent-tag"
    >
      <Tag>{assignee}</Tag>
      {modelTier ? <span data-role="agent-tier">{TIER_LABEL[modelTier]}</span> : null}
      {showCost ? (
        <span data-role="agent-cost">
          ${costSpent!.toFixed(2)} / ${costCeiling!.toFixed(2)}
        </span>
      ) : null}
    </span>
  );
}
