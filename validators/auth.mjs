/**
 * validators/auth.mjs
 *
 * Test-runner adapter for the HMAC auth middleware (build unit p5-3).
 * `scripts/run-validator-tests.mjs` discovers fixtures under
 * `fixtures/auth/` and feeds each `input.json` to this default-exported
 * function. Each scenario simulates an inbound POST /plugin-message
 * (envelope body + Authorization header) and asserts the middleware
 * verdict against `expected.json`.
 *
 * Scenarios (input.json shape):
 *   { "scenario": "valid" | "tampered" | "wrong-secret" | "flag-off",
 *     "secret":   string,                  // bridge-side secret
 *     "clientSecret": string,              // (wrong-secret) signing secret
 *     "authEnabled": boolean,              // feature flag
 *     "type": string,
 *     "payload": object,
 *     "tamper": object,                    // (tampered) post-sign mutation
 *     "stripAuthHeader": boolean }         // optional
 *
 * Returned shape — flat so fixtures assert with deepEqual on each key:
 *   { ok: boolean,
 *     code: 'VERIFIED' | 'PASSTHROUGH' | 'AUTH_FAILED',
 *     reason: string | null,    // granular failure reason for logs
 *     httpStatus: 200 | 401,    // what the middleware would return
 *     wireCode: 'HMAC_MISMATCH' | null }   // body.code on a 401
 *
 * The validator stays thin: the contract under test is
 * `scripts/auth-middleware.mjs` (which wraps `verifyEnvelope`). This file
 * just orchestrates the four canonical fixture cases.
 */

import { createEnvelope, _resetReplaySet } from '../protocol/envelope.mjs';
import { verifyAuthRequest } from '../scripts/auth-middleware.mjs';

function shape(verdict) {
  if (verdict.ok) {
    return {
      ok: true,
      code: verdict.code,
      reason: null,
      httpStatus: 200,
      wireCode: null,
    };
  }
  return {
    ok: false,
    code: verdict.code,           // 'AUTH_FAILED'
    reason: verdict.reason || null,
    httpStatus: 401,
    wireCode: 'HMAC_MISMATCH',    // public response code (always this on 401)
  };
}

export default function authValidator(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'MALFORMED', reason: 'fixture input is not an object', httpStatus: 401, wireCode: 'HMAC_MISMATCH' };
  }

  const scenario = input.scenario;
  const secret = typeof input.secret === 'string' ? input.secret : 'bridge-secret';
  const authEnabled = Boolean(input.authEnabled);
  const type = typeof input.type === 'string' ? input.type : 'selection.update';
  const payload = (input.payload && typeof input.payload === 'object') ? input.payload : { fixture: true };

  // Each fixture starts from a clean replay-set so cases don't interfere
  // with each other when they reuse the same envelope id.
  _resetReplaySet();

  switch (scenario) {
    case 'valid': {
      // Envelope signed with the same secret the bridge expects. Header
      // matches the envelope's hmac field. Should pass cleanly.
      const env = createEnvelope(type, payload, secret);
      const verdict = verifyAuthRequest({
        body: env,
        authHeader: 'HMAC ' + env.hmac,
        secret,
        authEnabled,
      });
      return shape(verdict);
    }

    case 'tampered': {
      // Sign the envelope, then mutate the payload after signing. The
      // header still matches body.hmac (the attacker can compute that
      // trivially) but the underlying verifyEnvelope call must reject
      // because the recomputed HMAC over the tampered preimage diverges.
      const env = createEnvelope(type, payload, secret);
      env.payload = Object.assign({}, env.payload, input.tamper || { _tamper: 'evil' });
      const verdict = verifyAuthRequest({
        body: env,
        authHeader: 'HMAC ' + env.hmac,
        secret,
        authEnabled,
      });
      return shape(verdict);
    }

    case 'wrong-secret': {
      // Envelope signed with a DIFFERENT secret than the bridge holds.
      // Header and body agree internally, but verifyEnvelope returns
      // HMAC_MISMATCH against the bridge secret.
      const clientSecret = typeof input.clientSecret === 'string' ? input.clientSecret : 'attacker-secret';
      const env = createEnvelope(type, payload, clientSecret);
      const verdict = verifyAuthRequest({
        body: env,
        authHeader: 'HMAC ' + env.hmac,
        secret,                      // bridge holds a different secret
        authEnabled,
      });
      return shape(verdict);
    }

    case 'flag-off': {
      // authEnabled === false: the middleware MUST be a strict pass-
      // through. Send an UNSIGNED body and no Authorization header to
      // prove the flag-off path doesn't leak any verification logic.
      const verdict = verifyAuthRequest({
        body: { hello: 'world' },    // not an envelope at all
        authHeader: input.stripAuthHeader === false ? 'HMAC deadbeef' : undefined,
        secret,                      // even if set, must not be consulted
        authEnabled: false,
      });
      return shape(verdict);
    }

    default:
      return { ok: false, code: 'MALFORMED', reason: `unknown scenario: ${scenario}`, httpStatus: 401, wireCode: 'HMAC_MISMATCH' };
  }
}
