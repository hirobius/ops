#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Unresponsive Grid Checker
 *
 * ─── ACCEPTANCE CRITERIA ──────────────────────────────────────────────────────
 * PASS: Every multi-column gridTemplateColumns value is guarded by isMobile so
 *       narrow viewports get a single-column (or otherwise appropriate) layout.
 * FAIL: Any line where gridTemplateColumns is set to a static multi-column value
 *       with no nearby isMobile reference.
 *
 * ─── WHAT IT CATCHES ─────────────────────────────────────────────────────────
 *   gridTemplateColumns: '1fr 1fr'           → must be: isMobile ? '1fr' : '1fr 1fr'
 *   gridTemplateColumns: '1fr 1fr 1fr'       → same
 *   gridTemplateColumns: '60px 60px 1fr 1fr' → same
 *   gridTemplateColumns: '48px 64px 1fr ...' → same (any 3+ token grid)
 *
 * ─── WHAT IT IGNORES ─────────────────────────────────────────────────────────
 *   Lines where isMobile appears within ±10 lines (the ternary guard)
 *   Single-column values: '1fr', 'auto', '1fr auto', repeat(1, 1fr)
 *   CSS template literals (inside backtick strings used for @media docs)
 *   Comments and SVG viewBox strings
 *   Lines with // grid-ok: <reason>  (intentional horizontal scroll diagrams)
 *
 * ─── HOW TO FIX ──────────────────────────────────────────────────────────────
 *   gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr'
 *   — or —
 *   Add // grid-ok: <reason>  if horizontal scroll is intentional (e.g. SVG diagrams)
 *
 * ─── SELF-IMPROVEMENT LOG ────────────────────────────────────────────────────
 * v1 (2026-03-16): Initial — caught 6 unresponsive grids across MotionPage,
 *   TypographyPage, BreakpointsPage, TokenCascadeDiagram, DisplayPage, InputsPage.
 *   All fixed. This script prevents recurrence.
 * v2 (2026-03-16): Expanded — 26 violations found on first full run. Exempted
 *   repeat(auto-fill/auto-fit, minmax()) as inherently responsive. Increased
 *   ternary guard window to 30 lines. Remaining genuine violations being fixed.
 *
 * Run: node scripts/check-unresponsive-grids.mjs
 * Or:  pnpm check:grids
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src', 'app');

const isFixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

// How many lines above/below to look for an isMobile reference
// (30 covers ternary branches that span a long desktop alternative)
const MOBILE_GUARD_WINDOW = 30;

function collectFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'data' || entry === 'experiments') continue;
      collectFiles(full, results);
    } else if (extname(entry) === '.tsx' || extname(entry) === '.ts') {
      results.push(full);
    }
  }
  return results;
}

/**
 * Returns true if the gridTemplateColumns value has more than one meaningful column
 * AND is not inherently responsive.
 *
 * Inherently responsive (always safe, no isMobile needed):
 *   repeat(auto-fill, minmax(Npx, 1fr)) — self-collapses when width < N
 *   repeat(auto-fit,  minmax(Npx, 1fr)) — same
 *
 * These patterns are designed to auto-collapse to fewer columns as viewport
 * narrows — they are already "mobile-first" by construction.
 */
function isMultiColumn(value) {
  // Strip quotes
  const v = value.replace(/['"]/g, '').trim();
  // Inherently responsive: auto-fill/auto-fit with minmax
  if (/^repeat\s*\(\s*auto-(fill|fit)\s*,/.test(v)) return false;
  // Count space-separated column tokens (ignoring empty)
  const tracks = v.split(/\s+/).filter(Boolean);
  // Single-column: '1fr', 'auto', 'minmax(...)', 'repeat(1, ...)'
  if (tracks.length <= 1) return false;
  // repeat(1, ...) is single column
  if (/^repeat\s*\(\s*1\s*,/.test(v)) return false;
  // repeat(N, ...) where N > 1 is multi-column
  return true;
}

const violations = [];

const filesToScan = isFixtureMode && fixtureFile ? [resolve(fixtureFile)] : collectFiles(SRC);

for (const file of filesToScan) {
  const rel   = file.replace(ROOT + '/', '');
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    // Skip explicit exemptions
    if (line.includes('grid-ok')) return;
    // Skip CSS template literal content (lines inside backtick template strings for docs)
    if (!line.includes('gridTemplateColumns')) return;

    // Extract the value after gridTemplateColumns:
    const match = line.match(/gridTemplateColumns\s*:\s*(['"`][^'"`]*['"`])/);
    if (!match) return; // ternary or expression — not a bare string literal

    const value = match[1];
    if (!isMultiColumn(value)) return;

    // Check the surrounding window for an isMobile reference
    const start  = Math.max(0, i - MOBILE_GUARD_WINDOW);
    const end    = Math.min(lines.length - 1, i + MOBILE_GUARD_WINDOW);
    const window = lines.slice(start, end + 1).join('\n');

    if (window.includes('isMobile')) return; // guarded

    violations.push({
      file: rel,
      line: i + 1,
      value,
      raw: line.trim().slice(0, 120),
    });
  });
}

if (violations.length === 0) {
  console.log('\n✓ Unresponsive grid check passed — all multi-column grids have mobile guards.\n');
  process.exit(0);
} else {
  console.log(`\n✗ ${violations.length} unresponsive grid(s) found — these will break on mobile:\n`);
  violations.forEach(v => {
    console.log(`  ${v.file}:${v.line}  [gridTemplateColumns: ${v.value}]`);
    console.log(`    ${v.raw}`);
    console.log(`    Fix: gridTemplateColumns: isMobile ? '1fr' : ${v.value}`);
    console.log(`    Or:  add // grid-ok: <reason> if horizontal scroll is intentional\n`);
  });
  process.exit(1);
}
