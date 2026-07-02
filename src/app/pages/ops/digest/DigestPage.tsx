/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * DigestPage — /ops/digest.
 *
 * Review surface for newsletter/intel digests. Each digest is a checked-in JSON
 * under src/app/digests/*.json (produced on demand by a Claude session that
 * reads the inbox — no cron, no server keys; NOT src/app/data, which is
 * gitignored generated output). Items carry an ops-specific angle so triage is
 * "read → open link → decide", not re-reading the newsletter.
 *
 * v1 is read-only by design: approve→task promotion comes once the digest flow
 * proves out (items would post to the existing tasks surface — not a new
 * dashboard, which is exactly the "Dashboard Trap" advice in the first digest).
 */

import type { CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';

interface DigestLink {
  label: string;
  url: string;
}

interface DigestItem {
  title: string;
  summary: string;
  opsAngle: string;
  links: DigestLink[];
  tag: string;
  status: string;
}

interface DigestFile {
  date: string;
  source: string;
  subject?: string;
  items: DigestItem[];
}

// Eagerly glob all checked-in digests; newest date first.
const digestModules = import.meta.glob('../../../digests/*.json', { eager: true }) as Record<
  string,
  { default: DigestFile }
>;

const DIGESTS: DigestFile[] = Object.values(digestModules)
  .map((m) => m.default)
  .filter((d) => d && Array.isArray(d.items))
  .sort((a, b) => b.date.localeCompare(a.date));

export default function DigestPage() {
  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Digest' }]}
        title="Digest"
        lede="Newsletter intel, pre-triaged with an ops angle — read, open, decide."
      />

      {DIGESTS.length === 0 ? (
        <p style={s.empty}>
          No digests yet. Ask a Claude session to scrub the inbox — it commits a JSON under
          src/app/digests/ and this page picks it up.
        </p>
      ) : (
        DIGESTS.map((d) => (
          <section key={d.date}>
            <div style={s.sectionMeta}>
              <span style={s.sectionDate}>{d.date}</span>
              <span style={s.sectionSource}>
                {d.source}
                {d.subject ? ` — “${d.subject}”` : ''}
              </span>
            </div>

            {d.items.map((item) => (
              <article key={item.title} style={s.item}>
                <h3 style={s.itemTitle}>{item.title}</h3>
                <p style={s.itemSummary}>{item.summary}</p>
                <p style={s.itemAngle}>
                  <span style={s.itemAngleLabel}>For ops · </span>
                  {item.opsAngle}
                </p>
                <div style={s.itemMeta}>
                  <span style={s.itemTag}>{item.tag}</span>
                  {item.links.map((l) => (
                    <a
                      key={l.url}
                      href={l.url}
                      target="_blank"
                      rel="noreferrer"
                      className="hds-focus"
                      style={s.itemLink}
                    >
                      {l.label} ↗
                    </a>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px24,
    padding: `${hds.space.px24} ${hds.space.px24} ${hds.space.px48}`,
    minHeight: '100vh',
    background: 'var(--semantic-color-surface-page)',
  },
  empty: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
  },
  sectionMeta: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
    paddingBottom: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  sectionDate: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
  },
  sectionSource: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  item: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    padding: `${hds.space.px16} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  itemTitle: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  itemSummary: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-secondary)',
  },
  itemAngle: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-primary)',
  },
  itemAngleLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  itemMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
    paddingTop: hds.space.px4,
  },
  itemTag: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  itemLink: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
  },
} satisfies Record<string, CSSProperties>;
