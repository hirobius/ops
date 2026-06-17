#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/test-figma-masters-snapshot.mjs
 *
 * Visual-regression baseline for pipeline/figma-masters-batch.mjs. The
 * pipeline is a pure JS→JSON projection (no Figma APIs called from
 * Node), so we capture buildMastersBatch() output as canonical JSON and
 * fail any time it diverges from the committed baseline.
 *
 * 8v-3 rewrote the pipeline to project from manifest slots[]; rather
 * than retroactively reconstructing the pre-rewrite output to compare,
 * this snapshot locks the post-rewrite known-good state per
 * OPERATOR_BRIEF §4. From here forward any future change to the
 * pipeline OR to the manifest's slot bindings shows up as a snapshot
 * diff.
 *
 * Usage:
 *   node scripts/test-figma-masters-snapshot.mjs            # diff vs baseline
 *   node scripts/test-figma-masters-snapshot.mjs --update   # write baseline
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildMastersBatch } from '../pipeline/figma-masters-batch.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SNAPSHOT_PATH = path.join(ROOT, 'fixtures/figma-masters/snapshot-pre-8v3.json');
const UPDATE = process.argv.includes('--update');

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const sorted = {};
    for (const key of Object.keys(value).sort()) sorted[key] = canonical(value[key]);
    return sorted;
  }
  return value;
}

function serialize(masters) {
  return JSON.stringify(canonical(masters), null, 2) + '\n';
}

function countBoundNodes(masters) {
  let count = 0;
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node._hdsTokenBinding && Object.keys(node._hdsTokenBinding).length > 0) count += 1;
    if (Array.isArray(node.children)) node.children.forEach(walk);
  };
  for (const m of masters) for (const s of m.states) walk(s.tree);
  return count;
}

function summary(masters) {
  const components = masters.length;
  const states = masters.reduce((sum, m) => sum + m.states.length, 0);
  return `${components} components × ${states} states × ${countBoundNodes(masters)} bound nodes`;
}

function main() {
  const masters = buildMastersBatch();
  const out = serialize(masters);

  if (UPDATE || !fs.existsSync(SNAPSHOT_PATH)) {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, out);
    console.log(
      `Wrote snapshot ${path.relative(ROOT, SNAPSHOT_PATH)} — ${summary(masters)}`,
    );
    return;
  }

  const expected = fs.readFileSync(SNAPSHOT_PATH, 'utf8');
  if (out === expected) {
    console.log(`OK — figma-masters matches snapshot — ${summary(masters)}`);
    return;
  }

  console.error('✗ figma-masters output diverged from committed snapshot');
  console.error(`  baseline: ${path.relative(ROOT, SNAPSHOT_PATH)}`);
  console.error(`  current:  ${summary(masters)}`);
  console.error('  Re-run with --update to accept the new state if the change was intentional.');
  process.exit(1);
}

main();
