/* hds-bypass: ops-internal domain component (orchestration approvals), not an HDS primitive. */
// Approval inbox card + shared approval types. These are ops/orchestration
// domain concerns (not generic design-system primitives), so they live in the
// ops app rather than @hirobius/design-system. Built from DS primitives.
import { Card, Tag, Button } from '@hirobius/design-system';

/** Lifecycle state of an orchestration unit's approval. */
export type ApprovalState =
  | 'proposed'
  | 'needs-grilling'
  | 'approved'
  | 'denied'
  | 'pending';

/** Minimal unit shape the approval inbox renders. Pages extend this. */
export interface ApprovalUnitSummary {
  id: string;
  name?: string;
  title?: string;
  description?: string;
  approval?: ApprovalState;
  status?: string;
  phase?: string | number;
  cluster?: string;
  priority?: number;
  sprint?: number;
  proposedBy?: string;
}

export interface ApprovalCardProps {
  unit: ApprovalUnitSummary;
  pending?: boolean;
  onApprove?: () => void;
  onDeny?: () => void;
  onGrill?: () => void;
  onOpenDetail?: (unit: ApprovalUnitSummary) => void;
}

/**
 * Compact card for one pending unit in the approval inbox. Owns no fetch logic —
 * the page handles reads + optimistic mutations and passes handlers in.
 */
export function ApprovalCard({
  unit,
  pending = false,
  onApprove,
  onDeny,
  onGrill,
  onOpenDetail,
}: ApprovalCardProps) {
  const title = unit.name ?? unit.title ?? unit.id;
  return (
    <Card data-role="approval-card" data-approval-id={unit.id}>
      <Card.Header>
        <Card.Title>{title}</Card.Title>
        {unit.description ? <Card.Description>{unit.description}</Card.Description> : null}
      </Card.Header>
      <Card.Body>
        <div className="flex flex-wrap gap-2" data-role="approval-card-meta">
          <Tag>{unit.id}</Tag>
          {unit.approval ? <Tag>{unit.approval}</Tag> : null}
          {typeof unit.priority === 'number' ? <Tag>Priority {unit.priority}</Tag> : null}
          {typeof unit.sprint === 'number' ? <Tag>Sprint {unit.sprint}</Tag> : null}
          {unit.cluster ? <Tag>{unit.cluster}</Tag> : null}
          {unit.proposedBy ? <Tag>by {unit.proposedBy}</Tag> : null}
        </div>
      </Card.Body>
      <Card.Footer className="gap-2">
        <Button variant="primary" size="md" disabled={pending} onClick={onApprove} data-role="approve">
          Approve
        </Button>
        <Button variant="secondary" size="md" disabled={pending} onClick={onDeny} data-role="deny">
          Deny
        </Button>
        <Button variant="tertiary" size="md" disabled={pending} onClick={onGrill} data-role="grill">
          Grill
        </Button>
        {onOpenDetail ? (
          <Button
            variant="tertiary"
            size="md"
            disabled={pending}
            onClick={() => onOpenDetail(unit)}
            data-role="detail"
          >
            Open
          </Button>
        ) : null}
      </Card.Footer>
    </Card>
  );
}
