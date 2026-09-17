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
 *   merge      — the gate is green, GitHub says the PR can merge, the auto-merge
 *                simply did not arm, and the diff clears ops#238's boundary: no
 *                supervised file (a rename counts on its old path too), or the
 *                PR carries ralph-approved. An unreadable diff never merges.
 *   abandon    — close a PR that cannot proceed, so the queue unblocks
 *   dispatch   — re-dispatch ralph.yml when the chain died silently
 *   ask        — a green PR waiting on a human (supervised diff, or too large to
 *                read) holds the whole queue, so once per head SHA it labels the
 *                PR needs-adrian, comments why, and pages Discord
 *
 * "Supervised" is the revenue path (REVENUE_PATH_PREFIXES) PLUS the files that
 * define and enforce this boundary (BOUNDARY_SELF_PATHS), so the first
 * unattended merge cannot quietly rewrite the rule for every later one.
 *
 * A Ralph PR is one from a `ralph/*` branch of THIS repo. ops is public, and
 * the engine posts a green `ralph-gate` on every human PR's head SHA — a fork
 * branch named `ralph/...` at one of those SHAs must never read as green.
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
import { postToDiscord } from '../lib/ops/notify.mjs';

const REPO = process.env.RALPH_WATCHDOG_REPO || 'hirobius/ops';
const API = 'https://api.github.com';
const READY_LABEL = 'ralph-ready';
const APPROVE_LABEL = 'ralph-approved';
/** Applied when a green PR can only move with a human — the standing "needs you" label. */
export const HUMAN_LABEL = 'needs-adrian';
/** The required status context, matched exactly, and a substring of the engine check run's name. */
const GATE_NAME = 'ralph-gate';
/**
 * The description the engine posts with a `success` ralph-gate on a NON-Ralph
 * PR. It is a pass-through, never a verdict on a ralph/* head.
 */
const PASS_THROUGH_STATUS = /^non-Ralph PR\b/i;
/** GitHub's per_page maximum for pulls/{n}/files and issues/{n}/comments. */
const PR_FILES_PER_PAGE = 100;
const COMMENTS_PER_PAGE = 100;
/** Pages of comments read to find an earlier ask; past this, assume asked (never spam). */
const MAX_COMMENT_PAGES = 10;

/**
 * Files that define or enforce this boundary. Always supervised, but NOT
 * revenue path, so they live here rather than in REVENUE_PATH_PREFIXES and do
 * not skew the north-star metric. A test pins that this covers the watchdog's
 * whole local import graph — add an import, and the new file must join.
 */
export const BOUNDARY_SELF_PATHS = [
  'scripts/ralph-watchdog.mjs',
  'lib/ops/ralph-watchdog.mjs',
  'scripts/metric-north-star-share.mjs',
  'scripts/lib/gate-output.mjs',
  'lib/ops/notify.mjs',
  '.github/workflows/ralph-watchdog.yml',
];

const isSupervisedFile = (path) => isRevenuePathFile(path) || BOUNDARY_SELF_PATHS.includes(path);

const DISCORD_SECRET_HINT =
  'DISCORD_WEBHOOK_URL is not set for the watchdog job — add it as a repository Actions ' +
  `secret at https://github.com/${REPO}/settings/secrets/actions (the label and comment ` +
  'still landed).';

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
    // The list endpoint never carries mergeable / mergeable_state; this does,
    // and reading it is what makes GitHub compute them.
    getPr: (n) => call(`/repos/${REPO}/pulls/${n}`),
    listComments: (n, page) =>
      call(`/repos/${REPO}/issues/${n}/comments?per_page=${COMMENTS_PER_PAGE}&page=${page}`),
    addLabels: (n, labels) =>
      call(`/repos/${REPO}/issues/${n}/labels`, {
        method: 'POST',
        body: JSON.stringify({ labels }),
      }),
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
 * merges; staleness is still measured from the check run). The engine's
 * non-Ralph pass-through is also pending: only ever read for a ralph/* head,
 * it means the real gate has not reported for this SHA.
 */
function gateFromStatus(combined) {
  const status = (combined?.statuses || []).find((s) => s.context === GATE_NAME);
  if (status?.state === 'success' && PASS_THROUGH_STATUS.test(status.description || '')) {
    return 'pending';
  }
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
        if (typeof path === 'string' && isSupervisedFile(path)) supervised.add(path);
      }
    }
    if (files.length < PR_FILES_PER_PAGE) {
      return { supervisedFiles: [...supervised], diffUnreadable: null };
    }
  }
  return unreadable(DIFF_UNREADABLE.FILE_CAP);
}

/**
 * A Ralph PR: a `ralph/*` branch (not a claim ref, matching lib.sh) whose head
 * lives in THIS repo. A fork's head repo differs — or is null once deleted.
 */
function isRalphPr(p, repo) {
  const ref = p?.head?.ref || '';
  if (!ref.startsWith('ralph/') || ref.startsWith('ralph/claim-')) return false;
  const headRepo = p.head.repo?.full_name;
  return typeof headRepo === 'string' && headRepo.toLowerCase() === repo.toLowerCase();
}

/**
 * GitHub's mergeability for the PR at `sha`. `mergeable` is null until GitHub
 * has computed it, and is reported null too when the head moved between the
 * list read and this one — the answer would describe a different commit.
 */
async function readMergeability(port, number, sha) {
  const detail = await port.getPr(number);
  const detailSha = detail?.head?.sha;
  if (typeof detailSha === 'string' && detailSha !== sha) {
    return { mergeable: null, mergeableState: 'unknown' };
  }
  return {
    mergeable: typeof detail?.mergeable === 'boolean' ? detail.mergeable : null,
    mergeableState: detail?.mergeable_state ?? 'unknown',
  };
}

/**
 * Collect the facts the rule needs. Exported so it can be tested against an
 * injected port with no network.
 */
export async function gatherFacts(port, nowMs, { repo = REPO } = {}) {
  const prs = await port.listOpenPrs();
  // Issues endpoint returns PRs too; a PR carries `pull_request`. Filter them
  // out or the ready count is inflated by Ralph's own open PR.
  const readyIssues = (await port.listReadyIssues()).filter((i) => !i.pull_request);
  const runsPayload = await port.listRuns();
  const runs = runsPayload?.workflow_runs || [];

  const ralphPrs = [];
  for (const p of prs.filter((x) => isRalphPr(x, repo))) {
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
    const { mergeable, mergeableState } = await readMergeability(port, p.number, p.head.sha);

    ralphPrs.push({
      number: p.number,
      headRef: p.head.ref,
      headSha: p.head.sha,
      issueNumber,
      draft: Boolean(p.draft),
      mergeable,
      mergeableState,
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

/** Hidden marker on the ask comment. The FULL head SHA makes the ask once-per-diff. */
const askMarker = (sha) => `<!-- ralph-watchdog:needs-human sha=${sha} -->`;

async function alreadyAsked(port, prNumber, marker) {
  for (let page = 1; page <= MAX_COMMENT_PAGES; page++) {
    const comments = await port.listComments(prNumber, page);
    if (!Array.isArray(comments)) return false;
    if (comments.some((c) => typeof c?.body === 'string' && c.body.includes(marker))) return true;
    if (comments.length < COMMENTS_PER_PAGE) return false;
  }
  return true; // past the cap an unseen earlier ask is likelier than none — never spam
}

/**
 * Ask a human to unblock a green PR, once per head SHA: the label first, then
 * the comment that doubles as the dedupe record (so a failed label is retried
 * next tick), then a Discord page. Discord is fail-soft and reported, never thrown.
 */
async function askHuman(port, decision, page) {
  const { pr } = decision;
  const marker = askMarker(pr.headSha);
  if (await alreadyAsked(port, pr.number, marker)) {
    return `already asked a human on PR #${pr.number} for this head — not asking again`;
  }
  await port.addLabels(pr.number, [HUMAN_LABEL]);
  await port.comment(
    pr.number,
    `⏳ **Ralph watchdog: this PR needs a human before it can merge.**\n\n${decision.reason}\n\n` +
      `Ralph is single-flight, so every queued issue waits behind this PR. To unblock it, ` +
      `review the diff and add \`${APPROVE_LABEL}\` (the watchdog merges it on its next hourly ` +
      `tick), or close it with a reason.\n\n${marker}${FOOTER}`,
  );
  const url = `https://github.com/${REPO}/pull/${pr.number}`;
  const paged = await page(
    `⏳ Ralph PR #${pr.number} is green but needs a human, and the queue is blocked behind it. ` +
      `${decision.reason}\n${url}`,
  );
  const discord = paged?.sent
    ? 'Discord paged'
    : `Discord not paged: ${paged?.reason || 'unknown'}`;
  return `asked a human on PR #${pr.number} (${HUMAN_LABEL} + comment; ${discord})`;
}

/** The default pager: Discord through the shared notify seam, with a hint that fits this job. */
async function pageDiscord(text) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return { sent: false, reason: DISCORD_SECRET_HINT };
  return postToDiscord(text, { webhookUrl });
}

export async function applyDecision(port, decision, { page = pageDiscord } = {}) {
  if (decision.action === ACTION.IDLE && decision.needsHuman === true && decision.pr) {
    return askHuman(port, decision, page);
  }
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
