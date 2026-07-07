/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * FleetPage — /ops/fleet.
 *
 * Live status of each Hirobius repo, read straight from that repo's root
 * status.json on its default branch. Polls GET /api/projects (useFleet), which
 * aggregates every fleet repo's status.json from the GitHub Contents API per
 * request — so a status.json that lands on a repo's default branch shows here on
 * the next poll, no ops redeploy. Prod serves /api/projects via api/projects.ts;
 * dev via the Vite middleware (vite.config.mjs). No token reaches the browser.
 *
 * Rendered as open bands (not repeated cards) per the ops roadmap/overview rule.
 */

import { type CSSProperties } from 'react';
import { Button, Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { useFleet } from './useFleet';
import type { FleetProject } from './types';

type BadgeTone = 'success' | 'neutral' | 'warning' | 'danger';

const PHASE_TONE: Record<string, BadgeTone> = {
  planning: 'neutral',
  active: 'success',
  blocked: 'danger',
  paused: 'warning',
  shipped: 'success',
};

function formatAgo(iso: string | null): string {
  if (!iso) return 'unknown';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return iso;
  const seconds = Math.floor((Date.now() - then) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatClock(epochMs: number | null): string {
  if (!epochMs) return 'never';
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return new Date(epochMs).toLocaleTimeString();
}

function ProjectBand({ project }: { project: FleetProject }) {
  const { label, owner, repo, ref, htmlUrl, ok, status, error } = project;
  const phase = status?.phase ?? null;
  const tone: BadgeTone = phase ? (PHASE_TONE[phase] ?? 'neutral') : 'neutral';

  return (
    <section style={s.band}>
      <div style={s.bandHead}>
        <div style={s.bandTitleWrap}>
          <a href={htmlUrl} target="_blank" rel="noreferrer" style={s.repoLink}>
            {label} ↗
          </a>
          <span style={s.repoSlug}>
            {owner}/{repo}
            {ref ? `@${ref}` : ''}
          </span>
        </div>
        <div style={s.bandMeta}>
          {ok && phase ? (
            <Badge tone={tone}>{phase}</Badge>
          ) : (
            <Badge tone={ok ? 'neutral' : 'warning'}>{ok ? 'no phase' : 'no status'}</Badge>
          )}
          {ok && status?.updatedAt && <span style={s.updated}>updated {formatAgo(status.updatedAt)}</span>}
        </div>
      </div>

      {!ok && <p style={s.error}>{error ?? 'status unavailable'}</p>}

      {ok && status && (
        <>
          {status.headline && <p style={s.headline}>{status.headline}</p>}
          <div style={s.cols}>
            <div style={s.col}>
              <h3 style={s.colHead}>Next</h3>
              {status.next.length > 0 ? (
                <ul style={s.list}>
                  {status.next.map((item, i) => (
                    <li key={i} style={s.li}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={s.empty}>—</p>
              )}
            </div>
            <div style={s.col}>
              <h3 style={s.colHead}>Blocked</h3>
              {status.blocked.length > 0 ? (
                <ul style={s.list}>
                  {status.blocked.map((item, i) => (
                    <li key={i} style={{ ...s.li, ...s.liBlocked }}>
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={s.empty}>—</p>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

export default function FleetPage() {
  const { projects, error, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useFleet();

  const summary = projects
    ? `${projects.length} project${projects.length === 1 ? '' : 's'} · ${projects.filter((p) => p.ok).length} reporting`
    : '';

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Fleet' }]}
        title="Fleet"
        lede="Live status of each Hirobius repo, read straight from its status.json on the default branch. Updates the moment a status.json lands — no redeploy."
      />

      <div style={s.statusRow}>
        <span style={s.statusLine}>
          {isOffline
            ? 'offline'
            : isInitialLoading
              ? 'loading…'
              : `${summary} · updated ${formatClock(lastUpdatedAt)}`}
        </span>
        <Button size="sm" variant="secondary" onClick={refetch}>
          refresh
        </Button>
      </div>

      {isOffline && (
        <p style={s.notice}>
          Can&apos;t reach <code style={s.code}>/api/projects</code>. It needs{' '}
          <code style={s.code}>GITHUB_TOKEN</code> (Contents:read on the fleet repos) set in the Vercel
          project env — in dev, in <code style={s.code}>.env.local</code>.{error ? ` (${error})` : ''}
        </p>
      )}

      {!isOffline && isInitialLoading && <p style={s.notice}>Loading fleet status…</p>}

      {!isOffline && projects && projects.length === 0 && (
        <p style={s.notice}>No fleet repos configured. Add rows to <code style={s.code}>FLEET_REPOS</code> in <code style={s.code}>lib/fleet-status.mjs</code>.</p>
      )}

      {!isOffline && projects && projects.length > 0 && (
        <div style={s.bands}>
          {projects.map((p) => (
            <ProjectBand key={`${p.owner}/${p.repo}`} project={p} />
          ))}
        </div>
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
  bands: { display: 'flex', flexDirection: 'column' as const },
  band: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    padding: `${hds.space.px24} 0`,
    borderTop: '1px solid var(--semantic-color-border-default)',
  },
  bandHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  bandTitleWrap: { display: 'flex', alignItems: 'baseline', gap: hds.space.px12, flexWrap: 'wrap' as const },
  repoLink: {
    ...hds.typeStyles.h3,
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
  },
  repoSlug: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  bandMeta: { display: 'flex', alignItems: 'center', gap: hds.space.px12 },
  updated: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  headline: { margin: 0, ...hds.typeStyles.body, color: 'var(--semantic-color-content-primary)', maxWidth: '72ch' },
  error: { margin: 0, ...hds.typeStyles.body, color: 'var(--semantic-color-content-secondary)', fontStyle: 'italic' as const },
  cols: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
    gap: hds.space.px24,
  },
  col: { display: 'flex', flexDirection: 'column' as const, gap: hds.space.px8 },
  colHead: { margin: 0, ...hds.typeStyles.eyebrow, color: 'var(--semantic-color-content-secondary)' },
  list: { margin: 0, paddingLeft: hds.space.px16, display: 'flex', flexDirection: 'column' as const, gap: hds.space.px4 },
  li: { ...hds.typeStyles.ui, fontSize: hds.fontSize.xs, color: 'var(--semantic-color-content-primary)' },
  liBlocked: { color: 'var(--semantic-color-content-secondary)' },
  empty: { margin: 0, ...hds.typeStyles.ui, fontSize: hds.fontSize.xs, color: 'var(--semantic-color-content-secondary)' },
} satisfies Record<string, CSSProperties>;
