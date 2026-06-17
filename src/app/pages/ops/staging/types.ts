/**
 * Specimen catalog types for /ops/staging.
 *
 * Each specimen carries structured metadata so the page can be filtered,
 * sorted, and traversed programmatically — and so an external skill can
 * append new entries by writing additional `Specimen` objects (or a
 * generated module) without touching the chrome.
 */

import type { ReactNode } from 'react';

export type SpecimenStatus = 'draft' | 'review' | 'approved' | 'archived';

/** Categorical family. New families are added here, never inferred. */
export type SpecimenFamily =
  | 'page-header'
  | 'mini-tile'
  | 'stat-block'
  | 'ranked-metric'
  | 'score-viz'
  | 'header-card'
  | 'body-callout'
  | 'table'
  | 'pill-nav'
  | 'cta-band'
  | 'inline-meta';

export const FAMILY_LABELS: Record<SpecimenFamily, string> = {
  'page-header':   'Page header chrome',
  'mini-tile':     'Mini tiles',
  'stat-block':    'Plain stat blocks',
  'ranked-metric': 'Ranked metrics',
  'score-viz':     'Score visualizations',
  'header-card':   'Header-only cards',
  'body-callout':  'Body callouts',
  'table':         'Tables',
  'pill-nav':      'Pill nav',
  'cta-band':      'CTA bands',
  'inline-meta':   'Inline meta',
};

/** Family display order on the page (and the "By family" sort order). */
export const FAMILY_ORDER: readonly SpecimenFamily[] = [
  'page-header',
  'mini-tile',
  'stat-block',
  'ranked-metric',
  'score-viz',
  'header-card',
  'body-callout',
  'table',
  'pill-nav',
  'cta-band',
  'inline-meta',
] as const;

export const STATUS_LABELS: Record<SpecimenStatus, string> = {
  draft:    'Draft',
  review:   'Review',
  approved: 'Approved',
  archived: 'Archived',
};

/** Tonal mapping for the status chip — neutral defaults; success for approved. */
export type ChipTone = 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'subdued';

export const STATUS_TONE: Record<SpecimenStatus, ChipTone> = {
  draft:    'neutral',
  review:   'warning',
  approved: 'success',
  archived: 'subdued',
};

export interface SpecimenMeta {
  /** Stable id — used for keyed lists, promote refs, URL hashes. Lowercase kebab. */
  id:      string;
  name:    string;
  family:  SpecimenFamily;
  /** Free-form provenance: 'proposed', 'designforonline.com', 'skill:figma-extract', etc. */
  source:  string;
  tags?:   string[];
  status?: SpecimenStatus;
  notes?:  string;
  /** ISO date the specimen landed in the catalog. */
  added?:  string;
}

export interface Specimen extends SpecimenMeta {
  render: () => ReactNode;
}
