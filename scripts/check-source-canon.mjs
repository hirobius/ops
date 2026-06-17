#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/check-source-canon.mjs
 *
 * Source-side companion to validators/swiss-canon.mjs. The JSX validator
 * runs on LLM-generated output; this scanner runs on hand-authored .tsx
 * files. They share rule definitions through validators/canon-rules.mjs so
 * a Swiss antipattern caught one way is caught the other.
 *
 * What it scans:
 *   src/app/components/**\/*.tsx
 *   src/app/pages/**\/*.tsx
 *   src/app/layouts/**\/*.tsx
 *
 * What it flags (rule code | meaning):
 *   FONT_BOLD         — `font-bold`/extra/black className OR `fontWeight: bold|700+`
 *   BG_WHITE_BLACK    — `bg-white`/`bg-black` className OR raw `#fff`/`#000`
 *   OVERSIZED_RADIUS  — `rounded-2xl|3xl|full` className on a structural element
 *   PURPLE_INDIGO     — `(text|bg|border|from|to|via|ring)-(purple|indigo|violet|fuchsia)-N`
 *   GRADIENT          — `bg-gradient-to-*` className
 *   LOREM             — lorem ipsum text content
 *   ELLIPSIS          — three-period `...` in JSX text content (use `…`)
 *   OFF_GRID_SPACING  — tailwind p-/m-/gap- utility outside the on-grid set
 *   DATA_TENANT       — `[data-tenant=...]` selector outside src/styles/tokens.css
 *
 * Modes:
 *   default — exit 1 on any violation
 *   --soft  — print warnings and exit 0 (initial wiring; promote later)
 *
 * No AST: keep this fast and dependency-light. Regex scan over raw .tsx text
 * with className extraction. False positives are tolerated as long as they
 * are rare; we get one fixup pass before promoting to hard fail.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  STRUCTURAL_COMPONENTS,
  LOREM_RE,
  TRIPLE_DOT_RE,
  FONT_BOLD_CLASS_RE,
  BG_BLACK_WHITE_CLASS_RE,
  OVERSIZED_RADIUS_CLASS_RE,
  PURPLE_CLASS_RE,
  GRADIENT_CLASS_RE,
  FONT_WEIGHT_BOLD_RE,
  RAW_HEX_BLACK_WHITE_RE,
  DATA_TENANT_SELECTOR_RE,
  INLINE_THIN_BAR_RE,
  INLINE_STRUCTURAL_BORDER_RE,
  tailwindSpacingViolation,
} from '../validators/canon-rules.mjs';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOFT = process.argv.includes('--soft');
const VERBOSE = process.argv.includes('--verbose');
const jsonMode = hasJsonFlag(process.argv);

const SCAN_DIRS = [
  'src/app/components',
  'src/app/pages',
  'src/app/layouts',
];

// Per src/app/pages/sketches/CLAUDE.md, the sketches directory is the
// "Expressive Zone" and explicitly suspends global HDS rules. Don't flag
// generative-art code for canon violations.
const SKIP_PATH_PARTS = ['/sketches/'];

function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP_PATH_PARTS.some((p) => full.includes(p))) continue;
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && /\.tsx$/.test(entry.name)) yield full;
  }
}

// Known rule codes for per-rule bypass parsing.
const ALL_RULE_CODES = new Set([
  'FONT_BOLD',
  'BG_WHITE_BLACK',
  'OVERSIZED_RADIUS',
  'PURPLE_INDIGO',
  'GRADIENT',
  'LOREM',
  'ELLIPSIS',
  'OFF_GRID_SPACING',
  'DATA_TENANT',
  'INLINE_THIN_BAR',
  'INLINE_STRUCTURAL_BORDER',
]);

// Honor the project's existing per-file exemption conventions. If a file's
// header (first ~15 lines) carries either marker, skip the matching rules:
//
//   /* hds-bypass: CODE1, CODE2, ... */
//                            — skip only the listed rule codes (per-rule bypass).
//                              Use known codes from ALL_RULE_CODES.
//                              DEPRECATED: bare `hds-bypass: <prose>` (no code tokens)
//                              still skips all rules but emits a deprecation warning.
//   // font-ok: ...          — file intentionally uses bold/heavy weights
//                              (typography demos, snapshot pages); skip just
//                              FONT_BOLD for it.
//
// Returns: { skippedCodes: Set<string>, skipAll: boolean }
// skipAll is true only for legacy bare-prose bypasses (deprecated).
function fileExemptions(source, filePath) {
  const head = source.split('\n').slice(0, 15).join('\n');

  let skippedCodes = new Set();
  let skipAll = false;

  // Match: /* hds-bypass: <body> */  or  /* hds-bypass: <body>  (unclosed is fine)
  const bypassMatch = head.match(/\/\*\s*hds-bypass\s*:\s*([^*]*)/);
  if (bypassMatch) {
    const body = bypassMatch[1].trim();
    // Extract any tokens that look like rule codes (ALL_CAPS with underscores)
    const tokens = body.split(/[\s,]+/).map((t) => t.trim().toUpperCase()).filter(Boolean);
    const codes = tokens.filter((t) => ALL_RULE_CODES.has(t));

    if (codes.length > 0) {
      // Per-rule bypass: only skip the listed codes
      skippedCodes = new Set(codes);
    } else {
      // Legacy bare-prose bypass: skip all rules (deprecated)
      skipAll = true;
      const rel = filePath ? filePath : '<unknown>';
      process.stderr.write(
        `[check-source-canon] DEPRECATION: ${rel} uses bare hds-bypass without explicit rule codes.\n` +
        `  Update to: /* hds-bypass: CODE1, CODE2 */ using codes from: ${[...ALL_RULE_CODES].join(', ')}\n`
      );
    }
  }

  // Legacy font-ok marker: still works as before
  if (/\/\/\s*font-ok\b/.test(head)) {
    skippedCodes.add('FONT_BOLD');
  }

  return { skippedCodes, skipAll };
}

function lineNumber(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

// Pull all className="..." and className={`...`} substrings, plus their
// position so we can report a line number. Not full JSX parsing on purpose;
// the tradeoff is a few false negatives in unusual constructions vs zero
// AST dependencies.
function extractClassNames(source) {
  const out = [];
  const reDoubleQuoted = /className\s*=\s*"([^"]*)"/g;
  const reSingleQuoted = /className\s*=\s*'([^']*)'/g;
  const reExpression = /className\s*=\s*\{([\s\S]*?)\}/g;
  for (const re of [reDoubleQuoted, reSingleQuoted]) {
    let m;
    while ((m = re.exec(source)) !== null) {
      out.push({ value: m[1], index: m.index });
    }
  }
  let m;
  while ((m = reExpression.exec(source)) !== null) {
    // Inside an expression we extract any string literals. Templates and
    // ternaries are flattened by capturing the first set of paired quotes.
    const inner = m[1];
    const strRe = /["'`]([^"'`]+)["'`]/g;
    let s;
    while ((s = strRe.exec(inner)) !== null) {
      out.push({ value: s[1], index: m.index + s.index });
    }
  }
  return out;
}

// JSX text — text appearing between tags, not inside attributes. Shallow
// regex approximation. Skip captures that look like code rather than prose
// (parens, semicolons, imports, spread expressions, type generics) and skip
// captures inside JSDoc/line comments.
function extractJsxText(source) {
  const out = [];
  const re = />([^<>{}]+)</g;
  const lines = source.split('\n');
  function lineFor(idx) {
    let cumulative = 0;
    for (let i = 0; i < lines.length; i += 1) {
      cumulative += lines[i].length + 1;
      if (idx < cumulative) return { lineNum: i + 1, lineText: lines[i] };
    }
    return { lineNum: lines.length, lineText: '' };
  }
  let m;
  while ((m = re.exec(source)) !== null) {
    const text = m[1];
    if (text.trim().length === 0) continue;
    if (/[();]|import |\.tsx|\.\.\.[A-Za-z_]|=>|: [A-Z]/.test(text)) continue;
    const { lineNum, lineText } = lineFor(m.index + 1);
    const trimmed = lineText.trim();
    if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) continue;
    out.push({ value: text, index: m.index + 1, line: lineNum });
  }
  return out;
}

function fileNearStructural(source) {
  for (const tag of STRUCTURAL_COMPONENTS) {
    if (source.includes('<' + tag)) return true;
  }
  return false;
}

function scanFile(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  const rel = path.relative(ROOT, filePath);
  const exempt = fileExemptions(source, rel);
  if (exempt.skipAll) return violations;

  // Helper: should this rule code be skipped for this file?
  const skip = (code) => exempt.skippedCodes.has(code);

  // ── className-based rules ──
  for (const cn of extractClassNames(source)) {
    const line = lineNumber(source, cn.index);
    if (!skip('FONT_BOLD') && FONT_BOLD_CLASS_RE.test(cn.value)) {
      violations.push({ rel, line, code: 'FONT_BOLD', sample: cn.value, message: 'font-bold/extrabold/black className — use font-medium for emphasis, never bold' });
    }
    if (!skip('BG_WHITE_BLACK') && BG_BLACK_WHITE_CLASS_RE.test(cn.value)) {
      violations.push({ rel, line, code: 'BG_WHITE_BLACK', sample: cn.value, message: 'bg-white/bg-black className — use semantic.color.surface tokens' });
    }
    if (!skip('OVERSIZED_RADIUS') && OVERSIZED_RADIUS_CLASS_RE.test(cn.value) && fileNearStructural(source)) {
      violations.push({ rel, line, code: 'OVERSIZED_RADIUS', sample: cn.value, message: 'rounded-2xl/3xl/full on structural element — use radius.action (4) or radius.card (8)' });
    }
    if (!skip('PURPLE_INDIGO') && PURPLE_CLASS_RE.test(cn.value)) {
      violations.push({ rel, line, code: 'PURPLE_INDIGO', sample: cn.value, message: 'purple/indigo/violet/fuchsia tailwind utility — palette is stone + Swiss Red' });
    }
    if (!skip('GRADIENT') && GRADIENT_CLASS_RE.test(cn.value)) {
      violations.push({ rel, line, code: 'GRADIENT', sample: cn.value, message: 'bg-gradient-to-* — flat surfaces only' });
    }
    if (!skip('OFF_GRID_SPACING')) {
      const spacing = tailwindSpacingViolation(cn.value);
      if (spacing) {
        violations.push({ rel, line, code: 'OFF_GRID_SPACING', sample: spacing.utility, message: `tailwind ${spacing.utility} is off the on-grid set` });
      }
    }
  }

  // ── inline style + raw color rules ──
  let m;
  if (!skip('FONT_BOLD')) {
    const reFontWeight = new RegExp(FONT_WEIGHT_BOLD_RE.source, 'g');
    while ((m = reFontWeight.exec(source)) !== null) {
      violations.push({ rel, line: lineNumber(source, m.index), code: 'FONT_BOLD', sample: m[0], message: 'fontWeight bold/700+ in inline style — never bold' });
    }
  }
  if (!skip('BG_WHITE_BLACK')) {
    const reHex = new RegExp(RAW_HEX_BLACK_WHITE_RE.source, 'g');
    while ((m = reHex.exec(source)) !== null) {
      violations.push({ rel, line: lineNumber(source, m.index), code: 'BG_WHITE_BLACK', sample: m[0], message: 'raw #fff or #000 — use semantic.color tokens' });
    }
  }

  // ── JSX text content rules ──
  for (const t of extractJsxText(source)) {
    if (!skip('LOREM') && LOREM_RE.test(t.value)) {
      violations.push({ rel, line: t.line, code: 'LOREM', sample: t.value.slice(0, 60), message: 'lorem ipsum placeholder copy in JSX text' });
    }
    if (!skip('ELLIPSIS') && TRIPLE_DOT_RE.test(t.value)) {
      violations.push({ rel, line: t.line, code: 'ELLIPSIS', sample: t.value.slice(0, 60), message: 'three-period "..." in JSX text — use "…"' });
    }
  }

  // ── Multi-tenant selector rule ──
  // [data-tenant=...] selectors are only allowed in src/styles/tokens.css.
  // Component-level CSS must use the token system, not tenant selectors.
  if (!skip('DATA_TENANT') && !rel.includes('src/styles/tokens.css')) {
    const reTenant = new RegExp(DATA_TENANT_SELECTOR_RE.source, 'g');
    while ((m = reTenant.exec(source)) !== null) {
      violations.push({ rel, line: lineNumber(source, m.index), code: 'DATA_TENANT', sample: m[0], message: '[data-tenant=...] selector found — tenant overrides only permitted in src/styles/tokens.css' });
    }
  }

  // ── Card anatomy: inline thin bar rule (12d-card-anatomy) ──
  // Detects `style={{ height: '1-8px', background: 'var(--…)' }}` patterns
  // that crowd adjacent prose. Use Card.Progress for state indicators or
  // separate Card.Body blocks for grouping. Component primitives (Card,
  // Badge, Surface) implement these patterns themselves and are exempt.
  const isPrimitive = rel.startsWith('src/app/components/') &&
    // Match kebab-case primitive filenames (post-5bc184ea rename).
    /\/(card|badge|surface|divider|tag|tabs?|toggle|switch|checkbox|radio|select|input|textarea|stepper-field|combobox|segmented-control|button|icon-button|disclosure|alert|callout|banner|popover|tooltip|modal|sheet|lightbox|menu-button|nav-group|nav-item|side-nav|anchor|link|inline-link|inline-code|code-block)\.tsx$/.test(rel);
  if (!isPrimitive) {
    if (!skip('INLINE_THIN_BAR')) {
      const reBar = new RegExp(INLINE_THIN_BAR_RE.source, 'g');
      while ((m = reBar.exec(source)) !== null) {
        violations.push({
          rel,
          line: lineNumber(source, m.index),
          code: 'INLINE_THIN_BAR',
          sample: m[0].slice(0, 80),
          message: 'inline thin colored bar (height: 1-8px + background: var(--…)) — use <Card.Progress> for state, or section structure (separate Card.Body blocks) for grouping',
        });
      }
    }

    // ── Outline rule (12d-outline-rule, Adrian 2026-05-03) ──
    // Outlines are for interactive containers; display surfaces should not
    // have structural borders. Annotate `outline-ok: <reason>` per-line for
    // legitimate exceptions (interactive ghost slots, focus rings, etc.).
    if (!skip('INLINE_STRUCTURAL_BORDER')) {
      const reBorder = new RegExp(INLINE_STRUCTURAL_BORDER_RE.source, 'g');
      while ((m = reBorder.exec(source)) !== null) {
        const ln = lineNumber(source, m.index);
        const lineText = source.split('\n')[ln - 1] ?? '';
        if (lineText.includes('outline-ok:')) continue;
        violations.push({
          rel,
          line: ln,
          code: 'INLINE_STRUCTURAL_BORDER',
          sample: m[0].slice(0, 80),
          message: 'inline structural border on a non-interactive surface — outlines are reserved for interactive affordances. Use background contrast, side-rules, or whitespace instead. Annotate `outline-ok: <reason>` for intentional exceptions (interactive ghost slots, focus rings).',
        });
      }
    }
  }

  return violations;
}

// 12d-outline-rule: ratchet baseline for INLINE_STRUCTURAL_BORDER.
// Existing violations are frozen here; new violations fail the gate.
// Burn down by fixing the ref and removing its line. Generated via
// `node scripts/check-source-canon.mjs --update-baseline`.
function loadStructuralBorderBaseline() {
  try {
    const text = fs.readFileSync(path.join(ROOT, '.source-canon-baseline.txt'), 'utf8');
    return new Set(
      text.split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
    );
  } catch {
    return new Set();
  }
}

function structuralBorderKey(v) {
  return `${v.code}:${v.rel}:${v.sample}`;
}

function main() {
  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    for (const f of walk(path.join(ROOT, dir))) allFiles.push(f);
  }

  const allViolations = [];
  for (const f of allFiles) {
    const v = scanFile(f);
    if (v.length > 0) allViolations.push(...v);
  }

  // 12d-outline-rule: --update-baseline writes the current INLINE_STRUCTURAL_BORDER
  // violations to .source-canon-baseline.txt. New violations not in the baseline
  // fail the gate; baselined ones are tracked for follow-on burndown.
  const isUpdateBaseline = process.argv.includes('--update-baseline');
  if (isUpdateBaseline) {
    const baselineable = allViolations.filter((v) => v.code === 'INLINE_STRUCTURAL_BORDER');
    const lines = [
      '# .source-canon-baseline.txt',
      '# Generated by `node scripts/check-source-canon.mjs --update-baseline`.',
      '# Format: <CODE>:<relative-path>:<sample>',
      '# Each line below is a known structural-border violation frozen at',
      '# baseline time. New violations not in this file fail the gate.',
      '# Burn down by fixing the inline border and removing its line.',
      '',
      ...[...new Set(baselineable.map(structuralBorderKey))].sort(),
    ];
    fs.writeFileSync(path.join(ROOT, '.source-canon-baseline.txt'), lines.join('\n') + '\n');
    console.log(`✓ wrote ${lines.length - 7} INLINE_STRUCTURAL_BORDER baseline entries`);
    process.exit(0);
  }

  // Partition: INLINE_STRUCTURAL_BORDER violations get baseline-filtered;
  // all other rules fail on first occurrence.
  const baseline = loadStructuralBorderBaseline();
  const baselined = [];
  const reportable = [];
  for (const v of allViolations) {
    if (v.code === 'INLINE_STRUCTURAL_BORDER' && baseline.has(structuralBorderKey(v))) {
      baselined.push(v);
    } else {
      reportable.push(v);
    }
  }

  if (jsonMode) {
    const canonical = [];
    for (const v of reportable) {
      canonical.push({
        file: v.rel,
        line: v.line,
        rule: v.code,
        severity: 'error',
        message: v.message,
        sample: v.sample,
      });
    }
    for (const v of baselined) {
      canonical.push({
        file: v.rel,
        line: v.line,
        rule: v.code,
        severity: 'baselined',
        message: v.message,
        sample: v.sample,
      });
    }
    emitResult(
      {
        violations: canonical,
        summary: {
          filesScanned: allFiles.length,
          reportable: reportable.length,
          baselined: baselined.length,
        },
        ok: reportable.length === 0,
      },
      true,
    );
    process.exit(reportable.length === 0 ? 0 : 1);
  }

  if (VERBOSE || reportable.length > 0) {
    console.log(`Scanned ${allFiles.length} .tsx files in ${SCAN_DIRS.join(', ')}.`);
  }

  if (reportable.length === 0) {
    const baselineNote = baseline.size > 0
      ? ` (${baselined.length} baselined INLINE_STRUCTURAL_BORDER — burn down via 12d-2-outline-page-burndown)`
      : '';
    console.log(`OK — no Swiss canon violations in source${baselineNote}`);
    process.exit(0);
  }

  const grouped = {};
  for (const v of reportable) {
    grouped[v.code] = (grouped[v.code] || 0) + 1;
  }

  const stream = SOFT ? console.warn : console.error;
  const label = SOFT ? '⚠ ' : '✗ ';
  for (const v of reportable) {
    stream(`${label}${v.rel}:${v.line}  [${v.code}]  ${v.message}\n    sample: ${v.sample}`);
  }
  stream(`\n${reportable.length} source-canon violation(s) — counts: ${Object.entries(grouped).map(([k, n]) => `${k}=${n}`).join(', ')}`);
  if (baselined.length > 0) {
    stream(`(${baselined.length} INLINE_STRUCTURAL_BORDER baselined — not shown)`);
  }

  if (SOFT) {
    console.warn('\n(--soft mode: exiting 0. Drop --soft once existing violations are fixed.)');
    process.exit(0);
  }
  process.exit(1);
}

main();
