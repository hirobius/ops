/* hds-bypass: ops-internal page. Inline styles intentional for ops dashboard. */

/**
 * StandingPage — /ops/standing.
 *
 * The one-screen answer to "where do things actually stand", built for a phone
 * on the way somewhere. Three questions, in the order they matter:
 *
 *   1. Where does the revenue chain break?
 *   2. What is blocked on Adrian?
 *   3. What is the loop doing right now?
 *
 * All four sections come from ONE read, GET /api/tasks?fleet=1, and every
 * verdict on it is derived rather than authored:
 *
 *   - The chain is `leads` row counts per stage; `lib/chain/evidence.mjs` turns
 *     those plus env-var PRESENCE into each stage's state, the break (the first
 *     stage nothing reached) and the biggest leak. A stage reads `proven` only
 *     when real leads got through — shipped code never promotes one.
 *   - The three live lanes come from `listOpenIssues()`, GitHub's
 *     authenticated-identity feed, so the repo set is DISCOVERED: a repo joins
 *     this view by existing, across every owner the token can see.
 *
 * Deliberately NOT a task board. /ops/tasks is where work gets moved; this page
 * is read-only and exists so the fleet can be understood without operating it.
 * It leads with the chain because the fleet's recurring failure is aim, not
 * capability — #185 sat p0 and unqueued for 64 days, then shipped in two hours
 * once it was labelled (ops#274).
 *
 * Nothing here can go stale the way a hand-maintained status table does; the
 * one it replaced had drifted on three separate facts at once. Every lane
 * reports an error BEFORE any loading copy — see <Lane> for why that order
 * matters.
 */

import { useCallback, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { Badge, Button } from '@hirobius/design-system';
import hds from '@hirobius/design-system/tokens';
import { PageHeader } from '../PageHeader';
import { usePoll } from '../../../lib/usePoll';
import {
  actOnIssue,
  fetchDeploys,
  fetchFleetStatus,
  shortRepo,
  type DeployProject,
  type FleetStatus,
  type FleetIssue,
  type LoopState,
  type StandingAction,
} from '../ralphStatus';
import { deriveChain } from '../../../../../lib/chain/evidence.mjs';
import { Sev1Banner } from './Sev1Banner';

const POLL_MS = 60_000;
const SHOWN = 8;
/** Backlog is the long tail — show more of it than the action lanes. */
const BACKLOG_SHOWN = 25;

/**
 * Four states, and every one of them is derived — `proven` means rows actually
 * got through, not that the code looks finished.
 */
type LinkState = 'proven' | 'ready' | 'blocked' | 'unknown';

const STATE_COLOR: Record<LinkState, string> = {
  proven: 'var(--semantic-color-feedback-success)',
  ready: 'var(--semantic-color-content-tertiary)',
  blocked: 'var(--semantic-color-feedback-warning)',
  unknown: 'var(--semantic-color-content-disabled)',
};

const STATE_WORD: Record<LinkState, string> = {
  proven: 'proven',
  ready: 'untried',
  blocked: 'blocked',
  unknown: 'not measurable',
};

interface ChainLink {
  n: number;
  name: string;
  metric: string;
  unit: string;
  note: string;
  issues: number[];
  count: number | null;
  missingEnv: string[];
  state: LinkState;
}

interface Chain {
  links: ChainLink[];
  firstBreak: ChainLink | null;
  biggestDrop: { from: ChainLink; to: ChainLink; kept: number; lost: number } | null;
  reachedEnd: number;
}

export default function StandingPage() {
  const { data, error, refetch } = usePoll<FleetStatus>(fetchFleetStatus, {
    intervalMs: POLL_MS,
    offlineIntervalMs: POLL_MS * 3,
    requestTimeoutMs: 20_000,
  });

  /**
   * Which repo the lanes are scoped to, or null for the whole fleet.
   *
   * Derived from what the sweep returned, never configured — same rule as the
   * repo set itself. A filter naming a repo that no longer has open issues
   * would be a second place to keep in sync, so there isn't one.
   */
  const [repoFilter, setRepoFilter] = useState<string | null>(null);
  /** Lanes the operator has expanded past their truncation, by lane name. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const toggleLane = useCallback((lane: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(lane)) next.add(lane);
      return next;
    });
  }, []);

  const inScope = useCallback(
    <T extends { repo: string }>(rows: T[]) =>
      repoFilter ? rows.filter((r) => r.repo === repoFilter) : rows,
    [repoFilter],
  );

  const blocked = inScope(data?.blocked ?? []);
  const prs = inScope(data?.prs ?? []);
  const queue = inScope(data?.queue ?? []);
  const backlog = inScope(data?.backlog ?? []);
  const loop = data?.loop ?? [];
  const needsToken = error?.includes('GITHUB_TOKEN') ?? false;
  /** A real payload has arrived — not merely "a request finished". */
  const loaded = data !== null;
  // Every verdict below is computed from the lead-table counts and which env
  // vars are set. Nothing about the pipeline's state is authored anywhere.
  const chain: Chain = deriveChain({
    funnel: data?.funnel ?? {},
    env: data?.env ?? {},
    liveness: data?.liveness ?? null,
  });

  // Deploy state is a separate endpoint and a separate failure mode: Vercel
  // being unreachable must not blank the issue lanes, and vice versa.
  const deploys = usePoll<DeployProject[]>(fetchDeploys, {
    intervalMs: POLL_MS * 2,
    offlineIntervalMs: POLL_MS * 6,
    requestTimeoutMs: 15_000,
  });

  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());
  /**
   * Per-row action outcomes, keyed `owner/repo#n`.
   *
   * This was ONE note rendered at the top of the page. On a phone that is
   * ~1500px above the button being tapped, so on 2026-09-16 three re-queues
   * that each returned 200 and each changed the label on GitHub read as "the
   * button does nothing" — the only broken part was the feedback. An outcome
   * has to render where the thumb is, or from the operator's seat it does not
   * exist.
   */
  const [acted, setActed] = useState<ReadonlyMap<string, ActionOutcome>>(new Map());

  const act = useCallback(
    async (
      repo: string,
      number: number,
      action: StandingAction,
      label: string,
      priority?: string | null,
    ) => {
      const id = `${repo}#${number}`;
      setBusy((prev) => new Set(prev).add(id));
      const result = await actOnIssue(repo, number, action, priority);
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      setActed((prev) =>
        new Map(prev).set(
          id,
          result.ok
            ? { text: `${label} — GitHub updated.`, ok: true }
            : { text: result.error ?? 'action failed', ok: false },
        ),
      );
      // Pull the change straight back instead of leaving the row sitting in the
      // wrong lane for up to a full poll interval.
      if (result.ok) refetch();
    },
    [refetch],
  );

  return (
    <div style={s.page}>
      <PageHeader
        breadcrumbs={[{ label: 'Ops', href: '/ops' }, { label: 'Standing' }]}
        title="Standing"
        lede="Where the chain breaks, what is blocked on you, and what the loop is doing."
      />

      <Coverage data={data} error={error} needsToken={needsToken} />

      {/* ── 0. Open sev1 (ops#317) — above everything; UNKNOWN if the read failed ── */}
      <Sev1Banner sev1={data?.sev1 ?? []} error={error} needsToken={needsToken} loaded={loaded} />

      <RepoFilter repos={data?.repos ?? []} active={repoFilter} onPick={setRepoFilter} />

      <TruncationNotice data={data} />

      {/* ── 1. The chain ─────────────────────────────────────────────────── */}
      <Section title="The chain" count={`${chain.reachedEnd} paid`}>
        <p style={s.lede}>
          Eight stages from a sourced lead to a paid site. Every figure below is a row count from
          the leads table — nothing here is an estimate, and a stage counts as proven only when real
          leads got through it.
        </p>

        <ol style={s.chain}>
          {chain.links.map((l) => (
            <ChainRow
              key={l.n}
              link={l}
              total={chain.links.length}
              isBreak={l.n === chain.firstBreak?.n}
            />
          ))}
        </ol>

        {chain.biggestDrop ? (
          <p style={s.notice}>
            Steepest surviving drop: <strong style={s.strong}>{chain.biggestDrop.from.name}</strong>{' '}
            → <strong style={s.strong}>{chain.biggestDrop.to.name}</strong> keeps{' '}
            {Math.round(chain.biggestDrop.kept * 100)}% ({chain.biggestDrop.lost} lost). That is the
            leak; the break above is where flow stops entirely.
          </p>
        ) : null}
      </Section>

      {/* ── 2. Waiting on you ────────────────────────────────────────────── */}
      <Section
        title="Waiting on you"
        count={laneCount(needsToken, error, loaded, blocked.length, [
          'blocked on you',
          'blocked on you',
        ])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={blocked.length === 0}
          emptyCopy="Nothing is waiting on a decision. Rare — enjoy it."
        >
          <ul style={s.list}>
            {(expanded.has('blocked') ? blocked : blocked.slice(0, SHOWN)).map((b: FleetIssue) => (
              <IssueRow
                key={`${b.repo}#${b.number}`}
                issue={b}
                busy={busy}
                acted={acted}
                act={act}
              />
            ))}
          </ul>
        </Lane>
        <MoreToggle
          lane="blocked"
          total={blocked.length}
          shown={SHOWN}
          expanded={expanded.has('blocked')}
          onToggle={toggleLane}
        />
      </Section>

      {/* ── 3. Is the loop turning ───────────────────────────────────────── */}
      <Section title="The loop" count={loopCount(loop)}>
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={loop.length === 0}
          emptyCopy="No repo carries a ralph-* label, so there is no loop to watch."
        >
          <ul style={s.list}>
            {loop.map((l: LoopState) => (
              <li key={l.repo} style={s.row}>
                <div style={s.metaRow}>
                  <Badge tone={LOOP_TONE[l.state]}>{l.state}</Badge>
                  <span style={s.meta}>{shortRepo(l.repo)}</span>
                  <span style={s.meta}>{loopDetail(l)}</span>
                </div>
                {l.run ? (
                  <a
                    href={l.run.url}
                    target="_blank"
                    rel="noreferrer"
                    className="hds-focus"
                    style={s.rowLink}
                  >
                    <span style={s.num}>#{l.run.number}</span>
                    <span style={s.title}>{l.run.title}</span>
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </Lane>
        <p style={s.footnote}>
          A park does not re-trigger the loop — only a merge to <code style={s.code}>main</code>{' '}
          hops the chain, with a 6h watchdog behind it. An idle loop with a non-empty queue above is
          waiting for one of those, not working.
        </p>
      </Section>

      {/* ── 4. In flight ─────────────────────────────────────────────────── */}
      <Section
        title="In flight"
        count={laneCount(needsToken, error, loaded, prs.length, ['open PR', 'open PRs'])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={prs.length === 0}
          emptyCopy="No PR is open anywhere in the fleet."
        >
          <ul style={s.list}>
            {(expanded.has('prs') ? prs : prs.slice(0, SHOWN)).map((pr) => (
              <li key={`${pr.repo}#${pr.number}`} style={s.row}>
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hds-focus"
                  style={s.rowLink}
                >
                  <span style={s.num}>#{pr.number}</span>
                  <span style={s.title}>{pr.title}</span>
                </a>
                <div style={s.metaRow}>
                  {pr.draft ? <Badge tone="neutral">draft</Badge> : null}
                  <span style={s.meta}>{shortRepo(pr.repo)}</span>
                </div>
              </li>
            ))}
          </ul>
        </Lane>
        <MoreToggle
          lane="prs"
          total={prs.length}
          shown={SHOWN}
          expanded={expanded.has('prs')}
          onToggle={toggleLane}
        />
      </Section>

      {/* ── Deploys ──────────────────────────────────────────────────────── */}
      <Section title="Deploys" count={deployCount(deploys.error, deploys.data)}>
        {deploys.error && !deploys.data ? (
          <p style={s.notice}>Couldn’t reach /api/projects — {deploys.error}</p>
        ) : !deploys.data ? (
          <p style={s.notice}>Reading Vercel…</p>
        ) : deploys.data.length === 0 ? (
          <p style={s.notice}>No Vercel projects visible to this token.</p>
        ) : (
          <ul style={s.list}>
            {deploys.data.slice(0, SHOWN).map((proj) => {
              const d = proj.latestDeployment;
              const tone = deployTone(d?.state);
              return (
                <li key={proj.id} style={s.row}>
                  <div style={s.rowLink}>
                    <span style={{ ...s.num, color: tone }}>●</span>
                    <span style={s.title}>{proj.name}</span>
                  </div>
                  <div style={s.metaRow}>
                    <span style={s.meta}>
                      {d?.state ?? 'never deployed'}
                      {d?.target ? ` · ${d.target}` : ''}
                    </span>
                    {d?.url ? (
                      <a
                        href={`https://${d.url}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hds-focus"
                        style={s.issueRef}
                      >
                        open
                      </a>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {data?.errors.length ? (
        <p style={s.notice}>{data.errors.map((e) => `${e.repo}: ${e.error}`).join(' · ')}</p>
      ) : null}

      {/* ── 5. Queued ────────────────────────────────────────────────────── */}
      <Section
        title="Queued for the loop"
        count={laneCount(needsToken, error, loaded, queue.length, [
          'ralph-ready issue',
          'ralph-ready issues',
        ])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={queue.length === 0}
          emptyCopy="The ready pool is empty — the loop has nothing to pick up. Label something ralph-ready, biased to the revenue path."
        >
          <ul style={s.list}>
            {(expanded.has('queue') ? queue : queue.slice(0, SHOWN)).map((q: FleetIssue) => (
              <IssueRow
                key={`${q.repo}#${q.number}`}
                issue={q}
                busy={busy}
                acted={acted}
                act={act}
              />
            ))}
          </ul>
        </Lane>
        <MoreToggle
          lane="queue"
          total={queue.length}
          shown={SHOWN}
          expanded={expanded.has('queue')}
          onToggle={toggleLane}
        />
        <p style={s.footnote}>
          Selector order mirrors <code style={s.code}>ralph/next.sh</code> exactly — this is the
          order the loop will actually take them in.
        </p>
      </Section>

      {/* ── 6. The rest of the board ─────────────────────────────────────── */}
      <Section
        title="Backlog"
        count={laneCount(needsToken, error, loaded, backlog.length, ['issue', 'issues'])}
      >
        <Lane
          needsToken={needsToken}
          error={error}
          loaded={loaded}
          empty={backlog.length === 0}
          emptyCopy="Nothing else open. Every issue is blocked, parked or queued."
        >
          <ul style={s.list}>
            {(expanded.has('backlog') ? backlog : backlog.slice(0, BACKLOG_SHOWN)).map(
              (b: FleetIssue) => (
                <IssueRow
                  key={`${b.repo}#${b.number}`}
                  issue={b}
                  busy={busy}
                  acted={acted}
                  act={act}
                />
              ),
            )}
          </ul>
        </Lane>
        <MoreToggle
          lane="backlog"
          total={backlog.length}
          shown={BACKLOG_SHOWN}
          expanded={expanded.has('backlog')}
          onToggle={toggleLane}
        />
        <p style={s.footnote}>
          Live from GitHub, every repo the token can see. Actions write the label straight to the
          issue — no mirror, so they work on repos the importer never touched.
        </p>
      </Section>
    </div>
  );
}

/* ── pieces ─────────────────────────────────────────────────────────────── */

const PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const;

/**
 * One issue, in every lane.
 *
 * Every lane rendered its own subset before this: the queue was bare chips with
 * no metadata and no actions, the backlog had one button, "waiting on you" had
 * two. The same issue was more readable and more operable depending on which
 * lane it happened to land in, for no reason an operator could see. One
 * component means the row is the row.
 */
function IssueRow({
  issue,
  busy,
  acted,
  act,
}: {
  issue: FleetIssue;
  busy: ReadonlySet<string>;
  acted: ReadonlyMap<string, ActionOutcome>;
  act: (
    repo: string,
    number: number,
    action: StandingAction,
    label: string,
    priority?: string | null,
  ) => void;
}) {
  const id = `${issue.repo}#${issue.number}`;
  const outcome = acted.get(id);
  return (
    <li style={outcome?.ok ? { ...s.row, ...s.rowActed } : s.row}>
      <a href={issue.url} target="_blank" rel="noreferrer" className="hds-focus" style={s.rowLink}>
        <span style={s.num}>#{issue.number}</span>
        <span style={s.title}>{issue.title}</span>
      </a>
      {issue.excerpt ? <p style={s.excerpt}>{issue.excerpt}</p> : null}
      <IssueMeta issue={issue} />
      <IssueActions id={id} issue={issue} busy={busy} act={act} />
      <RowResult outcome={outcome} />
    </li>
  );
}

/**
 * The at-a-glance facts, in the order they change a decision: where it lives,
 * how urgent it is called, how long it has actually waited, whether anyone is
 * talking about it, and whether the loop will even accept it.
 */
function IssueMeta({ issue }: { issue: FleetIssue }) {
  return (
    <div style={s.metaRow}>
      <span style={s.meta}>{shortRepo(issue.repo)}</span>
      {issue.prio ? <span style={s.meta}>{issue.prio}</span> : null}
      <Age days={issue.ageDays} />
      {issue.quietDays !== null ? (
        <span style={s.meta} title="Days since anything touched it">
          quiet {issue.quietDays}d
        </span>
      ) : null}
      {issue.comments > 0 ? (
        <span style={s.meta} title={`${issue.comments} comments`}>
          {issue.comments}💬
        </span>
      ) : null}
      {issue.assignee ? <span style={s.meta}>@{issue.assignee}</span> : null}
      {/* A DoD-less issue is parked on sight by ralph/next.sh. Saying so here
          costs a word; discovering it costs a whole iteration. */}
      {issue.hasDod ? null : (
        <span style={s.warn} title="No `- [ ]` checklist — the loop parks this on sight">
          no DoD
        </span>
      )}
      {issue.wip ? <Badge tone="info">wip</Badge> : null}
      {issue.labels
        .filter((l) => !PRIORITIES.includes(l as (typeof PRIORITIES)[number]))
        .map((l) => (
          <span key={l} style={s.labelChip}>
            {l}
          </span>
        ))}
    </div>
  );
}

/**
 * The baseline every row carries.
 *
 * The primary button is whatever this row's state makes it — Re-queue a parked
 * issue, Unblock a gated one, Queue or Unqueue anything else — so one thumb
 * position always does the obvious thing. The rest are the toggles the loop
 * actually reads: `ralph-auto` arms self-merge, priority is what
 * `ralph/next.sh` ranks on, and Run jumps the queue outright.
 */
function IssueActions({
  id,
  issue,
  busy,
  act,
}: {
  id: string;
  issue: FleetIssue;
  busy: ReadonlySet<string>;
  act: (
    repo: string,
    number: number,
    action: StandingAction,
    label: string,
    priority?: string | null,
  ) => void;
}) {
  const working = busy.has(id);
  const go = (action: StandingAction, label: string, priority?: string | null) => () =>
    act(issue.repo, issue.number, action, label, priority);

  const primary =
    issue.label === 'ralph-parked'
      ? { action: 'ralph_requeue' as const, note: 'Re-queued', text: 'Re-queue' }
      : issue.label
        ? { action: 'unblock' as const, note: 'Unblocked + queued', text: 'Unblock' }
        : issue.queued
          ? { action: 'queue_off' as const, note: 'Removed from the queue', text: 'Unqueue' }
          : { action: 'queue_on' as const, note: 'Queued', text: 'Queue' };

  return (
    <div style={s.actions}>
      <Button
        size="sm"
        variant="secondary"
        disabled={working}
        onClick={go(primary.action, primary.note)}
        aria-label={`${primary.text} ${shortRepo(issue.repo)}#${issue.number}`}
      >
        {working ? '…' : primary.text}
      </Button>

      <Button
        size="sm"
        variant="tertiary"
        disabled={working}
        onClick={
          issue.auto
            ? go('auto_off_direct', 'Auto-merge off')
            : go('auto_on_direct', 'Auto-merge armed')
        }
        aria-label={`${issue.auto ? 'Disarm' : 'Arm'} auto-merge on ${shortRepo(issue.repo)}#${issue.number}`}
      >
        {issue.auto ? 'auto ✓' : 'auto'}
      </Button>

      <Button
        size="sm"
        variant="tertiary"
        disabled={working}
        onClick={go('run_now', 'Dispatched — jumps the queue')}
        aria-label={`Run the loop on ${shortRepo(issue.repo)}#${issue.number} now — jumps the queue`}
      >
        run
      </Button>

      <div style={s.prioGroup} role="group" aria-label={`Priority for #${issue.number}`}>
        {PRIORITIES.map((prio) => (
          <button
            key={prio}
            type="button"
            className="hds-focus"
            style={issue.prio === prio ? s.prioOn : s.prioOff}
            disabled={working}
            aria-pressed={issue.prio === prio}
            aria-label={`Set ${shortRepo(issue.repo)}#${issue.number} to ${prio}`}
            onClick={() => act(issue.repo, issue.number, 'bump_priority', `Now ${prio}`, prio)}
          >
            {prio}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * The page claims to show the whole board. When the sweep hit its cap it does
 * not, and this is the only thing that says so — the cap used to reach nothing
 * but `console.warn`.
 */
function TruncationNotice({ data }: { data: FleetStatus | null }) {
  if (!data?.truncated) return null;
  return (
    <p style={s.truncated} role="status">
      <strong style={s.strong}>This is not the whole board.</strong> The sweep hit its pagination
      cap at {data.counts.openIssues} issues and more are open beyond it. Raise{' '}
      <code style={s.code}>LIST_ISSUES_MAX_PAGES</code> in{' '}
      <code style={s.code}>lib/github/issues.mjs</code> — each page is one more sequential request
      inside the function&rsquo;s time budget, so raise it deliberately.
    </p>
  );
}

/** Badge tone per loop state — `unknown` is neutral, never a healthy green. */
const LOOP_TONE = {
  running: 'success',
  failed: 'danger',
  idle: 'neutral',
  unknown: 'warning',
} as const;

/** The count beside "The loop": what is wrong, or that nothing is. */
function loopCount(loop: LoopState[]): string {
  if (!loop.length) return '';
  const failed = loop.filter((l) => l.state === 'failed').length;
  if (failed) return `${failed} failing`;
  const running = loop.filter((l) => l.state === 'running').length;
  if (running) return `${running} running`;
  const unknown = loop.filter((l) => l.state === 'unknown').length;
  if (unknown === loop.length) return 'unreadable';
  return 'idle';
}

/**
 * The one line under a loop row. An `unknown` row says WHY it is unknown —
 * CLAUDE.md §4 records a whole iteration lost to reading a startup_failure as
 * an engine regression when it was a permission wall, so the raw reason is
 * worth more here than a tidy verdict.
 */
function loopDetail(l: LoopState): string {
  if (l.state === 'running') return 'iteration in progress';
  if (l.state === 'unknown') return l.error ? `unreadable — ${l.error}` : 'no runs found';
  const since = l.quietHours === null ? 'unknown age' : `${l.quietHours}h ago`;
  return l.state === 'failed' ? `${l.conclusion ?? 'failed'} · ${since}` : `last run ${since}`;
}

/**
 * How long this has been open. Nothing else on the row carried a clock, which
 * is how ops#185 sat p0 and unqueued for 64 days without the page ever saying
 * so. Anything a month old is called out, because that is the threshold where
 * "still open" stops being normal and starts being the finding.
 */
function Age({ days }: { days: number | null }) {
  if (days === null) return null;
  return <span style={days >= 30 ? s.ageOld : s.meta}>{days}d</span>;
}

/**
 * Scope every lane to one repo. Reads from the sweep's own repo list, so the
 * chips cannot drift from what is actually being shown.
 */
function RepoFilter({
  repos,
  active,
  onPick,
}: {
  repos: string[];
  active: string | null;
  onPick: (repo: string | null) => void;
}) {
  if (repos.length < 2) return null;
  return (
    <div style={s.chips}>
      <button
        type="button"
        className="hds-focus"
        style={active === null ? s.chipOn : s.chipOff}
        onClick={() => onPick(null)}
      >
        All
      </button>
      {repos.map((r) => (
        <button
          key={r}
          type="button"
          className="hds-focus"
          style={active === r ? s.chipOn : s.chipOff}
          onClick={() => onPick(r)}
        >
          {shortRepo(r)}
        </button>
      ))}
    </div>
  );
}

/**
 * Reach the rest of a truncated lane.
 *
 * It used to be static text — "+35 more" — which on a phone meant 35 issues
 * existed and could not be got at without leaving for GitHub. A count that
 * names work you cannot reach is a worse answer than no count.
 */
function MoreToggle({
  lane,
  total,
  shown,
  expanded,
  onToggle,
}: {
  lane: string;
  total: number;
  shown: number;
  expanded: boolean;
  onToggle: (lane: string) => void;
}) {
  if (total <= shown) return null;
  return (
    <button type="button" className="hds-focus" style={s.moreButton} onClick={() => onToggle(lane)}>
      {expanded ? `Show first ${shown}` : `Show all ${total}`}
    </button>
  );
}

/** What one tap did. `text` is the backend's own message when `ok` is false. */
interface ActionOutcome {
  text: string;
  ok: boolean;
}

/**
 * The outcome of a one-tap action, rendered INSIDE the row it belongs to.
 *
 * `role="status"` so a screen reader announces it; the visible line is what
 * stops a successful write from looking like a dead button.
 */
function RowResult({ outcome }: { outcome: ActionOutcome | undefined }) {
  if (!outcome) return null;
  return (
    <p style={outcome.ok ? s.rowOk : s.rowBad} role="status">
      {outcome.text}
    </p>
  );
}

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

function ChainRow({ link, total, isBreak }: { link: ChainLink; total: number; isBreak: boolean }) {
  const color = STATE_COLOR[link.state];
  return (
    <li style={s.link}>
      <div style={s.linkRail}>
        <span style={{ ...s.linkDot, borderColor: color, color }}>{link.n}</span>
        {link.n < total ? (
          <span
            style={{
              ...s.linkSpine,
              ...(isBreak ? { background: 'none', borderLeft: `2px dashed ${color}` } : null),
            }}
            aria-hidden="true"
          />
        ) : null}
      </div>

      <div style={s.linkBody}>
        <div style={s.linkTop}>
          <span style={s.linkName}>{link.name}</span>
          <span style={{ ...s.linkPct, color }}>
            {link.count === null ? '—' : link.count.toLocaleString()}
          </span>
        </div>
        <p style={s.linkNote}>
          <span style={{ ...s.linkState, color }}>{STATE_WORD[link.state]}</span>
          {link.count !== null ? ` · ${link.unit}` : ''}
          {' — '}
          {link.note}
        </p>
        {link.missingEnv.length ? (
          <p style={s.linkNote}>
            Needs{' '}
            {link.missingEnv.map((k, i) => (
              <span key={k}>
                {i > 0 ? ' and ' : ''}
                <code style={s.code}>{k}</code>
              </span>
            ))}
            {link.missingEnv.length === 1
              ? ' — not set on the server.'
              : ' — neither is set on the server.'}
          </p>
        ) : null}
        {link.issues.length ? (
          <div style={s.linkIssues}>
            {link.issues.map((n) => (
              <a
                key={n}
                href={`https://github.com/hirobius/ops/issues/${n}`}
                target="_blank"
                rel="noreferrer"
                className="hds-focus"
                style={s.issueRef}
              >
                #{n}
              </a>
            ))}
          </div>
        ) : null}
        {isBreak ? (
          <p style={s.breakCall}>
            Nothing has ever reached this stage, though{' '}
            {link.n > 1 ? 'the one before it' : 'the funnel'} has rows. This is where the chain
            stops — computed, not asserted.
          </p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * What this page is actually watching. Worth a line of its own: the repo set is
 * discovered from the token's issue feed, so it grows on its own when a repo is
 * added — and the only way to TELL that it did is to print what came back.
 * A hardcoded list that silently went stale is the failure this replaces.
 */
function Coverage({
  data,
  error,
  needsToken,
}: {
  data: FleetStatus | null;
  error: string | null;
  needsToken: boolean;
}) {
  if (needsToken || (error && !data)) return null;
  if (!data) return <p style={s.coverage}>Discovering repos…</p>;

  const { repos, owners, counts } = data;
  return (
    <p style={s.coverage}>
      Watching <strong style={s.strong}>{counts.repos}</strong>{' '}
      {counts.repos === 1 ? 'repo' : 'repos'}
      {owners.length ? ` across ${owners.join(' + ')}` : ''} ·{' '}
      <strong style={s.strong}>{counts.openIssues}</strong> open{' '}
      {counts.openIssues === 1 ? 'issue' : 'issues'}
      <span style={s.coverageRepos}>{repos.map(shortRepo).join(' · ')}</span>
    </p>
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

/** READY is green, ERROR red, anything mid-flight amber. */
function deployTone(state: string | undefined): string {
  if (state === 'READY') return 'var(--semantic-color-feedback-success)';
  if (state === 'ERROR' || state === 'CANCELED') return 'var(--semantic-color-feedback-error)';
  if (!state) return 'var(--semantic-color-content-tertiary)';
  return 'var(--semantic-color-feedback-warning)';
}

function deployCount(error: string | null, data: DeployProject[] | null): string {
  if (error && !data) return 'unreachable';
  if (!data) return '…';
  const bad = data.filter((p) => p.latestDeployment?.state === 'ERROR').length;
  if (bad > 0) return `${bad} failing`;
  return `${data.length} ${data.length === 1 ? 'project' : 'projects'}`;
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

  coverage: {
    ...hds.typeStyles.caption,
    margin: 0,
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: `0 ${hds.space.px6}`,
    color: 'var(--semantic-color-content-secondary)',
  },
  coverageRepos: {
    ...hds.typeStyles.mono,
    flexBasis: '100%',
    color: 'var(--semantic-color-content-tertiary)',
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
    // The dot must stay 28px at every width; minmax(0, 1fr) lets the content
    // column shrink rather than overflow, so this never scrolls horizontally.
    gridTemplateColumns: '28px minmax(0, 1fr)', // grid-ok: timeline rail + content
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

  excerpt: {
    ...hds.typeStyles.caption,
    margin: `${hds.space.px4} 0 0`,
    color: 'var(--semantic-color-content-secondary)',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  labelChip: {
    ...hds.typeStyles.caption,
    padding: `0 ${hds.space.px4}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    color: 'var(--semantic-color-content-tertiary)',
  },
  warn: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-feedback-warning)',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    alignItems: 'center',
    gap: hds.space.px6,
    marginTop: hds.space.px6,
  },
  prioGroup: {
    display: 'flex',
    gap: '1px',
  },
  prioOn: {
    ...hds.typeStyles.labelTechnical,
    padding: `${hds.space.px4} ${hds.space.px6}`,
    border: '1px solid var(--semantic-color-border-strong)',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    cursor: 'pointer',
  },
  prioOff: {
    ...hds.typeStyles.labelTechnical,
    padding: `${hds.space.px4} ${hds.space.px6}`,
    border: '1px solid var(--semantic-color-border-default)',
    background: 'transparent',
    color: 'var(--semantic-color-content-tertiary)',
    cursor: 'pointer',
  },
  truncated: {
    ...hds.typeStyles.bodySmall,
    margin: 0,
    padding: hds.space.px8,
    borderRadius: hds.borderRadius.sm,
    borderLeft: '3px solid var(--semantic-color-feedback-warning)',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
  },
  ageOld: {
    ...hds.typeStyles.labelTechnical,
    color: 'var(--semantic-color-feedback-warning)',
  },
  chipOn: {
    ...hds.typeStyles.labelTechnical,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-strong)',
    background: 'var(--semantic-color-surface-raised)',
    color: 'var(--semantic-color-content-primary)',
    cursor: 'pointer',
  },
  chipOff: {
    ...hds.typeStyles.labelTechnical,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    background: 'transparent',
    color: 'var(--semantic-color-content-secondary)',
    cursor: 'pointer',
  },
  moreButton: {
    ...hds.typeStyles.caption,
    padding: `${hds.space.px4} ${hds.space.px8}`,
    borderRadius: hds.borderRadius.sm,
    border: '1px solid var(--semantic-color-border-default)',
    background: 'transparent',
    color: 'var(--semantic-color-content-accent)',
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
  },
  /* A row that has been acted on recedes, so the eye moves to what is left. */
  rowActed: {
    opacity: 0.55,
  },
  rowOk: {
    ...hds.typeStyles.caption,
    margin: `${hds.space.px4} 0 0`,
    color: 'var(--semantic-color-feedback-success)',
  },
  rowBad: {
    ...hds.typeStyles.caption,
    margin: `${hds.space.px4} 0 0`,
    color: 'var(--semantic-color-feedback-error)',
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
