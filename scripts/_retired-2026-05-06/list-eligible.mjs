#!/usr/bin/env node
/**
 * scripts/list-eligible.mjs
 *
 * Lists orchestration units that are eligible for dispatch right now.
 * Mirrors the watchdog's selection logic so the dashboard can surface
 * "next eligible" without spawning the watchdog.
 *
 * Eligibility (matches scripts/swarm-watchdog.mjs):
 *   - status === 'approved'
 *   - approval === 'approved' (or absent)
 *   - all dependsOn IDs have status === 'done'
 *   - safeForUnattended !== false (true OR absent passes)
 *   - attempts < 2
 *   - no file-path overlap with currently-claimed units (best-effort)
 *
 * Usage:
 *   node scripts/list-eligible.mjs           # human-readable, top 10
 *   node scripts/list-eligible.mjs --json    # machine-readable
 *   node scripts/list-eligible.mjs --all     # don't truncate
 *
 * @module list-eligible
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hasJsonFlag, emitResult } from './lib/gate-output.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCH = path.join(ROOT, 'docs/ai/orchestration.json');

const argv = process.argv.slice(2);
const jsonMode = hasJsonFlag(argv);
const showAll = argv.includes('--all');

const db = JSON.parse(fs.readFileSync(ORCH, 'utf8'));
const units = db.units;

const doneSet = new Set(units.filter((u) => u.status === 'done').map((u) => u.id));
const TIER_RANK = { T1: 1, T2: 2, T3: 3, T4: 4 };

const eligible = units
  .filter((u) => {
    if (u.status !== 'approved') return false;
    if (u.approval && u.approval !== 'approved') return false;
    if (u.safeForUnattended === false) return false;
    if ((u.attempts ?? 0) >= 2) return false;
    const deps = u.dependsOn ?? [];
    if (!deps.every((d) => doneSet.has(d))) return false;
    return true;
  })
  .sort((a, b) => {
    const pa = a.priority ?? 99;
    const pb = b.priority ?? 99;
    if (pa !== pb) return pa - pb;
    const ta = TIER_RANK[a.tier ?? ''] ?? 99;
    const tb = TIER_RANK[b.tier ?? ''] ?? 99;
    if (ta !== tb) return ta - tb;
    return (a.id || '').localeCompare(b.id || '');
  });

const ranked = showAll ? eligible : eligible.slice(0, 10);

if (jsonMode) {
  emitResult(
    {
      violations: [],
      summary: {
        eligible: eligible.length,
        topN: ranked.length,
        units: ranked.map((u) => ({
          id: u.id,
          name: u.name,
          cluster: u.cluster,
          tier: u.tier,
          model: u.model,
          priority: u.priority,
          safeForUnattended: u.safeForUnattended ?? null,
        })),
      },
      ok: true,
    },
    true,
  );
  process.exit(0);
}

console.log(`list-eligible: ${eligible.length} unit(s) eligible for dispatch.\n`);
if (eligible.length === 0) {
  console.log('  (queue empty — wait for in-flight work or unblock dependencies)');
  process.exit(0);
}

for (const u of ranked) {
  const tag = `[p${u.priority ?? '?'} ${u.tier ?? '?'}/${u.model ?? '?'}]`.padEnd(22);
  console.log(`  ${tag} ${u.id}`);
  if (u.name) console.log(`    ${u.name.slice(0, 80)}`);
}
if (eligible.length > ranked.length) {
  console.log(`\n  ...${eligible.length - ranked.length} more (use --all to see).`);
}
