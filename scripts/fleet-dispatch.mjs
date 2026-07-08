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
 *   - lib/tasks/actions.mjs::applyTaskAction  the 'dispatch' action already
 *     opens the @claude issue + stamps dispatch_url/claimed_by (Slice 1/pre)
 *   - lib/github/issues.mjs::makeGitHubPort   injected GitHub port
 *   - lib/supabase/tasks.mjs::setTaskFields   writes tier/model/dispatch_*
 *   - lib/ops/run-log.mjs::appendRun          run recap (#8)
 *   - lib/ops/notify.mjs::notifyEvent         fleet timeline + Discord (Slice 4)
 *
 * Issue #47's safety layer (build-first gate before the mayor can be
 * scheduled unattended) sits between selection and dispatch:
 *   - lib/tasks/lease.mjs        B.2 claim/lease — closes the double-dispatch
 *                                 race between concurrent runs
 *   - lib/tasks/overlap.mjs      B.3 file-overlap — refuses to fire a task
 *                                 whose declared `touches` overlap an
 *                                 in-flight task's
 *   - lib/tasks/budget.mjs +
 *     lib/ops/spend-log.mjs      B.1 spend ceiling — per-run + daily USD cap
 *                                 on PROJECTED cost (see budget.mjs's module
 *                                 doc — this is not metered actual spend)
 *
 * Usage:
 *   node scripts/fleet-dispatch.mjs [--max N] [--max-cost-usd N]
 *     [--daily-cost-usd N] [--lease-minutes N] [--json] [--apply] [--help]
 *
 * `--dry-run` is the DEFAULT — it lists eligible tasks + computed tier/model
 * plus what the safety gates would block, and touches nothing (no writes,
 * no GitHub calls). Pass `--apply` to actually dispatch (claim a lease, write
 * tier/model/dispatch_status back, open the @claude issue, log the
 * projected spend, notify + log the run). `--max N` caps dispatches per run
 * (default 3) before the safety gates run — `--max-cost-usd`/
 * `--daily-cost-usd` may trim further. `--json` prints machine-readable
 * output instead of the human summary.
 *
 * Eligibility: `auto_ok = true AND dispatch_url IS NULL AND status = 'open'`.
 * Already-dispatched rows (dispatch_url set) are never re-picked — the
 * eligibility filter is a guardrail against double-dispatch, not just an
 * optimization. The lease gate (B.2) covers the narrower race the
 * eligibility filter can't: two runs reading the SAME eligible row before
 * either has written back.
 *
 * Board columns (migration 0008) may not be applied in every environment yet
 * (Adrian applies it in Supabase). If the columns are absent, the Supabase
 * query 500s with "column ... does not exist" (PostgREST code 42703) — this
 * script catches that specifically and exits cleanly naming the migration,
 * rather than crashing. Same defensive check applies to migration 0009
 * (lease_owner/lease_expires_at/touches).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { setTaskFields, listTasks } from '../lib/supabase/tasks.mjs';
import { routeTask } from '../lib/tasks/tier.mjs';
import { applyTaskAction } from '../lib/tasks/actions.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';
import { appendRun } from '../lib/ops/run-log.mjs';
import { notifyEvent } from '../lib/ops/notify.mjs';
import { isLeased, claimLease, releaseLease, DEFAULT_LEASE_MINUTES } from '../lib/tasks/lease.mjs';
import { partitionByOverlap } from '../lib/tasks/overlap.mjs';
import {
  capByBudget,
  DEFAULT_PER_RUN_CEILING_USD,
  DEFAULT_DAILY_CEILING_USD,
} from '../lib/tasks/budget.mjs';
import { appendSpend, readSpend, sumSpendSince } from '../lib/ops/spend-log.mjs';

export const DEFAULT_MAX = 3;
export const MIGRATION_HINT = 'supabase/migrations/0008_task_dispatch.sql';
export const LEASE_MIGRATION_HINT = 'supabase/migrations/0009_task_lease_touches.sql';
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Pure: filter a task list to the auto-dispatch eligibility rule
 * (`auto_ok === true && !dispatch_url && status === 'open'`), route each
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
    (t) => t && t.auto_ok === true && !t.dispatch_url && t.status === 'open',
  );
  return eligible.slice(0, cap).map((task) => ({ task, ...routeTask(task) }));
}

/**
 * Pure: layer the issue #47 safety gates on top of `selectAndRoute`'s
 * output, in the order the issue's DoD sequencing implies — lease
 * (already-claimed elsewhere) first, then file-overlap (fan-out safety),
 * then spend (the budget brake, since it's the one gate that TRIMS rather
 * than reorders). Each gate is independently unit-tested in its own module
 * (lib/tasks/lease.mjs, lib/tasks/overlap.mjs, lib/tasks/budget.mjs); this
 * just wires them together so main() (and its tests) don't have to.
 *
 * @param {Array<{task:object, tier:string, model:string}>} selected
 * @param {{ now: number, inFlightTasks: Array, dailySpentUsd?: number,
 *   perRunCeilingUsd?: number, dailyCeilingUsd?: number }} opts
 * @returns {{ dispatchable: Array, blockedByLease: Array, blockedByOverlap: Array,
 *   blockedByBudget: Array, runTotalUsd: number }}
 */
export function applySafetyGates(
  selected,
  { now, inFlightTasks, dailySpentUsd, perRunCeilingUsd, dailyCeilingUsd },
) {
  const blockedByLease = selected.filter(({ task }) => isLeased(task, now));
  const unleased = selected.filter(({ task }) => !isLeased(task, now));

  const { clear, blocked: blockedByOverlap } = partitionByOverlap(unleased, inFlightTasks);

  const { affordable, skipped: blockedByBudget, runTotalUsd } = capByBudget(clear, {
    dailySpentUsd,
    perRunCeilingUsd,
    dailyCeilingUsd,
  });

  return {
    dispatchable: affordable,
    blockedByLease,
    blockedByOverlap,
    blockedByBudget,
    runTotalUsd,
  };
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
    .is('dispatch_url', null)
    .eq('status', 'open')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Live in-flight-row fetch — dispatched-but-not-done tasks, for the B.3 overlap gate. */
async function fetchInFlightTasks(sb) {
  const { data, error } = await listTasks(sb, {});
  if (error) throw error;
  return (data ?? []).filter(
    (t) => t.dispatch_status === 'dispatched' && t.status !== 'done' && t.status !== 'blocked',
  );
}

function parseArgs(argv) {
  const o = {
    max: DEFAULT_MAX,
    perRunCeilingUsd: DEFAULT_PER_RUN_CEILING_USD,
    dailyCeilingUsd: DEFAULT_DAILY_CEILING_USD,
    leaseMinutes: DEFAULT_LEASE_MINUTES,
    apply: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--max':
        o.max = Number(argv[++i]);
        break;
      case '--max-cost-usd':
        o.perRunCeilingUsd = Number(argv[++i]);
        break;
      case '--daily-cost-usd':
        o.dailyCeilingUsd = Number(argv[++i]);
        break;
      case '--lease-minutes':
        o.leaseMinutes = Number(argv[++i]);
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
      `  node scripts/fleet-dispatch.mjs [--max N] [--max-cost-usd N]\n` +
      `    [--daily-cost-usd N] [--lease-minutes N] [--json] [--apply]\n\n` +
      `Eligibility: auto_ok=true AND dispatch_url IS NULL AND status='open'.\n` +
      `Safety gates (issue #47) run after eligibility/tier routing, before\n` +
      `dispatch: B.2 lease (skip if already leased by another run), B.3\n` +
      `file-overlap (skip if declared \`touches\` overlap an in-flight task),\n` +
      `B.1 spend ceiling (skip once --max-cost-usd/--daily-cost-usd would be\n` +
      `exceeded — projected cost, not metered actual spend).\n\n` +
      `--dry-run is the DEFAULT — lists eligible tasks + computed tier/model\n` +
      `+ what the gates would block, dispatches nothing. Pass --apply to\n` +
      `actually open @claude issues.\n\n` +
      `Flags:\n` +
      `  --max N              cap dispatches per run (default ${DEFAULT_MAX})\n` +
      `  --max-cost-usd N     per-run projected-spend ceiling (default ${DEFAULT_PER_RUN_CEILING_USD})\n` +
      `  --daily-cost-usd N   daily projected-spend ceiling (default ${DEFAULT_DAILY_CEILING_USD})\n` +
      `  --lease-minutes N    lease TTL claimed before each dispatch (default ${DEFAULT_LEASE_MINUTES})\n` +
      `  --apply              perform the dispatch (default is dry-run/list-only)\n` +
      `  --dry-run            explicit no-op — same as the default\n` +
      `  --json               machine-readable output\n` +
      `  --help               print this usage and exit 0\n`,
  );
}

function fmtSelected(selected) {
  return selected
    .map(({ task, tier, model }) => `  ${task.key}  tier=${tier} model=${model}  "${task.title}"`)
    .join('\n');
}

function fmtBlocked(blocked, reasonKey) {
  return blocked
    .map(({ task, tier, model, ...rest }) => {
      const extra = reasonKey && rest[reasonKey] ? ` (${reasonKey}=${rest[reasonKey]})` : '';
      return `  ${task.key}  tier=${tier} model=${model}${extra}  "${task.title}"`;
    })
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

  const now = Date.now();
  let gates = {
    dispatchable: [],
    blockedByLease: [],
    blockedByOverlap: [],
    blockedByBudget: [],
    runTotalUsd: 0,
  };

  if (selected.length > 0) {
    let inFlightTasks;
    try {
      inFlightTasks = await fetchInFlightTasks(sb);
    } catch (err) {
      if (isMissingColumnError(err)) {
        console.log(
          `Lease/overlap columns are not present in this database yet — apply ` +
            `${LEASE_MIGRATION_HINT} in Supabase, then re-run. Exiting cleanly (no crash).`,
        );
        process.exit(0);
        return;
      }
      console.error(`Supabase in-flight query failed: ${err.message}`);
      process.exit(1);
      return;
    }

    const startOfTodayMs = new Date(now).setUTCHours(0, 0, 0, 0);
    const dailySpentUsd = sumSpendSince(readSpend(), startOfTodayMs);

    gates = applySafetyGates(selected, {
      now,
      inFlightTasks,
      dailySpentUsd,
      perRunCeilingUsd: args.perRunCeilingUsd,
      dailyCeilingUsd: args.dailyCeilingUsd,
    });
  }

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
          dispatchable: gates.dispatchable.map(({ task, tier, model, costUsd }) => ({
            key: task.key,
            title: task.title,
            tier,
            model,
            costUsd,
          })),
          blockedByLease: gates.blockedByLease.map(({ task }) => task.key),
          blockedByOverlap: gates.blockedByOverlap.map(({ task, conflictsWith }) => ({
            key: task.key,
            conflictsWith,
          })),
          blockedByBudget: gates.blockedByBudget.map(({ task, costUsd }) => ({
            key: task.key,
            costUsd,
          })),
          runTotalUsd: gates.runTotalUsd,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Eligible tasks: ${tasks.length} (auto_ok, no dispatch_url, status=open)`);
    if (selected.length === 0) {
      console.log('Nothing to dispatch.');
    } else {
      console.log(`Selected (capped at --max ${args.max}):`);
      console.log(fmtSelected(selected));
      if (gates.blockedByLease.length > 0) {
        console.log(`\nBlocked by lease (already claimed by another run):`);
        console.log(fmtBlocked(gates.blockedByLease));
      }
      if (gates.blockedByOverlap.length > 0) {
        console.log(`\nBlocked by file-overlap gate:`);
        console.log(fmtBlocked(gates.blockedByOverlap, 'conflictsWith'));
      }
      if (gates.blockedByBudget.length > 0) {
        console.log(`\nBlocked by spend ceiling (projected cost):`);
        console.log(fmtBlocked(gates.blockedByBudget, 'costUsd'));
      }
      console.log(
        `\nDispatchable: ${gates.dispatchable.length}/${selected.length} (projected run total: $${gates.runTotalUsd})`,
      );
    }
  }

  if (!args.apply) {
    if (!args.json) {
      console.log('\nDry run — no writes, no GitHub calls. Pass --apply to dispatch for real.');
    }
    process.exit(0);
    return;
  }

  if (gates.dispatchable.length === 0) {
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

  for (const { task, tier, model, costUsd } of gates.dispatchable) {
    if (dispatchedCount >= args.max) break; // guardrail: never exceed --max per run

    // B.2: claim the lease immediately before dispatch. A lost race (another
    // run claimed it between selection and here) is a clean skip, never a
    // double-write.
    const { claimed, error: claimErr } = await claimLease(sb, task.key, {
      owner: 'fleet-dispatch',
      ttlMinutes: args.leaseMinutes,
      now,
    });
    if (claimErr) {
      console.error(`${task.key}: lease claim failed — ${claimErr.message}`);
      continue;
    }
    if (!claimed) {
      console.log(`${task.key}: lease already held by another run — skipping.`);
      continue;
    }

    const nextCount = (task.dispatch_count ?? 0) + 1;
    const nowIso = new Date().toISOString();

    const { error: setErr } = await setTaskFields(sb, task.key, {
      tier,
      model,
      dispatch_status: 'dispatched',
      last_dispatched_at: nowIso,
      dispatch_count: nextCount,
    });
    if (setErr) {
      console.error(`${task.key}: failed to write routing fields — ${setErr.message}`);
      await releaseLease(sb, task.key);
      continue;
    }

    const result = await applyTaskAction(
      sb,
      { key: task.key, action: 'dispatch', actor: 'fleet-dispatch' },
      { github },
    );
    if (result.status !== 200) {
      console.error(`${task.key}: dispatch failed — ${result.body?.error ?? 'unknown error'}`);
      await releaseLease(sb, task.key);
      continue;
    }

    const dispatchUrl = result.body.dispatch_url;

    await notifyEvent({
      ts: nowIso,
      kind: 'dispatched',
      title: `${task.key}: ${task.title}`,
      detail: `tier=${tier} model=${model} costUsd=${costUsd}`,
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

    appendSpend({ ts: nowIso, task: task.key, tier, model, costUsd });

    await releaseLease(sb, task.key);

    dispatchedCount += 1;
    console.log(`${task.key}: dispatched — ${dispatchUrl}`);
  }

  console.log(`\nDispatched ${dispatchedCount}/${gates.dispatchable.length} dispatchable task(s).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
