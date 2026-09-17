#!/usr/bin/env node
/**
 * scripts/ralph-watchdog.mjs — keep the Ralph loop moving.
 *
 * The decision logic lives in lib/ops/ralph-watchdog.mjs and is pure; this
 * file is the I/O half: gather facts from GitHub, ask the rule what to do, and
 * (with --apply) do the mechanical part of it. Same split as
 * check-branch-ancestry / branch-ancestry.mjs.
 *
 * WHY: Ralph is single-flight. One open `ralph/*` PR blocks every queued
 * issue, and `ralph.yml` then no-ops in ~12 seconds, so the run history reads
 * as a wall of green success. On 2026-09-16 that hid a five-hour wedge. The
 * event chain also halts silently after a failed iteration, and the only
 * backstop is a 6h cron — six hours of dead time overnight.
 *
 * WHAT IT AUTOMATES vs REPORTS
 *
 * It only performs actions that are mechanical and safe to do unattended:
 *   merge      — the gate is green and the auto-merge simply did not arm, and
 *                the diff clears ops#238's boundary: no supervised revenue-path
 *                file (a rename counts on its old path too), or the PR carries
 *                ralph-approved. An unreadable diff never merges.
 *   abandon    — close a PR that cannot proceed, so the queue unblocks
 *   dispatch   — re-dispatch ralph.yml when the chain died silently
 *
 * It REPORTS, and never attempts, the two that need judgement:
 *   fix              — a red gate must be root-caused, not papered over
 *   resolve-conflict — a real merge conflict needs a reader
 *
 * That line is deliberate. A watchdog that "fixes" red CI unattended is how a
 * test gets skipped at 3am.
 *
 * "Green" means the `ralph-gate` COMMIT STATUS — the check branch protection
 * requires — never the engine's `ralph-gate / ralph-gate` Actions check run,
 * which exits 0 even when it sets the status to failure (PR #325).
 *
 * SCOPE: this is the watchdog's own merge path only. The shared engine
 * (hirobius/ralph ralph-gate-reusable.yml@v1) still arms auto-merge for a PR
 * whose issue carries ralph-auto WITHOUT any path check; closing that is the
 * deferred engine-side half of ops#238.
 *
 * Usage:
 *   node scripts/ralph-watchdog.mjs                 # dry run (default)
 *   node scripts/ralph-watchdog.mjs --json          # machine-readable
 *   node scripts/ralph-watchdog.mjs --apply         # actually act
 *
 * Auth: GITHUB_TOKEN (or GH_TOKEN) with contents+issues+pull-requests+actions,
 * plus statuses:read and checks:read. Inside GitHub Actions the job's own
 * GITHUB_TOKEN is sufficient, given those in ralph-watchdog.yml's permissions.
 */

import {
  decideWatchdogAction,
  isMutating,
  ACTION,
  DIFF_UNREADABLE,
  PR_FILES_API_CAP,
} from '../lib/ops/ralph-watchdog.mjs';
// ops#238's supervised paths ARE the revenue path — one list, two consumers.
import { isRevenuePathFile } from './metric-north-star-share.mjs';

const REPO = process.env.RALPH_WATCHDOG_REPO || 'hirobius/ops';
const API = 'https://api.github.com';
const READY_LABEL = 'ralph-ready';
const APPROVE_LABEL = 'ralph-approved';
/** The required status context, matched exactly, and a substring of the engine check run's name. */
const GATE_NAME = 'ralph-gate';
/** GitHub's per_page maximum for pulls/{n}/files. */
const PR_FILES_PER_PAGE = 100;

const TOKEN_HINT =
  'GITHUB_TOKEN (or GH_TOKEN) is missing, expired, or lacks scope. It needs contents, ' +
  'issues, pull-requests and actions, plus read on commit statuses and checks, on ' +
  REPO +
  '. Create a fine-grained token at https://github.com/settings/personal-access-tokens — ' +
  'inside GitHub Actions the job token already suffices.';

/** Minutes between two ISO timestamps, floored. Time enters ONLY here. */
const minutesSince = (iso, nowMs) => Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60000));

export function makeGitHubPort({ fetchImpl = globalThis.fetch, token } = {}) {
  const call = async (path, init = {}) => {
    const res = await fetchImpl(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'ralph-watchdog',
        ...(init.headers || {}),
      },
    });
    if (res.status === 401 || res.status === 403) {
      const err = new Error(`GitHub returned ${res.status}. ${TOKEN_HINT}`);
      err.authFailure = true;
      throw err;
    }
    if (!res.ok) throw new Error(`${init.method || 'GET'} ${path} -> ${res.status}`);
    return res.status === 204 ? null : res.json();
  };
  return {
    listOpenPrs: () => call(`/repos/${REPO}/pulls?state=open&per_page=100`),
    listCheckRuns: (sha) => call(`/repos/${REPO}/commits/${sha}/check-runs?per_page=100`),
    // Latest status per context. A context missing from page 1 reads as
    // pending, which never merges — so no pagination is needed to stay safe.
    getCombinedStatus: (sha) => call(`/repos/${REPO}/commits/${sha}/status?per_page=100`),
    getIssue: (n) => call(`/repos/${REPO}/issues/${n}`),
    listPrFiles: (n, page) =>
      call(`/repos/${REPO}/pulls/${n}/files?per_page=${PR_FILES_PER_PAGE}&page=${page}`),
    listReadyIssues: () =>
      call(`/repos/${REPO}/issues?state=open&labels=${READY_LABEL}&per_page=100`),
    listRuns: () => call(`/repos/${REPO}/actions/workflows/ralph.yml/runs?per_page=10`),
    mergePr: (n, sha) =>
      call(`/repos/${REPO}/pulls/${n}/merge`, {
        method: 'PUT',
        // FULL sha — GitHub's merge API rejects a short one (learned 2026-09-16).
        body: JSON.stringify({ sha, merge_method: 'squash' }),
      }),
    comment: (n, body) =>
      call(`/repos/${REPO}/issues/${n}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    closePr: (n) =>
      call(`/repos/${REPO}/pulls/${n}`, {
        method: 'PATCH',
        body: JSON.stringify({ state: 'closed' }),
      }),
    dispatch: () =>
      call(`/repos/${REPO}/actions/workflows/ralph.yml/dispatches`, {
        method: 'POST',
        body: JSON.stringify({ ref: 'main' }),
      }),
  };
}

/**
 * The `ralph-gate` verdict from the combined commit status. success → success;
 * failure or error → failure; pending or no such context → pending (never
 * merges; staleness is still measured from the check run).
 */
function gateFromStatus(combined) {
  const status = (combined?.statuses || []).find((s) => s.context === GATE_NAME);
  if (status?.state === 'success') return 'success';
  if (status?.state === 'failure' || status?.state === 'error') return 'failure';
  return 'pending';
}

/**
 * Read the whole diff, page by page, and return the paths under a supervised
 * (revenue) path — a rename counts on BOTH its new and its previous path, or
 * moving a file out of a supervised dir would slip through.
 *
 * Fails closed with `supervisedFiles: null`: on any API error or malformed page
 * (transient — the next tick retries), and when every page up to GitHub's
 * 3000-file cap comes back full (permanent — the API cannot list the rest).
 */
async function readSupervisedFiles(port, prNumber) {
  const unreadable = (why) => ({ supervisedFiles: null, diffUnreadable: why });
  const supervised = new Set();
  const maxPages = Math.ceil(PR_FILES_API_CAP / PR_FILES_PER_PAGE);
  for (let page = 1; page <= maxPages; page++) {
    let files;
    try {
      files = await port.listPrFiles(prNumber, page);
    } catch {
      return unreadable(DIFF_UNREADABLE.API_ERROR);
    }
    if (!Array.isArray(files)) return unreadable(DIFF_UNREADABLE.API_ERROR);
    for (const f of files) {
      if (typeof f?.filename !== 'string') return unreadable(DIFF_UNREADABLE.API_ERROR);
      for (const path of [f.filename, f.previous_filename]) {
        if (typeof path === 'string' && isRevenuePathFile(path)) supervised.add(path);
      }
    }
    if (files.length < PR_FILES_PER_PAGE) {
      return { supervisedFiles: [...supervised], diffUnreadable: null };
    }
  }
  return unreadable(DIFF_UNREADABLE.FILE_CAP);
}

/**
 * Collect the facts the rule needs. Exported so it can be tested against an
 * injected port with no network.
 */
export async function gatherFacts(port, nowMs) {
  const prs = await port.listOpenPrs();
  // Issues endpoint returns PRs too; a PR carries `pull_request`. Filter them
  // out or the ready count is inflated by Ralph's own open PR.
  const readyIssues = (await port.listReadyIssues()).filter((i) => !i.pull_request);
  const runsPayload = await port.listRuns();
  const runs = runsPayload?.workflow_runs || [];

  const ralphPrs = [];
  for (const p of prs.filter((x) => (x.head?.ref || '').startsWith('ralph/'))) {
    // The verdict is the required commit status; the check run only dates it.
    const gateConclusion = gateFromStatus(await port.getCombinedStatus(p.head.sha));
    const checks = await port.listCheckRuns(p.head.sha);
    const gateRun = (checks?.check_runs || []).find((c) => (c.name || '').includes(GATE_NAME));
    const m = /^ralph\/issue-(\d+)/.exec(p.head.ref);
    const issueNumber = m ? Number(m[1]) : null;

    let issueClosed = false;
    if (issueNumber) {
      try {
        issueClosed = (await port.getIssue(issueNumber))?.state === 'closed';
      } catch {
        issueClosed = false; // fail closed: never abandon on an unknown issue state
      }
    }

    // Fail closed: an unreadable diff is `null`, which the rule never merges
    // without ralph-approved.
    const { supervisedFiles, diffUnreadable } = await readSupervisedFiles(port, p.number);

    ralphPrs.push({
      number: p.number,
      headRef: p.head.ref,
      headSha: p.head.sha,
      issueNumber,
      draft: Boolean(p.draft),
      mergeableState: p.mergeable_state,
      gateConclusion,
      gatePendingMinutes: gateRun?.started_at ? minutesSince(gateRun.started_at, nowMs) : 0,
      selfhealAttempted: (p.labels || []).some((l) => l.name === 'ralph-selfheal-attempted'),
      prApproved: (p.labels || []).some((l) => l.name === APPROVE_LABEL),
      supervisedFiles,
      diffUnreadable,
      issueClosed,
    });
  }

  return {
    openRalphPrs: ralphPrs,
    readyIssueCount: readyIssues.length,
    runInProgress: runs.some((r) => r.status === 'in_progress' || r.status === 'queued'),
  };
}

const FOOTER = '\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_';

export async function applyDecision(port, decision) {
  switch (decision.action) {
    case ACTION.MERGE:
      await port.mergePr(decision.pr.number, decision.pr.headSha);
      return `merged PR #${decision.pr.number}`;
    case ACTION.ABANDON:
      await port.comment(
        decision.pr.number,
        `🛑 **Ralph watchdog closed this PR to unblock the queue.**\n\n${decision.reason}\n\n` +
          `Ralph is single-flight: while this PR stayed open, every other queued issue was ` +
          `blocked. Closing it is not a verdict on the work — re-open or re-queue the issue ` +
          `once the cause is addressed.${FOOTER}`,
      );
      await port.closePr(decision.pr.number);
      return `closed PR #${decision.pr.number}`;
    case ACTION.DISPATCH:
      await port.dispatch();
      return 'dispatched ralph.yml on main';
    default:
      return `no automated action for "${decision.action}" — reported only`;
  }
}

/**
 * The `--json` report. PR fields describe the PR the decision acted on, and are
 * null when there is none — so a reader can tell "awaiting approval on these
 * files" from "no PR" without re-deriving the rule.
 */
export function buildReport({ decision, facts, apply, performed }) {
  const pr = decision.pr;
  return {
    ok: true,
    dryRun: !apply,
    action: decision.action,
    idleReason: decision.idleReason ?? null,
    reason: decision.reason,
    pr: pr?.number ?? null,
    supervisedFiles: pr ? (pr.supervisedFiles ?? null) : null,
    diffUnreadable: pr ? (pr.diffUnreadable ?? null) : null,
    prApproved: pr ? pr.prApproved === true : null,
    performed,
    facts: {
      openRalphPrs: facts.openRalphPrs.map((p) => p.number),
      readyIssueCount: facts.readyIssueCount,
      runInProgress: facts.runInProgress,
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const apply = argv.includes('--apply');
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  const fail = (msg) => {
    if (jsonMode) console.log(JSON.stringify({ ok: false, error: msg, violations: [] }, null, 2));
    else console.error(`ralph-watchdog: ${msg}`);
    process.exit(2);
  };

  if (!token) return fail(TOKEN_HINT);

  let facts, decision;
  try {
    const port = makeGitHubPort({ token });
    facts = await gatherFacts(port, Date.now());
    decision = decideWatchdogAction(facts);

    let performed = null;
    if (apply && isMutating(decision)) performed = await applyDecision(port, decision);

    if (jsonMode) {
      console.log(JSON.stringify(buildReport({ decision, facts, apply, performed }), null, 2));
    } else {
      console.log(`ralph-watchdog: ${decision.action.toUpperCase()}${apply ? '' : ' (dry run)'}`);
      console.log(`  ${decision.reason}`);
      if (performed) console.log(`  → ${performed}`);
      if (decision.alsoOpen?.length)
        console.log(
          `  ⚠️  single-flight violated: also open ${decision.alsoOpen.map((p) => `#${p.number}`).join(', ')}`,
        );
    }
  } catch (err) {
    return fail(err.authFailure ? err.message : `${err.message}`);
  }
}

// Only run as a CLI, so the exports stay importable by tests.
if (import.meta.url === `file://${process.argv[1]}`) await main();
