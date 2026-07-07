/**
 * Server-side /ops auth — HMAC-signed session cookie.
 *
 * Real auth, unlike the old client-bundled `VITE_OPS_GATE_HASH`: the password
 * and the signing secret are SERVER-only env vars, the check runs inside the
 * Vercel function, and a successful login hands out an httpOnly signed cookie.
 * Every protected `api/` route calls `requireOpsAuth(req)` and 401s without it,
 * so the data + actions are gated even though the SPA bundle itself is public.
 *
 * Env (server-only — set in Vercel, NOT `VITE_`-prefixed so they never bundle):
 *   OPS_GATE_PASSWORD   the /ops password (plaintext; compared constant-time)
 *   OPS_SESSION_SECRET  random secret used to sign session cookies (any long string)
 *   OPS_AGENT_KEY       optional machine-auth token for headless agents (see
 *                       checkAgentKey below). Unset = feature off.
 */
import crypto from 'node:crypto';

export const OPS_COOKIE = 'ops_session';
export const OPS_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function sessionSecret() {
  const s = process.env.OPS_SESSION_SECRET;
  if (!s) throw new Error('OPS_SESSION_SECRET is not set');
  return s;
}

/** True iff both required env vars are present (so the gate is actually configured). */
export function opsAuthConfigured() {
  return Boolean(process.env.OPS_GATE_PASSWORD && process.env.OPS_SESSION_SECRET);
}

/** True iff `input` matches OPS_GATE_PASSWORD (constant-time; both hashed to a fixed length). */
export function checkPassword(input) {
  const expected = process.env.OPS_GATE_PASSWORD || '';
  if (!expected || typeof input !== 'string') return false;
  const h = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();
  return crypto.timingSafeEqual(h(input), h(expected));
}

/** Signs `{ exp }` into a `payload.sig` token. */
export function signSession(expMs) {
  const payload = Buffer.from(JSON.stringify({ exp: expMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** True iff `token` has a valid signature and is unexpired. */
export function verifySession(token) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  let expected;
  try {
    expected = crypto.createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  } catch {
    return false; // secret not configured
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
}

/**
 * True iff the request carries `Authorization: Bearer <token>` matching
 * `OPS_AGENT_KEY`. Lets headless agents (no browser, no session cookie) call
 * the ops hub with the same access as a logged-in operator — the key is
 * server-only and Adrian-set, so this is acceptable. Constant-time compare,
 * same pattern as checkPassword: both sides hashed to a fixed length first so
 * a length mismatch can't short-circuit the comparison. Always false when
 * OPS_AGENT_KEY is unset (feature simply off).
 */
export function checkAgentKey(req) {
  const expected = process.env.OPS_AGENT_KEY;
  if (!expected) return false;
  const header = (req && req.headers && req.headers.authorization) || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const token = match[1];
  const h = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest();
  return crypto.timingSafeEqual(h(token), h(expected));
}

function readCookie(req, name) {
  const header = (req && req.headers && req.headers.cookie) || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return '';
}

/**
 * Guard for api/ routes — true iff the request carries a valid ops session
 * cookie OR a valid OPS_AGENT_KEY bearer token. A valid agent key grants the
 * same access as a logged-in operator (see checkAgentKey).
 */
export function requireOpsAuth(req) {
  return verifySession(readCookie(req, OPS_COOKIE)) || checkAgentKey(req);
}

/** Sets the session cookie on the response (httpOnly, Secure, SameSite=Lax). */
export function setSessionCookie(res, token, maxAgeMs = OPS_SESSION_TTL_MS) {
  res.setHeader(
    'Set-Cookie',
    [
      `${OPS_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ].join('; '),
  );
}

/** Clears the session cookie (logout). */
export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${OPS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
