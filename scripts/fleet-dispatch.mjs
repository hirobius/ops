#!/usr/bin/env node
/**
 * scripts/fleet-dispatch.mjs — headless fleet-mode dispatcher (epic #41, Slice 2
 * + Slice 6 close-out).
 *
 * The mayor's fleet-mode worker: scans the `tasks` board for rows Adrian has
 * opted into auto-dispatch (`auto_ok=true`, via the /ops/tasks toggle from
 * Slice 1), routes each through the deterministic `lib/tasks/tier.mjs`
 * tier→model directive, and opens an `@claude` GitHub issue for up to `--max`
 * of them per run. This is a Node script that files GitHub issues — it does
 * NOT spawn Claude sub-agents in-process; picking the issue up is GitHub's
 * `@claude` mention hand-off, scheduled separately by Adrian (mayor session).
 *
 * Slice 6 closes the gap Slice 3 named as out of scope: nothing previously
 * set `dispatch_status='queued'` automatically — a non-`auto_ok` task just
 * sat inert in the backlog until a human noticed it and clicked "Queue" on
 * /ops/tasks. Now every run also proposes up to `--queue-max` open,
 * not-yet-dispatched, non-`auto_ok` tasks into the `/admin/approvals` inbox —
 * completing issue #8's autonomy dial ("auto-ok tasks self-dispatch and only
 * recap; everything else queues for a click"). A task the operator explicitly
 * denies (`unqueue`, which resets `dispatch_status` to null) is never
 * re-queued automatically — `priorApprovalTaskKeys()` reads the committed
 * `docs/ops/events.jsonl` for a prior `approval_waiting` event on that task
 * key and treats it as "already seen, don't propose again"; the operator can
 * still re-queue it by hand or flip `auto_ok`.
 *
 * Reuses every piece built in prior slices rather than re-implementing:
 *   - lib/tasks/tier.mjs::routeTask       tier/model routing (Slice 1)
 *   - lib/tasks/actions.mjs::applyTaskAction  the 'dispatch'/'queue' actions
 *     already open the @claude issue / flip dispatch_status (Slice 1/3/pre)
 *   - lib/github/issues.mjs::makeGitHubPort   injected GitHub port
 *   - lib/supabase/tasks.mjs::setTaskFields   writes tier/model/dispatch_*
 *   - lib/ops/run-log.mjs::appendRun          run recap (#8)
 *   - lib/ops/notify.mjs::notifyEvent/readEvents  fleet timeline + Discord
 *     (Slice 4) — also doubles as the "already proposed" ledger for Slice 6
 *
 * Usage:
 *   node scripts/fleet-dispatch.mjs [--max N] [--queue-max N] [--json] [--apply] [--help]
 *
 * `--dry-run` is the DEFAULT — it lists eligible tasks + computed tier/model
 * and touches nothing (no writes, no GitHub calls). Pass `--apply` to
 * actually dispatch (write tier/model/dispatch_status back, open the
 * @claude issue, notify + log the run) AND queue (write
 * dispatch_status='queued', notify + log the run). `--max N` caps dispatches
 * per run (default 3); `--queue-max N` caps auto-queue proposals per run
 * (default 5) — both listing and writes respect their cap. `--json` prints
 * machine-readable output instead of the human summary.
 *
 * Dispatch eligibility: `auto_ok = true AND dispatch_url IS NULL AND status =
 * 'open'`. Queue eligibility: `auto_ok != true AND dispatch_url IS NULL AND
 * status = 'open' AND dispatch_status IS NULL AND` not already proposed
 * before. Already-dispatched rows (dispatch_url set) are never re-picked by
 * either pass — the eligibility filter is a guardrail against double-dispatch,
 * not just an optimization.
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
import { notifyEvent, readEvents } from '../lib/ops/notify.mjs';

export const DEFAULT_MAX = 3;
export const DEFAULT_QUEUE_MAX = 5;
export const MIGRATION_HINT = 'supabase/migrations/0008_task_dispatch.sql';
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

/** True when a Supabase/PostgREST error means a queried column doesn't exist. */
export function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message || '');
}

/**
 * Pure: filter a task list to the auto-queue eligibility rule (`auto_ok !==
 * true && !dispatch_url && status === 'open' && !dispatch_status && key not
 * in seenTaskKeys`), and cap the result at `max`. No network, no Date — safe
 * to unit test with plain stub objects.
 *
 * `seenTaskKeys` (a Set or iterable of task keys) excludes tasks already
 * proposed once before — this is what stops a denied task from being
 * re-queued on the next run.
 *
 * @param {Array<object>} tasks
 * @param {Iterable<string> | Set<string>} [seenTaskKeys]
 * @param {{ max?: number }} [opts]
 * @returns {Array<object>} the selected task rows
 */
export function selectToQueue(tasks, seenTaskKeys, { max = DEFAULT_QUEUE_MAX } = {}) {
  const cap = Number.isFinite(max) && max >= 0 ? max : DEFAULT_QUEUE_MAX;
  const seen = seenTaskKeys instanceof Set ? seenTaskKeys : new Set(seenTaskKeys ?? []);
  const eligible = (Array.isArray(tasks) ? tasks : []).filter(
    (t) =>
      t &&
      t.auto_ok !== true &&
      !t.dispatch_url &&
      t.status === 'open' &&
      !t.dispatch_status &&
      !seen.has(t.key),
  );
  return eligible.slice(0, cap);
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

/** Live queue-candidate fetch — the one non-pure piece `selectToQueue` feeds from. */
async function fetchQueueCandidates(sb) {
  const { data, error } = await sb
    .from('tasks')
    .select('*')
    .is('dispatch_url', null)
    .eq('status', 'open')
    .is('dispatch_status', null)
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/** Task keys that have already had an `approval_waiting` event posted for them. */
function priorApprovalTaskKeys() {
  return new Set(
    readEvents()
      .filter((e) => e.kind === 'approval_waiting' && e.task)
      .map((e) => e.task),
  );
}

function parseArgs(argv) {
  const o = {
    max: DEFAULT_MAX,
    queueMax: DEFAULT_QUEUE_MAX,
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
      case '--queue-max':
        o.queueMax = Number(argv[++i]);
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
    `scripts/fleet-dispatch.mjs — headless fleet-mode dispatcher (#41 Slice 2 + 6)\n\n` +
      `Usage:\n` +
      `  node scripts/fleet-dispatch.mjs [--max N] [--queue-max N] [--json] [--apply]\n\n` +
      `Dispatch eligibility: auto_ok=true AND dispatch_url IS NULL AND status='open'.\n` +
      `Queue eligibility: auto_ok!=true AND dispatch_url IS NULL AND status='open' AND\n` +
      `dispatch_status IS NULL AND never proposed before (docs/ops/events.jsonl).\n` +
      `--dry-run is the DEFAULT — lists both, writes nothing. Pass --apply to\n` +
      `actually open @claude issues (dispatch pass) and propose tasks into\n` +
      `/admin/approvals (queue pass).\n\n` +
      `Flags:\n` +
      `  --max N        cap dispatches per run (default ${DEFAULT_MAX})\n` +
      `  --queue-max N  cap auto-queue proposals per run (default ${DEFAULT_QUEUE_MAX})\n` +
      `  --apply        perform the writes (default is dry-run/list-only)\n` +
      `  --dry-run      explicit no-op — same as the default\n` +
      `  --json         machine-readable output\n` +
      `  --help         print this usage and exit 0\n`,
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
  let queueCandidates;
  try {
    tasks = await fetchEligibleTasks(sb);
    queueCandidates = await fetchQueueCandidates(sb);
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
  const toQueue = selectToQueue(queueCandidates, priorApprovalTaskKeys(), { max: args.queueMax });

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          eligibleCount: tasks.length,
          max: args.max,
          queueMax: args.queueMax,
          apply: args.apply,
          selected: selected.map(({ task, tier, model }) => ({
            key: task.key,
            title: task.title,
            tier,
            model,
          })),
          toQueue: toQueue.map((task) => ({ key: task.key, title: task.title })),
        },
        null,
        2,
      ),
    );
  } else {
    console.log(`Eligible to dispatch: ${tasks.length} (auto_ok, no dispatch_url, status=open)`);
    if (selected.length === 0) {
      console.log('Nothing to dispatch.');
    } else {
      console.log(`Selected to dispatch (capped at --max ${args.max}):`);
      console.log(fmtSelected(selected));
    }
    console.log(
      `\nEligible to queue for approval: ${queueCandidates.length} ` +
        `(non-auto_ok, no dispatch_url, status=open, never proposed before)`,
    );
    if (toQueue.length === 0) {
      console.log('Nothing new to queue.');
    } else {
      console.log(`Selected to queue (capped at --queue-max ${args.queueMax}):`);
      console.log(toQueue.map((t) => `  ${t.key}  "${t.title}"`).join('\n'));
    }
  }

  if (!args.apply) {
    if (!args.json) {
      console.log(
        '\nDry run — no writes, no GitHub calls. Pass --apply to dispatch/queue for real.',
      );
    }
    process.exit(0);
    return;
  }

  // Auto-queue pass first — no GitHub token needed, so it always runs on
  // --apply even if the dispatch pass below can't (e.g. GITHUB_TOKEN unset).
  let queuedCount = 0;
  for (const task of toQueue) {
    const nowIso = new Date().toISOString();

    const result = await applyTaskAction(
      sb,
      { key: task.key, action: 'queue', actor: 'fleet-dispatch' },
      {},
    );
    if (result.status !== 200) {
      console.error(`${task.key}: queue failed — ${result.body?.error ?? 'unknown error'}`);
      continue;
    }

    await notifyEvent({
      ts: nowIso,
      kind: 'approval_waiting',
      title: `${task.key}: ${task.title}`,
      task: task.key,
    });

    appendRun({
      ts: nowIso,
      actor: 'fleet-dispatch',
      task: task.key,
      outcome: 'queued',
      summary: 'proposed for approval — awaiting a human click in /admin/approvals',
    });

    queuedCount += 1;
    console.log(`${task.key}: queued for approval`);
  }
  if (toQueue.length > 0) {
    console.log(`Queued ${queuedCount}/${toQueue.length} proposed task(s) for approval.`);
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
      continue;
    }

    const result = await applyTaskAction(
      sb,
      { key: task.key, action: 'dispatch', actor: 'fleet-dispatch' },
      { github },
    );
    if (result.status !== 200) {
      console.error(`${task.key}: dispatch failed — ${result.body?.error ?? 'unknown error'}`);
      continue;
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

    dispatchedCount += 1;
    console.log(`${task.key}: dispatched — ${dispatchUrl}`);
  }

  console.log(`\nDispatched ${dispatchedCount}/${selected.length} selected task(s).`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
