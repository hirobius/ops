// design-system-ext — local extensions filling the gap between the ops app and
// the currently-published @hirobius/design-system (0.11.0).
//
// The ops dashboard was developed against a local, unpublished build of the
// design system that carried three extra surfaces — AgentTag, PhaseHeader and
// ApprovalCard — plus their supporting types. Those have not yet been cut into
// an npm release. Rather than block the production build on a design-system
// publish, we host faithful, token-governed implementations here, built on the
// published DS primitives (Badge, Button, Surface, Stack) and `hds` tokens.
//
// When the design system publishes these components, delete this module and
// repoint the six importing files back to '@hirobius/design-system'.

import * as React from 'react';
import { Badge, Button, Surface, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

// ── AgentTag ─────────────────────────────────────────────────────────────────
// Compact chip: which model/agent ran the work, its tier, and spend against its
// ceiling. Rendered inside activity-feed rows.

export type AgentTier = 'open-local' | 'closed-frontier';

export interface AgentTagProps {
  /** Executor handle — a model id (e.g. "sonnet") or human handle. */
  assignee: string;
  /** Compute tier the executor belongs to. */
  modelTier: AgentTier;
  /** Dollars spent so far on this unit of work. */
  costSpent: number;
  /** Dollar ceiling for this unit of work (0 = no ceiling set). */
  costCeiling: number;
}

const TIER_LABEL: Record<AgentTier, string> = {
  'open-local': 'Open · local',
  'closed-frontier': 'Closed · frontier',
};

function formatCost(spent: number, ceiling: number): string {
  const s = `$${spent.toFixed(2)}`;
  return ceiling > 0 ? `${s} / $${ceiling.toFixed(2)}` : s;
}

export const AgentTag = React.forwardRef<HTMLSpanElement, AgentTagProps>(function AgentTag(
  { assignee, modelTier, costSpent, costCeiling },
  ref,
) {
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px8,
    fontSize: hds.fontSize.xs,
    color: hds.color.content.secondary,
  };
  return (
    <span ref={ref} style={style} data-role="agent-tag">
      <span style={{ fontWeight: hds.fontWeight.medium, color: hds.color.content.primary }}>
        {assignee}
      </span>
      <Badge tone={modelTier === 'closed-frontier' ? 'info' : 'neutral'}>
        {TIER_LABEL[modelTier]}
      </Badge>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatCost(costSpent, costCeiling)}
      </span>
    </span>
  );
});

// ── PhaseHeader ──────────────────────────────────────────────────────────────
// Open band header for a delivery phase: name, done/total progress, optional
// budget, and a trailing slot (usually a status Badge). Tone drives a thin left
// accent rule — no nested card chrome, per the editorial-enterprise direction.

export type PhaseHeaderTone = 'default' | 'success' | 'warning' | 'danger';

export interface PhaseHeaderProps {
  /** Heading element to render (defaults to h2). */
  as?: React.ElementType;
  /** Phase name. */
  name: string;
  /** Optional budget for the phase, in dollars. */
  budget?: number | null;
  /** Completed task count. */
  done: number;
  /** Total task count. */
  total: number;
  /** Accent tone for the left rule. */
  tone?: PhaseHeaderTone;
  /** Trailing content, right-aligned (e.g. a status Badge). */
  trailing?: React.ReactNode;
}

const TONE_ACCENT: Record<PhaseHeaderTone, string> = {
  default: 'var(--semantic-color-content-secondary)',
  success: 'var(--semantic-color-feedback-success)',
  warning: 'var(--semantic-color-feedback-warning)',
  danger: 'var(--semantic-color-feedback-error)',
};

export function PhaseHeader({
  as: HeadingTag = 'h2',
  name,
  budget,
  done,
  total,
  tone = 'default',
  trailing,
}: PhaseHeaderProps) {
  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px16,
    borderLeft: `${hds.borderWidth.emphasis} solid ${TONE_ACCENT[tone]}`,
    paddingLeft: hds.space.px12,
  };
  const headingStyle: React.CSSProperties = {
    margin: 0,
    fontSize: hds.fontSize.lg,
    fontWeight: hds.fontWeight.semibold,
    color: hds.color.content.primary,
  };
  const metaStyle: React.CSSProperties = {
    fontSize: hds.fontSize.sm,
    color: hds.color.content.secondary,
    fontVariantNumeric: 'tabular-nums',
  };
  return (
    <div style={rowStyle} data-role="phase-header">
      <div style={{ display: 'flex', flexDirection: 'column', gap: hds.space.px2 }}>
        <HeadingTag style={headingStyle}>{name}</HeadingTag>
        <span style={metaStyle}>
          {done}/{total} done
          {typeof budget === 'number' ? ` · $${budget.toLocaleString()} budget` : ''}
        </span>
      </div>
      {trailing ? <div style={{ flexShrink: 0 }}>{trailing}</div> : null}
    </div>
  );
}

// ── ApprovalCard ─────────────────────────────────────────────────────────────
// Inbox card for one orchestration unit awaiting a human decision. Shows the
// unit identity + summary, its current approval state, and the approve / grill /
// deny actions. Detail navigation fires on card body click.

export type ApprovalState = 'proposed' | 'needs-grilling' | 'approved' | 'denied' | 'pending';

export interface ApprovalUnitSummary {
  id: string;
  name?: string;
  approval?: ApprovalState;
  description?: string;
  priority?: number;
  sprint?: number;
  estimate?: string;
  cluster?: string;
}

export interface ApprovalCardProps {
  unit: ApprovalUnitSummary;
  /** True while an action for this unit is in flight — disables the buttons. */
  pending: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onGrill: () => void;
  onOpenDetail: (unit: ApprovalUnitSummary) => void;
}

const APPROVAL_BADGE: Record<
  ApprovalState,
  { tone: 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'inProgress'; label: string }
> = {
  proposed: { tone: 'info', label: 'Proposed' },
  'needs-grilling': { tone: 'warning', label: 'Needs grilling' },
  approved: { tone: 'success', label: 'Approved' },
  denied: { tone: 'danger', label: 'Denied' },
  pending: { tone: 'inProgress', label: 'Pending' },
};

export function ApprovalCard({
  unit,
  pending,
  onApprove,
  onDeny,
  onGrill,
  onOpenDetail,
}: ApprovalCardProps) {
  const badge = APPROVAL_BADGE[unit.approval ?? 'proposed'];
  const metaBits = [
    unit.cluster,
    typeof unit.priority === 'number' ? `P${unit.priority}` : undefined,
    typeof unit.sprint === 'number' ? `Sprint ${unit.sprint}` : undefined,
    unit.estimate,
  ].filter(Boolean) as string[];

  return (
    <Surface padding="px16" shadow>
      <Stack direction="column" gap="inset">
        <div
          role="button"
          tabIndex={0}
          onClick={() => onOpenDetail(unit)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onOpenDetail(unit);
            }
          }}
          style={{
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            gap: hds.space.px6,
          }}
          data-role="approval-card-body"
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: hds.space.px8,
            }}
          >
            <span
              style={{
                fontSize: hds.fontSize.base,
                fontWeight: hds.fontWeight.semibold,
                color: hds.color.content.primary,
              }}
            >
              {unit.name ?? unit.id}
            </span>
            <Badge tone={badge.tone}>{badge.label}</Badge>
          </div>
          <span style={{ fontSize: hds.fontSize.xs, color: hds.color.content.secondary }}>
            {unit.id}
          </span>
          {unit.description ? (
            <p
              style={{
                margin: 0,
                fontSize: hds.fontSize.sm,
                color: hds.color.content.secondary,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {unit.description}
            </p>
          ) : null}
          {metaBits.length ? (
            <span style={{ fontSize: hds.fontSize.xs, color: hds.color.content.secondary }}>
              {metaBits.join(' · ')}
            </span>
          ) : null}
        </div>
        <Stack direction="row" gap="inset">
          <Button size="sm" variant="primary" tone="success" disabled={pending} onClick={onApprove}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" tone="warning" disabled={pending} onClick={onGrill}>
            Grill
          </Button>
          <Button size="sm" variant="secondary" tone="danger" disabled={pending} onClick={onDeny}>
            Deny
          </Button>
        </Stack>
      </Stack>
    </Surface>
  );
}
