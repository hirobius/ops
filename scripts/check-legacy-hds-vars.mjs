#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-legacy-hds-vars.mjs
 *
 * Flags direct use of legacy --hds-text, --hds-dim, and --hds-subtle CSS
 * custom properties in component and page source files.
 *
 * These vars have been renamed to the semantic text tier:
 *   --hds-text-primary   → var(--semantic-color-content-primary)
 *   --hds-text-secondary → var(--semantic-color-content-secondary)
 *   --hds-text-disabled  → var(--semantic-color-content-disabled)
 *
 * New code should reference the semantic tokens directly so intent is explicit
 * and the token name is searchable. For nav items, prefer component tokens:
 *   --component-nav-text        (rest state)
 *   --component-nav-textActive   (active state)
 *
 * Allowlisted files (may use --hds-text-primary/secondary/disabled by design):
 *   - src/styles/theme.css          — defines the aliases
 *
 * Suppression: add `// hds-ok: <reason>` on the same line or immediately before.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative , dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

const ALLOWLIST = new Set([
  join(ROOT, 'src', 'styles', 'theme.css'),
]);

const LEGACY_RE = /var\(--hds-(?:text-primary|text-secondary|text-disabled)\)/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP_DIRS.has(entry)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) { walk(full, files); continue; }
    const ext = extname(entry);
    if (!['.tsx', '.ts', '.css'].includes(ext)) continue;
    if (ALLOWLIST.has(full)) continue;
    files.push(full);
  }
  return files;
}

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const rel   = relative(ROOT, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf-8').split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!LEGACY_RE.test(line)) continue;

    const prevLine = i > 0 ? lines[i - 1] : '';
    const SUPPRESS = /\/\/\s*hds-ok:|\/\*\s*hds-ok:/;
    if (SUPPRESS.test(line) || SUPPRESS.test(prevLine)) continue;

    const match = line.match(/var\(--hds-(?:text-primary|text-secondary|text-disabled)\)/);
    violations.push({ file: rel, line: i + 1, pattern: match ? match[0] : 'var(--hds-...)' });
  }
}

if (violations.length === 0) {
  console.log('âœ“ check-legacy-hds-vars — no --hds-text-primary/secondary/disabled references in component files');
  process.exit(0);
} else {
  console.error(`\nâœ— check-legacy-hds-vars — ${violations.length} violation(s) found\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Pattern: ${v.pattern}`);
    console.error(`    Fix:     use var(--semantic-color-content-primary/secondary/disabled)`);
    console.error(`             or var(--component-nav-text) for nav items`);
    console.error(`             or add // hds-ok: <reason> to suppress\n`);
  }
  process.exit(1);
}
