#!/usr/bin/env node
/**
 * scripts/triage-approved.mjs
 *
 * Triage actions for orchestration's `approved` bucket. Complements
 * `_retired-2026-05-06/list-eligible.mjs` (which just lists eligible units)
 * and `audit-claims.mjs` (which finds stale `claimed` units). This script
 * focuses on the `status: approved` queue: grouping, age, dependencies,
 * cluster sanity, priority adjustment, archive suggestions.
 *
 * Per t_1ee84225 agentNotes:
 *   - Output shape: { byCluster, byAge, withMissingDeps, candidatesForArchive }
 *   - Don't auto-modify orchestration.json — emit suggestions; Adrian edits.
 *   - Dual mode: text + JSON, like list-eligible.mjs.
 *
 * Subcommands (one per invocation):
 *
 *   --list                 default; print all approved units grouped by phase + cluster
 *   --stale=<days>         list approved units first-seen-as-approved >N days ago
 *   --archive-stale=<days> dry-run suggestions for archive-stale candidates;
 *                          with --apply, rewrites orchestration.json (status: archived
 *                          + archivedAt + archivedReason)
 *   --re-cluster           detect units whose `id` prefix doesn't match `cluster` family
 *   --priority=<id>:<n>    show priority change diff (dry-run); --apply persists it
 *   --deps=<id>            print dependency tree for unit; warn missing/circular
 *
 * Modifiers:
 *   --json                 machine-readable output (single JSON object on stdout)
 *   --apply                opt-in mutation gate for --archive-stale / --priority
 *
 * Stale-age signal: approved units don't carry an `approvedAt` field, so
 * "stale" is derived from the dated snapshots in `docs/ai/snapshots/` —
 * specifically the oldest snapshot in which the unit appears as `approved`.
 * If no snapshot has the unit, age is treated as 0 (recently approved).
 *
 * @module triage-approved
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

// ── Paths + args ──────────────────────────────────────────────────────────────

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH = path.join(ROOT, 'docs/ai/orchestration.json');
const SNAPSHOTS_DIR = path.join(ROOT, 'docs/ai/snapshots');

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);
const apply = argv.includes('--apply');

function getArg(prefix) {
  const found = argv.find((a) => a === prefix || a.startsWith(prefix + '='));
  if (!found) return null;
  if (found === prefix) return ''; // bare flag
  return found.slice(prefix.length + 1);
}

const subStale = getArg('--stale');
const subArchive = getArg('--archive-stale');
const subRecluster = argv.includes('--re-cluster');
const subPriority = getArg('--priority');
const subDeps = getArg('--deps');

// Default: --list when no other subcommand
const subList = argv.includes('--list')
  || (subStale === null
   && subArchive === null
   && !subRecluster
   && subPriority === null
   && subDeps === null);

// ── Load orchestration ────────────────────────────────────────────────────────

let orch;
try {
  orch = JSON.parse(fs.readFileSync(ORCH, 'utf8'));
} catch (err) {
  if (jsonMode) {
    console.log(JSON.stringify({ violations: [], summary: { error: String(err?.message || err) }, ok: false }, null, 2));
  } else {
    console.error(`triage-approved: cannot read orchestration.json — ${err?.message || err}`);
  }
  process.exit(1);
}

const allUnits = Array.isArray(orch.units) ? orch.units : Object.values(orch.units ?? {});
const approved = allUnits.filter((u) => u.status === 'approved');
const idIndex = new Map(allUnits.map((u) => [u.id, u]));

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract a cluster-family prefix from an id (e.g. "12i-bloat-foo" → "12i"). */
function idFamily(id) {
  if (typeof id !== 'string') return '';
  const m = id.match(/^([A-Za-z0-9]+)/);
  return m ? m[1] : '';
}

/** Extract a cluster-family prefix from a cluster string. */
function clusterFamily(cluster) {
  if (typeof cluster !== 'string') return '';
  const m = cluster.match(/^([A-Za-z0-9]+)/);
  return m ? m[1] : '';
}

/**
 * Build a snapshot-age index: for each approved unit, find the oldest
 * snapshot in which it appears with status='approved'. Returns Map<id, ageDays>.
 *
 * Filenames look like: orchestration-2026-05-06.json or
 * orchestration-pre-compact-2026-05-06T070036Z.json.
 *
 * Best-effort: missing snapshots dir, parse errors, malformed names all
 * resolve to "no signal" (treat unit as 0-days-old).
 */
function buildAgeIndex() {
  const ageById = new Map();
  if (!fs.existsSync(SNAPSHOTS_DIR)) return ageById;

  const files = fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      const m = f.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = m ? m[1] : null;
      const date = dateStr ? new Date(dateStr + 'T00:00:00Z') : null;
      return { name: f, date };
    })
    .filter((x) => x.date && !Number.isNaN(x.date.getTime()))
    .sort((a, b) => a.date.getTime() - b.date.getTime()); // oldest first

  // For each approved unit, walk snapshots oldest→newest; first one where
  // the unit appears as approved gives its first-seen-approved date.
  const targetIds = new Set(approved.map((u) => u.id));
  const firstSeen = new Map();
  for (const { name, date } of files) {
    if (firstSeen.size === targetIds.size) break;
    let snap;
    try {
      snap = JSON.parse(fs.readFileSync(path.join(SNAPSHOTS_DIR, name), 'utf8'));
    } catch {
      continue;
    }
    const snapUnits = Array.isArray(snap.units) ? snap.units : Object.values(snap.units ?? {});
    for (const u of snapUnits) {
      if (u.status === 'approved' && targetIds.has(u.id) && !firstSeen.has(u.id)) {
        firstSeen.set(u.id, date);
      }
    }
  }

  const now = Date.now();
  for (const id of targetIds) {
    const dt = firstSeen.get(id);
    if (dt) {
      ageById.set(id, Math.floor((now - dt.getTime()) / 86_400_000));
    } else {
      ageById.set(id, 0);
    }
  }
  return ageById;
}

const ageIndex = buildAgeIndex();

// ── Subcommand: --list ────────────────────────────────────────────────────────

function runList() {
  const byCluster = {};
  for (const u of approved) {
    const key = u.cluster || '(no-cluster)';
    if (!byCluster[key]) byCluster[key] = [];
    byCluster[key].push({
      id: u.id,
      name: u.name,
      phase: u.phase,
      cluster: u.cluster,
      priority: u.priority ?? null,
      tier: u.tier ?? null,
      model: u.model ?? null,
      ageDays: ageIndex.get(u.id) ?? 0,
      depsTotal: Array.isArray(u.dependsOn) ? u.dependsOn.length : 0,
      depsDone: Array.isArray(u.dependsOn)
        ? u.dependsOn.filter((d) => idIndex.get(d)?.status === 'done').length
        : 0,
    });
  }

  // Sort each cluster bucket by priority (asc) then id
  for (const k of Object.keys(byCluster)) {
    byCluster[k].sort((a, b) => {
      const pa = a.priority ?? 99;
      const pb = b.priority ?? 99;
      if (pa !== pb) return pa - pb;
      return a.id.localeCompare(b.id);
    });
  }

  const summary = {
    totalApproved: approved.length,
    clusterCount: Object.keys(byCluster).length,
    byCluster,
  };

  if (jsonMode) {
    emitResult({ violations: [], summary, ok: true }, true);
    return 0;
  }

  console.log(
    `triage-approved: ${approved.length} approved unit(s) across ${Object.keys(byCluster).length} cluster(s).\n`,
  );
  for (const cluster of Object.keys(byCluster).sort()) {
    const units = byCluster[cluster];
    console.log(`  ${cluster}  (${units.length})`);
    for (const u of units) {
      const tag = `[p${u.priority ?? '?'} ${u.tier ?? '?'}/${u.model ?? '?'}]`.padEnd(22);
      const age = u.ageDays > 0 ? ` ${u.ageDays}d` : '';
      const deps = u.depsTotal > 0 ? ` deps:${u.depsDone}/${u.depsTotal}` : '';
      console.log(`    ${tag} ${u.id}${age}${deps}`);
      if (u.name) console.log(`      ${u.name.slice(0, 80)}`);
    }
  }
  return 0;
}

// ── Subcommand: --stale=<days> ────────────────────────────────────────────────

function runStale(days) {
  const threshold = Number.parseInt(days, 10);
  if (!Number.isFinite(threshold) || threshold < 0) {
    if (jsonMode) {
      emitResult(
        { violations: [], summary: { error: `invalid --stale=${days}` }, ok: false },
        true,
      );
    } else {
      console.error(`triage-approved: --stale expects a non-negative integer, got: ${days}`);
    }
    return 1;
  }

  const stale = approved
    .filter((u) => (ageIndex.get(u.id) ?? 0) >= threshold)
    .map((u) => ({
      id: u.id,
      name: u.name,
      cluster: u.cluster,
      ageDays: ageIndex.get(u.id) ?? 0,
      priority: u.priority ?? null,
      depsBlocking: Array.isArray(u.dependsOn)
        ? u.dependsOn.filter((d) => idIndex.get(d)?.status !== 'done')
        : [],
    }))
    .sort((a, b) => b.ageDays - a.ageDays);

  const summary = {
    threshold_days: threshold,
    stale_count: stale.length,
    stale,
  };

  if (jsonMode) {
    emitResult({ violations: [], summary, ok: true }, true);
    return 0;
  }

  if (stale.length === 0) {
    console.log(`triage-approved: no approved units older than ${threshold} day(s).`);
    return 0;
  }
  console.log(`triage-approved: ${stale.length} approved unit(s) ≥${threshold}d old:\n`);
  for (const u of stale) {
    const blocking = u.depsBlocking.length > 0 ? ` (blocked: ${u.depsBlocking.join(', ')})` : '';
    console.log(`  ${u.ageDays}d  p${u.priority ?? '?'}  ${u.id}${blocking}`);
    if (u.name) console.log(`        ${u.name.slice(0, 80)}`);
  }
  return 0;
}

// ── Subcommand: --archive-stale=<days> [--apply] ──────────────────────────────

function runArchiveStale(days) {
  const threshold = Number.parseInt(days, 10);
  if (!Number.isFinite(threshold) || threshold < 0) {
    if (jsonMode) {
      emitResult(
        { violations: [], summary: { error: `invalid --archive-stale=${days}` }, ok: false },
        true,
      );
    } else {
      console.error(`triage-approved: --archive-stale expects integer, got: ${days}`);
    }
    return 1;
  }

  const candidates = approved.filter((u) => (ageIndex.get(u.id) ?? 0) >= threshold);
  const candidatePayload = candidates.map((u) => ({
    id: u.id,
    name: u.name,
    cluster: u.cluster,
    ageDays: ageIndex.get(u.id) ?? 0,
    priority: u.priority ?? null,
  }));

  const summary = {
    threshold_days: threshold,
    candidates: candidatePayload,
    candidate_count: candidates.length,
    apply,
    mutated: false,
  };

  if (!apply) {
    if (jsonMode) {
      emitResult({ violations: [], summary, ok: true }, true);
      return 0;
    }
    console.log(
      `triage-approved: dry-run — ${candidates.length} unit(s) would be archived ` +
        `(≥${threshold}d). Re-run with --apply to commit.\n`,
    );
    for (const u of candidatePayload) {
      console.log(`  ${u.ageDays}d  ${u.id}`);
      if (u.name) console.log(`      ${u.name.slice(0, 80)}`);
    }
    return 0;
  }

  // --apply path: rewrite orchestration.json
  if (candidates.length === 0) {
    summary.mutated = false;
    if (jsonMode) emitResult({ violations: [], summary, ok: true }, true);
    else console.log('triage-approved: --apply: no candidates to archive.');
    return 0;
  }

  const now = new Date().toISOString();
  const reason = `auto-archived: stale-approved ≥${threshold}d (no agent claim, no progress)`;
  const candidateIds = new Set(candidates.map((u) => u.id));
  for (const u of allUnits) {
    if (!candidateIds.has(u.id)) continue;
    u.status = 'archived';
    u.archivedAt = now;
    u.archivedReason = reason;
  }

  const out = JSON.stringify(orch, null, 2) + '\n';
  fs.writeFileSync(ORCH, out, 'utf8');
  summary.mutated = true;
  summary.archivedAt = now;
  summary.archivedReason = reason;

  if (jsonMode) {
    emitResult({ violations: [], summary, ok: true }, true);
  } else {
    console.log(
      `triage-approved: --apply: archived ${candidates.length} unit(s) at ${now}.`,
    );
  }
  return 0;
}

// ── Subcommand: --re-cluster ──────────────────────────────────────────────────

function runRecluster() {
  // Heuristic: id-family prefix should match cluster-family prefix.
  // Mismatch is a soft signal that either the unit was assigned to the wrong
  // cluster, or the cluster naming convention diverges from the id naming.
  const mismatches = [];
  for (const u of approved) {
    const idFam = idFamily(u.id);
    const cFam = clusterFamily(u.cluster);
    if (!idFam || !cFam) continue;
    if (idFam !== cFam) {
      mismatches.push({
        id: u.id,
        idFamily: idFam,
        cluster: u.cluster,
        clusterFamily: cFam,
        suggestion: `consider re-cluster: id starts with "${idFam}" but cluster starts with "${cFam}"`,
      });
    }
  }

  const summary = {
    checked: approved.length,
    mismatches,
    mismatch_count: mismatches.length,
  };

  if (jsonMode) {
    emitResult({ violations: [], summary, ok: true }, true);
    return 0;
  }

  if (mismatches.length === 0) {
    console.log('triage-approved: cluster ↔ id-prefix consistency: OK.');
    return 0;
  }
  console.log(
    `triage-approved: ${mismatches.length} cluster ↔ id-prefix mismatch(es) (heuristic):\n`,
  );
  for (const m of mismatches) {
    console.log(`  ${m.id}  →  cluster="${m.cluster}"`);
    console.log(`    ${m.suggestion}`);
  }
  return 0;
}

// ── Subcommand: --priority=<id>:<n> [--apply] ─────────────────────────────────

function runPriority(spec) {
  const m = String(spec).match(/^([^:]+):(-?\d+)$/);
  if (!m) {
    if (jsonMode) {
      emitResult(
        { violations: [], summary: { error: `expected id:n, got: ${spec}` }, ok: false },
        true,
      );
    } else {
      console.error(`triage-approved: --priority expects "id:n", got: ${spec}`);
    }
    return 1;
  }
  const [, id, nStr] = m;
  const next = Number.parseInt(nStr, 10);

  const target = idIndex.get(id);
  if (!target) {
    const summary = { error: `unknown unit id: ${id}` };
    if (jsonMode) emitResult({ violations: [], summary, ok: false }, true);
    else console.error(`triage-approved: --priority: unknown id "${id}"`);
    return 1;
  }

  const before = target.priority ?? null;
  const summary = {
    id,
    before,
    after: next,
    changed: before !== next,
    apply,
    mutated: false,
  };

  if (!apply) {
    if (jsonMode) {
      emitResult({ violations: [], summary, ok: true }, true);
    } else {
      console.log(
        `triage-approved: dry-run — ${id}: priority ${before} → ${next} (use --apply to commit).`,
      );
    }
    return 0;
  }

  target.priority = next;
  fs.writeFileSync(ORCH, JSON.stringify(orch, null, 2) + '\n', 'utf8');
  summary.mutated = true;
  if (jsonMode) emitResult({ violations: [], summary, ok: true }, true);
  else console.log(`triage-approved: --apply: ${id}.priority ${before} → ${next}.`);
  return 0;
}

// ── Subcommand: --deps=<id> ───────────────────────────────────────────────────

function runDeps(id) {
  const root = idIndex.get(id);
  if (!root) {
    const summary = { error: `unknown unit id: ${id}` };
    if (jsonMode) emitResult({ violations: [], summary, ok: false }, true);
    else console.error(`triage-approved: --deps: unknown id "${id}"`);
    return 1;
  }

  // BFS through dependsOn, tracking visited + path for cycle detection.
  const tree = []; // { id, depth, status, missing, cycle }
  const missing = new Set();
  const cycles = []; // arrays of ids forming a cycle
  const stackPath = [];

  function visit(curId, depth) {
    if (stackPath.includes(curId)) {
      cycles.push([...stackPath, curId]);
      tree.push({ id: curId, depth, status: '(cycle)', cycle: true });
      return;
    }
    stackPath.push(curId);
    const cur = idIndex.get(curId);
    if (!cur) {
      missing.add(curId);
      tree.push({ id: curId, depth, status: '(missing)', missing: true });
      stackPath.pop();
      return;
    }
    tree.push({ id: cur.id, depth, status: cur.status, name: cur.name });
    const deps = Array.isArray(cur.dependsOn) ? cur.dependsOn : [];
    for (const d of deps) visit(d, depth + 1);
    stackPath.pop();
  }

  visit(id, 0);

  const summary = {
    root: id,
    tree,
    missing: [...missing],
    cycles,
    missing_count: missing.size,
    cycle_count: cycles.length,
    ok: missing.size === 0 && cycles.length === 0,
  };

  if (jsonMode) {
    emitResult({ violations: [], summary, ok: summary.ok }, true);
    return summary.ok ? 0 : 1;
  }

  console.log(`triage-approved: dependency tree for ${id}:\n`);
  for (const node of tree) {
    const indent = '  '.repeat(node.depth + 1);
    const tag = node.missing
      ? '[MISSING]'
      : node.cycle
        ? '[CYCLE]'
        : `[${node.status}]`;
    console.log(`${indent}${tag} ${node.id}`);
    if (node.name) console.log(`${indent}  ${node.name.slice(0, 80)}`);
  }
  if (missing.size > 0) {
    console.log(`\n  ${missing.size} missing dependency id(s): ${[...missing].join(', ')}`);
  }
  if (cycles.length > 0) {
    console.log(`\n  ${cycles.length} cycle(s) detected:`);
    for (const c of cycles) console.log(`    ${c.join(' → ')}`);
  }
  if (missing.size === 0 && cycles.length === 0) {
    console.log('\n  dependency chain: OK');
  }
  return summary.ok ? 0 : 1;
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

let exitCode = 0;
try {
  if (subDeps !== null) exitCode = runDeps(subDeps);
  else if (subPriority !== null) exitCode = runPriority(subPriority);
  else if (subRecluster) exitCode = runRecluster();
  else if (subArchive !== null) exitCode = runArchiveStale(subArchive);
  else if (subStale !== null) exitCode = runStale(subStale);
  else if (subList) exitCode = runList();
} catch (err) {
  if (jsonMode) {
    emitResult({ violations: [], summary: { error: String(err?.stack || err?.message || err) }, ok: false }, true);
  } else {
    console.error(`triage-approved: unhandled error — ${err?.message || err}`);
  }
  exitCode = 1;
}

process.exit(exitCode);
