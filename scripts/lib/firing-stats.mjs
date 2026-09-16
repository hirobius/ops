/**
 * scripts/lib/firing-stats.mjs — pure computation over the guardrail firing log.
 *
 * Extracted from refresh-firing-stats.mjs (issue #330) so the stats math is
 * unit-testable without touching the filesystem. `docs/guardrails/firing-log.jsonl`
 * is the append-only record written by run-gates.mjs's --emit-jsonl; this module
 * turns it into per-gate `{ lastFiringAt, lastViolationAt }` for the gitignored
 * sidecar at docs/guardrails/firing-stats.json — the sole source of truth for
 * "has this gate ever caught anything." registry.json carries neither field.
 *
 * @module firing-stats
 */

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Parse raw JSONL text into an array of entries, skipping blank/malformed lines.
 *
 * @param {string} raw
 * @returns {object[]}
 */
export function parseLog(raw) {
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

/**
 * Drop entries older than one year (relative to `now`). Pure — the caller
 * decides whether to persist the trimmed result.
 *
 * @param {object[]} entries
 * @param {number} now  epoch ms
 * @returns {object[]}
 */
export function trimOldEntries(entries, now) {
  const cutoff = now - ONE_YEAR_MS;
  return entries.filter((e) => {
    const t = Date.parse(e.ts);
    return Number.isFinite(t) && t >= cutoff;
  });
}

/**
 * Compute per-gate `{ lastFiringAt, lastViolationAt }` from firing-log entries.
 * `lastFiringAt` tracks the latest entry regardless of exit code (a "firing" is
 * a run, not a pass); `lastViolationAt` tracks the latest entry with a non-zero
 * `exitCode`.
 *
 * @param {object[]} entries
 * @returns {Map<string, {lastFiringAt: string|null, lastViolationAt: string|null}>}
 */
export function computeStats(entries) {
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
