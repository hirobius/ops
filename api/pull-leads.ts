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
 * Error:    { error: string, code?: string } with status 400/401/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004),
 * which also turns any thrown error (e.g. from pullLeads) into a uniform 500.
 *
 * Env (set by the human in the Vercel dashboard — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   server-side writes
 *   GOOGLE_PLACES_API_KEY                      used by the real puller (lib/lead-gen)
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import { pullLeads } from '../lib/lead-gen/index.mjs';
import { upsertLeads } from '../lib/supabase/leads.mjs';

const MAX_BODY_BYTES = 16 * 1024; // 16 KB
const MAX_COUNT = 50;

export async function pullLeadsHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { niche?: unknown; metro?: unknown; count?: unknown } | undefined;
  const niche = typeof body?.niche === 'string' ? body.niche.trim() : '';
  const metro = typeof body?.metro === 'string' ? body.metro.trim() : '';
  const count = clampCount(body?.count);

  if (!niche || !metro) return { status: 400, body: { error: 'niche and metro are required' } };
  if (Buffer.byteLength(`${niche}${metro}`, 'utf8') > MAX_BODY_BYTES) {
    return { status: 400, body: { error: 'request body too large' } };
  }

  const leads = await pullLeads({ niche, metro, max: count });
  const rows = leads.map((l) => ({ ...l, status: 'sourced' as const }));
  const { error } = await upsertLeads(sb, rows);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { inserted: rows.length } };
}

export default withOpsHandler('POST', withServiceClient(pullLeadsHandler));

function clampCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return 20;
  return Math.max(1, Math.min(Math.floor(n), MAX_COUNT));
}
