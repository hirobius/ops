/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * TasksPage — /ops/tasks.
 *
 * The consolidated task board over the Supabase `tasks` table (migration 0003):
 * the markdown tracker, BACKLOG.md, and clients/*.json merged into one source of
 * truth (see docs/operations/tasks-consolidation.md). Reads GET /api/tasks
 * (useTasks polls); mutates via POST /api/task-action.
 *
 * CTAs map to the agent-native model:
 *   - Done / Reopen → status
 *   - Dispatch → opens a GitHub issue that @mentions Claude (the agentic-loop
 *     hand-off; GitHub spins up a Claude Code session — no Claude API). Needs
 *     GITHUB_TOKEN; the row gets a dispatch_url + claimed_by='claude'.
 *   - Trash → soft-delete (deleted_at).
 */

import { useCallback, useMemo, useState, type CSSProperties } from 'react';
import { Button, Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { opsApi } from '../../../lib/opsApi';
import { useTasks } from './useTasks';
import type { Task, TaskStatus, TaskAction } from './types';

type BadgeTone = 'success' | 'neutral' | 'warning' | 'danger';
type StatusFilter = TaskStatus | 'all';

const STATUS_TONE: Record<TaskStatus, BadgeTone> = {
  open: 'neutral',
  blocked: 'warning',
  done: 'success',
};

// Fleet auto-dispatch tier (migration 0008, epic #41) — computed by
// lib/tasks/tier.mjs::routeTask; rendered here whenever a row has one, empty
// otherwise (Slice 2's dispatcher owns writing these).
const TIER_TONE: Record<NonNullable<Task['tier']>, BadgeTone> = {
  mechanical: 'neutral',
  standard: 'neutral',
  judgment: 'warning',
};

const STATUS_FILTERS: StatusFilter[] = ['open', 'blocked', 'done', 'all'];

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

function metaLine(t: Task): string {
  const parts: string[] = [t.source];
  if (t.phase) parts.push(t.phase);
  if (t.priority) parts.push(`P:${t.priority}`);
  if (t.effort) parts.push(`E:${t.effort}`);
  if (t.owner) parts.push(`@${t.owner}`);
  if (t.due) parts.push(`due ${t.due}`);
  return parts.join('  ·  ');
}

function formatLastUpdated(epochMs: number | null): string {
  if (!epochMs) return 'never';
  const s = Math.floor((Date.now() - epochMs) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return new Date(epochMs).toLocaleTimeString();
}

export default function TasksPage() {
  const { tasks, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useTasks();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const sourceFilters = useMemo(() => {
    if (!tasks) return ['all'];
    const seen = new Set<string>();
    for (const t of tasks) if (t.source) seen.add(t.source);
    return ['all', ...[...seen].sort()];
  }, [tasks]);

  const importIssues = useCallback(async () => {
    setImporting(true);
    try {
      await opsApi.post('/api/tasks');
    } catch {
      /* surfaced on next poll */
    } finally {
      setImporting(false);
      refetch();
    }
  }, [refetch]);

  const act = useCallback(
    async (key: string, action: TaskAction) => {
      setBusyKeys((prev) => new Set(prev).add(key));
      try {
        await opsApi.post('/api/task-action', { key, action });
      } catch {
        /* surfaced on next poll */
      } finally {
        setBusyKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
        refetch();
      }
    },
    [refetch],
  );

  const filtered = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(
      (t) =>
        (statusFilter === 'all' || t.status === statusFilter) &&
        (sourceFilter === 'all' || t.source === sourceFilter),
    );
  }, [tasks, statusFilter, sourceFilter]);

  const byLane = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of filtered) {
      const arr = map.get(t.lane);
      if (arr) arr.push(t);
      else map.set(t.lane, [t]);
    }
    return [...map.entries()];
  }, [filtered]);

  const summary = tasks ? `${filtered.length} shown · ${tasks.length} total` : '';

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Tasks' }]}
        title="Tasks"
        lede="One board over every task — the markdown tracker, the dashboard backlog, and client tasks, consolidated in Supabase."
      />

      <div style={s.controls}>
        <div style={s.filterGroup}>
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setStatusFilter(f)}
              style={f === statusFilter ? s.pillActive : s.pill}
            >
              {f}
            </button>
          ))}
        </div>
        <div style={s.filterGroup}>
          {sourceFilters.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setSourceFilter(f)}
              style={f === sourceFilter ? s.pillActive : s.pill}
            >
              {f}
            </button>
          ))}
        </div>
        <span style={s.spacer} />
        <span style={s.statusLine}>
          {isOffline
            ? 'offline'
            : isInitialLoading
              ? 'loading…'
              : `${summary} · updated ${formatLastUpdated(lastUpdatedAt)}`}
        </span>
        <Button size="sm" variant="secondary" disabled={importing} onClick={importIssues}>
          {importing ? 'importing…' : 'Import GitHub issues'}
        </Button>
        <Button size="sm" variant="secondary" onClick={refetch}>
          refresh
        </Button>
      </div>

      {isOffline && (
        <p style={s.notice}>
          {import.meta.env.DEV ? (
            <>
              Can&apos;t reach the tasks API. In dev, ensure{' '}
              <code style={s.code}>SUPABASE_URL</code> +{' '}
              <code style={s.code}>SUPABASE_SERVICE_ROLE_KEY</code> are set and the table exists
              (migration <code style={s.code}>0003_tasks.sql</code>).
            </>
          ) : (
            'Tasks are temporarily unavailable — the data service isn’t responding. Try refresh in a moment.'
          )}
        </p>
      )}

      {!isOffline && isInitialLoading && <p style={s.notice}>Loading tasks…</p>}

      {!isOffline && tasks && filtered.length === 0 && (
        <p style={s.notice}>No tasks match this filter.</p>
      )}

      {!isOffline &&
        byLane.map(([lane, laneTasks]) => (
          <section key={lane} style={s.lane} aria-labelledby={`lane-${lane}`}>
            <header style={s.laneHeader}>
              <span id={`lane-${lane}`} style={s.laneLabel}>
                {lane}
              </span>
              <span style={s.laneCount}>{laneTasks.length}</span>
            </header>
            <ul style={s.list}>
              {laneTasks.map((t) => {
                const busy = busyKeys.has(t.key);
                const dispatched = !!t.dispatch_url;
                return (
                  <li key={t.key} style={s.row}>
                    <div style={s.rowMain}>
                      <span style={s.title}>{t.title}</span>
                      <span style={s.meta}>{metaLine(t)}</span>
                    </div>
                    <div style={s.rowAside}>
                      {asStrings(t.import_flags).map((f) => (
                        <Badge key={f} tone="neutral">
                          {f}
                        </Badge>
                      ))}
                      {t.claimed_by && <span style={s.claim}>{t.claimed_by}</span>}
                      {dispatched && (
                        <a
                          href={t.dispatch_url ?? '#'}
                          target="_blank"
                          rel="noreferrer"
                          style={s.linkAction}
                        >
                          issue ↗
                        </a>
                      )}
                      {t.tier && <Badge tone={TIER_TONE[t.tier] ?? 'neutral'}>{t.tier}</Badge>}
                      {t.model && <Badge tone="neutral">{t.model}</Badge>}
                      <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status}</Badge>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(t.key, t.auto_ok ? 'auto_off' : 'auto_on')}
                        style={busy ? s.btnDisabled : t.auto_ok ? s.btnPrimary : s.btn}
                        aria-pressed={!!t.auto_ok}
                      >
                        {busy ? '…' : t.auto_ok ? 'Auto: on' : 'Auto: off'}
                      </button>
                      {t.status === 'done' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => act(t.key, 'reopen')}
                          style={busy ? s.btnDisabled : s.btn}
                        >
                          {busy ? '…' : 'Reopen'}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => act(t.key, 'done')}
                            style={busy ? s.btnDisabled : s.btn}
                          >
                            {busy ? '…' : 'Done'}
                          </button>
                          {!dispatched && (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => act(t.key, 'dispatch')}
                              style={busy ? s.btnDisabled : s.btnPrimary}
                            >
                              Dispatch
                            </button>
                          )}
                        </>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => act(t.key, 'trash')}
                        style={busy ? s.btnDisabled : s.btnGhost}
                        aria-label="Trash task"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
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
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  filterGroup: {
    display: 'flex',
    gap: hds.space.px4,
    flexWrap: 'wrap' as const,
  },
  spacer: { flex: 1 },
  pill: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '4px 10px',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    cursor: 'pointer',
  },
  pillActive: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '4px 10px',
    border: '1px solid var(--semantic-color-content-accent)',
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-raised)',
    cursor: 'pointer',
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
  lane: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
  },
  laneHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    paddingBottom: hds.space.px4,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  laneLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: lane kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  laneCount: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: hds.space.px16,
    flexWrap: 'wrap' as const,
    padding: `${hds.space.px8} 0`,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  rowMain: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    minWidth: 0,
    flex: '1 1 18rem',
  },
  title: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-primary)' },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  rowAside: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  claim: {
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
  btn: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '4px 10px',
    minHeight: '32px',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
    color: 'var(--semantic-color-content-primary)',
    cursor: 'pointer',
  },
  btnPrimary: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '4px 10px',
    minHeight: '32px',
    border: '1px solid var(--semantic-color-content-accent)',
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-raised)',
    cursor: 'pointer',
  },
  btnGhost: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '4px 8px',
    minHeight: '32px',
    border: '1px solid var(--semantic-color-border-subdued)',
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    cursor: 'pointer',
  },
  btnDisabled: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    padding: '4px 10px',
    minHeight: '32px',
    border: '1px solid var(--semantic-color-border-subdued)',
    borderRadius: hds.borderRadius[8],
    background: 'transparent',
    color: 'var(--semantic-color-content-disabled)',
    cursor: 'not-allowed',
  },
} satisfies Record<string, CSSProperties>;
