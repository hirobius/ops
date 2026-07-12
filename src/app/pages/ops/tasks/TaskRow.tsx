/* hds-bypass: ops-internal page. Structure is HDS Card slot anatomy; the few
 * remaining inline styles are the quiet footer-meta text + the bespoke
 * multi-select control (no DS checkbox-as-toggle primitive fits this use). */

/**
 * TaskRow — one task as an HDS Card (ops#158/#138).
 *
 * Hierarchy, top to bottom:
 *   1. metadata slot — the decision signals in a fixed order: a leading
 *      priority chip (P0–P3), the derived work-state phase badge, an optional
 *      due chip, then only the routing/automation labels that change what
 *      happens next (cardLabelTags). GitHub taxonomy labels (chore/enhancement/
 *      bug/backlog/epic:*…) are dropped — noise on an action board.
 *   2. title — issue #, linked title (dispatch_url, else source_url, ops#156).
 *   3. footer — quiet provenance/freshness on the left; the ONE primary action
 *      (Dispatch / Re-dispatch, or Reopen) + governed ⋯ menu on the right.
 *
 * The card's BORDER TONE is the work-state signal (#158) — so the phase is a
 * quiet reinforcing badge, never the loudest thing on the card.
 */

import { Badge, Button, Card, Cluster } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { ComponentProps, CSSProperties } from 'react';
import { deriveWorkState, WORK_STATE_TONE } from '../../../../../lib/tasks/work-state.mjs';
import type { Task, TaskAction } from './types';
import {
  isNoRalphSource,
  taskRef,
  issueLinkFor,
  priorityChip,
  cardLabelTags,
  dueToneNow,
  relTimeNow,
} from './taskMeta';
import { TaskActionsMenu } from './TaskActionsMenu';

// Stay in lockstep with the DS contracts instead of shadowing them.
type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;
type CardTone = NonNullable<ComponentProps<typeof Card>['tone']>;

// The card border tone per work-state — the border IS the state signal (#158).
// WorkState carries an 'inProgress' badge tone that CardTone lacks, so the
// in-flight phases map to 'info'; finished/backlog stay neutral (a quiet
// border, not a shout).
const WORK_STATE_CARD_TONE: Record<string, CardTone> = {
  done: 'neutral',
  'needs-adrian': 'danger',
  parked: 'warning',
  blocked: 'danger',
  wip: 'info',
  dispatched: 'info',
  queued: 'info',
  ready: 'success',
  backlog: 'neutral',
};

// Tone per routing/automation chip. cardLabelTags already dropped the noise, so
// anything unrecognised falls through as a neutral custom label.
const TAG_TONE: Record<string, BadgeTone> = {
  'needs-human': 'warning',
  'ralph-auto': 'info',
  'ralph-approved': 'success',
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
  const workState = deriveWorkState(t);
  const cardTone = WORK_STATE_CARD_TONE[workState] ?? 'neutral';
  const pChip = priorityChip(t);
  const dTone = dueToneNow(t.due);
  const labelTags = cardLabelTags(t.tags);

  // Quiet footer line: provenance + routing facts + freshness, deliberately low
  // contrast so it never competes with the title or the decision chips.
  const metaParts = [t.source];
  if (t.phase) metaParts.push(t.phase);
  if (t.owner) metaParts.push(`@${t.owner}`);
  if (t.tier) metaParts.push(t.tier);
  if (t.model) metaParts.push(t.model);
  if (t.effort) metaParts.push(`effort ${t.effort}`);
  if (t.claimed_by) metaParts.push(t.claimed_by);
  for (const f of t.import_flags ?? []) metaParts.push(f);
  const updated = relTimeNow(t.updated_at);
  if (updated) metaParts.push(`updated ${updated}`);

  return (
    <Card as="li" bordered tone={cardTone} padding="none" style={s.card}>
      <Card.Header
        metadata={
          <Cluster gap="tight" align="center">
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
            {pChip && <Badge tone={pChip.tone as BadgeTone}>{pChip.label}</Badge>}
            <Badge tone={(WORK_STATE_TONE[workState] as BadgeTone) ?? 'neutral'}>{workState}</Badge>
            {t.due && dTone && <Badge tone={dTone}>due {t.due}</Badge>}
            {labelTags.map((tag) => (
              <Badge key={tag} tone={TAG_TONE[tag] ?? 'neutral'}>
                {tag}
              </Badge>
            ))}
            {isNoRalphSource(t.source) && (
              <Badge
                tone="warning"
                title="Personal repo — the Ralph loop only runs in hirobius repos"
              >
                no Ralph
              </Badge>
            )}
          </Cluster>
        }
      >
        <Card.Title style={s.title}>
          {ref && <span style={s.num}>#{ref.slice(ref.indexOf('#') + 1)}</span>}
          {issueLink ? (
            <a href={issueLink} target="_blank" rel="noreferrer" style={s.titleLink}>
              {t.title} ↗
            </a>
          ) : (
            <span>{t.title}</span>
          )}
        </Card.Title>
      </Card.Header>

      <Card.Footer style={s.footer}>
        <span style={s.meta}>{metaParts.join('  ·  ')}</span>
        <span style={s.spacer} />
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
      </Card.Footer>
    </Card>
  );
}

const s = {
  card: { listStyle: 'none' },
  title: {
    ...hds.typeStyles.ui,
    margin: 0,
    minWidth: 0,
  },
  num: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    fontVariantNumeric: 'tabular-nums',
    marginRight: hds.space.px8,
  },
  titleLink: {
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    flexWrap: 'wrap' as const,
  },
  meta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    minWidth: 0,
  },
  spacer: { flex: 1 },
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
