#!/usr/bin/env node
/**
 * scripts/check-unit-overlap.mjs — file-overlap gate (issue #47, B.3).
 *
 * Revives the one genuinely agent-safety guardrail the old orchestration
 * tooling had (deleted in `662d94c`, registry entry deleted in `806e25f`):
 * a pre-dispatch gate that refuses to let two in-flight agent sessions touch
 * the same file paths. `scripts/fleet-dispatch.mjs`'s `applySafetyGates`
 * already runs this check automatically before every `--apply` dispatch
 * (via `lib/tasks/overlap.mjs::partitionByOverlap`) — this CLI is the
 * on-demand audit: a human (or CI) can check current in-flight state
 * without running a dispatch.
 *
 * Read-only — never writes. Reports every pair of in-flight (dispatched,
 * not done/blocked) tasks whose declared `touches` (migration 0009) overlap.
 * A task with no `touches` declared can never appear in a pair (see
 * lib/tasks/overlap.mjs's module doc — that's a known gap, not a false-safe).
 *
 * Usage:
 *   node scripts/check-unit-overlap.mjs [--json] [--help]
 *
 * Exit codes: 0 — no overlaps found; 1 — at least one overlap found (so this
 * CAN be wired into a stricter channel later, per docs/guardrails/registry.json).
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { listTasks } from '../lib/supabase/tasks.mjs';
import { findAllOverlaps } from '../lib/tasks/overlap.mjs';

const TASK_DISPATCH_MIGRATION_HINT = 'supabase/migrations/0008_task_dispatch.sql';
export const MIGRATION_HINT = 'supabase/migrations/0009_task_lease_touches.sql';

function parseArgs(argv) {
  const o = { json: false, help: false };
  for (const arg of argv) {
    if (arg === '--json') o.json = true;
    else if (arg === '--help' || arg === '-h') o.help = true;
    else {
      console.error(`Unknown flag: ${arg}`);
      o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    `scripts/check-unit-overlap.mjs — file-overlap gate audit (issue #47, B.3)\n\n` +
      `Usage:\n` +
      `  node scripts/check-unit-overlap.mjs [--json]\n\n` +
      `Read-only. Reports every pair of in-flight (dispatch_status='dispatched',\n` +
      `status not in done/blocked) tasks whose declared \`touches\` overlap.\n` +
      `This is the same check scripts/fleet-dispatch.mjs runs automatically\n` +
      `before every --apply dispatch — use this CLI to audit current state\n` +
      `on demand.\n\n` +
      `Flags:\n` +
      `  --json   machine-readable output\n` +
      `  --help   print this usage and exit 0\n`,
  );
}

/** True when a Supabase/PostgREST error means a queried column doesn't exist. */
export function isMissingColumnError(error) {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /column .* does not exist/i.test(error.message || '');
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
        `Fleet dispatch columns are not present in this database yet — apply ` +
          `${TASK_DISPATCH_MIGRATION_HINT} and ${MIGRATION_HINT} in Supabase, then ` +
          `re-run. Exiting cleanly (no crash).`,
      );
      process.exit(0);
      return;
    }
    console.error(`Supabase query failed: ${err.message}`);
    process.exit(1);
    return;
  }

  const inFlight = tasks.filter(
    (t) => t.dispatch_status === 'dispatched' && t.status !== 'done' && t.status !== 'blocked',
  );
  const overlaps = findAllOverlaps(inFlight);

  if (args.json) {
    console.log(JSON.stringify({ inFlightCount: inFlight.length, overlaps }, null, 2));
  } else {
    console.log(`In-flight tasks: ${inFlight.length}`);
    if (overlaps.length === 0) {
      console.log('No file-overlap conflicts.');
    } else {
      console.log(`Overlapping pairs (${overlaps.length}):`);
      for (const { a, b } of overlaps) console.log(`  ${a}  <->  ${b}`);
    }
  }

  process.exit(overlaps.length === 0 ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
  });
}
