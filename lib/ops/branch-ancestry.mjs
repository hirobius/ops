/**
 * branch-ancestry — is the current branch still based on `origin/main`?
 *
 * Pure decision logic, no git, no I/O. The caller collects the git facts; this
 * decides what they mean. Split that way so the rule can be tested without a
 * scratch repository, same shape as lib/ops/park-signals.mjs.
 *
 * WHY THE OBVIOUS CHECK IS WRONG
 *
 *   git merge-base --is-ancestor HEAD origin/main     # WRONG
 *
 * That asks "is my branch already contained in main", which is FALSE for every
 * healthy in-progress branch — one commit of unpushed work makes it false. A
 * gate built on it fires constantly and gets ignored, which is worse than no
 * gate. The right question is the reverse:
 *
 *   git merge-base --is-ancestor origin/main HEAD     # correct
 *
 * "Is main contained in my branch" — i.e. am I building on current main.
 *
 * WHAT IT CATCHES
 *
 * This repo squash-merges. A squash replays the branch as one new commit on
 * main, so the instant a PR lands, the source branch is no longer related to
 * main in either direction. Committing on it builds a fork, and the resulting
 * PR carries phantom diffs reverting everything that landed in between. Worse,
 * the stop hook reads the orphaned pointer as "unpushed commits" and advises
 * pushing — which is exactly the wrong move. ops#335.
 *
 * @module branch-ancestry
 */

export const OK = 'ok';
export const BEHIND = 'behind';
export const DIVERGED = 'diverged';
export const SKIP = 'skipped';

const RESET = 'git fetch origin main && git checkout -B <branch> origin/main';
const MERGE = 'git merge origin/main';

/**
 * Decide whether the current branch is safe to commit on.
 *
 * @param {object} [state]
 * @param {string} [state.branch]                 current branch name
 * @param {boolean} [state.detached]              HEAD is detached
 * @param {boolean} [state.mainRefKnown]          refs/remotes/origin/main exists locally
 * @param {boolean} [state.mainIsAncestorOfHead]  `merge-base --is-ancestor origin/main HEAD`
 * @param {boolean} [state.headIsAncestorOfMain]  `merge-base --is-ancestor HEAD origin/main`
 * @returns {{ status: string, severity: 'warn'|'none', message: string }}
 */
export function evaluateBranch(state) {
  const s = state && typeof state === 'object' ? state : {};

  // Skips first. A gate with no opinion must say so rather than guess — each of
  // these would otherwise fire on a perfectly normal checkout.
  if (s.detached === true) {
    return skip('HEAD is detached — no branch to judge.');
  }
  if (!s.branch || s.branch === 'main') {
    return skip('on main (or no branch) — nothing to compare against.');
  }
  if (s.mainRefKnown !== true) {
    return skip('origin/main is not known locally — nothing to compare against.');
  }

  if (s.mainIsAncestorOfHead === true) {
    return { status: OK, severity: 'none', message: 'Branch is based on current origin/main.' };
  }

  // HEAD is contained in main but main is not contained in HEAD: the branch is
  // strictly behind. Safe, but new commits land on an older base.
  if (s.headIsAncestorOfMain === true) {
    return {
      status: BEHIND,
      severity: 'warn',
      message:
        `Branch "${s.branch}" is behind origin/main (as last fetched). ` +
        `New commits here build on an older base — bring it up to date with \`${MERGE}\`.`,
    };
  }

  // Neither contains the other. Either the PR was squash-merged (branch is
  // dead) or the branch genuinely diverged. Ancestry cannot tell these apart,
  // so name both remedies rather than guessing — picking wrong either destroys
  // unmerged work or leaves a dead pointer in place.
  return {
    status: DIVERGED,
    severity: 'warn',
    message:
      `Branch "${s.branch}" has DIVERGED from origin/main (as last fetched — this check does not fetch).\n` +
      `  If its PR was squash-merged, this branch is dead: \`${RESET}\`\n` +
      `  If you are mid-work and main moved: \`${MERGE}\`\n` +
      `  Do NOT trust a stop hook reporting "unpushed commits" here — on a squash-merged\n` +
      `  branch those commits are already on main, and pushing builds a fork of it.`,
  };
}

function skip(why) {
  return { status: SKIP, severity: 'none', message: why };
}
