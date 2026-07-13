/**
 * Vercel Serverless Function — /api/portal-verify
 *
 * Server-side gate for the public client portal (`/c/:slug?token=…`). Verifies
 * the per-client HMAC token against the server-only PORTAL_HMAC_SECRET and, on
 * success, sets an httpOnly signed session cookie. The secret never reaches the
 * browser bundle — mirrors api/ops-login.ts. Raw (req,res) handler because it
 * sets a cookie (withOpsHandler cannot).
 *
 * One endpoint, four routes (keeps the function count at the Hobby cap):
 *   GET  ?slug=…            → { authorized, configured } — does the caller's
 *                             existing cookie already authorize this slug?
 *   GET  ?feedback=1        → { items } — the client-feedback inbox for /ops
 *                             (requires an OPS session, not a portal one)
 *   POST { slug, token }    → verify token → set cookie → { ok: true }
 *   POST { slug, action: 'feedback', message, contact? }
 *                           → persist a portal feedback row (requires a valid
 *                             portal session cookie for that slug — the token
 *                             exchange above must have happened first)
 *
 * Success (POST): 200 { ok: true } (+ Set-Cookie: portal_session on the
 * token-exchange path). Errors: 400 bad feedback body · 401 { ok: false } bad
 * token / missing session · 405 wrong method · 503 not configured
 *
 * Env (server-only): PORTAL_HMAC_SECRET (+ SUPABASE_URL /
 * SUPABASE_SERVICE_ROLE_KEY for the feedback store, migration 0012).
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
import { requireOpsAuth } from '../lib/ops-auth.mjs';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { submitFeedback, listFeedback } from '../lib/portal-feedback.mjs';
import { messageOf } from '../lib/api/handler.js';

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

  // GET ?feedback=1 — the client-feedback inbox, read by /ops (ops session,
  // NOT a portal session: this is Adrian's surface, not a client's).
  if (req.method === 'GET' && req.query?.['feedback'] !== undefined) {
    if (!requireOpsAuth(req)) {
      res.status(401).json({ error: 'Unauthorized.', code: 'UNAUTHENTICATED' });
      return;
    }
    const result = await withFeedbackStore((sb) => listFeedback(sb));
    if ('unavailable' in result) {
      res.status(503).json(result.unavailable);
      return;
    }
    const { data, error } = result.value;
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ items: data ?? [] });
    return;
  }

  // GET — does the caller's existing cookie already authorize this slug?
  if (req.method === 'GET') {
    const slug = slugOf(req.query?.['slug']);
    res.status(200).json({ authorized: Boolean(slug) && requirePortalAuth(req, slug), configured: true });
    return;
  }

  if (req.method === 'POST') {
    const body = req.body as
      | { slug?: unknown; token?: unknown; action?: unknown; message?: unknown; contact?: unknown }
      | undefined;
    const slug = slugOf(body?.slug);

    // POST action:'feedback' — persist a note from an already-authorized
    // portal session (the token exchange below must have happened first).
    if (body?.action === 'feedback') {
      if (!slug || !requirePortalAuth(req, slug)) {
        res.status(401).json({ ok: false });
        return;
      }
      const result = await withFeedbackStore((sb) =>
        submitFeedback(sb, { slug, message: body?.message, contact: body?.contact }),
      );
      if ('unavailable' in result) {
        res.status(503).json(result.unavailable);
        return;
      }
      res.status(result.value.status).json(result.value.body);
      return;
    }

    // POST — exchange a valid link token for a session cookie.
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

/**
 * Acquire the service client for the feedback store, mapping a missing/broken
 * Supabase env to the standard fail-loud 503 (names the vars + the fix) instead
 * of a generic 500 — mirrors withServiceClient, which this raw cookie-setting
 * handler can't compose.
 */
async function withFeedbackStore<T>(
  fn: (sb: Awaited<ReturnType<typeof getServiceClient>>) => T | Promise<T>,
): Promise<{ value: Awaited<T> } | { unavailable: { error: string; code: string } }> {
  try {
    const sb = await getServiceClient();
    return { value: await fn(sb) };
  } catch (err) {
    return {
      unavailable: {
        error:
          `Feedback store unavailable: ${messageOf(err)} — set SUPABASE_URL and ` +
          'SUPABASE_SERVICE_ROLE_KEY in Vercel → Settings → Environment Variables ' +
          '(Production + Preview), apply migration 0012_client_feedback.sql, then redeploy.',
        code: 'ENV_MISSING_SUPABASE',
      },
    };
  }
}
