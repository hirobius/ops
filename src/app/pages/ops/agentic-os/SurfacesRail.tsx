/**
 * SurfacesRail — sibling-surface jump-tiles surfaced under the page header.
 * Each tile points at a /ops/* peer page so the index can act as a real
 * launchpad rather than a dead end.
 *
 * Outline-light: raised surface, no border. ArrowRight on the right edge.
 * Modeled on the staging "Resource link card" pattern.
 */

import type { ComponentType } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Box, Stack, Text, TileGrid, type BoxProps } from '@hirobius/design-system';

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
    to: '/ops/digest',
    label: 'Digest',
    description: 'Newsletter intel, pre-triaged with an ops angle',
  },
  {
    to: '/ops/pitch',
    label: 'Pitch',
    description: 'The call sheet — businesses with a site built and ready to show',
  },
  {
    to: '/ops/standing',
    label: 'Standing',
    description: 'The whole board — chain, blocked, in flight, queue, backlog, deploys',
  },
  {
    to: '/ops/audit',
    label: 'Audit',
    description: 'What the last fleet audit found, and what each issue is for',
  },
  {
    to: '/ops/library',
    label: 'Library',
    description: 'Every report and research artifact — audits, walkthroughs, state of play',
  },
  {
    to: '/ops/clients',
    label: 'Clients',
    description: 'Active retainers, prospects & sample builds — portals, sites, demos',
  },
] as const;

/**
 * Box forwards unknown props to its `as` element at runtime, but BoxProps only
 * types HTML attributes — so `to` needs this one narrow alias to reach Link.
 */
const LinkBox = Box as ComponentType<BoxProps & { to: string }>;

const TILE_SX = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 4,
  px: 4,
  py: 3,
  bgcolor: 'surface.raised',
  borderRadius: 'var(--component-card-radius)',
  textDecoration: 'none',
  color: 'inherit',
  minWidth: 0,
} as const;

/**
 * The `ui` role at the xs size. No Text variant is ui-at-xs (its variant
 * classes pin font-size to the role), so the role's tokens go in sx and the
 * size comes from `text-xs`; sx's unlayered rule keeps the ui line-height
 * over the one `text-xs` brings.
 */
const DESC_SX = {
  fontFamily: 'var(--semantic-typography-ui-font-family)',
  fontWeight: 'var(--semantic-typography-ui-font-weight)',
  letterSpacing: 'var(--semantic-typography-ui-letter-spacing)',
  lineHeight: 'var(--semantic-typography-ui-line-height)',
  maxWidth: 'var(--semantic-typography-ui-max-width)',
  color: 'content.secondary',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

export function SurfacesRail() {
  return (
    <nav aria-label="Sibling surfaces">
      <TileGrid minTileWidth="260px" gap="sm">
        {TILES.map((t) => (
          <LinkBox key={t.to} as={Link} to={t.to} className="hds-focus" sx={TILE_SX}>
            <Stack direction="column" gap="px2" className="min-w-0">
              <Text as="span" variant="body" className="text-foreground">
                {t.label}
              </Text>
              <Box as="span" className="text-xs" sx={DESC_SX}>
                {t.description}
              </Box>
            </Stack>
            <ArrowRight
              size={14}
              color="var(--semantic-color-content-secondary)"
              aria-hidden="true"
            />
          </LinkBox>
        ))}
      </TileGrid>
    </nav>
  );
}
