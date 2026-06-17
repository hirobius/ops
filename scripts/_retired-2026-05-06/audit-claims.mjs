#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/audit-claims.mjs
 *
 * Detects stale claims on docs/ai/orchestration.json units. A claim goes
 * stale when status=claimed and claimedAt is older than the stale-threshold
 * (default 4 hours). Stale claims usually indicate an agent crashed mid-work
 * and the unit should either be reverted to `approved` (so a fresh agent
 * can pick it up) or re-claimed by a new agent (overwriting the stale claim).
 *
 * This is intentionally a separate script from validate-orchestration.mjs
 * — schema validation should NOT hard-fail on a runtime/timing condition,
 * because that would break all commits until the stale claim is manually
 * resolved. Run this on a timer (cron) or on demand instead.
 *
 * Modes:
 *   default       — exits 0 always; stale claims printed to stderr as warnings
 *   --strict      — exits 1 if any stale claim is found
 *   --json        — emits JSON { stale: [...], threshold_hours: N }
 *   --threshold N — override the stale threshold in hours (default 4)
 *
 * Invocation:
 *   node scripts/audit-claims.mjs
 *   node scripts/audit-claims.mjs --strict
 *   node scripts/audit-claims.mjs --threshold 8 --json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORCHESTRATION_PATH = path.join(ROOT, 'docs/ai/orchestration.json');

const args = process.argv.slice(2);
const STRICT = args.includes('--strict');
const JSON_MODE = args.includes('--json');
const thresholdIdx = args.indexOf('--threshold');
const STALE_HOURS = thresholdIdx >= 0 && args[thresholdIdx + 1]
  ? Number(args[thresholdIdx + 1])
  : 4;

if (!Number.isFinite(STALE_HOURS) || STALE_HOURS <= 0) {
  console.error(`✗ --threshold must be a positive number, got ${args[thresholdIdx + 1]}`);
  process.exit(2);
}

function loadOrchestration() {
  const raw = fs.readFileSync(ORCHESTRATION_PATH, 'utf8');
  return JSON.parse(raw);
}

function findStaleClaims(units) {
  const now = Date.now();
  const stale = [];
  for (const u of units) {
    if (u.status !== 'claimed') continue;
    if (typeof u.claimedAt !== 'string') continue;
    const claimedAtMs = Date.parse(u.claimedAt);
    if (Number.isNaN(claimedAtMs)) continue;
    const ageHours = (now - claimedAtMs) / 3_600_000;
    if (ageHours > STALE_HOURS) {
      stale.push({
        id: u.id,
        claimedBy: u.claimedBy ?? null,
        claimedAt: u.claimedAt,
        ageHours: Number(ageHours.toFixed(2)),
      });
    }
  }
  return stale;
}

function main() {
  const orch = loadOrchestration();
  const stale = findStaleClaims(orch.units || []);

  if (JSON_MODE) {
    console.log(JSON.stringify({ stale, threshold_hours: STALE_HOURS }, null, 2));
  } else if (stale.length === 0) {
    console.log(`OK — no stale claims (threshold ${STALE_HOURS}h)`);
  } else {
    console.warn(`[WARN] ${stale.length} stale claim(s) (threshold ${STALE_HOURS}h):`);
    for (const s of stale) {
      console.warn(
        `  ${s.id}  claimedBy=${s.claimedBy ?? '(unknown)'}  ${s.ageHours}h old  (${s.claimedAt})`
      );
    }
    console.warn(
      'Recovery: revert status to "approved" + clear claimedBy/claimedAt, OR steal the claim with a fresh claimedBy/claimedAt.'
    );
  }

  if (STRICT && stale.length > 0) process.exit(1);
  process.exit(0);
}

main();
