/* hds-bypass: ops-internal page */
/* eslint-disable react-hooks/set-state-in-effect -- mount-time data hydration via fetch is intentional: matches PluginsBar / SkillsBar idiom and avoids SSR mismatch */

/**
 * ResearchBar — feed of recent auto-research findings.
 *
 * Reads GET /api/research-feed which scans docs/research/findings/<id>/*.md
 * (frontmatter + teaser body). Each query collapses into a tile; clicking
 * one expands the most-recent finding inline (matches the PluginsBar
 * idiom). The "Run all" button POSTs /api/skills/research-run to trigger
 * scripts/auto-research.mjs --once.
 *
 * Scheduling lives outside the browser. Until VPS provisioning lands, this
 * surface is the only trigger. See docs/research/queries.json for the
 * subscription manifest and scripts/auto-research.mjs for the runner.
 */

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Stack } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { opsApi } from '../../../lib/opsApi';

interface QuerySpec {
  id: string;
  topic?: string;
  enabled?: boolean;
  schedule?: string;
}

interface Finding {
  id: string;
  topic: string;
  ts: string;
  model: string;
  durationMs: number;
  teaser: string;
  file: string;
}

interface FeedResponse {
  queries: QuerySpec[];
  findings: Finding[];
  now?: number;
  error?: string;
}

type RunState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'success'; ran: number; durationMs: number }
  | { kind: 'error'; message: string };

export function ResearchBar() {
  const [feed, setFeed] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [runState, setRunState] = useState<RunState>({ kind: 'idle' });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/research-feed');
      const body = (await res.json()) as FeedResponse;
      setFeed(body);
    } catch (err) {
      setFeed({
        queries: [],
        findings: [],
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const latestPerQuery = useMemo(() => {
    const map = new Map<string, Finding>();
    if (!feed) return map;
    // Findings arrive sorted newest-first by the middleware; keep first hit.
    for (const f of feed.findings) {
      if (!map.has(f.id)) map.set(f.id, f);
    }
    return map;
  }, [feed]);

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => (prev === id ? null : id));
  }, []);

  const handleRunAll = useCallback(async () => {
    setRunState({ kind: 'running' });
    const start = Date.now();
    try {
      const res = await opsApi.post('/api/skills/research-run');
      const body = (await res.json()) as {
        ok?: boolean;
        durationMs?: number;
        parsedOutput?: { ran?: number; findings?: Array<{ ok: boolean }> };
        error?: string;
      };
      if (!body.ok) {
        setRunState({ kind: 'error', message: body.error || 'run failed' });
        return;
      }
      const ran = body.parsedOutput?.ran ?? 0;
      setRunState({
        kind: 'success',
        ran,
        durationMs: body.durationMs ?? Date.now() - start,
      });
      await refresh();
    } catch (err) {
      setRunState({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }, [refresh]);

  if (loading) return <div style={s.muted}>loading…</div>;
  if (feed?.error) {
    return <div style={s.muted}>research feed unavailable: {feed.error}</div>;
  }

  const queries = feed?.queries ?? [];
  const totalFindings = feed?.findings.length ?? 0;
  const enabled = queries.filter((q) => q.enabled !== false).length;

  return (
    <Stack direction="column" gap="px16">
      <Stack direction="row" align="center" justify="space-between" gap="px8" wrap="wrap">
        <span style={s.summary}>
          {queries.length} subscriptions · {enabled} enabled · {totalFindings} findings
        </span>
        <RunControls state={runState} onRun={handleRunAll} />
      </Stack>

      {queries.length === 0 ? (
        <div style={s.muted}>
          No queries configured. Edit <code style={s.code}>docs/research/queries.json</code> to add
          one.
        </div>
      ) : (
        <div style={s.grid}>
          {queries.map((q) => (
            <QueryTile
              key={q.id}
              spec={q}
              latest={latestPerQuery.get(q.id) ?? null}
              open={expanded === q.id}
              onToggle={toggle}
            />
          ))}
        </div>
      )}
    </Stack>
  );
}

function QueryTile({
  spec,
  latest,
  open,
  onToggle,
}: {
  spec: QuerySpec;
  latest: Finding | null;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const enabled = spec.enabled !== false;
  const indicator = latest ? '●' : enabled ? '○' : '◌';
  const indicatorColor = latest
    ? 'var(--semantic-color-feedback-success)'
    : 'var(--semantic-color-content-secondary)';
  const subtitle = latest
    ? `${formatRelative(latest.ts)} · ${latest.model}`
    : enabled
      ? `no findings yet · ${spec.schedule ?? 'manual'}`
      : 'disabled';

  return (
    <Stack direction="column" gap="px8" style={{ minWidth: 0 }}>
      <button
        type="button"
        onClick={() => onToggle(spec.id)}
        aria-expanded={open}
        className="hds-focus"
        style={{
          ...s.button,
          borderColor: open
            ? 'var(--semantic-color-content-accent)'
            : 'var(--semantic-color-border-default)',
        }}
      >
        <span
          style={{
            ...s.buttonIndicator,
            color: open ? 'var(--semantic-color-content-accent)' : indicatorColor,
          }}
          aria-hidden="true"
        >
          {indicator}
        </span>
        <span style={s.buttonLabel}>{spec.id}</span>
        <span style={s.buttonHint}>{subtitle}</span>
      </button>

      {open && (
        <Stack direction="column" gap="px8" style={s.panel}>
          {spec.topic && <p style={s.panelTopic}>{spec.topic}</p>}
          {latest ? (
            <>
              <Stack direction="row" align="center" gap="px8" wrap="wrap" style={{ minWidth: 0 }}>
                <span style={s.panelMeta}>{new Date(latest.ts).toLocaleString()}</span>
                <span style={s.panelMetaDim}>· {latest.model}</span>
                <span style={s.panelMetaDim}>· {latest.durationMs}ms</span>
              </Stack>
              <pre style={s.teaser}>{latest.teaser || '(empty finding)'}</pre>
              <span style={s.panelMetaDim}>{latest.file}</span>
            </>
          ) : (
            <span style={s.panelMetaDim}>
              run{' '}
              <code style={s.code}>node scripts/auto-research.mjs --once --query {spec.id}</code> to
              populate.
            </span>
          )}
        </Stack>
      )}
    </Stack>
  );
}

function RunControls({ state, onRun }: { state: RunState; onRun: () => void }) {
  const busy = state.kind === 'running';
  return (
    <Stack direction="row" align="center" gap="px8">
      <StatusLine state={state} />
      <button
        type="button"
        onClick={onRun}
        disabled={busy}
        aria-busy={busy}
        className="hds-focus"
        style={{
          ...s.runButton,
          opacity: busy ? 0.6 : 1,
          cursor: busy ? 'not-allowed' : 'pointer',
        }}
      >
        {busy ? 'running…' : 'run all'}
      </button>
    </Stack>
  );
}

function StatusLine({ state }: { state: RunState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'running') {
    return (
      <span style={{ ...s.runStatus, color: 'var(--semantic-color-content-accent)' }}>
        calling Ollama…
      </span>
    );
  }
  if (state.kind === 'success') {
    return (
      <span
        style={{ ...s.runStatus, color: 'var(--semantic-color-feedback-success)' }}
        role="status"
      >
        ran {state.ran} · {state.durationMs}ms
      </span>
    );
  }
  return (
    <span style={{ ...s.runStatus, color: 'var(--semantic-color-feedback-error)' }} role="alert">
      {state.message}
    </span>
  );
}

function formatRelative(ts: string): string {
  if (!ts) return '—';
  const then = Date.parse(ts);
  if (Number.isNaN(then)) return ts;
  const diffMs = Date.now() - then;
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

const s = {
  muted: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  summary: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  code: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    padding: `0 ${hds.space.px4}`,
    background: 'var(--semantic-color-surface-raised)',
    borderRadius: hds.borderRadius[2],
    color: 'var(--semantic-color-content-primary)',
  } as CSSProperties,
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', // grid-ok: research subscription tile grid
    gap: hds.space.px8,
  } as CSSProperties,
  button: {
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)', // grid-ok: indicator + label/hint, mirrors SkillsBar tile layout
    gridTemplateRows: 'auto auto',
    columnGap: hds.space.px8,
    rowGap: hds.space.px2,
    padding: `${hds.space.px12} ${hds.space.px12}`,
    minHeight: '56px',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    border: '1px solid',
    borderRadius: hds.borderRadius.md,
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
  } as CSSProperties,
  buttonIndicator: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.lg,
    lineHeight: 1,
    gridRow: '1 / span 2',
    alignSelf: 'center',
  } as CSSProperties,
  buttonLabel: {
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  buttonHint: {
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  } as CSSProperties,
  panel: {
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius.md,
    padding: hds.space.px8,
    background: 'var(--semantic-color-surface-raised)',
    minWidth: 0,
  } as CSSProperties,
  panelTopic: {
    margin: 0,
    fontSize: hds.fontSize.sm,
    color: 'var(--semantic-color-content-primary)',
    lineHeight: 1.5,
  } as CSSProperties,
  panelMeta: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  } as CSSProperties,
  panelMetaDim: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  } as CSSProperties,
  teaser: {
    margin: 0,
    padding: hds.space.px8,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    background: 'var(--semantic-color-surface-base)',
    borderRadius: hds.borderRadius.sm,
    maxHeight: '320px',
    overflow: 'auto',
  } as CSSProperties,
  runButton: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.sm,
    padding: `${hds.space.px4} ${hds.space.px12}`,
    background: 'var(--semantic-color-content-accent)',
    color: 'var(--semantic-color-surface-base)',
    border: '1px solid var(--semantic-color-content-accent)',
    borderRadius: hds.borderRadius.md,
  } as CSSProperties,
  runStatus: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
  } as CSSProperties,
};
