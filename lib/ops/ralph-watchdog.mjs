/**
 * ralph-watchdog — what should be done about the Ralph loop right now?
 *
 * Pure decision logic, no network, no git, no `gh`. The caller collects the
 * GitHub facts; this decides what they mean. Same split as
 * lib/ops/branch-ancestry.mjs and lib/ops/park-signals.mjs, and for the same
 * reason: the rule is the part worth testing, and it tests without a live
 * repository or a recorded HTTP fixture.
 *
 * WHY THIS EXISTS
 *
 * Ralph is SINGLE-FLIGHT: at most one `ralph/*` PR may be open, and while one
 * sits open every other queued issue is blocked. On 2026-09-16 a gate-green,
 * AI-approved PR sat unmerged for five hours because nobody applied the
 * approval label. During those five hours every `ralph.yml` run entered the
 * guard, found the open PR, and exited in ~12 seconds — successfully.
 *
 * THE DIAGNOSTIC THAT MATTERS: a wall of fast green `ralph.yml` runs is the
 * signature of a WEDGE, not of a draining queue. Run history alone cannot
 * distinguish "nothing to do" from "blocked on one PR", because both are a
 * fast green no-op. Only the open-PR list can. Every caller must therefore
 * check open PRs BEFORE reading the run list — and this module encodes that
 * by taking the PR list as its primary input.
 *
 * The event-driven chain (push-to-main re-dispatch) halts silently after a
 * failed iteration, and the only backstop is a 6h cron. Six hours of dead
 * time overnight is the gap this watchdog closes.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 *
 * It never decides to skip, disable or quarantine a test, and never proposes
 * an empty commit to re-trigger CI. A red gate is either fixed at its cause or
 * abandoned with a written reason — there is no third option that still counts
 * as green. `ABANDON` exists because a permanently wedged queue is a worse
 * outcome than one abandoned PR, not as a way to make failure look like
 * success.
 *
 * @module ralph-watchdog
 */

/**
 * Actions the watchdog can decide on, in the order a caller should prefer them.
 * @readonly
 */
export const ACTION = {
  /** Gate is green and the PR is mergeable — merge it, the auto-merge did not arm. */
  MERGE: 'merge',
  /** PR is behind or conflicting with its base — merge base in and resolve. */
  RESOLVE_CONFLICT: 'resolve-conflict',
  /** Gate is red — diagnose the real cause and push a fix to the PR's branch. */
  FIX: 'fix',
  /** Out of road: close the PR with a written reason so the queue unblocks. */
  ABANDON: 'abandon',
  /** Nothing in flight and work is queued — the chain died; re-dispatch. */
  DISPATCH: 'dispatch',
  /** Correctly doing nothing. `reason` says which flavour of nothing. */
  IDLE: 'idle',
};

/**
 * Why the watchdog chose to do nothing. Distinguishing these matters: three of
 * them are healthy and one ("queue-empty") is the signal that the backlog is
 * exhausted and a human should decide what is next.
 * @readonly
 */
export const IDLE_REASON = {
  QUEUE_EMPTY: 'queue-empty',
  RUN_IN_PROGRESS: 'run-in-progress',
  GATE_PENDING: 'gate-pending',
  AWAITING_APPROVAL: 'awaiting-approval',
};

/** A gate that has not reported for this long is stuck, not running. */
export const GATE_PENDING_STALE_MINUTES = 45;

/**
 * @typedef {Object} RalphPr
 * @property {number} number
 * @property {string} headRef              e.g. `ralph/issue-330-telemetry`
 * @property {number|null} [issueNumber]   parsed from headRef by the caller
 * @property {boolean} [draft]
 * @property {'success'|'failure'|'pending'|null} gateConclusion
 *           `ralph-gate` only. Other CI jobs are informational and MUST NOT be
 *           folded in here — a PR is mergeable with them red.
 * @property {string} [mergeableState]     GitHub's value; 'dirty' means conflict
 * @property {boolean} [selfhealAttempted] the one bounded self-heal is spent
 * @property {boolean} [issueClosed]       linked issue already closed
 * @property {string[]|null} [supervisedFiles] files in the diff under a
 *           supervised (revenue) path, per ops#238. `null`/absent means the diff
 *           could not be read — never merged on unknown.
 * @property {boolean} [prApproved]        PR carries `ralph-approved`, the manual
 *           override for supervised paths
 * @property {number} [gatePendingMinutes] how long the gate has been pending
 */

/**
 * @typedef {Object} WatchdogFacts
 * @property {RalphPr[]} openRalphPrs   open PRs whose head starts `ralph/`
 * @property {number} readyIssueCount   open issues labelled `ralph-ready`
 * @property {boolean} runInProgress    a `ralph.yml` run is queued or running
 */

/**
 * @typedef {Object} WatchdogDecision
 * @property {string} action      one of ACTION
 * @property {string} reason      human-readable, names the cause AND the fix
 * @property {RalphPr} [pr]       the PR the action applies to
 * @property {RalphPr[]} [alsoOpen] extra PRs violating single-flight
 */

const issueFromRef = (ref) => {
  const m = /^ralph\/issue-(\d+)/.exec(ref || '');
  return m ? Number(m[1]) : null;
};

/**
 * Decide the single next action for the Ralph loop.
 *
 * Deterministic: the same facts always yield the same decision, with no clock
 * read and no randomness inside. Anything time-dependent is passed in as an
 * already-computed age (`gatePendingMinutes`), so tests need no fake timers and
 * a resumed run cannot drift.
 *
 * Exactly ONE action is returned. The watchdog does one thing per tick on
 * purpose — the loop is single-flight, so a tick that tries to merge one PR and
 * dispatch the next races the chain hop that a merge itself triggers.
 *
 * @param {WatchdogFacts} facts
 * @returns {WatchdogDecision}
 */
export function decideWatchdogAction(facts) {
  const { openRalphPrs = [], readyIssueCount = 0, runInProgress = false } = facts || {};

  // Single-flight means the open PR is ALWAYS the thing to look at first.
  // Deciding on the queue while a PR is open is how the five-hour wedge went
  // unnoticed: the queue looked fine, because it was — it was just blocked.
  if (openRalphPrs.length > 0) {
    // Oldest first: under single-flight there should only ever be one, but if
    // the invariant broke, the oldest is the one actually blocking the queue.
    const sorted = [...openRalphPrs].sort((a, b) => a.number - b.number);
    const [pr, ...alsoOpen] = sorted;
    const extra = alsoOpen.length ? { alsoOpen } : {};
    const withIssue = { ...pr, issueNumber: pr.issueNumber ?? issueFromRef(pr.headRef) };

    // A PR whose issue already closed is finished work holding the queue open.
    // Closing it is not abandoning anything — the work landed elsewhere.
    if (pr.issueClosed) {
      return {
        action: ACTION.ABANDON,
        pr: withIssue,
        ...extra,
        reason:
          `PR #${pr.number}'s linked issue is already closed, so this PR is holding the ` +
          `single-flight queue open for work that is already done. Close it with a comment ` +
          `naming the issue, then let the chain dispatch the next issue.`,
      };
    }

    if (pr.mergeableState === 'dirty') {
      return {
        action: ACTION.RESOLVE_CONFLICT,
        pr: withIssue,
        ...extra,
        reason:
          `PR #${pr.number} conflicts with its base. Merge origin/main into ` +
          `${pr.headRef} and resolve; regenerate lockfiles and generated files with the ` +
          `repo's tooling, never by hand. Never rebase or force-push a branch you do not own.`,
      };
    }

    if (pr.gateConclusion === 'success') {
      // Draft PRs cannot merge no matter how green the gate is.
      if (pr.draft) {
        return {
          action: ACTION.IDLE,
          pr: withIssue,
          ...extra,
          reason:
            `PR #${pr.number} is a DRAFT, so a green gate cannot merge it. It will block the ` +
            `queue until a human marks it ready for review.`,
        };
      }
      // ops#238: auto-merge on green is the default, except a diff into the
      // revenue path needs a human. Waiting holds the single-flight queue —
      // that is the price of review on the paths where review matters.
      if (pr.prApproved !== true) {
        const supervised = pr.supervisedFiles;
        if (!Array.isArray(supervised)) {
          return {
            action: ACTION.IDLE,
            pr: withIssue,
            ...extra,
            idleReason: IDLE_REASON.AWAITING_APPROVAL,
            reason:
              `PR #${pr.number} has ralph-gate green, but the watchdog could not read its diff ` +
              `to check the supervised revenue paths (ops#238), so it will not merge on ` +
              `unknown. The next tick retries; a human can review and add ralph-approved.`,
          };
        }
        if (supervised.length > 0) {
          const shown = supervised.slice(0, 5).join(', ');
          const more = supervised.length > 5 ? ` (+${supervised.length - 5} more)` : '';
          return {
            action: ACTION.IDLE,
            pr: withIssue,
            ...extra,
            idleReason: IDLE_REASON.AWAITING_APPROVAL,
            reason:
              `PR #${pr.number} has ralph-gate green but touches supervised revenue-path files ` +
              `(${shown}${more}), which need a human (ops#238). It blocks the queue until ` +
              `someone reviews it and adds ralph-approved.`,
          };
        }
      }
      return {
        action: ACTION.MERGE,
        pr: withIssue,
        ...extra,
        reason:
          `PR #${pr.number} has ralph-gate green and clears the supervised-path boundary ` +
          `(ops#238), but did not auto-merge, so the auto-merge did not arm. Merge using the ` +
          `FULL head SHA — GitHub's merge API rejects a short SHA.`,
      };
    }

    if (pr.gateConclusion === 'failure') {
      if (pr.selfhealAttempted) {
        return {
          action: ACTION.ABANDON,
          pr: withIssue,
          ...extra,
          reason:
            `PR #${pr.number} has a red ralph-gate and its one bounded self-heal is already ` +
            `spent. Close it with a comment naming the failing check and why it was not fixed, ` +
            `so the queue unblocks. Do NOT skip or disable the failing test to force green.`,
        };
      }
      return {
        action: ACTION.FIX,
        pr: withIssue,
        ...extra,
        reason:
          `PR #${pr.number} has ralph-gate red. Reproduce the failure first, then fix its ` +
          `actual cause and push to ${pr.headRef}. Never skip, disable or quarantine a test, ` +
          `and never push an empty commit to re-trigger CI.`,
      };
    }

    // Gate still reporting. Waiting is correct — until it clearly is not.
    const pending = pr.gatePendingMinutes ?? 0;
    if (pending >= GATE_PENDING_STALE_MINUTES) {
      return {
        action: ACTION.FIX,
        pr: withIssue,
        ...extra,
        reason:
          `PR #${pr.number}'s ralph-gate has been pending ${pending} minutes ` +
          `(>= ${GATE_PENDING_STALE_MINUTES}), which is stuck rather than slow. Inspect the ` +
          `run, and re-run only if it died before any test body ran.`,
      };
    }
    return {
      action: ACTION.IDLE,
      pr: withIssue,
      ...extra,
      reason: `PR #${pr.number}'s ralph-gate is still running (${pending}m). Waiting is correct.`,
      idleReason: IDLE_REASON.GATE_PENDING,
    };
  }

  // No PR open. Now — and only now — the queue is the question.
  if (readyIssueCount === 0) {
    return {
      action: ACTION.IDLE,
      idleReason: IDLE_REASON.QUEUE_EMPTY,
      reason:
        'No open ralph/* PR and no ralph-ready issues: the queue is EXHAUSTED, not stalled. ' +
        'Re-dispatching cannot help. This is the point at which a human decides what is next.',
    };
  }

  if (runInProgress) {
    return {
      action: ACTION.IDLE,
      idleReason: IDLE_REASON.RUN_IN_PROGRESS,
      reason:
        `A ralph.yml run is already in progress with ${readyIssueCount} issue(s) queued. ` +
        'Dispatching now would race it; the concurrency guard would cancel one of them.',
    };
  }

  return {
    action: ACTION.DISPATCH,
    reason:
      `${readyIssueCount} issue(s) are ready, no ralph/* PR is open, and no run is in ` +
      'flight — the event-driven chain has died silently. Re-dispatch ralph.yml on main ' +
      'and verify the run actually started.',
  };
}

/**
 * True when the decision requires a write to GitHub. Callers use this to
 * honour `--apply` / dry-run without re-implementing the action taxonomy.
 * @param {WatchdogDecision} decision
 * @returns {boolean}
 */
export function isMutating(decision) {
  return decision?.action !== ACTION.IDLE;
}
