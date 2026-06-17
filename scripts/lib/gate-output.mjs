/**
 * scripts/lib/gate-output.mjs
 *
 * Shared `--json` contract for guardrail gates. Per unit
 * 13p-7-gate-output-helper, every registered gate (eventually) accepts a
 * `--json` flag; when set, the gate emits ONLY a JSON object on stdout
 * matching the canonical shape, and any human messages go to stderr.
 *
 * The contract:
 *
 *   On stdout (when jsonMode):
 *     { violations: Violation[], summary?: object, ok: boolean }
 *
 *   On stderr (always allowed): human-readable progress, errors, etc.
 *
 *   When NOT jsonMode: human output as today; emitResult is a no-op.
 *
 * `scripts/run-gates.mjs --emit-inventory` consumes this shape: it parses
 * each gate's stdout when `supportsJson:true` is set on the registry entry
 * and stores the structured violation list in
 * `docs/guardrails/full-strictness-inventory.json`. The closure plan
 * auto-generator (13p-10) reads that inventory to produce per-row
 * classification entries.
 *
 * Standard CLI practice (jq, gh, kubectl, eslint, prettier, …): when
 * machine output is requested, stdout is JSON-only.
 *
 * @module gate-output
 */

/**
 * @typedef {Object} Violation
 * @property {string} file       Repo-relative path. Use `'*'` if the
 *                               violation is not file-scoped (e.g. global
 *                               registry drift).
 * @property {number|null} line  1-indexed line number, or null when not
 *                               line-scoped.
 * @property {string} rule       Gate-internal rule identifier
 *                               (e.g. 'OFF_GRID_SPACING', 'token-path-unresolved').
 * @property {('error'|'warn'|'baselined'|'info')} severity
 *                               'error'     — must be fixed; counts as debt
 *                               'warn'      — should be fixed; counts as debt
 *                               'baselined' — known/frozen debt; counts toward
 *                                             burn-down ratios but not exit code
 *                               'info'      — informational; doesn't count
 *                                             toward A6 closure ratio
 * @property {string} [message]  One-line human description.
 * @property {*}      [...extra] Gate-specific extras (sample, suggestion,
 *                               category, etc.). Pass through to the
 *                               inventory; downstream consumers can read.
 */

/**
 * @typedef {Object} GateResult
 * @property {Violation[]} violations
 * @property {Object}      [summary]  Free-form per-gate counters
 *                                    (e.g. { total, baselined, real }).
 * @property {boolean}     ok         True when no error-severity violations.
 */

/**
 * Detect `--json` in a process.argv-shaped array. Tolerant of position
 * and of extra args around it.
 *
 * @param {readonly string[]} argv
 * @returns {boolean}
 */
export function hasJsonFlag(argv) {
  if (!Array.isArray(argv)) return false;
  return argv.includes('--json');
}

/**
 * Emit the gate result. When `jsonMode` is true, write a single JSON
 * object to stdout and nothing else. When false, no-op (the gate keeps
 * its existing human output via console.log / process.stdout.write).
 *
 * The JSON output is serialized with `JSON.stringify(result, null, 2)` +
 * a trailing newline so it's both pipe-able and human-readable when
 * eyeballed.
 *
 * @param {GateResult} result
 * @param {boolean}    jsonMode
 */
export function emitResult(result, jsonMode) {
  if (!jsonMode) return;
  if (!result || typeof result !== 'object') {
    process.stdout.write(JSON.stringify({ violations: [], ok: true }, null, 2) + '\n');
    return;
  }
  const payload = {
    violations: Array.isArray(result.violations) ? result.violations : [],
    ...(result.summary !== undefined ? { summary: result.summary } : {}),
    ok: typeof result.ok === 'boolean'
      ? result.ok
      : !(Array.isArray(result.violations) && result.violations.some((v) => v?.severity === 'error')),
  };
  process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
}

/**
 * Convenience: derive an exit code from a violations list using the
 * standard convention (any error-severity → 1; warn/baselined/info → 0).
 *
 * Gates may override this if their existing semantics differ (e.g. a
 * gate that exits 1 on a warn-severity finding can compute its own code
 * and skip this helper).
 *
 * @param {Violation[]} violations
 * @returns {0|1}
 */
export function exitCodeFor(violations) {
  if (!Array.isArray(violations)) return 0;
  return violations.some((v) => v?.severity === 'error') ? 1 : 0;
}
