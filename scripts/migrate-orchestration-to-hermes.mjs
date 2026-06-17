#!/usr/bin/env node
/**
 * scripts/migrate-orchestration-to-hermes.mjs
 *
 * Pushes outstanding orchestration.json units into the Hermes Kanban board.
 *
 * Status mapping:
 *   approved       → ready   (dispatcher can pick up immediately)
 *   parked         → todo    (acknowledged, not yet prioritized)
 *   needs-grilling → triage  (needs review before work starts)
 *
 * Usage:
 *   node scripts/migrate-orchestration-to-hermes.mjs          # dry-run (safe)
 *   node scripts/migrate-orchestration-to-hermes.mjs --execute # create tasks in Hermes
 *
 * Requires: hermes CLI on PATH with kanban plugin running locally.
 * Hard rules: never push, never touch .env*.
 */

import { readFileSync } from 'node:fs';
import { execSync }     from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT       = join(dirname(__filename), '..');
const EXECUTE    = process.argv.includes('--execute');

const orchestration = JSON.parse(
  readFileSync(join(ROOT, 'docs/ai/orchestration.json'), 'utf8'),
);
const units = orchestration.units;

const STATUS_MAP = {
  'approved':       'ready',
  'parked':         'todo',
  'needs-grilling': 'triage',
};

const targets = units.filter((u) => u.status in STATUS_MAP);

console.log(`\nOrchestration → Hermes migration`);
console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'dry-run'}`);
console.log(`Units to migrate: ${targets.length}\n`);

const results = [];

for (const unit of targets) {
  const hermesStatus = STATUS_MAP[unit.status];
  const title        = (unit.name ?? unit.title ?? unit.id).trim();

  // Build body — store unit ID so the UI can cross-reference if needed later.
  const bodyParts = [`Orch-Unit: ${unit.id}`];
  if (unit.description)         bodyParts.push('', unit.description);
  if (unit.validationCmd)       bodyParts.push('', `Validation: ${unit.validationCmd}`);
  if (unit.agentNotes?.length) {
    bodyParts.push('', 'Agent notes:');
    for (const note of unit.agentNotes) bodyParts.push(`- ${note}`);
  }
  if (unit.dependsOn?.length) {
    bodyParts.push('', `Depends on: ${unit.dependsOn.join(', ')}`);
  }
  const body = bodyParts.join('\n').trim();

  if (!EXECUTE) {
    console.log(`  [dry-run] ${unit.status.padEnd(15)} → ${hermesStatus.padEnd(7)} ${title}`);
    results.push({ unitId: unit.id, hermesStatus, title, taskId: null });
    continue;
  }

  // Step 1: create in triage (only safe creation status)
  let createOut;
  try {
    createOut = execSync(
      `hermes kanban create ${q(title)} --triage --created-by adrian --body ${q(body)}`,
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
  } catch (err) {
    console.error(`  ✖ create failed for ${unit.id}: ${err.stderr ?? err.message}`);
    results.push({ unitId: unit.id, hermesStatus, title, taskId: null, error: 'create-failed' });
    continue;
  }

  const match = createOut.match(/Created\s+(t_[a-z0-9]+)/);
  if (!match) {
    console.error(`  ✖ could not parse task ID for ${unit.id}:\n    ${createOut}`);
    results.push({ unitId: unit.id, hermesStatus, title, taskId: null, error: 'parse-failed' });
    continue;
  }
  const taskId = match[1];

  // Step 2: move to target status if not triage
  if (hermesStatus !== 'triage') {
    try {
      execSync(`hermes kanban move ${taskId} ${hermesStatus}`, { cwd: ROOT, encoding: 'utf8' });
    } catch (err) {
      console.warn(`  ⚠ created ${taskId} but move to ${hermesStatus} failed: ${err.stderr ?? err.message}`);
    }
  }

  console.log(`  ✓ ${unit.id.padEnd(50)} → ${taskId} (${hermesStatus})`);
  results.push({ unitId: unit.id, hermesStatus, title, taskId });
}

console.log('');
if (!EXECUTE) {
  console.log(`Dry-run complete. Run with --execute to create ${targets.length} tasks in Hermes.`);
  console.log('Requires: hermes CLI on PATH + kanban plugin running locally (default port 7717).');
} else {
  const ok  = results.filter((r) => r.taskId).length;
  const err = results.filter((r) => r.error).length;
  console.log(`Done. ${ok} created, ${err} failed.`);
  if (ok > 0) {
    console.log('\nMapping (unit_id → hermes_task_id):');
    for (const r of results.filter((r) => r.taskId)) {
      console.log(`  ${r.unitId.padEnd(50)} ${r.taskId}`);
    }
  }
}

function q(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
