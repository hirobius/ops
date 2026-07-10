#!/usr/bin/env node
/** @internal — informational lock, channel: manual. */
/**
 * check-circular-deps.mjs — circular-dependency lock (ratchet) for src/.
 *
 * Builds the intra-`src/` static import graph (relative + `@/*` alias imports),
 * finds every import cycle via Tarjan's strongly-connected-components algorithm,
 * and locks the current cycle count against a committed baseline. New cycles
 * fail the gate; removed cycles auto-tighten the lock so progress is preserved.
 *
 * This is a monotonic-decrement ratchet (same contract as
 * check-fixture-stubs-ratchet): the codebase can only get less tangled, never
 * more. It exists because circular imports are a silent source of init-order
 * bugs, undefined-at-import values, and un-tree-shakeable bundles — cheap to
 * introduce, expensive to unwind once load-bearing.
 *
 * Baseline: docs/guardrails/baselines/check-circular-deps.json
 *   Shape: { count: number, cycles: string[], updatedAt: ISO8601, sha: string }
 *   `cycles` are human-readable signatures (sorted member paths) for review.
 *
 * Exit codes:
 *   0 — cycle count <= baseline (lock holds; tightened if it dropped)
 *   1 — cycle count  > baseline (regression: a new cycle was introduced)
 *   2 — internal error
 *
 * Flags:
 *   --json          emit the canonical gate-output JSON on stdout
 *   --update        rewrite the baseline to the current count (accept new state)
 *   --fixture-mode  read the cycle count from FIXTURE_FILE (proof-of-firing);
 *                   also enabled via HDS_FIXTURE_MODE=1
 *
 * Run: node scripts/check-circular-deps.mjs
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const BASELINE_FILE = join(ROOT, 'docs', 'guardrails', 'baselines', 'check-circular-deps.json');

const EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];

const jsonMode = hasJsonFlag(process.argv);
const updateMode = process.argv.includes('--update');
const fixtureMode = process.argv.includes('--fixture-mode') || process.env.HDS_FIXTURE_MODE === '1';
const fixtureFile = process.env.FIXTURE_FILE;

// ─── Source discovery ────────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(full, out);
    } else if (EXTS.some((e) => name.endsWith(e)) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

// ─── Import extraction ───────────────────────────────────────────────────────

// static `import ... from '<x>'` / `export ... from '<x>'`, bare `import '<x>'`,
// and dynamic `import('<x>')`.
const SPEC_RES = [
  /\bimport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bexport\s+[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
];

function extractSpecs(source) {
  const specs = new Set();
  // strip line + block comments so commented-out imports don't count
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  for (const re of SPEC_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(code)) !== null) specs.add(m[1]);
  }
  return [...specs];
}

// Resolve a specifier to a real file under src/, or null if external/unresolved.
function resolveSpec(spec, fromFile) {
  let base;
  if (spec.startsWith('@/')) {
    base = join(SRC, spec.slice(2));
  } else if (spec.startsWith('.')) {
    base = resolve(dirname(fromFile), spec);
  } else {
    return null; // bare package import
  }

  const candidates = [];
  // TS allows importing `./x.js` to mean `./x.ts` — try swapping the ext too.
  const extless = base.replace(/\.(m|c)?jsx?$/, '');
  for (const b of new Set([base, extless])) {
    candidates.push(b);
    for (const e of EXTS) candidates.push(b + e);
    for (const e of EXTS) candidates.push(join(b, 'index' + e));
  }
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// ─── Graph + Tarjan SCC ──────────────────────────────────────────────────────

function buildGraph(files) {
  const graph = new Map();
  for (const f of files) graph.set(f, new Set());
  for (const f of files) {
    const specs = extractSpecs(readFileSync(f, 'utf8'));
    for (const spec of specs) {
      const target = resolveSpec(spec, f);
      if (target && graph.has(target) && target !== f) graph.get(f).add(target);
    }
  }
  return graph;
}

// Returns cycles: arrays of node paths. An SCC of size > 1 is a cycle; a
// single node with a self-edge is a (degenerate) cycle too.
function findCycles(graph) {
  let index = 0;
  const stack = [];
  const onStack = new Set();
  const indices = new Map();
  const low = new Map();
  const sccs = [];

  function strongConnect(v) {
    indices.set(v, index);
    low.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of graph.get(v)) {
      if (!indices.has(w)) {
        strongConnect(w);
        low.set(v, Math.min(low.get(v), low.get(w)));
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), indices.get(w)));
      }
    }

    if (low.get(v) === indices.get(v)) {
      const comp = [];
      let w;
      do {
        w = stack.pop();
        onStack.delete(w);
        comp.push(w);
      } while (w !== v);
      sccs.push(comp);
    }
  }

  for (const v of graph.keys()) {
    if (!indices.has(v)) strongConnect(v);
  }

  const cycles = [];
  for (const comp of sccs) {
    if (comp.length > 1) {
      cycles.push(comp);
    } else {
      const [v] = comp;
      if (graph.get(v).has(v)) cycles.push(comp);
    }
  }
  return cycles;
}

function signature(cycle) {
  return cycle
    .map((f) => relative(ROOT, f))
    .sort()
    .join(' ↔ ');
}

// ─── Baseline I/O ────────────────────────────────────────────────────────────

function readBaseline() {
  if (!existsSync(BASELINE_FILE)) return { count: 0, cycles: [] };
  try {
    return JSON.parse(readFileSync(BASELINE_FILE, 'utf8'));
  } catch {
    return { count: 0, cycles: [] };
  }
}

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'pending';
  }
}

function writeBaseline(count, cycles) {
  const payload = {
    count,
    cycles,
    updatedAt: new Date().toISOString(),
    sha: gitSha(),
  };
  writeFileSync(BASELINE_FILE, JSON.stringify(payload, null, 2) + '\n');
}

// ─── Fixture mode (proof-of-firing) ──────────────────────────────────────────

function fixtureCount() {
  const data = JSON.parse(readFileSync(fixtureFile, 'utf8'));
  if (typeof data?.cycleCount !== 'number') {
    throw new Error('fixture file must have a top-level numeric "cycleCount" field');
  }
  return { count: data.cycleCount, signatures: [] };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main() {
  let current;
  let signatures;

  if (fixtureMode && fixtureFile) {
    const fx = fixtureCount();
    current = fx.count;
    signatures = fx.signatures;
  } else {
    const files = walk(SRC);
    const graph = buildGraph(files);
    const cycles = findCycles(graph);
    signatures = cycles.map(signature).sort();
    current = signatures.length;
  }

  const baseline = readBaseline();
  const locked = typeof baseline.count === 'number' ? baseline.count : 0;

  if (updateMode) {
    writeBaseline(current, signatures);
    if (!jsonMode)
      process.stderr.write(`check-circular-deps: baseline updated → ${current} cycle(s)\n`);
    emitResult({ violations: [], summary: { current, locked: current }, ok: true }, jsonMode);
    return 0;
  }

  if (current > locked) {
    const known = new Set(baseline.cycles || []);
    const introduced = signatures.filter((s) => !known.has(s));
    const named = introduced.length ? introduced : signatures;
    const violations = named.length
      ? named.map((sig) => ({
          file: '*',
          line: null,
          rule: 'circular-dependency',
          severity: 'error',
          message: `new import cycle: ${sig}`,
        }))
      : [
          {
            // fixture / count-only mode: no signatures to name, report the delta
            file: '*',
            line: null,
            rule: 'circular-dependency',
            severity: 'error',
            message: `cycle count rose to ${current} (lock is ${locked})`,
          },
        ];
    if (!jsonMode) {
      process.stderr.write(
        `check-circular-deps: FAIL — ${current} cycle(s), lock is ${locked}.\n` +
          introduced.map((s) => `  + ${s}`).join('\n') +
          '\n',
      );
    }
    emitResult({ violations, summary: { current, locked }, ok: false }, jsonMode);
    return 1;
  }

  // Progress: fewer cycles than locked — tighten the lock (skip in json read mode).
  if (current < locked && !fixtureMode && !jsonMode) {
    writeBaseline(current, signatures);
    process.stderr.write(`check-circular-deps: lock tightened ${locked} → ${current}\n`);
  } else if (!jsonMode) {
    process.stderr.write(`check-circular-deps: OK — ${current} cycle(s), lock is ${locked}.\n`);
  }

  emitResult({ violations: [], summary: { current, locked }, ok: true }, jsonMode);
  return 0;
}

try {
  process.exit(main());
} catch (err) {
  process.stderr.write(`check-circular-deps: ${err.message}\n`);
  process.exit(2);
}
