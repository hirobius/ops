/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * LeadsPage — /ops/leads.
 *
 * The dashboard surface for the lead-gen + AI-agent pipeline ported from
 * hirobius/clients (see docs OPS-INTEGRATION brief, Part 2):
 *
 *   1. "Pull leads" (niche + metro)  → POST /api/pull-leads  → rows status='sourced'
 *   2. per-lead "Generate site"      → POST /api/generate-site → row status='scored'
 *   3. the board polls GET /api/leads (useLeads) and renders live status
 *
 * Data persists in the Supabase `leads` table. In prod the /api/* routes are
 * Vercel functions; in dev the Vite middleware (scripts/leads-middleware.mjs)
 * serves the same contract. NOTE: pullLeads + runPipeline are STUBS until the
 * real source is ported into lib/lead-gen + lib/agent — the flow is real, the
 * data is mock.
 */

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Button } from '@hirobius/design-system';
import { Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { useLeads } from './useLeads';
import { PullLeadsForm } from './PullLeadsForm';
import type { Lead, LeadStatus, SiteStatus } from './types';

type BadgeTone = 'success' | 'neutral' | 'warning' | 'danger';

const STATUS_TONE: Record<LeadStatus, BadgeTone> = {
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

function metaLine(lead: Lead): string {
  const parts: string[] = [];
  if (lead.category) parts.push(lead.category);
  const place = [lead.city, lead.region].filter(Boolean).join(', ');
  if (place) parts.push(place);
  if (lead.rating != null) {
    parts.push(`★ ${lead.rating}${lead.review_count != null ? ` (${lead.review_count})` : ''}`);
  }
  return parts.join('  ·  ');
}

export default function LeadsPage() {
  const { leads, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useLeads();
  const [generatingIds, setGeneratingIds] = useState<ReadonlySet<string>>(new Set());
  const [siteBusyIds, setSiteBusyIds] = useState<ReadonlySet<string>>(new Set());

  const handleGenerate = useCallback(
    async (leadId: string) => {
      setGeneratingIds((prev) => new Set(prev).add(leadId));
      try {
        await fetch('/api/generate-site', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId }),
        });
      } catch {
        /* surfaced via row status on next poll */
      } finally {
        setGeneratingIds((prev) => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        refetch();
      }
    },
    [refetch],
  );

  // Build (unpublished) or publish a lead's Duda site. One in-flight action per lead.
  const handleSiteAction = useCallback(
    async (leadId: string, endpoint: string) => {
      setSiteBusyIds((prev) => new Set(prev).add(leadId));
      try {
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId }),
        });
      } catch {
        /* surfaced via row site_status on next poll */
      } finally {
        setSiteBusyIds((prev) => {
          const next = new Set(prev);
          next.delete(leadId);
          return next;
        });
        refetch();
      }
    },
    [refetch],
  );

  function renderSiteActions(lead: Lead) {
    if (siteBusyIds.has(lead.id)) {
      const publishing = lead.site_status === 'built' || lead.site_status === 'publish_failed';
      return <span style={s.score}>{publishing ? 'Publishing…' : 'Building…'}</span>;
    }
    const st: SiteStatus = lead.site_status ?? 'none';
    if (st === 'building') return <span style={s.score}>Building…</span>;
    if (st === 'publishing') return <span style={s.score}>Publishing…</span>;
    if (st === 'published') {
      return lead.live_url ? (
        <a href={lead.live_url} target="_blank" rel="noreferrer" style={s.linkAction}>
          Live ↗
        </a>
      ) : null;
    }
    if (st === 'built' || st === 'publish_failed') {
      return (
        <>
          {lead.preview_url && (
            <a href={lead.preview_url} target="_blank" rel="noreferrer" style={s.linkAction}>
              Preview ↗
            </a>
          )}
          <button
            type="button"
            onClick={() => handleSiteAction(lead.id, '/api/publish-site')}
            style={s.genButton}
          >
            {st === 'publish_failed' ? 'Retry publish' : 'Publish'}
          </button>
        </>
      );
    }
    // 'none' / 'build_failed' — only offer build once there's a config to build from
    if (lead.status === 'scored' || lead.config != null) {
      return (
        <button
          type="button"
          onClick={() => handleSiteAction(lead.id, '/api/build-site')}
          style={s.genButton}
        >
          {st === 'build_failed' ? 'Retry build' : 'Build site'}
        </button>
      );
    }
    return null;
  }

  const summary = useMemo(() => {
    if (!leads) return '';
    const scored = leads.filter((l) => l.status === 'scored' || l.status === 'sent').length;
    return `${leads.length} lead${leads.length === 1 ? '' : 's'} · ${scored} scored`;
  }, [leads]);

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Leads' }]}
        title="Leads"
        lede="Pull local businesses, generate a site config per lead with the agent, and track each one from sourced to sent."
      />

      <section style={s.formSlot} aria-label="Pull leads">
        <PullLeadsForm onInserted={() => refetch()} />
      </section>

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
          Can&apos;t reach the leads API. In dev, ensure <code style={s.code}>SUPABASE_URL</code>{' '}
          and <code style={s.code}>SUPABASE_SERVICE_ROLE_KEY</code> are set in{' '}
          <code style={s.code}>.env.local</code>.
        </p>
      )}

      {!isOffline && isInitialLoading && <p style={s.notice}>Loading leads…</p>}

      {!isOffline && leads && leads.length === 0 && (
        <p style={s.notice}>No leads yet — pull some above to get started.</p>
      )}

      {!isOffline && leads && leads.length > 0 && (
        <ul style={s.list}>
          {leads.map((lead) => {
            const inFlight = generatingIds.has(lead.id) || lead.status === 'generating';
            return (
              <li key={lead.id} style={s.row}>
                <div style={s.rowMain}>
                  <span style={s.name}>{lead.name ?? lead.place_id ?? 'Unnamed'}</span>
                  <span style={s.meta}>{metaLine(lead)}</span>
                </div>
                <div style={s.rowAside}>
                  {lead.qualified && !lead.has_website && <Badge tone="warning">no website</Badge>}
                  {lead.eval_score != null && (
                    <span style={s.score}>
                      score {Math.round(lead.eval_score)}
                      {lead.eval_pass != null ? (lead.eval_pass ? ' · pass' : ' · review') : ''}
                    </span>
                  )}
                  <Badge tone={STATUS_TONE[lead.status] ?? 'neutral'}>{lead.status}</Badge>
                  <button
                    type="button"
                    disabled={inFlight}
                    onClick={() => handleGenerate(lead.id)}
                    style={inFlight ? s.genButtonDisabled : s.genButton}
                  >
                    {inFlight
                      ? 'Generating…'
                      : lead.status === 'sourced'
                        ? 'Generate site'
                        : 'Regenerate'}
                  </button>
                  {renderSiteActions(lead)}
                </div>
              </li>
            );
          })}
        </ul>
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
  formSlot: {
    display: 'flex',
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
  notice: {
    margin: 0,
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-secondary)',
  },
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius[2],
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    borderTop: '1px solid var(--semantic-color-border-default)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px16,
    flexWrap: 'wrap' as const,
    padding: `${hds.space.px12} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  rowMain: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    minWidth: 0,
    flex: '1 1 16rem',
  },
  name: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-primary)',
  },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  rowAside: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  score: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  linkAction: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
  },
  genButton: {
    ...hds.typeStyles.ui,
    padding: '6px 14px',
    minHeight: '36px',
    border: '1px solid var(--semantic-color-content-accent)',
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-raised)',
    cursor: 'pointer',
    flex: '0 0 auto',
  },
  genButtonDisabled: {
    ...hds.typeStyles.ui,
    padding: '6px 14px',
    minHeight: '36px',
    border: '1px solid var(--semantic-color-border-subdued)',
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    cursor: 'not-allowed',
    flex: '0 0 auto',
  },
} satisfies Record<string, CSSProperties>;
