/**
 * Vercel Serverless Function — GET /api/ops-me
 *
 * Returns whether the caller holds a valid /ops session cookie. The OpsGate
 * client calls this on mount to decide between rendering /ops and the lock screen.
 * Never reveals the password or secret.
 *
 * Success: 200 { authed: boolean, configured: boolean }
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOpsAuth, opsAuthConfigured } from '../lib/ops-auth.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.status(200).json({ authed: requireOpsAuth(req), configured: opsAuthConfigured() });
}
