/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * LeadsPage — /ops/leads.
 *
 * A read-only viewer for the prospecting pipeline's scored leads. The Outscraper
 * CLI (scripts/outscraper-fetch.mjs --supabase) writes scored rows to the Supabase
 * `leads` table; this board polls GET /api/leads (useLeads) and ranks them by the
 * two prospecting scores:
 *
 *   leadScore  (need)  — how much the business needs a site (weak web presence).
 *   buildScore (build) — how compelling a spec site we can build from their info.
 *
 * The best target ranks high on BOTH. Sourcing stays CLI-side for now; the
 * generate/build/publish lifecycle (PR #1's PullLeadsForm + /api/lead-action) is
 * intentionally out of scope here. In prod GET /api/leads is a Vercel function; in
 * dev the trimmed Vite middleware (scripts/leads-middleware.mjs) serves the same
 * contract. No Supabase key ever reaches the browser.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { Button, Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { useLeads } from './useLeads';
import type { Lead } from './types';

type BadgeTone = 'success' | 'neutral' | 'warning' | 'danger';
type SortKey = 'lead_score' | 'build_score' | 'review_count';

// A weak/absent web presence is a BETTER target (green); a real custom site is the
// hardest sell (red). Mirrors the scorer's thesis.
const PRESENCE_TONE: Record<NonNullable<Lead['site_presence']>, BadgeTone> = {
  none: 'success',
  'social-only': 'success',
  builder: 'warning',
  custom: 'danger',
};

const STATUS_TONE: Record<string, BadgeTone> = {
  sourced: 'neutral',
  generating: 'warning',
  scored: 'success',
  sent: 'success',
  won: 'success',
  lost: 'danger',
};

function formatLastUpdated(epochMs: number | null): string {
  if (!epochMs) return 'never';
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(epochMs).toLocaleTimeString();
}

function hostOf(url: string | null): string {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `http://${url}`).hostname.replace(/^www\./i, '');
  } catch {
    return url;
  }
}

export default function LeadsPage() {
  const { leads, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useLeads();
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'lead_score',
    dir: 'desc',
  });

  const sorted = useMemo(() => {
    if (!leads) return [];
    const rows = [...leads];
    rows.sort((a, b) => {
      const av = a[sort.key] ?? -1;
      const bv = b[sort.key] ?? -1;
      return sort.dir === 'desc' ? bv - av : av - bv;
    });
    return rows;
  }, [leads, sort]);

  const summary = useMemo(() => {
    if (!leads) return '';
    const noSite = leads.filter((l) => l.site_presence === 'none' || l.site_presence === 'social-only').length;
    return `${leads.length} lead${leads.length === 1 ? '' : 's'} · ${noSite} weak/no site`;
  }, [leads]);

  function toggleSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));
  }

  function sortArrow(key: SortKey): string {
    if (sort.key !== key) return '';
    return sort.dir === 'desc' ? ' ↓' : ' ↑';
  }

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Leads' }]}
        title="Leads"
        lede="Scored prospects from the Outscraper pipeline. Need = how much they need a site; Build = how strong a spec site we can build. Best targets rank high on both."
      />

      <div style={s.statusRow}>
        <span style={s.statusLine}>
          {isOffline
            ? 'offline'
            : isInitialLoading
              ? 'loading…'
              : `${summary} · updated ${formatLastUpdated(lastUpdatedAt)}`}
        </span>
        <Button size="sm" variant="secondary" onClick={refetch}>
          refresh
        </Button>
      </div>

      {isOffline && (
        <p style={s.notice}>
          Can&apos;t reach the leads API. In dev, ensure <code style={s.code}>SUPABASE_URL</code> and{' '}
          <code style={s.code}>SUPABASE_SERVICE_ROLE_KEY</code> are set in <code style={s.code}>.env.local</code>,
          and that you&apos;re signed in to <code style={s.code}>/ops</code>.
        </p>
      )}

      {!isOffline && isInitialLoading && <p style={s.notice}>Loading leads…</p>}

      {!isOffline && leads && leads.length === 0 && (
        <p style={s.notice}>
          No leads yet — run <code style={s.code}>node scripts/outscraper-fetch.mjs --preset fencing-wa --limit 20 --supabase</code> to populate.
        </p>
      )}

      {!isOffline && sorted.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.thLeft}>Business</th>
                <th style={s.thLeft}>Location</th>
                <th style={s.thSort} onClick={() => toggleSort('lead_score')} role="button">
                  Need{sortArrow('lead_score')}
                </th>
                <th style={s.thSort} onClick={() => toggleSort('build_score')} role="button">
                  Build{sortArrow('build_score')}
                </th>
                <th style={s.thLeft}>Presence</th>
                <th style={s.thSort} onClick={() => toggleSort('review_count')} role="button">
                  Reviews{sortArrow('review_count')}
                </th>
                <th style={s.thLeft}>Phone</th>
                <th style={s.thLeft}>Website</th>
                <th style={s.thLeft}>Status</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((lead) => (
                <tr key={lead.id} style={s.tr}>
                  <td style={s.tdName}>{lead.name ?? lead.place_id ?? 'Unnamed'}</td>
                  <td style={s.td}>{[lead.city, lead.region].filter(Boolean).join(', ') || '—'}</td>
                  <td style={s.tdScore}>{lead.lead_score ?? '—'}</td>
                  <td style={s.tdScore}>{lead.build_score ?? '—'}</td>
                  <td style={s.td}>
                    {lead.site_presence ? (
                      <Badge tone={PRESENCE_TONE[lead.site_presence]}>{lead.site_presence}</Badge>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={s.tdNum}>
                    {lead.review_count ?? 0}
                    {lead.rating != null ? ` · ★${lead.rating}` : ''}
                  </td>
                  <td style={s.td}>{lead.phone ?? '—'}</td>
                  <td style={s.td}>
                    {lead.website ? (
                      <a href={lead.website} target="_blank" rel="noreferrer" style={s.link}>
                        {hostOf(lead.website)} ↗
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={s.td}>
                    <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cell: CSSProperties = {
  padding: `${hds.space.px8} ${hds.space.px12}`,
  fontSize: hds.fontSize.xs,
  color: 'var(--semantic-color-content-secondary)',
  borderBottom: '1px solid var(--semantic-color-border-default)',
  textAlign: 'left',
  whiteSpace: 'nowrap',
};

const th: CSSProperties = {
  ...hds.typeStyles.eyebrow,
  padding: `${hds.space.px8} ${hds.space.px12}`,
  textAlign: 'left',
  color: 'var(--semantic-color-content-secondary)',
  borderBottom: '1px solid var(--semantic-color-border-default)',
  whiteSpace: 'nowrap',
};

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px24,
    padding: `${hds.space.px24} ${hds.space.px24} ${hds.space.px48}`,
    minHeight: '100vh',
    background: 'var(--semantic-color-surface-page)',
  },
  statusRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  statusLine: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  notice: { margin: 0, ...hds.typeStyles.body, color: 'var(--semantic-color-content-secondary)' },
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[2],
  },
  tableWrap: { overflowX: 'auto' as const, width: '100%' },
  table: { width: '100%', borderCollapse: 'collapse' as const, borderTop: '1px solid var(--semantic-color-border-default)' },
  thLeft: th,
  thSort: { ...th, cursor: 'pointer', userSelect: 'none' as const },
  tr: {},
  td: cell,
  tdName: { ...cell, ...hds.typeStyles.ui, color: 'var(--semantic-color-content-primary)', whiteSpace: 'normal' as const },
  tdNum: { ...cell, fontFamily: hds.monoFamily, textAlign: 'right' as const },
  tdScore: {
    ...cell,
    fontFamily: hds.monoFamily,
    textAlign: 'right' as const,
    color: 'var(--semantic-color-content-primary)',
  },
  link: { ...hds.typeStyles.ui, fontSize: hds.fontSize.xs, color: 'var(--semantic-color-content-accent)', textDecoration: 'none' },
} satisfies Record<string, CSSProperties>;
