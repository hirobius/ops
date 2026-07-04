/**
 * ds-compat/types — hirobius-ops domain types dropped from
 * @hirobius/design-system@0.11.0. These are app-domain concepts (approval
 * workflow state, phase progress framing, agent dispatch tiering) that
 * correctly live in the app, not the shared design system. See
 * src/app/components/ds-compat/README (component files) for the paired
 * local component recreations.
 */

export type ApprovalState = 'proposed' | 'needs-grilling' | 'approved' | 'denied';

export interface ApprovalUnitSummary {
  id: string;
  title?: string;
  lane?: string;
  group?: string;
  phase?: string | number;
  approval?: ApprovalState;
}

export type PhaseHeaderTone = 'default' | 'success' | 'warning' | 'danger';

export type AgentTier = 'open-local' | 'closed-frontier';
