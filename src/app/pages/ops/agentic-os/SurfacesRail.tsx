/* hds-bypass: ops-internal page */

/**
 * SurfacesRail — sibling-surface jump-tiles surfaced under the page header.
 * Each tile points at a /ops/* peer page (Atlas, Kanban, etc.) so the index
 * can act as a real launchpad rather than a dead end.
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
  { to: '/ops/atlas', label: 'Atlas', description: 'Components · tokens · pipeline · strength' },
  {
    to: '/ops/leads',
    label: 'Leads',
    description: 'Pull local businesses · generate sites · track outreach',
  },
  {
    to: '/ops/tasks',
    label: 'Tasks',
    description: 'Consolidated task board — tracker + backlog + clients',
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
  { to: '/ops/knowledge', label: 'Knowledge', description: 'Build · Grow · Run — ops pillar hub' },
  {
    to: '/ops/staging',
    label: 'Staging',
    description: 'Specimen catalog — filter, promote to HDS',
  },
] as const;

export function SurfacesRail() {
  return (
    <nav aria-label="Sibling surfaces" style={s.row}>
      {TILES.map((t) => (
        <Link key={t.to} to={t.to} className="hds-focus" style={s.tile}>
          <Stack direction="column" gap="px2" style={{ minWidth: 0 }}>
            <span style={s.tileLabel}>{t.label}</span>
            <span style={s.tileDesc}>{t.description}</span>
          </Stack>
          <ArrowRight
            size={14}
            color="var(--semantic-color-content-secondary)"
            aria-hidden="true"
          />
        </Link>
      ))}
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
