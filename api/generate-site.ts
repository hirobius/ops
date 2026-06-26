/**
 * Vercel Serverless Function — POST /api/generate-site
 *
 * v2 per-lead trigger from the /ops Leads board. Runs the enrich→generate→judge
 * agent on a single lead (~30s) and writes the result back to the `leads` row.
 *
 * In dev (`pnpm dev`), the same contract is served by the Vite middleware in
 * scripts/leads-middleware.mjs (wired in vite.config.mjs).
 *
 * Request:  { leadId: string }   (the leads.id uuid)
 * Success:  { ok: true, score: number, pass: boolean }
 * Error:    { error: string, code?: string } with status 400/401/404/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004);
 * the 'generating' → 'scored' / rollback state machine lives in lib/leads/pipeline.
 *
 * Env (set by the human — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY (lib/agent)
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import { generateLeadSite } from '../lib/leads/pipeline.mjs';

export async function generateSiteHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { leadId?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  return generateLeadSite(sb, leadId);
}

export default withOpsHandler('POST', withServiceClient(generateSiteHandler));
