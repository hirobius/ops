#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-hardcoded-colors.mjs
 *
 * Catches hardcoded color values in non-CSS color contexts that bypass the
 * CSS custom property cascade and are invisible to check-inline-styles /
 * check-tier-bypass.
 *
 * Contexts checked:
 *   C1 — SVG fill= / stroke= JSX attributes with hardcoded color values
 *   C2 — Canvas 2D context color property assignments (fillStyle, strokeStyle,
 *         shadowColor) with hardcoded color string literals
 *
 * Color patterns detected:
 *   • Hex: #rgb, #rrggbb, #rrggbbaa
 *   • RGB/RGBA: rgb(...), rgba(...)
 *   • OKLCH: oklch(...)
 *   • HSL/HSLA: hsl(...), hsla(...)
 *   • Named colors (common set): red, blue, green, white, black, etc.
 *     (Only in canvas assignments — JSX named color attrs are too noisy.)
 *
 * Exempt values (SVG fill/stroke):
 *   none, currentColor, inherit, transparent, url(...), var(--...)
 *
 * Suppression:
 *   // color-ok: <reason>  on the same line or immediately preceding line
 *
 * File-level exemption:
 *   Add `// @sketchbook-canvas` anywhere in the first 10 lines of a file to
 *   exempt the entire file. Use this for canvas drawing code where procedural
 *   colors (particle hues, gradient stops, trail fades) are intrinsic to the
 *   visual — not mappable to design tokens. The surrounding UI chrome should
 *   live in LabExperimentShell (which is fully tokened and NOT annotated).
 *
 * SKIP_FILES:
 *   HdsWebGLTriangleLogo.tsx  — documented carve-out in STANDARDS.md Â§ 5
 *   generated-token-values.ts, generated-token-descriptions.ts,
 *   generated-tokens.ts    — display-value exports, not component styles
 *   *.test.ts, *.spec.ts   — test fixtures may intentionally use raw values
 *
 * SKIP_DIRS:
 *   node_modules, .git, dist, experiments, __tests__
 *
 * Run:  node scripts/check-hardcoded-colors.mjs
 * Via:  pnpm check:colors
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, relative, basename , dirname } from 'path';
import { fileURLToPath } from 'url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const jsonMode = hasJsonFlag(process.argv);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC  = join(ROOT, 'src');

// ── Exemptions ────────────────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', '__tests__']);

const SKIP_BASENAMES = new Set([
  'HdsWebGLTriangleLogo.tsx',
  'generated-tokens.ts',
  'generated-token-values.ts',
  'generated-token-descriptions.ts',
  'generated-token-vars.d.ts',
]);

function isSkippedFile(fullPath) {
  const base = basename(fullPath);
  if (SKIP_BASENAMES.has(base)) return true;
  if (base.endsWith('.test.ts') || base.endsWith('.spec.ts')) return true;
  if (base.endsWith('.test.tsx') || base.endsWith('.spec.tsx')) return true;
  return false;
}

/** Returns true if the file opts out via // @sketchbook-canvas in first 10 lines. */
function isSketchbookCanvas(fullPath) {
  try {
    const content = readFileSync(fullPath, 'utf-8');
    const header = content.split('\n').slice(0, 10).join('\n');
    return header.includes('@sketchbook-canvas');
  } catch {
    return false;
  }
}

// ── Color patterns ────────────────────────────────────────────────────────────

// Matches hex, rgb/rgba, oklch, hsl/hsla color values
const COLOR_VALUE_RE = /(?:#[0-9a-fA-F]{3,8}|rgba?\s*\([^)]+\)|oklch\s*\([^)]+\)|hsla?\s*\([^)]+\))/;

// CSS-safe values that are allowed in SVG fill/stroke attributes
const SVG_EXEMPT_RE = /^(?:none|currentColor|inherit|transparent|url\s*\(|var\s*\(--)/i;

// Common named colors (caught only in canvas assignments to reduce false positives)
const NAMED_COLOR_RE = /^(?:red|blue|green|white|black|yellow|orange|purple|pink|gray|grey|cyan|magenta|brown|navy|teal|lime|silver|gold)\b/i;

// ── Walk ──────────────────────────────────────────────────────────────────────

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (SKIP_DIRS.has(entry)) continue;
    const stat = statSync(full);
    if (stat.isDirectory()) { walk(full, files); continue; }
    const ext = extname(entry);
    if (ext !== '.tsx' && ext !== '.ts') continue;
    if (isSkippedFile(full)) continue;
    if (isSketchbookCanvas(full)) continue;
    files.push(full);
  }
  return files;
}

// ── Suppression check ─────────────────────────────────────────────────────────

function isSuppressed(lines, lineIdx) {
  const same = lines[lineIdx] || '';
  const prev = lineIdx > 0 ? lines[lineIdx - 1] : '';
  return same.includes('// color-ok:') || prev.includes('// color-ok:');
}

// ── C1 — SVG fill= / stroke= with hardcoded color ────────────────────────────
//
// Matches JSX attribute patterns:
//   fill="#hex"        fill={'#hex'}
//   stroke="#hex"      strokeColor={...}
//
// Also catches fill={expr} where the string literal inside contains a color.

const SVG_ATTR_RE = /\b(?:fill|stroke)(?:Color)?\s*=\s*(?:"([^"]+)"|'([^']+)'|\{['"]([^'"]+)['"]\})/g;

function checkSvgAttrs(lines, rel, violations) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comment lines
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    SVG_ATTR_RE.lastIndex = 0;
    let m;
    while ((m = SVG_ATTR_RE.exec(line)) !== null) {
      const val = (m[1] || m[2] || m[3] || '').trim();
      if (!val) continue;
      if (SVG_EXEMPT_RE.test(val)) continue;
      if (!COLOR_VALUE_RE.test(val)) continue;
      if (isSuppressed(lines, i)) continue;
      violations.push({
        check: 'C1',
        file: rel,
        line: i + 1,
        detail: `SVG fill/stroke attribute has hardcoded color: "${val}"`,
        fix: `Use getComputedStyle(el).getPropertyValue('--semantic-color-...') or color-ok: <reason>`,
      });
    }
  }
}

// ── C2 — Canvas context color property assignments ────────────────────────────
//
// Matches:
//   ctx.fillStyle   = '#hex'
//   ctx.strokeStyle = 'oklch(...)'
//   context.shadowColor = 'rgb(...)'

const CANVAS_COLOR_RE = /\.(?:fillStyle|strokeStyle|shadowColor)\s*=\s*(?:"([^"]+)"|'([^']+)'|`([^`]+)`)/g;

function checkCanvasAssignments(lines, rel, violations) {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;

    CANVAS_COLOR_RE.lastIndex = 0;
    let m;
    while ((m = CANVAS_COLOR_RE.exec(line)) !== null) {
      const val = (m[1] || m[2] || m[3] || '').trim();
      if (!val) continue;
      // Exempt CSS vars passed to canvas (valid pattern via getComputedStyle result)
      if (val.startsWith('var(--')) continue;
      if (!COLOR_VALUE_RE.test(val) && !NAMED_COLOR_RE.test(val)) continue;
      if (isSuppressed(lines, i)) continue;
      violations.push({
        check: 'C2',
        file: rel,
        line: i + 1,
        detail: `Canvas context color assignment has hardcoded value: "${val}"`,
        fix: `Read via getComputedStyle(el).getPropertyValue('--semantic-color-...') at render time`,
      });
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

const files = walk(SRC);
const violations = [];

for (const file of files) {
  const rel   = relative(ROOT, file).replace(/\\/g, '/');
  const lines = readFileSync(file, 'utf-8').split('\n');
  checkSvgAttrs(lines, rel, violations);
  checkCanvasAssignments(lines, rel, violations);
}

if (jsonMode) {
  const canonicalViolations = violations.map((v) => ({
    file: v.file,
    line: v.line,
    rule: v.check === 'C1' ? 'hardcoded-color-svg' : 'hardcoded-color-canvas',
    severity: 'error',
    message: v.detail,
    fix: v.fix,
  }));
  emitResult(
    {
      violations: canonicalViolations,
      summary: { total: violations.length, filesScanned: files.length },
      ok: violations.length === 0,
    },
    true,
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

if (violations.length === 0) {
  console.log('[ok] check-hardcoded-colors — no hardcoded colors in non-CSS contexts');
  process.exit(0);
} else {
  console.error(`\nâœ— check-hardcoded-colors — ${violations.length} violation(s)\n`);
  for (const v of violations) {
    console.error(`  [${v.check}] ${v.file}:${v.line}`);
    console.error(`    ${v.detail}`);
    console.error(`    Fix: ${v.fix}\n`);
  }
  console.error('Suppress with // color-ok: <reason> on the same or preceding line.\n');
  process.exit(1);
}
