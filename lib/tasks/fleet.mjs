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
 * `needs-adrian` is a decision only Adrian can make. `needs-human` is the softer
 * bucket (a credential, a paid account). `blocked` is waiting on another issue.
 */
export const BLOCKING_LABELS = /** @type {const} */ (['needs-adrian', 'needs-human', 'blocked']);

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
export function sortFleetLanes(issues) {
  const list = Array.isArray(issues) ? issues : [];
  const blocked = [];
  const parked = [];
  const ready = [];
  const backlog = [];

  for (const issue of list) {
    switch (laneOf(issue)) {
      case 'blocked':
        blocked.push({
          repo: issue.repo,
          number: issue.number,
          title: issue.title,
          url: issue.url,
          label: blockingLabelOf(issue),
          prio: priorityOf(issue),
        });
        break;
      case 'parked':
        parked.push({
          repo: issue.repo,
          number: issue.number,
          title: issue.title,
          url: issue.url,
          label: 'ralph-parked',
          prio: priorityOf(issue),
        });
        break;
      case 'queue':
        ready.push(issue);
        break;
      default:
        backlog.push({
          repo: issue.repo,
          number: issue.number,
          title: issue.title,
          url: issue.url,
          label: null,
          prio: priorityOf(issue),
          updatedAt: issue.updated_at ?? null,
        });
        break;
    }
  }

  const byPrioThenNumber = (a, b) => rank(a.prio) - rank(b.prio) || a.number - b.number;

  return {
    // Parked first inside "waiting on you": the loop already tried and stopped.
    blocked: [...parked, ...blocked.sort(byPrioThenNumber)],
    queue: orderRalphQueue(ready),
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
