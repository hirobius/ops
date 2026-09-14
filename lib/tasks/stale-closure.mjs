/**
 * lib/tasks/stale-closure.mjs — detect Ralph work that shipped but never closed
 * its issue (ops#305).
 *
 * The failure it exists to catch: a Ralph PR merges with `Closes #N` in the
 * body, GitHub's closing-keyword linkage doesn't fire, the issue stays open and
 * `ralph-ready`, and the loop re-claims it forever. ops#156 did this 12+ times
 * in ~12 hours, each iteration correctly reporting "already shipped in merged
 * PR #162, nothing left to build". ops#103, #3, #205, #210 and #282 are the
 * same shape. It is the single largest generator of wasted loop iterations.
 *
 * ops#44 shows the mundane cause: PR #53's body wrote `Closes **#44**` — bold
 * markdown around the reference — and GitHub's parser silently didn't match.
 *
 * Pure: no network, no env, no GitHub client. The I/O shell is
 * scripts/reconcile-ralph-closures.mjs. Branch-name parsing mirrors
 * ralph/run.sh's `ralph/issue-<n>-<slug>` contract, which the harness keys
 * reconciliation on — if that shape changes in the engine, change it here in
 * the same release (same rule lib/tasks/ralph-parked.mjs carries).
 *
 * @module stale-closure
 */

/** Branch shape the Ralph harness keys reconciliation on: `ralph/issue-<n>[-slug]`. */
const RALPH_BRANCH = /^ralph\/issue-(\d+)(?:-|$)/;

/**
 * GitHub's closing keywords, as its own linkage parser accepts them.
 * @see https://docs.github.com/en/issues/tracking-your-work-with-issues/linking-a-pull-request-to-an-issue
 */
const CLOSING_KEYWORDS = 'close[sd]?|fix(e[sd])?|resolve[sd]?';

/**
 * A closing keyword followed by markdown emphasis wrapping the reference.
 * `Closes **#44**` / `Fixes _#12_` / ``Resolves `#9` `` all fail to link.
 * Requiring the `#<digits>` immediately after the emphasis marker is what keeps
 * ordinary prose ("this closes the gap described in #44") from matching.
 */
const BREAKABLE = new RegExp(String.raw`\b(${CLOSING_KEYWORDS})\s+[*_\`]+#\d+`, 'i');

/**
 * Issue number a Ralph branch belongs to, or null when it isn't a Ralph branch.
 *
 * @param {string|null|undefined} headRef branch name, e.g. `ralph/issue-185-wire-render`
 * @returns {number|null}
 */
export function issueNumberFromRalphBranch(headRef) {
  if (typeof headRef !== 'string' || headRef === '') return null;
  const m = RALPH_BRANCH.exec(headRef);
  return m ? Number(m[1]) : null;
}

/**
 * Does this PR body carry a closing keyword GitHub will silently fail to link?
 *
 * Scope note: this catches emphasis around the *reference*, which is the form
 * proven to break (ops#44). Emphasis around the keyword alone is not flagged —
 * add a case here if one is ever observed failing in the wild.
 *
 * @param {string|null|undefined} body PR body markdown
 * @returns {boolean}
 */
export function hasBreakableClosingKeyword(body) {
  if (typeof body !== 'string' || body === '') return false;
  return BREAKABLE.test(body);
}

/**
 * Issues whose work merged but which are still open — the loop will re-claim
 * every one of them until a human closes it.
 *
 * Grouped by issue, so the #156 shape (several merged PRs against one issue)
 * reports once rather than once per PR.
 *
 * @param {{ prs?: Array<{ number: number, headRef: string, merged: boolean }>,
 *           openIssues?: Array<{ number: number }> }} input
 * @returns {Array<{ issueNumber: number, prNumbers: number[] }>}
 */
export function findStaleClosures({ prs = [], openIssues = [] } = {}) {
  const open = new Set(openIssues.map((i) => i.number));
  /** @type {Map<number, number[]>} */
  const byIssue = new Map();

  for (const pr of prs) {
    if (!pr?.merged) continue;
    const issueNumber = issueNumberFromRalphBranch(pr.headRef);
    if (issueNumber === null || !open.has(issueNumber)) continue;
    const list = byIssue.get(issueNumber) ?? [];
    list.push(pr.number);
    byIssue.set(issueNumber, list);
  }

  return [...byIssue.entries()]
    .map(([issueNumber, prNumbers]) => ({ issueNumber, prNumbers: prNumbers.sort((a, b) => a - b) }))
    .sort((a, b) => a.issueNumber - b.issueNumber);
}
