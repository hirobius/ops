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
 * Error:    { error: string, code?: string } with status 401/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004);
 * `leadsHandler` is the testable domain logic (stub `sb`, no HTTP).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import { listLeads } from '../lib/supabase/leads.mjs';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export async function leadsHandler(sb: SupabaseClient, req: VercelRequest): Promise<HandlerResult> {
  const rawLimit = Array.isArray(req.query['limit']) ? req.query['limit'][0] : req.query['limit'];
  const { data, error } = await listLeads(sb, clampLimit(rawLimit));

  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { leads: data ?? [] } };
}

export default withOpsHandler('GET', withServiceClient(leadsHandler));

function clampLimit(raw: unknown): number {
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}
