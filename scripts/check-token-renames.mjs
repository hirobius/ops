/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-token-renames.mjs
 *
 * Compares the current hirobius.tokens.json leaf paths against the committed
 * baseline in tokens.lock.json.  Any path present in the baseline but missing
 * from the current tree is a potential breaking rename.
 *
 * For each removed path the script requires ONE of:
 *   (a) A rename entry in TOKEN_MIGRATION.md:
 *         old.path -> new.path     (renamed YYYY-MM-DD)
 *   (b) An explicit removal entry:
 *         old.path -> removed      (removed YYYY-MM-DD, ...)
 *
 * Exit codes:
 *   0 — all removed paths are documented (or there are none)
 *   1 — at least one removed path has no migration entry
 *
 * Wiring verdict (12g-5): WIRE — token renames are breaking changes for external
 * consumers (Concrete Creations). Requires tokens.lock.json (snapshot baseline)
 * and TOKEN_MIGRATION.md (documented renames). Both exist. Added to check:full.
 * Not pre-commit: locks/migration are rarely touched and the check has zero cost
 * when nothing changed (silent exit 0).
 *
 * Refresh the lock after intentional renames: node scripts/snapshot-token-paths.mjs --write
 *
 * Usage:
 *   pnpm check:token-renames  OR  node scripts/check-token-renames.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotTokenPaths } from './snapshot-token-paths.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── Internals (exported for testing) ─────────────────────────────────────────

/**
 * Parse TOKEN_MIGRATION.md and return the set of old paths that have a
 * documented migration (rename OR removal).
 *
 * Recognized line patterns (anywhere in the file):
 *   old.path -> new.path    (rename)
 *   old.path -> removed     (explicit removal)
 *
 * Leading/trailing whitespace and everything after a bare "(..." suffix is
 * ignored so comments like "(renamed 2026-05-01)" don't affect parsing.
 *
 * @param {string} content - raw file text
 * @returns {Set<string>} set of documented old paths
 */
export function parseMigrationLog(content) {
  const documented = new Set();
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    // Match:  some.old.path -> some.new.path   OR   some.old.path -> removed
    const match = line.match(/^([\w.-]+)\s*->\s*([\w.-]+)/);
    if (match) {
      documented.add(match[1]);
    }
  }
  return documented;
}

/**
 * Core check: given current paths, baseline paths, and migration log content,
 * return an array of undocumented removed paths.
 *
 * @param {string[]} current   - paths from current token tree
 * @param {string[]} baseline  - paths from tokens.lock.json
 * @param {string}   migration - raw content of TOKEN_MIGRATION.md
 * @returns {string[]} undocumented paths (empty = all clear)
 */
export function findUndocumentedRemovals(current, baseline, migration) {
  const currentSet = new Set(current);
  const documented = parseMigrationLog(migration);

  return baseline
    .filter(p => !currentSet.has(p))   // removed from current tree
    .filter(p => !documented.has(p));  // not documented in migration log
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const lockPath      = resolve(ROOT, 'tokens.lock.json');
  const migrationPath = resolve(ROOT, 'TOKEN_MIGRATION.md');

  if (!existsSync(lockPath)) {
    console.error('[check-token-renames] tokens.lock.json not found. Run: node scripts/snapshot-token-paths.mjs --write');
    process.exit(1);
  }

  const baseline  = JSON.parse(readFileSync(lockPath, 'utf-8'));
  const current   = snapshotTokenPaths();
  const migration = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf-8') : '';

  const undocumented = findUndocumentedRemovals(current, baseline, migration);

  if (undocumented.length === 0) {
    const removedCount = baseline.filter(p => !new Set(current).has(p)).length;
    if (removedCount > 0) {
      console.log(`[check-token-renames] OK — ${removedCount} removed path(s) all documented in TOKEN_MIGRATION.md`);
    }
    // Empty diff: silent exit 0
    process.exit(0);
  }

  console.error('[check-token-renames] FAIL — the following token paths were removed without a TOKEN_MIGRATION.md entry:');
  for (const p of undocumented) {
    console.error(`  - ${p}`);
  }
  console.error('\nAdd an entry to TOKEN_MIGRATION.md for each path above:');
  console.error('  old.path -> new.path     (renamed YYYY-MM-DD)');
  console.error('  old.path -> removed      (removed YYYY-MM-DD, no replacement)');
  process.exit(1);
}
