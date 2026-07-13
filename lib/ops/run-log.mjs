/**
 * lib/ops/run-log.mjs — autonomous-run recap log (#8, run-log half; Slice 2).
 *
 * A committed, append-only JSONL is the whole design: every autonomous
 * agent/session run posts ONE line before it ends, `/ops` build-time-imports
 * the file (same `import.meta.glob` idiom `status.json`/digests already use —
 * see RunsPanel.tsx), and Adrian can glance at the board instead of surfing
 * sessions to find out what ran. No Supabase migration, no new `api/*.ts`
 * route (the Hobby-plan function cap is already at 11/12).
 *
 * Row shape (one JSON object per line, oldest-appended-first in the file):
 *   ts           ISO timestamp — stamped by the caller (scripts/log-run.mjs
 *                stamps it at post-time; this module never calls Date.now()
 *                itself, so it stays trivially unit-testable)
 *   actor        who ran it, e.g. "claude-subagent" | "claude"
 *   outcome      e.g. "shipped" | "blocked" | "no-op"
 *   summary      <=140 chars, one line, what happened
 *   task         optional — issue ref / task label
 *   model        optional — model id/tier label
 *   tier         optional — dispatch tier label
 *   tokens       optional — token count for the run
 *   session_url  optional — link back to the originating session
 *
 * Two functions, pure-ish and independently unit-testable:
 *   appendRun(entry, opts?)   validates required fields, appends one line
 *   readRuns(limit?, opts?)   parses the file, tolerant of bad lines,
 *                             returns newest-first
 *
 * Both accept an optional `{ path }` override so tests never touch the real
 * committed file.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

/** Default location of the committed run log — relative to repo root. */
export const RUN_LOG_PATH = join(ROOT, 'docs', 'ops', 'run-log.jsonl');

const REQUIRED_FIELDS = ['ts', 'actor', 'outcome', 'summary'];
const OPTIONAL_FIELDS = ['task', 'model', 'tier', 'tokens', 'session_url'];

/**
 * Throws with a message naming every missing/invalid required field.
 * @param {object} entry
 */
export function validateRunEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('run-log entry must be an object');
  }
  const missing = REQUIRED_FIELDS.filter(
    (f) => typeof entry[f] !== 'string' || entry[f].trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(`run-log entry missing required field(s): ${missing.join(', ')}`);
  }
}

/**
 * Appends one validated run-log entry to the JSONL file (creating the parent
 * directory if needed). Returns the exact row written.
 *
 * @param {{ ts: string, actor: string, outcome: string, summary: string,
 *   task?: string, model?: string, tier?: string, tokens?: string, session_url?: string }} entry
 * @param {{ path?: string }} [opts]
 * @returns {object} the row that was appended
 */
export function appendRun(entry, opts = {}) {
  validateRunEntry(entry);
  const path = opts.path ?? RUN_LOG_PATH;

  const row = { ts: entry.ts, actor: entry.actor, outcome: entry.outcome, summary: entry.summary };
  for (const f of OPTIONAL_FIELDS) {
    if (typeof entry[f] === 'string' && entry[f].trim() !== '') row[f] = entry[f];
  }

  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/**
 * Reads and parses the run log, newest-first. Tolerant of bad lines (skips
 * them rather than throwing) and a missing file (returns []).
 *
 * @param {number} [limit] max entries to return (omit for all)
 * @param {{ path?: string }} [opts]
 * @returns {object[]}
 */
export function readRuns(limit, opts = {}) {
  const path = opts.path ?? RUN_LOG_PATH;
  if (!existsSync(path)) return [];

  const raw = readFileSync(path, 'utf8');
  const parsed = [];
  let index = 0;
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      if (obj && typeof obj === 'object') parsed.push({ obj, index });
    } catch {
      /* skip malformed line — one bad row can't break the whole log */
    }
    index += 1;
  }

  parsed.sort((a, b) => {
    const ta = Date.parse(a.obj.ts ?? '');
    const tb = Date.parse(b.obj.ts ?? '');
    const va = Number.isFinite(ta) ? ta : -Infinity;
    const vb = Number.isFinite(tb) ? tb : -Infinity;
    if (vb !== va) return vb - va; // newest ts first
    return b.index - a.index; // tie-break: later-appended first
  });

  const out = parsed.map((p) => p.obj);
  return typeof limit === 'number' ? out.slice(0, limit) : out;
}
