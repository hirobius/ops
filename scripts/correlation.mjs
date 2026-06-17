/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/correlation.mjs
 *
 * Request/response correlation Map used by `scripts/hds-bridge.mjs`. Build
 * unit p5-2.
 *
 * Each outbound envelope (bridge → plugin) is registered here with a
 * 30-second TTL. The plugin echoes the original `envelope.id` back as
 * `inReplyTo` on every reply; the bridge looks the id up here and resolves
 * the pending Promise. Unknown ids are not present in the Map and the
 * caller (the bridge `/plugin-message` route) logs and ignores — never
 * throws.
 *
 * Map mechanics:
 *   - Key:   envelope.id (UUID v4)
 *   - Value: { type, timestamp, timer, resolve, reject }
 *   - TTL:   30_000 ms. Rationale: long enough for a manual Figma plugin
 *            roundtrip including font load + variable hydration; short
 *            enough that a stuck Map self-cleans without operator action.
 *   - Cap:   PENDING_LIMIT = 1000 entries; FIFO-evicted on overflow with a
 *            synthetic TIMEOUT rejection so callers never leak Promises.
 *
 * Hard rules:
 *   - No new npm dependencies; built-in Map + setTimeout only.
 *   - When `correlationEnabled` is false in bridge.config.json, the bridge
 *     does not call into this module at all (the flag-off path is byte-
 *     equivalent to pre-p5-2 behavior).
 */

import fs from 'fs';
import path from 'path';

export const REQUEST_TTL_MS = 30_000;
export const PENDING_LIMIT = 1000;

// Closed set of plugin runtime-error codes (build unit p5-4). The bridge
// silently coerces anything outside this set to UNKNOWN before propagating
// to the retry loop so downstream callers can pattern-match without a
// catch-all branch.
export const RUNTIME_ERROR_CODES = Object.freeze([
  'MISSING_MASTER',
  'FONT_LOAD_FAILED',
  'UNKNOWN_TOKEN_PATH',
  'UNKNOWN',
]);

const _pending = new Map();

const BRIDGE_CONFIG_PATH = path.join(process.cwd(), 'bridge.config.json');

export function readCorrelationFlag() {
  try {
    const raw = fs.readFileSync(BRIDGE_CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return Boolean(cfg.correlationEnabled);
  } catch {
    return false;
  }
}

/**
 * Build unit p5-4: feature-flag read for the plugin runtime-error channel.
 * Defaults to false on any read/parse error — flag-off behavior is the
 * pre-p5-4 baseline (plugin failures stay silent, retry loop never sees
 * a runtime error).
 */
export function readRuntimeErrorsFlag() {
  try {
    const raw = fs.readFileSync(BRIDGE_CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return Boolean(cfg.runtimeErrorsEnabled);
  } catch {
    return false;
  }
}

function evictOldestIfOverCap() {
  while (_pending.size > PENDING_LIMIT) {
    const firstKey = _pending.keys().next().value;
    const entry = _pending.get(firstKey);
    _pending.delete(firstKey);
    if (entry && entry.timer) clearTimeout(entry.timer);
    if (entry && typeof entry.reject === 'function') {
      entry.reject({
        code: 'TIMEOUT',
        requestId: firstKey,
        message: 'evicted: pending Map at capacity',
      });
    }
  }
}

/**
 * Register a pending request keyed by `envelope.id`. Returns a Promise
 * that resolves with the reply payload, or rejects with
 * `{ code: 'TIMEOUT', requestId }` after `ttlMs` (default 30s).
 *
 * @param {{ id: string, type?: string }} envelope
 * @param {{ ttlMs?: number }} [options]
 * @returns {Promise<object>}
 */
export function registerPendingRequest(envelope, options = {}) {
  if (!envelope || typeof envelope !== 'object' || typeof envelope.id !== 'string' || envelope.id.length === 0) {
    return Promise.reject(new TypeError('registerPendingRequest: envelope.id (string) is required'));
  }
  const ttlMs = typeof options.ttlMs === 'number' ? options.ttlMs : REQUEST_TTL_MS;
  return new Promise((resolve, reject) => {
    const id = envelope.id;
    const timer = setTimeout(() => {
      const entry = _pending.get(id);
      if (!entry) return;
      _pending.delete(id);
      entry.reject({
        code: 'TIMEOUT',
        requestId: id,
        message: `request ${id} timed out after ${ttlMs}ms`,
      });
    }, ttlMs);
    if (typeof timer.unref === 'function') timer.unref();

    _pending.set(id, {
      type: envelope.type || null,
      timestamp: Date.now(),
      timer,
      resolve,
      reject,
    });
    evictOldestIfOverCap();
  });
}

/**
 * Resolve a pending request when a reply arrives.
 *
 * @param {string} requestId  Original envelope.id (echoed by plugin).
 * @param {object} replyPayload  Whatever payload the reply carries.
 * @returns {boolean}  True if a pending entry matched; false otherwise.
 */
export function resolvePendingRequest(requestId, replyPayload) {
  if (typeof requestId !== 'string') return false;
  const entry = _pending.get(requestId);
  if (!entry) return false;
  _pending.delete(requestId);
  if (entry.timer) clearTimeout(entry.timer);
  entry.resolve(replyPayload);
  return true;
}

/**
 * Reject a pending request. Used by the build unit p5-4 plugin runtime-
 * error channel: when the plugin posts a `render-error` message back to
 * the bridge, the bridge calls this with the original envelope.id so the
 * retry loop's runtime-error path observes the failure identically to a
 * validator error.
 *
 * Unknown ids return false and never throw — this matches resolve's
 * unknown-id semantics and prevents a misbehaving plugin from crashing
 * the bridge.
 *
 * @param {string} requestId
 * @param {{ code: string, requestId?: string, message?: string }} errorPayload
 * @returns {boolean}  True if a pending entry matched; false otherwise.
 */
export function rejectPendingRequest(requestId, errorPayload) {
  if (typeof requestId !== 'string') return false;
  const entry = _pending.get(requestId);
  if (!entry) return false;
  _pending.delete(requestId);
  if (entry.timer) clearTimeout(entry.timer);
  entry.reject(errorPayload);
  return true;
}

/** Snapshot for diagnostic endpoints. */
export function snapshotPending() {
  const now = Date.now();
  const out = [];
  for (const [id, entry] of _pending) {
    out.push({ id, type: entry.type, ageMs: now - entry.timestamp });
  }
  return out;
}

/** Test/diagnostics — drain the pending Map. */
export function _resetPendingRequests() {
  for (const [, entry] of _pending) {
    if (entry && entry.timer) clearTimeout(entry.timer);
  }
  _pending.clear();
}

/** Test/diagnostics — current pending Map size. */
export function _pendingRequestsSize() {
  return _pending.size;
}

/**
 * Build unit p5-4: pure handler for inbound `render-error` messages.
 *
 * Wraps the feature-flag check and the closed-set code coercion so the
 * bridge wiring (and the validator fixture) hit the exact same code
 * path. When the flag is off this is a strict no-op and the pending
 * Map is untouched — that's how the flag-off path stays byte-equivalent
 * to pre-p5-4 behavior.
 *
 * Sanitization rules:
 *   - `code` is coerced to UNKNOWN if it falls outside RUNTIME_ERROR_CODES.
 *   - `message` is forced to a string and trimmed to one line. Stack
 *     traces and Figma API internals must NOT be passed in by callers
 *     (the plugin sandbox is responsible for sanitizing before posting),
 *     but we defensively collapse newlines anyway so accidental leaks
 *     don't make it to the retry loop's logs.
 *
 * @param {{ message: object, runtimeErrorsEnabled: boolean }} args
 * @returns {{ matched: boolean, dispatched: boolean, code: string|null, requestId: string|null }}
 */
export function handleRenderError({ message, runtimeErrorsEnabled }) {
  if (!runtimeErrorsEnabled) {
    return { matched: false, dispatched: false, code: null, requestId: null };
  }
  if (!message || typeof message !== 'object' || message.type !== 'render-error') {
    return { matched: false, dispatched: false, code: null, requestId: null };
  }
  const requestId = typeof message.inReplyTo === 'string' ? message.inReplyTo : null;
  if (!requestId) {
    return { matched: false, dispatched: true, code: null, requestId: null };
  }

  const rawCode = typeof message.code === 'string' ? message.code : '';
  const code = RUNTIME_ERROR_CODES.indexOf(rawCode) === -1 ? 'UNKNOWN' : rawCode;
  const rawMsg = typeof message.message === 'string' ? message.message : '';
  // Collapse to one line — defense-in-depth even though the sandbox
  // sanitizes before posting. Never propagate stack traces.
  const sanitizedMessage = rawMsg.replace(/\s+/g, ' ').trim().slice(0, 280);

  const matched = rejectPendingRequest(requestId, {
    code,
    requestId,
    message: sanitizedMessage,
  });
  return { matched, dispatched: true, code, requestId };
}

export default {
  registerPendingRequest,
  resolvePendingRequest,
  rejectPendingRequest,
  snapshotPending,
  readCorrelationFlag,
  readRuntimeErrorsFlag,
  handleRenderError,
  RUNTIME_ERROR_CODES,
  REQUEST_TTL_MS,
  PENDING_LIMIT,
  _resetPendingRequests,
  _pendingRequestsSize,
};
