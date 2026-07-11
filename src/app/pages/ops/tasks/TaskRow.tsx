/**
 * TaskRow — one presentational board row (ops#136).
 *
 * Information hierarchy, in order of operator value:
 *   1. title line — issue #, title (links to the issue when dispatched)
 *   2. chip line — state first (status), then the scheduling facts the operator
 *      tracks by (priority / due / effort, toned), then Ralph/label state, then
 *      routing (tier·model) and provenance ("no Ralph" for personal repos)
 *   3. meta line — provenance + freshness, deliberately quiet
 * Actions: ONE primary (Dispatch / Re-dispatch, or Reopen when done) plus the
 * governed ⋯ menu. Everything else moved into the menu.
 */

import { Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { CSSProperties } from 'react';
import type { Task, TaskAction } from './types';
import { isNoRalphSource, taskRef, priorityTone, dueToneNow, relTimeNow } from './taskMeta';
import { TaskActionsMenu } from './TaskActionsMenu';

type BadgeTone = 'success' | 'neutral' | 'warning' | 'danger' | 'info' | 'inProgress';

const STATUS_TONE: Record<Task['status'], BadgeTone> = {
  open: 'neutral',
  blocked: 'warning',
  done: 'success',
};

// Label-borne state (GitHub labels sync into tags on import; ralph-* are the
// loop's own state machine — see ralph/README.md's label table).
const TAG_TONE: Record<string, BadgeTone> = {
  'ralph-ready': 'success',
  'ralph-wip': 'inProgress',
  'ralph-parked': 'warning',
  'needs-adrian': 'danger',
  'ralph-auto': 'info',
  'ralph-approved': 'success',
  p0: 'danger',
  p1: 'warning',
  bug: 'danger',
  blocked: 'warning',
};

export interface TaskRowProps {
  task: Task;
  busy: boolean;
  isSelected: boolean;
  onToggleSelect: (key: string) => void;
  onAction: (key: string, action: TaskAction) => void;
}

export function TaskRow({ task: t, busy, isSelected, onToggleSelect, onAction }: TaskRowProps) {
  const dispatched = !!t.dispatch_url;
  const ref = taskRef(t);
  const tags = t.tags ?? [];
  const flags = t.import_flags ?? [];
  const dTone = dueToneNow(t.due);

  const metaParts = [t.source];
  if (t.phase) metaParts.push(t.phase);
  if (t.owner) metaParts.push(`@${t.owner}`);
  const updated = relTimeNow(t.updated_at);
  if (updated) metaParts.push(`updated ${updated}`);

  return (
    <li style={s.row}>
      {ref && (
        <button
          type="button"
          aria-pressed={isSelected}
          onClick={() => onToggleSelect(t.key)}
          style={isSelected ? s.checkOn : s.check}
          title={isSelected ? 'Deselect' : `Select ${ref}`}
        >
          {isSelected ? '✓' : ''}
        </button>
      )}
      <div style={s.rowMain}>
        <div style={s.titleLine}>
          {ref && <span style={s.num}>#{ref.slice(ref.indexOf('#') + 1)}</span>}
          {dispatched ? (
            <a href={t.dispatch_url ?? '#'} target="_blank" rel="noreferrer" style={s.titleLink}>
              {t.title} ↗
            </a>
          ) : (
            <span style={s.title}>{t.title}</span>
          )}
        </div>
        <div style={s.badgeLine}>
          <Badge tone={STATUS_TONE[t.status] ?? 'neutral'}>{t.status}</Badge>
          {t.priority && <Badge tone={priorityTone(t.priority)}>P:{t.priority}</Badge>}
          {t.due && dTone && <Badge tone={dTone}>due {t.due}</Badge>}
          {t.effort && <Badge tone="neutral">E:{t.effort}</Badge>}
          {tags.map((tag) => (
            <Badge key={tag} tone={TAG_TONE[tag] ?? 'neutral'}>
              {tag}
            </Badge>
          ))}
          {t.tier && <Badge tone="neutral">{t.tier}</Badge>}
          {t.model && <Badge tone="neutral">{t.model}</Badge>}
          {isNoRalphSource(t.source) && (
            <Badge tone="warning" title="Personal repo — the Ralph loop only runs in hirobius repos">
              no Ralph
            </Badge>
          )}
          {flags.map((f) => (
            <Badge key={f} tone="neutral">
              {f}
            </Badge>
          ))}
          {t.claimed_by && <span style={s.claim}>{t.claimed_by}</span>}
        </div>
        <span style={s.meta}>{metaParts.join('  ·  ')}</span>
      </div>
      <div style={s.rowAside}>
        {t.status === 'done' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(t.key, 'reopen')}
            style={busy ? s.btnDisabled : s.btn}
          >
            {busy ? '…' : 'Reopen'}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={() => onAction(t.key, 'dispatch')}
            style={busy ? s.btnDisabled : s.btnPrimary}
            title={
              dispatched
                ? 'Re-ping @claude on the linked issue'
                : 'Open an @claude issue that hands this to a Claude Code session'
            }
          >
            {busy ? '…' : dispatched ? 'Re-dispatch' : 'Dispatch'}
          </button>
        )}
        <TaskActionsMenu task={t} busy={busy} onAction={onAction} />
      </div>
    </li>
  );
}

const s = {
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
  titleLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    minWidth: 0,
    flexWrap: 'wrap' as const,
  },
  num: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  title: { ...hds.typeStyles.ui, color: 'var(--semantic-color-content-primary)' },
  titleLink: {
    ...hds.typeStyles.ui,
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
  },
  badgeLine: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px4,
    flexWrap: 'wrap' as const,
  },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
  claim: {
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
  check: {
    width: hds.space.px20,
    height: hds.space.px20,
    flexShrink: 0,
    borderRadius: hds.borderRadius[4],
    border: '1px solid var(--semantic-color-border-default)',
    background: 'transparent',
    color: 'var(--semantic-color-content-onAccent)',
    cursor: 'pointer',
  },
  checkOn: {
    width: hds.space.px20,
    height: hds.space.px20,
    flexShrink: 0,
    borderRadius: hds.borderRadius[4],
    border: '1px solid var(--semantic-color-content-accent)',
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-content-onAccent)',
    cursor: 'pointer',
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
