/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * snapshot-token-paths.mjs
 *
 * Reads hirobius.tokens.json, walks the DTCG token tree, and emits a sorted
 * flat list of all leaf token paths (e.g. "semantic.color.surface.raised").
 *
 * Default behavior: prints JSON array to stdout.
 * With --write flag: writes the array to tokens.lock.json at repo root.
 *
 * Usage:
 *   node scripts/snapshot-token-paths.mjs
 *   node scripts/snapshot-token-paths.mjs --write
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

/**
 * Walk a DTCG token tree and yield dot-joined leaf paths.
 * Leaves are nodes that contain a "$value" key.
 * DTCG meta keys ($schema, $description, $type, $extensions) are skipped when
 * deciding whether a node is a group vs. a leaf.
 *
 * @param {unknown} node  - current subtree
 * @param {string[]} path - accumulated path segments
 * @returns {Generator<string>}
 */
export function* walkPaths(node, path = []) {
  if (node === null || typeof node !== 'object') return;

  if ('$value' in node) {
    // This is a leaf token — emit the dot-joined path
    yield path.join('.');
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue; // skip DTCG meta keys at group level
    yield* walkPaths(child, [...path, key]);
  }
}

/**
 * Read hirobius.tokens.json and return a sorted array of leaf paths.
 *
 * @param {string} [tokensPath] - override path (useful in tests)
 * @returns {string[]}
 */
export function snapshotTokenPaths(tokensPath) {
  const src = tokensPath ?? resolve(ROOT, 'hirobius.tokens.json');
  const raw = JSON.parse(readFileSync(src, 'utf-8'));
  return [...walkPaths(raw)].sort();
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const write = process.argv.includes('--write');
  const paths = snapshotTokenPaths();

  if (write) {
    const lockPath = resolve(ROOT, 'tokens.lock.json');
    writeFileSync(lockPath, JSON.stringify(paths, null, 2) + '\n', 'utf-8');
    console.error(`[snapshot-token-paths] Wrote ${paths.length} paths → tokens.lock.json`);
  } else {
    process.stdout.write(JSON.stringify(paths, null, 2) + '\n');
  }
}
