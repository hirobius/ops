/**
 * validators/runtime-error-channel.mjs
 *
 * Test-runner adapter for the plugin runtime-error channel (build unit
 * p5-4). `scripts/run-validator-tests.mjs` discovers fixtures under
 * `fixtures/runtime-error-channel/` and feeds each `input.json` to this
 * default-exported function.
 *
 * Scenarios (input.json shape):
 *   { "scenario": "render-error-roundtrip"
 *               | "render-error-no-pending-id"
 *               | "flag-off-passthrough",
 *     "runtimeErrorsEnabled": boolean,
 *     "id": string,                 // pending entry envelope.id
 *     "type": string,               // pending envelope type label
 *     "ttlMs": number,              // pending TTL override
 *     "renderError": {              // simulated inbound from plugin
 *       "type": "render-error",
 *       "inReplyTo": string,        // echoed envelope.id
 *       "code": "MISSING_MASTER" | "FONT_LOAD_FAILED" | "UNKNOWN_TOKEN_PATH" | "UNKNOWN" | string,
 *       "message": string
 *     }
 *   }
 *
 * Returned shape — discriminated by scenario:
 *   render-error-roundtrip      → { ok: false, code, requestId, message,
 *                                   matched: true, dispatched: true,
 *                                   pendingSize: 0 }
 *   render-error-no-pending-id  → { ok: true, matched: false, dispatched: true,
 *                                   pendingSize: 0 }
 *   flag-off-passthrough        → { ok: true, matched: false, dispatched: false,
 *                                   pendingSize: 1, pendingStillRegistered: true }
 *
 * The contract under test is `scripts/correlation.mjs#handleRenderError`
 * (the same code path the bridge wires up in p5-4). This file only
 * orchestrates the three canonical fixture cases.
 */

import {
  registerPendingRequest,
  handleRenderError,
  _resetPendingRequests,
  _pendingRequestsSize,
} from '../scripts/correlation.mjs';

export default async function runtimeErrorChannelValidator(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, code: 'MALFORMED', message: 'fixture input is not an object' };
  }

  const scenario = input.scenario;
  const id = typeof input.id === 'string' ? input.id : '11111111-1111-4111-8111-111111111111';
  const type = typeof input.type === 'string' ? input.type : 'fixture.test';
  const ttlMs = typeof input.ttlMs === 'number' ? input.ttlMs : 5_000;
  const runtimeErrorsEnabled = Boolean(input.runtimeErrorsEnabled);
  const renderErrorMessage = (input.renderError && typeof input.renderError === 'object')
    ? input.renderError
    : null;

  // Fixtures must not interfere with each other.
  _resetPendingRequests();

  switch (scenario) {
    case 'render-error-roundtrip': {
      // Register a pending request, then simulate the bridge receiving a
      // render-error pointing at the same envelope.id. The pending Promise
      // MUST reject with `{ code, requestId, message }` — the exact shape
      // the retry loop's runtime-error path consumes — and the pending
      // Map must drain to size 0.
      const pending = registerPendingRequest({ id, type }, { ttlMs });
      const verdict = handleRenderError({
        message: renderErrorMessage,
        runtimeErrorsEnabled,
      });
      try {
        await pending;
        return { ok: true, code: 'UNEXPECTED', message: 'pending resolved instead of rejecting' };
      } catch (err) {
        return {
          ok: false,
          code: err && err.code,
          requestId: err && err.requestId,
          message: err && err.message,
          matched: verdict.matched,
          dispatched: verdict.dispatched,
          pendingSize: _pendingRequestsSize(),
        };
      }
    }

    case 'render-error-no-pending-id': {
      // The render-error references an envelope.id the bridge never
      // registered. handleRenderError must NOT throw and must return
      // matched=false. The pending Map stays empty.
      const verdict = handleRenderError({
        message: renderErrorMessage,
        runtimeErrorsEnabled,
      });
      return {
        ok: true,
        matched: verdict.matched,
        dispatched: verdict.dispatched,
        pendingSize: _pendingRequestsSize(),
      };
    }

    case 'flag-off-passthrough': {
      // Flag off: handleRenderError is a strict no-op. Register a
      // pending entry first, fire a render-error at it, then prove the
      // pending entry is still registered (i.e. the Promise was neither
      // resolved nor rejected). The byte-equivalent check vs pre-p5-4
      // is "pending Map untouched after a render-error".
      let pendingSettled = false;
      const pending = registerPendingRequest({ id, type }, { ttlMs });
      pending.then(
        () => { pendingSettled = true; },
        () => { pendingSettled = true; },
      );

      const verdict = handleRenderError({
        message: renderErrorMessage,
        runtimeErrorsEnabled, // expected: false in this scenario
      });

      // Yield once so any microtasks (which there shouldn't be) settle
      // before we check the size.
      await Promise.resolve();

      const pendingSize = _pendingRequestsSize();
      // Drain the leftover entry so the next fixture starts clean.
      _resetPendingRequests();
      // Swallow the synthetic-eviction rejection that _resetPendingRequests
      // can produce on some implementations (current one doesn't, but be
      // defensive so the test never logs an unhandled rejection).
      pending.catch(() => {});

      return {
        ok: true,
        matched: verdict.matched,
        dispatched: verdict.dispatched,
        pendingSize,
        pendingStillRegistered: !pendingSettled,
      };
    }

    default:
      return { ok: false, code: 'MALFORMED', message: `unknown scenario: ${scenario}` };
  }
}
