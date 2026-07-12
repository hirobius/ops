#!/usr/bin/env node
/**
 * scripts/fleet-dispatch.mjs — headless fleet-mode dispatcher (epic #41, Slice 2).
 *
 * The mayor's fleet-mode worker: scans the `tasks` board for rows Adrian has
 * opted into auto-dispatch (`auto_ok=true`, via the /ops/tasks toggle from
 * Slice 1), routes each through the deterministic `lib/tasks/tier.mjs`
 * tier→model directive, and opens an `@claude` GitHub issue for up to `--max`
 * of them per run. This is a Node script that files GitHub issues — it does
 * NOT spawn Claude sub-agents in-process; picking the issue up is GitHub's
 * `@claude` mention hand-off, scheduled separately by Adrian (mayor session).
 *
 * Reuses every piece built in prior slices rather than re-implementing:
 *   - lib/tasks/tier.mjs::routeTask       tier/model routing (Slice 1)
 *   - lib/tasks/actions.mjs::applyTaskAction  the ONE dispatch-lifecycle write
 *     seam (ops#139) — the 'dispatch' action opens the @claude issue and
 *     stamps dispatch_url/claimed_by/claimed_at/dispatch_status/
 *     last_dispatched_at/dispatch_count; this script never writes those
 *     columns directly.
 *   - lib/github/issues.mjs::makeGitHubPort   injected GitHub port
 *   - lib/supabase/tasks.mjs::setTaskFields   writes tier/model ONLY — the
 *     routing fields `applyTaskAction('dispatch')` doesn't own
 *   - lib/ops/run-log.mjs::appendRun          run recap (#8)
 *   - lib/ops/notify.mjs::notifyEvent         fleet timeline + Discord (Slice 4)
 *
 * Usage:
 *   node scripts/fleet-dispatch.mjs [--max N] [--json] [--apply] [--help]
 *
 * `--dry-run` is the DEFAULT — it lists eligible tasks + computed tier/model
 * and touches nothing (no writes, no GitHub calls). Pass `--apply` to
 * actually dispatch (write tier/model, open the @claude issue — which stamps
 * the rest of the dispatch-lifecycle fields — notify + log the run).
 * `--max N` caps dispatches per run (default 3) — both listing and dispatch
 * respect the cap. `--json` prints machine-readable output instead of the
 * human summary.
 *
 * Eligibility: `auto_ok = true AND dispatch_status IS NULL AND status = 'open'`.
 * Already-dispatched rows (dispatch_status set) are never re-picked — the
 * eligibility filter is a guardrail against double-dispatch, not just an
 * optimization. This checks dispatch LIFECYCLE (dispatch_status), not
 * PROVENANCE (dispatch_url) — a github-imported task carries its source issue
 * in `source_url`, not `dispatch_url` (ops#105), so gating on dispatch_url
 * would make imported tasks permanently ineligible once that field were ever
 * (mis)stamped at import time.
 *
 * Board columns (migration 0008) may not be applied in every environment yet
 * (Adrian applies it in Supabase). If the columns are absent, the Supabase
 * query 500s with "column ... does not exist" (PostgREST code 42703) — this
 * script catches that specifically and exits cleanly naming the migration,
 * rather than crashing.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { setTaskFields } from '../lib/supabase/tasks.mjs';
import { routeTask } from '../lib/tasks/tier.mjs';
import { applyTaskAction } from '../lib/tasks/actions.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';
import { appendRun } from '../lib/ops/run-log.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';

export const DEFAULT_MAX = 3;
export const MIGRATION_HINT = 'supabase/migrations/0008_task_dispatch.sql';
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Pure: filter a task list to the auto-dispatch eligibility rule
 * (`auto_ok === true && !dispatch_status && status === 'open'`), route each
 * survivor through `routeTask`, and cap the result at `max`. No network, no
 * Date — safe to unit test with plain stub objects.
 *
 * @param {Array<object>} tasks
 * @param {{ max?: number }} [opts]
 * @returns {Array<{ task: object, tier: string, model: string }>}
 */
export function selectAndRoute(tasks, { max = DEFAULT_MAX } = {}) {
  const cap = Number.isFinite(max) && max >= 0 ? max : DEFAULT_MAX;
  const eligible = (Array.isArray(tasks) ? tasks : []).filter(
    (t) => t && t.auto_ok === true && !t.dispatch_status && t.status === 'open',
  );
  return eligible.slice(0, cap).map((task) => ({ task, ...routeTask(task) }));
}

/** True when a Supabase/PostgREST error means a queried column doesn't exist. */
export function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message || '');
}

/** Live eligible-row fetch — the one non-pure piece `selectAndRoute` feeds from. */
async function fetchEligibleTasks(sb) {
  const { data, error } = await sb
    .from('tasks')
    .select('*')
    .eq('auto_ok', true)
    .is('dispatch_status', null)
    .eq('status', 'open')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function parseArgs(argv) {
  const o = { max: DEFAULT_MAX, apply: false, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--max':
        o.max = Number(argv[++i]);
        break;
      case '--apply':
        o.apply = true;
        break;
      case '--dry-run':
        o.apply = false; // explicit no-op — dry-run is already the default
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
    `scripts/fleet-dispatch.mjs — headless fleet-mode dispatcher (#41 Slice 2)\n\n` +
      `Usage:\n` +
      `  node scripts/fleet-dispatch.mjs [--max N] [--json] [--apply]\n\n` +
      `Eligibility: auto_ok=true AND dispatch_status IS NULL AND status='open'.\n` +
      `--dry-run is the DEFAULT — lists eligible tasks + computed tier/model,\n` +
      `dispatches nothing. Pass --apply to actually open @claude issues.\n\n` +
      `Flags:\n` +
      `  --max N     cap dispatches per run (default ${DEFAULT_MAX})\n` +
      `  --apply     perform the dispatch (default is dry-run/list-only)\n` +
      `  --dry-run   explicit no-op — same as the default\n` +
      `  --json      machine-readable output\n` +
      `  --help      print this usage and exit 0\n`,
  );
}

function fmtSelected(selected) {
  return selected
    .map(({ task, tier, model }) => `  ${task.key}  tier=${tier} model=${model}  "${task.title}"`)
    .join('\n');
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
    tasks = await fetchEligibleTasks(sb);
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

  const selected = selectAndRoute(tasks, { max: args.max });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          eligibleCount: tasks.length,
          max: args.max,
          apply: args.apply,
          selected: selected.map(({ task, tier, model }) => ({
            key: task.key,
            title: task.title,
            tier,
            model,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Eligible tasks: ${tasks.length} (auto_ok, no dispatch_status, status=open)`);
    if (selected.length === 0) {
      console.log('Nothing to dispatch.');
    } else {
      console.log(`Selected (capped at --max ${args.max}):`);
      console.log(fmtSelected(selected));
    }
  }

  if (!args.apply) {
    if (!args.json) {
      console.log('\nDry run — no writes, no GitHub calls. Pass --apply to dispatch for real.');
    }
    process.exit(0);
    return;
  }

  if (selected.length === 0) {
    process.exit(0);
    return;
  }

  // Fail loud + actionable BEFORE any writes — a missing token mid-loop would
  // leave rows stamped dispatch_status='dispatched' without an actual issue.
  if (!process.env.GITHUB_TOKEN) {
    console.error(
      `GITHUB_TOKEN is not set — needed to open the @claude dispatch issue(s). ` +
        `Set it in Vercel → Settings → Environment Variables (Production), then ` +
        `redeploy: ${VERCEL_ENV_URL}`,
    );
    process.exit(1);
    return;
  }

  const github = makeGitHubPort();
  let dispatchedCount = 0;

  for (const { task, tier, model } of selected) {
    if (dispatchedCount >= args.max) break; // guardrail: never exceed --max per run
    if (await dispatchOne(sb, github, { task, tier, model })) dispatchedCount += 1;
  }

  console.log(`\nDispatched ${dispatchedCount}/${selected.length} selected task(s).`);
}

/**
 * Dispatch one selected task: stamp its routing fields (tier/model — the one
 * write this script still owns directly, since `applyTaskAction('dispatch')`
 * never touches them), then hand every dispatch-lifecycle write
 * (`dispatch_url`/`claimed_by`/`claimed_at`/`dispatch_status`/
 * `last_dispatched_at`/`dispatch_count`) to the shared `dispatch` action
 * (lib/tasks/actions.mjs, ops#139) — one writer per field, no more
 * pre-stamping `dispatch_status` here just for `dispatch` to stamp it again
 * a few lines later.
 */
export async function dispatchOne(sb, github, { task, tier, model }) {
  const nowIso = new Date().toISOString();

  const { error: setErr } = await setTaskFields(sb, task.key, { tier, model });
  if (setErr) {
    console.error(`${task.key}: failed to write routing fields — ${setErr.message}`);
    return false;
  }

  const result = await applyTaskAction(
    sb,
    { key: task.key, action: 'dispatch', actor: 'fleet-dispatch' },
    { github },
  );
  if (result.status !== 200) {
    console.error(`${task.key}: dispatch failed — ${result.body?.error ?? 'unknown error'}`);
    return false;
  }

  const dispatchUrl = result.body.dispatch_url;

  await notifyEvent({
    ts: nowIso,
    kind: 'dispatched',
    title: `${task.key}: ${task.title}`,
    detail: `tier=${tier} model=${model}`,
    url: dispatchUrl,
    task: task.key,
  });

  appendRun({
    ts: nowIso,
    actor: 'fleet-dispatch',
    task: task.key,
    model,
    tier,
    outcome: 'dispatched',
    summary: 'auto-dispatched to @claude fleet',
  });

  console.log(`${task.key}: dispatched — ${dispatchUrl}`);
  return true;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
