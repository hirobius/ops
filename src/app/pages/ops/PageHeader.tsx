/**
 * PageHeader — locked-down chrome for /ops surfaces.
 *
 * Pattern (Adrian directive 2026-05-06):
 *   1. Optional breadcrumb row — ' · ' separators, last crumb non-link
 *   2. Display heading (Clash) — the visual anchor, no metadata chips
 *   3. Optional one-line lede — only when it adds information
 *   4. 1px bottom divider closing the zone
 *
 * Anti-goals:
 *   - No status badges, kpi tiles, or chips inside the header zone
 *   - No multi-line lede; if more context is needed, push it into the page body
 */

import type { CSSProperties } from 'react';
import { Breadcrumb, Text } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

export interface BreadcrumbItem {
  label: string;
  /** When omitted, the crumb renders as the current-page label (not a link). */
  href?: string;
}

export interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  lede?: string;
}

export function PageHeader({ breadcrumbs, title, lede }: PageHeaderProps) {
  return (
    <header style={s.root}>
      {breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumb items={breadcrumbs} /> : null}

      <Text as="h1" variant="display" style={s.title}>
        {title}
      </Text>

      {lede ? (
        <Text as="p" variant="body" style={s.lede}>
          {lede}
        </Text>
      ) : null}
    </header>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    paddingBottom: hds.space.px16,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  title: {
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  },
  lede: {
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
    maxWidth: '60ch',
  },
} satisfies Record<string, CSSProperties>;
