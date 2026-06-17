/**
 * scripts/lib/gate-scope.mjs
 *
 * Per-file gate scoping helpers for unit 13g-2-validator-self-register.
 *
 * Two responsibilities:
 *
 * 1. `matchesScope(gate, changedFiles)` — given a gate's registry entry and
 *    a list of changed files (typically `git diff --cached --name-only`),
 *    decide whether the gate should run. Used by run-gates.mjs to skip
 *    gates whose declared `glob` doesn't match any changed path.
 *
 * 2. `register({ id, fixtures })` — forward-compat no-op stub. The
 *    orchestration unit's original spec called for each check-*.mjs to
 *    self-register at module load. The cleaner shape (this implementation)
 *    keeps the source of truth in `docs/guardrails/registry.json` and
 *    leaves `register()` as a documented no-op that can be called from
 *    individual gates without changing their behavior. Future work can
 *    promote it to an actual side-effect if the registry-only design
 *    proves insufficient.
 *
 * The scoping contract:
 *
 * - A gate's registry entry MAY declare `scope: 'full-tree'` — this gate
 *   runs unconditionally regardless of which files changed (used for gates
 *   whose correctness depends on whole-codebase observation, e.g.
 *   check-binding-drift, check-component-completeness, check-manifest-drift).
 *
 * - A gate's registry entry MAY declare `glob: '<pattern>'` or
 *   `glob: ['<a>', '<b>', …]` — minimatch-style globs. The gate runs only
 *   when at least one of the changed files matches the glob.
 *
 * - A gate with NEITHER `scope` NOR `glob` defaults to `full-tree` (safe
 *   default — never accidentally skip a gate due to missing metadata).
 *
 * - When `--scope` is NOT passed (the historical pre-commit shape), every
 *   gate runs (full-tree). Per-file scoping is opt-in.
 *
 * @module gate-scope
 */

/**
 * Tiny minimatch-subset matcher. Supports:
 *   - `**` matches anything (including slashes)
 *   - `*`  matches one path segment (no slashes)
 *   - `?`  matches one character
 *   - `{a,b,c}` brace alternation (no nesting)
 *
 * Avoids pulling in a real minimatch dep — gates run on every commit, this
 * helper must stay zero-dep + sub-millisecond.
 *
 * @param {string} pattern
 * @param {string} pathLike
 * @returns {boolean}
 */
export function matchGlob(pattern, pathLike) {
  if (!pattern) return false;
  // Expand brace alternation into multiple patterns and OR them.
  const expanded = expandBraces(pattern);
  for (const p of expanded) {
    if (matchSingle(p, pathLike)) return true;
  }
  return false;
}

function expandBraces(pattern) {
  const m = pattern.match(/\{([^{}]+)\}/);
  if (!m) return [pattern];
  const before = pattern.slice(0, m.index);
  const after = pattern.slice(m.index + m[0].length);
  const options = m[1].split(',');
  const out = [];
  for (const opt of options) {
    out.push(...expandBraces(before + opt + after));
  }
  return out;
}

function matchSingle(pattern, pathLike) {
  const re = globToRegex(pattern);
  return re.test(pathLike);
}

function globToRegex(pattern) {
  let re = '^';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') {
      re += '.*';
      i += 2;
      if (pattern[i] === '/') i += 1;  // consume trailing slash of `**/`
    } else if (c === '*') {
      re += '[^/]*';
      i += 1;
    } else if (c === '?') {
      re += '[^/]';
      i += 1;
    } else if ('.+^$()[]\\|'.includes(c)) {
      re += '\\' + c;
      i += 1;
    } else {
      re += c;
      i += 1;
    }
  }
  re += '$';
  return new RegExp(re);
}

/**
 * Decide whether a gate should run, given changed files.
 *
 * @param {object} gate         Registry entry with optional .scope and/or .glob
 * @param {string[]} changedFiles  e.g. output of `git diff --cached --name-only`
 * @returns {boolean}
 */
export function matchesScope(gate, changedFiles) {
  if (!gate) return true;
  // Explicit full-tree gates always run.
  if (gate.scope === 'full-tree') return true;
  // Gates with no glob default to full-tree (safe default).
  if (!gate.glob) return true;
  // No changed files → run (we have nothing to filter against, so be safe).
  if (!Array.isArray(changedFiles) || changedFiles.length === 0) return true;
  const globs = Array.isArray(gate.glob) ? gate.glob : [gate.glob];
  for (const f of changedFiles) {
    for (const g of globs) {
      if (matchGlob(g, f)) return true;
    }
  }
  return false;
}

/**
 * Forward-compat no-op. Documented placeholder for self-registration calls
 * in individual gate scripts. Today the registry is the source of truth
 * and `register()` does nothing observable.
 *
 * @param {object} _opts  { id, fixtures }
 */
export function register(_opts) {
  // intentional no-op
}
