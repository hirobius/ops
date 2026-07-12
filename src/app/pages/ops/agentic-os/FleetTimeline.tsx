/* hds-bypass: ops-internal page */

/**
 * FleetTimeline — the "see it all-up" observability surface on `/ops` (#41
 * Slice 4). Merges THREE committed, append-only JSONL sources into one
 * newest-first timeline, so Adrian doesn't have to check three places to
 * know what the fleet has been doing:
 *
 *   - docs/ops/run-log.jsonl    autonomous agent/session recaps (#8 Slice 2)
 *   - docs/ops/events.jsonl     fleet events posted via lib/ops/notify.mjs
 *                                (dispatched/completed/approval_waiting/
 *                                deploy_error/blocked — #41 Slice 4)
 *   - docs/ops/alert-log.jsonl  deploy-ERROR / newly-blocked alerts from
 *                                scripts/deploy-alert.mjs (#11)
 *
 * Build-time `import.meta.glob` + `parseJsonlLines` idiom: no Supabase
 * migration, no new `api/*.ts` route, hot-reloads on file edit. This is the
 * single activity surface on `/ops` (superseded RunsPanel.tsx, ops#140).
 */

import type { CSSProperties } from 'react';
import { Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { parseJsonlLines } from '../../../lib/jsonl';

// ── Source row shapes (as committed to each JSONL file) ────────────────────────

interface RunLogRow {
  ts: string;
  actor: string;
  outcome: string;
  summary: string;
  task?: string;
  model?: string;
  tier?: string;
  session_url?: string;
}

interface EventRow {
  ts: string;
  kind: string;
  title: string;
  detail?: string;
  url?: string;
  task?: string;
}

interface AlertLogRow {
  ts: string;
  type: string;
  message: string;
  project?: string;
  repo?: string;
  url?: string | null;
}

// ── Normalized shape every source is mapped into ────────────────────────────────

export interface TimelineEntry {
  ts: string;
  kind: string;
  actor?: string;
  title: string;
  detail?: string;
}

// ── Sources (build-time, eager, raw) ────────────────────────────────────────────

const _runLogGlob = import.meta.glob<string>('../../../../../docs/ops/run-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const runLogRaw = (Object.values(_runLogGlob)[0] as string | undefined) ?? '';

const _eventsGlob = import.meta.glob<string>('../../../../../docs/ops/events.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const eventsRaw = (Object.values(_eventsGlob)[0] as string | undefined) ?? '';

const _alertLogGlob = import.meta.glob<string>('../../../../../docs/ops/alert-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const alertLogRaw = (Object.values(_alertLogGlob)[0] as string | undefined) ?? '';

// ── Normalize + merge ────────────────────────────────────────────────────────────

/** run-log's `outcome` vocabulary (shipped/blocked/no-op) doubles as its `kind`. */
function fromRunLog(rows: RunLogRow[]): TimelineEntry[] {
  return rows.map((r) => ({
    ts: r.ts,
    kind: r.outcome,
    actor: r.actor,
    title: r.summary,
    detail: [r.task, r.model].filter(Boolean).join(' · ') || undefined,
  }));
}

function fromEvents(rows: EventRow[]): TimelineEntry[] {
  return rows.map((r) => ({
    ts: r.ts,
    kind: r.kind,
    title: r.title,
    detail: [r.task, r.detail].filter(Boolean).join(' · ') || undefined,
  }));
}

/** alert-log only ever holds ALERT rows (deploy_error | newly_blocked) — see appendAlertLog. */
function fromAlertLog(rows: AlertLogRow[]): TimelineEntry[] {
  return rows.map((r) => ({
    ts: r.ts,
    kind: r.type,
    actor: 'deploy-alert',
    title: r.message,
    detail: r.project ?? r.repo,
  }));
}

function sortNewestFirst(entries: TimelineEntry[]): TimelineEntry[] {
  return [...entries].sort((a, b) => {
    const ta = Date.parse(a.ts ?? '');
    const tb = Date.parse(b.ts ?? '');
    const va = Number.isFinite(ta) ? ta : -Infinity;
    const vb = Number.isFinite(tb) ? tb : -Infinity;
    return vb - va;
  });
}

const TIMELINE: TimelineEntry[] = sortNewestFirst([
  ...fromRunLog(parseJsonlLines<RunLogRow>(runLogRaw)),
  ...fromEvents(parseJsonlLines<EventRow>(eventsRaw)),
  ...fromAlertLog(parseJsonlLines<AlertLogRow>(alertLogRaw)),
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'inProgress';

/** Kind-toned badge — covers events.jsonl's kind vocabulary, run-log's outcome
 * vocabulary, and alert-log's type vocabulary, since all three land here. */
function kindTone(kind: string): Tone {
  switch (kind) {
    case 'completed':
    case 'shipped':
      return 'success';
    case 'dispatched':
      return 'info';
    case 'approval_waiting':
      return 'warning';
    case 'deploy_error':
    case 'blocked':
    case 'newly_blocked':
      return 'danger';
    default:
      return 'neutral';
  }
}

/** ISO timestamp → "07-07 19:05" (UTC, deterministic — no locale/timezone drift). */
function fmtTime(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts);
  if (!m) return ts;
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FleetTimeline({ limit = 20 }: { limit?: number }) {
  const rows = TIMELINE.slice(0, limit);

  if (rows.length === 0) {
    return (
      <p style={s.empty}>
        No fleet activity yet — post one with{' '}
        <code style={s.code}>node scripts/notify.mjs</code>.
      </p>
    );
  }

  return (
    <Stack direction="column" gap="px8">
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '14%' }}>Time (UTC)</th>
              <th style={{ ...s.th, width: '14%' }}>Kind</th>
              <th style={{ ...s.th, width: '16%' }}>Actor</th>
              <th style={s.th}>Event</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.ts}-${i}`} style={s.row}>
                <td style={{ ...s.td, ...s.timeCell }}>{fmtTime(r.ts)}</td>
                <td style={s.td}>
                  <Badge tone={kindTone(r.kind)}>{r.kind}</Badge>
                </td>
                <td style={{ ...s.td, ...s.actorCell }}>{r.actor ?? '—'}</td>
                <td style={{ ...s.td, ...s.titleCell }}>
                  {r.title}
                  {r.detail ? <span style={s.meta}> · {r.detail}</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = {
  empty: {
    margin: 0,
    ...hds.typeStyles.bodySmall,
    color: 'var(--semantic-color-content-secondary)',
  } satisfies CSSProperties,

  code: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-primary)',
  } satisfies CSSProperties,

  tableWrap: {
    overflowX: 'auto',
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: 'var(--semantic-radius-card)',
  } satisfies CSSProperties,

  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: hds.typeStyles.caption.fontSize,
    tableLayout: 'fixed',
  } satisfies CSSProperties,

  th: {
    textAlign: 'left',
    padding: `${hds.space.px6} ${hds.space.px12}`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-secondary)',
    borderBottom: '1px solid var(--semantic-color-border-default)',
    fontSize: hds.typeStyles.caption.fontSize,
    whiteSpace: 'nowrap',
  } satisfies CSSProperties,

  row: {
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
  } satisfies CSSProperties,

  td: {
    padding: `${hds.space.px6} ${hds.space.px12}`,
    verticalAlign: 'middle',
    color: 'var(--semantic-color-content-primary)',
  } satisfies CSSProperties,

  timeCell: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-secondary)',
    whiteSpace: 'nowrap',
  } satisfies CSSProperties,

  actorCell: {
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  } satisfies CSSProperties,

  titleCell: {
    fontSize: hds.typeStyles.caption.fontSize,
  } satisfies CSSProperties,

  meta: {
    color: 'var(--semantic-color-content-tertiary)',
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
  } satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
