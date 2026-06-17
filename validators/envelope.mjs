/**
 * validators/envelope.mjs
 *
 * Test-runner adapter for the message-envelope protocol (build unit p5-1).
 * `scripts/run-validator-tests.mjs` discovers fixtures under
 * `fixtures/envelope/` and feeds each `input.json` to this default-exported
 * function. The function executes the requested scenario and returns the
 * outcome shape that the fixture's `expected.json` asserts against.
 *
 * Scenarios (input.json shape):
 *   { "scenario": "roundtrip" | "tampered" | "expired" | "replay",
 *     "secret":   string,
 *     "type":     string,
 *     "payload":  object }
 *
 * Returned shape mirrors `verifyEnvelope`:
 *   { ok: true } | { ok: false, code: string, message?: string }
 *
 * The validator is intentionally thin: the contract under test is the
 * envelope library itself (protocol/envelope.mjs). This file only
 * orchestrates the four canonical fixture cases.
 */

import crypto from 'node:crypto';
import {
  createEnvelope,
  verifyEnvelope,
  stableStringify,
  MAX_AGE_MS,
  _resetReplaySet,
} from '../protocol/envelope.mjs';

function preimageOf(envelope) {
  return stableStringify({
    id: envelope.id,
    payload: envelope.payload,
    timestamp: envelope.timestamp,
    type: envelope.type,
  });
}

export default function envelopeValidator(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'MALFORMED', message: 'fixture input is not an object' };
  }
  const scenario = input.scenario;
  const secret = typeof input.secret === 'string' ? input.secret : 'fixture-secret';
  const type = typeof input.type === 'string' ? input.type : 'selection.update';
  const payload = (input.payload && typeof input.payload === 'object') ? input.payload : { fixture: true };

  // Each fixture starts from a clean replay-set so cases don't interfere.
  _resetReplaySet();

  switch (scenario) {
    case 'roundtrip': {
      const env = createEnvelope(type, payload, secret);
      return verifyEnvelope(env, secret);
    }

    case 'tampered': {
      const env = createEnvelope(type, payload, secret);
      // Mutate payload after signing so the HMAC no longer matches.
      env.payload = { ...env.payload, _tamper: 'evil' };
      return verifyEnvelope(env, secret);
    }

    case 'expired': {
      // Build an envelope that is correctly signed BUT whose timestamp is
      // older than MAX_AGE_MS. The HMAC must remain valid (otherwise the
      // verifier would short-circuit on HMAC_MISMATCH instead of EXPIRED),
      // so we re-sign with the back-dated timestamp.
      const env = createEnvelope(type, payload, secret);
      env.timestamp = Date.now() - (MAX_AGE_MS + 60_000);
      env.hmac = crypto.createHmac('sha256', secret).update(preimageOf(env)).digest('hex');
      return verifyEnvelope(env, secret);
    }

    case 'replay': {
      const env = createEnvelope(type, payload, secret);
      const first = verifyEnvelope(env, secret);
      if (!first.ok) {
        return { ok: false, code: 'UNEXPECTED', message: 'first verify did not succeed: ' + (first.code || '?') };
      }
      // Submit the same envelope a second time → replay set must reject.
      return verifyEnvelope(env, secret);
    }

    default:
      return { ok: false, code: 'MALFORMED', message: `unknown scenario: ${scenario}` };
  }
}
