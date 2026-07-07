// @vitest-environment node
/**
 * lib/ops-auth.mjs — checkAgentKey, the OPS_AGENT_KEY machine-auth path.
 *
 * Lets headless agents call the /ops hub via `Authorization: Bearer <key>`
 * instead of the browser session cookie. requireOpsAuth() OR's this in
 * alongside verifySession() — covered indirectly by tests/api/ops-handler.test.ts;
 * this file is the direct unit coverage for the new function.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { checkAgentKey, requireOpsAuth } from '../../lib/ops-auth.mjs';

const ORIGINAL_KEY = process.env.OPS_AGENT_KEY;

function req(authorization?: string) {
  return { headers: authorization ? { authorization } : {} } as never;
}

describe('checkAgentKey', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPS_AGENT_KEY;
    else process.env.OPS_AGENT_KEY = ORIGINAL_KEY;
  });

  it('is false when OPS_AGENT_KEY is unset (feature off)', () => {
    delete process.env.OPS_AGENT_KEY;
    expect(checkAgentKey(req('Bearer anything'))).toBe(false);
  });

  it('matches a correct Bearer token', () => {
    process.env.OPS_AGENT_KEY = 'super-secret-agent-key';
    expect(checkAgentKey(req('Bearer super-secret-agent-key'))).toBe(true);
  });

  it('rejects a wrong token', () => {
    process.env.OPS_AGENT_KEY = 'super-secret-agent-key';
    expect(checkAgentKey(req('Bearer wrong-key'))).toBe(false);
  });

  it('rejects a missing Authorization header', () => {
    process.env.OPS_AGENT_KEY = 'super-secret-agent-key';
    expect(checkAgentKey(req())).toBe(false);
  });

  it('rejects a non-Bearer Authorization header', () => {
    process.env.OPS_AGENT_KEY = 'super-secret-agent-key';
    expect(checkAgentKey(req('Basic super-secret-agent-key'))).toBe(false);
  });

  describe('requireOpsAuth — OR with the session cookie', () => {
    beforeEach(() => {
      process.env.OPS_AGENT_KEY = 'super-secret-agent-key';
    });

    it('authorizes on a valid agent key with no cookie at all', () => {
      expect(requireOpsAuth(req('Bearer super-secret-agent-key'))).toBe(true);
    });

    it('still 401-shaped (false) with neither a valid cookie nor a valid key', () => {
      expect(requireOpsAuth(req('Bearer wrong-key'))).toBe(false);
    });
  });
});
