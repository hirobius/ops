#!/usr/bin/env node
/**
 * scripts/run-gates.mjs
 *
 * Single source of truth for "which gates run on which channel."
 *
 * Reads docs/guardrails/registry.json, filters gates by the requested
 * --channel, and invokes each gate's gateScript in declaration order
 * (serial) or up to --parallel N at a time (for ci-pr / ci-scheduled).
 *
 * Usage:
 *   node scripts/run-gates.mjs --channel pre-commit
 *   node scripts/run-gates.mjs --channel ci-pr
 *   node scripts/run-gates.mjs --channel ci-scheduled
 *   node scripts/run-gates.mjs --channel manual
 *   node scripts/run-gates.mjs --channel pre-commit --dry-run
 *   node scripts/run-gates.mjs --channel ci-pr --parallel 4
 *   node scripts/run-gates.mjs --gate check-hardcoded-colors
 *
 * Options:
 *   --channel <name>    Required (unless --gate). Filter by firingChannel.
 *   --dry-run           List which gates would run; exit 0.
 *   --parallel <N>      Run up to N gates concurrently (default: 1 for
 *                       pre-commit; 4 for ci-pr). pre-commit MUST stay serial.
 *   --gate <id>         Run a single gate by registry id (ignores --channel).
 *   --emit-jsonl <path> Append one JSONL line per gate to <path> with
 *                       {ts, channel, gate, exitCode, durationMs, commitSha},
 *                       as each gate finishes — including a failing gate,
 *                       before pre-commit's fail-fast exit (issue #330: a
 *                       violation must reach the log even when the gate that
 *                       caught it aborts the commit). Does not by itself
 *                       change fail-fast; pair with --continue-on-failure to
 *                       also run every remaining gate.
 *   --continue-on-failure
 *                       Disable pre-commit fail-fast so every gate in the
 *                       channel runs and is logged, even after one fails
 *                       (used by .husky/post-commit's full unscoped re-run,
 *                       which detects --no-verify bypasses post-hoc per
 *                       13g-12 — it needs every gate's result, not just the
 *                       first failure).
 *   --emit-inventory <path>
 *                       Write a single aggregate JSON inventory to <path> with
 *                       per-gate {id, exitCode, durationMs, supportsJson,
 *                       violations, outputTail} plus totalsByExitCode +
 *                       gatesWithJson + gatesWithoutJson. When set, fail-fast
 *                       is disabled so every gate runs (used by 13p-2 to
 *                       generate the Phase 2 strict-gate debt baseline).
 *                       Orthogonal to --emit-jsonl; both can be set together.
 *                       When a gate's registry entry has supportsJson:true,
 *                       the gate is invoked with --json appended; the parsed
 *                       structured violations array is captured. Otherwise
 *                       the last 50 lines of combined stdout/stderr are
 *                       captured as outputTail and violations is null.
 *   --scope <paths>     Comma-separated list of changed file paths
 *                       (typically `git diff --cached --name-only`). Only
 *                       gates whose registry entry has scope:'full-tree' OR
 *                       a glob matching at least one changed path will
 *                       actually run; others are skipped (logged). Gates
 *                       without scope/glob default to full-tree (safe).
 *                       Used by .husky/pre-commit for per-file scoping
 *                       per unit 13g-2-validator-self-register.
 *
 * Severity (ops#306): each gate's registry `severity` decides what a non-zero
 * exit means. `error` fails the run (and stops pre-commit's fail-fast); `warn`
 * and `info` print a warning and let the run pass. A missing or unrecognised
 * severity fails closed as `error`. Semantics: docs/guardrails/SCHEMA.md.
 * (Classification lives in scripts/lib/guardrail-core.mjs — gateOutcome,
 * runGatesSerial, summarizeRun.)
 *
 * Exit codes:
 *   0 — no error-severity gate failed (warn-severity findings may have printed)
 *   1 — one or more error-severity gates failed (details written to stderr)
 *   2 — invocation error (bad flags, registry not found, etc.)
 *
 * @module run-gates
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import {
  loadRegistry,
  selectGates,
  gateOutcome,
  gateResult,
  runGatesSerial,
  summarizeRun,
  REGISTRY_PATH,
} from './lib/guardrail-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Arg parsing ───────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);

function getFlag(name) {
  const idx = argv.indexOf(name);
  if (idx === -1) return null;
  return argv[idx + 1] ?? null;
}

function hasFlag(name) {
  return argv.includes(name);
}

const channelArg = getFlag('--channel');
const gateArg = getFlag('--gate');
const dryRun = hasFlag('--dry-run');
const parallelArg = getFlag('--parallel');
const emitJsonlArg = getFlag('--emit-jsonl');
const continueOnFailure = hasFlag('--continue-on-failure');
const emitInventoryArg = getFlag('--emit-inventory');
const scopeArg = getFlag('--scope');
const scopeFiles = scopeArg
  ? scopeArg
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

const VALID_CHANNELS = new Set([
  'pre-commit',
  'pre-push',
  'ci-pr',
  'ci-scheduled',
  'pnpm-meta',
  'manual',
]);

if (!channelArg && !gateArg) {
  console.error('✗ run-gates: --channel <name> or --gate <id> is required');
  console.error('  Valid channels: pre-commit, pre-push, ci-pr, ci-scheduled, pnpm-meta, manual');
  process.exit(2);
}

if (channelArg && !VALID_CHANNELS.has(channelArg)) {
  console.error(`✗ run-gates: unknown channel '${channelArg}'`);
  console.error(`  Valid channels: ${[...VALID_CHANNELS].join(', ')}`);
  process.exit(2);
}

// pre-commit MUST remain serial — order matters for some gates.
const isPreCommit = channelArg === 'pre-commit';
const defaultParallel = isPreCommit ? 1 : 4;
const concurrency = parallelArg ? Math.max(1, parseInt(parallelArg, 10)) : defaultParallel;

// Resolve commit SHA once at startup when emitting JSONL — used to attribute
// every per-gate firing to a specific HEAD (post-commit verifier per 13g-12).
let commitSha = null;
if (emitJsonlArg) {
  const r = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT });
  commitSha = r.status === 0 ? r.stdout.toString().trim() : null;
}

function appendFiringLog(gate, exitCode, durationMs) {
  if (!emitJsonlArg) return;
  const line =
    JSON.stringify({
      ts: new Date().toISOString(),
      channel: channelArg ?? null,
      gate: gate.id,
      exitCode,
      durationMs,
      commitSha,
    }) + '\n';
  try {
    const target = path.isAbsolute(emitJsonlArg) ? emitJsonlArg : path.join(ROOT, emitJsonlArg);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, line);
  } catch (e) {
    // Logging failure must not break the gate run; surface to stderr only.
    console.error(`✗ run-gates: emit-jsonl append failed: ${e.message}`);
  }
}

// ── Inventory capture (--emit-inventory) ──────────────────────────────────────
//
// When --emit-inventory is set, each gate's combined stdout+stderr is captured
// (instead of streamed via stdio: 'inherit'). After the gate finishes the
// captured output is re-emitted to the parent's stdout so the operator still
// sees progress, and the per-gate record is appended to inventoryRecords.
// At process exit time the aggregate is written to the inventory path.

const inventoryRecords = [];

function tailLines(text, n) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  return lines.slice(-n).join('\n');
}

function recordInventory(gate, exitCode, durationMs, captured) {
  if (!emitInventoryArg) return;
  const supportsJson = gate.supportsJson === true;
  let violations = null;
  if (supportsJson && captured && captured.stdout) {
    try {
      const parsed = JSON.parse(captured.stdout);
      // Convention: gates with --json emit either { violations: [...] } or
      // a top-level array. Accept both; record null on shape mismatch.
      if (Array.isArray(parsed)) violations = parsed;
      else if (Array.isArray(parsed?.violations)) violations = parsed.violations;
      else violations = null;
    } catch {
      violations = null;
    }
  }
  inventoryRecords.push({
    id: gate.id,
    exitCode,
    durationMs,
    supportsJson,
    violations,
    outputTail: tailLines([captured?.stdout ?? '', captured?.stderr ?? ''].join('\n'), 50),
  });
}

function writeInventory() {
  if (!emitInventoryArg) return;
  const totalsByExitCode = {};
  let gatesWithJson = 0;
  let gatesWithoutJson = 0;
  for (const r of inventoryRecords) {
    const key = String(r.exitCode);
    totalsByExitCode[key] = (totalsByExitCode[key] ?? 0) + 1;
    if (r.supportsJson) gatesWithJson += 1;
    else gatesWithoutJson += 1;
  }
  const aggregate = {
    generatedAt: new Date().toISOString(),
    channel: channelArg ?? null,
    gates: inventoryRecords,
    totalsByExitCode,
    gatesWithJson,
    gatesWithoutJson,
  };
  try {
    const target = path.isAbsolute(emitInventoryArg)
      ? emitInventoryArg
      : path.join(ROOT, emitInventoryArg);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Atomic-ish: write to .tmp then rename so a partial write never produces
    // a half-valid JSON file readable by 13p-3 strength wiring.
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(aggregate, null, 2) + '\n');
    fs.renameSync(tmp, target);
  } catch (e) {
    console.error(`✗ run-gates: emit-inventory write failed: ${e.message}`);
  }
}

if (isPreCommit && concurrency > 1) {
  console.error(
    '✗ run-gates: --parallel > 1 is not allowed for --channel pre-commit (order matters)',
  );
  process.exit(2);
}

// ── Load registry ─────────────────────────────────────────────────────────────

const loaded = loadRegistry(REGISTRY_PATH);
if (!loaded.ok) {
  if (loaded.error.kind === 'not-found') {
    console.error(`✗ run-gates: registry not found at ${REGISTRY_PATH}`);
  } else {
    console.error(`✗ run-gates: could not parse registry: ${loaded.error.message}`);
  }
  process.exit(2);
}
const registry = loaded.registry;

// ── Select gates ──────────────────────────────────────────────────────────────
//
// loadRegistry + selectGates (scripts/lib/guardrail-core.mjs) own the mechanics:
// gate-by-id lookup, channel filter (declaration order preserved), and --scope
// glob matching per unit 13g-2-validator-self-register. The exact console text,
// exit codes, and message ordering stay here so the CLI contract is unchanged.

const selection = selectGates({
  registry,
  channel: channelArg,
  gate: gateArg,
  changedFiles: scopeFiles,
});

if (!selection.ok) {
  // gate-not-found
  console.error(`✗ run-gates: gate '${selection.gate}' not found in registry`);
  process.exit(2);
}

// --scope skip log prints before any "nothing to do", matching prior order.
// (Empty channels never reach scope filtering, so skippedByScope is [] there.)
if (selection.skippedByScope.length > 0) {
  console.log(
    `run-gates: --scope skipped ${selection.skippedByScope.length} gate(s) (no glob match): ${selection.skippedByScope.join(', ')}`,
  );
}

if (selection.gates.length === 0) {
  if (selection.emptyReason === 'no-gates-for-channel') {
    console.log(`run-gates: no gates registered for channel '${channelArg}' — nothing to do`);
  } else if (selection.emptyReason === 'scope-filtered-all') {
    console.log(`run-gates: --scope filtered out every gate — nothing to do`);
  }
  process.exit(0);
}

const selectedGates = selection.gates;

// ── Dry-run ───────────────────────────────────────────────────────────────────

if (dryRun) {
  const label = gateArg ? `gate '${gateArg}'` : `channel '${channelArg}'`;
  console.log(`run-gates --dry-run (${label}):`);
  for (const gate of selectedGates) {
    const argv = buildArgv(gate);
    console.log(`  [${gate.id}]  ${argv.join(' ')}`);
  }
  console.log(`  ${selectedGates.length} gate(s) would run`);
  process.exit(0);
}

// ── Build argv for a gate ─────────────────────────────────────────────────────

/**
 * Build the argv array for invoking a gate via Node.
 *
 * If the gate has a `strictArgv` field, that arg is appended to the
 * invocation so the gate runs in its required strict mode. When inventory
 * mode is active and the gate declares supportsJson:true, --json is also
 * appended so the structured violation list lands on stdout.
 */
function buildArgv(gate) {
  const scriptPath = path.join(ROOT, gate.gateScript);
  const args = [scriptPath];
  if (gate.strictArgv) {
    args.push(gate.strictArgv);
  }
  if (emitInventoryArg && gate.supportsJson === true) {
    args.push('--json');
  }
  return args;
}

// ── Run a single gate (returns exit code) ────────────────────────────────────

/**
 * Invoke a single gate synchronously via spawnSync (used for serial execution).
 * Streams output directly to the parent's stdout/stderr unless --emit-inventory
 * is set, in which case stdout/stderr is captured and re-emitted after the
 * gate finishes (so the inventory record can hold a clean stdout for JSON
 * parsing without it being split across the parent's terminal).
 */
function runGateSync(gate) {
  const args = buildArgv(gate);
  const start = performance.now();
  const useCapture = !!emitInventoryArg;
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: useCapture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
    encoding: useCapture ? 'utf8' : undefined,
    maxBuffer: useCapture ? 64 * 1024 * 1024 : undefined,
  });
  const code = result.status ?? 1;
  const durationMs = Math.round(performance.now() - start);
  if (useCapture) {
    const captured = { stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
    if (captured.stdout) process.stdout.write(captured.stdout);
    if (captured.stderr) process.stderr.write(captured.stderr);
    recordInventory(gate, code, durationMs, captured);
  }
  appendFiringLog(gate, code, durationMs);
  return code;
}

/**
 * Invoke a single gate asynchronously (used for parallel execution).
 * Resolves with exit code.
 */
function runGateAsync(gate) {
  return new Promise((resolve) => {
    const args = buildArgv(gate);
    const start = performance.now();
    const useCapture = !!emitInventoryArg;
    const child = spawn(process.execPath, args, {
      cwd: ROOT,
      stdio: useCapture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      env: process.env,
    });
    let stdoutBuf = '';
    let stderrBuf = '';
    if (useCapture) {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderrBuf += chunk;
      });
    }
    child.on('close', (code) => {
      const exit = code ?? 1;
      const durationMs = Math.round(performance.now() - start);
      if (useCapture) {
        if (stdoutBuf) process.stdout.write(stdoutBuf);
        if (stderrBuf) process.stderr.write(stderrBuf);
        recordInventory(gate, exit, durationMs, { stdout: stdoutBuf, stderr: stderrBuf });
      }
      appendFiringLog(gate, exit, durationMs);
      resolve(exit);
    });
    child.on('error', (err) => {
      console.error(`✗ run-gates: spawn error for gate '${gate.id}': ${err.message}`);
      const durationMs = Math.round(performance.now() - start);
      if (useCapture) {
        recordInventory(gate, 1, durationMs, {
          stdout: stdoutBuf,
          stderr: stderrBuf + `\n${err.message}`,
        });
      }
      appendFiringLog(gate, 1, durationMs);
      resolve(1);
    });
  });
}

// ── Execute all selected gates ────────────────────────────────────────────────

const label = gateArg
  ? `gate '${gateArg}'`
  : `channel '${channelArg}' (${selectedGates.length} gate(s))`;

console.log(`run-gates: running ${label}`);

const results = [];

if (concurrency <= 1) {
  // Serial execution — declaration order preserved.
  // For pre-commit, fail fast on the first failing ERROR-severity gate — a
  // failing warn gate prints and the run continues (ops#306). Fail-fast is off
  // when --continue-on-failure is set (post-commit's logger needs every gate's
  // result, even after one fails — see 13g-12-postcommit-verifier) OR
  // --emit-inventory is set (debt-baseline run needs every gate's result so the
  // inventory file isn't truncated mid-channel — see 13p-1/13p-2). --emit-jsonl
  // alone does NOT disable fail-fast: the failing gate's own entry is appended
  // in runGateSync before the stop, so a blocking pre-commit run can log a
  // violation and still stop at the first failure (issue #330) instead of
  // paying for every remaining gate on every failed commit.
  const serial = runGatesSerial({
    gates: selectedGates,
    failFast: isPreCommit && !continueOnFailure && !emitInventoryArg,
    runGate: (gate) => {
      console.log(`\n── [${gate.id}] ──`);
      const code = runGateSync(gate);
      reportWarnedGate(gate, code);
      return code;
    },
  });
  results.push(...serial.results);
  if (serial.stoppedAt) {
    const { exitCode } = serial.results.at(-1);
    console.error(`\n✗ run-gates: gate '${serial.stoppedAt}' failed (exit ${exitCode})`);
    writeInventory();
    process.exit(1);
  }
} else {
  // Parallel execution with concurrency cap
  let cursor = 0;

  async function runWorker() {
    while (cursor < selectedGates.length) {
      const gate = selectedGates[cursor++];
      console.log(`\n── [${gate.id}] ──`);
      const code = await runGateAsync(gate);
      reportWarnedGate(gate, code);
      results.push(gateResult(gate, code));
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, selectedGates.length) }, runWorker);
  await Promise.all(workers);
}

/**
 * Right under a gate's own output, flag a non-zero exit that will NOT block the
 * run (warn/info severity), so a red-looking gate isn't mistaken for the reason
 * a commit stopped. Blocking failures are reported by the fail-fast / summary.
 */
function reportWarnedGate(gate, exitCode) {
  if (gateOutcome(gate, exitCode) !== 'warn') return;
  console.warn(
    `⚠ run-gates: [${gate.id}] exit ${exitCode} — severity '${gate.severity}', reported, not blocking`,
  );
}

// ── Final summary ─────────────────────────────────────────────────────────────

writeInventory();

const { failures, warnings } = summarizeRun(results);

if (warnings.length > 0) {
  console.warn(`\n⚠ run-gates: ${warnings.length} gate(s) warned (not blocking):`);
  for (const { id, severity, exitCode } of warnings) {
    console.warn(`    [${id}] exit ${exitCode} (severity '${severity}')`);
  }
}

if (failures.length === 0) {
  const passed = selectedGates.length - warnings.length;
  console.log(
    warnings.length === 0
      ? `\n✓ run-gates: all ${selectedGates.length} gate(s) passed`
      : `\n✓ run-gates: no blocking failures (${passed} passed, ${warnings.length} warned)`,
  );
  process.exit(0);
} else {
  console.error(`\n✗ run-gates: ${failures.length} gate(s) failed:`);
  for (const { id, exitCode } of failures) {
    console.error(`    [${id}] exit ${exitCode}`);
  }
  // When --emit-inventory is set, exit 0 even if gates failed: the inventory's
  // job is to capture the current state of debt for downstream classification.
  // The failures table still prints to stderr for human visibility. (--emit-jsonl
  // is unchanged: it logs but still exits 1 because it's used post-commit to
  // detect bypass, where the exit signals "post-commit found a real failure".)
  if (emitInventoryArg) {
    console.error(`(--emit-inventory: exiting 0 — inventory captured)`);
    process.exit(0);
  }
  process.exit(1);
}
