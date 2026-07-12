/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * RalphPanel — live fleet view of the autonomous loop (ops#112, extended by
 * ops#141).
 *
 * Four lanes, straight from GitHub via GET /api/tasks?ralph=1 (labels are the
 * loop's state store): "now" — the most recent Ralph run per fleet repo —
 * "queue" — eligible ralph-ready issues in the EXACT deterministic selector
 * order (lib/tasks/ralph-queue.mjs mirrors ralph/next.sh) — "parked" — issues
 * the loop gave up on (ralph-parked/needs-adrian), each with the reason from
 * its latest 🅿️ comment and a one-tap re-queue — and "PRs" — open Ralph PRs,
 * badged wedged when classifyWedged (lib/tasks/ralph-wedge.mjs, mirrors
 * ralph/lib.sh's classify_wedged) says the gate failed or stalled ≥3h. Per-repo
 * fetch failures render as loud per-repo lines; the healthy repos still show.
 */

import { Badge, Button } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import type { ComponentProps, CSSProperties } from 'react';
import { usePoll } from '../../../lib/usePoll';
import { useTaskActions } from './useTaskActions';
import { relTimeNow } from './taskMeta';

type BadgeTone = NonNullable<ComponentProps<typeof Badge>['tone']>;

interface RalphRun {
  number: number;
  status: string;
  conclusion: string | null;
  title: string;
  url: string;
  started_at: string;
}
interface RalphRepoRuns {
  repo: string;
  runs: RalphRun[];
  error?: string;
}
interface RalphQueueItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  prio: string | null;
  wip: boolean;
}
interface RalphParkedItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  key: string;
  reason: string | null;
  needsAdrian: boolean;
  needsDod: boolean;
}
interface RalphPrItem {
  repo: string;
  number: number;
  title: string;
  url: string;
  wedged: boolean;
  wedgeReason: string | null;
}
interface RalphStatus {
  runs: RalphRepoRuns[];
  queue: RalphQueueItem[];
  parked: RalphParkedItem[];
  prs: RalphPrItem[];
  errors: { repo: string; error: string }[];
}

const POLL_MS = 45_000;
const QUEUE_SHOWN = 8;

function shortRepo(full: string): string {
  return full.slice(full.indexOf('/') + 1);
}

function runChip(entry: RalphRepoRuns): { tone: BadgeTone; label: string; url?: string } {
  if (entry.error) return { tone: 'danger', label: 'unreachable' };
  const latest = entry.runs[0];
  if (!latest) return { tone: 'neutral', label: 'never run' };
  if (latest.status === 'in_progress' || latest.status === 'queued') {
    return { tone: 'inProgress', label: `running #${latest.number}`, url: latest.url };
  }
  if (latest.conclusion === 'success') {
    return {
      tone: 'success',
      label: `idle · last ✓ ${relTimeNow(latest.started_at)}`,
      url: latest.url,
    };
  }
  return {
    tone: 'danger',
    label: `last run ${latest.conclusion ?? latest.status}`,
    url: latest.url,
  };
}

export function RalphPanel() {
  const { data, isOffline, isInitialLoading, refetch } = usePoll<RalphStatus>(
    async (signal) => {
      const res = await fetch('/api/tasks?ralph=1', { signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as RalphStatus;
    },
    { intervalMs: POLL_MS, offlineIntervalMs: POLL_MS * 2, requestTimeoutMs: 15_000 },
  );

  const { act, busyKeys } = useTaskActions(refetch);

  return (
    <section style={s.panel} aria-labelledby="ralph-panel-label" data-role="ralph-panel">
      <header style={s.header}>
        <span id="ralph-panel-label" style={s.label}>
          Ralph — fleet
        </span>
        {isInitialLoading && <span style={s.quiet}>loading…</span>}
        {isOffline && <span style={s.quiet}>unreachable — retrying</span>}
      </header>

      {data && (
        <div style={s.body}>
          <div style={s.repoRow}>
            {data.runs.map((entry) => {
              const chip = runChip(entry);
              return (
                <span key={entry.repo} style={s.repoCell}>
                  <span style={s.repoName}>{shortRepo(entry.repo)}</span>
                  {chip.url ? (
                    <a href={chip.url} target="_blank" rel="noreferrer" style={s.chipLink}>
                      <Badge tone={chip.tone}>{chip.label}</Badge>
                    </a>
                  ) : (
                    <Badge tone={chip.tone}>{chip.label}</Badge>
                  )}
                </span>
              );
            })}
          </div>

          {data.errors.map((e) => (
            <p key={e.repo} style={s.errorLine}>
              {shortRepo(e.repo)}: {e.error}
            </p>
          ))}

          <ol style={s.queue}>
            {data.queue.slice(0, QUEUE_SHOWN).map((q) => (
              <li key={`${q.repo}#${q.number}`} style={s.queueItem}>
                <a href={q.url} target="_blank" rel="noreferrer" style={s.queueLink}>
                  <span style={s.queueNum}>
                    {shortRepo(q.repo)}#{q.number}
                  </span>{' '}
                  {q.title}
                </a>
                {q.prio && (
                  <Badge
                    tone={q.prio === 'p0' ? 'danger' : q.prio === 'p1' ? 'warning' : 'neutral'}
                  >
                    {q.prio}
                  </Badge>
                )}
                {q.wip && <Badge tone="inProgress">working</Badge>}
              </li>
            ))}
            {data.queue.length === 0 && (
              <li style={s.quiet}>queue empty — tag something ralph-ready</li>
            )}
          </ol>
          {data.queue.length > QUEUE_SHOWN && (
            <span style={s.quiet}>+{data.queue.length - QUEUE_SHOWN} more in queue</span>
          )}

          {data.prs.length > 0 && (
            <ol style={s.queue} aria-label="Open Ralph PRs" data-role="ralph-prs">
              {data.prs.map((pr) => (
                <li key={`${pr.repo}#${pr.number}`} style={s.queueItem}>
                  <a href={pr.url} target="_blank" rel="noreferrer" style={s.queueLink}>
                    <span style={s.queueNum}>
                      {shortRepo(pr.repo)}#{pr.number}
                    </span>{' '}
                    {pr.title}
                  </a>
                  {pr.wedged && (
                    <span title={pr.wedgeReason ?? undefined}>
                      <Badge tone="danger">wedged</Badge>
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}

          <div style={s.parkedSection} data-role="ralph-parked-lane">
            <span style={s.label}>Parked</span>
            <ol style={s.queue}>
              {data.parked.map((p) => (
                <li key={p.key} style={s.parkedItem}>
                  <div style={s.parkedRow}>
                    <a href={p.url} target="_blank" rel="noreferrer" style={s.queueLink}>
                      <span style={s.queueNum}>
                        {shortRepo(p.repo)}#{p.number}
                      </span>{' '}
                      {p.title}
                    </a>
                    <Badge tone={p.needsAdrian ? 'warning' : 'neutral'}>
                      {p.needsAdrian ? 'needs-adrian' : 'ralph-parked'}
                    </Badge>
                    {p.needsAdrian ? (
                      <span style={s.quiet}>
                        {p.needsDod
                          ? 'needs a DoD checklist first — add a `- [ ]` acceptance/DoD section, then re-queue.'
                          : 'needs a human decision before re-queuing.'}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyKeys.has(p.key)}
                        onClick={() => void act(p.key, 'ralph_requeue')}
                      >
                        Re-queue
                      </Button>
                    )}
                  </div>
                  {p.reason && <p style={s.parkedReason}>{p.reason}</p>}
                </li>
              ))}
              {data.parked.length === 0 && <li style={s.quiet}>nothing parked</li>}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

const s = {
  panel: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px8,
    padding: hds.space.px12,
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[8],
    background: 'var(--semantic-color-surface-raised)',
  },
  header: { display: 'flex', alignItems: 'baseline', gap: hds.space.px8 },
  label: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    textTransform: 'uppercase' as const, // eyebrow-ok: panel kicker
    letterSpacing: '0.08em',
    color: 'var(--semantic-color-content-secondary)',
  },
  quiet: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-disabled)',
  },
  body: { display: 'flex', flexDirection: 'column' as const, gap: hds.space.px8 },
  repoRow: {
    display: 'flex',
    gap: hds.space.px16,
    flexWrap: 'wrap' as const,
    alignItems: 'center',
  },
  repoCell: { display: 'inline-flex', alignItems: 'center', gap: hds.space.px4 },
  repoName: {
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
  },
  chipLink: { textDecoration: 'none' },
  errorLine: {
    margin: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-danger, #b3423a)',
  },
  queue: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
  },
  queueItem: { display: 'flex', alignItems: 'center', gap: hds.space.px8, minWidth: 0 },
  queueLink: {
    ...hds.typeStyles.ui,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-primary)',
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  queueNum: {
    fontFamily: hds.monoFamily,
    color: 'var(--semantic-color-content-secondary)',
    fontVariantNumeric: 'tabular-nums',
  },
  parkedSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    borderTop: '1px solid var(--semantic-color-border-default)',
    paddingTop: hds.space.px8,
  },
  parkedItem: { display: 'flex', flexDirection: 'column' as const, gap: hds.space.px4 },
  parkedRow: {
    display: 'flex',
    alignItems: 'center',
    gap: hds.space.px8,
    minWidth: 0,
    flexWrap: 'wrap' as const,
  },
  parkedReason: {
    margin: 0,
    fontFamily: hds.monoFamily,
    fontSize: hds.fontSize.xs,
    color: 'var(--semantic-color-content-secondary)',
  },
} satisfies Record<string, CSSProperties>;
