#!/usr/bin/env node
/**
 * scripts/refresh-firing-stats.mjs
 *
 * Reads docs/guardrails/firing-log.jsonl (produced by run-gates.mjs
 * --emit-jsonl, see 13g-12-postcommit-verifier) and computes per-gate
 * `lastFiringAt` / `lastViolationAt` stats via scripts/lib/firing-stats.mjs.
 *
 * Output is docs/guardrails/firing-stats.json — a gitignored sidecar, and
 * the sole source of truth for this telemetry (issue #330).
 * `docs/guardrails/registry.json` does not carry `lastFiringAt` or
 * `lastViolationAt` at all: an earlier version baked this sidecar into the
 * registry (`--bake`), which re-dirtied the tree on every commit (issue
 * #205) and, worse, went stale the moment nobody ran the bake — 24 of 52
 * gates carried a `lastFiringAt` frozen on one of two bake dates, read as
 * live telemetry when it was a snapshot. The bake path is gone; the
 * sidecar is the only place this data lives.
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
import { parseLog, trimOldEntries, computeStats } from './lib/firing-stats.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = path.join(ROOT, 'docs/guardrails/firing-log.jsonl');
const SIDECAR_PATH = path.join(ROOT, 'docs/guardrails/firing-stats.json');

function warn(msg) {
  console.warn(`[refresh-firing-stats] ${msg}`);
}

function readLog() {
  if (!fs.existsSync(LOG_PATH)) {
    warn(`firing-log not found at ${LOG_PATH} — nothing to do`);
    return null;
  }
  return parseLog(fs.readFileSync(LOG_PATH, 'utf8'));
}

function persistTrim(entries, kept) {
  if (kept.length !== entries.length) {
    fs.writeFileSync(
      LOG_PATH,
      kept.map((e) => JSON.stringify(e)).join('\n') + (kept.length ? '\n' : ''),
    );
  }
}

function writeSidecar(stats) {
  const obj = Object.fromEntries(stats.entries());
  fs.writeFileSync(SIDECAR_PATH, JSON.stringify(obj, null, 2) + '\n');
  return { updated: stats.size };
}

function main() {
  const entries = readLog();
  if (entries === null) return;
  const now = Date.now();
  const kept = trimOldEntries(entries, now);
  persistTrim(entries, kept);
  const stats = computeStats(kept);
  const { updated: sidecarUpdated } = writeSidecar(stats);
  console.log(
    `[refresh-firing-stats] log entries: ${kept.length} (trimmed ${entries.length - kept.length}); ` +
      `sidecar (${path.relative(ROOT, SIDECAR_PATH)}): ${sidecarUpdated} gate(s)`,
  );
}

try {
  main();
} catch (e) {
  warn(`unexpected error: ${e.message} — exiting 0 anyway (best-effort)`);
}
