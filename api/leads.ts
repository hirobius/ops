/**
 * Vercel Serverless Function — GET /api/leads
 *
 * Read side for the /ops Leads board. Returns the most recent leads (newest
 * first) from Supabase via the service-role client, so the board can poll for
 * live status without exposing any Supabase key to the browser.
 *
 * In dev (`pnpm dev`), the same contract is served by the Vite middleware in
 * scripts/leads-middleware.mjs (wired in vite.config.mjs).
 *
 * Query:    ?limit=<n>   (optional, default 200, max 500)
 * Success:  { leads: Lead[] }
 * Error:    { error: string, code?: string } with status 405/500/503
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOpsAuth } from '../lib/ops-auth.mjs';
import { getServiceClient } from '../lib/supabase/server.mjs';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Server-side /ops gate — reject callers without a valid ops session cookie.
  if (!requireOpsAuth(req)) {
    res.status(401).json({ error: 'Unauthorized.', code: 'UNAUTHENTICATED' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
  const limit = clampLimit(rawLimit);

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    res.status(503).json({ error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return;
  }

  const { data, error } = await sb
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(200).json({ leads: data ?? [] });
}

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
