#!/usr/bin/env node
/**
 * scripts/audit-soft-gates.mjs
 *
 * Soft-gates audit: identifies every registered gate in docs/guardrails/registry.json
 * that does NOT fire on a strict channel (pre-commit / pre-push / ci-pr), runs each
 * against the current codebase, and generates a triage report so Adrian can decide
 * which soft gates can be promoted to strict channels immediately, which need a
 * baseline first, and which should stay soft.
 *
 * Strict channels: pre-commit, pre-push, ci-pr
 * Soft channels:   manual, pnpm-meta, ci-scheduled (and any others)
 *
 * For each soft gate the script records:
 *   - exitCode      — 0 = clean, non-zero = has violations
 *   - durationMs    — wall-clock via process.hrtime.bigint
 *   - violationCount — parsed from --json stdout when available; null otherwise
 *   - severity      — from registry
 *   - recommendation — derived from exit + duration + severity
 *
 * Recommendation logic:
 *   exitCode 0 + duration < 500ms + severity error    → promote-to-pre-commit
 *   exitCode 0 + duration < 500ms + severity warn     → promote-to-pre-commit
 *   exitCode 0 + duration 500-2000ms + severity ≥ warn → promote-to-pre-push
 *   exitCode 0 + duration > 2000ms                    → promote-to-ci-pr
 *   exitCode non-zero + violationCount > 0             → baseline-then-promote
 *   exitCode non-zero + violationCount null            → investigate-broken
 *   severity info or duration > 5000ms                → stay-soft
 *
 * Outputs:
 *   /tmp/soft-gates-audit.json          — machine-readable inventory
 *   /tmp/soft-gates-promotion-plan.md   — human-readable promotion plan
 *   docs/guardrails/soft-gate-promotion-plan.md — canonical copy of the plan
 *
 * Flags:
 *   --summary   Print a human-readable table to stdout, grouped by recommendation
 *   --json      Emit the JSON inventory to stdout (for machine consumers)
 *   --dry-run   Skip actually running gates (all results = "unknown")
 *
 * @category Audit
 * @tier meta-observability
 *
 * Wired by: docs/guardrails/registry.json (firingChannel: manual)
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY_PATH = path.join(ROOT, 'docs/guardrails/registry.json');
const OUT_JSON = '/tmp/soft-gates-audit.json';
const OUT_PLAN = '/tmp/soft-gates-promotion-plan.md';
const OUT_PLAN_CANONICAL = path.join(ROOT, 'docs/guardrails/soft-gate-promotion-plan.md');

const STRICT_CHANNELS = new Set(['pre-commit', 'pre-push', 'ci-pr']);
const SELF_ID = 'audit-soft-gates';

const argv = process.argv.slice(2);
const SUMMARY_MODE = argv.includes('--summary');
const JSON_MODE = argv.includes('--json');
const DRY_RUN = argv.includes('--dry-run');

// Per-gate timeout in milliseconds
const GATE_TIMEOUT_MS = 60_000;

// ── Load registry ─────────────────────────────────────────────────────────────

if (!fs.existsSync(REGISTRY_PATH)) {
  process.stderr.write(`audit-soft-gates: registry not found at ${REGISTRY_PATH}\n`);
  process.exit(2);
}

let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
} catch (e) {
  process.stderr.write(`audit-soft-gates: registry parse failed: ${e.message}\n`);
  process.exit(2);
}

// Filter to soft gates (exclude strict channels and skip self)
const softGates = (registry.gates || []).filter(
  (g) => g && !STRICT_CHANNELS.has(g.firingChannel) && g.id !== SELF_ID,
);

// ── Run each gate ─────────────────────────────────────────────────────────────

/**
 * Derive a recommendation from the audit result.
 */
function recommend({ exitCode, durationMs, violationCount, severity }) {
  // Hard overrides — slow or info-level gates stay soft regardless of exit
  if (severity === 'info') return 'stay-soft';
  if (durationMs > 5000) return 'stay-soft';

  // Broken gates (non-zero exit, no parseable violations)
  if (exitCode !== 0 && violationCount === null) return 'investigate-broken';

  // Gates with active violations — need a baseline before promoting
  if (exitCode !== 0 && violationCount !== null && violationCount > 0)
    return 'baseline-then-promote';

  // Clean gates — decide by speed
  if (exitCode === 0) {
    if (durationMs < 500) return 'promote-to-pre-commit';
    if (durationMs <= 2000) return 'promote-to-pre-push';
    return 'promote-to-ci-pr';
  }

  // exitCode non-zero but violationCount === 0 → gate returned non-zero for other reason
  return 'investigate-broken';
}

/**
 * Run a single gate and capture the result.
 */
function runGate(gate) {
  const scriptPath = path.join(ROOT, gate.gateScript);

  if (!fs.existsSync(scriptPath)) {
    return {
      id: gate.id,
      currentChannel: gate.firingChannel,
      exitCode: null,
      durationMs: 0,
      violationCount: null,
      severity: gate.severity || 'warn',
      error: 'gateScript file not found',
      recommendation: 'investigate-broken',
    };
  }

  if (DRY_RUN) {
    return {
      id: gate.id,
      currentChannel: gate.firingChannel,
      exitCode: null,
      durationMs: 0,
      violationCount: null,
      severity: gate.severity || 'warn',
      error: 'dry-run: not executed',
      recommendation: 'stay-soft',
    };
  }

  // Run with --json first to capture violations
  const startJson = process.hrtime.bigint();
  const jsonProc = spawnSync(process.execPath, [scriptPath, '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: GATE_TIMEOUT_MS,
    maxBuffer: 32 * 1024 * 1024,
    env: process.env,
  });
  const durationJsonMs = Number(process.hrtime.bigint() - startJson) / 1_000_000;

  // If --json timed out or errored badly, fall back to plain run
  const jsonTimedOut = jsonProc.error?.code === 'ETIMEDOUT' || jsonProc.error?.code === 'ENOBUFS';

  let exitCode;
  let durationMs;
  let violationCount = null;

  if (jsonTimedOut) {
    // Gate hung — record as investigate-broken
    return {
      id: gate.id,
      currentChannel: gate.firingChannel,
      exitCode: null,
      durationMs: GATE_TIMEOUT_MS,
      violationCount: null,
      severity: gate.severity || 'warn',
      error: 'timed out',
      recommendation: 'investigate-broken',
    };
  }

  if (jsonProc.error) {
    return {
      id: gate.id,
      currentChannel: gate.firingChannel,
      exitCode: null,
      durationMs: Math.round(durationJsonMs),
      violationCount: null,
      severity: gate.severity || 'warn',
      error: `spawn error: ${jsonProc.error.message}`,
      recommendation: 'investigate-broken',
    };
  }

  exitCode = typeof jsonProc.status === 'number' ? jsonProc.status : null;
  durationMs = Math.round(durationJsonMs);

  // Try to parse violations from --json stdout
  if (gate.supportsJson !== false) {
    const stdout = (jsonProc.stdout || '').trim();
    // Strip any leading non-JSON lines (some gates emit warnings before JSON)
    const jsonStart = stdout.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(stdout.slice(jsonStart));
        if (Array.isArray(parsed.violations)) {
          violationCount = parsed.violations.length;
        }
      } catch {
        // --json not supported or malformed — violationCount stays null
      }
    }
  }

  // If --json mode didn't actually reflect the clean/dirty state
  // (e.g. gate doesn't support --json but still exited), accept the exit code.
  // If violationCount is still null and exit was non-zero, the gate exited dirty
  // but we can't count violations.

  const severity = gate.severity || 'warn';
  const recommendation = recommend({
    exitCode: exitCode ?? 1,
    durationMs,
    violationCount,
    severity,
  });

  return {
    id: gate.id,
    currentChannel: gate.firingChannel,
    exitCode,
    durationMs,
    violationCount,
    severity,
    recommendation,
  };
}

// ── Execute audit ─────────────────────────────────────────────────────────────

if (!JSON_MODE && !SUMMARY_MODE) {
  process.stderr.write(
    `audit-soft-gates: auditing ${softGates.length} soft gates (timeout ${GATE_TIMEOUT_MS / 1000}s each)…\n`,
  );
}

const results = [];
for (const gate of softGates) {
  if (!JSON_MODE && !SUMMARY_MODE) {
    process.stderr.write(`  running ${gate.id}…\n`);
  }
  results.push(runGate(gate));
}

const inventory = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  results,
};

// Write JSON inventory
fs.writeFileSync(OUT_JSON, JSON.stringify(inventory, null, 2), 'utf8');

// ── Bucket counts ─────────────────────────────────────────────────────────────

const BUCKETS = [
  'promote-to-pre-commit',
  'promote-to-pre-push',
  'promote-to-ci-pr',
  'baseline-then-promote',
  'investigate-broken',
  'stay-soft',
];

/** @param {string} bucket */
function bucketResults(bucket) {
  return results.filter((r) => r.recommendation === bucket);
}

// ── Build promotion plan markdown ─────────────────────────────────────────────

function severityOrder(s) {
  return s === 'error' ? 0 : s === 'warn' ? 1 : 2;
}

function buildPromotionPlan() {
  const now = new Date().toISOString();
  const _bucketCounts = BUCKETS.map((b) => `${bucketResults(b).length} ${b}`).join(', ');

  // Calculate A4 score lift
  const currentStrict = 25; // from strength-report.json raw.strict
  const totalGates = 74; // from strength-report.json raw.total
  const promotableNow =
    bucketResults('promote-to-pre-commit').length +
    bucketResults('promote-to-pre-push').length +
    bucketResults('promote-to-ci-pr').length;
  const newStrict = currentStrict + promotableNow;
  const newA4Score = Math.round((newStrict / totalGates) * 100);
  const currentA4Score = Math.round((currentStrict / totalGates) * 100);
  const scoreLift = newA4Score - currentA4Score;

  const lines = [];

  lines.push(`# Soft-Gate Promotion Plan`);
  lines.push(`> Generated ${now}`);
  lines.push(``);
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(
    `**Total soft gates audited:** ${results.length} (of ${registry.gates.length} registered)`,
  );
  lines.push(``);
  lines.push(`| Recommendation | Count |`);
  lines.push(`|---|---|`);
  for (const b of BUCKETS) {
    lines.push(`| ${b} | ${bucketResults(b).length} |`);
  }
  lines.push(``);

  // Section: Promotable now
  const promotableNowList = [
    ...bucketResults('promote-to-pre-commit').sort(
      (a, b) => severityOrder(a.severity) - severityOrder(b.severity),
    ),
    ...bucketResults('promote-to-pre-push').sort(
      (a, b) => severityOrder(a.severity) - severityOrder(b.severity),
    ),
    ...bucketResults('promote-to-ci-pr').sort(
      (a, b) => severityOrder(a.severity) - severityOrder(b.severity),
    ),
  ];

  lines.push(`## Promotable now (clean + fast)`);
  lines.push(``);
  lines.push(
    `These gates exited 0 on the current tree and are fast enough to promote without a baseline.`,
  );
  lines.push(``);
  if (promotableNowList.length === 0) {
    lines.push(`_None._`);
  } else {
    lines.push(`| id | current channel | severity | duration (ms) | target channel |`);
    lines.push(`|---|---|---|---|---|`);
    for (const r of promotableNowList) {
      lines.push(
        `| ${r.id} | ${r.currentChannel} | ${r.severity} | ${r.durationMs} | ${r.recommendation.replace('promote-to-', '')} |`,
      );
    }
  }
  lines.push(``);

  // Section: Promotable after baseline
  const needsBaseline = bucketResults('baseline-then-promote').sort(
    (a, b) => severityOrder(a.severity) - severityOrder(b.severity),
  );

  lines.push(`## Promotable after baseline`);
  lines.push(``);
  lines.push(
    `These gates found violations on the current tree. Record a baseline, burn down the violations, then promote.`,
  );
  lines.push(``);
  if (needsBaseline.length === 0) {
    lines.push(`_None._`);
  } else {
    lines.push(`| id | current channel | severity | violations | duration (ms) |`);
    lines.push(`|---|---|---|---|---|`);
    for (const r of needsBaseline) {
      lines.push(
        `| ${r.id} | ${r.currentChannel} | ${r.severity} | ${r.violationCount ?? '?'} | ${r.durationMs} |`,
      );
    }
  }
  lines.push(``);

  // Section: Investigate
  const broken = bucketResults('investigate-broken');

  lines.push(`## Investigate`);
  lines.push(``);
  lines.push(
    `These gates crashed, timed out, or returned an unexpected exit code. Fix before considering promotion.`,
  );
  lines.push(``);
  if (broken.length === 0) {
    lines.push(`_None._`);
  } else {
    lines.push(`| id | current channel | severity | exit code | error |`);
    lines.push(`|---|---|---|---|---|`);
    for (const r of broken) {
      const errStr = (r.error || '').replace(/\|/g, '&#124;');
      lines.push(
        `| ${r.id} | ${r.currentChannel} | ${r.severity} | ${r.exitCode ?? 'null'} | ${errStr} |`,
      );
    }
  }
  lines.push(``);

  // Section: Stay soft
  const staySoft = bucketResults('stay-soft');

  lines.push(`## Stay soft`);
  lines.push(``);
  lines.push(
    `These gates are slow (>5s), info-severity, or are artifact-generators — appropriate as manual / ci-scheduled only.`,
  );
  lines.push(``);
  if (staySoft.length === 0) {
    lines.push(`_None._`);
  } else {
    lines.push(`| id | current channel | severity | duration (ms) |`);
    lines.push(`|---|---|---|---|`);
    for (const r of staySoft.sort((a, b) => b.durationMs - a.durationMs)) {
      lines.push(`| ${r.id} | ${r.currentChannel} | ${r.severity} | ${r.durationMs} |`);
    }
  }
  lines.push(``);

  // Final paragraph
  lines.push(`## Estimated A4 score lift`);
  lines.push(``);
  lines.push(
    `Current A4 (Strict Gating): **${currentA4Score}/100** (${currentStrict}/${totalGates} strict).`,
  );
  lines.push(
    `If Adrian accepts all ${promotableNow} "Promotable now" recommendations, ` +
      `strict count rises to **${newStrict}/${totalGates}** → A4 score **${newA4Score}/100** ` +
      `(+${scoreLift} points).`,
  );
  lines.push(``);
  lines.push(`> This plan is advisory only. No firingChannel values have been changed.`);
  lines.push(
    `> Run \`pnpm audit:soft-gates\` again after any promotions to verify the updated baseline.`,
  );

  return lines.join('\n') + '\n';
}

const planMd = buildPromotionPlan();

fs.writeFileSync(OUT_PLAN, planMd, 'utf8');
fs.writeFileSync(OUT_PLAN_CANONICAL, planMd, 'utf8');

// ── Output modes ──────────────────────────────────────────────────────────────

if (JSON_MODE) {
  process.stdout.write(JSON.stringify(inventory, null, 2) + '\n');
  process.exit(0);
}

if (SUMMARY_MODE) {
  // Print a human-readable table grouped by recommendation bucket
  const pad = (s, n) =>
    String(s ?? '')
      .substring(0, n)
      .padEnd(n);

  console.log('');
  console.log(`Soft-gate audit — ${results.length} gates audited (${new Date().toISOString()})`);
  console.log('');

  for (const bucket of BUCKETS) {
    const rows = bucketResults(bucket);
    if (rows.length === 0) continue;
    console.log(
      `─── ${bucket.toUpperCase()} (${rows.length}) ${'─'.repeat(Math.max(0, 60 - bucket.length - 10))}`,
    );
    console.log(
      `  ${pad('id', 45)} ${pad('channel', 14)} ${pad('exit', 5)} ${pad('ms', 7)} ${pad('violations', 10)} ${pad('severity', 8)}`,
    );
    console.log(`  ${'─'.repeat(100)}`);
    for (const r of rows) {
      console.log(
        `  ${pad(r.id, 45)} ${pad(r.currentChannel, 14)} ${pad(r.exitCode, 5)} ${pad(r.durationMs, 7)} ${pad(r.violationCount, 10)} ${pad(r.severity, 8)}`,
      );
    }
    console.log('');
  }

  console.log(`Promotion plan written to: ${OUT_PLAN_CANONICAL}`);
  console.log(`JSON inventory written to:  ${OUT_JSON}`);
  console.log('');
  process.exit(0);
}

// Default: silent run (just writes files)
process.exit(0);
