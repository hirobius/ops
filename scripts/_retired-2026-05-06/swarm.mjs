#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/swarm.mjs
 *
 * Hermes-style swarm coordinator: tier-routed worker pools with skill extraction.
 *
 * Routing:
 *   T1 (mechanical) → hermes3 local via Ollama (free)
 *   T2/T3 (standard/architectural) → Kimi-K2
 *   T4 (strategic) → skipped, printed as Claude-only
 *
 * Each tier runs its own pool of kimi-agent.mjs child processes with appropriate
 * model env vars. Workers auto-respawn until the queue for their tier is drained.
 *
 * Skill extraction: after each successful unit, tool-call sequence + cost saved
 * to docs/ai/skills/<cluster>.jsonl for future system-prompt injection.
 *
 * Usage:
 *   pnpm swarm               — T1:2 workers + T2/T3:2 workers
 *   pnpm swarm:heavy         — T1:3 + T2/T3:4
 *   pnpm swarm --t1 1 --t2 3 — custom pool sizes
 *   pnpm swarm --dry-run     — show routing plan and exit
 */

import fs from 'fs';
import path from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUEUE_PATH  = path.join(ROOT, 'docs/ai/ready-queue.json');
const SKILLS_DIR  = path.join(ROOT, 'docs/ai/skills');
const AGENT_SCRIPT = path.join(ROOT, 'scripts/hermes-unit.mjs');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const DRY_RUN  = argv.includes('--dry-run');
const t1Idx    = argv.indexOf('--t1');
const t2Idx    = argv.indexOf('--t2');
const T1_WORKERS = t1Idx !== -1 ? Math.max(1, parseInt(argv[t1Idx + 1], 10) || 2) : 2;
const T2_WORKERS = t2Idx !== -1 ? Math.max(1, parseInt(argv[t2Idx + 1], 10) || 2) : 2;

// ── Model configs per tier ────────────────────────────────────────────────────

// hermes-unit.mjs handles model routing internally (T1→hermes3, T2/T3→qwen2.5-14b)
// Workers are fungible — labels are for log output only
const TIER_CONFIG = {
  T1: { label: 'hermes3-local',       workers: T1_WORKERS },
  T2: { label: 'qwen2.5-coder-local', workers: T2_WORKERS },
  T3: { label: 'qwen2.5-coder-local', workers: 1 },
};

// T4 strategic units are Claude-only — swarm skips them
const T4_SKIP_MSG = 'T4 units require Claude (strategic reasoning). Run manually or via Claude agent dispatch.';

// ── Skill extraction ──────────────────────────────────────────────────────────

function ensureSkillsDir() {
  fs.mkdirSync(SKILLS_DIR, { recursive: true });
}

function saveSkill(unitId, cluster, tier, toolLog, tokenCost, iterations) {
  ensureSkillsDir();
  const file = path.join(SKILLS_DIR, `${(cluster || 'misc').replace(/[^a-z0-9-]/gi, '_')}.jsonl`);
  const entry = JSON.stringify({
    unitId,
    cluster,
    tier,
    completedAt: new Date().toISOString(),
    iterations,
    tokenCost,
    toolSequence: toolLog,
  });
  fs.appendFileSync(file, entry + '\n');
}

// ── Queue helpers ─────────────────────────────────────────────────────────────

function refreshQueue() {
  try {
    execSync('node scripts/orchestration-watcher.mjs --once --quiet', { cwd: ROOT, stdio: 'inherit' });
  } catch { /* non-fatal */ }
}

function readQueue() {
  if (!fs.existsSync(QUEUE_PATH)) return { eligible: [] };
  return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
}

function queueByTier() {
  const q = readQueue();
  const byTier = { T1: [], T2: [], T3: [], T4: [] };
  for (const u of (q.eligible || [])) {
    (byTier[u.tier] ||= []).push(u);
  }
  return byTier;
}

// ── Worker spawner ────────────────────────────────────────────────────────────

function spawnWorker(tier, workerId) {
  const cfg = TIER_CONFIG[tier];
  if (!cfg) return Promise.resolve();

  return new Promise((resolve) => {
    // hermes-unit.mjs reads .env.local itself; no model env vars needed
    const child = spawn('node', [AGENT_SCRIPT, '--loop'], {
      cwd: ROOT,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const prefix = `[swarm:${cfg.label}:w${workerId}]`;
    let iterations = 0;

    function parseLine(line) {
      // Unit starting: "[hermes-unit] <unitId> | tier=T2 | model=..."
      const startMatch = line.match(/\[hermes-unit\] (\S+) \| tier=\S+ \| model=/);
      if (startMatch) { iterations = 0; }

      // Track turns from Hermes output
      const turnMatch = line.match(/\bturn[= ]?(\d+)/i);
      if (turnMatch) iterations = parseInt(turnMatch[1], 10);

      // Skill record on unit completion (Hermes also saves its own internally)
      const doneMatch = line.match(/\[hermes-unit\] Done: (\S+)/);
      if (doneMatch) {
        const unitId = doneMatch[1];
        const q = readQueue();
        const unitData = q.eligible?.find(u => u.id === unitId);
        const cluster = unitData?.cluster || 'misc';
        saveSkill(unitId, cluster, tier, [], 0, iterations);
        console.log(`${prefix} skill saved for ${unitId} (cluster: ${cluster})`);
      }

      process.stdout.write(`${prefix} ${line}\n`);
    }

    let buf = '';
    const onData = chunk => {
      buf += chunk;
      const lines = buf.split('\n');
      buf = lines.pop();
      lines.forEach(parseLine);
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    child.on('close', (code) => {
      if (buf) parseLine(buf);
      console.log(`${prefix} exited (code=${code})`);
      resolve();
    });
  });
}

// ── Dry run ───────────────────────────────────────────────────────────────────

function dryRun() {
  refreshQueue();
  const tiers = queueByTier();
  console.log('\n[swarm] Routing plan:');
  for (const [tier, units] of Object.entries(tiers)) {
    if (units.length === 0) continue;
    if (tier === 'T4') {
      console.log(`  ${tier} (${units.length} units) → SKIP — ${T4_SKIP_MSG}`);
      units.forEach(u => console.log(`    • ${u.id}`));
    } else {
      const cfg = TIER_CONFIG[tier];
      console.log(`  ${tier} (${units.length} units) → ${cfg.label} — ${cfg.workers} worker(s)`);
      units.slice(0, 3).forEach(u => console.log(`    • ${u.id}`));
      if (units.length > 3) console.log(`    … +${units.length - 3} more`);
    }
  }
  const t4Count = tiers.T4.length;
  if (t4Count > 0) {
    console.log(`\n[swarm] ${t4Count} T4 units awaiting Claude dispatch:`);
    tiers.T4.forEach(u => console.log(`  /agent ${u.id}`));
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[swarm] Starting Hermes swarm coordinator');
  console.log(`[swarm] Pool: T1=${T1_WORKERS}×hermes3-local  T2=${T2_WORKERS}×qwen2.5-14b-local  T3=1×qwen2.5-14b-local`);

  // Pre-flight
  console.log('[swarm] Running audit-claims...');
  try { execSync('node scripts/audit-claims.mjs', { cwd: ROOT, stdio: 'inherit' }); } catch { /* non-fatal */ }

  refreshQueue();

  if (DRY_RUN) { dryRun(); return; }

  const tiers = queueByTier();

  // Surface T4 units for manual dispatch
  if (tiers.T4?.length > 0) {
    console.log(`\n[swarm] ${tiers.T4.length} T4 strategic units — Claude dispatch needed:`);
    tiers.T4.forEach(u => console.log(`  • ${u.id}: ${u.name || u.id}`));
    console.log('');
  }

  const eligible = Object.values(tiers).flat().filter(u => u.tier !== 'T4');
  if (eligible.length === 0) {
    console.log('[swarm] Queue empty (T1-T3). T4 units require Claude.');
    return;
  }

  // Spawn tier pools concurrently
  const pools = [];

  if (tiers.T1?.length > 0) {
    console.log(`[swarm] Spawning ${T1_WORKERS} hermes3 worker(s) for ${tiers.T1.length} T1 unit(s)`);
    for (let i = 1; i <= T1_WORKERS; i++) {
      pools.push(spawnWorker('T1', i));
    }
  }

  if ((tiers.T2?.length || 0) + (tiers.T3?.length || 0) > 0) {
    const t2t3Count = (tiers.T2?.length || 0) + (tiers.T3?.length || 0);
    console.log(`[swarm] Spawning ${T2_WORKERS} qwen worker(s) for ${t2t3Count} T2/T3 unit(s)`);
    for (let i = 1; i <= T2_WORKERS; i++) {
      pools.push(spawnWorker('T2', i));
    }
    if (tiers.T3?.length > 0) {
      pools.push(spawnWorker('T3', 1));
    }
  }

  await Promise.all(pools);
  console.log('[swarm] All workers finished.');
}

main().catch(err => {
  console.error('[swarm] Fatal:', err.message);
  process.exit(1);
});
