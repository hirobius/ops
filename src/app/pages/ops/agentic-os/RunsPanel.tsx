/* hds-bypass: ops-internal page */

/**
 * RunsPanel — renders the most recent autonomous-run recaps on `/ops` (#8,
 * run-log half; Slice 2).
 *
 * Reads the committed `docs/ops/run-log.jsonl` (append-only — one line per
 * agent/session run, posted via `node scripts/log-run.mjs` or `appendRun`
 * from `lib/ops/run-log.mjs`) with the SAME build-time `import.meta.glob`
 * idiom `agentic-os/data.ts` already uses for `docs/ai/routing-log.jsonl`:
 * no Supabase migration, no new `api/*.ts` route, hot-reloads on file edit.
 *
 * Goal: nothing runs silently — Adrian glances here instead of surfing
 * sessions to find out what an agent did.
 */

import type { CSSProperties } from 'react';
import { Badge, Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { parseJsonlLines } from '../../../lib/jsonl';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RunLogEntry {
  ts: string;
  actor: string;
  outcome: string;
  summary: string;
  task?: string;
  model?: string;
  tier?: string;
  tokens?: string;
  session_url?: string;
}

// ── Source: docs/ops/run-log.jsonl (build-time, eager, raw) ───────────────────

const _runLogGlob = import.meta.glob<string>('../../../../../docs/ops/run-log.jsonl', {
  eager: true,
  query: '?raw',
  import: 'default',
});
const runLogRaw = (Object.values(_runLogGlob)[0] as string | undefined) ?? '';

function sortNewestFirst(entries: RunLogEntry[]): RunLogEntry[] {
  return [...entries].sort((a, b) => {
    const ta = Date.parse(a.ts ?? '');
    const tb = Date.parse(b.ts ?? '');
    const va = Number.isFinite(ta) ? ta : -Infinity;
    const vb = Number.isFinite(tb) ? tb : -Infinity;
    return vb - va;
  });
}

const RUNS: RunLogEntry[] = sortNewestFirst(parseJsonlLines<RunLogEntry>(runLogRaw));

// ── Helpers ───────────────────────────────────────────────────────────────────

function outcomeTone(outcome: string): 'success' | 'danger' | 'neutral' | 'info' {
  if (outcome === 'shipped') return 'success';
  if (outcome === 'blocked') return 'danger';
  if (outcome === 'no-op') return 'neutral';
  return 'info';
}

/** ISO timestamp → "07-07 19:05" (UTC, deterministic — no locale/timezone drift). */
function fmtTime(ts: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(ts);
  if (!m) return ts;
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function RunsPanel({ limit = 15 }: { limit?: number }) {
  const runs = RUNS.slice(0, limit);

  if (runs.length === 0) {
    return (
      <p style={s.empty}>
        No runs logged yet — post one with <code style={s.code}>node scripts/log-run.mjs</code>.
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
              <th style={{ ...s.th, width: '16%' }}>Actor</th>
              <th style={{ ...s.th, width: '12%' }}>Outcome</th>
              <th style={s.th}>Summary</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r, i) => (
              <tr key={`${r.ts}-${i}`} style={s.row}>
                <td style={{ ...s.td, ...s.timeCell }}>{fmtTime(r.ts)}</td>
                <td style={{ ...s.td, ...s.actorCell }}>{r.actor}</td>
                <td style={s.td}>
                  <Badge tone={outcomeTone(r.outcome)}>{r.outcome}</Badge>
                </td>
                <td style={{ ...s.td, ...s.summaryCell }}>
                  {r.summary}
                  {r.task ? <span style={s.meta}> · {r.task}</span> : null}
                  {r.model ? <span style={s.meta}> · {r.model}</span> : null}
                  {r.tokens ? <span style={s.meta}> · {r.tokens} tok</span> : null}
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

  summaryCell: {
    fontSize: hds.typeStyles.caption.fontSize,
  } satisfies CSSProperties,

  meta: {
    color: 'var(--semantic-color-content-tertiary)',
    fontFamily: 'var(--semantic-typography-mono-font-family)',
    fontSize: '11px',
  } satisfies CSSProperties,
} satisfies Record<string, CSSProperties>;
