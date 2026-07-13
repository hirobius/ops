#!/usr/bin/env node
/**
 * scripts/fleet-watchdog.mjs — stale-dispatch watchdog (epic #41, Slice 5).
 *
 * Closes the loop Slice 2 opened: `fleet-dispatch.mjs` opens `@claude` issues
 * and stamps `dispatch_status='dispatched'`, but nothing previously noticed
 * when a dispatched session died / never opened a PR. This script scans the
 * `tasks` board for dispatched rows that have gone quiet past a threshold and
 * either re-dispatches them (bumping `dispatch_count`) or, once retries are
 * exhausted, flags them `blocked` for a human to look at. Same shape as
 * `scripts/audit-claims.mjs` (stale-claim detection over a JSON store) —
 * here the store is the Supabase `tasks` table instead of
 * `docs/ai/orchestration.json`, so the mechanics (age check, threshold,
 * dry-run-by-default) are reused but the storage layer differs.
 *
 * Intended to run inside the **mayor Routine** alongside `fleet-dispatch.mjs`
 * — dispatch new work, then sweep for work that stalled, in the same pass.
 *
 * Reuses every piece prior slices already built rather than re-implementing:
 *   - lib/supabase/server.mjs::getServiceClient   service-role client
 *   - lib/supabase/tasks.mjs::listTasks           board reads
 *   - lib/tasks/actions.mjs::applyTaskAction      the one dispatch-lifecycle
 *     write seam (`redispatch`/`flag`, ops#139) — this script no longer
 *     writes dispatch fields directly via `setTaskFields`
 *   - lib/ops/notify.mjs::notifyEvent             fleet timeline + Discord
 *   - lib/ops/run-log.mjs::appendRun              run recap (#8)
 *   - lib/github/issues.mjs::makeGitHubPort       injected GitHub port
 *     (extended here with `commentOnIssue`, the one live-GitHub action this
 *     slice needs that the port didn't already expose)
 *
 * Usage:
 *   node scripts/fleet-watchdog.mjs [--stale-hours N] [--max-retries N] [--json] [--apply] [--comment] [--help]
 *
 * `--dry-run` is the DEFAULT — lists stale tasks + the re-dispatch/flag
 * decision per task and touches nothing (no writes, no GitHub calls). Pass
 * `--apply` to actually act. `--comment` additionally leaves a fresh
 * `@claude` comment on the stalled issue when re-dispatching — this needs
 * `GITHUB_TOKEN` + network (both unavailable in this sandbox), so it's opt-in
 * and skips cleanly (per-task, not a hard failure) when unavailable.
 *
 * Board columns (migration 0008) may not be applied in every environment yet.
 * If the columns are absent, the Supabase query 500s with "column ... does
 * not exist" (PostgREST code 42703) — caught explicitly, exits cleanly
 * naming the migration rather than crashing (same defensive pattern as
 * `fleet-dispatch.mjs`).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { listTasks } from '../lib/supabase/tasks.mjs';
import { applyTaskAction } from '../lib/tasks/actions.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';
import { appendRun } from '../lib/ops/run-log.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';

export const DEFAULT_STALE_HOURS = 24;
export const DEFAULT_MAX_RETRIES = 2;
export const MIGRATION_HINT = 'supabase/migrations/0008_task_dispatch.sql';
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Pure: find dispatched tasks that have gone stale and decide what to do
 * about each. No network, no Date-inside — `now` (ms epoch) is supplied by
 * the caller so this stays trivially unit-testable with plain stub objects.
 *
 * A task is STALE when ALL of:
 *   - it looks dispatched: `dispatch_status === 'dispatched'` OR
 *     (`claimed_by === 'claude'` AND `dispatch_url` is set)
 *   - `status` is not already `'done'` or `'blocked'` (nothing to watch —
 *     the work finished, or a human/prior run already flagged it)
 *   - `last_dispatched_at` is set and older than `now - staleHours`
 *     (no timestamp means we can't determine age — skip defensively rather
 *     than guess)
 *
 * For each stale task: `dispatch_count < maxRetries` → `{ task, action:
 * 're-dispatch' }`, otherwise → `{ task, action: 'flag' }`.
 *
 * @param {Array<object>} tasks
 * @param {{ staleHours?: number, maxRetries?: number, now: number }} opts
 * @returns {Array<{ task: object, action: 're-dispatch' | 'flag' }>}
 */
export function findStale(
  tasks,
  { staleHours = DEFAULT_STALE_HOURS, maxRetries = DEFAULT_MAX_RETRIES, now } = {},
) {
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new Error(
      'findStale requires a numeric `now` (ms epoch) passed by the caller — ' +
        'this function stays pure and never reads the clock itself.',
    );
  }
  const staleMs = (Number.isFinite(staleHours) ? staleHours : DEFAULT_STALE_HOURS) * 3_600_000;
  const retryLimit = Number.isFinite(maxRetries) ? maxRetries : DEFAULT_MAX_RETRIES;

  const list = Array.isArray(tasks) ? tasks : [];
  const out = [];

  for (const task of list) {
    if (!task) continue;
    if (task.status === 'done' || task.status === 'blocked') continue;

    const looksDispatched =
      task.dispatch_status === 'dispatched' ||
      (task.claimed_by === 'claude' && !!task.dispatch_url);
    if (!looksDispatched) continue;

    if (!task.last_dispatched_at) continue; // no timestamp — can't judge age, skip
    const dispatchedAt = new Date(task.last_dispatched_at).getTime();
    if (!Number.isFinite(dispatchedAt)) continue; // unparseable timestamp — skip

    const age = now - dispatchedAt;
    if (age <= staleMs) continue; // still fresh

    const count = Number.isFinite(task.dispatch_count) ? task.dispatch_count : 0;
    const action = count < retryLimit ? 're-dispatch' : 'flag';
    out.push({ task, action });
  }

  return out;
}

/** True when a Supabase/PostgREST error means a queried column doesn't exist. */
export function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message || '');
}

function parseArgs(argv) {
  const o = {
    staleHours: DEFAULT_STALE_HOURS,
    maxRetries: DEFAULT_MAX_RETRIES,
    apply: false,
    comment: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--stale-hours':
        o.staleHours = Number(argv[++i]);
        break;
      case '--max-retries':
        o.maxRetries = Number(argv[++i]);
        break;
      case '--apply':
        o.apply = true;
        break;
      case '--dry-run':
        o.apply = false; // explicit no-op — dry-run is already the default
        break;
      case '--comment':
        o.comment = true;
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
    `scripts/fleet-watchdog.mjs — stale-dispatch watchdog (#41 Slice 5)\n\n` +
      `Usage:\n` +
      `  node scripts/fleet-watchdog.mjs [--stale-hours N] [--max-retries N] [--json] [--apply] [--comment]\n\n` +
      `Stale: dispatched (dispatch_status='dispatched' OR claimed_by='claude'+dispatch_url)\n` +
      `AND status not in (done, blocked) AND last_dispatched_at older than --stale-hours.\n` +
      `dispatch_count < --max-retries -> re-dispatch, else -> flag (status='blocked').\n\n` +
      `--dry-run is the DEFAULT — lists stale tasks + the decision per task,\n` +
      `does not write. Pass --apply to actually re-dispatch/flag.\n\n` +
      `Intended to run inside the mayor Routine alongside fleet-dispatch.mjs.\n\n` +
      `Flags:\n` +
      `  --stale-hours N   staleness threshold in hours (default ${DEFAULT_STALE_HOURS})\n` +
      `  --max-retries N   retries before flagging instead of re-dispatching (default ${DEFAULT_MAX_RETRIES})\n` +
      `  --apply           perform the action (default is dry-run/list-only)\n` +
      `  --dry-run         explicit no-op — same as the default\n` +
      `  --comment         also leave a fresh @claude comment on re-dispatch (needs\n` +
      `                    GITHUB_TOKEN + network; skips cleanly per-task if unavailable)\n` +
      `  --json            machine-readable output\n` +
      `  --help            print this usage and exit 0\n`,
  );
}

function fmtDecisions(decisions) {
  return decisions
    .map(({ task, action }) => {
      const count = Number.isFinite(task.dispatch_count) ? task.dispatch_count : 0;
      return `  ${task.key}  action=${action} dispatch_count=${count} last_dispatched_at=${task.last_dispatched_at}  "${task.title}"`;
    })
    .join('\n');
}

/**
 * Re-dispatch one stale task via the `redispatch` action (ops#139) — the
 * dispatch-lifecycle write (bump dispatch_count, restamp, re-assert
 * dispatch_status) goes through `applyTaskAction`, the one seam every
 * dispatch source shares. This function keeps the comment-availability
 * messaging + notify/run-log recap, since those are watchdog-specific, not
 * part of the dispatch-lifecycle write itself.
 */
export async function reDispatch(sb, github, { task, comment, maxRetries }) {
  const result = await applyTaskAction(
    sb,
    { key: task.key, action: 'redispatch', comment, maxRetries },
    { github: comment ? github : null },
  );
  if (result.status !== 200) {
    console.error(`${task.key}: failed to write re-dispatch fields — ${result.body?.error}`);
    return false;
  }

  const nextCount = result.body.dispatch_count;
  const nowIso = new Date().toISOString();

  if (comment) {
    if (!github) {
      console.log(
        `${task.key}: --comment requested but GITHUB_TOKEN is not set — skipping the ` +
          `issue comment (fields still re-dispatched). Set it at ${VERCEL_ENV_URL}.`,
      );
    } else if (!task.dispatch_url) {
      console.log(`${task.key}: --comment requested but no dispatch_url on record — skipping.`);
    } else if (!result.body.commented) {
      console.log(`${task.key}: --comment failed — fields still re-dispatched.`);
    }
  }

  await notifyEvent({
    ts: nowIso,
    kind: 'dispatched',
    title: `${task.key} re-dispatched (stale)`,
    detail: `retry ${nextCount}/${maxRetries}`,
    task: task.key,
    url: task.dispatch_url || undefined,
  });

  appendRun({
    ts: nowIso,
    actor: 'fleet-watchdog',
    task: task.key,
    outcome: 're-dispatched',
    summary: 'stale dispatch re-kicked',
  });

  console.log(`${task.key}: re-dispatched (retry ${nextCount}/${maxRetries}).`);
  return true;
}

/**
 * Flag one stale task that's exhausted its retries via the `flag` action
 * (ops#139): blocks it through `applyTaskAction`, then notify + log.
 */
export async function flag(sb, { task, maxRetries }) {
  const result = await applyTaskAction(sb, { key: task.key, action: 'flag' });
  if (result.status !== 200) {
    console.error(`${task.key}: failed to write flag fields — ${result.body?.error}`);
    return false;
  }

  const nowIso = new Date().toISOString();

  await notifyEvent({
    ts: nowIso,
    kind: 'blocked',
    title: `${task.key} dispatch stalled`,
    detail: `exceeded ${maxRetries} retries`,
    task: task.key,
  });

  appendRun({
    ts: nowIso,
    actor: 'fleet-watchdog',
    task: task.key,
    outcome: 'flagged',
    summary: 'stale dispatch exceeded retries — flagged blocked',
  });

  console.log(`${task.key}: flagged blocked (exceeded ${maxRetries} retries).`);
  return true;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    console.error(`Supabase not reachable: ${err.message}`);
    process.exit(1);
    return;
  }

  let tasks;
  try {
    const { data, error } = await listTasks(sb, {});
    if (error) throw error;
    tasks = data ?? [];
  } catch (err) {
    if (isMissingColumnError(err)) {
      console.log(
        `Fleet dispatch board columns are not present in this database yet — apply ` +
          `${MIGRATION_HINT} in Supabase, then re-run. Exiting cleanly (no crash).`,
      );
      process.exit(0);
      return;
    }
    console.error(`Supabase query failed: ${err.message}`);
    process.exit(1);
    return;
  }

  const decisions = findStale(tasks, {
    staleHours: args.staleHours,
    maxRetries: args.maxRetries,
    now: Date.now(),
  });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          staleHours: args.staleHours,
          maxRetries: args.maxRetries,
          apply: args.apply,
          stale: decisions.map(({ task, action }) => ({
            key: task.key,
            title: task.title,
            action,
            dispatch_count: task.dispatch_count ?? 0,
            last_dispatched_at: task.last_dispatched_at,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Scanned ${tasks.length} task(s). Stale: ${decisions.length}.`);
    if (decisions.length === 0) {
      console.log('Nothing stale.');
    } else {
      console.log(fmtDecisions(decisions));
    }
  }

  if (!args.apply) {
    if (!args.json) {
      console.log('\nDry run — no writes, no GitHub calls. Pass --apply to act for real.');
    }
    process.exit(0);
    return;
  }

  if (decisions.length === 0) {
    process.exit(0);
    return;
  }

  const github = args.comment ? makeGitHubPort() : null;
  if (args.comment && !github && !args.json) {
    console.log(
      `--comment requested but GITHUB_TOKEN is not set — re-dispatch/flag will still ` +
        `happen, comments will be skipped per-task. Set it at ${VERCEL_ENV_URL}.`,
    );
  }

  let acted = 0;
  for (const decision of decisions) {
    const ok =
      decision.action === 're-dispatch'
        ? await reDispatch(sb, github, {
            task: decision.task,
            comment: args.comment,
            maxRetries: args.maxRetries,
          })
        : await flag(sb, { task: decision.task, maxRetries: args.maxRetries });
    if (ok) acted += 1;
  }

  console.log(`\nActed on ${acted}/${decisions.length} stale task(s).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
