/**
 * Tests for lib/portal-auth.mjs — the server-side portal token check + signed,
 * slug-scoped session cookie. Deterministic; sets PORTAL_HMAC_SECRET in-process.
 */
import { test, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  computePortalToken,
  checkPortalToken,
  signPortalSession,
  verifyPortalSession,
  portalAuthConfigured,
} from '../../lib/portal-auth.mjs';

const SECRET = 'test-portal-secret-abc123';

beforeEach(() => {
  process.env.PORTAL_HMAC_SECRET = SECRET;
});

test('portalAuthConfigured reflects the env var', () => {
  assert.equal(portalAuthConfigured(), true);
});

test('checkPortalToken accepts a correctly-minted token', () => {
  const token = computePortalToken('acme-co');
  assert.equal(checkPortalToken('acme-co', token), true);
});

test('token scheme matches the CLI generator (HMAC-SHA256 hex of the slug)', () => {
  const expected = crypto.createHmac('sha256', SECRET).update('acme-co', 'utf8').digest('hex');
  assert.equal(computePortalToken('acme-co'), expected);
});

test('checkPortalToken rejects a token minted for a different slug', () => {
  const token = computePortalToken('acme-co');
  assert.equal(checkPortalToken('other-co', token), false);
});

test('checkPortalToken rejects malformed / empty tokens', () => {
  assert.equal(checkPortalToken('acme-co', ''), false);
  assert.equal(checkPortalToken('acme-co', 'not-hex'), false);
  assert.equal(checkPortalToken('acme-co', 'a'.repeat(63)), false);
  assert.equal(checkPortalToken('', computePortalToken('acme-co')), false);
});

test('signPortalSession → verifyPortalSession round-trips for the same slug', () => {
  const cookie = signPortalSession('acme-co', Date.now() + 60_000);
  assert.equal(verifyPortalSession(cookie, 'acme-co'), true);
});

test('a session minted for slug A does not authorize slug B', () => {
  const cookie = signPortalSession('acme-co', Date.now() + 60_000);
  assert.equal(verifyPortalSession(cookie, 'beta-co'), false);
});

test('an expired session is rejected', () => {
  const cookie = signPortalSession('acme-co', Date.now() - 1);
  assert.equal(verifyPortalSession(cookie, 'acme-co'), false);
});

test('a tampered session signature is rejected', () => {
  const cookie = signPortalSession('acme-co', Date.now() + 60_000);
  const [payload] = cookie.split('.');
  assert.equal(verifyPortalSession(`${payload}.deadbeef`, 'acme-co'), false);
});

test('a session signed with a different secret is rejected', () => {
  const cookie = signPortalSession('acme-co', Date.now() + 60_000);
  process.env.PORTAL_HMAC_SECRET = 'a-totally-different-secret';
  assert.equal(verifyPortalSession(cookie, 'acme-co'), false);
});
