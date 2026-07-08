/**
 * lib/ops/notify.mjs — shared notify seam (#41 Slice 4, observability layer).
 *
 * One place to emit a fleet event: appends a committed, append-only JSONL
 * row (same design as `lib/ops/run-log.mjs`) AND fans the same event out to
 * Discord if `DISCORD_WEBHOOK_URL` is set. This is the seam every future
 * dispatcher/worker (#41 Slice 2+) posts through instead of each script
 * re-inventing its own "tell Adrian" plumbing — `scripts/deploy-alert.mjs`
 * already had one inlined `postToDiscord`; this module is that helper
 * extracted so deploy-alert and everything after it share one implementation.
 *
 * Row shape (one JSON object per line, oldest-appended-first in the file):
 *   ts       ISO timestamp — stamped by the caller (scripts/notify.mjs stamps
 *            it at post-time; this module never calls Date.now() itself, so
 *            it stays trivially unit-testable)
 *   kind     one of EVENT_KINDS — dispatched | completed | approval_waiting |
 *            deploy_error | blocked
 *   title    <=140 chars, one line, what happened
 *   detail   optional — longer free-text context
 *   url      optional — link back to the source (session, deployment, PR)
 *   task     optional — issue ref / task label
 *
 * Three functions, pure-ish and independently unit-testable:
 *   notifyEvent(event, opts?)   validates required fields, appends one line,
 *                               fans out to Discord (fail-soft — never throws)
 *   readEvents(limit?, opts?)   parses the file, tolerant of bad lines,
 *                               returns newest-first
 *   postToDiscord(text, opts?) plain-text POST to a Discord webhook, 8s
 *                               timeout, never throws — extracted from
 *                               scripts/deploy-alert.mjs's inlined version
 *
 * All three accept an optional `{ path, webhookUrl, fetch }` override so
 * tests never touch the real committed file or the real network.
 */

import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

/** Default location of the committed events log — relative to repo root. */
export const EVENTS_PATH = join(ROOT, 'docs', 'ops', 'events.jsonl');

/** Adrian sets this in Vercel (Production + Preview) — agents never read/write .env*. */
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

export const EVENT_KINDS = [
  'dispatched',
  'completed',
  'approval_waiting',
  'deploy_error',
  'blocked',
];

const REQUIRED_FIELDS = ['ts', 'kind', 'title'];
const OPTIONAL_FIELDS = ['detail', 'url', 'task'];

/**
 * Throws with a message naming every missing/invalid required field, and a
 * separate message if `kind` is a non-empty string but not a recognized kind.
 * @param {object} entry
 */
export function validateEventEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('notify event must be an object');
  }
  const missing = REQUIRED_FIELDS.filter(
    (f) => typeof entry[f] !== 'string' || entry[f].trim() === '',
  );
  if (missing.length > 0) {
    throw new Error(`notify event missing required field(s): ${missing.join(', ')}`);
  }
  if (!EVENT_KINDS.includes(entry.kind)) {
    throw new Error(
      `notify event has unrecognized kind "${entry.kind}" — must be one of: ${EVENT_KINDS.join(' | ')}`,
    );
  }
}

/**
 * POSTs a plain-text message to a Discord webhook. Fail-soft: never throws —
 * always resolves to `{ sent, reason? }`. 8s timeout so a hung webhook can
 * never hang the caller.
 *
 * @param {string} text — Discord message content
 * @param {{ webhookUrl?: string, fetch?: typeof fetch }} [opts]
 * @returns {Promise<{ sent: boolean, reason?: string }>}
 */
export async function postToDiscord(text, opts = {}) {
  const webhookUrl = opts.webhookUrl ?? process.env.DISCORD_WEBHOOK_URL;
  const doFetch = opts.fetch ?? fetch;

  if (!webhookUrl) {
    return {
      sent: false,
      reason: `DISCORD_WEBHOOK_URL not set — Adrian sets it at ${VERCEL_ENV_URL} (Production + Preview) to enable Discord delivery`,
    };
  }

  try {
    const res = await doFetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: text }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      return { sent: false, reason: `Discord ${res.status}: ${detail.slice(0, 200)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, reason: `Discord POST failed: ${e.message}` };
  }
}

/** Renders one event row as a single Discord message line. */
function formatEventForDiscord(row) {
  const emoji =
    { deploy_error: '⚠️', blocked: '⚠️', approval_waiting: '⏳', completed: '✅', dispatched: '🚀' }[
      row.kind
    ] ?? 'ℹ️';
  let line = `${emoji} **${row.kind}** — ${row.title}`;
  if (row.task) line += ` (${row.task})`;
  if (row.detail) line += `\n${row.detail}`;
  if (row.url) line += `\n${row.url}`;
  return line;
}

/**
 * Validates, appends one event to the committed JSONL log, and fans it out
 * to Discord if a webhook is configured. Fail-soft on the Discord leg only —
 * a webhook failure/absence never throws and never blocks the append; a
 * validation failure DOES throw, before anything is written.
 *
 * @param {{ ts: string, kind: string, title: string, detail?: string,
 *   url?: string, task?: string }} event
 * @param {{ path?: string, webhookUrl?: string, fetch?: typeof fetch }} [opts]
 * @returns {Promise<{ appended: object, discord: { sent: boolean, reason?: string } }>}
 */
export async function notifyEvent(event, opts = {}) {
  validateEventEntry(event);
  const path = opts.path ?? EVENTS_PATH;

  const row = { ts: event.ts, kind: event.kind, title: event.title };
  for (const f of OPTIONAL_FIELDS) {
    if (typeof event[f] === 'string' && event[f].trim() !== '') row[f] = event[f];
  }

  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(row)}\n`, 'utf8');

  const discord = await postToDiscord(formatEventForDiscord(row), {
    webhookUrl: opts.webhookUrl,
    fetch: opts.fetch,
  });

  return { appended: row, discord };
}

/**
 * Reads and parses the events log, newest-first. Tolerant of bad lines
 * (skips them rather than throwing) and a missing file (returns []).
 *
 * @param {number} [limit] max entries to return (omit for all)
 * @param {{ path?: string }} [opts]
 * @returns {object[]}
 */
export function readEvents(limit, opts = {}) {
  const path = opts.path ?? EVENTS_PATH;
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
