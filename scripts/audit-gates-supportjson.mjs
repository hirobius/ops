#!/usr/bin/env node
/**
 * scripts/audit-gates-supportjson.mjs
 *
 * Meta-gate ratchet for the `--json` rollout (per unit 13p-8). For each
 * registered gate that is NOT in the pnpm-meta channel (skipped for cost),
 * spawn `node <gateScript> --json` with a 30s timeout, capture stdout, and
 * verify it parses as `{ violations: Array }` per the canonical contract
 * documented in `scripts/lib/gate-output.mjs`.
 *
 * Compliance buckets (mutually exclusive, one per gate):
 *   - compliant     — stdout parses, has violations: Array
 *   - partial       — stdout parses to JSON but has no violations key (or
 *                     it's not an array)
 *   - non-compliant — stdout fails JSON.parse (gate hasn't opted in yet)
 *   - errored       — gate crashed, timed out, or exit code > 1
 *
 * Severity: warn initially. The gate exits 0 always at warn-severity so
 * commits aren't blocked while we incrementally bring gates online. Once
 * `compliant === total`, flip the registry severity to `error` (manual
 * follow-on), at which point this gate exits 1 on any non-compliance.
 *
 * Output:
 *   --json mode:   one JSON object on stdout (canonical shape: each
 *                  non-compliant gate becomes a Violation with severity
 *                  'warn' and rule 'json-mode-not-implemented')
 *   default mode:  human summary table to stdout, exit 0
 *
 * Usage:
 *   node scripts/audit-gates-supportjson.mjs           # human summary
 *   node scripts/audit-gates-supportjson.mjs --json    # machine-readable
 *   node scripts/audit-gates-supportjson.mjs --strict  # exit 1 on any non-compliance
 *
 * @module audit-gates-supportjson
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(ROOT, 'docs/guardrails/registry.json');

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);
const strictMode = argv.includes('--strict');
const verbose = argv.includes('--verbose');

// ── Load registry ────────────────────────────────────────────────────────────

if (!fs.existsSync(REGISTRY_PATH)) {
  process.stderr.write(`✗ audit-gates-supportjson: registry not found at ${REGISTRY_PATH}\n`);
  process.exit(2);
}

let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
} catch (e) {
  process.stderr.write(`✗ audit-gates-supportjson: registry parse failed: ${e.message}\n`);
  process.exit(2);
}

// Skip pnpm-meta channel for cost (47 gates × 30s ≈ 23 min worst case).
// Strict cohort = pre-commit + ci-pr + manual + ci-scheduled + pre-push.
const SKIP_CHANNELS = new Set(['pnpm-meta']);
// The meta-gate must not invoke itself (recursion → infinite spawn loop).
const SELF_ID = 'audit-gates-supportjson';

const target = registry.gates.filter(
  (g) => g && !SKIP_CHANNELS.has(g.firingChannel) && g.id !== SELF_ID,
);

// ── Probe each gate ──────────────────────────────────────────────────────────

const results = [];

for (const gate of target) {
  const scriptPath = path.join(ROOT, gate.gateScript);
  if (!fs.existsSync(scriptPath)) {
    results.push({ gate, bucket: 'errored', detail: 'gateScript file not found' });
    continue;
  }

  const proc = spawnSync(process.execPath, [scriptPath, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 16 * 1024 * 1024,
    env: process.env,
  });

  if (proc.error && proc.error.code === 'ETIMEDOUT') {
    results.push({ gate, bucket: 'errored', detail: 'timed out (>30s)' });
    continue;
  }
  if (proc.error) {
    results.push({ gate, bucket: 'errored', detail: `spawn error: ${proc.error.message}` });
    continue;
  }
  // Exit codes 0 (clean) and 1 (gate found violations) are both fine for
  // compliance — the gate ran and emitted something. >1 means crash.
  if (typeof proc.status === 'number' && proc.status > 1) {
    results.push({ gate, bucket: 'errored', detail: `exit ${proc.status}` });
    continue;
  }

  const stdout = proc.stdout || '';
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    results.push({
      gate,
      bucket: 'non-compliant',
      detail: 'stdout did not parse as JSON',
      stdoutHead: stdout.slice(0, 200),
    });
    continue;
  }

  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.violations)) {
    results.push({
      gate,
      bucket: 'partial',
      detail: 'JSON parsed but missing violations: Array',
      shape: Array.isArray(parsed) ? 'top-level array' : Object.keys(parsed || {}).join(','),
    });
    continue;
  }

  results.push({
    gate,
    bucket: 'compliant',
    violationCount: parsed.violations.length,
    okFlag: parsed.ok,
  });
}

// ── Summarize ────────────────────────────────────────────────────────────────

const summary = {
  total: results.length,
  compliant: results.filter((r) => r.bucket === 'compliant').length,
  partial: results.filter((r) => r.bucket === 'partial').length,
  nonCompliant: results.filter((r) => r.bucket === 'non-compliant').length,
  errored: results.filter((r) => r.bucket === 'errored').length,
};
summary.compliancePct = summary.total === 0
  ? 0
  : Math.round((summary.compliant / summary.total) * 100);

// Convert non-compliant + partial + errored into Violation rows so the
// inventory can pick this gate's findings up via run-gates --emit-inventory.
const violations = results
  .filter((r) => r.bucket !== 'compliant')
  .map((r) => ({
    file: r.gate.gateScript,
    line: null,
    rule: 'json-mode-not-implemented',
    severity: 'warn',
    message: `${r.bucket}: ${r.detail || ''}`.trim(),
    bucket: r.bucket,
    gateId: r.gate.id,
    firingChannel: r.gate.firingChannel,
  }));

// ── Emit ─────────────────────────────────────────────────────────────────────

if (jsonMode) {
  emitResult({ violations, summary, ok: summary.compliant === summary.total }, true);
} else {
  process.stdout.write(`audit-gates-supportjson — strict-cohort gates probed: ${summary.total}\n`);
  process.stdout.write(`  compliant:     ${summary.compliant.toString().padStart(3)}\n`);
  process.stdout.write(`  partial:       ${summary.partial.toString().padStart(3)}\n`);
  process.stdout.write(`  non-compliant: ${summary.nonCompliant.toString().padStart(3)}\n`);
  process.stdout.write(`  errored:       ${summary.errored.toString().padStart(3)}\n`);
  process.stdout.write(`  compliance:    ${summary.compliancePct}%\n`);

  if (verbose || summary.compliant < summary.total) {
    process.stdout.write('\nNon-compliant / partial / errored gates:\n');
    for (const r of results) {
      if (r.bucket === 'compliant') continue;
      process.stdout.write(`  ✗ ${r.gate.id.padEnd(40)} [${r.bucket}] ${r.detail || ''}\n`);
    }
    if (verbose) {
      process.stdout.write('\nCompliant gates:\n');
      for (const r of results) {
        if (r.bucket !== 'compliant') continue;
        process.stdout.write(`  ✓ ${r.gate.id.padEnd(40)} (${r.violationCount} violations)\n`);
      }
    }
  }
}

// Exit code: warn-mode (default) → 0 always.
// strict-mode → 1 if any non-compliance.
if (strictMode && summary.compliant < summary.total) {
  process.exit(1);
}
process.exit(0);
