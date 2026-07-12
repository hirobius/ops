/* hds-bypass: ops-internal page */

/**
 * SurfacesRail — sibling-surface jump-tiles surfaced under the page header.
 * Each tile points at a /ops/* peer page so the index can act as a real
 * launchpad rather than a dead end. The queued-for-approval count (epic #41
 * Slice 3) rides on the Tasks tile — the approvals inbox is reached through
 * /ops/tasks, not its own tile (2026-07-09).
 *
 * Outline-light: raised surface, no border. ArrowRight on the right edge.
 * Modeled on the staging "Resource link card" pattern.
 */

import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

export interface SurfaceTile {
  to: string;
  label: string;
  description: string;
}

const TILES: readonly SurfaceTile[] = [
  {
    to: '/ops/leads',
    label: 'Leads',
    description: 'Pull local businesses · generate sites · track outreach',
  },
  {
    to: '/ops/tasks',
    label: 'Tasks',
    description: 'One board — tracker, backlog, clients + GitHub issues',
  },
  {
    to: '/ops/digest',
    label: 'Digest',
    description: 'Newsletter intel, pre-triaged with an ops angle',
  },
  {
    to: '/ops/projects',
    label: 'Projects',
    description: 'Live fleet — deploy state across every Vercel project',
  },
  {
    to: '/ops/skills',
    label: 'Skills',
    description: 'Design toolkit — impeccable, shadcn, Mobbin · copy & run in Claude',
  },
] as const;

export interface SurfacesRailProps {
  /**
   * Queued-for-approval task count (epic #41 Slice 3, dispatch_status ===
   * 'queued'). Rendered as a badge on the Tasks tile — the approvals inbox
   * lives inside /ops/tasks now. null/undefined while still loading.
   */
  approvalsCount?: number | null;
}

export function SurfacesRail({ approvalsCount }: SurfacesRailProps = {}) {
  return (
    <nav aria-label="Sibling surfaces" style={s.row}>
      {TILES.map((t) => {
        const queued =
          t.to === '/ops/tasks' && typeof approvalsCount === 'number' && approvalsCount > 0
            ? approvalsCount
            : null;
        return (
          <Link key={t.to} to={t.to} className="hds-focus" style={s.tile}>
            <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
              <span style={s.tileLabel}>
                {t.label}
                {queued != null && (
                  <span style={s.tileBadge} data-role="approvals-indicator">
                    {queued} queued
                  </span>
                )}
              </span>
              <span style={s.tileDesc}>{t.description}</span>
            </Stack>
            <ArrowRight
              size={14}
              color="var(--semantic-color-content-secondary)"
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </nav>
  );
}

const s = {
  row: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap: hds.space.px12,
  } as CSSProperties,
  tile: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px16,
    padding: `${hds.space.px12} ${hds.space.px16}`,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[8],
    textDecoration: 'none' as const,
    color: 'inherit',
    minWidth: 0,
  } as CSSProperties,
  tileLabel: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: hds.space.px8,
  } as CSSProperties,
  tileBadge: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '2px 8px',
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-content-onAccent)',
  } as CSSProperties,
  tileDesc: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,
};
