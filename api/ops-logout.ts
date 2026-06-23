/**
 * Vercel Serverless Function — POST /api/ops-logout
 *
 * Clears the /ops session cookie.
 *
 * Success: 200 { ok: true } + Set-Cookie clearing ops_session
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearSessionCookie } from '../lib/ops-auth.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }
  clearSessionCookie(res);
  res.status(200).json({ ok: true });
}
