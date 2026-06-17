/**
 * validators/correlation.mjs
 *
 * Test-runner adapter for the request/response correlation Map (build unit
 * p5-2). `scripts/run-validator-tests.mjs` discovers fixtures under
 * `fixtures/correlation/` and feeds each `input.json` to this default-
 * exported function. The function exercises the requested scenario and
 * returns a shape the fixture's `expected.json` asserts against.
 *
 * Scenarios (input.json shape):
 *   { "scenario": "roundtrip" | "timeout" | "unknown-id",
 *     "id": string,        // envelope id used for the fixture
 *     "type": string,      // envelope type label
 *     "ttlMs": number      // (timeout scenario) TTL override
 *   }
 *
 * Returned shape — discriminated by `scenario`:
 *   roundtrip   → { ok: true,  resolvedWith: object,  size: 0 }
 *   timeout     → { ok: false, code: 'TIMEOUT', requestId: id, size: 0 }
 *   unknown-id  → { ok: true,  matched: false, size: 0 }
 *
 * The validator stays thin: the contract under test is the correlation
 * library itself (scripts/correlation.mjs). This file orchestrates the
 * three canonical fixture cases.
 */

import {
  registerPendingRequest,
  resolvePendingRequest,
  _resetPendingRequests,
  _pendingRequestsSize,
} from '../scripts/correlation.mjs';

export default async function correlationValidator(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'MALFORMED', message: 'fixture input is not an object' };
  }
  const scenario = input.scenario;
  const id = typeof input.id === 'string' ? input.id : '11111111-1111-4111-8111-111111111111';
  const type = typeof input.type === 'string' ? input.type : 'fixture.test';

  // Each fixture starts from a clean pending-Map so cases don't interfere.
  _resetPendingRequests();

  switch (scenario) {
    case 'roundtrip': {
      // Register a pending request with a generous TTL, then immediately
      // resolve it from the "reply" side. The Promise must resolve with
      // the reply payload before the TTL fires.
      const ttlMs = typeof input.ttlMs === 'number' ? input.ttlMs : 5_000;
      const pending = registerPendingRequest({ id, type }, { ttlMs });
      const replyPayload = { type: 'reply', inReplyTo: id, ok: true };
      const matched = resolvePendingRequest(id, replyPayload);
      const resolvedWith = await pending;
      return {
        ok: true,
        matched,
        resolvedWith,
        size: _pendingRequestsSize(),
      };
    }

    case 'timeout': {
      // Use a tiny TTL so the test runs fast. The TIMEOUT shape MUST be
      // `{ code: 'TIMEOUT', requestId: id, message: ... }` — that's the
      // contract the retry loop's runtime-error path consumes.
      const ttlMs = typeof input.ttlMs === 'number' ? input.ttlMs : 25;
      const pending = registerPendingRequest({ id, type }, { ttlMs });
      try {
        await pending;
        return { ok: true, code: 'UNEXPECTED', message: 'pending resolved instead of timing out' };
      } catch (err) {
        return {
          ok: false,
          code: err && err.code,
          requestId: err && err.requestId,
          size: _pendingRequestsSize(),
        };
      }
    }

    case 'unknown-id': {
      // Resolving an id that was never registered must return false and
      // must NOT throw. The pending Map stays empty.
      const matched = resolvePendingRequest('00000000-0000-4000-8000-000000000000', { stray: true });
      return {
        ok: true,
        matched,
        size: _pendingRequestsSize(),
      };
    }

    default:
      return { ok: false, code: 'MALFORMED', message: `unknown scenario: ${scenario}` };
  }
}
