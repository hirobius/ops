/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-focus-states.mjs
 *
 * A11y focus state checker for HDS components and pages.
 * Every interactive element must have a visible focus indicator.
 *
 * In this codebase, focus is provided via:
 *   - className="hds-focus"  (preferred — HDS brand-blue ring)
 *   - className containing "focus:" utilities with a ring (legacy pattern)
 *
 * This script flags two failure modes:
 *
 *  1. REMOVED FOCUS — focus:outline-none present with no focus replacement
 *     The most dangerous pattern: kills keyboard navigation entirely.
 *     Safe pattern: focus:outline-none paired with hds-focus OR focus:ring-*
 *
 *  2. MISSING FOCUS — raw <button> or <a> JSX element without any focus class
 *     Catches un-wrapped interactive elements that bypass HDS components.
 *     HDS components (Button, IconButton, Input) add hds-focus internally.
 *
 * Usage:   pnpm check:focus
 * Exempt:  Add // audit-ok: <reason> to suppress a specific line
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

const ROOT      = process.cwd();
const SCAN_DIRS = [
  join(ROOT, 'src/app/components'),
  join(ROOT, 'src/app/pages'),
];
const SKIP_DIRS  = new Set(['figma', 'sketches']);
const SKIP_FILES = new Set(['types.ts', 'hooks.ts', 'HdsWebGLTriangleLogo.tsx']);

// ── Helpers ───────────────────────────────────────────────────────────────────

function isComment(trimmed) {
  return (
    trimmed.startsWith('//') ||
    trimmed.startsWith('*') ||
    trimmed.startsWith('/*') ||
    trimmed.startsWith('/**')
  );
}

// Does this line contain a focus indicator?
function hasFocusIndicator(line) {
  return (
    line.includes('hds-focus') ||
    line.includes('focus:ring-') ||
    line.includes('focus:border-') ||
    line.includes('focus:shadow-') ||
    line.includes('focus-visible:')
  );
}

// ── Checks ────────────────────────────────────────────────────────────────────

const violations = [];

/**
 * Check 1 — focus:outline-none without a replacement
 * Scans single lines. For multi-line className blocks, checks Â±3 lines for
 * a focus replacement before flagging.
 */
function checkOutlineNone(lines, filePath) {
  for (let i = 0; i < lines.length; i++) {
    const raw     = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || isComment(trimmed) || trimmed.includes('// audit-ok')) continue;

    if (raw.includes('focus:outline-none') || raw.includes('outline: \'none\'') || raw.includes("outline: 'none'")) {
      // Check this line and Â±3 surrounding lines for a focus replacement
      const window = lines.slice(Math.max(0, i - 3), Math.min(lines.length, i + 4)).join(' ');
      if (!hasFocusIndicator(window)) {
        violations.push({
          file:    relative(ROOT, filePath).replace(/\\/g, '/'),
          lineNum: i + 1,
          text:    trimmed,
          rule:    'REMOVED FOCUS',
          fix:     'Pair focus:outline-none with hds-focus class, or remove outline suppression entirely',
        });
      }
    }
  }
}

/**
 * Check 2 — raw <button> JSX element without focus class
 * Looks for JSX opening tags on a single line. Multi-line elements are
 * caught by checking className lines within 5 lines of the tag.
 */
function checkRawInteractive(lines, filePath) {
  // Tags that require explicit focus handling when used as raw JSX
  const INTERACTIVE_RE = /^\s*<(button|a)\b(?!\w)/;

  for (let i = 0; i < lines.length; i++) {
    const raw     = lines[i];
    const trimmed = raw.trim();
    if (!trimmed || isComment(trimmed) || trimmed.includes('// audit-ok')) continue;

    if (INTERACTIVE_RE.test(raw)) {
      // Check this line + next 20 lines for a focus indicator or self-close
      const window = lines.slice(i, Math.min(lines.length, i + 20)).join('\n');

      // Skip self-closing tags with no className (they're structural, e.g. <br>)
      if (window.match(/^[^>]*\/>/m)) continue;

      if (!hasFocusIndicator(window)) {
        violations.push({
          file:    relative(ROOT, filePath).replace(/\\/g, '/'),
          lineNum: i + 1,
          text:    trimmed,
          rule:    'MISSING FOCUS',
          fix:     'Add className="hds-focus" — or use Button/IconButton/Input which include it',
        });
      }
    }
  }
}

// ── Scanner ───────────────────────────────────────────────────────────────────

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines   = content.split('\n');
  checkOutlineNone(lines, filePath);
  checkRawInteractive(lines, filePath);
}

function scanDir(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (!SKIP_DIRS.has(entry)) scanDir(full);
    } else if (
      (entry.endsWith('.tsx') || entry.endsWith('.ts')) &&
      !SKIP_FILES.has(entry)
    ) {
      scanFile(full);
    }
  }
}

// ── Run ───────────────────────────────────────────────────────────────────────

for (const dir of SCAN_DIRS) {
  try { scanDir(dir); } catch { /* dir may not exist */ }
}

if (violations.length === 0) {
  console.log('\nâœ“ Focus state check passed — all interactive elements have focus indicators.\n');
  process.exit(0);
} else {
  console.error(`\nâœ— Focus state check failed — ${violations.length} violation(s) found.\n`);
  console.error('  Keyboard users cannot navigate elements without visible focus.\n');

  // Group by file
  const byFile = {};
  for (const v of violations) {
    (byFile[v.file] ??= []).push(v);
  }

  for (const [file, hits] of Object.entries(byFile)) {
    console.error(`  ${file}`);
    for (const { lineNum, text, rule, fix } of hits) {
      console.error(`    ${String(lineNum).padStart(4)}  [${rule}]`);
      console.error(`          ${text}`);
      console.error(`          → ${fix}`);
    }
    console.error('');
  }

  process.exit(1);
}
