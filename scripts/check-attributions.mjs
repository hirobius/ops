/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-attributions.mjs
 *
 * Keeps the attribution registry machine-checkable.
 *
 * Checks:
 *   1. Registry IDs in ATTRIBUTIONS.md are present and unique.
 *   2. Registry entries include a canonical Source URL.
 *   3. Asset manifest sourceId values resolve to known registry IDs.
 *
 * Usage: pnpm check:attributions
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = process.cwd();
const ATTRIBUTIONS_PATH = join(ROOT, 'ATTRIBUTIONS.md');
const MANIFEST_PATH = join(ROOT, 'public/assets/manifest.json');

const violations = [];

if (!existsSync(ATTRIBUTIONS_PATH)) {
  console.error('\n✗ Attribution check failed — ATTRIBUTIONS.md is missing.\n');
  process.exit(1);
}

const content = readFileSync(ATTRIBUTIONS_PATH, 'utf8');
const idMatches = [...content.matchAll(/^- Registry ID:\s*([a-z0-9-]+)\s*$/gim)];
const sourceMatches = [...content.matchAll(/^- Source:\s*\[.*?\]\((https?:\/\/[^\s)]+)\)\s*$/gim)];
const ids = idMatches.map(match => match[1]);
const idSet = new Set(ids);

if (ids.length === 0) {
  violations.push('ATTRIBUTIONS.md must include at least one Registry ID entry');
}

if (idSet.size !== ids.length) {
  violations.push('ATTRIBUTIONS.md contains duplicate Registry ID values');
}

if (sourceMatches.length < ids.length) {
  violations.push('every attribution entry should include a Source URL');
}

if (existsSync(MANIFEST_PATH)) {
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
  const assets = Array.isArray(manifest.assets) ? manifest.assets : [];

  for (const entry of assets) {
    if (!entry?.sourceId) continue;
    if (!idSet.has(entry.sourceId)) {
      violations.push(`manifest sourceId does not exist in ATTRIBUTIONS.md: ${entry.path} -> ${entry.sourceId}`);
    }
  }
}

if (violations.length > 0) {
  console.error(`\n✗ Attribution check failed — ${violations.length} issue(s).\n`);
  for (const violation of violations) {
    console.error(`  ${violation}`);
  }
  console.error('');
  process.exit(1);
}

console.log('\n✓ Attribution check passed — registry IDs and manifest references are in sync.\n');
