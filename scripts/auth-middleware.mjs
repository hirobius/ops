/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/auth-middleware.mjs
 *
 * HMAC authentication middleware for the bridge (build unit p5-3). Layered
 * on top of the p5-1 envelope and p5-2 correlation work.
 *
 * Wire contract:
 *   - Inbound POST /plugin-message body MUST be a valid envelope object
 *     when authEnabled is true: { id, type, payload, timestamp, hmac }.
 *   - Header `Authorization: HMAC <hex>` MUST match `body.hmac` AND the
 *     hmac itself MUST verify against the configured shared secret.
 *   - Mismatch → 401 { error: 'AUTH_FAILED', code: 'HMAC_MISMATCH' }.
 *   - Missing header / malformed envelope → 401 with the appropriate code.
 *
 * Feature-flag contract:
 *   - When authEnabled is false the middleware is a strict pass-through;
 *     the bridge accepts unsigned messages exactly as it did pre-p5-3.
 *
 * Hard rules:
 *   - No new npm dependencies; relies on `verifyEnvelope` from p5-1.
 *   - The middleware MUST short-circuit BEFORE any business-logic handler
 *     runs when verification fails.
 *   - When authEnabled=true and HDS_BRIDGE_SECRET is unset, the bridge
 *     refuses to start. There is no hardcoded default secret.
 */

import fs from 'fs';
import path from 'path';
import { verifyEnvelope } from '../protocol/envelope.mjs';

const BRIDGE_CONFIG_PATH = path.join(process.cwd(), 'bridge.config.json');

/**
 * Read the auth feature flag from bridge.config.json. Defaults to false on
 * any read/parse error so the flag-off behavior is the safe fallback.
 */
export function readAuthFlag() {
  try {
    const raw = fs.readFileSync(BRIDGE_CONFIG_PATH, 'utf8');
    const cfg = JSON.parse(raw);
    return Boolean(cfg.authEnabled);
  } catch {
    return false;
  }
}

/**
 * Parse `Authorization: HMAC <hex>` into the hex digest.
 * Returns null if the header is missing or malformed.
 */
export function parseAuthHeader(headerValue) {
  if (typeof headerValue !== 'string' || headerValue.length === 0) return null;
  const match = headerValue.match(/^HMAC\s+([a-f0-9]+)$/i);
  if (!match) return null;
  return match[1].toLowerCase();
}

/**
 * Pure verification function — given a request body, the Authorization
 * header value, the shared secret, and the auth-enabled flag, return one
 * of:
 *   { ok: true, code: 'PASSTHROUGH' }   → flag off; accept as-is
 *   { ok: true, code: 'VERIFIED' }      → flag on; envelope verified
 *   { ok: false, code: 'AUTH_FAILED', reason: <string> }
 *
 * Reasons surface to logs only — the wire response is always the same
 * 401 shape so attackers can't probe failure modes.
 *
 * Exposed separately from the Express middleware so the validator
 * fixture suite can exercise the exact same code path without spinning
 * up an HTTP server.
 */
export function verifyAuthRequest({ body, authHeader, secret, authEnabled }) {
  if (!authEnabled) {
    return { ok: true, code: 'PASSTHROUGH' };
  }

  if (typeof secret !== 'string' || secret.length === 0) {
    // The bridge process refuses to start in this state; the validator
    // surfaces it for fixture coverage.
    return { ok: false, code: 'AUTH_FAILED', reason: 'NO_SECRET' };
  }

  const headerHmac = parseAuthHeader(authHeader);
  if (!headerHmac) {
    return { ok: false, code: 'AUTH_FAILED', reason: 'MISSING_HEADER' };
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, code: 'AUTH_FAILED', reason: 'MALFORMED_BODY' };
  }

  // The header MUST match the envelope's own hmac field. This binds the
  // header to the body — replaying the header against a tampered body
  // can't slip through because the hmac field also has to verify.
  if (typeof body.hmac !== 'string' || body.hmac.toLowerCase() !== headerHmac) {
    return { ok: false, code: 'AUTH_FAILED', reason: 'HEADER_BODY_MISMATCH' };
  }

  const verdict = verifyEnvelope(body, secret);
  if (!verdict.ok) {
    // The verifier returns its own code (HMAC_MISMATCH / EXPIRED /
    // MALFORMED / REPLAY). We collapse all of them under AUTH_FAILED on
    // the wire but keep the underlying reason for logs.
    return { ok: false, code: 'AUTH_FAILED', reason: verdict.code || 'VERIFY_FAILED' };
  }

  return { ok: true, code: 'VERIFIED' };
}

/**
 * Express middleware factory. The factory binds the secret + flag-reader
 * once; the returned middleware is mounted by `scripts/hds-bridge.mjs`
 * before the business-logic /plugin-message handler.
 *
 * @param {{ secret?: string, readFlag?: () => boolean }} [options]
 */
export function createAuthMiddleware(options = {}) {
  const readFlag = typeof options.readFlag === 'function' ? options.readFlag : readAuthFlag;
  const secret = typeof options.secret === 'string' ? options.secret : process.env.HDS_BRIDGE_SECRET;

  return function authMiddleware(req, res, next) {
    const authEnabled = readFlag();
    const verdict = verifyAuthRequest({
      body: req.body,
      authHeader: req.headers && req.headers['authorization'],
      secret,
      authEnabled,
    });

    if (verdict.ok) {
      return next();
    }

    // Short-circuit BEFORE any business handler runs. Log the granular
    // reason locally; respond with the public code only.
    console.warn(
      `[hds-bridge] auth: rejecting ${req.method} ${req.path} — reason=${verdict.reason}`
    );
    return res.status(401).json({ error: 'AUTH_FAILED', code: 'HMAC_MISMATCH' });
  };
}

export default {
  readAuthFlag,
  parseAuthHeader,
  verifyAuthRequest,
  createAuthMiddleware,
};
