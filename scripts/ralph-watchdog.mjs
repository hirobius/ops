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
 *   merge      — the gate is green and the auto-merge simply did not arm
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
 * Usage:
 *   node scripts/ralph-watchdog.mjs                 # dry run (default)
 *   node scripts/ralph-watchdog.mjs --json          # machine-readable
 *   node scripts/ralph-watchdog.mjs --apply         # actually act
 *
 * Auth: GITHUB_TOKEN (or GH_TOKEN) with contents+issues+pull-requests+actions.
 * Inside GitHub Actions the job's own GITHUB_TOKEN is sufficient.
 */

import { decideWatchdogAction, isMutating, ACTION } from '../lib/ops/ralph-watchdog.mjs';

const REPO = process.env.RALPH_WATCHDOG_REPO || 'hirobius/ops';
const API = 'https://api.github.com';
const READY_LABEL = 'ralph-ready';
const GATE_NAME = 'ralph-gate';

const TOKEN_HINT =
  'GITHUB_TOKEN (or GH_TOKEN) is missing, expired, or lacks scope. It needs contents, ' +
  'issues, pull-requests and actions on ' +
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
    getIssue: (n) => call(`/repos/${REPO}/issues/${n}`),
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
    const checks = await port.listCheckRuns(p.head.sha);
    const gate = (checks?.check_runs || []).find((c) => (c.name || '').includes(GATE_NAME));
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

    ralphPrs.push({
      number: p.number,
      headRef: p.head.ref,
      headSha: p.head.sha,
      issueNumber,
      draft: Boolean(p.draft),
      mergeableState: p.mergeable_state,
      gateConclusion: gate ? (gate.status === 'completed' ? gate.conclusion : 'pending') : null,
      gatePendingMinutes: gate?.started_at ? minutesSince(gate.started_at, nowMs) : 0,
      selfhealAttempted: (p.labels || []).some((l) => l.name === 'ralph-selfheal-attempted'),
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

    const out = {
      ok: true,
      dryRun: !apply,
      action: decision.action,
      reason: decision.reason,
      pr: decision.pr?.number ?? null,
      performed,
      facts: {
        openRalphPrs: facts.openRalphPrs.map((p) => p.number),
        readyIssueCount: facts.readyIssueCount,
        runInProgress: facts.runInProgress,
      },
    };
    if (jsonMode) console.log(JSON.stringify(out, null, 2));
    else {
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
