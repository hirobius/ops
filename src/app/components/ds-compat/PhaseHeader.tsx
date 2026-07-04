/* hds-bypass: ops-internal component. Inline styles intentional — recreates
 * a dropped design-system component (PhaseHeader, removed in
 * @hirobius/design-system@0.11.0) as an ops-domain concept. */

/**
 * PhaseHeader — header row for a build phase: name + progress + optional
 * budget, a tone accent reflecting phase status, and a right-aligned
 * trailing slot (typically a status Badge).
 */

import * as React from 'react';
import hds from '@hirobius/design-system/tokens';
import type { PhaseHeaderTone } from './types';

export interface PhaseHeaderProps {
  as?: keyof JSX.IntrinsicElements;
  name: string;
  budget?: string | number;
  done: number;
  total: number;
  tone: PhaseHeaderTone;
  trailing?: React.ReactNode;
}

const TONE_COLOR: Record<PhaseHeaderTone, string> = {
  default: 'var(--semantic-color-border-strong)',
  success: 'var(--semantic-color-feedback-success)',
  warning: 'var(--semantic-color-feedback-warning)',
  danger: 'var(--semantic-color-feedback-error)',
};

export const PhaseHeader = React.forwardRef<HTMLDivElement, PhaseHeaderProps>(
  ({ as = 'h3', name, budget, done, total, tone, trailing }, ref) => {
    const accent = TONE_COLOR[tone];
    const Heading = as;

    return (
      <div
        ref={ref}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: hds.space.px12,
          borderLeft: `3px solid ${accent}`,
          paddingLeft: hds.space.px12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: hds.space.px12, flexWrap: 'wrap' }}>
          <Heading style={{ ...hds.typeStyles.h3, margin: 0, color: 'var(--semantic-color-content-primary)' }}>
            {name}
          </Heading>
          <span
            style={{
              ...hds.typeStyles.ui,
              color: 'var(--semantic-color-content-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {done}/{total}
          </span>
          {budget !== undefined && budget !== null && budget !== '' ? (
            <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-tertiary)' }}>
              budget: {budget}
            </span>
          ) : null}
        </div>
        {trailing ? <div style={{ flexShrink: 0 }}>{trailing}</div> : null}
      </div>
    );
  },
);

PhaseHeader.displayName = 'PhaseHeader';
