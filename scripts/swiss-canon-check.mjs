#!/usr/bin/env node
/**
 * scripts/swiss-canon-check.mjs
 *
 * Swiss design canon gap report for the Hirobius Design System.
 *
 * Rules audited (from reference_phase8_hardening_skills.md §zeke/swiss-design):
 *   1. 8px grid — primitive spacing values must be multiples of 8 (except explicit subpixel exceptions)
 *   2. No bold headings — display/h1/h2/h3 must use weight.light (300) or weight.regular (400), never 700
 *   3. Body 60ch — body/small/mono typeStyles must not prescribe font-size > ~1rem (check only; max-width via CSS)
 *   4. Opacity hierarchy — warn if semantic color uses multiple hues for hierarchy (not enforced here, just reported)
 *   5. Source scan — CSS/TSX files using hardcoded bold on headings or off-scale pixel values
 *
 * Exits 0 in all cases (report-only). No remediation.
 *
 * Usage:
 *   node scripts/swiss-canon-check.mjs
 *   node scripts/swiss-canon-check.mjs --json
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = join(fileURLToPath(import.meta.url), '..');
const ROOT = join(__dirname, '..');

const JSON_MODE = process.argv.includes('--json');

// ── Rule definitions ──────────────────────────────────────────────────────────

/**
 * SUBPIXEL_EXCEPTIONS: tokens whose px values intentionally break the 8px grid.
 * These are hairline/divider widths, not spacing scale values.
 */
const SUBPIXEL_EXCEPTIONS = new Set(['px1', 'px2', 'px6', 'px10']);

/**
 * SWISS_HEADING_WEIGHT_MAX: maximum font-weight token name allowed for display/h-levels.
 * Swiss canon: light (300) or regular (400). medium (500) is the upper bound
 * per "Headings font-light or font-normal — never bold. Emphasis = font-medium."
 * We emit a WARNING for medium (it is allowed per the note) and an ERROR for semibold/bold.
 */
const HEADING_STYLES = ['display', 'h1', 'h2', 'h3'];
const SWISS_HEADING_WEIGHT_IDEAL = ['light', 'regular'];
const SWISS_HEADING_WEIGHT_ERROR = ['semibold', 'bold'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadTokens() {
  const raw = readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8');
  return JSON.parse(raw);
}

function walkFiles(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git' || entry === '.claude') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, exts, out);
    } else if (exts.includes(extname(entry))) {
      out.push(full);
    }
  }
  return out;
}

function relPath(p) {
  return relative(ROOT, p);
}

// ── Rule 1: 8px grid ──────────────────────────────────────────────────────────

function checkSpacingGrid(tokens) {
  const issues = [];
  const spacing = tokens?.primitive?.space ?? {};
  for (const [key, entry] of Object.entries(spacing)) {
    if (key.startsWith('$')) continue;
    if (SUBPIXEL_EXCEPTIONS.has(key)) continue;
    const val = entry?.value ?? entry?.['$value'];
    if (typeof val !== 'number') continue;
    if (val === 0) continue;
    if (val % 8 !== 0 && val % 4 !== 0) {
      issues.push({
        rule: '8px-grid',
        severity: 'warn',
        location: `hirobius.tokens.json#primitive.space.${key}`,
        message: `Space token "${key}" = ${val}px — not a 4px-grid multiple (ideally 8px). Consider aligning to nearest 8px or 4px.`,
      });
    }
  }
  return issues;
}

// ── Rule 2: No bold headings ──────────────────────────────────────────────────

function checkHeadingWeights(tokens) {
  const issues = [];
  const semTypo = tokens?.semantic?.typography ?? {};
  for (const style of HEADING_STYLES) {
    const entry = semTypo[style];
    if (!entry) continue;
    const val = entry?.['$value'] ?? entry?.value ?? {};
    const fw = typeof val === 'object' ? (val.fontWeight ?? '') : '';
    // Extract token key name (e.g. "{primitive.typography.weight.medium}" → "medium")
    const weightKey = fw.replace(/^\{primitive\.typography\.weight\.(\w+)\}$/, '$1');

    if (SWISS_HEADING_WEIGHT_ERROR.includes(weightKey)) {
      issues.push({
        rule: 'no-bold-headings',
        severity: 'error',
        location: `hirobius.tokens.json#semantic.typography.${style}.fontWeight`,
        message: `Heading "${style}" uses fontWeight.${weightKey} (${weightKey === 'bold' ? 700 : 600}) — Swiss canon prohibits bold/semibold headings. Use weight.light (300) or weight.regular (400).`,
      });
    } else if (!SWISS_HEADING_WEIGHT_IDEAL.includes(weightKey)) {
      issues.push({
        rule: 'no-bold-headings',
        severity: 'warn',
        location: `hirobius.tokens.json#semantic.typography.${style}.fontWeight`,
        message: `Heading "${style}" uses fontWeight.${weightKey} — Swiss canon prefers font-light (300) for display/h1/h2 and font-normal (400) for h3. Consider downweighting from medium (500) to light (300).`,
      });
    }
  }
  return issues;
}

// ── Rule 3: Source scan — hardcoded font-weight:bold on headings ──────────────

const BOLD_HEADING_RE = /(?:font-bold|fontWeight:\s*(?:'bold'|"bold"|700|800|900)|font-weight:\s*(?:bold|700|800|900))/g;

function checkSourceBoldHeadings() {
  const issues = [];
  const srcFiles = walkFiles(join(ROOT, 'src'), ['.tsx', '.ts', '.css']);
  for (const file of srcFiles) {
    const rel = relPath(file);
    // Skip test files, story files, and doc-exempt files
    if (rel.includes('.test.') || rel.includes('.spec.') || rel.includes('.stories.')) continue;
    const src = readFileSync(file, 'utf8');
    let match;
    const re = new RegExp(BOLD_HEADING_RE.source, 'g');
    while ((match = re.exec(src)) !== null) {
      const lineNum = src.slice(0, match.index).split('\n').length;
      issues.push({
        rule: 'no-source-bold',
        severity: 'warn',
        location: `${rel}:${lineNum}`,
        message: `Potential bold/700+ font-weight: "${match[0].trim()}" — verify this is not applied to a heading element.`,
      });
    }
  }
  return issues;
}

// ── Rule 4: 60ch body max-width — source scan ─────────────────────────────────

const MAX_W_VIOLATION_RE = /max-w-(?:prose|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)\b|maxWidth:\s*['"]?(?:400|500|600|700|800|900|1000|1200|1400)/g;
const BODY_TEXT_CONTEXT_RE = /<(?:p|span|article|section|main)[^>]*>/;

function checkSourceBodyWidth() {
  // This rule is informational — CSS max-width on body text should be ≤60ch.
  // We only flag prose/lg+ Tailwind classes that could exceed 60ch on body content.
  const issues = [];
  const srcFiles = walkFiles(join(ROOT, 'src'), ['.tsx', '.ts']);
  for (const file of srcFiles) {
    const rel = relPath(file);
    if (rel.includes('.test.') || rel.includes('.spec.')) continue;
    const src = readFileSync(file, 'utf8');
    let match;
    const re = new RegExp(MAX_W_VIOLATION_RE.source, 'g');
    while ((match = re.exec(src)) !== null) {
      const lineStart = src.lastIndexOf('\n', match.index) + 1;
      const lineEnd = src.indexOf('\n', match.index);
      const line = src.slice(lineStart, lineEnd > -1 ? lineEnd : undefined);
      // Only flag if the line looks like it might contain body/paragraph text
      if (!BODY_TEXT_CONTEXT_RE.test(line) && !line.includes('body') && !line.includes('prose')) continue;
      const lineNum = src.slice(0, match.index).split('\n').length;
      issues.push({
        rule: '60ch-body-width',
        severity: 'info',
        location: `${rel}:${lineNum}`,
        message: `Body text context may exceed 60ch max-width via class "${match[0].trim()}" — verify line contains ≤ 60ch column width.`,
      });
    }
  }
  return issues;
}

// ── Rule 5: Off-scale spacing in source (arbitrary px) ───────────────────────

// Matches inline style px values that are not on the 4px grid
const OFFSCALE_PX_RE = /(?:padding|margin|gap|spacing):\s*['"]?(\d+)px/g;
const GRID_UNIT = 4;

function checkSourceSpacing() {
  const issues = [];
  const srcFiles = walkFiles(join(ROOT, 'src'), ['.tsx', '.ts']);
  for (const file of srcFiles) {
    const rel = relPath(file);
    if (rel.includes('.test.') || rel.includes('.spec.')) continue;
    const src = readFileSync(file, 'utf8');
    let match;
    const re = new RegExp(OFFSCALE_PX_RE.source, 'g');
    while ((match = re.exec(src)) !== null) {
      const px = parseInt(match[1], 10);
      if (px === 0 || px === 1 || px === 2) continue; // hairlines OK
      if (px % GRID_UNIT !== 0) {
        const lineNum = src.slice(0, match.index).split('\n').length;
        issues.push({
          rule: 'off-scale-spacing',
          severity: 'warn',
          location: `${rel}:${lineNum}`,
          message: `Off-grid spacing: "${match[0].trim()}" — ${px}px is not a ${GRID_UNIT}px-grid multiple. Use a design token instead.`,
        });
      }
    }
  }
  return issues;
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const tokens = loadTokens();
  const all = [
    ...checkSpacingGrid(tokens),
    ...checkHeadingWeights(tokens),
    ...checkSourceBoldHeadings(),
    ...checkSourceBodyWidth(),
    ...checkSourceSpacing(),
  ];

  const errors   = all.filter(i => i.severity === 'error');
  const warnings = all.filter(i => i.severity === 'warn');
  const infos    = all.filter(i => i.severity === 'info');

  if (JSON_MODE) {
    process.stdout.write(JSON.stringify({ issues: all, summary: { errors: errors.length, warnings: warnings.length, infos: infos.length } }, null, 2) + '\n');
    process.exit(0);
  }

  // Human-readable report
  console.log('');
  console.log('Swiss Canon Gap Report — Hirobius Design System');
  console.log('================================================');
  console.log(`Checked: ${new Date().toISOString()}`);
  console.log('');

  const SEVERITY_ICON = { error: '✗', warn: '⚠', info: '·' };

  if (all.length === 0) {
    console.log('✓ No Swiss canon gaps found.');
  } else {
    for (const { rule, severity, location, message } of all) {
      const icon = SEVERITY_ICON[severity] ?? '?';
      console.log(`${icon} [${rule}] ${location}`);
      console.log(`  ${message}`);
      console.log('');
    }
  }

  console.log('Summary:');
  console.log(`  errors:   ${errors.length}`);
  console.log(`  warnings: ${warnings.length}`);
  console.log(`  infos:    ${infos.length}`);
  console.log('');

  if (errors.length > 0) {
    console.log('⚠ Swiss canon violations detected — see above for details.');
    console.log('  This is a gap report only. Remediation is out of scope for this unit.');
  } else {
    console.log('✓ No hard canon errors. Warnings above are opportunities for refinement.');
  }

  // Exit 0 — this is a report-only check
  process.exit(0);
}

main();
