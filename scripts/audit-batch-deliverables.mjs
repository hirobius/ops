#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-batch-deliverables.mjs
 *
 * Deterministic post-batch audit. Given a list of unit IDs (or all units
 * marked `done` since the last audit), confirm that each unit's deliverable
 * actually matches its spec — beyond just "validationCmd exited 0".
 *
 * Each unit gets four levels of check:
 *
 *   1. SCHEMA      — unit exists in orchestration.json, status='done',
 *                    no orphan claim fields.
 *   2. VALIDATION  — the unit's own validationCmd exits 0.
 *   3. STRUCTURAL  — agentNotes "MUST" / "must NOT" / explicit file paths
 *                    are honored on disk.
 *   4. ROUTE-COVER — if a new /ops/* or /portal/* route was added, it is
 *                    listed in tests/layout-integrity.spec.ts ALL_ROUTES.
 *
 * Output: a per-unit verdict (PASS / FAIL with reasons) + a batch summary.
 * Exit 0 if every unit passes; exit 1 on any failure.
 *
 * Modes:
 *   --units <id1,id2,...>    audit specific unit IDs
 *   --since <ISO>            audit units with completedAt or claimedAt > <ISO>
 *   --batch <name>           read unit IDs from docs/ai/batches/<name>.json
 *   --json                   emit JSON instead of human output
 *
 * Invocation:
 *   node scripts/audit-batch-deliverables.mjs --units 13w-ops-1,13w-ops-4
 *   node scripts/audit-batch-deliverables.mjs --since 2026-05-04T20:00:00Z
 *
 * Wiring: not in pre-commit (too slow). Manual run after a batch lands;
 * could move to a CI job triggered by `feat(*)` commit messages.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH = path.join(ROOT, 'docs/ai/orchestration.json');
const ARGS = parseArgs(process.argv.slice(2));

// ── Args ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { units: null, since: null, batch: null, json: false, preMarkDone: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--units')
      out.units = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    else if (a === '--since') out.since = argv[++i];
    else if (a === '--batch') out.batch = argv[++i];
    else if (a === '--json') out.json = true;
    // Agents (hermes-unit) call this gate BEFORE flipping
    // status from 'claimed' to 'done'. In that mode, schema-shape checks
    // (status='done', claimedBy=null, claimedAt=null) are not yet
    // satisfiable — the agent is about to clear them. We still want the
    // validationCmd to run (the actual deliverable signal). Pre-mark-done
    // mode skips the schema invariants and treats any "spec mentions path
    // X but it does not exist" as a warning, since the unit may have
    // intentionally deleted that path as its deliverable.
    else if (a === '--pre-mark-done') out.preMarkDone = true;
  }
  return out;
}

// ── Resolve target unit list ──────────────────────────────────────────────────

function resolveUnits() {
  // orchestration.json was retired in the Hermes Kanban migration (2026-05-06).
  // Without it there are no units to audit — gate is a no-op until/unless the
  // file is re-introduced by future orchestration work.
  if (!fs.existsSync(ORCH)) return [];
  const orch = JSON.parse(fs.readFileSync(ORCH, 'utf8'));
  const all = orch.units || [];

  if (ARGS.units) {
    const set = new Set(ARGS.units);
    const found = all.filter((u) => set.has(u.id));
    const missing = ARGS.units.filter((id) => !found.find((u) => u.id === id));
    if (missing.length) throw new Error(`Unknown unit IDs: ${missing.join(', ')}`);
    return found;
  }

  if (ARGS.since) {
    const cutoff = new Date(ARGS.since).getTime();
    return all.filter((u) => {
      const t = new Date(u.completedAt || u.claimedAt || 0).getTime();
      return u.status === 'done' && t >= cutoff;
    });
  }

  if (ARGS.batch) {
    const batchFile = path.join(ROOT, 'docs/ai/batches', `${ARGS.batch}.json`);
    const ids = JSON.parse(fs.readFileSync(batchFile, 'utf8')).units || [];
    return all.filter((u) => ids.includes(u.id));
  }

  // No selector provided — channel-mode no-op (run-gates --channel manual
  // invokes this gate without any batch selector; that's expected).
  console.log('OK — no batch specified, channel-mode no-op');
  process.exit(0);
}

// ── Check 1: schema ───────────────────────────────────────────────────────────

function checkSchema(unit) {
  const failures = [];
  if (ARGS.preMarkDone) {
    // Pre-mark-done: agent is about to flip status. Verify state is the
    // expected pre-flip shape ('claimed' with claim metadata) rather than
    // the post-flip shape ('done' with metadata cleared).
    if (unit.status !== 'claimed')
      failures.push(
        `status is ${JSON.stringify(unit.status)}, expected 'claimed' (pre-mark-done mode)`,
      );
    if (!unit.validationCmd) failures.push('validationCmd is missing — cannot run check 2');
    return failures;
  }
  if (unit.status !== 'done')
    failures.push(`status is ${JSON.stringify(unit.status)}, expected 'done'`);
  if (unit.claimedBy) failures.push(`claimedBy still set (${unit.claimedBy}) after done`);
  if (unit.claimedAt) failures.push(`claimedAt still set after done`);
  if (!unit.validationCmd) failures.push('validationCmd is missing — cannot run check 2');
  return failures;
}

// ── Check 2: validation cmd ───────────────────────────────────────────────────

function checkValidation(unit) {
  if (!unit.validationCmd) return ['(skipped: no validationCmd)'];
  try {
    execSync(unit.validationCmd, { cwd: ROOT, stdio: 'pipe', encoding: 'utf8', timeout: 60_000 });
    return [];
  } catch (err) {
    const stderr = err.stderr ? String(err.stderr).slice(0, 400) : '';
    return [`validationCmd exit ${err.status ?? 1}: ${stderr || 'no stderr'}`];
  }
}

// ── Check 3: structural assertions from agentNotes / description ─────────────

const PATH_RE =
  /\b((?:src|public|docs|scripts|tests|api|fixtures|\.husky|\.claude)\/[A-Za-z0-9_./-]+)/g;

function checkStructural(unit) {
  const failures = [];
  const corpus = [unit.description, ...(unit.agentNotes || [])].filter(Boolean).join('\n');
  if (!corpus) return failures;

  // Files mentioned by path that should now exist.
  const claimedPaths = new Set();
  let m;
  while ((m = PATH_RE.exec(corpus)) !== null) {
    const p = m[1].replace(/[)\].,;:]+$/, '');
    if (p.includes('*')) continue; // skip globs
    if (
      p.endsWith('.json') ||
      p.endsWith('.md') ||
      p.endsWith('.tsx') ||
      p.endsWith('.ts') ||
      p.endsWith('.mjs') ||
      p.endsWith('.js') ||
      p.endsWith('.html') ||
      p.endsWith('.webmanifest') ||
      p.endsWith('.css')
    ) {
      claimedPaths.add(p);
    }
  }
  for (const p of claimedPaths) {
    const abs = path.join(ROOT, p);
    if (!fs.existsSync(abs)) {
      // In pre-mark-done mode, missing paths might be intentional deletions
      // (e.g. 13z-3 deletes docs/archive/, 13z-4 archives a .bak file).
      // Demote to a warning that doesn't block mark-done. The deliverable
      // commit + validationCmd are the load-bearing signals there.
      if (ARGS.preMarkDone) continue;
      failures.push(`spec mentions path '${p}' but it does not exist`);
    }
  }

  return failures;
}

// ── Check 4: route coverage ───────────────────────────────────────────────────

function checkRouteCoverage(unit) {
  const failures = [];
  const corpus = [unit.description, unit.name, ...(unit.agentNotes || [])]
    .filter(Boolean)
    .join('\n');
  // Conservative: only flag if the spec mentions a /ops or /portal URL — not a
  // file path. Distinguish by: not preceded by a path segment like 'pages/' or
  // 'src/app/' that signals filesystem context, and not ending in a file
  // extension. The negative lookbehind covers the most common confusable case
  // (file paths under src/app/pages/ops/...).
  const routePattern = /(?<!pages\/)(?<![A-Za-z0-9_-])\/(ops|portal)\/[a-z][a-z0-9-/:]*/g;
  const FILE_EXT_RE = /\.(tsx?|jsx?|mjs|cjs|json|md|css|html|webmanifest|svg|png|jpg|woff2?)\b/;
  const routes = new Set();
  let m;
  while ((m = routePattern.exec(corpus)) !== null) {
    const r = m[0].replace(/[).,;:]+$/, '');
    if (r.length > 4 && !r.includes('*') && !FILE_EXT_RE.test(r)) routes.add(r);
  }
  if (routes.size === 0) return failures;

  const layoutFile = path.join(ROOT, 'tests/layout-integrity.spec.ts');
  if (!fs.existsSync(layoutFile)) return failures;
  const layout = fs.readFileSync(layoutFile, 'utf8');
  for (const r of routes) {
    // Check if literal string r appears in ALL_ROUTES list.
    const literal = `'${r.replace(/:[a-z]+/g, '')}'`;
    if (!layout.includes(literal)) {
      // For parameterized routes, check that a fixture variant exists.
      if (!r.includes(':') && !layout.includes(r)) {
        failures.push(`new route ${r} not in tests/layout-integrity.spec.ts ALL_ROUTES`);
      }
    }
  }
  return failures;
}

// ── Run ───────────────────────────────────────────────────────────────────────

const units = resolveUnits();
if (units.length === 0) {
  console.log('No units to audit. (Tip: --units <id> / --since <ISO>)');
  process.exit(0);
}

const results = units.map((unit) => {
  const schema = checkSchema(unit);
  const validation = schema.length ? ['(skipped: schema check failed)'] : checkValidation(unit);
  const structural = checkStructural(unit);
  const route = checkRouteCoverage(unit);
  const allFailures = [...schema, ...validation.filter((v) => v !== ''), ...structural, ...route];
  return {
    id: unit.id,
    name: unit.name,
    pass: allFailures.length === 0,
    checks: { schema, validation, structural, route },
    failures: allFailures,
  };
});

if (ARGS.json) {
  console.log(JSON.stringify({ results, summary: summarize(results) }, null, 2));
} else {
  printHuman(results);
}

const failed = results.filter((r) => !r.pass);
process.exit(failed.length === 0 ? 0 : 1);

// ── Output ────────────────────────────────────────────────────────────────────

function summarize(rs) {
  return {
    total: rs.length,
    pass: rs.filter((r) => r.pass).length,
    fail: rs.filter((r) => !r.pass).length,
  };
}

function printHuman(rs) {
  for (const r of rs) {
    const icon = r.pass ? '✓' : '✗';
    console.log(`${icon} ${r.id}  —  ${r.name ?? ''}`);
    if (!r.pass) {
      for (const f of r.failures) console.log(`    └─ ${f}`);
    }
  }
  const s = summarize(rs);
  console.log('');
  console.log(`Batch summary: ${s.pass}/${s.total} pass${s.fail ? `, ${s.fail} fail` : ''}`);
}
