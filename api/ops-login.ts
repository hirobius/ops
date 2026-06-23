/**
 * Vercel Serverless Function — POST /api/ops-login
 *
 * Server-side /ops gate. Verifies the submitted password against the server-only
 * OPS_GATE_PASSWORD (constant-time) and, on success, sets an httpOnly signed
 * session cookie. The password never reaches the browser bundle.
 *
 * Request:  { password: string }
 * Success:  200 { ok: true } + Set-Cookie: ops_session
 * Errors:   401 { ok: false } wrong key · 405 wrong method · 503 not configured
 *
 * Env (server-only): OPS_GATE_PASSWORD, OPS_SESSION_SECRET.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  checkPassword,
  opsAuthConfigured,
  signSession,
  setSessionCookie,
  OPS_SESSION_TTL_MS,
} from '../lib/ops-auth.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  if (!opsAuthConfigured()) {
    res.status(503).json({
      error: 'Ops auth is not configured. Set OPS_GATE_PASSWORD and OPS_SESSION_SECRET.',
      code: 'ENV_MISSING_OPS_AUTH',
    });
    return;
  }

  const body = req.body as { password?: unknown } | undefined;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!checkPassword(password)) {
    res.status(401).json({ ok: false, error: 'Invalid key.' });
    return;
  }

  setSessionCookie(res, signSession(Date.now() + OPS_SESSION_TTL_MS));
  res.status(200).json({ ok: true });
}
