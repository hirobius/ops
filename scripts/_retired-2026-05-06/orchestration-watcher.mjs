#!/usr/bin/env node
/** @internal — overnight burndown coordination daemon. Not part of public API. */
/**
 * scripts/orchestration-watcher.mjs
 *
 * Long-running watcher that produces a single source-of-truth `ready-queue.json`
 * for parallel agent windows. Run ONCE per machine before dispatching agents.
 *
 * What it does:
 *   - Polls docs/ai/orchestration.json (watch + 5s heartbeat poll).
 *   - Computes: eligible units, claimed units, stale claims, newly-unblocked.
 *   - Assigns each eligible unit a complexity tier (T1..T4) + recommended model.
 *   - Surfaces file-conflict groups so windows can serialize manifest writes.
 *   - Writes docs/ai/ready-queue.json on every change.
 *   - Optionally writes a tail-friendly text snapshot to stderr.
 *
 * Modes:
 *   default            run forever, refresh on file change + every 30s
 *   --once             compute once and exit (use for ad-hoc inspection)
 *   --interval N       polling interval in seconds (default 30)
 *   --stale-hours N    age threshold for stale claims (default 4)
 *   --quiet            suppress stderr summary (file output only)
 *
 * Output file: docs/ai/ready-queue.json (gitignored).
 *
 * Tiering heuristic (overridable per-unit via `complexityTier` field if added later):
 *   T1 mechanical  — name/description matches scrub/rename/regen/baseline/fixture/comment
 *   T4 strategic   — status==='needs-grilling' OR description mentions: brand rename,
 *                    multi-tenant, deploy, public-api break, business model
 *   T3 architectural — description mentions: schema change, cross-cutting, refactor batch,
 *                    new validator/protocol, manifest projection, breaking
 *   T2 standard   — everything else
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH_PATH = path.join(ROOT, 'docs/ai/orchestration.json');
const QUEUE_PATH = path.join(ROOT, 'docs/ai/ready-queue.json');

const args = process.argv.slice(2);
const ONCE = args.includes('--once');
const QUIET = args.includes('--quiet');
const intervalIdx = args.indexOf('--interval');
const INTERVAL_S = intervalIdx >= 0 ? Number(args[intervalIdx + 1]) : 30;
const staleIdx = args.indexOf('--stale-hours');
const STALE_HOURS = staleIdx >= 0 ? Number(args[staleIdx + 1]) : 4;

if (!Number.isFinite(INTERVAL_S) || INTERVAL_S < 5) {
  console.error('--interval must be ≥ 5 seconds');
  process.exit(2);
}

const T1_RE = /\b(scrub|regen|baseline|fixture|emoji|comment|move|rename file|alias|tag|cron|burndown)\b/i;
const T3_RE = /\b(schema|protocol|validator|projection|batch|cross-cutting|refactor|new (gate|check|envelope)|manifest)\b/i;
const T4_RE = /\b(brand|hydra|multi-tenant|deploy|public api|business|monetiz|pricing|stripe)\b/i;

const MANIFEST_FILES = ['public/hds-manifest.json', 'src/app/data/component-api.json', 'hirobius.tokens.json'];

function classifyTier(unit) {
  if (unit.status === 'needs-grilling') return 'T4';
  const text = `${unit.name || ''} ${unit.description || ''} ${unit.cluster || ''}`;
  if (T4_RE.test(text)) return 'T4';
  if (T1_RE.test(text)) return 'T1';
  if (T3_RE.test(text)) return 'T3';
  return 'T2';
}

function recommendModel(tier) {
  switch (tier) {
    case 'T1': return 'haiku';
    case 'T2': return 'sonnet';
    case 'T3': return 'sonnet';
    case 'T4': return 'opus';
    default:   return 'sonnet';
  }
}

function recommendEffort(tier) {
  // Opus T4 strategic units justify the max-effort lever. Everything else uses
  // default effort to keep cost in check (Adrian directive 2026-05-01).
  return tier === 'T4' ? 'max' : 'default';
}

function executionMode(tier) {
  // Per AGENT_GUIDELINES + MULTI_AGENT_OVERNIGHT.md:
  //   T1 — execute, no ledger.
  //   T2 — execute, ledger only if surprising.
  //   T3 — execute, MANDATORY ledger (decision + alternatives + ramifications).
  //   T4 — execute with opus max-effort, MANDATORY ledger, work to unblock the
  //        next downstream unit, then PUNT remaining scope to Adrian only if
  //        absolutely necessary. Do not block velocity on T4 review.
  switch (tier) {
    case 'T1': return 'execute-no-ledger';
    case 'T2': return 'execute-ledger-if-surprising';
    case 'T3': return 'execute-mandatory-ledger';
    case 'T4': return 'execute-mandatory-ledger-unblock-then-punt';
    default:   return 'execute-mandatory-ledger';
  }
}

function detectBlockedFiles(unit) {
  const notes = Array.isArray(unit.agentNotes) ? unit.agentNotes.join(' ') : (unit.agentNotes || '');
  const text = `${unit.description || ''} ${notes} ${unit.validationCmd || ''}`.toLowerCase();
  const hits = [];
  for (const f of MANIFEST_FILES) {
    if (text.includes(path.basename(f).toLowerCase())) hits.push(f);
  }
  if (/\borchestration\.json\b/.test(text)) hits.push('docs/ai/orchestration.json');
  return hits;
}

function loadOrchestration() {
  const raw = fs.readFileSync(ORCH_PATH, 'utf8');
  return JSON.parse(raw);
}

function recentCommits(sinceMin = 60) {
  try {
    const out = execSync(
      `git log --oneline --since="${sinceMin} minutes ago" --pretty=format:%H%x09%s`,
      { cwd: ROOT, encoding: 'utf8' }
    );
    return out
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        const [hash, ...rest] = line.split('\t');
        return { hash, subject: rest.join('\t') };
      });
  } catch {
    return [];
  }
}

function computeQueue() {
  const orch = loadOrchestration();
  const units = orch.units || [];
  const doneIds = new Set(units.filter((u) => u.status === 'done').map((u) => u.id));
  const claimedIds = new Set(units.filter((u) => u.status === 'claimed').map((u) => u.id));
  const skipIds = new Set([
    ...claimedIds,
    ...units.filter((u) => ['parked', 'needs-grilling', 'denied'].includes(u.status)).map((u) => u.id),
  ]);

  const eligible = [];
  const blocked = [];
  for (const u of units) {
    if (u.status === 'done') continue;
    if (skipIds.has(u.id)) continue;
    if (!['approved', 'pending', 'in-progress', 'proposed'].includes(u.status)) continue;
    if (u.approval && u.approval !== 'approved') continue;
    const deps = u.dependsOn || [];
    const unmet = deps.filter((d) => !doneIds.has(d));
    if (unmet.length > 0) {
      blocked.push({ id: u.id, missingDeps: unmet });
      continue;
    }
    const tier = classifyTier(u);
    eligible.push({
      id: u.id,
      name: u.name,
      phase: u.phase,
      cluster: u.cluster,
      priority: u.priority ?? 5,
      sprint: u.sprint ?? 6,
      tier,
      model: recommendModel(tier),
      effort: recommendEffort(tier),
      executionMode: executionMode(tier),
      blockedFiles: detectBlockedFiles(u),
      status: u.status,
      validationCmd: u.validationCmd,
    });
  }

  // Stable sort: priority asc, sprint asc, tier (T1 first to drain mechanical bulk), id asc
  const TIER_ORDER = { T1: 0, T2: 1, T3: 2, T4: 3 };
  eligible.sort((a, b) =>
    (a.priority - b.priority) ||
    (a.sprint - b.sprint) ||
    (TIER_ORDER[a.tier] - TIER_ORDER[b.tier]) ||
    a.id.localeCompare(b.id)
  );

  const now = Date.now();
  const claimed = units
    .filter((u) => u.status === 'claimed')
    .map((u) => {
      const claimedAtMs = Date.parse(u.claimedAt || '');
      const ageHours = Number.isFinite(claimedAtMs) ? (now - claimedAtMs) / 3_600_000 : null;
      return {
        id: u.id,
        claimedBy: u.claimedBy || null,
        claimedAt: u.claimedAt || null,
        ageHours: ageHours != null ? Number(ageHours.toFixed(2)) : null,
        stale: ageHours != null && ageHours > STALE_HOURS,
      };
    });
  const staleClaims = claimed.filter((c) => c.stale);

  const commits = recentCommits(60);
  const recentlyUnblocked = [];
  // crude: any unit whose deps are now all done AND a recent commit's subject mentions one of its deps
  for (const u of units) {
    if (skipIds.has(u.id) || u.status === 'done') continue;
    const deps = u.dependsOn || [];
    if (deps.length === 0) continue;
    if (!deps.every((d) => doneIds.has(d))) continue;
    const trigger = commits.find((c) => deps.some((d) => c.subject.includes(d)));
    if (trigger) {
      recentlyUnblocked.push({ id: u.id, unblockedBy: trigger.hash, subject: trigger.subject });
    }
  }

  // File-conflict groups: units that share blockedFiles
  const fileGroups = {};
  for (const e of eligible) {
    for (const f of e.blockedFiles) {
      (fileGroups[f] ||= []).push(e.id);
    }
  }

  const counts = {
    total: units.length,
    done: doneIds.size,
    claimed: claimed.length,
    staleClaims: staleClaims.length,
    eligible: eligible.length,
    blocked: blocked.length,
    byTier: eligible.reduce((acc, e) => ((acc[e.tier] = (acc[e.tier] || 0) + 1), acc), {}),
    byPriority: eligible.reduce((acc, e) => ((acc[e.priority] = (acc[e.priority] || 0) + 1), acc), {}),
  };

  return {
    generatedAt: new Date().toISOString(),
    intervalSeconds: INTERVAL_S,
    staleThresholdHours: STALE_HOURS,
    counts,
    eligible,
    claimed,
    staleClaims,
    recentlyUnblocked,
    blocked,
    fileGroups,
  };
}

function writeQueue(snapshot) {
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(snapshot, null, 2) + '\n');
}

function summarize(snapshot) {
  const c = snapshot.counts;
  const tierBits = Object.entries(c.byTier).map(([k, v]) => `${k}:${v}`).join(' ');
  return [
    `[${snapshot.generatedAt}]`,
    `done=${c.done}/${c.total}`,
    `claimed=${c.claimed}${c.staleClaims ? `(stale ${c.staleClaims})` : ''}`,
    `eligible=${c.eligible} {${tierBits}}`,
    `blocked=${c.blocked}`,
    snapshot.recentlyUnblocked.length ? `unblocked=${snapshot.recentlyUnblocked.length}` : '',
  ].filter(Boolean).join(' ');
}

let lastHash = '';
function refresh() {
  try {
    const snapshot = computeQueue();
    const hash = JSON.stringify({
      e: snapshot.eligible.map((e) => e.id),
      c: snapshot.claimed.map((c) => c.id + c.ageHours),
      u: snapshot.recentlyUnblocked.map((r) => r.id),
    });
    if (hash !== lastHash) {
      writeQueue(snapshot);
      lastHash = hash;
      if (!QUIET) console.error(summarize(snapshot));
    }
  } catch (err) {
    console.error(`[watcher] error: ${err.message}`);
  }
}

if (ONCE) {
  refresh();
  process.exit(0);
}

console.error(`[watcher] starting — interval=${INTERVAL_S}s stale=${STALE_HOURS}h`);
refresh();

// fs.watch can drop events on some filesystems; combine with interval poll for reliability
try {
  fs.watch(ORCH_PATH, { persistent: true }, () => {
    setTimeout(refresh, 200); // debounce
  });
} catch (err) {
  console.error(`[watcher] fs.watch unavailable: ${err.message} — falling back to interval poll only`);
}

setInterval(refresh, INTERVAL_S * 1000);

process.on('SIGINT', () => {
  console.error('[watcher] shutting down');
  process.exit(0);
});
