/**
 * PhaseHeader — progress-bearing section header for phased project work.
 * @category Display
 * @tier utility
 * @internal — ops infrastructure, absorbed from @hirobius/design-system (the DS
 *   repo stripped its ops-flavored components). Self-contained: only the
 *   ops-local `cn` + HDS semantic CSS vars.
 */
/* hds-bypass: ops-domain component — Tailwind utility classes + semantic CSS vars, not a consumer HDS surface */
/* eslint-disable tailwindcss/no-arbitrary-value -- semantic CSS vars (bg-[var(--semantic-*)]) are the HDS token system, not raw design values */

import * as React from 'react';
import { cn } from '../../lib/utils';

const FILL_TONE = {
  default: 'bg-[var(--semantic-color-content-accent)]',
  success: 'bg-[var(--semantic-color-feedback-success)]',
  warning: 'bg-[var(--semantic-color-feedback-warning)]',
  danger: 'bg-[var(--semantic-color-feedback-error)]',
} as const;

export type PhaseHeaderTone = keyof typeof FILL_TONE;

/** @public */
export interface PhaseHeaderProps {
  name: string;
  budget?: number;
  trailing?: React.ReactNode;
  /** Number of completed tasks. */
  done: number;
  /** Total number of tasks. */
  total: number;
  /** Tone for the progress fill. */
  tone?: PhaseHeaderTone;
  /** Heading element rendered for the phase name. Defaults to 'h3'. */
  as?: 'h2' | 'h3' | 'h4';
  className?: string;
}

/**
 * Phase summary header: name + optional budget on the left, trailing slot
 * (typically a status badge) on the right, with a progress rail beneath.
 * The phase name renders as a real heading (default h3) so the page keeps
 * a valid h1 → h2 → h3 → h4 outline.
 */
export const PhaseHeader = React.forwardRef<HTMLDivElement, PhaseHeaderProps>(function PhaseHeader(
  { name, budget, trailing, done, total, tone = 'default', as: HeadingTag = 'h3', className },
  ref,
) {
  const pct = total ? Math.max(0, Math.min(Math.round((done / total) * 100), 100)) : 0;
  return (
    <div
      ref={ref}
      className={cn('flex flex-col gap-3', className)}
      data-hds-component="PhaseHeader"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <HeadingTag className="m-0 text-sm font-medium text-foreground">{name}</HeadingTag>
          {typeof budget === 'number' && (
            <p className="m-0 mt-0.5 text-sm text-muted-foreground">${budget.toLocaleString()}</p>
          )}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      <div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          className="h-1 overflow-hidden rounded-full bg-[var(--semantic-color-border-default)]"
        >
          <div
            className={cn(
              'h-full rounded-full transition-[width] duration-200 ease-out',
              FILL_TONE[tone],
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="m-0 mt-1.5 text-xs text-muted-foreground">
          {done} / {total} tasks
        </p>
      </div>
    </div>
  );
});
