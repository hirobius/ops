/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * ProjectsPage — /ops/projects.
 *
 * Live fleet status: every Vercel project with its latest deployment state,
 * target, commit, and link. Backed by GET /api/projects (lib/projects — one
 * Vercel API call), polled via usePoll. This is the ops-as-hub surface: agents
 * read the same endpoint for cross-project context instead of crawling repos.
 *
 * Until VERCEL_TOKEN is set in the env the endpoint 503s and this page renders
 * the setup hint (same graceful pattern as the Leads board pre-key).
 */

import type { CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { usePoll } from '../../../lib/usePoll';

interface ProjectCommit {
  ref: string | null;
  message: string | null;
  sha: string | null;
  repo: string | null;
}

interface ProjectDeployment {
  state: string;
  url: string | null;
  createdAt: number | null;
  target: string | null;
  commit: ProjectCommit;
}

interface ProjectStatus {
  id: string;
  name: string;
  framework: string | null;
  updatedAt: number | null;
  latestDeployment: ProjectDeployment | null;
}

interface ProjectsResponse {
  projects?: ProjectStatus[];
  error?: string;
  code?: string;
}

const STATE_COLOR: Record<string, string> = {
  READY: 'var(--semantic-color-feedback-success)',
  ERROR: 'var(--semantic-color-feedback-error)',
  BUILDING: 'var(--semantic-color-feedback-warning)',
  QUEUED: 'var(--semantic-color-feedback-warning)',
  INITIALIZING: 'var(--semantic-color-feedback-warning)',
  CANCELED: 'var(--semantic-color-content-secondary)',
};

function ago(epochMs: number | null): string {
  if (!epochMs) return '—';
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ProjectsPage() {
  const { data, error, isInitialLoading, lastUpdatedAt } = usePoll<ProjectsResponse>(
    async (signal) => {
      const res = await fetch('/api/projects', { signal });
      const body = (await res.json()) as ProjectsResponse;
      if (!res.ok) {
        throw new Error(body.code === 'ENV_MISSING_VERCEL_TOKEN' ? 'ENV_MISSING_VERCEL_TOKEN' : body.error || `HTTP ${res.status}`);
      }
      return body;
    },
    { intervalMs: 60_000, offlineIntervalMs: 180_000 },
  );

  const projects = data?.projects ?? [];
  const needsToken = error === 'ENV_MISSING_VERCEL_TOKEN';

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Projects' }]}
        title="Projects"
        lede="Live fleet — every Vercel project, latest deploy state, straight from the API."
      />

      {needsToken ? (
        <p style={s.notice}>
          Set <code style={s.code}>VERCEL_TOKEN</code> (read-scoped) and optional{' '}
          <code style={s.code}>VERCEL_TEAM_ID</code> in the hirobius-ops env to light this up.
        </p>
      ) : error && projects.length === 0 && !isInitialLoading ? (
        <p style={s.notice}>Couldn’t reach /api/projects — {error}</p>
      ) : isInitialLoading ? (
        <p style={s.notice}>Loading fleet…</p>
      ) : (
        <>
          <div style={s.statusLine}>
            {projects.length} projects · updated {ago(lastUpdatedAt)}
          </div>
          <ul style={s.list}>
            {projects.map((p) => {
              const d = p.latestDeployment;
              return (
                <li key={p.id} style={s.row}>
                  <div style={s.rowMain}>
                    <span style={s.name}>{p.name}</span>
                    <span style={s.meta}>
                      {d?.commit.ref ? `${d.commit.ref} · ` : ''}
                      {d?.commit.message ?? 'no deployments yet'}
                    </span>
                  </div>
                  <div style={s.rowSide}>
                    <span style={{ ...s.state, color: STATE_COLOR[d?.state ?? ''] ?? 'var(--semantic-color-content-secondary)' }}>
                      {d ? `${d.state}${d.target === 'production' ? ' · prod' : ''}` : '—'}
                    </span>
                    <span style={s.when}>{ago(d?.createdAt ?? null)}</span>
                    {d?.url ? (
                      <a href={`https://${d.url}`} target="_blank" rel="noreferrer" className="hds-focus" style={s.link}>
                        open ↗
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </>
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
  statusLine: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
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
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    maxWidth: '48rem',
  },
  rowSide: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  state: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
  },
  when: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  link: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
  },
} satisfies Record<string, CSSProperties>;
