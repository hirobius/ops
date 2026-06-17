#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Hardcoded Breakpoint Checker
 *
 * ─── ACCEPTANCE CRITERIA ──────────────────────────────────────────────────────
 * PASS: All JS/TS viewport comparisons use hds.breakpoints.* — no raw px numbers
 *       that match a known breakpoint value (375, 640, 768, 1024, 1280).
 * FAIL: Any comparison like `window.innerWidth < 768` instead of
 *       `window.innerWidth < hds.breakpoints.md`.
 *
 * ─── SELF-IMPROVEMENT LOG ────────────────────────────────────────────────────
 * v1: Initial — caught raw comparisons in isMobile state initializers.
 * v2: Added CSS @media exemption (CSS vars can't be used in @media min-width).
 * v3: Added // breakpoint-ok: <reason> exemption. Exempt tokens.ts and generated files.
 *
 * Catches raw pixel comparisons against known breakpoint values in JS/TS.
 * These should always use hds.breakpoints.* so the token is the single source of truth.
 *
 * What it catches:
 *   window.innerWidth < 768          → use hds.breakpoints.md
 *   window.innerWidth >= 1024        → use hds.breakpoints.lg
 *   someWidth > 640                  → use hds.breakpoints.sm
 *
 * What it ignores:
 *   Lines already referencing hds.breakpoints.*
 *   Lines with // breakpoint-ok: <reason>  (explicit exemption)
 *   CSS template strings and @media rules (CSS custom properties can't be used there — by design)
 *   The tokens.ts bridge file itself (defines the values)
 *   The check script itself
 *
 * Exemption: add // breakpoint-ok: <reason> on the same line to suppress.
 *
 * Run: node scripts/check-hardcoded-breakpoints.mjs
 * Or:  pnpm check:breakpoints
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src', 'app');

// The known breakpoint px values — any bare comparison against these is a violation
const BREAKPOINT_VALUES = new Set([375, 640, 768, 1024, 1280]);
const BP_NAME = { 375: 'xs', 640: 'sm', 768: 'md', 1024: 'lg', 1280: 'xl' };

// Files that are exempt by nature
const EXEMPT_FILES = new Set([
  'tokens.ts',           // defines the values
  'generated-tokens.ts', // generated output
]);

function collectFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules') continue;
      collectFiles(full, results);
    } else {
      const ext = extname(entry);
      if (ext === '.tsx' || ext === '.ts') results.push(full);
    }
  }
  return results;
}

// Match: [comparison operator] [breakpoint value] or [breakpoint value] [comparison operator]
// e.g.  < 768   >= 1024   === 640   !== 375   > 1280
const BP_COMPARISON = new RegExp(
  `(?:[<>]=?|===|!==)\\s*(${[...BREAKPOINT_VALUES].join('|')})\\b|\\b(${[...BREAKPOINT_VALUES].join('|')})\\s*(?:[<>]=?|===|!==)`,
  'g'
);

const violations = [];

for (const file of collectFiles(SRC)) {
  const filename = file.split('/').pop();
  if (EXEMPT_FILES.has(filename)) continue;

  const rel   = file.replace(ROOT + '/', '');
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    // Skip lines already using the token
    if (line.includes('hds.breakpoints')) return;
    // Skip CSS-in-template (inside backtick strings containing @media)
    if (line.includes('@media')) return;
    // Explicit exemption
    if (line.includes('breakpoint-ok')) return;

    for (const m of line.matchAll(BP_COMPARISON)) {
      const val = parseInt(m[1] || m[2], 10);
      if (!BREAKPOINT_VALUES.has(val)) continue;

      violations.push({
        file: rel,
        line: i + 1,
        val,
        name: BP_NAME[val],
        raw: line.trim().slice(0, 120),
      });
    }
  });
}

if (violations.length === 0) {
  console.log('\n✓ Breakpoint check passed — no hardcoded breakpoint values found.\n');
  process.exit(0);
} else {
  console.log(`\n✗ ${violations.length} hardcoded breakpoint value(s) found:\n`);
  violations.forEach(v => {
    console.log(`  ${v.file}:${v.line}  [raw value: ${v.val}px]`);
    console.log(`    ${v.raw}`);
    console.log(`    Fix: replace ${v.val} with hds.breakpoints.${v.name}\n`);
  });
  process.exit(1);
}
