/**
 * lib/tasks/fleet.mjs — pure lane-sorting for the fleet-wide Standing read.
 *
 * The Ralph panel's read (`?ralph=1`) fans out over a HARDCODED repo list, so a
 * new repo is invisible until someone edits `FLEET_REPOS`. Standing takes the
 * opposite approach: it starts from `listOpenIssues()` — GitHub's
 * authenticated-identity feed, which already spans every repo the token can
 * see across every owner — and sorts what comes back. A repo joins the fleet by
 * existing, not by being listed.
 *
 * Everything here is pure so the lane rules are testable without a token: the
 * adapter fetches, this module decides.
 */

import { orderRalphQueue } from './ralph-queue.mjs';
import { openSev1 } from './severity.mjs';

/**
 * Labels that mean "a human has to move this", most specific first — the order
 * IS the precedence, since an issue can carry several.
 *
 * `needs-adrian` is a decision only Adrian can make. ops#295 then split the
 * softer bucket in two: `needs-decision` (a judgement call) and
 * `needs-credential` (a key, a paid account) — different waits with different
 * fixes, so a single label hid which one an issue was stuck on. `blocked` is
 * waiting on another issue.
 *
 * `needs-human` STAYS, and is not dead weight: ops#359 retired it in THIS repo
 * only, and this sweep is fleet-wide across every repo the token can see.
 * Dropping it would strand a gated issue in site-engine or Ralph in the backlog.
 *
 * WHY THIS LIST IS THE BUG THAT KEEPS RECURRING: ops#359 relabelled 14 issues
 * and updated CLAUDE.md, AGENTS.md and `metric-human-gate-latency.mjs` — but not
 * this constant. For the hours that followed, 13 human-gated issues rendered as
 * ordinary backlog on `/ops/standing`, and the "blocked on you" count that the
 * page exists to show was simply wrong. A label vocabulary lives in more than
 * one place; grep for the old name before retiring it.
 */
export const BLOCKING_LABELS = /** @type {const} */ ([
  'needs-adrian',
  'needs-decision',
  'needs-credential',
  'needs-human',
  'blocked',
]);

const BLOCKING = new Set(BLOCKING_LABELS);

/**
 * Which lane an open issue belongs in, or null for ordinary backlog.
 *
 * Parked outranks blocked: a parked issue already failed the loop, so its park
 * reason is the more actionable thing to show. Queue is last because
 * `orderRalphQueue` re-excludes anything blocked or parked anyway (selector
 * parity with `ralph/next.sh`).
 *
 * @param {{ labels: string[] }} issue
 * @returns {'parked' | 'blocked' | 'queue' | null}
 */
export function laneOf(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  if (labels.includes('ralph-parked')) return 'parked';
  if (labels.some((l) => BLOCKING.has(l))) return 'blocked';
  if (labels.includes('ralph-ready')) return 'queue';
  return null;
}

/** The blocking label an issue is filed under, for the UI's badge. */
export function blockingLabelOf(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return BLOCKING_LABELS.find((l) => labels.includes(l)) ?? null;
}

/** p0..p3 if present, else null — same vocabulary the selector ranks on. */
export function priorityOf(issue) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return labels.find((l) => /^p[0-3]$/.test(l)) ?? null;
}

/**
 * Repos the Ralph loop plausibly runs in, derived from the sweep rather than
 * configured: any repo with an open issue carrying a `ralph-*` label.
 *
 * Runs are the one part of this page that CANNOT come from the single
 * identity-wide issue feed — GitHub has no cross-repo workflow-run endpoint, so
 * it is one request per repo on every poll. Deriving the list keeps that cost
 * proportional to where the loop actually operates instead of to how many repos
 * the token can see, and `cap` bounds it even if a label spreads.
 *
 * @param {Array<{ repo: string, labels: string[] }>} issues
 * @param {number} [cap]
 */
export function ralphRepos(issues, cap = 4) {
  const seen = [];
  for (const issue of Array.isArray(issues) ? issues : []) {
    const labels = Array.isArray(issue.labels) ? issue.labels : [];
    if (!issue.repo || seen.includes(issue.repo)) continue;
    if (labels.some((l) => typeof l === 'string' && l.startsWith('ralph-'))) seen.push(issue.repo);
  }
  return seen.slice(0, cap);
}

/** Conclusions that mean the iteration did not finish its work. */
const BAD_CONCLUSIONS = new Set(['failure', 'startup_failure', 'timed_out', 'cancelled']);

/**
 * Per-repo loop state: is the machine moving, and if not, since when.
 *
 * "In flight" already showed open PRs, but a wedged loop and a working one
 * produce the same PR list — so the page could not distinguish "nothing to do"
 * from "nothing is running". These three states can:
 *
 *   running  an iteration is queued or in progress right now
 *   failed   the newest finished run did not succeed (conclusion carried)
 *   idle     the newest run succeeded; `quietHours` is how long ago
 *
 * `unknown` is its own answer and never collapses into `idle`: a repo whose
 * runs could not be read has not been observed to be quiet, and CLAUDE.md §4
 * records that a `ralph-gate` startup_failure with 0 jobs is usually a
 * permission or version skew rather than the engine regressing — so the error
 * rides along instead of being flattened into a verdict.
 *
 * @param {Array<{ repo: string, runs: Array<{ status: string, conclusion: string|null, started_at: string, number: number, title: string, url: string }>, error?: string }>} runsByRepo
 * @param {number} [now] epoch ms, injectable for tests
 */
export function summarizeLoop(runsByRepo, now = Date.now()) {
  return (Array.isArray(runsByRepo) ? runsByRepo : []).map((entry) => {
    const runs = Array.isArray(entry.runs) ? entry.runs : [];
    const base = { repo: entry.repo, error: entry.error ?? null };
    if (entry.error || runs.length === 0) {
      return { ...base, state: 'unknown', run: null, quietHours: null, conclusion: null };
    }
    const active = runs.find((r) => r.status === 'queued' || r.status === 'in_progress');
    const newest = runs[0];
    const startedMs = new Date(newest.started_at).getTime();
    const quietHours = Number.isFinite(startedMs)
      ? Math.max(0, Math.round((now - startedMs) / 3_600_000))
      : null;
    const run = {
      number: newest.number,
      title: newest.title,
      url: newest.url,
    };
    if (active) {
      return {
        ...base,
        state: 'running',
        run: { number: active.number, title: active.title, url: active.url },
        quietHours: null,
        conclusion: null,
      };
    }
    const conclusion = newest.conclusion ?? null;
    if (conclusion && BAD_CONCLUSIONS.has(conclusion)) {
      return { ...base, state: 'failed', run, quietHours, conclusion };
    }
    return { ...base, state: 'idle', run, quietHours, conclusion };
  });
}

/**
 * Whole days between `iso` and `now`, or null when there is no usable date.
 *
 * Null is "we cannot say", never 0 — a row with no timestamp must not sort as
 * if it arrived today, and must not render "0d" as though that were measured.
 *
 * @param {string|null|undefined} iso
 * @param {number} [now] epoch ms, injectable so the sort is testable
 */
export function ageInDays(iso, now = Date.now()) {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / 86_400_000));
}

/**
 * `['hirobius/ops', 'adr-eng/access']` → `['hirobius', 'adr-eng']`, in first-seen
 * order. Feeds the PR search's owner qualifiers, so the set of owners searched
 * is derived from what the token actually sees rather than configured anywhere.
 *
 * @param {string[]} repos
 */
export function ownersOf(repos) {
  const seen = [];
  for (const r of repos) {
    const owner = String(r).split('/')[0];
    if (owner && !seen.includes(owner)) seen.push(owner);
  }
  return seen;
}

/**
 * The GitHub search query for every open PR across these owners. Multiple
 * `org:`/`user:` qualifiers are OR'd by GitHub, so one call covers the whole
 * fleet however many repos it holds — the per-repo alternative costs one call
 * per repo on every poll.
 *
 * Owners are emitted as `user:` — GitHub resolves that against orgs too, so the
 * caller does not have to know which owners are orgs and which are people.
 *
 * @param {string[]} owners
 * @returns {string | null} null when there is nothing to search
 */
export function openPrSearchQuery(owners) {
  if (!owners.length) return null;
  return ['is:pr', 'is:open', 'archived:false', ...owners.map((o) => `user:${o}`)].join(' ');
}

/**
 * Sorts one fleet-wide issue sweep into the Standing page's lanes.
 *
 * `sev1` is a call-out ACROSS the lanes, not a lane (ops#317): every open sev1,
 * wherever its other labels put it, so the page can lead with it instead of
 * leaving it one line among fifty. The issue still appears in its own lane.
 *
 * Everything that is not blocked, parked or queued lands in `backlog` — the
 * page is the whole board, not a filtered view of it. Before this, an issue
 * that carried no lane label was invisible on Standing and only reachable via
 * `/ops/tasks`, whose Supabase mirror is only as fresh as the last time
 * somebody pressed Import. A live surface that silently omits most of the
 * board is worse than no surface, because it looks complete.
 *
 * @param {Array<{repo: string, number: number, title: string, url: string, labels: string[], updated_at?: string}>} issues
 */
/**
 * One issue → the row shape EVERY lane renders.
 *
 * Shared deliberately. Each lane used to build its own subset, which is how the
 * queue lane ended up as bare chips with no metadata and no actions while the
 * backlog beside it had both — the same issue was more operable in one lane
 * than another for no reason a user could see. One builder means a field added
 * here appears everywhere at once.
 *
 * @param {Record<string, any>} issue
 * @param {number} now
 * @param {string|null} label the label that put it in this lane, if any
 */
export function toRow(issue, now, label = null) {
  const labels = Array.isArray(issue.labels) ? issue.labels : [];
  return {
    repo: issue.repo,
    number: issue.number,
    title: issue.title,
    url: issue.url,
    label,
    prio: priorityOf(issue),
    ageDays: ageInDays(issue.created_at, now),
    /** Days since anything touched it — label churn included. Context, not the sort key. */
    quietDays: ageInDays(issue.updated_at, now),
    labels,
    comments: typeof issue.comments === 'number' ? issue.comments : 0,
    assignee: issue.assignee ?? null,
    hasDod: issue.hasDod === true,
    excerpt: typeof issue.excerpt === 'string' ? issue.excerpt : '',
    queued: labels.includes('ralph-ready'),
    auto: labels.includes('ralph-auto'),
    wip: labels.includes('ralph-wip'),
  };
}

export function sortFleetLanes(issues, { now = Date.now() } = {}) {
  const list = Array.isArray(issues) ? issues : [];
  const blocked = [];
  const parked = [];
  const ready = [];
  const backlog = [];

  for (const issue of list) {
    switch (laneOf(issue)) {
      case 'blocked':
        blocked.push(toRow(issue, now, blockingLabelOf(issue)));
        break;
      case 'parked':
        parked.push(toRow(issue, now, 'ralph-parked'));
        break;
      case 'queue':
        ready.push(issue);
        break;
      default:
        backlog.push(toRow(issue, now));
        break;
    }
  }

  const byPrioThenNumber = (a, b) => rank(a.prio) - rank(b.prio) || a.number - b.number;

  /**
   * Oldest first, and priority only breaks a tie.
   *
   * This lane used to sort by priority label, which is why ops#274 could find
   * ops#185 sitting p0 and unqueued for 64 days: a p0 filed in May and a p0
   * filed yesterday looked identical, so the old one never rose. Age is the
   * fact the operator could not get from this page at all — everything else on
   * the row was already visible. A null age sorts last: unmeasured is not old.
   */
  const byAgeThenPrio = (a, b) =>
    (b.ageDays ?? -1) - (a.ageDays ?? -1) || rank(a.prio) - rank(b.prio) || a.number - b.number;

  return {
    // Parked first inside "waiting on you": the loop already tried and stopped.
    blocked: [...parked.sort(byAgeThenPrio), ...blocked.sort(byAgeThenPrio)],
    // The selector decides the ORDER; the row shape is the same everywhere, so
    // a queued issue is as readable and as operable as one in any other lane.
    queue: orderRalphQueue(ready).map((q) => {
      const full = ready.find((i) => i.repo === q.repo && i.number === q.number);
      return { ...toRow(full ?? q, now, null), wip: q.wip };
    }),
    backlog: backlog.sort(byPrioThenNumber),
    sev1: sev1Of(list),
    repos: [...new Set(list.map((i) => i.repo).filter(Boolean))].sort(),
    total: list.length,
  };
}

/** Every open sev1 in the sweep, shaped like the other lane rows. */
function sev1Of(list) {
  const byKey = new Map(list.map((i) => [`${i.repo}#${i.number}`, i]));
  return openSev1(list).map((row) => ({
    ...row,
    label: 'sev1',
    prio: priorityOf(byKey.get(`${row.repo}#${row.number}`) ?? {}),
  }));
}

function rank(prio) {
  return prio ? Number(prio.slice(1)) : 9;
}
