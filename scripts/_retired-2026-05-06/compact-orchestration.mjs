#!/usr/bin/env node
/**
 * scripts/compact-orchestration.mjs
 *
 * Compacts done units in docs/ai/orchestration.json.
 *
 * Done units retain load-bearing fields; verbose metadata
 * (validationCmd, agentNotes, description, history, etc.) is dropped
 * because it is no longer load-bearing once a unit is done.
 *
 * Keeps for status:done:
 *   id, status, name, cluster, phase, tier, model, completedAt, dependsOn
 *
 * Active units are kept verbatim.
 *
 * A pre-compact snapshot is written to
 *   docs/ai/snapshots/orchestration-pre-compact-<UTC-TS>.json
 *
 * Usage:
 *   node scripts/compact-orchestration.mjs        # apply
 *   node scripts/compact-orchestration.mjs --check # dry-run / check only
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH = path.join(ROOT, 'docs/ai/orchestration.json');
const SNAPSHOTS = path.join(ROOT, 'docs/ai/snapshots');

const KEEP_DONE_FIELDS = new Set([
  'id',
  'status',
  'name',
  'cluster',
  'phase',
  'tier',
  'model',
  'completedAt',
  'dependsOn',
]);

const isCheck = process.argv.includes('--check');

function loadOrchestration() {
  const raw = fs.readFileSync(ORCH, 'utf8');
  const db = JSON.parse(raw);
  if (!db || typeof db !== 'object' || !Array.isArray(db.units)) {
    console.error('✗ compact-orchestration: orchestration.json missing top-level "units" array');
    process.exit(1);
  }
  return db;
}

function main() {
  if (!fs.existsSync(ORCH)) {
    console.error(`✗ compact-orchestration: ${ORCH} not found`);
    process.exit(1);
  }

  const db = loadOrchestration();
  const units = db.units;

  const beforeLines = fs.readFileSync(ORCH, 'utf8').split('\n').length;
  const beforeBytes = fs.statSync(ORCH).size;

  const originalDb = JSON.parse(JSON.stringify(db)); // deep clone for snapshot

  let compacted = 0;
  let keptFull = 0;
  for (const u of units) {
    if (u.status === 'done') {
      for (const key of Object.keys(u)) {
        if (!KEEP_DONE_FIELDS.has(key)) {
          delete u[key];
        }
      }
      compacted += 1;
    } else {
      keptFull += 1;
    }
  }

  if (isCheck) {
    const serialized = JSON.stringify(db, null, 2) + '\n';
    const afterBytes = Buffer.byteLength(serialized, 'utf8');
    const afterLines = serialized.split('\n').length;
    console.log(`CHECK — would compact ${compacted} done units; keep ${keptFull} active full`);
    console.log(`  before: ${beforeLines.toString().padStart(5)} lines / ${beforeBytes.toString().padStart(7)} bytes`);
    console.log(`  after:  ${afterLines.toString().padStart(5)} lines / ${afterBytes.toString().padStart(7)} bytes`);
    const savedLines = beforeLines - afterLines;
    const savedPct = beforeLines > 0 ? Math.floor((100 * savedLines) / beforeLines) : 0;
    console.log(`  saved:  ${savedLines} lines (${savedPct}%)`);
    process.exit(0);
  }

  // Snapshot pre-compact state.
  const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, -4) + 'Z';
  fs.mkdirSync(SNAPSHOTS, { recursive: true });
  const snapshotPath = path.join(SNAPSHOTS, `orchestration-pre-compact-${ts}.json`);
  fs.writeFileSync(snapshotPath, JSON.stringify(originalDb, null, 2) + '\n', 'utf8');
  console.log(`snapshot: ${path.relative(ROOT, snapshotPath)}`);

  // Atomic write of compacted form.
  const tmp = ORCH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, ORCH);

  const afterLines = fs.readFileSync(ORCH, 'utf8').split('\n').length;
  const afterBytes = fs.statSync(ORCH).size;

  console.log(`compacted ${compacted} done units; kept ${keptFull} active full`);
  console.log(`  before: ${beforeLines.toString().padStart(5)} lines / ${beforeBytes.toString().padStart(7)} bytes`);
  console.log(`  after:  ${afterLines.toString().padStart(5)} lines / ${afterBytes.toString().padStart(7)} bytes`);
  const savedLines = beforeLines - afterLines;
  const savedPct = beforeLines > 0 ? Math.floor((100 * savedLines) / beforeLines) : 0;
  console.log(`  saved:  ${savedLines} lines (${savedPct}%)`);
}

main();
