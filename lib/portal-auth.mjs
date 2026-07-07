/**
 * Server-side client-portal auth — HMAC token check + signed session cookie.
 *
 * Real auth, unlike the old client-bundled `VITE_PORTAL_HMAC_SECRET`: the
 * signing secret is a SERVER-only env var, the token check runs inside the
 * Vercel function (api/portal-verify.ts), and a valid token hands out an
 * httpOnly signed cookie. The static SPA bundle no longer carries the secret,
 * so the `/c/:slug` link is a real gate — mirrors `lib/ops-auth.mjs`.
 *
 * Link compatibility: the per-client TOKEN scheme is unchanged from the old
 * client verifier and `scripts/generate-portal-token.mjs`, so every link
 * already handed to a client keeps verifying:
 *   token = lowercase-hex( HMAC-SHA256( secret, utf8(slug) ) )
 * The SESSION COOKIE is a separate, slug-scoped token (below).
 *
 * Env (server-only — set in Vercel, NOT `VITE_`-prefixed so it never bundles):
 *   PORTAL_HMAC_SECRET  secret for portal tokens + session cookies (any long string).
 *                       Set it to the SAME value the old VITE_PORTAL_HMAC_SECRET
 *                       held so existing links keep working.
 */
import crypto from 'node:crypto';

export const PORTAL_COOKIE = 'portal_session';
export const PORTAL_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function portalSecret() {
  const s = process.env.PORTAL_HMAC_SECRET;
  if (!s) throw new Error('PORTAL_HMAC_SECRET is not set');
  return s;
}

/** True iff the portal secret is present (so the gate is actually configured). */
export function portalAuthConfigured() {
  return Boolean(process.env.PORTAL_HMAC_SECRET);
}

/**
 * Computes the per-client link token: lowercase-hex HMAC-SHA256(secret, slug).
 * Byte-identical to the old browser verifier + the CLI generator.
 */
export function computePortalToken(slug) {
  return crypto.createHmac('sha256', portalSecret()).update(String(slug), 'utf8').digest('hex');
}

/** True iff `token` is a valid link token for `slug` (constant-time). */
export function checkPortalToken(slug, token) {
  if (!slug || typeof token !== 'string') return false;
  // Hex digest is 64 chars; reject anything else cheaply before crypto work.
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  let expected;
  try {
    expected = computePortalToken(slug);
  } catch {
    return false; // secret not configured
  }
  const a = Buffer.from(token.toLowerCase());
  const b = Buffer.from(expected.toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Signs `{ slug, exp }` into a `payload.sig` session token (slug-scoped). */
export function signPortalSession(slug, expMs) {
  const payload = Buffer.from(JSON.stringify({ slug: String(slug), exp: expMs })).toString('base64url');
  const sig = crypto.createHmac('sha256', portalSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * True iff `token` has a valid signature, is unexpired, AND was minted for
 * `slug` — so a cookie issued for one client can't authorize another.
 */
export function verifyPortalSession(token, slug) {
  if (typeof token !== 'string' || !token.includes('.')) return false;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return false;
  let expected;
  try {
    expected = crypto.createHmac('sha256', portalSecret()).update(payload).digest('base64url');
  } catch {
    return false; // secret not configured
  }
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const { slug: s, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return s === String(slug) && typeof exp === 'number' && Date.now() < exp;
  } catch {
    return false;
  }
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

/** Guard for the portal — true iff the request carries a valid session cookie for `slug`. */
export function requirePortalAuth(req, slug) {
  return verifyPortalSession(readCookie(req, PORTAL_COOKIE), slug);
}

/** Sets the portal session cookie on the response (httpOnly, Secure, SameSite=Lax). */
export function setPortalCookie(res, token, maxAgeMs = PORTAL_SESSION_TTL_MS) {
  res.setHeader(
    'Set-Cookie',
    [
      `${PORTAL_COOKIE}=${encodeURIComponent(token)}`,
      'Path=/',
      'HttpOnly',
      'Secure',
      'SameSite=Lax',
      `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ].join('; '),
  );
}

/** Clears the portal session cookie. */
export function clearPortalCookie(res) {
  res.setHeader('Set-Cookie', `${PORTAL_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}
