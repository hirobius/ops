#!/usr/bin/env node
/**
 * audit-claims — detect stale claimed units in docs/ai/orchestration.json.
 *
 * A claim is stale when:
 *   status === 'claimed' AND claimedAt is older than STALE_HOURS ago.
 *
 * Severity: warn (non-blocking — operator reviews stale claims manually).
 * Exit 0 always: stale claims are surfaced as output, not as a hard gate failure,
 * so the pre-commit flow isn't blocked by running agents.
 *
 * Usage:
 *   node scripts/audit-claims.mjs [--hours <n>] [--json]
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const args = new Set(process.argv.slice(2));
const JSON_MODE = args.has('--json');

const hoursArg = process.argv.find((a) => a.startsWith('--hours='));
const STALE_HOURS = hoursArg ? Number(hoursArg.split('=')[1]) : 4;
const STALE_MS = STALE_HOURS * 60 * 60 * 1000;

// ── Load orchestration.json ───────────────────────────────────────────────────

let orch;
try {
  orch = JSON.parse(readFileSync(join(ROOT, 'docs/ai/orchestration.json'), 'utf8'));
} catch {
  // No orchestration file — nothing to check.
  if (JSON_MODE) console.log(JSON.stringify({ ok: true, stale: [] }));
  else console.log('audit-claims: no orchestration.json — skip');
  process.exit(0);
}

// ── Find stale claims ─────────────────────────────────────────────────────────

const units = Array.isArray(orch.units) ? orch.units : Object.values(orch.units ?? {});
const now = Date.now();

const stale = units.filter((u) => {
  if (u.status !== 'claimed') return false;
  if (!u.claimedAt) return false; // claimed but no timestamp — flag it
  const age = now - new Date(u.claimedAt).getTime();
  return age > STALE_MS;
});

// ── Report ────────────────────────────────────────────────────────────────────

if (JSON_MODE) {
  console.log(JSON.stringify({ ok: stale.length === 0, stale }));
} else if (stale.length > 0) {
  console.warn(`audit-claims: ${stale.length} stale claim(s) detected (>${STALE_HOURS}h):`);
  for (const u of stale) {
    const ageH = ((now - new Date(u.claimedAt).getTime()) / 3_600_000).toFixed(1);
    console.warn(`  ${u.unit_id ?? u.id ?? '?'} — claimed by ${u.claimedBy ?? '?'} ${ageH}h ago`);
  }
} else {
  console.log('audit-claims: no stale claims');
}

// Severity: warn — always exit 0 so pre-commit isn't blocked by live agents.
process.exit(0);
