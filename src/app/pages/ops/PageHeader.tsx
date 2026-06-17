/* hds-bypass: ops-internal chrome. Inline styles intentional for standalone ops surfaces. */

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
import { Link } from 'react-router';
import hds from '@hirobius/design-system/tokens';

export interface BreadcrumbItem {
  label: string;
  /** When omitted, the crumb renders as the current-page label (not a link). */
  href?: string;
}

export interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  title:        string;
  lede?:        string;
}

export function PageHeader({ breadcrumbs, title, lede }: PageHeaderProps) {
  return (
    <header style={s.root}>
      {breadcrumbs && breadcrumbs.length > 0 ? (
        <nav aria-label="Breadcrumb" style={s.crumbs}>
          {breadcrumbs.map((c, i) => {
            const isLast = i === breadcrumbs.length - 1;
            return (
              <span key={`${c.label}-${i}`} style={s.crumbWrap}>
                {c.href && !isLast ? (
                  <Link to={c.href} style={s.crumbLink}>{c.label}</Link>
                ) : (
                  <span style={isLast ? s.crumbCurrent : s.crumbLink}>{c.label}</span>
                )}
                {!isLast && <span style={s.crumbSep} aria-hidden="true">·</span>}
              </span>
            );
          })}
        </nav>
      ) : null}

      <h1 style={s.title}>{title}</h1>

      {lede ? <p style={s.lede}>{lede}</p> : null}
    </header>
  );
}

const s = {
  root: {
    display:        'flex',
    flexDirection:  'column' as const,
    gap:            hds.space.px8,
    paddingBottom:  hds.space.px16,
    borderBottom:   '1px solid var(--semantic-color-border-default)',
  },
  crumbs: {
    display:    'flex',
    flexWrap:   'wrap' as const,
    alignItems: 'center',
    gap:        hds.space.px6,
  },
  crumbWrap: {
    display:    'inline-flex',
    alignItems: 'center',
    gap:        hds.space.px6,
  },
  crumbLink: {
    ...hds.typeStyles.ui,
    color:          'var(--semantic-color-content-secondary)',
    textDecoration: 'none',
  },
  crumbCurrent: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-primary)',
  },
  crumbSep: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-border-default)',
  },
  title: {
    ...hds.typeStyles.display,
    margin: 0,
    color:  'var(--semantic-color-content-primary)',
  },
  lede: {
    ...hds.typeStyles.body,
    margin:   0,
    color:    'var(--semantic-color-content-secondary)',
    maxWidth: '60ch',
  },
} satisfies Record<string, CSSProperties>;
