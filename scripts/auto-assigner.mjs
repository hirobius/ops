#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/auto-assigner.mjs
 *
 * Tier-aware task router. Classifies free-text input via local gemma4:e4b,
 * derives tier + model + cost ceiling deterministically, mutates the target
 * task in clients/<slug>/tasks.json, and appends an audit entry to
 * docs/ai/routing-log.jsonl.
 *
 * Replaces the "Ramble Processor" concept — input classification is folded
 * into the assigner's first pass.
 *
 * Usage:
 *   echo "Set up Outlook auto-responder for Lilac" | \
 *     node scripts/auto-assigner.mjs --client lilac-insure
 *
 *   echo "..." | node scripts/auto-assigner.mjs --client lilac-insure --phase phase-2
 *
 *   node scripts/auto-assigner.mjs --task-id ai-1 --client lilac-insure
 *
 *   node scripts/auto-assigner.mjs --task-id ai-1 --client lilac-insure \
 *     --force-tier closed-frontier --force-model sonnet-4-6
 *
 * Exit codes:
 *   0 — routed
 *   2 — not-a-task (input was conversational, memory-style, etc.)
 *   3 — ambiguous (needs human disambiguation)
 *   4 — over budget (projected cost exceeds task or global ceiling)
 *   1 — runtime error (Ollama unreachable, missing model, file IO, etc.)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROUTING_LOG = resolve(ROOT, 'docs/ai/routing-log.jsonl');
const OLLAMA_ENDPOINT = process.env.OLLAMA_HOST
  ? `${process.env.OLLAMA_HOST.replace(/\/$/, '')}/api/chat`
  : 'http://localhost:11434/api/chat';
const ROUTER_MODEL = process.env.ASSIGNER_MODEL || 'gemma4:e4b';
const ASSIGNER_VERSION = 'auto-assigner-v1';

// ---------- model + tier tables ----------------------------------------------

// USD per 1M tokens. Local Ollama models = 0. Remote/closed are rough 2026
// estimates; update when prices shift. Effort multiplier turns this into a
// projected ceiling per task.
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

const TIER_OF_MODEL = {
  'gemma4:e4b':            'open-local',
  'gemma4:26b':            'open-local',
  'hermes3':               'open-local',
  'qwen2.5-coder:14b-hds': 'open-local',
  'haiku-4-5':             'closed-frontier',
  'sonnet-4-6':            'closed-frontier',
  'opus-4-7':              'closed-frontier',
};

function pickTier({ privacy, capability }) {
  if (privacy === 'high') return 'open-local';
  if (capability === 'advanced' && privacy !== 'high') return 'closed-frontier';
  if (capability === 'moderate') return 'closed-frontier';
  return 'open-local';
}

function pickModel(tier, effort) {
  if (tier === 'open-local') return effort === 'min' ? 'gemma4:e4b' : 'gemma4:26b';
  if (tier === 'closed-frontier') {
    // Adrian directive 2026-05-04: haiku is removed from autonomous dispatch.
    // Defect rate (cache-first SW, wrong-framework imports, fabricated input
    // files, invalid token paths) cost more in repairs than dispatch saved.
    // 'min' effort routes to sonnet, not haiku. Haiku is reserved for human
    // ideation / scratch-pad use only. See CLAUDE.md §Model selection.
    if (effort === 'high') return 'opus-4-7';
    return 'sonnet-4-6';
  }
  throw new Error(`Unknown tier: ${tier}`);
}

function projectedCostUsd(model, effort) {
  const price = PRICE_PER_M_TOKENS[model];
  if (price === undefined) throw new Error(`No price entry for model: ${model}`);
  return (price * EFFORT_TOKENS[effort]) / 1_000_000;
}

// ---------- ollama client ---------------------------------------------------

const CLASSIFIER_SYSTEM = `You are a task-routing classifier for an AI ops platform.
Given free-text input from the operator, output STRICT JSON with these fields:

{
  "verdict": "task" | "not-task" | "ambiguous",
  "title": "<concise imperative title, max 90 chars; null if not-task>",
  "privacy": "low" | "medium" | "high",
  "capability": "simple" | "moderate" | "advanced",
  "effort": "min" | "standard" | "high",
  "reason": "<one sentence explaining the privacy + capability call>"
}

Rules:
- "task" means the input describes work that should be done. "not-task" means it's
  a thought, log entry, status update, or chitchat. "ambiguous" means you cannot
  tell — the operator will be asked to clarify.
- "privacy" = "high" if the work touches client data, private inboxes, internal
  contracts, or anything that should not leave the operator's controlled
  environment. "low" for public-facing or generic dev work. "medium" otherwise.
- "capability" = "simple" for mechanical edits, formatting, scrubs.
  "moderate" for component work, schema extension, single-source scripts.
  "advanced" for cross-cutting refactors, novel logic, architectural
  reasoning, AND research / competitive analysis / multi-source synthesis
  (anything that needs to weigh trade-offs across distinct sources, draw
  conclusions, or produce strategic recommendations — those need frontier
  reasoning, not local-tier classification).
- "effort" = rough size: "min" (under 30 min), "standard" (1-3 hours),
  "high" (multi-session, ambiguous scope).
- Output ONLY the JSON object. No prose, no fences, no preamble.`;

async function classify(text) {
  const response = await fetch(OLLAMA_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ROUTER_MODEL,
      stream: false,
      format: 'json',
      options: { temperature: 0.1 },
      messages: [
        { role: 'system', content: CLASSIFIER_SYSTEM },
        { role: 'user', content: text },
      ],
    }),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Ollama classify failed (${response.status}): ${body || response.statusText}`);
  }
  const data = await response.json();
  const content = data?.message?.content;
  if (!content) throw new Error('Ollama returned empty classification');
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (_error) {
    throw new Error(`Classifier returned non-JSON: ${content.slice(0, 200)}`);
  }
  validateClassification(parsed);
  return parsed;
}

function validateClassification(c) {
  const enums = {
    verdict:    ['task', 'not-task', 'ambiguous'],
    privacy:    ['low', 'medium', 'high'],
    capability: ['simple', 'moderate', 'advanced'],
    effort:     ['min', 'standard', 'high'],
  };
  for (const [field, allowed] of Object.entries(enums)) {
    if (c.verdict === 'not-task' && field !== 'verdict') continue;
    if (!allowed.includes(c[field])) {
      throw new Error(`Classifier returned invalid ${field}: ${JSON.stringify(c[field])}`);
    }
  }
}

// ---------- argument parsing ------------------------------------------------

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

async function readStdin() {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) return resolve('');
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data.trim()));
    process.stdin.on('error', reject);
  });
}

// ---------- tasks.json mutation --------------------------------------------

function loadTasks(clientSlug) {
  const path = resolve(ROOT, `clients/${clientSlug}/tasks.json`);
  if (!existsSync(path)) {
    throw new Error(`tasks.json not found for client "${clientSlug}" at ${path}`);
  }
  return { path, data: JSON.parse(readFileSync(path, 'utf8')) };
}

function saveTasks(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

function findTaskById(data, taskId) {
  for (const phase of data.phases ?? []) {
    if (phase.swimlanes) {
      for (const lane of phase.swimlanes) {
        const task = (lane.tasks ?? []).find((t) => t.id === taskId);
        if (task) return { task, phase, swimlane: lane };
      }
    }
    const task = (phase.tasks ?? []).find((t) => t.id === taskId);
    if (task) return { task, phase, swimlane: null };
  }
  return null;
}

function appendNewTask(data, phaseId, taskTemplate) {
  const phase = phaseId
    ? (data.phases ?? []).find((p) => p.id === phaseId)
    : (data.phases ?? []).find((p) => p.status === 'in-progress') ?? data.phases?.[0];
  if (!phase) throw new Error(`No phase available to append task (phaseId=${phaseId ?? 'auto'})`);

  const targetList = phase.swimlanes?.length
    ? (phase.swimlanes[phase.swimlanes.length - 1].tasks ??= [])
    : (phase.tasks ??= []);

  targetList.push(taskTemplate);
  return phase;
}

function applyRouting(task, routing) {
  task.assignee          = routing.assignee;
  task.model             = routing.model;
  task.effort            = routing.effort;
  task.costCeiling       = routing.costCeiling;
  task.costSpent         = task.costSpent ?? 0;
  task.routedBy          = ASSIGNER_VERSION;
  task.routedAt          = routing.routedAt;
  task.routingRationale  = routing.routingRationale;
  task.dispatchState     = 'queued';
}

// ---------- audit log -------------------------------------------------------

function appendAuditEntry(entry) {
  const line = JSON.stringify({ ...entry, at: new Date().toISOString() });
  appendFileSync(ROUTING_LOG, `${line}\n`);
}

// ---------- main ------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const clientSlug = args.client;
  if (!clientSlug) {
    console.error('error: --client <slug> is required');
    process.exit(1);
  }

  const { path: tasksPath, data: tasksData } = loadTasks(clientSlug);

  let inputText;
  let targetTask;
  let phase;
  let createdNew = false;

  if (args['task-id']) {
    const found = findTaskById(tasksData, args['task-id']);
    if (!found) {
      console.error(`error: task ${args['task-id']} not found in client ${clientSlug}`);
      process.exit(1);
    }
    targetTask = found.task;
    phase = found.phase;
    inputText = `${targetTask.title}${targetTask.notes ? `\n\nNotes: ${targetTask.notes}` : ''}`;
  } else {
    inputText = await readStdin();
    if (!inputText) {
      console.error('error: no stdin input and no --task-id provided');
      process.exit(1);
    }
  }

  const classification = await classify(inputText);

  if (classification.verdict === 'not-task') {
    appendAuditEntry({
      assigner: ASSIGNER_VERSION,
      client: clientSlug,
      verdict: 'not-task',
      input: inputText.slice(0, 500),
      reason: classification.reason,
    });
    console.log(JSON.stringify({ verdict: 'not-task', reason: classification.reason }, null, 2));
    process.exit(2);
  }

  if (classification.verdict === 'ambiguous') {
    appendAuditEntry({
      assigner: ASSIGNER_VERSION,
      client: clientSlug,
      verdict: 'ambiguous',
      input: inputText.slice(0, 500),
      reason: classification.reason,
    });
    console.log(JSON.stringify({ verdict: 'ambiguous', reason: classification.reason }, null, 2));
    process.exit(3);
  }

  // task verdict — derive tier, model, ceiling
  const forcedTier  = args['force-tier']  || null;
  const forcedModel = args['force-model'] || null;

  const tier  = forcedTier  ?? pickTier(classification);
  const model = forcedModel ?? pickModel(tier, classification.effort);

  if (TIER_OF_MODEL[model] && TIER_OF_MODEL[model] !== tier) {
    console.error(
      `error: forced model ${model} belongs to tier ${TIER_OF_MODEL[model]}, ` +
      `not requested tier ${tier}`,
    );
    process.exit(1);
  }

  const projected   = projectedCostUsd(model, classification.effort);
  const costCeiling = Number((projected * 1.25).toFixed(4));  // 25% headroom
  const routedAt    = new Date().toISOString();

  const routingRationale =
    `${classification.reason} ` +
    `Routed to ${tier}/${model} at ${classification.effort} effort ` +
    `(privacy=${classification.privacy}, capability=${classification.capability}).`;

  // hydrate or create the target task
  if (!targetTask) {
    const newId = `t-${Date.now().toString(36)}`;
    targetTask = {
      id:       newId,
      title:    classification.title || inputText.slice(0, 90),
      status:   'todo',
      owner:    'Adrian',
      notes:    inputText !== classification.title ? inputText : undefined,
    };
    phase = appendNewTask(tasksData, args.phase, targetTask);
    createdNew = true;
  }

  applyRouting(targetTask, {
    assignee:         model,
    model,
    effort:           classification.effort,
    costCeiling,
    routedAt,
    routingRationale,
  });

  saveTasks(tasksPath, tasksData);

  appendAuditEntry({
    assigner: ASSIGNER_VERSION,
    client:   clientSlug,
    verdict:  'task',
    taskId:   targetTask.id,
    phaseId:  phase?.id,
    createdNew,
    tier,
    model,
    effort:        classification.effort,
    privacy:       classification.privacy,
    capability:    classification.capability,
    projectedUsd:  projected,
    costCeiling,
    forcedTier,
    forcedModel,
    rationale:     routingRationale,
    inputDigest:   inputText.slice(0, 500),
  });

  console.log(JSON.stringify({
    verdict:   'task',
    taskId:    targetTask.id,
    title:     targetTask.title,
    phaseId:   phase?.id,
    createdNew,
    tier,
    model,
    effort:    classification.effort,
    costCeiling,
    routedAt,
    rationale: routingRationale,
    client:    clientSlug,
  }, null, 2));
  process.exit(0);
}

main().catch((error) => {
  console.error(`auto-assigner error: ${error.message}`);
  process.exit(1);
});
