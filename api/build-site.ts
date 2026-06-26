/**
 * Vercel Serverless Function — POST /api/build-site
 *
 * Builds an UNPUBLISHED Duda site for a lead (free preview link before going
 * live; see docs/operations/lead-pipeline-platform-integrations.md). Stores the
 * Duda site name + preview/editor URLs and flips site_status to 'built'.
 *
 * In dev, the same contract is served by scripts/leads-middleware.mjs.
 *
 * Request:  { leadId: string }
 * Success:  { ok: true, preview_url: string }
 * Error:    { error, code? } with status 400/401/404/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004);
 * the 'building' → 'built' / rollback state machine lives in lib/leads/pipeline.
 *
 * Env (human-set, server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   DUDA_API_USER, DUDA_API_PASSWORD (lib/duda).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import { buildLeadSite } from '../lib/leads/pipeline.mjs';

export async function buildSiteHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { leadId?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  return buildLeadSite(sb, leadId);
}

export default withOpsHandler('POST', withServiceClient(buildSiteHandler));
