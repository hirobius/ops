/**
 * protocol/envelope.mjs
 *
 * Message-envelope protocol for bridge↔plugin traffic. Build unit p5-1.
 *
 * Envelope shape:
 *   {
 *     id:        string  (UUID v4)
 *     type:      string  (verb, e.g. "selection.update")
 *     payload:   object
 *     timestamp: number  (ms since epoch)
 *     hmac:      string  (HMAC-SHA256(secret, stableStringify({id,type,timestamp,payload})))
 *   }
 *
 * The Figma plugin sandbox cannot import from this file. The mirror
 * implementation lives at `figma-agent-plugin/protocol-envelope.js` and
 * MUST stay byte-equivalent in HMAC output for the same inputs.
 *
 * Schema decisions (also documented in the unit's commit body):
 *   - Clock-skew tolerance: ±60s on either side of now.
 *   - Hard expiry:           5 minutes (300_000 ms) past `timestamp`.
 *   - Replay-protection set: in-memory Map, FIFO-evicted at 1000 entries.
 *
 * Hard rules (CLAUDE.md / OPERATOR_BRIEF.md):
 *   - No new npm dependencies; native Node crypto only.
 *   - This file is the protocol library only — wiring the envelope into
 *     hds-bridge.mjs / plugin code.js belongs to p5-2 and p5-3.
 */

import crypto from 'node:crypto';

export const CLOCK_SKEW_MS = 60_000;     // ±60s tolerance for future timestamps
export const MAX_AGE_MS = 5 * 60_000;    // 5 min hard expiry
export const REPLAY_SET_LIMIT = 1000;    // FIFO eviction beyond this

// ── stable serialization ───────────────────────────────────────────────────

/**
 * Deterministic JSON serializer: object keys sorted lexicographically at
 * every level, no whitespace. Used as the HMAC pre-image so the Node-side
 * and plugin-side implementations produce identical signatures.
 */
export function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((v) => stableStringify(v)).join(',') + ']';
  }
  const keys = Object.keys(value).sort();
  const parts = [];
  for (const k of keys) {
    const v = value[k];
    if (v === undefined) continue; // mirror JSON.stringify behavior
    parts.push(JSON.stringify(k) + ':' + stableStringify(v));
  }
  return '{' + parts.join(',') + '}';
}

// ── helpers ────────────────────────────────────────────────────────────────

function computeHmac(secret, preimage) {
  return crypto.createHmac('sha256', String(secret)).update(preimage).digest('hex');
}

function preimageOf(envelope) {
  // HMAC binds the four schema fields. Order doesn't matter — stableStringify
  // sorts keys — but be explicit so the contract is readable.
  return stableStringify({
    id: envelope.id,
    payload: envelope.payload,
    timestamp: envelope.timestamp,
    type: envelope.type,
  });
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

// ── replay-protection set (in-memory, module-scoped) ──────────────────────

const _seenIds = new Map(); // id → timestamp; insertion-ordered for FIFO eviction

function recordSeen(id) {
  if (_seenIds.has(id)) {
    // refresh insertion order is not desired — keep original entry
    return;
  }
  _seenIds.set(id, Date.now());
  while (_seenIds.size > REPLAY_SET_LIMIT) {
    const firstKey = _seenIds.keys().next().value;
    _seenIds.delete(firstKey);
  }
}

/** Test/diagnostics helper — clears the replay-protection set. */
export function _resetReplaySet() {
  _seenIds.clear();
}

/** Test/diagnostics helper — current replay-set size. */
export function _replaySetSize() {
  return _seenIds.size;
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Build a signed envelope.
 *
 * @param {string} type    Verb, e.g. "selection.update".
 * @param {object} payload Arbitrary serializable object.
 * @param {string} secret  Shared secret (UTF-8 string).
 * @returns {object}       Envelope ready for transport.
 */
export function createEnvelope(type, payload, secret) {
  if (typeof type !== 'string' || type.length === 0) {
    throw new TypeError('createEnvelope: type must be a non-empty string');
  }
  if (payload === null || typeof payload !== 'object') {
    throw new TypeError('createEnvelope: payload must be an object');
  }
  if (typeof secret !== 'string' || secret.length === 0) {
    throw new TypeError('createEnvelope: secret must be a non-empty string');
  }
  const envelope = {
    id: crypto.randomUUID(),
    type,
    payload,
    timestamp: Date.now(),
  };
  envelope.hmac = computeHmac(secret, preimageOf(envelope));
  return envelope;
}

/**
 * Verify a received envelope.
 *
 * @param {object} envelope
 * @param {string} secret
 * @param {{ now?: number }} [options] Optional clock override (testing).
 * @returns {{ ok: true } | { ok: false, code: string, message?: string }}
 */
export function verifyEnvelope(envelope, secret, options = {}) {
  if (envelope === null || typeof envelope !== 'object') {
    return { ok: false, code: 'MALFORMED', message: 'envelope is not an object' };
  }
  const { id, type, payload, timestamp, hmac } = envelope;
  if (typeof id !== 'string' || id.length === 0) {
    return { ok: false, code: 'MALFORMED', message: 'missing id' };
  }
  if (typeof type !== 'string' || type.length === 0) {
    return { ok: false, code: 'MALFORMED', message: 'missing type' };
  }
  if (payload === null || typeof payload !== 'object') {
    return { ok: false, code: 'MALFORMED', message: 'missing or invalid payload' };
  }
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp)) {
    return { ok: false, code: 'MALFORMED', message: 'missing or invalid timestamp' };
  }
  if (typeof hmac !== 'string' || hmac.length === 0) {
    return { ok: false, code: 'MALFORMED', message: 'missing hmac' };
  }
  if (typeof secret !== 'string' || secret.length === 0) {
    return { ok: false, code: 'MALFORMED', message: 'verifier secret must be non-empty string' };
  }

  const now = typeof options.now === 'number' ? options.now : Date.now();

  // Future-skew check (timestamp claims to be too far in the future)
  if (timestamp - now > CLOCK_SKEW_MS) {
    return { ok: false, code: 'EXPIRED', message: 'timestamp is in the future beyond clock-skew tolerance' };
  }
  // Past expiry check (timestamp older than MAX_AGE_MS)
  if (now - timestamp > MAX_AGE_MS) {
    return { ok: false, code: 'EXPIRED', message: 'envelope older than max-age' };
  }

  // HMAC check
  const expected = computeHmac(secret, preimageOf(envelope));
  if (!timingSafeEqualHex(expected, hmac)) {
    return { ok: false, code: 'HMAC_MISMATCH', message: 'hmac signature does not match' };
  }

  // Replay check — must come after HMAC (don't pollute the set with junk)
  if (_seenIds.has(id)) {
    return { ok: false, code: 'REPLAY', message: 'envelope id already seen' };
  }
  recordSeen(id);

  return { ok: true };
}

export default { createEnvelope, verifyEnvelope, stableStringify };
