#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Hardcoded Spacing Checker
 *
 * ─── ACCEPTANCE CRITERIA ──────────────────────────────────────────────────────
 * PASS: All spacing props (padding, margin, gap, inset) reference hds.space.*,
 *       hds.density.*, or var(--hds-space-*). No raw px strings or bare numbers.
 * FAIL: Any spacing prop with a raw pixel value not routed through the token system.
 *
 * ─── SELF-IMPROVEMENT LOG ────────────────────────────────────────────────────
 * v1: Initial — spacing + margin + gap coverage.
 * v2: Added bare number detection for known spacing props.
 * v3: Exempted dimension props (width, height) — those are layout constraints,
 *     not spacing tokens. Added // spacing-ok: <reason> exemption pattern.
 *
 * Scans all TSX/TS component files for raw pixel values in style props
 * that should use hds.space.*, hds.density.*, or var(--hds-space-*) instead.
 *
 * What it catches:
 *   padding: '16px'          → should be hds.space.px16
 *   gap: '24px'              → should be hds.density.lg or hds.space.px24
 *   marginBottom: '32px'     → should be hds.space.px32 or hds.density.xl
 *
 * What it ignores:
 *   Lines already using hds.space.*, hds.density.*, var(--, or hds.layout.*
 *   Lines with // spacing-ok: reason  (explicit exemption)
 *   width/height/maxWidth/minWidth/maxHeight/minHeight (visual dimensions, not spacing)
 *   aspectRatio, viewBox, r, cx, cy, d= (SVG attributes)
 *   Files in src/app/data/ (data constants, not UI)
 *   Values > 200px (viewport-scale, not component spacing)
 *
 * Exemption: add // spacing-ok: <reason> on the same line to suppress.
 *
 * Run: node scripts/check-hardcoded-spacing.mjs
 * Or:  pnpm check:spacing
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src', 'app');
const jsonMode = hasJsonFlag(process.argv);

const isFixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

// ── Properties that carry spacing (not dimensions/visual sizes) ──────────────
const SPACING_PROPS = new Set([
  'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
  'paddingBlock', 'paddingInline', 'paddingBlockStart', 'paddingBlockEnd',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
  'marginBlock', 'marginInline',
  'gap', 'rowGap', 'columnGap',
  'top', 'bottom', 'left', 'right', 'inset',
]);

// Dimension props that legitimately hold fixed px values (visual, not spacing)
const DIMENSION_PROPS = new Set([
  'width', 'height', 'maxWidth', 'minWidth', 'maxHeight', 'minHeight',
  'flexBasis', 'gridTemplateColumns', 'gridTemplateRows',
  'borderWidth', 'borderRadius', 'strokeWidth', 'r', 'cx', 'cy',
]);

// ── File collector ─────────────────────────────────────────────────────────
function collectFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === 'data' || entry === 'node_modules') continue;
      collectFiles(full, results);
    } else if (extname(entry) === '.tsx' || extname(entry) === '.ts') {
      results.push(full);
    }
  }
  return results;
}

// ── Detection regex ──────────────────────────────────────────────────────────
// Matches: propName: '16px' or propName: "16px" in style objects
const PX_STRING = /(\w+)\s*:\s*['"](\d+(?:\.\d+)?)px['"]/g;

// Matches: propName: 16, propName: 24 (bare numbers in style context)
// Only flags values 4–200 on known spacing props
const BARE_NUM = /(\w+)\s*:\s*(\d+)\s*[,\n}]/g;

const violations = [];

const filesToScan = isFixtureMode && fixtureFile ? [resolve(fixtureFile)] : collectFiles(SRC);

for (const file of filesToScan) {
  const rel   = file.replace(ROOT + '\\', '').replace(ROOT + '/', '');
  const lines = readFileSync(file, 'utf8').split('\n');

  lines.forEach((line, i) => {
    // Skip comments and lines already using token vars
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) return;
    if (line.includes('hds.space.') || line.includes('hds.density.') ||
        line.includes('var(--') || line.includes('hds.layout.') ||
        line.includes('spacing-ok') || line.includes('audit-ok')) return;

    // Check px string patterns
    for (const m of line.matchAll(PX_STRING)) {
      const [, prop, val] = m;
      const px = parseFloat(val);
      if (DIMENSION_PROPS.has(prop)) continue;
      if (!SPACING_PROPS.has(prop))  continue;
      if (px > 200) continue; // viewport-scale values
      violations.push({ file: rel, line: i + 1, prop, val: `${val}px`, raw: line.trim().slice(0, 100) });
    }

    // Check bare number patterns on known spacing props
    for (const m of line.matchAll(BARE_NUM)) {
      const [, prop, val] = m;
      const px = parseInt(val, 10);
      if (!SPACING_PROPS.has(prop)) continue;
      if (px < 4 || px > 200) continue;         // 0-3 = micro, >200 = viewport
      if (px % 2 !== 0) continue;               // non-grid values, skip
      if (line.includes('duration') || line.includes('delay')) continue;
      violations.push({ file: rel, line: i + 1, prop, val: String(px), raw: line.trim().slice(0, 100) });
    }
  });
}

// ── Report ────────────────────────────────────────────────────────────────────
if (jsonMode) {
  const canonical = violations.map((v) => ({
    file: v.file,
    line: v.line,
    rule: 'hardcoded-spacing',
    severity: 'error',
    message: `${v.prop}: ${v.val}`,
    prop: v.prop,
    value: v.val,
    sample: v.raw,
  }));
  emitResult(
    {
      violations: canonical,
      summary: { total: violations.length },
      ok: violations.length === 0,
    },
    true,
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

if (violations.length === 0) {
  console.log('\n✓ Hardcoded spacing check passed — all spacing uses token vars.\n');
  process.exit(0);
} else {
  console.log(`\n✗ ${violations.length} hardcoded spacing value(s) found:\n`);
  violations.forEach(v => {
    console.log(`  ${v.file}:${v.line}  [${v.prop}: ${v.val}]`);
    console.log(`    ${v.raw}`);
    console.log(`    Fix: use hds.space.px${v.val.replace('px','')} or hds.density.* or add // spacing-ok: <reason>\n`);
  });
  process.exit(1);
}
