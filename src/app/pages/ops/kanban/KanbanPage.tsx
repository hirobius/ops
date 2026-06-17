/* hds-bypass: ops-internal page */

/**
 * KanbanPage — read-only window into the Hermes Agent kanban board.
 *
 * Data comes from `GET /api/hermes/board?tenant=hds`, which the Vite dev
 * proxy rewrites to the local `hermes dashboard` plugin endpoint. The page
 * polls every 5 s while the tab is visible, pauses when hidden, and flips
 * to an offline banner if Hermes can't be reached for three consecutive
 * polls (see `useKanbanBoard`).
 *
 * v1 is strictly read-only — mutations stay in `hermes kanban …` and the
 * native Hermes dashboard. The page exists to keep eyes on the dispatcher
 * without leaving /ops.
 */

import { useMemo, type CSSProperties } from 'react';
import { Link } from 'react-router';
import hds from '@hirobius/design-system/tokens';
import { Button } from '@hirobius/design-system';
import { useKanbanBoard } from './useKanbanBoard';
import { useOpenThreads } from './useOpenThreads';
import { useProposedUnits } from './useProposedUnits';
import { KanbanCard } from './KanbanCard';
import { OfflineBanner } from './OfflineBanner';
import { LooseThreadsRail } from './LooseThreadsRail';
import { BacklogDisclosure } from './BacklogDisclosure';
import { RoadmapDisclosure } from './RoadmapDisclosure';
import { ArchiveDisclosure } from './ArchiveDisclosure';
import { correlateThreads } from './correlateThreads';
import type { KanbanColumn, TaskStatus } from './types';

const VISIBLE_COLUMNS: TaskStatus[] = ['ready', 'running', 'blocked', 'done'];
const DONE_LIMIT = 10;

const COLUMN_LABELS: Record<TaskStatus, string> = {
  triage: 'triage',
  todo: 'todo',
  ready: 'ready',
  running: 'running',
  blocked: 'blocked',
  done: 'recently done',
  archived: 'archived',
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

export default function KanbanPage() {
  const { board, isOffline, isInitialLoading, lastUpdatedAt, refetch } = useKanbanBoard();
  const { data: threads, refetch: refetchThreads } = useOpenThreads();
  const { data: proposedUnits, refetch: refetchProposedUnits } = useProposedUnits();

  const { decorationsByTaskId, looseThreads } = useMemo(
    () => correlateThreads(board, threads),
    [board, threads],
  );

  const handlePromoted = () => {
    refetch();
    refetchThreads();
    refetchProposedUnits();
  };

  const visibleColumns: KanbanColumn[] = (board?.columns ?? []).filter((c) => {
    if (!VISIBLE_COLUMNS.includes(c.name)) return false;
    // Hide visible columns that are empty AND non-essential. We always show
    // ready/running so the page doesn't flicker between layouts; blocked
    // and done are conditional.
    if (c.name === 'ready' || c.name === 'running') return true;
    return c.tasks.length > 0;
  });

  const totalTasks = visibleColumns.reduce(
    (acc, c) => acc + (c.name === 'done' ? Math.min(c.tasks.length, DONE_LIMIT) : c.tasks.length),
    0,
  );

  return (
    <div style={s.page}>
      <header style={s.header}>
        <div style={s.headerLeft}>
          <nav aria-label="Breadcrumb" style={s.crumbs}>
            <Link to="/ops" style={s.crumbLink}>
              Ops
            </Link>
            <span style={s.crumbSep} aria-hidden="true">
              ·
            </span>
            <span style={s.crumbCurrent}>Dispatcher</span>
          </nav>
          <span style={s.eyebrow}>hermes kanban</span>
          <h1 style={s.title}>Dispatcher</h1>
          <p style={s.subtitle}>
            Live view of the Hermes Agent task queue. Tenant: <code style={s.codeInline}>hds</code>.
            Mutations live in <code style={s.codeInline}>hermes kanban</code> — this page is
            read-only.
          </p>
        </div>
        <div style={s.headerRight}>
          <span style={s.statusLine}>
            {isOffline
              ? 'offline'
              : isInitialLoading
                ? 'loading…'
                : `${totalTasks} tasks · updated ${formatLastUpdated(lastUpdatedAt)}`}
          </span>
          <Button size="sm" variant="secondary" onClick={refetch}>
            refresh
          </Button>
        </div>
      </header>

      {isOffline && (
        <div style={s.offlineSlot}>
          <OfflineBanner onRetry={refetch} />
        </div>
      )}

      {!isOffline && isInitialLoading && (
        <div style={s.loadingSlot}>
          <span style={s.loadingText}>Reaching dispatcher…</span>
        </div>
      )}

      {!isOffline && board && (
        <LooseThreadsRail
          threads={looseThreads}
          assignees={board.assignees}
          onPromoted={handlePromoted}
        />
      )}

      {!isOffline && proposedUnits && (
        <BacklogDisclosure
          items={proposedUnits.items}
          assignees={board?.assignees ?? []}
          onPromoted={handlePromoted}
        />
      )}

      {!isOffline && <RoadmapDisclosure />}

      {!isOffline && board && (
        <div style={s.columns}>
          {visibleColumns.map((col) => {
            const tasks = col.name === 'done' ? col.tasks.slice(0, DONE_LIMIT) : col.tasks;
            return (
              <section key={col.name} style={s.column} aria-labelledby={`col-${col.name}`}>
                <header style={s.columnHeader}>
                  <span id={`col-${col.name}`} style={s.columnLabel}>
                    {COLUMN_LABELS[col.name]}
                  </span>
                  <span style={s.columnCount}>{col.tasks.length}</span>
                </header>
                {tasks.length === 0 ? (
                  <div style={s.emptyColumn}>—</div>
                ) : (
                  <div style={s.cardStack}>
                    {tasks.map((t) => (
                      <KanbanCard key={t.id} task={t} decoration={decorationsByTaskId.get(t.id)} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {!isOffline && board && <ArchiveDisclosure />}
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
  header: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto', // grid-ok: title block + meta/actions
    gap: hds.space.px16,
    alignItems: 'end',
    paddingBottom: hds.space.px16,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  headerLeft: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    minWidth: 0,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
  },
  crumbs: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px6,
  },
  crumbLink: {
    fontFamily: hds.fontFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    textDecoration: 'none',
  },
  crumbSep: {
    fontFamily: hds.fontFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-border-default)',
  },
  crumbCurrent: {
    fontFamily: hds.fontFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
  },
  eyebrow: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: page kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  title: {
    margin: 0,
    fontFamily: hds.fontFamily,
    fontSize: hds.fontSize['2xl'],
    fontWeight: hds.fontWeight.semibold, // eyebrow-ok: uses token, not hardcoded value
    color: 'var(--semantic-color-content-primary)',
    lineHeight: 1.15,
  },
  subtitle: {
    margin: 0,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.5,
    maxWidth: '60ch',
  },
  codeInline: {
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
  offlineSlot: {
    display: 'flex',
  },
  loadingSlot: {
    display: 'flex',
    justifyContent: 'center',
    padding: hds.space.px48,
  },
  loadingText: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', // grid-ok: kanban columns reflow at narrow widths
    gap: hds.space.px24,
    alignItems: 'start',
  },
  column: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    minWidth: 0,
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    paddingBottom: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  columnLabel: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: column kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  columnCount: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  cardStack: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    minWidth: 0,
  },
  emptyColumn: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
    padding: `${hds.space.px16} 0`,
  },
} satisfies Record<string, CSSProperties>;
