#!/usr/bin/env node
/**
 * scripts/check-code-connect.mjs
 *
 * CI check: every Figma component with a Code Connect mapping (.figma.tsx)
 * has a corresponding React component, and vice versa.
 *
 * Currently: no .figma.tsx files exist — exits 0 with a skip message.
 * Once Code Connect files land, this script validates nodeId coverage against
 * the Figma masters snapshot at fixtures/figma-masters/snapshot-pre-8v3.json.
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const files = execSync('find src -name "*.figma.tsx" 2>/dev/null || true', {
  cwd: ROOT, encoding: 'utf8',
}).trim().split('\n').filter(Boolean);

if (files.length === 0) {
  console.log('No Code Connect files found — skipping.');
  process.exit(0);
}

// ── Validate each .figma.tsx against the Figma masters snapshot ───────────────

const SNAPSHOT_PATH = path.join(ROOT, 'fixtures/figma-masters/snapshot-pre-8v3.json');
if (!fs.existsSync(SNAPSHOT_PATH)) {
  console.error(`Snapshot not found: ${SNAPSHOT_PATH}`);
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
const snapshotIds = new Set(Object.keys(snapshot));

let errors = 0;
for (const file of files) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const match = src.match(/figma\.connect\s*\(.*?['"]([^'"]+)['"]/s);
  if (!match) {
    console.error(`✗ ${file}: no figma.connect() call found`);
    errors++;
    continue;
  }
  const nodeId = match[1].replace(/-/g, ':');
  if (!snapshotIds.has(nodeId)) {
    console.error(`✗ ${file}: nodeId ${nodeId} not in Figma masters snapshot`);
    errors++;
  } else {
    console.log(`✓ ${file}: ${nodeId}`);
  }
}

if (errors > 0) {
  console.error(`\n${errors} Code Connect error(s).`);
  process.exit(1);
}

console.log(`\n${files.length} Code Connect file(s) validated.`);
