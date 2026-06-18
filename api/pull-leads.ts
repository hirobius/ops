/**
 * Vercel Serverless Function — POST /api/pull-leads
 *
 * v1 trigger from the /ops Leads board. Runs Places sourcing for one
 * niche + metro (single page, ~20 results — fits the serverless timeout) and
 * upserts the results into the Supabase `leads` table with status='sourced'.
 * Idempotent: upsert on `place_id`, so re-running a sweep updates instead of
 * duplicating.
 *
 * In dev (`pnpm dev`), the same contract is served by the Vite middleware in
 * scripts/leads-middleware.mjs (wired in vite.config.mjs).
 *
 * Request:  { niche: string, metro: string, count?: number }
 * Success:  { inserted: number }
 * Error:    { error: string, code?: string } with status 400/405/500/503
 *
 * Env (set by the human in the Vercel dashboard — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   server-side writes
 *   GOOGLE_PLACES_API_KEY                      used by the real puller (lib/lead-gen)
 *
 * NOTE on auth: this endpoint is currently fronted only by the client-side ops
 * gate (VITE_OPS_GATE_HASH). Because it spends money (Places quota), add real
 * server-side auth (session check or signed header) before exposing it widely.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { pullLeads } from '../lib/lead-gen/index.mjs';

const MAX_BODY_BYTES = 16 * 1024; // 16 KB
const MAX_COUNT = 50;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const body = req.body as { niche?: unknown; metro?: unknown; count?: unknown } | undefined;
  const niche = typeof body?.niche === 'string' ? body.niche.trim() : '';
  const metro = typeof body?.metro === 'string' ? body.metro.trim() : '';
  const count = clampCount(body?.count);

  if (!niche || !metro) {
    res.status(400).json({ error: 'niche and metro are required' });
    return;
  }
  if (Buffer.byteLength(`${niche}${metro}`, 'utf8') > MAX_BODY_BYTES) {
    res.status(400).json({ error: 'request body too large' });
    return;
  }

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    res.status(503).json({ error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return;
  }

  try {
    const leads = await pullLeads({ niche, metro, max: count });
    const rows = leads.map((l) => ({ ...l, status: 'sourced' as const }));
    const { error } = await sb.from('leads').upsert(rows, { onConflict: 'place_id' });
    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }
    res.status(200).json({ inserted: rows.length });
  } catch (err) {
    res.status(500).json({ error: messageOf(err) });
  }
}

function clampCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(Math.floor(n), MAX_COUNT));
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
