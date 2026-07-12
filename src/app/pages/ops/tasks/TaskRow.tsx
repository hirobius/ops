/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * TaskRow — one presentational board row (ops#136).
 *
 * Information hierarchy, in order of operator value:
 *   1. title line — issue #, title (links to the GitHub issue: dispatch_url,
 *      else source_url — ops#156)
 *   2. chip line — state first (the derived work-state phase, ops#135), then the
 *      scheduling facts the operator tracks by (priority / due / effort, toned),
 *      then remaining labels, then routing (tier·model) and provenance ("no
 *      Ralph" for personal repos)
 *   3. meta line — provenance + freshness, deliberately quiet
 * Actions: ONE primary (Dispatch / Re-dispatch, or Reopen when done) plus the
 * governed ⋯ menu. Everything else moved into the menu.
 */

import { Badge, Button } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { ComponentProps, CSSProperties } from 'react';
import { deriveWorkState, WORK_STATE_TONE } from '../../../../../lib/tasks/work-state.mjs';
import type { Task, TaskAction } from './types';
import {
  isNoRalphSource,
  taskRef,
  issueLinkFor,
  priorityTone,
  dueToneNow,
  relTimeNow,
} from './taskMeta';
import { TaskActionsMenu } from './TaskActionsMenu';

// Stay in lockstep with the DS Badge contract instead of shadowing it.
type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;

// Tags folded into the derived work-state phase (ops#135) — no longer rendered
// as their own chips, so "done"/"blocked"/"dispatched" aren't encoded twice.
const STATE_TAGS = new Set(['ralph-ready', 'ralph-wip', 'ralph-parked', 'needs-adrian']);

// Remaining label-borne chips (GitHub labels sync into tags on import) that
// the phase badge doesn't absorb — approval/auto markers and priority/type labels.
const TAG_TONE: Record<string, BadgeTone> = {
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
  const issueLink = issueLinkFor(t);
  const tags = t.tags ?? [];
  const flags = t.import_flags ?? [];
  const dTone = dueToneNow(t.due);
  const workState = deriveWorkState(t);
  const labelTags = tags.filter((tag) => !STATE_TAGS.has(tag));

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
          {issueLink ? (
            <a href={issueLink} target="_blank" rel="noreferrer" style={s.titleLink}>
              {t.title} ↗
            </a>
          ) : (
            <span style={s.title}>{t.title}</span>
          )}
        </div>
        <div style={s.badgeLine}>
          <Badge tone={(WORK_STATE_TONE[workState] as BadgeTone) ?? 'neutral'}>{workState}</Badge>
          {t.priority && <Badge tone={priorityTone(t.priority)}>P:{t.priority}</Badge>}
          {t.due && dTone && <Badge tone={dTone}>due {t.due}</Badge>}
          {t.effort && <Badge tone="neutral">E:{t.effort}</Badge>}
          {labelTags.map((tag) => (
            <Badge key={tag} tone={TAG_TONE[tag] ?? 'neutral'}>
              {tag}
            </Badge>
          ))}
          {t.tier && <Badge tone="neutral">{t.tier}</Badge>}
          {t.model && <Badge tone="neutral">{t.model}</Badge>}
          {isNoRalphSource(t.source) && (
            <Badge
              tone="warning"
              title="Personal repo — the Ralph loop only runs in hirobius repos"
            >
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
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => onAction(t.key, 'reopen')}
          >
            {busy ? '…' : 'Reopen'}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={busy}
            onClick={() => onAction(t.key, 'dispatch')}
            title={
              dispatched
                ? 'Re-ping @claude on the linked issue'
                : 'Open an @claude issue that hands this to a Claude Code session'
            }
          >
            {busy ? '…' : dispatched ? 'Re-dispatch' : 'Dispatch'}
          </Button>
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
} satisfies Record<string, CSSProperties>;
