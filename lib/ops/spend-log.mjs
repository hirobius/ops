/**
 * lib/ops/spend-log.mjs — committed spend ledger for the fleet spend
 * ceiling (issue #47, B.1). Same append-only JSONL shape as
 * run-log.mjs/notify.mjs — one line per dispatch, so fleet-dispatch.mjs can
 * sum "today's projected spend" before deciding what else it can afford to
 * dispatch in this run.
 *
 * Row shape (one JSON object per line, oldest-appended-first):
 *   ts       ISO timestamp — stamped by the caller (fleet-dispatch.mjs at
 *            dispatch time), never Date.now() inside this module
 *   task     task key, e.g. "github:hirobius/ops#42"
 *   tier     mechanical | standard | judgment
 *   model    sonnet | opus
 *   costUsd  projected cost (lib/tasks/budget.mjs::projectedCostUsd) — a
 *            rough pre-dispatch estimate, not metered actual spend
 *
 * Two functions, pure-ish and independently unit-testable:
 *   appendSpend(entry, opts?)   validates required fields, appends one line
 *   readSpend(opts?)            parses the file, tolerant of bad lines
 *
 * Both accept an optional `{ path }` override so tests never touch the real
 * committed file. `sumSpendSince` is a pure helper over already-read rows.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

/** Default location of the committed spend ledger — relative to repo root. */
export const SPEND_LOG_PATH = join(ROOT, 'docs', 'ops', 'spend-log.jsonl');

const REQUIRED_STRING_FIELDS = ['ts', 'task', 'tier', 'model'];

/** Throws with a message naming every missing/invalid required field. */
export function validateSpendEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('spend-log entry must be an object');
  }
  const missing = REQUIRED_STRING_FIELDS.filter(
    (f) => typeof entry[f] !== 'string' || entry[f].trim() === '',
  );
  if (typeof entry.costUsd !== 'number' || !Number.isFinite(entry.costUsd)) {
    missing.push('costUsd');
  }
  if (missing.length > 0) {
    throw new Error(`spend-log entry missing/invalid required field(s): ${missing.join(', ')}`);
  }
}

/**
 * Appends one validated spend-log entry to the JSONL file (creating the
 * parent directory if needed). Returns the exact row written.
 * @param {{ ts: string, task: string, tier: string, model: string, costUsd: number }} entry
 * @param {{ path?: string }} [opts]
 * @returns {object}
 */
export function appendSpend(entry, opts = {}) {
  validateSpendEntry(entry);
  const path = opts.path ?? SPEND_LOG_PATH;
  const row = {
    ts: entry.ts,
    task: entry.task,
    tier: entry.tier,
    model: entry.model,
    costUsd: entry.costUsd,
  };
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/**
 * Reads and parses the spend ledger. Tolerant of bad lines (skips them
 * rather than throwing) and a missing file (returns []). No ordering
 * guarantee beyond file order (oldest first) — callers that need "today's
 * total" should filter with `sumSpendSince`.
 * @param {{ path?: string }} [opts]
 * @returns {object[]}
 */
export function readSpend(opts = {}) {
  const path = opts.path ?? SPEND_LOG_PATH;
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, 'utf8');
  const rows = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') rows.push(obj);
    } catch {
      /* skip malformed line — one bad row can't break the whole ledger */
    }
  }
  return rows;
}

/**
 * Pure: sum `costUsd` across rows whose `ts` is at/after `sinceMs`.
 * Rows with an unparseable/missing `ts` or non-numeric `costUsd` are
 * excluded rather than throwing — a corrupt row shouldn't crash the ceiling
 * check.
 * @param {object[]} rows
 * @param {number} sinceMs
 * @returns {number}
 */
export function sumSpendSince(rows, sinceMs) {
  const total = (Array.isArray(rows) ? rows : []).reduce((sum, row) => {
    const t = Date.parse(row?.ts ?? '');
    if (!Number.isFinite(t) || t < sinceMs) return sum;
    const cost = Number(row?.costUsd);
    return Number.isFinite(cost) ? sum + cost : sum;
  }, 0);
  return Number(total.toFixed(4));
}
