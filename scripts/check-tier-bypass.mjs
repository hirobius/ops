/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-tier-bypass.mjs
 *
 * Enforces the primitive → semantic → component aliasing hierarchy in source files.
 * Direct use of var(--primitive-*) in component and page files bypasses the semantic
 * tier, making design decisions impossible to update in a single place.
 *
 * Allowlisted files (may reference --primitive-* by design):
 *   - src/styles/tokens.css         — generated; defines all CSS custom properties
 *   - src/styles/theme.css          — bridges primitives to semantic vars
 *   - src/app/design-system/generated-tokens.ts — generated TS constants
 *
 * Suppression: add `// tier-ok: <reason>` on the offending line or immediately before.
 * In JSX children (where `//` renders as text), use a JSX block comment on the preceding line:
 *   {slash* tier-ok: <reason> *slash}  (replace "slash" with the actual slash character)
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative , dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist']);

// Resolved absolute paths of files that legitimately use --primitive-* vars
const ALLOWLIST = new Set([
  join(ROOT, 'src', 'styles', 'tokens.css'),
  join(ROOT, 'src', 'styles', 'tokens.generated.css'),
  join(ROOT, 'src', 'styles', 'theme.css'),
  join(ROOT, 'src', 'app', 'design-system', 'generated-tokens.ts'),
  join(ROOT, 'src', 'app', 'design-system', 'generated-token-refs.ts'),
  // tokens.ts is the JS token bridge — it intentionally exposes primitive vars
  // as JavaScript constants (same pipeline role as generated-tokens.ts)
  join(ROOT, 'src', 'app', 'design-system', 'tokens.ts'),
  // generated-token-descriptions.ts: auto-generated string descriptions that quote primitive var names
  // for documentation purposes; the strings are not live CSS declarations
  join(ROOT, 'src', 'app', 'design-system', 'generated-token-descriptions.ts'),
]);

const TIER_BYPASS_RE = /var\(--primitive-/;

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
    if (!TIER_BYPASS_RE.test(line)) continue;

    // Suppression: same line or immediately preceding line
    // Accepts `// tier-ok:` (JS) or `/* tier-ok:` (JSX block comment / CSS-style)
    const prevLine = i > 0 ? lines[i - 1] : '';
    const SUPPRESS = /\/\/\s*tier-ok:|\/\*\s*tier-ok:/;
    if (SUPPRESS.test(line) || SUPPRESS.test(prevLine)) continue;

    const match = line.match(/var\(--primitive-[^)]+\)/);
    violations.push({ file: rel, line: i + 1, pattern: match ? match[0] : 'var(--primitive-...)' });
  }
}

if (violations.length === 0) {
  console.log('✓ check-tier-bypass — no var(--primitive-*) references outside the token pipeline');
  process.exit(0);
} else {
  console.error(`\n✗ check-tier-bypass — ${violations.length} violation(s) found\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}`);
    console.error(`    Pattern: ${v.pattern}`);
    console.error(`    Fix:     replace with var(--semantic-*) or var(--component-*), or add // tier-ok: <reason>\n`);
  }
  process.exit(1);
}
