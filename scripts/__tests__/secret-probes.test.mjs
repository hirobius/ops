import { describe, it, expect } from 'vitest';

import {
  probePresence,
  probeGithubTokenExpiry,
  probeNpmWhoami,
  probeFigmaMe,
  probeSupabaseSelect,
  PROBES,
  WARN_DAYS,
} from '../lib/secret-probes.mjs';

function fakeFetch(status, body, headers = {}) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  });
}

describe('probePresence', () => {
  it('is not set when the value is undefined', async () => {
    const r = await probePresence({ value: undefined });
    expect(r).toEqual({ ok: false, verified: false, daysRemaining: null, message: 'not set' });
  });

  it('is not set when the value is an empty/whitespace string', async () => {
    const r = await probePresence({ value: '   ' });
    expect(r.ok).toBe(false);
  });

  it('is set and NEVER claims verified — the one rule this probe must not break', async () => {
    const r = await probePresence({ value: 'anything' });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(false);
  });
});

describe('probeGithubTokenExpiry', () => {
  it('CANARY — a bogus/rejected token fails with a message naming the HTTP status, and verified=true', async () => {
    const fetchImpl = fakeFetch(401, {});
    const r = await probeGithubTokenExpiry({ value: 'bogus-token-value', fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(true); // we DID authenticate — GitHub rejected it
    expect(r.message).toMatch(/401/);
    expect(r.message).toMatch(/invalid|revoked/i);
  });

  it('is not set when there is no value, and does not call fetch', async () => {
    let called = false;
    const fetchImpl = async () => {
      called = true;
      throw new Error('should not be called');
    };
    const r = await probeGithubTokenExpiry({ value: undefined, fetchImpl });
    expect(r).toEqual({ ok: false, verified: false, daysRemaining: null, message: 'not set' });
    expect(called).toBe(false);
  });

  it('reads a real GitHub-shaped expiration header and computes days remaining', async () => {
    const now = new Date('2026-09-22T00:00:00Z');
    const fetchImpl = fakeFetch(
      200,
      {},
      { 'github-authentication-token-expiration': '2026-10-06 00:00:00 UTC' },
    );
    const r = await probeGithubTokenExpiry({ value: 'tok', fetchImpl, now });
    expect(r.ok).toBe(true);
    expect(r.verified).toBe(true);
    expect(r.daysRemaining).toBe(14);
    expect(r.message).toContain('14 day(s) remaining');
  });

  it('flags an already-expired token from the header as unhealthy', async () => {
    const now = new Date('2026-09-22T00:00:00Z');
    const fetchImpl = fakeFetch(
      200,
      {},
      { 'github-authentication-token-expiration': '2026-09-01 00:00:00 UTC' },
    );
    const r = await probeGithubTokenExpiry({ value: 'tok', fetchImpl, now });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/expired/i);
  });

  it('falls back to a registry-recorded expiresAt when GitHub sends no expiration header', async () => {
    const now = new Date('2026-09-22T00:00:00Z');
    const fetchImpl = fakeFetch(200, {}); // no header
    const r = await probeGithubTokenExpiry({
      value: 'tok',
      fetchImpl,
      now,
      expiresAt: '2026-09-25T00:00:00Z',
    });
    expect(r.ok).toBe(true);
    expect(r.daysRemaining).toBe(3);
    expect(r.message).toContain('registry expiresAt');
    expect(r.message).toContain('no expiration header');
  });

  it('reports expiry as genuinely unknown when neither the header nor expiresAt is available', async () => {
    const fetchImpl = fakeFetch(200, {});
    const r = await probeGithubTokenExpiry({ value: 'tok', fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.daysRemaining).toBeNull();
    expect(r.message).toMatch(/expiry unknown/i);
  });

  it('reports a network error without ever throwing', async () => {
    const fetchImpl = async () => {
      throw new Error('ECONNRESET');
    };
    const r = await probeGithubTokenExpiry({ value: 'tok', fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('ECONNRESET');
  });
});

describe('probeNpmWhoami', () => {
  it('CANARY — a bogus npm token is rejected', async () => {
    const fetchImpl = fakeFetch(401, {});
    const r = await probeNpmWhoami({ value: 'bogus', fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(true);
    expect(r.message).toMatch(/401/);
  });

  it('a valid token authenticates and reports the username', async () => {
    const fetchImpl = fakeFetch(200, { username: 'hirobius-ci' });
    const r = await probeNpmWhoami({ value: 'good', fetchImpl });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('hirobius-ci');
  });
});

describe('probeFigmaMe', () => {
  it('CANARY — a bogus Figma token is rejected (403)', async () => {
    const fetchImpl = fakeFetch(403, {});
    const r = await probeFigmaMe({ value: 'bogus', fetchImpl });
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(true);
    expect(r.message).toMatch(/403/);
  });

  it('a valid token authenticates', async () => {
    const fetchImpl = fakeFetch(200, { id: 'u1', email: 'adrian@hirobius.com' });
    const r = await probeFigmaMe({ value: 'good', fetchImpl });
    expect(r.ok).toBe(true);
  });
});

describe('probeSupabaseSelect', () => {
  it('CANARY — a bogus SUPABASE_ACCESS_TOKEN is rejected by the Management API', async () => {
    const fetchImpl = fakeFetch(401, {});
    const r = await probeSupabaseSelect({
      name: 'SUPABASE_ACCESS_TOKEN',
      value: 'bogus',
      env: {},
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.verified).toBe(true);
    expect(r.message).toMatch(/401/);
  });

  it('SUPABASE_ACCESS_TOKEN succeeds against the Management API with a select 1', async () => {
    const fetchImpl = fakeFetch(200, [{ '?column?': 1 }]);
    const r = await probeSupabaseSelect({
      name: 'SUPABASE_ACCESS_TOKEN',
      value: 'good',
      env: {},
      fetchImpl,
    });
    expect(r.ok).toBe(true);
    expect(r.message).toContain('select 1;');
  });

  it('SUPABASE_SERVICE_ROLE_KEY needs a companion SUPABASE_URL to be verifiable at all', async () => {
    const r = await probeSupabaseSelect({
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      value: 'k',
      env: {},
      fetchImpl: fakeFetch(200, []),
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain('SUPABASE_URL is not set');
  });

  it('CANARY — a rejected SUPABASE_SERVICE_ROLE_KEY reports the HTTP status', async () => {
    const fetchImpl = fakeFetch(401, {});
    const r = await probeSupabaseSelect({
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      value: 'bogus',
      env: { SUPABASE_URL: 'https://example.supabase.co' },
      fetchImpl,
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/401/);
  });

  it('sanitizes a SUPABASE_URL that already carries a trailing /rest/v1 — the exact bug this probe hit against the real ops project', async () => {
    const calledUrls = [];
    const fetchImpl = async (url) => {
      calledUrls.push(url);
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => [] };
    };
    await probeSupabaseSelect({
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      value: 'k',
      env: { SUPABASE_URL: 'https://proj.example.com/rest/v1/' },
      fetchImpl,
    });
    expect(calledUrls[0]).toBe('https://proj.example.com/rest/v1/leads?select=id&limit=1');
  });

  it('a valid service-role key selects successfully', async () => {
    const fetchImpl = fakeFetch(200, [{ id: '1' }]);
    const r = await probeSupabaseSelect({
      name: 'SUPABASE_SERVICE_ROLE_KEY',
      value: 'good',
      env: { SUPABASE_URL: 'https://proj.example.com' },
      fetchImpl,
    });
    expect(r.ok).toBe(true);
  });
});

describe('PROBES dispatch table', () => {
  it('has exactly the five probe names the registry schema documents', () => {
    expect(Object.keys(PROBES).sort()).toEqual(
      ['figma-me', 'github-token-expiry', 'npm-whoami', 'presence', 'supabase-select'].sort(),
    );
  });
});

describe('WARN_DAYS', () => {
  it('is 14, per ops#415', () => {
    expect(WARN_DAYS).toBe(14);
  });
});
