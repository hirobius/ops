/**
 * Vercel Serverless Function — /api/portal-verify
 *
 * Server-side gate for the public client portal (`/c/:slug?token=…`). Verifies
 * the per-client HMAC token against the server-only PORTAL_HMAC_SECRET and, on
 * success, sets an httpOnly signed session cookie. The secret never reaches the
 * browser bundle — mirrors api/ops-login.ts. Raw (req,res) handler because it
 * sets a cookie (withOpsHandler cannot).
 *
 * One endpoint, two methods (keeps the function count under the Hobby cap):
 *   GET  ?slug=…            → { authorized, configured } — does the caller's
 *                             existing cookie already authorize this slug?
 *   POST { slug, token }    → verify token → set cookie → { ok: true }
 *
 * Success (POST): 200 { ok: true } + Set-Cookie: portal_session
 * Errors: 401 { ok: false } bad token · 405 wrong method · 503 not configured
 *
 * Env (server-only): PORTAL_HMAC_SECRET.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  checkPortalToken,
  portalAuthConfigured,
  requirePortalAuth,
  signPortalSession,
  setPortalCookie,
  PORTAL_SESSION_TTL_MS,
} from '../lib/portal-auth.mjs';

function slugOf(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (!portalAuthConfigured()) {
    res.status(503).json({
      error:
        'Portal auth is not configured. Set PORTAL_HMAC_SECRET in Vercel → Settings → ' +
        'Environment Variables (Production + Preview), then redeploy.',
      code: 'ENV_MISSING_PORTAL_SECRET',
    });
    return;
  }

  // GET — does the caller's existing cookie already authorize this slug?
  if (req.method === 'GET') {
    const slug = slugOf(req.query?.['slug']);
    res.status(200).json({ authorized: Boolean(slug) && requirePortalAuth(req, slug), configured: true });
    return;
  }

  // POST — exchange a valid link token for a session cookie.
  if (req.method === 'POST') {
    const body = req.body as { slug?: unknown; token?: unknown } | undefined;
    const slug = slugOf(body?.slug);
    const token = typeof body?.token === 'string' ? body.token : '';
    // Deliberately never reveal whether the slug is known — a generic refusal
    // keeps the URL itself the credential (matches the portal's Unauthorized copy).
    if (!slug || !checkPortalToken(slug, token)) {
      res.status(401).json({ ok: false });
      return;
    }
    setPortalCookie(res, signPortalSession(slug, Date.now() + PORTAL_SESSION_TTL_MS));
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
}
