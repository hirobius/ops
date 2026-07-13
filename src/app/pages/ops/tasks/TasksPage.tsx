/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * TasksPage — /ops/tasks.
 *
 * The consolidated task board over the Supabase `tasks` table (migration 0003):
 * the markdown tracker, BACKLOG.md, and clients/*.json merged into one source of
 * truth (see docs/operations/tasks-consolidation.md). Reads GET /api/tasks
 * (useTasks polls); mutates via POST /api/task-action.
 *
 * Decluttered per ops#136: the page owns filters + grouping + layout; each row
 * is a presentational TaskRow with one primary action and a governed menu
 * (TaskActionsMenu); mutations live in useTaskActions; the multi-select
 * "Copy refs" subsystem lives in useTaskSelection; the operator ordering /
 * grouping / chip-tone logic is pure and unit-tested in taskMeta.ts. The
 * "Run Ralph" queue-jump (ops#113) reports failures through useToast — the
 * board's one non-silent action; everything else is fire-and-refetch.
 *
 * DS note: on @hirobius/design-system 0.13. Rows are HDS Cards with slot
 * anatomy + a work-state-toned border (TaskRow, ops#158); page chrome uses
 * Badge / Button / Menu / SegmentedControl / Tag. Remaining inline styles are
 * ops-internal layout glue (hds-bypass), not restyled DS primitives.
 */

import { useMemo, useState } from 'react';
import { Button, SegmentedControl, Tag } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { CSSProperties } from 'react';
import { PageHeader } from '../PageHeader';
import { useTasks } from './useTasks';
import { useTaskActions } from './useTaskActions';
import { useToast } from './useToast';
import { useTaskSelection } from './useTaskSelection';
import { TaskRow } from './TaskRow';
import { RalphPanel } from './RalphPanel';
import {
  groupTasksNow,
  matchesCategory,
  TASK_CATEGORIES,
  type GroupBy,
  type TaskCategory,
} from './taskMeta';
import type { TaskStatus } from './types';

type StatusFilter = TaskStatus | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'open', label: 'open' },
  { value: 'blocked', label: 'blocked' },
  { value: 'done', label: 'done' },
  { value: 'all', label: 'all' },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: 'lane', label: 'repo' },
  { value: 'priority', label: 'priority' },
  { value: 'due', label: 'due' },
  { value: 'status', label: 'status' },
];

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
  const { act, busyKeys, importing, importIssues } = useTaskActions(refetch);
  const { selected, toggleSelect, clearSelection, copySelectedRefs } = useTaskSelection(tasks);
  const { toasts, notify, dismiss } = useToast();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory>('all');
  const [groupBy, setGroupBy] = useState<GroupBy>('lane');

  const sourceFilters = useMemo(() => {
    if (!tasks) return ['all'];
    const seen = new Set<string>();
    for (const t of tasks) if (t.source) seen.add(t.source);
    return ['all', ...[...seen].sort()];
  }, [tasks]);

  // Rows in scope for the category chips (status + source applied, category NOT)
  // so each chip's count reflects "how many, given the other filters" and the
  // active category never zeroes out its own denominator.
  const categoryScope = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter(
      (t) =>
        (statusFilter === 'all' || t.status === statusFilter) &&
        (sourceFilter === 'all' || t.source === sourceFilter),
    );
  }, [tasks, statusFilter, sourceFilter]);

  const categoryCounts = useMemo(() => {
    const counts = {} as Record<TaskCategory, number>;
    for (const c of TASK_CATEGORIES) {
      counts[c] = categoryScope.filter((t) => matchesCategory(t, c)).length;
    }
    return counts;
  }, [categoryScope]);

  const filtered = useMemo(
    () => categoryScope.filter((t) => matchesCategory(t, categoryFilter)),
    [categoryScope, categoryFilter],
  );

  const groups = useMemo(() => groupTasksNow(filtered, groupBy), [filtered, groupBy]);

  const summary = tasks ? `${filtered.length} shown · ${tasks.length} total` : '';

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Tasks' }]}
        title="Tasks"
        lede="The single board over every task and GitHub issue across all fleet repos. Import syncs open issues in; select any rows to copy their owner/repo#N refs into a chat."
      />

      <div style={s.controls}>
        <SegmentedControl
          aria-label="Filter by status"
          size="sm"
          options={STATUS_OPTIONS}
          value={statusFilter}
          onChange={(v) => setStatusFilter(v as StatusFilter)}
        />
        <span style={s.groupLabel}>group by</span>
        <SegmentedControl
          aria-label="Group tasks by"
          size="sm"
          options={GROUP_OPTIONS}
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupBy)}
        />
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

      <div style={s.sourceRow}>
        <span style={s.groupLabel}>category</span>
        {TASK_CATEGORIES.map((c) => (
          <Tag
            key={c}
            active={c === categoryFilter}
            onClick={() => setCategoryFilter(c)}
            aria-label={`Filter by ${c}`}
          >
            {c} {categoryCounts[c] ?? 0}
          </Tag>
        ))}
      </div>

      <RalphPanel act={act} onNotify={notify} />

      {sourceFilters.length > 2 && (
        <div style={s.sourceRow}>
          {sourceFilters.map((f) => (
            <Tag key={f} active={f === sourceFilter} onClick={() => setSourceFilter(f)}>
              {f}
            </Tag>
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div style={s.batchBar}>
          <span style={s.batchCount}>{selected.size} selected</span>
          <Button size="sm" variant="primary" onClick={copySelectedRefs}>
            Copy refs
          </Button>
          <Button size="sm" variant="secondary" onClick={clearSelection}>
            Clear
          </Button>
        </div>
      )}

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
        groups.map(([label, groupTasksList]) => (
          <section key={label} style={s.lane} aria-labelledby={`group-${label}`}>
            <header style={s.laneHeader}>
              <span id={`group-${label}`} style={s.laneLabel}>
                {label}
              </span>
              <span style={s.laneCount}>{groupTasksList.length}</span>
            </header>
            <ul style={s.list}>
              {groupTasksList.map((t) => (
                <TaskRow
                  key={t.key}
                  task={t}
                  busy={busyKeys.has(t.key)}
                  isSelected={selected.has(t.key)}
                  onToggleSelect={toggleSelect}
                  onAction={act}
                  onNotify={notify}
                />
              ))}
            </ul>
          </section>
        ))}

      {toasts.length > 0 && (
        <div style={s.toastStack} role="status" aria-live="polite">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              style={toast.tone === 'danger' ? s.toastDanger : s.toastSuccess}
              onClick={() => dismiss(toast.id)}
              title="Dismiss"
            >
              {toast.text}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Shared shape for both toast tones — only the border color differs.
const TOAST_BASE: CSSProperties = {
  ...hds.typeStyles.ui,
  textAlign: 'left',
  padding: `${hds.space.px8} ${hds.space.px12}`,
  borderRadius: hds.borderRadius[8],
  background: 'var(--semantic-color-surface-raised)',
  color: 'var(--semantic-color-content-primary)',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  cursor: 'pointer',
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
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  groupLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: control kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  sourceRow: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px4,
    flexWrap: 'wrap' as const,
  },
  spacer: { flex: 1 },
  statusLine: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  batchBar: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-surface-raised)',
  },
  batchCount: {
    ...hds.typeStyles.ui,
    fontWeight: hds.fontWeight.semibold,
    color: 'var(--semantic-color-content-primary)',
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
    gap: hds.space.px8,
  },
  toastStack: {
    position: 'fixed' as const,
    bottom: hds.space.px24,
    right: hds.space.px24,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    maxWidth: '360px',
    zIndex: 1000,
  },
  toastSuccess: { ...TOAST_BASE, border: '1px solid var(--semantic-color-feedback-success)' },
  toastDanger: { ...TOAST_BASE, border: '1px solid var(--semantic-color-feedback-error)' },
} satisfies Record<string, CSSProperties>;
