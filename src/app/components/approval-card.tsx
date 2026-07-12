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

export interface ApprovalUnitSummary {
  /** Unit id — a tasks-store `task.key`. */
  id: string;
  /** Human-readable unit name. */
  name: string;
  /** Task priority (tasks-store `priority`). */
  priority?: 'high' | 'med' | 'low' | null;
  /** Task due date (tasks-store `due`, ISO date). */
  due?: string | null;
  /** Cluster tag grouping units in the approval inbox. */
  cluster?: string;
  /** Where the unit was proposed from (free-text source attribution). */
  source?: string;
  /** Full description; the card renders a truncated form. */
  description?: string;
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

/** high=danger, med=warning, low=neutral — mirrors taskMeta.ts::priorityTone. */
function priorityTone(priority: 'high' | 'med' | 'low'): BadgeTone {
  return priority === 'high' ? 'danger' : priority === 'med' ? 'warning' : 'neutral';
}

// ── Component ──────────────────────────────────────────────────────────────────

/**
 * ApprovalCard — proposed-task summary card for the tasks-store approval inbox.
 * @category Display
 * @tier utility
 *
 * Composes Card + Button + Tag into a compact decision surface for a single
 * `dispatch_status='queued'` task awaiting human ratification. Renders the
 * task's id, name, priority / due / tier / model metadata as tag pills, the
 * source attribution, a truncated description, and Approve / Deny action
 * buttons that fire callbacks the page wires to the tasks-store mutation.
 *
 * Purely presentational — no fetch logic lives here. The page
 * (src/app/pages/admin/Approvals.tsx) owns the optimistic-update / reconcile
 * flow and supplies the disabled flag while a mutation is in flight.
 */
export const ApprovalCard = React.forwardRef<HTMLDivElement, ApprovalCardProps>(
  function ApprovalCard({ unit, onApprove, onDeny, onOpenDetail, pending = false, className }, ref) {
    const priorityLabel = unit.priority ? unit.priority.toUpperCase() : null;
    const dueLabel = unit.due ? `due ${unit.due}` : null;
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
            {priorityLabel ? (
              <Badge
                tone={priorityTone(unit.priority as 'high' | 'med' | 'low')}
                data-role="unit-priority"
              >
                {priorityLabel}
              </Badge>
            ) : null}
            {dueLabel ? <Tag data-role="unit-due">{dueLabel}</Tag> : null}
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
        </Card.Footer>
      </Card>
    );
  },
);

export default ApprovalCard;
