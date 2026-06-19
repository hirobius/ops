/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */
/* eslint-disable tailwindcss/no-custom-classname -- deck-slide/deck-cover/deck-footer-screen are print CSS hooks, not Tailwind classes */

/**
 * ClientBrandAuditPage — /ops/clients/:slug/brand-audit
 *
 * Renders clients/<slug>/brand-audit.json as a printable slide deck.
 * Each section is a deck-slide div with page-break-before: always under
 * @media print, so save-as-PDF produces a one-touchpoint-per-page document
 * Conrad can read in 5 minutes or hand to a designer.
 *
 * Sections:
 *   1. Cover (name, prepared-by, date)
 *   2. Method (one-paragraph summary)
 *   3-9. One slide per touchpoint (channel, status, items)
 *  10. Quick wins (numbered list)
 *  11. A note on scope (closing paragraph)
 *
 * Long-form prose for each touchpoint lives in
 * clients/<slug>/brand-audit-deck.md — this page is the at-a-glance version.
 */

import React from 'react';
import type { CSSProperties } from 'react';
import { useParams } from 'react-router';
import { Page, Stack, Badge, EmptyState } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from './PageHeader';

import type { ClientMeta } from './clientTypes';

interface Touchpoint {
  id: string;
  channel: string;
  url: string | null;
  status: string;
  items: string[];
}

interface CompetitorRef {
  name: string;
  url?: string;
  notes?: string;
}

interface BrandAuditFile {
  summary?: string;
  website?: { url?: string; platform?: string; assessment?: string; notes?: string };
  touchpoints?: Touchpoint[];
  quickWins?: string[];
  competitorReferences?: CompetitorRef[];
  deliverable?: string;
}

// ── Manifest-driven loader ────────────────────────────────────────────────────

const _audits = import.meta.glob<{ default: BrandAuditFile }>(
  '../../../../clients/*/brand-audit.json',
  { eager: true },
);
const _metas = import.meta.glob<{ default: ClientMeta }>('../../../../clients/*/meta.json', {
  eager: true,
});

function slugOf(p: string) {
  return p.match(/clients\/([^/]+)\//)?.[1] ?? '';
}
function shouldRegister(slug: string) {
  return Boolean(slug) && !slug.startsWith('_');
}

const AUDITS: Record<string, BrandAuditFile> = {};
const METAS: Record<string, ClientMeta> = {};
for (const [p, m] of Object.entries(_audits)) {
  const s = slugOf(p);
  if (shouldRegister(s)) AUDITS[s] = m.default;
}
for (const [p, m] of Object.entries(_metas)) {
  const s = slugOf(p);
  if (shouldRegister(s)) METAS[s] = m.default;
}

// ── Static long-form copy for the closing scope note ──────────────────────────
// This text mirrors the closing paragraph of the long-form
// brand-audit-deck.md. Embedded inline so the deck reads completely with no
// extra fetch — the .md remains the canonical companion doc.

const SCOPE_NOTE = `Nothing in this document is a proposal to redesign your brand. The visual identity — name, logo, color palette — is not what's being questioned. What this review found is a common and entirely fixable pattern: a professional core identity that isn't being applied consistently across all the places customers encounter the agency. The fixes are administrative, not creative. They cost time, not money, and most can be done without involving any outside vendor.`;

const METHOD_NOTE = `This review covered seven public and semi-public touchpoints where the agency appears to customers. We looked at each through the lens of a prospective customer or returning policyholder. We did not conduct a technical audit, a competitor study, or audience research. Nothing here requires a logo redesign or a rebrand — the purpose is to surface what's consistent, what's drifting, and where a small amount of effort would have a noticeable effect.`;

// ── Status mapping ────────────────────────────────────────────────────────────

type Tone = 'neutral' | 'info' | 'success' | 'danger' | 'warning';
function statusTone(status: string): Tone {
  if (status === 'audited' || status === 'complete') return 'success';
  if (status === 'in-progress') return 'warning';
  if (status === 'needs-audit' || status === 'todo') return 'info';
  return 'neutral';
}
function statusLabel(status: string): string {
  if (status === 'needs-audit') return 'Needs review';
  if (status === 'audited') return 'Reviewed';
  if (status === 'in-progress') return 'In progress';
  return status;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClientBrandAuditPage() {
  const { slug } = useParams<{ slug: string }>();
  const audit = AUDITS[slug ?? ''];
  const meta = METAS[slug ?? ''];

  if (!audit || !meta) {
    return (
      <Page maxWidth="content">
        <EmptyState title={`No brand audit found for ${slug ?? ''}`} />
      </Page>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const touchpoints = audit.touchpoints ?? [];
  const quickWins = audit.quickWins ?? [];

  return (
    <Page>
      <style>{PRINT_CSS}</style>
      <Stack direction="column" gap="spacious">
        <PageHeader
          breadcrumbs={[
            { label: 'Ops', href: '/ops' },
            { label: 'Clients', href: '/ops/clients' },
            { label: meta.name, href: `/ops/clients/${slug}` },
            { label: 'Brand Audit' },
          ]}
          title={meta.name}
        />

        {/* Cover slide */}
        <section className="deck-slide deck-cover">
          <p style={s.coverEyebrow}>Brand Observations</p>
          <h1 style={s.coverTitle}>{meta.name}</h1>
          <div style={s.coverDivider} />
          <p style={s.coverMeta}>Prepared by Hirobius</p>
          <p style={s.coverMeta}>Adrian Milsap · adrian@hirobius.com</p>
          <p style={{ ...s.coverMeta, marginTop: hds.space.px16 }}>{today}</p>
        </section>

        {/* Method slide */}
        <section className="deck-slide">
          <p style={s.eyebrow}>Method</p>
          <p style={s.bodyLarge}>{METHOD_NOTE}</p>
        </section>

        {/* Touchpoint slides */}
        {touchpoints.map((tp, i) => (
          <TouchpointSlide key={tp.id} index={i + 1} total={touchpoints.length} touchpoint={tp} />
        ))}

        {/* Quick wins slide */}
        {quickWins.length > 0 && (
          <section className="deck-slide">
            <p style={s.eyebrow}>Quick wins</p>
            <h2 style={s.slideTitle}>What we&apos;d start with</h2>
            <p style={s.bodySmall}>
              No design overhaul, no new branding decisions, no external vendor. Each is doable in a
              single sitting.
            </p>
            <ol style={s.winList}>
              {quickWins.map((win, i) => (
                <li key={i} style={s.winItem}>
                  <span style={s.winNum}>{String(i + 1).padStart(2, '0')}</span>
                  <span style={s.winText}>{win}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Scope note slide */}
        <section className="deck-slide">
          <p style={s.eyebrow}>A note on scope</p>
          <p style={s.bodyLarge}>{SCOPE_NOTE}</p>
        </section>

        {/* Footer (non-print) */}
        <footer style={s.footer} className="deck-footer-screen">
          <p style={s.uiSecondary}>
            Long-form companion: <code>clients/{slug}/brand-audit-deck.md</code>
          </p>
        </footer>
      </Stack>
    </Page>
  );
}

// ── Touchpoint slide ──────────────────────────────────────────────────────────

function TouchpointSlide({
  index,
  total,
  touchpoint,
}: {
  index: number;
  total: number;
  touchpoint: Touchpoint;
}) {
  return (
    <section className="deck-slide">
      <p style={s.eyebrow}>
        Touchpoint {index} of {total}
      </p>
      <div style={s.tpHeadRow}>
        <h2 style={s.slideTitle}>{touchpoint.channel}</h2>
        <Badge tone={statusTone(touchpoint.status)}>{statusLabel(touchpoint.status)}</Badge>
      </div>
      {touchpoint.url && <p style={s.uiSecondary}>{touchpoint.url}</p>}
      <div style={s.tpDivider} />
      <p style={s.eyebrow}>What we&apos;d look at</p>
      <ul style={s.itemList}>
        {touchpoint.items.map((item, i) => (
          <li key={i} style={s.itemRow}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Print CSS ─────────────────────────────────────────────────────────────────

const PRINT_CSS = `
.deck-slide {
  padding: ${hds.space.px24} 0;
}

@media print {
  nav, [role="navigation"], aside, .ops-shell-header, .deck-footer-screen { display: none !important; }
  body { background: white !important; color: black !important; }
  .deck-slide {
    page-break-before: always;
    break-before: page;
    page-break-inside: avoid;
    break-inside: avoid;
    min-height: 90vh;
    padding: 24pt 0;
  }
  .deck-slide:first-of-type {
    page-break-before: auto;
    break-before: auto;
  }
  .deck-cover {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    min-height: 90vh;
  }
  h1, h2, h3, h4 { color: black !important; break-after: avoid; }
  a { color: black !important; text-decoration: none !important; }
}
`;

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  // Cover
  coverEyebrow: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  },
  coverTitle: {
    ...hds.typeStyles.h1,
    color: 'var(--semantic-color-content-primary)',
    margin: `${hds.space.px16} 0 ${hds.space.px24}`,
    fontSize: '3rem',
    lineHeight: 1.05,
  },
  coverDivider: {
    width: '64px',
    height: '2px',
    background: 'var(--semantic-color-content-accent)',
    margin: `${hds.space.px16} 0 ${hds.space.px24}`,
  },
  coverMeta: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
    margin: `${hds.space.px4} 0`,
  },

  // Section eyebrow + title
  eyebrow: {
    ...hds.typeStyles.eyebrow,
    color: 'var(--semantic-color-content-secondary)',
    margin: `0 0 ${hds.space.px8}`,
  },
  slideTitle: { ...hds.typeStyles.h2, color: 'var(--semantic-color-content-primary)', margin: 0 },

  // Body copy
  bodyLarge: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    margin: 0,
    fontSize: '1.125rem',
    lineHeight: 1.6,
    maxWidth: '60ch',
  },
  bodySmall: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
    margin: `${hds.space.px8} 0 ${hds.space.px24}`,
    maxWidth: '60ch',
  },
  uiSecondary: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-secondary)',
    margin: 0,
  },

  // Touchpoint slide
  tpHeadRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: hds.space.px16,
    marginTop: hds.space.px8,
  },
  tpDivider: {
    width: '100%',
    height: '1px',
    background: 'var(--semantic-color-border-default)',
    margin: `${hds.space.px24} 0 ${hds.space.px16}`,
  },

  itemList: { listStyle: 'none', padding: 0, margin: 0 },
  itemRow: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    padding: `${hds.space.px8} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },

  // Quick wins
  winList: { listStyle: 'none', padding: 0, margin: 0 },
  winItem: {
    display: 'grid',
    gridTemplateColumns: '48px 1fr', // grid-ok: icon + text row in ops-internal print deck
    gap: hds.space.px16,
    padding: `${hds.space.px16} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
    alignItems: 'baseline',
  },
  winNum: {
    ...hds.typeStyles.h3,
    color: 'var(--semantic-color-content-accent)',
    margin: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  winText: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
    margin: 0,
    lineHeight: 1.5,
  },

  // Footer (screen only)
  footer: {
    borderTop: '1px solid var(--semantic-color-border-default)',
    paddingTop: hds.space.px16,
    marginTop: hds.space.px24,
  },
} satisfies Record<string, CSSProperties>;
