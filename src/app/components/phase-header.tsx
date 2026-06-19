/* hds-bypass: ops-internal domain component (build/client phases), not an HDS primitive. */
// PhaseHeader — heading row for a phase section on the client dashboard, with an
// optional progress count and a trailing slot (e.g. a status Badge). Ops domain,
// so it lives in the ops app rather than @hirobius/design-system.
import type { ElementType, ReactNode } from 'react';

export type PhaseHeaderTone = 'default' | 'success' | 'warning' | 'danger';

export interface PhaseHeaderProps {
  name: string;
  as?: ElementType;
  budget?: string | number;
  done?: number;
  total?: number;
  tone?: PhaseHeaderTone;
  trailing?: ReactNode;
}

const TONE_COLOR: Record<PhaseHeaderTone, string> = {
  default: 'var(--semantic-color-content-primary)',
  success: 'var(--semantic-color-feedback-success)',
  warning: 'var(--semantic-color-feedback-warning)',
  danger: 'var(--semantic-color-feedback-error)',
};

export function PhaseHeader({
  name,
  as,
  budget,
  done,
  total,
  tone = 'default',
  trailing,
}: PhaseHeaderProps) {
  const Heading = (as ?? 'h3') as ElementType;
  const showProgress = typeof done === 'number' && typeof total === 'number';
  return (
    <div className="flex items-baseline justify-between gap-4" data-role="phase-header">
      <div className="flex items-baseline gap-3">
        <Heading style={{ margin: 0, color: TONE_COLOR[tone] }}>{name}</Heading>
        {showProgress ? (
          <span className="text-sm text-muted-foreground" data-role="phase-progress">
            {done}/{total}
          </span>
        ) : null}
        {budget != null ? (
          <span className="text-sm text-muted-foreground" data-role="phase-budget">
            · {budget}
          </span>
        ) : null}
      </div>
      {trailing ? <div data-role="phase-trailing">{trailing}</div> : null}
    </div>
  );
}
