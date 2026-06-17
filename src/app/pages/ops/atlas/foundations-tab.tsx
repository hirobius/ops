/* hds-bypass: ops-internal page */

/**
 * FoundationsTab — operator entry into the HDS foundation documentation.
 *
 * /ops/atlas is the operator command center; the canonical foundation pages
 * still live at /hds/* (the public-facing design-system surface). This tab
 * surfaces a one-line operator summary for each foundation and route-throughs
 * into the corresponding /hds page rather than duplicating their content.
 *
 * Decision (t_ada3aa9f, 2026-05-10): route-through over inline embed. The
 * /hds pages stay the single source of truth so we never fork their layout
 * or content; Atlas just becomes the discovery point.
 *
 * @category Internal
 * @tier utility
 */

import React from 'react';
import { Card } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';

// ── Data ──────────────────────────────────────────────────────────────────────

interface FoundationLink {
  slug: string; // /hds path segment
  title: string; // display name
  summary: string; // one-line operator-facing summary
}

const FOUNDATIONS: FoundationLink[] = [
  {
    slug: 'typography',
    title: 'Typography',
    summary: 'Clash Display for headings, Satoshi for body/UI, Geist Mono for technical readouts.',
  },
  {
    slug: 'color',
    title: 'Color',
    summary: 'One electric-blue accent + monochrome neutrals; feedback hues never decorative.',
  },
  {
    slug: 'spacing',
    title: 'Spacing',
    summary: '4-px base scale (px4–px64) with semantic component/section bundles.',
  },
  {
    slug: 'shape',
    title: 'Shape',
    summary: '4 px action radius, 8 px container default, full for pills only.',
  },
  {
    slug: 'elevation',
    title: 'Elevation',
    summary:
      'Four bundled roles (flat / raised / floating / overlay) pairing surface + shadow + border.',
  },
  {
    slug: 'motion',
    title: 'Motion',
    summary: 'Controlled, deliberate timing curves; never bouncy, never decorative.',
  },
  {
    slug: 'breakpoints',
    title: 'Breakpoints',
    summary: 'Mobile-first responsive scale wired through HdsResponsive primitives.',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function FoundationsTab() {
  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <span style={s.headerTitle}>HDS Foundations</span>
        <span style={s.headerMeta}>
          {FOUNDATIONS.length} foundation pages — canonical surfaces live under /hds
        </span>
      </div>

      <div style={s.grid}>
        {FOUNDATIONS.map((f) => (
          <a key={f.slug} href={`/hds/${f.slug}`} className="hds-focus" style={s.linkReset}>
            <Card tone="default" padding="component">
              <Card.Header>
                <Card.Title style={s.cardTitle}>{f.title}</Card.Title>
                <Card.Description style={s.cardDesc}>/hds/{f.slug}</Card.Description>
              </Card.Header>
              <Card.Body>
                <p style={s.summary}>{f.summary}</p>
              </Card.Body>
            </Card>
          </a>
        ))}
      </div>
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  wrap: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px16,
  } satisfies React.CSSProperties,
  headerRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    paddingBottom: hds.space.px8,
  } satisfies React.CSSProperties,
  headerTitle: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,
  headerMeta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: hds.semantic.space.section.inset,
  } satisfies React.CSSProperties,
  linkReset: {
    textDecoration: 'none',
    color: 'inherit',
  } satisfies React.CSSProperties,
  cardTitle: {
    margin: '0 0 4px',
    fontSize: hds.typeStyles.h3.fontSize,
    fontWeight: hds.typeStyles.h3.fontWeight,
    lineHeight: hds.typeStyles.h3.lineHeight,
    color: 'var(--semantic-color-content-primary)',
  } satisfies React.CSSProperties,
  cardDesc: {
    margin: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.typeStyles.caption.fontSize,
    color: 'var(--semantic-color-content-tertiary)',
  } satisfies React.CSSProperties,
  summary: {
    margin: 0,
    fontSize: hds.typeStyles.body.fontSize,
    lineHeight: hds.typeStyles.body.lineHeight,
    color: 'var(--semantic-color-content-secondary)',
  } satisfies React.CSSProperties,
};
