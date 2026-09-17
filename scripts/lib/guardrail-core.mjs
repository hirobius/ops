/**
 * scripts/lib/guardrail-core.mjs — shared engine for the guardrail gate runners.
 *
 * The two registry-driven runners — run-gates.mjs and audit-soft-gates.mjs —
 * each re-implemented the same three seams:
 *   1. load + parse docs/guardrails/registry.json (same exit-2-on-failure shape);
 *   2. spawn a gate script, time it, read back its exit code + output;
 *   3. (run-gates only) select gates by channel / id / changed-file scope.
 *
 * This module owns those seams as pure, testable functions. The CLIs keep their
 * own I/O — console text, exit codes, live streaming, parallelism, inventory,
 * violation parsing — at the call site. Nothing here calls process.exit or
 * prints, so selectGates / loadRegistry can be unit-tested without a subprocess
 * and runGateCaptured can be pointed at a fixture script.
 *
 *   loadRegistry(path?)            → { ok, registry } | { ok:false, error }
 *   selectGates({...})            → { ok, gates, skippedByScope, emptyReason } | { ok:false, reason, gate }
 *   selectProbeTargets({...})     → { targets, optedOut }  (gates a meta-gate may spawn)
 *   runGateCaptured(script, opts) → { exitCode, durationMs, stdout, stderr, timedOut, spawnError }
 *   gateOutcome(gate, exitCode)   → 'pass' | 'warn' | 'fail'   (registry severity, ops#306)
 *   runGatesSerial({...})         → { results, stoppedAt }     (severity-aware fail-fast)
 *   summarizeRun(results)         → { failures, warnings, exitCode }
 *
 * Candidate #11. Note: run-gates' serial dispatch streams gate output live
 * (stdio:'inherit') and its parallel dispatch uses async spawn with a
 * concurrency cap — two concerns this synchronous capture helper intentionally
 * does NOT model. run-gates therefore keeps its own spawning and uses
 * loadRegistry + selectGates + the severity helpers here (runGatesSerial takes
 * run-gates' own spawner as an injected `runGate`). audit-soft-gates (manual
 * channel, always-capture, always --json, per-gate timeout) maps onto
 * runGateCaptured cleanly and is its consumer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { matchesScope } from './gate-scope.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const REGISTRY_PATH = path.join(ROOT, 'docs/guardrails/registry.json');

/**
 * Load + parse the guardrail registry. Does NOT call process.exit or print —
 * returns a discriminated result so each CLI keeps its own exact stderr text and
 * exit code. `error.kind` is 'not-found' | 'parse' so callers can tailor the
 * message.
 *
 * @param {string} [registryPath]
 * @returns {{ok: true, registry: any} | {ok: false, error: {kind: 'not-found'|'parse', message: string}}}
 */
export function loadRegistry(registryPath = REGISTRY_PATH) {
  if (!fs.existsSync(registryPath)) {
    return {
      ok: false,
      error: { kind: 'not-found', message: `registry not found at ${registryPath}` },
    };
  }
  try {
    const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    return { ok: true, registry };
  } catch (e) {
    return { ok: false, error: { kind: 'parse', message: e.message } };
  }
}

/**
 * Select the gates to run, given a parsed registry. Pure (no spawning, no I/O,
 * no exit). Mirrors run-gates' selection contract exactly:
 *
 *   - `gate` set      → run that one gate by id; { ok:false, reason:'gate-not-found' }
 *                       if the id is unknown.
 *   - else `channel`  → gates whose firingChannel === channel, in declaration
 *                       order. Empty ⇒ { gates:[], emptyReason:'no-gates-for-channel' }.
 *   - `changedFiles`  → (only when provided) keep gates whose scope/glob matches
 *                       at least one changed path (via gate-scope.matchesScope);
 *                       the rest are reported in `skippedByScope`. If that empties
 *                       the list ⇒ { gates:[], emptyReason:'scope-filtered-all' }.
 *
 * Channel filtering happens BEFORE scope filtering, matching run-gates: a channel
 * with no gates returns 'no-gates-for-channel' with skippedByScope:[] (scope is
 * never consulted in that case).
 *
 * @param {object} opts
 * @param {{gates: any[]}} opts.registry
 * @param {string|null} [opts.channel]
 * @param {string|null} [opts.gate]
 * @param {string[]|null} [opts.changedFiles]
 * @returns {{ok: true, gates: any[], skippedByScope: string[], emptyReason: string|null}
 *          | {ok: false, reason: 'gate-not-found', gate: string}}
 */
export function selectGates({ registry, channel = null, gate = null, changedFiles = null }) {
  const allGates = (registry && registry.gates) || [];

  if (gate) {
    const found = allGates.find((g) => g.id === gate);
    if (!found) return { ok: false, reason: 'gate-not-found', gate };
    return { ok: true, gates: [found], skippedByScope: [], emptyReason: null };
  }

  // Declaration order preserved (JSON.parse preserves array order).
  let selected = allGates.filter((g) => g.firingChannel === channel);
  if (selected.length === 0) {
    return { ok: true, gates: [], skippedByScope: [], emptyReason: 'no-gates-for-channel' };
  }

  const skippedByScope = [];
  if (changedFiles) {
    selected = selected.filter((g) => {
      const keep = matchesScope(g, changedFiles);
      if (!keep) skippedByScope.push(g.id);
      return keep;
    });
    if (selected.length === 0) {
      return { ok: true, gates: [], skippedByScope, emptyReason: 'scope-filtered-all' };
    }
  }

  return { ok: true, gates: selected, skippedByScope, emptyReason: null };
}

// ── Severity (ops#306) ────────────────────────────────────────────────────────

/** Registry severities that report a non-zero exit without failing the run. */
const ADVISORY_SEVERITIES = new Set(['warn', 'info']);

/**
 * Classify one gate's exit under its registry `severity`. Pure.
 *
 *   exit 0                         → 'pass'
 *   non-zero, severity warn|info   → 'warn'  (reported, does not fail the run)
 *   non-zero, anything else        → 'fail'  (blocks the run)
 *
 * Fails closed: a missing or unrecognised severity is treated as blocking, so a
 * gate nobody curated keeps the pre-#306 behaviour instead of silently going
 * advisory. Severity governs every non-zero exit — a crashed warn gate (exit 2)
 * warns too; the run does not second-guess the registry.
 *
 * @param {{severity?: string}} gate
 * @param {number} exitCode
 * @returns {'pass'|'warn'|'fail'}
 */
export function gateOutcome(gate, exitCode) {
  if (exitCode === 0) return 'pass';
  return ADVISORY_SEVERITIES.has(gate?.severity) ? 'warn' : 'fail';
}

/**
 * One gate's classified result, as run-gates records it.
 *
 * @param {{id: string, severity?: string}} gate
 * @param {number} exitCode
 * @returns {{id: string, severity: string|null, exitCode: number, outcome: 'pass'|'warn'|'fail'}}
 */
export function gateResult(gate, exitCode) {
  return {
    id: gate.id,
    severity: gate.severity ?? null,
    exitCode,
    outcome: gateOutcome(gate, exitCode),
  };
}

/**
 * Run gates one at a time in declaration order. The spawning is injected
 * (`runGate(gate) → exitCode`) so the control flow is testable without a
 * subprocess; run-gates passes its live-streaming spawnSync dispatcher.
 *
 * `failFast` stops at the first gate whose outcome is 'fail' — a failing warn
 * gate never stops the run (ops#306; before, pre-commit exited on the first
 * non-zero whatever its severity). `stoppedAt` is that gate's id, else null.
 *
 * @param {object} opts
 * @param {any[]} opts.gates
 * @param {(gate: any) => number} opts.runGate
 * @param {boolean} opts.failFast
 * @returns {{results: ReturnType<typeof gateResult>[], stoppedAt: string|null}}
 */
export function runGatesSerial({ gates, runGate, failFast }) {
  const results = [];
  for (const gate of gates) {
    const result = gateResult(gate, runGate(gate));
    results.push(result);
    if (failFast && result.outcome === 'fail') return { results, stoppedAt: gate.id };
  }
  return { results, stoppedAt: null };
}

/**
 * Fold classified gate results into the run's verdict. Pure. Only 'fail'
 * outcomes (error-severity gates) set exitCode 1; 'warn' outcomes are listed
 * for reporting and leave the run green.
 *
 * @param {ReturnType<typeof gateResult>[]} results
 * @returns {{failures: ReturnType<typeof gateResult>[], warnings: ReturnType<typeof gateResult>[], exitCode: 0|1}}
 */
export function summarizeRun(results) {
  const failures = results.filter((r) => r.outcome === 'fail');
  const warnings = results.filter((r) => r.outcome === 'warn');
  return { failures, warnings, exitCode: failures.length > 0 ? 1 : 0 };
}

/**
 * Select the gates a meta-gate may spawn to introspect them (e.g.
 * audit-gates-supportjson runs `node <gateScript> --json` for every gate).
 * Pure — no spawning, no I/O.
 *
 * A gate opts out with `skipMetaProbe: "<reason>"` in registry.json. That is for
 * gates that drive a full toolchain run (tsc, type-coverage, a Playwright build
 * + preview server on :5200): spawning a second copy from inside the ci-pr run
 * duplicates the work and, for Playwright, races the real run's build output
 * and port. Only a non-empty string counts — an opt-out must say why, so a bare
 * `true` or a blank reason is ignored and the gate is still probed.
 *
 * @param {object} opts
 * @param {{gates: any[]}} opts.registry
 * @param {string[]} [opts.skipChannels]  firingChannels never probed (cost)
 * @param {string|null} [opts.selfId]     the meta-gate's own id (no recursion)
 * @returns {{targets: any[], optedOut: {id: string, reason: string}[]}}
 */
export function selectProbeTargets({ registry, skipChannels = [], selfId = null }) {
  const skip = new Set(skipChannels);
  const targets = [];
  const optedOut = [];
  for (const g of (registry && registry.gates) || []) {
    if (!g || skip.has(g.firingChannel) || g.id === selfId) continue;
    const reason = typeof g.skipMetaProbe === 'string' ? g.skipMetaProbe.trim() : '';
    if (reason) {
      optedOut.push({ id: g.id, reason });
      continue;
    }
    targets.push(g);
  }
  return { targets, optedOut };
}

/**
 * Spawn a gate script under the current Node, capturing stdout/stderr, with an
 * optional per-gate timeout. Returns only the mechanical result — violation
 * parsing, recommendations, inventory, and live streaming stay at the call site.
 *
 * `exitCode` is the numeric status, or null when the process produced no numeric
 * status (killed by signal / spawn error). `timedOut` covers both the timeout
 * kill (ETIMEDOUT) and a maxBuffer overflow (ENOBUFS), matching how the audit
 * treated a hung gate.
 *
 * NOTE: run-gates.mjs deliberately does NOT use this. Its serial path streams
 * gate output live via stdio:'inherit' and its parallel path runs gates
 * concurrently via async spawn — neither is captured-synchronous. Forcing that
 * dispatch through this helper would change the commit-path UX (buffered instead
 * of live) and can't express the concurrency cap, so it keeps its own dispatch.
 *
 * @param {string} scriptPath  absolute path to the gate's .mjs
 * @param {object} [opts]
 * @param {string[]} [opts.extraArgs]  extra argv after the script (e.g. ['--json'])
 * @param {number} [opts.timeoutMs]    kill the gate after this many ms
 * @param {string} [opts.cwd]          defaults to repo ROOT
 * @param {number} [opts.maxBuffer]    stdout/stderr cap (default 32 MiB)
 * @returns {{exitCode: number|null, durationMs: number, stdout: string, stderr: string, timedOut: boolean, spawnError: Error|null}}
 */
export function runGateCaptured(
  scriptPath,
  { extraArgs = [], timeoutMs, cwd = ROOT, maxBuffer = 32 * 1024 * 1024 } = {},
) {
  const start = performance.now();
  const result = spawnSync(process.execPath, [scriptPath, ...extraArgs], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer,
    env: process.env,
  });
  const durationMs = Math.round(performance.now() - start);
  const spawnError = result.error ?? null;
  const timedOut = spawnError?.code === 'ETIMEDOUT' || spawnError?.code === 'ENOBUFS';
  return {
    exitCode: typeof result.status === 'number' ? result.status : null,
    durationMs,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut,
    spawnError,
  };
}
