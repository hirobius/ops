#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/cost-ceiling-gate.mjs
 *
 * Hard cost ceiling enforcement. Refuses dispatch when
 * `task.costSpent + projected > task.costCeiling` (USD).
 *
 * Local-tier tasks default to costCeiling: 0 with projected: 0, so the gate
 * is a no-op for them. Paid tiers compute projected from model + effort
 * against the price table.
 *
 * Use as a CLI before dispatching a task:
 *   node scripts/cost-ceiling-gate.mjs --client lilac-insure --task-id ai-1
 *
 * Or import from another dispatcher (swarm.mjs, discord-bot.mjs, etc.):
 *   import { checkCeiling } from './cost-ceiling-gate.mjs';
 *   const result = await checkCeiling({ clientSlug, taskId });
 *   if (!result.cleared) { ... refuse ... }
 *
 * Exit codes:
 *   0 — cleared, dispatch may proceed
 *   1 — runtime error (task missing, etc.)
 *   4 — rejected (over budget). Task is mutated to dispatchState: 'failed'.
 */

import { readFileSync, writeFileSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(__filename), '..');
const ROUTING_LOG = resolve(ROOT, 'docs/ai/routing-log.jsonl');
const GATE_VERSION = 'cost-ceiling-gate-v1';

// Mirror of the assigner's price table. Keep in sync; duplicate is intentional
// at this scale (4 paid models, two scripts) — extract to lib/ when a third
// consumer appears.
const PRICE_PER_M_TOKENS = {
  'gemma4:e4b':              0,
  'gemma4:26b':              0,
  'hermes3':                 0,
  'qwen2.5-coder:14b-hds':   0,
  'haiku-4-5':               1.00,
  'sonnet-4-6':              3.00,
  'opus-4-7':               15.00,
};
const EFFORT_TOKENS = { min: 2_000, standard: 8_000, high: 30_000 };

function projectedCostUsd(model, effort) {
  const price = PRICE_PER_M_TOKENS[model];
  if (price === undefined) return null;
  const tokens = EFFORT_TOKENS[effort] ?? EFFORT_TOKENS.standard;
  return (price * tokens) / 1_000_000;
}

function loadTasks(clientSlug) {
  const path = resolve(ROOT, `clients/${clientSlug}/tasks.json`);
  const data = JSON.parse(readFileSync(path, 'utf8'));
  return { path, data };
}

function saveTasks(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function findTaskById(data, taskId) {
  for (const phase of data.phases ?? []) {
    if (phase.swimlanes) {
      for (const lane of phase.swimlanes) {
        const task = (lane.tasks ?? []).find((t) => t.id === taskId);
        if (task) return task;
      }
    }
    const task = (phase.tasks ?? []).find((t) => t.id === taskId);
    if (task) return task;
  }
  return null;
}

function appendAuditEntry(entry) {
  const line = JSON.stringify({ ...entry, at: new Date().toISOString() });
  appendFileSync(ROUTING_LOG, `${line}\n`);
}

/**
 * Check whether dispatching the given task would exceed its cost ceiling.
 * Mutates `task.dispatchState` to 'failed' on rejection (and persists).
 * Returns { cleared, projected, ceiling, spent, reason? }.
 */
export async function checkCeiling({ clientSlug, taskId, projectedOverride }) {
  if (!clientSlug) throw new Error('checkCeiling: clientSlug is required');
  if (!taskId) throw new Error('checkCeiling: taskId is required');

  const { path, data } = loadTasks(clientSlug);
  const task = findTaskById(data, taskId);
  if (!task) throw new Error(`Task ${taskId} not found in client ${clientSlug}`);

  if (!task.model || !task.effort) {
    throw new Error(`Task ${taskId} has no model/effort — route it first.`);
  }

  const projected = projectedOverride ?? projectedCostUsd(task.model, task.effort);
  if (projected === null) {
    throw new Error(`Unknown price for model ${task.model}; cannot project cost.`);
  }

  const spent   = task.costSpent ?? 0;
  const ceiling = task.costCeiling ?? 0;
  const total   = spent + projected;
  const cleared = total <= ceiling;

  if (!cleared) {
    task.dispatchState = 'failed';
    task.lastDispatchAt = new Date().toISOString();
    saveTasks(path, data);
    appendAuditEntry({
      gate:   GATE_VERSION,
      client: clientSlug,
      taskId,
      model:  task.model,
      effort: task.effort,
      spent,
      projected,
      ceiling,
      verdict: 'rejected',
      reason: 'cost-ceiling-exceeded',
    });
    return { cleared: false, projected, ceiling, spent, reason: 'cost-ceiling-exceeded' };
  }

  appendAuditEntry({
    gate:   GATE_VERSION,
    client: clientSlug,
    taskId,
    model:  task.model,
    effort: task.effort,
    spent,
    projected,
    ceiling,
    verdict: 'cleared',
  });
  return { cleared: true, projected, ceiling, spent };
}

// ---------- CLI -------------------------------------------------------------

function parseArgs(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      parsed[key] = next;
      i += 1;
    } else {
      parsed[key] = true;
    }
  }
  return parsed;
}

async function cli() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.client || !args['task-id']) {
    console.error('usage: cost-ceiling-gate --client <slug> --task-id <id> [--projected <usd>]');
    process.exit(1);
  }
  const projectedOverride = args.projected ? Number(args.projected) : undefined;
  const result = await checkCeiling({
    clientSlug: args.client,
    taskId: args['task-id'],
    projectedOverride,
  });
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.cleared ? 0 : 4);
}

if (process.argv[1] && resolve(process.argv[1]) === __filename) {
  cli().catch((error) => {
    console.error(`cost-ceiling-gate error: ${error.message}`);
    process.exit(1);
  });
}
