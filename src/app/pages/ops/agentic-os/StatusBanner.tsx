/* hds-bypass: ops-internal page */

/**
 * StatusBanner — one-line triage at the top of /ops.
 *
 * Errors > stale > healthy. Reads from data.computeTriage() so the page
 * shell doesn't need to assemble pieces.
 */

import type { CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { TriageState } from './data';

const TONE: Record<
  TriageState['status'],
  { label: string; color: string; bg: string; symbol: string }
> = {
  healthy: {
    label: 'Healthy',
    symbol: '✓',
    color: 'var(--semantic-color-feedback-success)',
    bg: 'var(--semantic-color-feedback-bg-success)',
  },
  stale: {
    label: 'Stale',
    symbol: '⚠',
    color: 'var(--semantic-color-feedback-warning)',
    bg: 'var(--semantic-color-feedback-bg-warning)',
  },
  errors: {
    label: 'Reverts',
    symbol: '✗',
    color: 'var(--semantic-color-feedback-error)',
    bg: 'var(--semantic-color-feedback-bg-error)',
  },
};

export function StatusBanner({ triage }: { triage: TriageState }) {
  const tone = TONE[triage.status];
  return (
    <div role="status" aria-live="polite">
      <Stack
        direction="row"
        align="center"
        wrap="wrap"
        gap="px12"
        style={{
          background:   tone.bg,
          borderColor:  tone.color,
          padding:      `${hds.space.px12} ${hds.space.px16}`,
          borderRadius: hds.borderRadius.md,
          border:       '1px solid',
          minHeight:    '44px',
        }}
      >
        <span aria-hidden="true" style={{ ...s.symbol, color: tone.color }}>{tone.symbol}</span>
        <span style={{ ...s.label, color: tone.color }}>{tone.label}</span>
        <span style={s.message}>{triage.message}</span>
      </Stack>
    </div>
  );
}

const s = {
  symbol: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.lg,
    lineHeight: 1,
  } as CSSProperties,
  label: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: dashboard banner state-tag
    letterSpacing: '0.08em',
  } as CSSProperties,
  message: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    flex: '1 1 auto' as const,
    minWidth: 0,
  } as CSSProperties,
};
