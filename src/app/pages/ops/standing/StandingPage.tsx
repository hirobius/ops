/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * StandingPage — /ops/standing.
 *
 * The one-screen answer to "where do things actually stand", built for a phone
 * on the way somewhere. Three questions, in the order they matter:
 *
 *   1. Where does the revenue chain break?  — `chain.ts`, editorial, no fetch.
 *   2. What is blocked on Adrian?           — live, GET /api/tasks?ralph=1.
 *   3. What is the loop doing right now?    — same read: open PRs + queue.
 *
 * Deliberately NOT a task board. /ops/tasks is where work gets moved; this page
 * is read-only and exists so the fleet can be understood without operating it.
 * It leads with the chain because the fleet's recurring failure is aim, not
 * capability — #185 sat p0 and unqueued for 64 days, then shipped in two hours
 * once it was labelled (ops#274).
 *
 * The chain never polls; the three live lanes share the Ralph fleet read, which
 * goes straight to GitHub rather than the Supabase task mirror, so nothing here
 * can be stale in the way the mirror can. Pre-token the endpoint 503s and the
 * page renders the named env hint — the chain still renders, because it does
 * not depend on the fetch.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Badge } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { usePoll } from '../../../lib/usePoll';
import {
  fetchRalphStatus,
  shortRepo,
  type RalphStatus,
  type RalphParkedItem,
} from '../ralphStatus';
import { CHAIN, chainSummary, type ChainLink, type LinkState } from './chain';

const POLL_MS = 60_000;
const SHOWN = 8;

const STATE_COLOR: Record<LinkState, string> = {
  live: 'var(--semantic-color-feedback-success)',
  partial: 'var(--semantic-color-feedback-warning)',
  cut: 'var(--semantic-color-feedback-error)',
  absent: 'var(--semantic-color-content-tertiary)',
};

const STATE_WORD: Record<LinkState, string> = {
  live: 'live',
  partial: 'held back',
  cut: 'severed',
  absent: 'not built',
};

const SUMMARY = chainSummary(CHAIN);

/** needs-adrian is a decision only Adrian can make; ralph-parked the loop can retry. */
function decisionsFirst(parked: readonly RalphParkedItem[]): RalphParkedItem[] {
  return [...parked].sort((a, b) => {
    if (a.label === b.label) return a.number - b.number;
    return a.label === 'needs-adrian' ? -1 : 1;
  });
}

export default function StandingPage() {
  const { data, error } = usePoll<RalphStatus>(fetchRalphStatus, {
    intervalMs: POLL_MS,
    offlineIntervalMs: POLL_MS * 3,
    requestTimeoutMs: 15_000,
  });

  const parked = decisionsFirst(data?.parked ?? []);
  const prs = data?.prs ?? [];
  const queue = data?.queue ?? [];
  const needsToken = error?.includes('GITHUB_TOKEN') ?? false;
  /** A real payload has arrived — not merely "a request finished". */
  const loaded = data !== null;

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Standing' }]}
        title="Standing"
        lede="Where the chain breaks, what is blocked on you, and what the loop is doing."
      />

      {/* ── 1. The chain ─────────────────────────────────────────────────── */}
      <Section
        title="The chain"
        count={`${SUMMARY.throughput}% reaches the far end`}
      >
        <p style={s.lede}>
          Eight links turn a lead into a paid site. They average{' '}
          <strong style={s.strong}>{SUMMARY.averageBuilt}% built</strong> — a flattering
          number, because a chain is its weakest link.
          {SUMMARY.firstBreak ? (
            <>
              {' '}
              It parts at{' '}
              <strong style={s.strong}>
                ({SUMMARY.firstBreak.n}) {SUMMARY.firstBreak.name}
              </strong>
              , and nothing downstream has ever carried a real lead.
            </>
          ) : null}
        </p>

        <ol style={s.chain}>
          {CHAIN.map((l) => (
            <ChainRow key={l.n} link={l} isBreak={l.n === SUMMARY.firstBreak?.n} />
          ))}
        </ol>
      </Section>

      {/* ── 2. Waiting on you ────────────────────────────────────────────── */}
      <Section
        title="Waiting on you"
        count={laneCount(needsToken, error, loaded, parked.length, ['blocked on you', 'blocked on you'])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={parked.length === 0}
          emptyCopy="Nothing is waiting on a decision. Rare — enjoy it."
        >
          <ul style={s.list}>
            {parked.slice(0, SHOWN).map((p) => (
              <li key={`${p.repo}#${p.number}`} style={s.row}>
                <a href={p.url} target="_blank" rel="noreferrer" style={s.rowLink}>
                  <span style={s.num}>#{p.number}</span>
                  <span style={s.title}>{p.title}</span>
                </a>
                <div style={s.metaRow}>
                  <Badge tone={p.label === 'ralph-parked' ? 'danger' : 'warning'}>
                    {p.label}
                  </Badge>
                  <span style={s.meta}>
                    {shortRepo(p.repo)}
                    {p.hint ? ` · ${p.hint}` : p.reason ? ` · ${p.reason}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Lane>
        {parked.length > SHOWN ? (
          <p style={s.more}>+{parked.length - SHOWN} more on the tasks board</p>
        ) : null}
      </Section>

      {/* ── 3. In flight ─────────────────────────────────────────────────── */}
      <Section
        title="In flight"
        count={laneCount(needsToken, error, loaded, prs.length, ['open Ralph PR', 'open Ralph PRs'])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={prs.length === 0}
          emptyCopy="No Ralph PR is open — under single-flight that means the loop is free to claim the next issue."
        >
          <ul style={s.list}>
            {prs.slice(0, SHOWN).map((pr) => (
              <li key={`${pr.repo}#${pr.number}`} style={s.row}>
                <a href={pr.url} target="_blank" rel="noreferrer" style={s.rowLink}>
                  <span style={s.num}>#{pr.number}</span>
                  <span style={s.title}>{pr.title}</span>
                </a>
                <div style={s.metaRow}>
                  {pr.wedged ? (
                    <Badge tone="danger" title={pr.wedgeReason ?? 'wedged'}>
                      wedged
                    </Badge>
                  ) : null}
                  <span style={s.meta}>
                    {shortRepo(pr.repo)}
                    {pr.wedged && pr.wedgeReason ? ` · ${pr.wedgeReason}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Lane>
      </Section>

      {/* ── 4. Queued ────────────────────────────────────────────────────── */}
      <Section
        title="Queued for the loop"
        count={laneCount(needsToken, error, loaded, queue.length, ['ralph-ready issue', 'ralph-ready issues'])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={queue.length === 0}
          emptyCopy="The ready pool is empty — the loop has nothing to pick up. Label something ralph-ready, biased to the revenue path."
        >
          <div style={s.chips}>
            {queue.slice(0, 12).map((q) => (
              <a
                key={`${q.repo}#${q.number}`}
                href={q.url}
                target="_blank"
                rel="noreferrer"
                style={s.chip}
                title={q.title}
              >
                #{q.number} {q.prio ?? ''}
                {q.wip ? ' · working' : ''}
              </a>
            ))}
          </div>
        </Lane>
        <p style={s.footnote}>
          Selector order mirrors <code style={s.code}>ralph/next.sh</code> exactly — this is
          the order the loop will actually take them in.
        </p>
      </Section>
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: ReactNode;
}) {
  return (
    <section style={s.section}>
      <div style={s.sectionHead}>
        <h2 style={s.sectionTitle}>{title}</h2>
        <span style={s.sectionCount}>{count}</span>
      </div>
      {children}
    </section>
  );
}

function ChainRow({ link, isBreak }: { link: ChainLink; isBreak: boolean }) {
  const color = STATE_COLOR[link.state];
  return (
    <li style={s.link}>
      <div style={s.linkRail}>
        <span style={{ ...s.linkDot, borderColor: color, color }}>{link.n}</span>
        {link.n < CHAIN.length ? (
          <span
            style={{
              ...s.linkSpine,
              ...(isBreak
                ? { background: 'none', borderLeft: `2px dashed ${color}` }
                : null),
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div style={s.linkBody}>
        <div style={s.linkTop}>
          <span style={s.linkName}>{link.name}</span>
          <span style={{ ...s.linkPct, color }}>{link.built}%</span>
        </div>
        <div style={s.bar}>
          <span style={{ ...s.barFill, width: `${link.built}%`, background: color }} />
        </div>
        <p style={s.linkNote}>
          <span style={{ ...s.linkState, color }}>{STATE_WORD[link.state]}</span>
          {' — '}
          {link.note}
        </p>
        {link.issues.length > 0 ? (
          <div style={s.linkIssues}>
            {link.issues.map((n) => (
              <a
                key={n}
                href={`https://github.com/hirobius/ops/issues/${n}`}
                target="_blank"
                rel="noreferrer"
                style={s.issueRef}
              >
                #{n}
              </a>
            ))}
          </div>
        ) : null}
        {isBreak ? (
          <p style={s.breakCall}>
            Everything downstream is built and idle, waiting on a preview URL that cannot
            exist yet. This is the only fix that changes the business.
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * One live lane's body. The branch ORDER is the point: an error is reported the
 * moment one exists, BEFORE any loading copy. `usePoll` keeps
 * `isInitialLoading` true while a fetch keeps failing (it is `data === null &&
 * !isOffline`, and `isOffline` only trips after three consecutive failures), so
 * a loading-first ladder shows "Reading the fleet…" for ~2 minutes over a hard
 * failure. Silence is the one thing this page must never do.
 */
function Lane({
  needsToken,
  error,
  loaded,
  empty,
  emptyCopy,
  children,
}: {
  needsToken: boolean;
  error: string | null;
  /** True once a real payload has arrived — not merely "a request finished". */
  loaded: boolean;
  empty: boolean;
  emptyCopy: string;
  children: ReactNode;
}) {
  if (needsToken) return <EnvHint message={error} />;
  if (error && !loaded) return <p style={s.notice}>Couldn’t reach /api/tasks — {error}</p>;
  if (!loaded) return <p style={s.notice}>Reading the fleet…</p>;
  if (empty) return <p style={s.notice}>{emptyCopy}</p>;
  return <>{children}</>;
}

function EnvHint({ message }: { message: string | null }) {
  return (
    <p style={s.notice}>
      {message ??
        'GITHUB_TOKEN is not set — the live lanes need it. Add it in Vercel → Settings → Environment Variables (Production + Preview), then redeploy.'}
    </p>
  );
}

/**
 * The lane's count line. Mirrors <Lane>'s branch order so the header can never
 * read "…" over a lane that is already showing a hard failure. `noun` is
 * written out for both numbers rather than suffixed with an "s" — "0 blockeds"
 * is the kind of thing that makes a dashboard look untended.
 */
function laneCount(
  needsToken: boolean,
  error: string | null,
  loaded: boolean,
  n: number,
  noun: readonly [one: string, many: string],
): string {
  if (needsToken) return 'needs GITHUB_TOKEN';
  if (error && !loaded) return 'unreachable';
  if (!loaded) return '…';
  return `${n} ${n === 1 ? noun[0] : noun[1]}`;
}

/* ── styles ─────────────────────────────────────────────────────────────── */

const s = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px32,
    maxWidth: '760px',
    margin: '0 auto',
    padding: hds.space.px24,
  },

  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px12,
  },
  sectionHead: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px12,
    paddingBottom: hds.space.px8,
    borderBottom: '1px solid var(--semantic-color-border-default)',
  },
  sectionTitle: {
    ...hds.typeStyles.h3,
    margin: 0,
    color: 'var(--semantic-color-content-primary)',
  },
  sectionCount: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-secondary)',
    whiteSpace: 'nowrap' as const,
  },

  lede: {
    ...hds.typeStyles.body,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
    maxWidth: '60ch',
  },
  strong: { color: 'var(--semantic-color-content-primary)', fontWeight: 600 },

  /* chain */
  chain: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  link: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr',
    columnGap: hds.space.px12,
  },
  linkRail: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
  },
  linkDot: {
    ...hds.typeStyles.labelTechnical,
    width: '28px',
    height: '28px',
    flexShrink: 0,
    borderRadius: '50%',
    border: '2px solid',
    display: 'grid',
    placeItems: 'center',
    background: 'var(--semantic-color-surface-base)',
  },
  linkSpine: {
    flex: 1,
    width: '2px',
    minHeight: hds.space.px16,
    background: 'var(--semantic-color-border-subtle)',
  },
  linkBody: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    paddingBottom: hds.space.px20,
    minWidth: 0,
  },
  linkTop: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: hds.space.px8,
  },
  linkName: {
    ...hds.typeStyles.label,
    color: 'var(--semantic-color-content-primary)',
  },
  linkPct: {
    ...hds.typeStyles.labelTechnical,
    fontVariantNumeric: 'tabular-nums',
  },
  bar: {
    height: '5px',
    borderRadius: hds.borderRadius.sm,
    background: 'var(--semantic-color-border-subtle)',
    overflow: 'hidden',
  },
  barFill: {
    display: 'block',
    height: '100%',
    borderRadius: hds.borderRadius.sm,
  },
  linkNote: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  },
  linkState: {
    ...hds.typeStyles.labelTechnical,
    textTransform: 'uppercase' as const,
  },
  linkIssues: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: hds.space.px6,
  },
  issueRef: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
  },
  breakCall: {
    ...hds.typeStyles.bodySmall,
    margin: `${hds.space.px4} 0 0`,
    padding: hds.space.px12,
    borderLeft: '3px solid var(--semantic-color-feedback-error)',
    borderRadius: `0 ${hds.borderRadius.sm} ${hds.borderRadius.sm} 0`,
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
  },

  /* live lanes */
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  row: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: hds.space.px4,
    padding: `${hds.space.px12} 0`,
    borderBottom: '1px solid var(--semantic-color-border-subtle)',
  },
  rowLink: {
    display: 'flex',
    alignItems: 'baseline',
    gap: hds.space.px8,
    textDecoration: 'none',
    minWidth: 0,
  },
  num: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-content-accent)',
    flexShrink: 0,
  },
  title: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap' as const,
    gap: hds.space.px6,
  },
  meta: {
    ...hds.typeStyles.caption,
    color: 'var(--semantic-color-content-secondary)',
  },
  more: {
    ...hds.typeStyles.caption,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
  },

  /* queue */
  chips: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: hds.space.px6,
  },
  chip: {
    ...hds.typeStyles.labelTechnical,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    color: 'var(--semantic-color-content-accent)',
    textDecoration: 'none',
    whiteSpace: 'nowrap' as const,
  },

  notice: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    color: 'var(--semantic-color-content-secondary)',
    maxWidth: '60ch',
  },
  footnote: {
    ...hds.typeStyles.caption,
    margin: 0,
    color: 'var(--semantic-color-content-tertiary)',
  },
  code: {
    ...hds.typeStyles.mono,
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius.sm,
    background: 'var(--semantic-color-surface-raised)',
  },
} satisfies Record<string, CSSProperties>;
