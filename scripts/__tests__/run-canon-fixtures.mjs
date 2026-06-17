#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * run-canon-fixtures.mjs — 12g-7-validator-fixtures
 *
 * Proof-of-firing test runner for check-source-canon.mjs rule regexes.
 *
 * Per AGENT_GUIDELINES §14 (no-aspirational-guardrails): a rule is not done
 * until proven firing on a known violation. This runner asserts that each
 * fixture in scripts/__tests__/fixtures/canon/ triggers exactly the expected
 * rule code. If a validator silently no-ops on its own fixture, the runner
 * exits non-zero.
 *
 * Each fixture file is named after the rule code it should trigger (e.g.
 * FONT_BOLD.tsx). The runner scans the fixture with the same logic as
 * check-source-canon.mjs and asserts at least one violation with that code.
 *
 * Run: node scripts/__tests__/run-canon-fixtures.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  FONT_BOLD_CLASS_RE,
  FONT_WEIGHT_BOLD_RE,
  BG_BLACK_WHITE_CLASS_RE,
  RAW_HEX_BLACK_WHITE_RE,
  OVERSIZED_RADIUS_CLASS_RE,
  PURPLE_CLASS_RE,
  GRADIENT_CLASS_RE,
  LOREM_RE,
  TRIPLE_DOT_RE,
  tailwindSpacingViolation,
  DATA_TENANT_SELECTOR_RE,
  INLINE_THIN_BAR_RE,
  INLINE_STRUCTURAL_BORDER_RE,
  STRUCTURAL_COMPONENTS,
} from '../../validators/canon-rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'canon');

// ── Minimal scanner (mirrors check-source-canon.mjs scanFile logic) ──────────

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
    const inner = m[1];
    const strRe = /["'`]([^"'`]+)["'`]/g;
    let s;
    while ((s = strRe.exec(inner)) !== null) {
      out.push({ value: s[1], index: m.index + s.index });
    }
  }
  return out;
}

function extractJsxText(source) {
  const out = [];
  const re = />([^<>{}]+)</g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const text = m[1];
    if (text.trim().length === 0) continue;
    if (/[();]|import |\.tsx|\.\.\.[A-Za-z_]|=>|: [A-Z]/.test(text)) continue;
    out.push({ value: text, index: m.index + 1 });
  }
  return out;
}

function fileNearStructural(source) {
  for (const tag of STRUCTURAL_COMPONENTS) {
    if (source.includes('<' + tag)) return true;
  }
  return false;
}

/**
 * Scan a single file for canon violations.
 * Returns an array of { code } objects.
 */
function scanFixture(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  let m;

  // className-based rules
  for (const cn of extractClassNames(source)) {
    if (FONT_BOLD_CLASS_RE.test(cn.value)) {
      violations.push({ code: 'FONT_BOLD' });
    }
    if (BG_BLACK_WHITE_CLASS_RE.test(cn.value)) {
      violations.push({ code: 'BG_WHITE_BLACK' });
    }
    if (OVERSIZED_RADIUS_CLASS_RE.test(cn.value) && fileNearStructural(source)) {
      violations.push({ code: 'OVERSIZED_RADIUS' });
    }
    if (PURPLE_CLASS_RE.test(cn.value)) {
      violations.push({ code: 'PURPLE_INDIGO' });
    }
    if (GRADIENT_CLASS_RE.test(cn.value)) {
      violations.push({ code: 'GRADIENT' });
    }
    const spacing = tailwindSpacingViolation(cn.value);
    if (spacing) {
      violations.push({ code: 'OFF_GRID_SPACING' });
    }
  }

  // Inline style + raw color rules
  const reFontWeight = new RegExp(FONT_WEIGHT_BOLD_RE.source, 'g');
  while ((m = reFontWeight.exec(source)) !== null) {
    violations.push({ code: 'FONT_BOLD' });
  }
  const reHex = new RegExp(RAW_HEX_BLACK_WHITE_RE.source, 'g');
  while ((m = reHex.exec(source)) !== null) {
    violations.push({ code: 'BG_WHITE_BLACK' });
  }

  // JSX text content rules
  for (const t of extractJsxText(source)) {
    if (LOREM_RE.test(t.value)) {
      violations.push({ code: 'LOREM' });
    }
    if (TRIPLE_DOT_RE.test(t.value)) {
      violations.push({ code: 'ELLIPSIS' });
    }
  }

  // Data-tenant selector rule
  const reTenant = new RegExp(DATA_TENANT_SELECTOR_RE.source, 'g');
  while ((m = reTenant.exec(source)) !== null) {
    violations.push({ code: 'DATA_TENANT' });
  }

  // Inline thin bar rule (non-primitive check skipped — fixtures are not primitives)
  const reBar = new RegExp(INLINE_THIN_BAR_RE.source, 'g');
  while ((m = reBar.exec(source)) !== null) {
    violations.push({ code: 'INLINE_THIN_BAR' });
  }

  // Inline structural border rule
  const reBorder = new RegExp(INLINE_STRUCTURAL_BORDER_RE.source, 'g');
  while ((m = reBorder.exec(source)) !== null) {
    const lineText = source.split('\n').find((l) => l.includes(m[0])) ?? '';
    if (!lineText.includes('outline-ok:')) {
      violations.push({ code: 'INLINE_STRUCTURAL_BORDER' });
    }
  }

  return violations;
}

// ── Runner ────────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

const fixtureFiles = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.tsx'));

if (fixtureFiles.length === 0) {
  console.error('ERROR: No fixture files found in', FIXTURE_DIR);
  process.exit(1);
}

for (const file of fixtureFiles) {
  const expectedCode = path.basename(file, '.tsx');
  const filePath = path.join(FIXTURE_DIR, file);
  const violations = scanFixture(filePath);
  const codes = violations.map((v) => v.code);
  const fired = codes.includes(expectedCode);

  if (fired) {
    console.log(`  PASS  ${file}  [${expectedCode}] fired`);
    passed++;
  } else {
    console.error(`  FAIL  ${file}  expected [${expectedCode}] but got: [${codes.join(', ') || 'none'}]`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed (${fixtureFiles.length} fixtures)`);

if (failed > 0) {
  console.error(`\nFailed: ${failed} validator(s) silently no-op on their own fixture — rule is aspirational, not proven.`);
  process.exit(1);
}
process.exit(0);
