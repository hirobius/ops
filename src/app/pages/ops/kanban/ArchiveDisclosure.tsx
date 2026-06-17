/* hds-bypass: ops-internal page */

import { useMemo, useState, type CSSProperties } from 'react';
import hds from '@hirobius/design-system/tokens';
import { Button } from '@hirobius/design-system';
import type { KanbanTask } from './types';
import { useArchivedTasks } from './useArchivedTasks';

const PAGE_SIZE = 50;

interface ArchiveDisclosureProps {
  /** Hint count from the latest non-archived board fetch, when known. */
  hintedCount?: number;
}

function relativeAge(epochMs: number): string {
  if (!epochMs) return '';
  const delta = Math.max(0, Date.now() - epochMs);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function ArchiveDisclosure({ hintedCount }: ArchiveDisclosureProps) {
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(0);

  const { tasks, fetchedAt, error, isLoading } = useArchivedTasks({ enabled: expanded });

  const filtered = useMemo(() => {
    if (!tasks) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return tasks;
    return tasks.filter((t) => t.title.toLowerCase().includes(q) || t.id.toLowerCase().includes(q));
  }, [tasks, filter]);

  const pageStart = page * PAGE_SIZE;
  const pageItems = filtered.slice(pageStart, pageStart + PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const total = tasks?.length ?? hintedCount ?? null;

  return (
    <section style={s.root} aria-labelledby="archive-disclosure-eyebrow">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="hds-focus"
        style={s.toggle}
        aria-expanded={expanded}
        aria-controls="archive-disclosure-list"
      >
        <span style={s.chevron} aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
        <span id="archive-disclosure-eyebrow" style={s.eyebrow}>
          archive
        </span>
        <span style={s.count}>{total ?? '?'}</span>
        <span style={s.subtitle}>completed and archived Hermes tasks</span>
      </button>
      {expanded && (
        <div id="archive-disclosure-list" style={s.body}>
          <div style={s.controls}>
            <input
              type="search"
              placeholder="filter title or id…"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(0);
              }}
              style={s.search}
              className="hds-focus"
              aria-label="filter archived tasks"
            />
            <span style={s.controlsMeta}>
              {isLoading && tasks === null && 'loading…'}
              {error && !tasks && <span style={s.errorText}>error: {error}</span>}
              {tasks && (
                <>
                  {filtered.length} of {tasks.length}
                  {fetchedAt && ` · updated ${relativeAge(fetchedAt)} ago`}
                </>
              )}
            </span>
          </div>
          {tasks && (
            <>
              <div style={s.list}>
                {pageItems.length === 0 ? (
                  <div style={s.empty}>{filter ? 'no matches' : 'no archived tasks'}</div>
                ) : (
                  pageItems.map((t, idx) => (
                    <ArchivedRow key={t.id} task={t} isLast={idx === pageItems.length - 1} />
                  ))
                )}
              </div>
              {totalPages > 1 && (
                <div style={s.pager}>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    ← prev
                  </Button>
                  <span style={s.pagerLabel}>page {page + 1} / {totalPages}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                  >
                    next →
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

interface ArchivedRowProps {
  task: KanbanTask;
  isLast: boolean;
}

function ArchivedRow({ task, isLast }: ArchivedRowProps) {
  return (
    <div
      style={{
        ...s.row,
        borderBottom: isLast ? 'none' : '1px solid var(--semantic-color-border-default)',
      }}
    >
      <span style={s.rowId}>{task.id}</span>
      <span style={s.rowTitle}>{task.title}</span>
      <span style={s.rowMeta}>
        {task.assignee ?? '—'}
        {' · '}
        {task.completed_at ? `done ${relativeAge(task.completed_at * 1000)} ago` : 'archived'}
      </span>
    </div>
  );
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    borderTop: '1px solid var(--semantic-color-border-default)',
    paddingTop: hds.space.px16,
  },
  toggle: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    background: 'transparent',
    border: 'none',
    padding: `${hds.space.px8} 0`,
    cursor: 'pointer',
    color: 'inherit',
    textAlign: 'left' as const,
    flexWrap: 'wrap' as const,
  },
  chevron: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-secondary)',
    width: '16px',
  },
  eyebrow: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: section kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  count: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  subtitle: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
    paddingTop: hds.space.px8,
  },
  controls: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    flexWrap: 'wrap' as const,
  },
  search: {
    flex: '1 1 280px',
    minWidth: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    background: 'var(--semantic-color-surface-raised)',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.sm,
    padding: `${hds.space.px8} ${hds.space.px12}`,
  },
  controlsMeta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
  },
  errorText: {
    color: 'var(--semantic-color-feedback-error)',
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
  },
  empty: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
    padding: `${hds.space.px16} 0`,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(180px, auto) minmax(0, 1fr) auto', // grid-ok: id + title + meta
    columnGap: hds.space.px12,
    alignItems: 'baseline',
    padding: `${hds.space.px8} 0`,
    minWidth: 0,
  },
  rowId: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  rowTitle: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
    whiteSpace: 'nowrap',
  },
  pager: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px12,
    paddingTop: hds.space.px8,
  },
  pagerLabel: {
    fontFamily: hds.monoFamily,
    fontSize:   hds.fontSize['2xs'],
    color:      'var(--semantic-color-content-secondary)',
  },
} satisfies Record<string, CSSProperties>;
