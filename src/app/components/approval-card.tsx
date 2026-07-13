// motion-ok: card surface — hover/focus styling via tokens, no per-card motion
/**
 * ApprovalCard — review surface for proposed work units.
 * @category Display
 * @tier utility
 * @internal — ops infrastructure, absorbed from @hirobius/design-system (the DS
 *   repo stripped its ops-flavored components). Consumes only DS primitives
 *   (Card, Button, Tag) + the ops-local `cn`.
 */
/* hds-bypass: ops-domain component — composes DS primitives with Tailwind utility classes, not a consumer HDS surface */

import * as React from 'react';
import { Card, Button, Tag, Badge } from '@hirobius/design-system';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/utils';
import { WORK_STATE_TONE } from '../../../lib/tasks/work-state.mjs';

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;

// ── Types ──────────────────────────────────────────────────────────────────────

export type ApprovalState = 'proposed' | 'approved' | 'denied' | 'needs-grilling';

export interface ApprovalUnitSummary {
  /** Unit id (matches docs/ai/orchestration.json, or a tasks-store `task.key`). */
  id: string;
  /** Human-readable unit name. */
  name: string;
  /** Sprint bucket (0..6). */
  sprint?: number;
  /** Priority (1..5, 1 = highest). */
  priority?: number;
  /** Cluster tag grouping units in the approval inbox. */
  cluster?: string;
  /** Where the unit was proposed from (free-text source attribution). */
  source?: string;
  /** Full description; the card renders a truncated form. */
  description?: string;
  /** Current approval state. */
  approval?: ApprovalState;
  /**
   * Fleet auto-dispatch routing tier (migration 0008, epic #41) — set when the
   * unit is backed by a `tasks` row that's been through `lib/tasks/tier.mjs`.
   * Rendered as a tag so the operator sees the routing before approving.
   */
  tier?: 'mechanical' | 'standard' | 'judgment' | null;
  /** Fleet auto-dispatch routing model (migration 0008, epic #41). */
  model?: 'sonnet' | 'opus' | null;
  /**
   * Derived work-state phase (ops#135, `lib/tasks/work-state.mjs::deriveWorkState`)
   * — the same single-phase badge the /ops/tasks board renders, so an operator
   * sees the true state even if a row is stale in the queued filter.
   */
  workState?: string | null;
}

export interface ApprovalCardProps {
  /** Unit metadata to render. */
  unit: ApprovalUnitSummary;
  /** Approve action — flips approval to `approved` (status proposed→pending on server). */
  onApprove?: (unit: ApprovalUnitSummary) => void;
  /** Deny action — flips approval to `denied`. */
  onDeny?: (unit: ApprovalUnitSummary) => void;
  /** Grill action — flips approval to `needs-grilling`. */
  onGrill?: (unit: ApprovalUnitSummary) => void;
  /**
   * Render the "Grill" action. Default true.
   */
  showGrill?: boolean;
  /** Disable buttons while a mutation is in flight. */
  pending?: boolean;
  /** Optional click handler for the title — typically a link to the detail view. */
  onOpenDetail?: (unit: ApprovalUnitSummary) => void;
  /** Optional className passthrough. */
  className?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const DESCRIPTION_TRUNCATE_CHARS = 240;

function truncate(text: string, max: number): string {
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * ApprovalCard — proposed-unit summary card for the autonomous build's
 * approval inbox.
 * @category Display
 * @tier utility
 *
 * Composes Card + Button + Tag into a compact decision surface for
 * a single orchestration.json unit awaiting human ratification. Renders the
 * unit's id, name, sprint / priority / cluster metadata as tag pills, the
 * source attribution, a truncated description, and three action buttons
 * (Approve / Deny / Grill) that fire callbacks the page wires to the
 * bridge endpoint.
 *
 * Purely presentational — no fetch logic lives here; a consuming page owns
 * the optimistic-update / reconcile flow and supplies the disabled flag while
 * a mutation is in flight. Currently consumerless — the tasks-store approvals
 * inbox that rendered this was retired (ops#157); cleanup tracked in ops#140.
 */
export const ApprovalCard = React.forwardRef<HTMLDivElement, ApprovalCardProps>(
  function ApprovalCard(
    {
      unit,
      onApprove,
      onDeny,
      onGrill,
      showGrill = true,
      onOpenDetail,
      pending = false,
      className,
    },
    ref,
  ) {
    const sprintLabel = typeof unit.sprint === 'number' ? `Sprint ${unit.sprint}` : null;
    const priorityLabel = typeof unit.priority === 'number' ? `Priority ${unit.priority}` : null;
    const clusterLabel = unit.cluster ? unit.cluster : null;
    const tierLabel = unit.tier ? unit.tier : null;
    const modelLabel = unit.model ? unit.model : null;

    return (
      <Card ref={ref} padding="none" className={cn('flex flex-col', className)}>
        <Card.Header>
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-mono text-muted-foreground" data-role="unit-id">
              {unit.id}
            </p>
            {unit.source ? (
              <p className="text-xs text-muted-foreground" data-role="unit-source">
                {unit.source}
              </p>
            ) : null}
          </div>
          <Card.Title>
            {onOpenDetail ? (
              <button
                type="button"
                onClick={() => onOpenDetail(unit)}
                className="text-left hover:underline focus-visible:underline focus-visible:outline-none"
                data-role="unit-title-button"
              >
                {unit.name}
              </button>
            ) : (
              unit.name
            )}
          </Card.Title>
          <div className="flex flex-wrap gap-2 pt-1" data-role="unit-meta-tags">
            {unit.workState ? (
              <Badge
                tone={(WORK_STATE_TONE[unit.workState] as BadgeTone) ?? 'neutral'}
                data-role="unit-work-state"
              >
                {unit.workState}
              </Badge>
            ) : null}
            {sprintLabel ? <Tag>{sprintLabel}</Tag> : null}
            {priorityLabel ? <Tag>{priorityLabel}</Tag> : null}
            {clusterLabel ? <Tag>{clusterLabel}</Tag> : null}
            {tierLabel ? <Tag>{tierLabel}</Tag> : null}
            {modelLabel ? <Tag>{modelLabel}</Tag> : null}
          </div>
        </Card.Header>
        {unit.description ? (
          <Card.Body>
            <Card.Description data-role="unit-description">
              {truncate(unit.description, DESCRIPTION_TRUNCATE_CHARS)}
            </Card.Description>
          </Card.Body>
        ) : null}
        <Card.Footer className="gap-2">
          <Button
            variant="primary"
            size="sm"
            disabled={pending}
            onClick={() => onApprove?.(unit)}
            aria-label={`Approve ${unit.id}`}
            data-role="approve-button"
          >
            Approve
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => onDeny?.(unit)}
            aria-label={`Deny ${unit.id}`}
            data-role="deny-button"
          >
            Deny
          </Button>
          {showGrill ? (
            <Button
              variant="tertiary"
              size="sm"
              disabled={pending}
              onClick={() => onGrill?.(unit)}
              aria-label={`Grill ${unit.id}`}
              data-role="grill-button"
            >
              Grill
            </Button>
          ) : null}
        </Card.Footer>
      </Card>
    );
  },
);

export default ApprovalCard;
