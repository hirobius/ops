/* hds-bypass: ops-internal component. Inline styles intentional — recreates
 * a dropped design-system component (ApprovalCard, removed in
 * @hirobius/design-system@0.11.0) as an ops-domain concept. */

/**
 * ApprovalCard — one pending-unit card in the /admin/approvals inbox.
 * Approve / Deny / Grill mutate approval state via the caller's handlers;
 * Open detail navigates to the full ApprovalDetail page.
 */

import * as React from 'react';
import { Badge, Button, Card, Stack } from '@hirobius/design-system';
import type { ApprovalState, ApprovalUnitSummary } from './types';

export interface ApprovalCardProps {
  unit: ApprovalUnitSummary & { approval?: ApprovalState };
  pending: boolean;
  onApprove: () => void;
  onDeny: () => void;
  onGrill: () => void;
  onOpenDetail: (unit: ApprovalUnitSummary) => void;
}

const APPROVAL_TONE: Record<ApprovalState, 'info' | 'warning' | 'success' | 'danger'> = {
  proposed: 'info',
  'needs-grilling': 'warning',
  approved: 'success',
  denied: 'danger',
};

export const ApprovalCard = React.forwardRef<HTMLDivElement, ApprovalCardProps>(
  ({ unit, pending, onApprove, onDeny, onGrill, onOpenDetail }, ref) => {
    return (
      <Card ref={ref} tone="default" bordered>
        <Card.Header
          metadata={unit.approval ? <Badge tone={APPROVAL_TONE[unit.approval]}>{unit.approval}</Badge> : undefined}
        >
          <Card.Title>{unit.title ?? unit.id}</Card.Title>
        </Card.Header>
        <Card.Footer>
          <Stack direction="row" gap="tight" wrap="wrap">
            <Button variant="primary" tone="success" size="sm" disabled={pending} onClick={onApprove}>
              Approve
            </Button>
            <Button variant="secondary" tone="danger" size="sm" disabled={pending} onClick={onDeny}>
              Deny
            </Button>
            <Button variant="secondary" tone="warning" size="sm" disabled={pending} onClick={onGrill}>
              Grill
            </Button>
            <Button variant="tertiary" size="sm" disabled={pending} onClick={() => onOpenDetail(unit)}>
              Open detail
            </Button>
          </Stack>
        </Card.Footer>
      </Card>
    );
  },
);

ApprovalCard.displayName = 'ApprovalCard';
