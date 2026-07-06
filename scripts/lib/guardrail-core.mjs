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
 *   runGateCaptured(script, opts) → { exitCode, durationMs, stdout, stderr, timedOut, spawnError }
 *
 * Candidate #11. Note: run-gates' serial dispatch streams gate output live
 * (stdio:'inherit') and its parallel dispatch uses async spawn with a
 * concurrency cap — two concerns this synchronous capture helper intentionally
 * does NOT model. run-gates therefore keeps its own dispatch and uses only
 * loadRegistry + selectGates here. audit-soft-gates (manual channel,
 * always-capture, always --json, per-gate timeout) maps onto runGateCaptured
 * cleanly and is its consumer.
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
    return { ok: false, error: { kind: 'not-found', message: `registry not found at ${registryPath}` } };
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
