/* hds-bypass: ops-internal page */
/* eslint-disable react-hooks/purity -- Date.now() in render is intentional for live relative timestamps in kanban cards */

import { useState, type CSSProperties } from 'react';
import { Card, Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { KanbanTask, KanbanWarningsSummary } from './types';
import type { ThreadDecoration } from './threads-types';

interface KanbanCardProps {
  task: KanbanTask;
  decoration?: ThreadDecoration;
}

type CardTone = 'default' | 'accent' | 'warning' | 'danger';

function pickTone(task: KanbanTask): CardTone {
  const w: KanbanWarningsSummary | undefined = task.warnings;
  if (w && w.errors > 0) return 'danger';
  if (w && w.warnings > 0) return 'warning';
  if (task.status === 'running') return 'accent';
  return 'default';
}

function priorityLabel(p: number): string {
  // Hermes priority is 0..N; map to T-tier shorthand for legibility.
  if (p >= 4) return 'P0';
  if (p === 3) return 'P1';
  if (p === 2) return 'P2';
  if (p === 1) return 'P3';
  return 'P—';
}

function relativeAge(epochMs: number, nowMs: number): string {
  // Hermes' `created_at` is millis; Hermes' `now` is seconds. Caller passes
  // both as ms (the page coerces `board.now * 1000` first) so the math is
  // homogeneous.
  const delta = Math.max(0, nowMs - epochMs);
  const seconds = Math.floor(delta / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function KanbanCard({ task, decoration }: KanbanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const tone = pickTone(task);
  const w = task.warnings;
  const hasDiagnostics = !!w && w.errors + w.warnings + w.info > 0;

  // The body is the markdown task spec from orchestration.json; truncate
  // hard so the card stays scannable. Full text available on expand.
  const bodyPreview = task.body
    ? task.body.split('\n').filter(Boolean).slice(0, 1).join(' ').slice(0, 140)
    : null;

  return (
    <Card tone={tone} bordered={tone === 'default'} padding="none" gap="tight" style={s.root}>
      <Card.Header
        style={s.header}
        metadata={
          <>
            {task.assignee && <Badge tone="neutral">{task.assignee}</Badge>}
            <Badge tone="neutral">{priorityLabel(task.priority)}</Badge>
            {hasDiagnostics && w && (
              <Badge tone={w.errors > 0 ? 'danger' : 'warning'}>
                {w.errors > 0 ? `${w.errors}e` : `${w.warnings}w`}
              </Badge>
            )}
            {task.consecutive_failures > 0 && (
              <Badge tone="danger">{task.consecutive_failures}× fail</Badge>
            )}
            {decoration?.hasWorktree && <Badge tone="neutral">📁 wt</Badge>}
            {decoration?.liveSession && (
              <Badge tone={decoration.liveSession.status === 'busy' ? 'success' : 'info'}>
                ● {decoration.liveSession.status}
              </Badge>
            )}
            {!decoration?.liveSession && decoration?.recentSession && (
              <Badge tone="neutral">
                recent · {relativeAge(decoration.recentSession.lastAt, Date.now())}
              </Badge>
            )}
          </>
        }
      >
        <Card.Title style={s.title}>{task.title}</Card.Title>
      </Card.Header>

      {bodyPreview && <Card.Body style={s.bodyPreview}>{bodyPreview}</Card.Body>}

      {task.progress && task.progress.total > 0 && (
        <Card.Progress
          value={task.progress.done}
          max={task.progress.total}
          label={`${task.progress.done} / ${task.progress.total} subtasks`}
          tone={tone === 'default' ? 'accent' : tone}
        />
      )}

      <Card.Footer style={s.footer}>
        <span style={s.footerMeta}>{relativeAge(task.created_at, Date.now())}</span>
        <span style={s.footerSpacer} aria-hidden="true">
          ·
        </span>
        {task.skills && task.skills.length > 0 && (
          <>
            <span style={s.footerMeta} title={task.skills.join(', ')}>
              {task.skills.length} skill{task.skills.length === 1 ? '' : 's'}
            </span>
            <span style={s.footerSpacer} aria-hidden="true">
              ·
            </span>
          </>
        )}
        <span style={s.footerMeta}>
          {task.link_counts.parents}↑ {task.link_counts.children}↓
        </span>
        {task.comment_count > 0 && (
          <>
            <span style={s.footerSpacer} aria-hidden="true">
              ·
            </span>
            <span style={s.footerMeta}>{task.comment_count}💬</span>
          </>
        )}
        <span style={s.footerSpacerFlex} aria-hidden="true" />
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="hds-focus"
          style={s.expandButton}
          aria-expanded={expanded}
        >
          {expanded ? 'less' : 'more'}
        </button>
      </Card.Footer>

      {expanded && (
        <div style={s.expandedDetail}>
          {task.body && <pre style={s.bodyFull}>{task.body}</pre>}
          {hasDiagnostics && task.diagnostics && task.diagnostics.length > 0 && (
            <div style={s.diagBlock}>
              <div style={s.diagHead}>diagnostics</div>
              {task.diagnostics.map((d, i) => (
                <div key={i} style={s.diagRow}>
                  <span style={{ ...s.diagLevel, color: diagColor(d.level) }}>{d.level}</span>
                  <span style={s.diagMessage}>{d.message}</span>
                </div>
              ))}
            </div>
          )}
          {task.last_failure_error && (
            <div style={s.diagBlock}>
              <div style={s.diagHead}>last failure</div>
              <div style={s.failureMessage}>{task.last_failure_error}</div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function diagColor(level: 'info' | 'warning' | 'error'): string {
  if (level === 'error') return 'var(--semantic-color-feedback-error)';
  if (level === 'warning') return 'var(--semantic-color-feedback-warning)';
  return 'var(--semantic-color-feedback-info)';
}

const s = {
  root: {
    background: 'var(--semantic-color-surface-raised)',
    minWidth: 0,
  },
  header: {
    padding: hds.space.px12,
  },
  title: {
    fontSize: hds.fontSize.sm,
    fontFamily: hds.fontFamily,
    color: 'var(--semantic-color-content-primary)',
    lineHeight: 1.35,
    margin: 0,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    wordBreak: 'break-word' as const,
  },
  bodyPreview: {
    padding: `0 ${hds.space.px12} ${hds.space.px8} ${hds.space.px12}`,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    lineHeight: 1.45,
    overflow: 'hidden',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },
  footer: {
    padding: `${hds.space.px8} ${hds.space.px12} ${hds.space.px12} ${hds.space.px12}`,
    gap: hds.space.px8,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-secondary)',
  },
  footerMeta: {
    whiteSpace: 'nowrap' as const,
  },
  footerSpacer: {
    color: 'var(--semantic-color-content-disabled)',
  },
  footerSpacerFlex: {
    flex: '1 1 auto',
  },
  expandButton: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-accent)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    padding: `${hds.space.px2} ${hds.space.px6}`,
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
  expandedDetail: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: `${hds.space.px8} ${hds.space.px12} ${hds.space.px12} ${hds.space.px12}`,
    borderTop: '1px solid var(--semantic-color-border-default)',
  },
  bodyFull: {
    margin: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-content-primary)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: '240px',
    overflow: 'auto',
    background: 'var(--semantic-color-surface-page)',
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
  },
  diagBlock: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
  },
  diagHead: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    textTransform: 'uppercase' as const, // eyebrow-ok: detail-section kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  diagRow: {
    display: 'grid',
    gridTemplateColumns: '64px minmax(0, 1fr)', // grid-ok: fixed level column + fluid message
    gap: hds.space.px8,
    fontSize: hds.fontSize['2xs'],
    fontFamily: hds.monoFamily,
  },
  diagLevel: {
    textTransform: 'uppercase' as const, // eyebrow-ok: severity tag
    fontSize: hds.fontSize['2xs'],
  },
  diagMessage: {
    color: 'var(--semantic-color-content-primary)',
    wordBreak: 'break-word' as const,
  },
  failureMessage: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize['2xs'],
    color: 'var(--semantic-color-feedback-error)',
    wordBreak: 'break-word' as const,
  },
} satisfies Record<string, CSSProperties>;
