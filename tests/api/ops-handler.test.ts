// @vitest-environment node
/**
 * Tests at the new seam (ADR-0004).
 *
 * The two wrappers are the deep modules, so they ARE the test surface; one
 * converted handler (leadsHandler) is then tested through its inner fn with a
 * stub `sb` — the headline win of the deepening: a handler's logic is testable
 * with no cookie, no env, and no `res` mock.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';

// withServiceClient acquires the client through this module — mock it so we can
// drive the 503 path and inject a stub without touching a real database.
vi.mock('../../lib/supabase/server.mjs', () => ({ getServiceClient: vi.fn() }));

import { getServiceClient } from '../../lib/supabase/server.mjs';
import { withOpsHandler, withServiceClient } from '../../lib/api/handler';
import { signSession, OPS_SESSION_TTL_MS } from '../../lib/ops-auth.mjs';
import { leadsHandler } from '../../api/leads';

// Auth verifies the cookie against this secret; set it so signSession + verifySession agree.
process.env.OPS_SESSION_SECRET = 'test-secret-for-ops-handler-suite';

function makeReq(over: Partial<VercelRequest> = {}): VercelRequest {
  return { method: 'GET', headers: {}, query: {}, body: undefined, ...over } as VercelRequest;
}

function authedReq(over: Partial<VercelRequest> = {}): VercelRequest {
  const token = signSession(Date.now() + OPS_SESSION_TTL_MS);
  const headers = { cookie: `ops_session=${encodeURIComponent(token)}`, ...(over.headers ?? {}) };
  return makeReq({ ...over, headers });
}

function makeRes() {
  const res = {
    statusCode: 0 as number,
    jsonBody: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(b: unknown) {
      this.jsonBody = b;
      return this;
    },
  };
  return res as typeof res & VercelResponse;
}

beforeEach(() => {
  vi.mocked(getServiceClient).mockReset();
});

describe('withOpsHandler', () => {
  it('401s without a valid session cookie', async () => {
    const h = withOpsHandler('GET', () => ({ status: 200, body: { ok: true } }));
    const res = makeRes();
    await h(makeReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(401);
    expect(res.jsonBody).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('405s on the wrong method (even when authed)', async () => {
    const h = withOpsHandler('GET', () => ({ status: 200, body: {} }));
    const res = makeRes();
    await h(authedReq({ method: 'POST' }), res);
    expect(res.statusCode).toBe(405);
  });

  it('passes the inner {status, body} straight through on the happy path', async () => {
    const h = withOpsHandler('GET', () => ({ status: 201, body: { hi: 1 } }));
    const res = makeRes();
    await h(authedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(201);
    expect(res.jsonBody).toEqual({ hi: 1 });
  });

  it('turns an inner throw into a uniform 500 (the backstop)', async () => {
    const h = withOpsHandler('GET', () => {
      throw new Error('boom');
    });
    const res = makeRes();
    await h(authedReq({ method: 'GET' }), res);
    expect(res.statusCode).toBe(500);
    expect(res.jsonBody).toEqual({ error: 'boom' });
  });
});

describe('withServiceClient', () => {
  it('503s with ENV_MISSING_SUPABASE when the client cannot be acquired', async () => {
    vi.mocked(getServiceClient).mockRejectedValueOnce(new Error('SUPABASE_MISSING_ENV: unset'));
    const inner = withServiceClient(() => ({ status: 200, body: { ok: true } }));
    const result = await inner(makeReq());
    expect(result.status).toBe(503);
    expect(result.body).toMatchObject({ code: 'ENV_MISSING_SUPABASE' });
  });

  it('injects the client and delegates to the inner fn', async () => {
    const stubSb = { tag: 'sb' } as unknown as SupabaseClient;
    vi.mocked(getServiceClient).mockResolvedValueOnce(stubSb);
    const inner = withServiceClient((sb) => ({ status: 200, body: { injected: sb === stubSb } }));
    const result = await inner(makeReq());
    expect(result).toEqual({ status: 200, body: { injected: true } });
  });
});

describe('leadsHandler (a converted handler, tested with a stub sb)', () => {
  // Minimal Supabase query-builder stub: from().select().order().limit() → {data, error}.
  function stubLeads(resolved: { data: unknown; error: unknown }): SupabaseClient {
    const limit = () => Promise.resolve(resolved);
    const order = () => ({ limit });
    const select = () => ({ order });
    return { from: () => ({ select }) } as unknown as SupabaseClient;
  }

  it('returns 200 with the rows on success — no cookie, no env, no res', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }];
    const result = await leadsHandler(stubLeads({ data: rows, error: null }), makeReq({ query: {} }));
    expect(result).toEqual({ status: 200, body: { leads: rows } });
  });

  it('maps a Supabase error to 500', async () => {
    const result = await leadsHandler(
      stubLeads({ data: null, error: { message: 'db down' } }),
      makeReq(),
    );
    expect(result).toEqual({ status: 500, body: { error: 'db down' } });
  });
});
