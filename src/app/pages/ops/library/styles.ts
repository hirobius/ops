/* hds-bypass: ops-internal page. Token-only inline styles for layout HDS has no primitive for. */

/**
 * Shared styles for `/ops/library`. Every value is an HDS token or semantic CSS
 * var; nothing here is a raw colour or pixel size.
 *
 * @category Internal
 * @tier utility
 */

import type { CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';

export const s = {
  eyebrow: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  h2: {
    ...hds.typeStyles.h2,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  h3: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  lede: {
    ...hds.typeStyles.body,
    margin: 0,
    maxWidth: '68ch',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  body: {
    ...hds.typeStyles.ui,
    margin: 0,
    maxWidth: '72ch',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  caption: {
    ...hds.typeStyles.caption,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  // Open bands separated by a divider, not repeated outlined cards — the
  // roadmap/status rule in the design system's CLAUDE.md.
  band: {
    display: 'flex',
    gap: hds.space.px12,
    alignItems: 'flex-start',
    padding: `${hds.space.px16} 0`,
    borderTop: '1px solid var(--semantic-color-border-default)',
  } as CSSProperties,
  bandHead: {
    display: 'flex',
    gap: hds.space.px8,
    flexWrap: 'wrap',
    alignItems: 'baseline',
  } as CSSProperties,
  bandTitle: {
    ...hds.typeStyles.body,
    fontWeight: hds.fontWeight.semibold ?? 600,
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
  } as CSSProperties,
  mono: {
    ...hds.typeStyles.monoSm,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  rank: {
    ...hds.typeStyles.h3,
    fontFamily: hds.monoFamily,
    color: 'var(--semantic-color-content-accent)',
    minWidth: hds.space.px32,
    flexShrink: 0,
  } as CSSProperties,
  link: {
    color: 'var(--semantic-color-content-accent)',
  } as CSSProperties,
  thButton: {
    all: 'unset',
    ...hds.typeStyles.labelTechnical,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  tdNum: {
    fontFamily: hds.monoFamily,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  } as CSSProperties,
  sub: {
    ...hds.typeStyles.caption,
    display: 'block',
    marginTop: hds.space.px2,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  frame: {
    width: '100%',
    height: '80vh',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    background: 'var(--semantic-color-surface-base)',
  } as CSSProperties,
};
