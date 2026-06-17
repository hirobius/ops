#!/usr/bin/env node
/**
 * scripts/refresh-firing-stats.mjs
 *
 * Reads docs/guardrails/firing-log.jsonl (produced by run-gates.mjs
 * --emit-jsonl, see 13g-12-postcommit-verifier) and updates per-gate
 * `lastFiringAt` and `lastViolationAt` fields in
 * docs/guardrails/registry.json so the validators atlas tab can surface
 * dormant gates ("dormant?" badge if last fire >90 days ago, or never).
 *
 * Side effect on the log itself: trims entries older than 365 days so the
 * file does not grow unboundedly. The trimming is idempotent.
 *
 * Best-effort: this script never throws — it logs warnings and exits 0
 * even if the log is missing or malformed. Telemetry must never be the
 * reason a gate run fails (per agentNotes on unit 13g-14).
 *
 * Usage:
 *   node scripts/refresh-firing-stats.mjs
 *   pnpm guardrail:firing-stats
 *
 * @module refresh-firing-stats
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = path.join(ROOT, 'docs/guardrails/firing-log.jsonl');
const REGISTRY_PATH = path.join(ROOT, 'docs/guardrails/registry.json');

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function warn(msg) {
  console.warn(`[refresh-firing-stats] ${msg}`);
}

function readLog() {
  if (!fs.existsSync(LOG_PATH)) {
    warn(`firing-log not found at ${LOG_PATH} — nothing to do`);
    return null;
  }
  const raw = fs.readFileSync(LOG_PATH, 'utf8');
  const entries = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed));
    } catch {
      // Skip malformed line; never fail the run.
    }
  }
  return entries;
}

function trimOldEntries(entries, now) {
  const cutoff = now - ONE_YEAR_MS;
  const kept = entries.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
  if (kept.length !== entries.length) {
    fs.writeFileSync(
      LOG_PATH,
      kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''),
    );
  }
  return kept;
}

function computeStats(entries) {
  // Return Map<gateId, { lastFiringAt, lastViolationAt }>
  const stats = new Map();
  for (const e of entries) {
    if (!e || typeof e.gate !== 'string') continue;
    const cur = stats.get(e.gate) ?? { lastFiringAt: null, lastViolationAt: null };
    if (!cur.lastFiringAt || e.ts > cur.lastFiringAt) {
      cur.lastFiringAt = e.ts;
    }
    if (e.exitCode !== 0 && (!cur.lastViolationAt || e.ts > cur.lastViolationAt)) {
      cur.lastViolationAt = e.ts;
    }
    stats.set(e.gate, cur);
  }
  return stats;
}

function updateRegistry(stats) {
  if (!fs.existsSync(REGISTRY_PATH)) {
    warn(`registry not found at ${REGISTRY_PATH} — nothing to update`);
    return { updated: 0, total: 0 };
  }
  const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
  let registry;
  try {
    registry = JSON.parse(raw);
  } catch (e) {
    warn(`registry is not valid JSON: ${e.message} — refusing to write`);
    return { updated: 0, total: 0 };
  }
  let updated = 0;
  for (const gate of registry.gates ?? []) {
    const s = stats.get(gate.id);
    if (!s) continue;
    let changed = false;
    if (gate.lastFiringAt !== s.lastFiringAt) {
      gate.lastFiringAt = s.lastFiringAt;
      changed = true;
    }
    if (s.lastViolationAt && gate.lastViolationAt !== s.lastViolationAt) {
      gate.lastViolationAt = s.lastViolationAt;
      changed = true;
    }
    if (changed) updated++;
  }
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2) + '\n');
  return { updated, total: registry.gates?.length ?? 0 };
}

function main() {
  const entries = readLog();
  if (entries === null) return;
  const now = Date.now();
  const kept = trimOldEntries(entries, now);
  const stats = computeStats(kept);
  const { updated, total } = updateRegistry(stats);
  console.log(
    `[refresh-firing-stats] log entries: ${kept.length} (trimmed ${entries.length - kept.length}); ` +
      `registry: ${updated}/${total} gates updated`,
  );
}

try {
  main();
} catch (e) {
  warn(`unexpected error: ${e.message} — exiting 0 anyway (best-effort)`);
}
