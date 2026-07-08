#!/usr/bin/env node
/**
 * scripts/deploy-alert.mjs — manual-trigger deploy/blocked alert check (#11).
 *
 * Watches the SAME sources /ops/projects reads — Vercel deploy states via
 * lib/projects/index.mjs::listProjects() (VERCEL_TOKEN) and each repo's root
 * status.json `blocked[]` via GITHUB_TOKEN (attachRepoStatuses, called inside
 * listProjects) — and alerts Adrian only on a NEW transition:
 *
 *   - a project's latest deployment moves TO the ERROR state
 *   - a repo's status.json `blocked[]` gains an entry it didn't have before
 *
 * Clearing an error / clearing a blocked entry is an INFO line, not an alert.
 * Already-alerted states never re-fire (diffed against the committed snapshot).
 *
 * Deliberately a MANUAL script, not a cron or a stateful endpoint — Vercel
 * serverless functions can't persist state to the repo, and Adrian wants
 * passive/manual triggers only for now (see issue #11). Run it by hand, or
 * from an agent, whenever you want a fleet-wide "did anything break" check.
 *
 * State:
 *   docs/ops/deploy-snapshot.json   committed — last-seen state per project/repo
 *   docs/ops/alert-log.jsonl        committed, append-only — one JSON line per alert
 *
 * Delivery (pluggable):
 *   - always prints a summary to stdout
 *   - POSTs to DISCORD_WEBHOOK_URL if set (same pattern as youtube-knowledge.mjs)
 *   - email is a documented follow-up — needs a transactional-email provider
 *     (e.g. Resend/Postmark) wired with its own API key; not built here.
 *
 * Env (set by the human — agents never read/write .env*):
 *   VERCEL_TOKEN         required — read-scoped Vercel token
 *   VERCEL_TEAM_ID       optional team scope
 *   GITHUB_TOKEN         optional but needed for blocked-status detection
 *   DISCORD_WEBHOOK_URL  optional — enables Discord delivery
 *
 * Usage:
 *   node scripts/deploy-alert.mjs                 # live check, writes snapshot+log
 *   node scripts/deploy-alert.mjs --dry-run        # report only, no writes
 *   node scripts/deploy-alert.mjs --json           # machine-readable output
 *   NODE_USE_ENV_PROXY=1 node scripts/deploy-alert.mjs   # if outbound needs the proxy
 *
 * Flags:
 *   --dry-run   report without writing the snapshot or alert log (or posting Discord)
 *   --json      print a machine-readable JSON summary instead of formatted text
 *   --help      print this usage and exit 0
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

import { postToDiscord as sharedPostToDiscord } from '../lib/ops/notify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SNAPSHOT_PATH = join(ROOT, 'docs', 'ops', 'deploy-snapshot.json');
const LOG_PATH = join(ROOT, 'docs', 'ops', 'alert-log.jsonl');

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';
const GITHUB_TOKEN_URL = 'https://github.com/settings/personal-access-tokens';

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const o = { dryRun: false, json: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case '--dry-run':
        o.dryRun = true;
        break;
      case '--json':
        o.json = true;
        break;
      case '--help':
      case '-h':
        o.help = true;
        break;
      default:
        console.error(`Unknown flag: ${arg}`);
        o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    `scripts/deploy-alert.mjs — manual deploy/blocked alert check (#11)\n\n` +
      `Usage:\n` +
      `  node scripts/deploy-alert.mjs [--dry-run] [--json] [--help]\n\n` +
      `Reads the same Vercel + GitHub status.json sources as /ops/projects,\n` +
      `diffs against docs/ops/deploy-snapshot.json, and alerts on a NEW deploy\n` +
      `ERROR or newly-blocked repo. Always prints to stdout; POSTs to\n` +
      `DISCORD_WEBHOOK_URL if set. --dry-run reports without writing state.\n`,
  );
}

// ── Snapshot I/O ──────────────────────────────────────────────────────────────

function emptySnapshot() {
  return { updatedAt: null, projects: {}, repos: {} };
}

function loadSnapshot(path = SNAPSHOT_PATH) {
  if (!existsSync(path)) return emptySnapshot();
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return {
      updatedAt: raw.updatedAt ?? null,
      projects: raw.projects ?? {},
      repos: raw.repos ?? {},
    };
  } catch (e) {
    console.error(
      `WARNING: ${path} exists but is not valid JSON (${e.message}) — treating as empty snapshot.`,
    );
    return emptySnapshot();
  }
}

function writeSnapshot(snapshot, path = SNAPSHOT_PATH) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

function appendAlertLog(alerts, path = LOG_PATH) {
  if (!alerts.length) return;
  mkdirSync(dirname(path), { recursive: true });
  const lines = alerts.map((a) => JSON.stringify(a)).join('\n') + '\n';
  appendFileSync(path, lines, 'utf8');
}

// ── Snapshot shape ────────────────────────────────────────────────────────────
//
// { updatedAt, projects: { [projectId]: { name, state, target, checkedAt } },
//   repos: { [org/repo]: { blocked: string[] } } }

/**
 * Build the new snapshot from the current /api/projects-shaped project list.
 *
 * `previousSnapshot.repos` is a fallback for repos we couldn't check this run
 * (GITHUB_TOKEN unset/expired, or a transient fetch failure — repoStatus is
 * null in both cases). Without the fallback, one token-less run would reset
 * `blocked` to [] and cause every pre-existing blocked entry to look "newly
 * blocked" once the token starts working again.
 */
export function buildSnapshot(
  projects,
  previousSnapshot = emptySnapshot(),
  now = new Date().toISOString(),
) {
  const snapshot = { updatedAt: now, projects: {}, repos: {} };
  const prevRepos = previousSnapshot.repos ?? {};
  for (const p of projects) {
    snapshot.projects[p.id] = {
      name: p.name,
      state: p.latestDeployment?.state ?? null,
      target: p.latestDeployment?.target ?? null,
      checkedAt: now,
    };
    const key = repoKey(p);
    if (!key || key in snapshot.repos) continue;
    if (p.repoStatus) {
      snapshot.repos[key] = { blocked: p.repoStatus.blocked ?? [] };
    } else if (prevRepos[key]) {
      snapshot.repos[key] = prevRepos[key]; // carry forward last-known state
    }
  }
  return snapshot;
}

function repoKey(p) {
  const c = p.latestDeployment?.commit;
  return c?.org && c?.repo ? `${c.org}/${c.repo}` : null;
}

// ── Diff: current project list vs previous snapshot ───────────────────────────

/**
 * @returns {{ alerts: object[], info: object[] }}
 */
export function computeDiff(projects, previousSnapshot, now = new Date().toISOString()) {
  const alerts = [];
  const info = [];
  const prevProjects = previousSnapshot.projects ?? {};
  const prevRepos = previousSnapshot.repos ?? {};
  const seenRepoKeys = new Set();

  for (const p of projects) {
    const currState = p.latestDeployment?.state ?? null;
    const prevState = prevProjects[p.id]?.state ?? null;

    if (currState === 'ERROR' && prevState !== 'ERROR') {
      alerts.push({
        ts: now,
        type: 'deploy_error',
        project: p.name,
        projectId: p.id,
        state: currState,
        previousState: prevState,
        url: p.latestDeployment?.url ?? null,
        target: p.latestDeployment?.target ?? null,
        commit: p.latestDeployment?.commit ?? null,
        message: `Deploy ERROR: ${p.name}${p.latestDeployment?.commit?.ref ? ` (${p.latestDeployment.commit.ref}@${p.latestDeployment.commit.sha ?? '?'})` : ''}`,
      });
    } else if (currState !== 'ERROR' && prevState === 'ERROR') {
      info.push({
        ts: now,
        type: 'deploy_cleared',
        project: p.name,
        projectId: p.id,
        state: currState,
        message: `Deploy cleared: ${p.name} is now ${currState ?? 'unknown'}`,
      });
    }

    const key = repoKey(p);
    if (!key || seenRepoKeys.has(key)) continue;
    seenRepoKeys.add(key);

    // repoStatus is null when GITHUB_TOKEN is unset/failed — never treat "we
    // couldn't check" as "cleared"; only diff when we actually have a status.
    if (!p.repoStatus) continue;

    const currBlocked = new Set(p.repoStatus.blocked ?? []);
    const prevBlocked = new Set(prevRepos[key]?.blocked ?? []);

    for (const reason of currBlocked) {
      if (!prevBlocked.has(reason)) {
        alerts.push({
          ts: now,
          type: 'newly_blocked',
          repo: key,
          reason,
          message: `Newly blocked: ${key} — ${reason}`,
        });
      }
    }
    for (const reason of prevBlocked) {
      if (!currBlocked.has(reason)) {
        info.push({
          ts: now,
          type: 'block_cleared',
          repo: key,
          reason,
          message: `Block cleared: ${key} — ${reason}`,
        });
      }
    }
  }

  return { alerts, info };
}

// ── Delivery ──────────────────────────────────────────────────────────────────
//
// The actual fetch/timeout/error-handling is shared with lib/ops/notify.mjs
// (extracted from this function's original inlined copy, #41 Slice 4) — this
// wrapper keeps deploy-alert's own decision logic (message formatting, the
// "no alerts to send" short-circuit) local so its behavior is unchanged.

async function postToDiscord(alerts, info) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return { sent: false, reason: 'DISCORD_WEBHOOK_URL not set' };
  if (!alerts.length) return { sent: false, reason: 'no alerts to send' };

  const lines = alerts.map((a) => `⚠️ ${a.message}`);
  if (info.length) lines.push('', ...info.map((i) => `ℹ️ ${i.message}`));

  return sharedPostToDiscord(`**Deploy/blocked alert** (${alerts.length} new)\n${lines.join('\n')}`, {
    webhookUrl: url,
  });
}

// ── Output ────────────────────────────────────────────────────────────────────

function printText({ alerts, info, projectsChecked, reposWithStatus, wrote, discord, dryRun }) {
  console.log(`Deploy/blocked check — ${new Date().toISOString()}`);
  console.log(
    `Checked ${projectsChecked} project(s), ${reposWithStatus} repo(s) with a readable status.json.\n`,
  );

  if (alerts.length) {
    console.log(`ALERTS (${alerts.length}):`);
    for (const a of alerts) console.log(`  [${a.type.toUpperCase()}] ${a.message}`);
    console.log();
  } else {
    console.log('No new alerts.\n');
  }

  if (info.length) {
    console.log(`INFO (${info.length}):`);
    for (const i of info) console.log(`  [${i.type.toUpperCase()}] ${i.message}`);
    console.log();
  }

  if (dryRun) {
    console.log('[dry-run] snapshot and alert log were NOT written; Discord was NOT posted.');
  } else {
    console.log(wrote ? 'Snapshot + alert log updated.' : 'Snapshot unchanged (nothing to write).');
    if (discord.sent) console.log('Posted summary to Discord.');
    else if (alerts.length) console.log(`Discord delivery skipped: ${discord.reason}`);
    if (!process.env.DISCORD_WEBHOOK_URL) {
      console.log(
        'Note: email delivery is not built yet — needs a transactional-email provider ' +
          '(e.g. Resend/Postmark) + API key. Set DISCORD_WEBHOOK_URL for chat delivery today.',
      );
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    printHelp();
    return;
  }

  if (!process.env.GITHUB_TOKEN) {
    console.error(
      'WARNING: GITHUB_TOKEN is not set — blocked-status detection (repo status.json) will be ' +
        'skipped this run; only Vercel deploy-ERROR alerts will fire.\n' +
        `Fix: create/rotate a token at ${GITHUB_TOKEN_URL} (contents:read is enough), then set ` +
        `GITHUB_TOKEN at ${VERCEL_ENV_URL} (Production + Preview) and re-run.\n`,
    );
  }

  const { listProjects } = await import('../lib/projects/index.mjs');
  const result = await listProjects();

  if (!result.ok) {
    if (result.code === 'ENV_MISSING_VERCEL_TOKEN') {
      console.error(
        'VERCEL_TOKEN is not set — deploy-alert needs it to list projects/deployments.\n' +
          `Fix: create a read-scoped token in Vercel, then set VERCEL_TOKEN at ${VERCEL_ENV_URL} ` +
          '(Production + Preview scopes), then redeploy/re-run.',
      );
    } else {
      console.error(
        `Vercel API call failed (${result.code}): ${result.error}\n` +
          `If this is an auth error, VERCEL_TOKEN is likely expired/revoked — rotate it at ` +
          `${VERCEL_ENV_URL} (Production), then redeploy/re-run.`,
      );
    }
    process.exitCode = 1;
    return;
  }

  const projects = result.projects;
  const reposWithStatus = new Set(
    projects
      .filter((p) => p.repoStatus)
      .map(repoKey)
      .filter(Boolean),
  ).size;

  if (process.env.GITHUB_TOKEN && reposWithStatus === 0 && projects.some(repoKey)) {
    console.error(
      'WARNING: GITHUB_TOKEN is set but no repo returned a readable status.json — the token may ' +
        `be expired/revoked or missing contents:read. Rotate it at ${GITHUB_TOKEN_URL} and set it ` +
        `at ${VERCEL_ENV_URL}, then re-run. (Blocked-status alerts are silently unavailable until then.)\n`,
    );
  }

  const previousSnapshot = loadSnapshot();
  const now = new Date().toISOString();
  const { alerts, info } = computeDiff(projects, previousSnapshot, now);
  const newSnapshot = buildSnapshot(projects, previousSnapshot, now);

  let wrote = false;
  let discord = { sent: false, reason: 'dry-run' };

  if (!o.dryRun) {
    writeSnapshot(newSnapshot);
    appendAlertLog(alerts);
    wrote = true;
    discord = await postToDiscord(alerts, info);
  }

  if (o.json) {
    console.log(
      JSON.stringify(
        {
          ts: now,
          projectsChecked: projects.length,
          reposWithStatus,
          alerts,
          info,
          dryRun: o.dryRun,
          wrote,
          discord,
        },
        null,
        2,
      ),
    );
  } else {
    printText({
      alerts,
      info,
      projectsChecked: projects.length,
      reposWithStatus,
      wrote,
      discord,
      dryRun: o.dryRun,
    });
  }

  if (alerts.length) process.exitCode = 2; // distinct from 1 (hard failure) — "new alerts" for CI/agent callers
}

// Guard so importing this module (e.g. to reuse computeDiff/buildSnapshot in
// a test or another script) never triggers a live run as a side effect.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
