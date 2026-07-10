#!/usr/bin/env node
/** @internal — informational lock, channel: manual. */
/**
 * check-dom-node-budgets.mjs — per-file DOM-node budget lock (ratchet).
 *
 * Counts the number of JSX elements authored in each `src/app/**` component /
 * page (a static, parser-accurate proxy for rendered DOM weight — measured via
 * the TypeScript compiler API, so TS generics and comparisons never fool it)
 * and locks each file's count against a committed per-file budget baseline.
 * A file whose JSX-element count grows past its locked budget fails the gate;
 * a file that shrinks auto-tightens its budget; brand-new files are recorded at
 * their current count (allowed, then locked from that point on).
 *
 * Static count, not runtime: a `.map()` that renders N rows counts as one JSX
 * element here, so this budgets *authored* structure, not instantiated nodes.
 * That is the cheap, deterministic layer; a runtime render-count budget is a
 * possible future tightening. It still catches the common regression — a page
 * quietly accreting hand-written markup past a sane structural ceiling.
 *
 * Baseline: docs/guardrails/baselines/check-dom-node-budgets.json
 *   Shape: { budgets: { [repoRelPath]: number }, updatedAt: ISO8601, sha: string }
 *
 * Exit codes:
 *   0 — every file within its locked budget (budgets tightened where they fell)
 *   1 — one or more files exceeded their locked budget (regression)
 *   2 — internal error
 *
 * Flags:
 *   --json          emit the canonical gate-output JSON on stdout
 *   --update        rewrite the baseline to the current counts (accept new state)
 *   --fixture-mode  read an over-budget count from FIXTURE_FILE (proof-of-firing);
 *                   also enabled via HDS_FIXTURE_MODE=1
 *
 * Run: node scripts/check-dom-node-budgets.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SCAN_ROOT = join(ROOT, 'src', 'app');
const BASELINE_FILE = join(ROOT, 'docs', 'guardrails', 'baselines', 'check-dom-node-budgets.json');

const jsonMode = hasJsonFlag(process.argv);
const updateMode = process.argv.includes('--update');
const fixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

// ─── Source discovery ────────────────────────────────────────────────────────

function walkTsx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walkTsx(full, out);
    } else if (name.endsWith('.tsx') && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

// ─── JSX element count (TypeScript AST) ──────────────────────────────────────

function countJsxElements(file) {
  const sf = ts.createSourceFile(
    file,
    readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let count = 0;
  (function walk(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) count += 1;
    ts.forEachChild(node, walk);
  })(sf);
  return count;
}

function currentCounts() {
  const counts = {};
  for (const file of walkTsx(SCAN_ROOT)) {
    counts[relative(ROOT, file)] = countJsxElements(file);
  }
  return counts;
}

// ─── Baseline I/O ────────────────────────────────────────────────────────────

function readBaseline() {
  if (!existsSync(BASELINE_FILE)) return { budgets: {} };
  try {
    const b = JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
    return b && typeof b.budgets === 'object' ? b : { budgets: {} };
  } catch {
    return { budgets: {} };
  }
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'pending';
  }
}

function writeBaseline(budgets) {
  const sorted = {};
  for (const k of Object.keys(budgets).sort()) sorted[k] = budgets[k];
  const payload = { budgets: sorted, updatedAt: new Date().toISOString(), sha: gitSha() };
  writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2) + '\n');
}

// ─── Fixture mode (proof-of-firing) ──────────────────────────────────────────

function fixtureOverBudget() {
  const data = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  if (typeof data?.overBudgetCount !== 'number') {
    throw new Error('fixture file must have a top-level numeric "overBudgetCount" field');
  }
  return data.overBudgetCount;
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  const baseline = readBaseline();
  const locked = baseline.budgets || {};

  if (fixtureMode && fixtureFile) {
    const over = fixtureOverBudget();
    const violations =
      over > 0
        ? [
            {
              file: '*',
              line: null,
              rule: 'dom-node-budget',
              severity: 'error',
              message: `${over} file(s) over their DOM-node budget`,
            },
          ]
        : [];
    emitResult({ violations, summary: { overBudget: over }, ok: over === 0 }, jsonMode);
    return over > 0 ? 1 : 0;
  }

  const counts = currentCounts();

  if (updateMode) {
    writeBaseline(counts);
    if (!jsonMode) {
      process.stderr.write(
        `check-dom-node-budgets: baseline updated → ${Object.keys(counts).length} file(s)\n`,
      );
    }
    emitResult({ violations: [], summary: { files: Object.keys(counts).length }, ok: true }, jsonMode);
    return 0;
  }

  const violations = [];
  const nextBudgets = {};

  for (const [file, count] of Object.entries(counts)) {
    const budget = locked[file];
    if (budget === undefined) {
      // new file — record at current count, allowed
      nextBudgets[file] = count;
    } else if (count > budget) {
      violations.push({
        file,
        line: null,
        rule: 'dom-node-budget',
        severity: 'error',
        message: `JSX-element count ${count} exceeds locked budget ${budget}`,
      });
      nextBudgets[file] = budget; // keep the lock; do not raise it
    } else {
      nextBudgets[file] = count; // hold or tighten
    }
  }

  const ok = violations.length === 0;

  if (!ok) {
    if (!jsonMode) {
      process.stderr.write(
        `check-dom-node-budgets: FAIL — ${violations.length} file(s) over budget.\n` +
          violations.map((v) => `  ${v.file}: ${v.message}`).join('\n') + '\n',
      );
    }
    emitResult({ violations, summary: { overBudget: violations.length }, ok }, jsonMode);
    return 1;
  }

  // No regressions — persist tightened / new budgets (skip in json read mode).
  const changed = JSON.stringify(nextBudgets) !== JSON.stringify(sortObj(locked));
  if (changed && !jsonMode) {
    writeBaseline(nextBudgets);
    process.stderr.write('check-dom-node-budgets: baseline tightened/extended.\n');
  } else if (!jsonMode) {
    process.stderr.write(
      `check-dom-node-budgets: OK — ${Object.keys(counts).length} file(s) within budget.\n`,
    );
  }

  emitResult({ violations: [], summary: { files: Object.keys(counts).length }, ok: true }, jsonMode);
  return 0;
}

function sortObj(o) {
  const s = {};
  for (const k of Object.keys(o).sort()) s[k] = o[k];
  return s;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`check-dom-node-budgets: ${err.message}\n`);
  process.exit(2);
}
