#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System - Fixed Dimension Checker
 *
 * Catches raw numeric width/height style values in app component/page files
 * before they reach the broader audit lane. This is the narrow, fast gate for
 * the most common component sizing mistakes.
 *
 * PASS: width/height/minWidth/maxWidth/minHeight/maxHeight in JSX style props
 *       use size tokens or semantic/component/layout equivalents.
 * FAIL: Small raw numeric control sizes that should be tokenized, or any
 *       dimension prop that incorrectly borrows from hds.space.*.
 *
 * Exemption: add // audit-ok: <reason> on the same line to suppress.
 *
 * Run: node scripts/check-dimensions.mjs
 * Or:  pnpm check:dimensions
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, extname, relative } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src', 'app');
const SKIP_DIRS = new Set(['data', 'node_modules', 'dist']);
const DIMENSION_PROP_RE = /\b(width|minWidth|maxWidth|height|minHeight|maxHeight)\s*:\s*([^,}]+)/g;
const WATCHED_SIZES = new Set([12, 32, 48]);
const DISALLOWED_DIMENSION_VALUE_RE = /\b(?:hds\.space|hds\.semantic\.space|hds\.density)\b|var\(--(?:primitive|semantic|hds)-space-/;

function collectFiles(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (SKIP_DIRS.has(entry)) continue;
      collectFiles(full, results);
    } else if (extname(entry) === '.tsx' || extname(entry) === '.ts') {
      results.push(full);
    }
  }
  return results;
}

export function runDimensionCheck() {
  const violations = [];

  for (const file of collectFiles(SRC)) {
    const rel = relative(ROOT, file).replace(/\\/g, '/');
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || line.includes('audit-ok')) return;

      for (const match of line.matchAll(DIMENSION_PROP_RE)) {
        const propName = match[1];
        const valueExpr = match[2].trim();

        if (DISALLOWED_DIMENSION_VALUE_RE.test(valueExpr)) {
          violations.push({
            file: rel,
            line: index + 1,
            prop: propName,
            value: valueExpr,
            raw: trimmed.slice(0, 120),
            reason: 'space-token',
          });
          continue;
        }

        if (line.includes('var(--')) continue;

        const numericMatch = valueExpr.match(/^(\d+)\b/);
        if (!numericMatch) continue;

        const size = Number(numericMatch[1]);
        if (!WATCHED_SIZES.has(size)) continue;

        violations.push({
          file: rel,
          line: index + 1,
          prop: propName,
          value: numericMatch[1],
          raw: trimmed.slice(0, 120),
          reason: 'raw-literal',
        });
      }
    });
  }

  return {
    ok: violations.length === 0,
    violations,
  };
}

export function main() {
  const result = runDimensionCheck();

  if (result.ok) {
    console.log('OK check-dimensions - no raw fixed-size width/height values found');
    process.exit(0);
  }

  console.error(`\nFAIL check-dimensions - ${result.violations.length} violation(s) found\n`);
  for (const violation of result.violations) {
    console.error(`  ${violation.file}:${violation.line}`);
    console.error(
      violation.reason === 'space-token'
        ? `    Problem: ${violation.prop} is using a spacing token (${violation.value})`
        : `    Problem: raw dimension literal (${violation.value}px)`,
    );
    console.error(`    Context: ${violation.raw}`);
    console.error('    Fix: use hds.size.*, hds.layout.*, or component min/max size vars for dimensions. Spacing tokens are for padding, gaps, and layout rhythm only, or add // audit-ok: <reason>\n');
  }

  process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
