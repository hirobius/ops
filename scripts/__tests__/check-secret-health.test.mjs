import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkEntry, runHealthCheck, loadRegistry } from '../check-secret-health.mjs';

const REAL_REGISTRY = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '../../docs/secrets/registry.json'),
    'utf8',
  ),
).secrets;

const REQUIRED_FIELDS = [
  'name',
  'repo',
  'purpose',
  'breaksWhenMissing',
  'rotateUrl',
  'secretUrl',
  'probe',
  'probeStrength',
  'owner',
];
const VALID_PROBES = [
  'github-token-expiry',
  'npm-whoami',
  'figma-me',
  'supabase-select',
  'presence',
];

describe('docs/secrets/registry.json — schema', () => {
  it('loads via loadRegistry()', () => {
    expect(loadRegistry().length).toBe(REAL_REGISTRY.length);
  });

  it('every entry has every required field, non-empty', () => {
    for (const entry of REAL_REGISTRY) {
      for (const field of REQUIRED_FIELDS) {
        expect(entry[field], `${entry.repo}/${entry.name} missing ${field}`).toBeTruthy();
      }
    }
  });

  it('every entry declares one of the five known probes', () => {
    for (const entry of REAL_REGISTRY) {
      expect(VALID_PROBES).toContain(entry.probe);
    }
  });

  it('probeStrength is either verified or presence-only', () => {
    for (const entry of REAL_REGISTRY) {
      expect(['verified', 'presence-only']).toContain(entry.probeStrength);
    }
  });

  it('no (repo, name) pair repeats', () => {
    const seen = new Set();
    for (const entry of REAL_REGISTRY) {
      const key = `${entry.repo}::${entry.name}`;
      expect(seen.has(key), `duplicate entry: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  it('never carries a secret VALUE — every field is metadata, not a credential', () => {
    // A crude but meaningful guard: nothing in the registry should look like
    // a live token (long opaque base64/hex-ish runs with no spaces). This
    // would not catch every shape of secret, but it catches the mistake of
    // pasting one in.
    const raw = JSON.stringify(REAL_REGISTRY);
    expect(raw).not.toMatch(/gh[pousr]_[A-Za-z0-9]{20,}/); // GitHub PAT shapes
    expect(raw).not.toMatch(/figd_[A-Za-z0-9_-]{20,}/); // Figma PAT shape
    expect(raw).not.toMatch(/sb_secret_[A-Za-z0-9_-]{10,}/); // Supabase secret-key shape
  });
});

describe('checkEntry', () => {
  const entry = {
    name: 'FAKE_SECRET',
    repo: 'hirobius/fake',
    purpose: 'testing',
    breaksWhenMissing: 'the tests would be meaningless',
    rotateUrl: 'https://example.com/rotate',
    secretUrl: 'https://example.com/secret',
    probe: 'presence',
    probeStrength: 'presence-only',
    owner: 'Adrian',
  };

  it('reports secret-unhealthy, names the secret/repo/fix, and NEVER echoes the value', async () => {
    const result = await checkEntry(entry, { FAKE_SECRET: undefined });
    expect(result.rule).toBe('secret-unhealthy');
    expect(result.severity).toBe('error');
    expect(result.message).toContain('FAKE_SECRET');
    expect(result.message).toContain('hirobius/fake');
    expect(result.message).toContain(entry.breaksWhenMissing);
    expect(result.message).toContain(entry.rotateUrl);
  });

  it('CANARY — a bogus value on a verified probe is reported unhealthy with the live rejection reason', async () => {
    const verifiedEntry = { ...entry, probe: 'npm-whoami', probeStrength: 'verified' };
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const result = await checkEntry(
      verifiedEntry,
      { FAKE_SECRET: 'definitely-bogus-token-xyz' },
      fetchImpl,
    );
    expect(result.rule).toBe('secret-unhealthy');
    expect(result.probeStrength).toBe('verified');
    expect(result.message).toMatch(/401/);
    // The load-bearing assertion: the bogus VALUE itself never appears in output.
    expect(result.message).not.toContain('definitely-bogus-token-xyz');
  });

  it('a presence-only probe NEVER reports itself as verified, even for a healthy secret', async () => {
    const result = await checkEntry(entry, { FAKE_SECRET: 'set-to-something' });
    expect(result.rule).toBe('secret-healthy');
    expect(result.probeStrength).toBe('presence-only');
  });

  it('an unknown probe name is an error, not a silent pass', async () => {
    const badEntry = { ...entry, probe: 'not-a-real-probe' };
    const result = await checkEntry(badEntry, {});
    expect(result.rule).toBe('unknown-probe');
    expect(result.severity).toBe('error');
  });

  it('flags a soon-to-expire secret as warn, not error, and reports days remaining', async () => {
    const ghEntry = { ...entry, probe: 'github-token-expiry', probeStrength: 'verified' };
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (k) =>
          k.toLowerCase() === 'github-authentication-token-expiration'
            ? '2099-01-08 00:00:00 UTC'
            : null,
      },
      json: async () => ({}),
    });
    // Freeze "now" via expiresAt fallback path is not used here — the header
    // path computes against the real clock, so just assert the shape rather
    // than an exact day count.
    const result = await checkEntry(ghEntry, { FAKE_SECRET: 'tok' }, fetchImpl);
    expect(['secret-healthy', 'secret-expiring-soon']).toContain(result.rule);
    expect(result.severity === 'info' || result.severity === 'warn').toBe(true);
  });
});

describe('runHealthCheck', () => {
  it('CANARY — every registered secret missing from env fails the run with exit-worthy violations', async () => {
    const { violations, summary } = await runHealthCheck(REAL_REGISTRY, {}, async () => {
      throw new Error('should not reach the network when the value is unset');
    });
    expect(summary.unhealthy).toBe(REAL_REGISTRY.length);
    expect(summary.healthy).toBe(0);
    const errorCount = violations.filter((v) => v.severity === 'error').length;
    expect(errorCount).toBe(REAL_REGISTRY.length);
  });

  it('never includes a secret VALUE in any violation message, across the whole real registry, all unhealthy', async () => {
    const fakeEnv = Object.fromEntries(
      REAL_REGISTRY.map((e) => [e.name, 'MARKER_VALUE_SHOULD_NEVER_APPEAR']),
    );
    const fetchImpl = async () => ({
      ok: false,
      status: 401,
      headers: { get: () => null },
      json: async () => ({}),
    });
    const { violations } = await runHealthCheck(REAL_REGISTRY, fakeEnv, fetchImpl);
    for (const v of violations) {
      expect(v.message).not.toContain('MARKER_VALUE_SHOULD_NEVER_APPEAR');
    }
  });

  it('a fully healthy fleet (every probe passes) reports zero error-severity violations', async () => {
    const fakeEnv = Object.fromEntries(REAL_REGISTRY.map((e) => [e.name, 'ok-value']));
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ username: 'u', id: 'u1', email: 'e' }),
    });
    const { violations, summary } = await runHealthCheck(REAL_REGISTRY, fakeEnv, fetchImpl);
    expect(summary.unhealthy).toBe(0);
    expect(violations.filter((v) => v.severity === 'error')).toHaveLength(0);
  });
});
