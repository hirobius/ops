/**
 * Vercel Serverless Function — POST /api/publish-site
 *
 * Publishes a previously-built Duda site (this is the step that STARTS per-site
 * billing — call it on conversion). Flips site_status to 'published' and records
 * the live URL + published_at.
 *
 * In dev, the same contract is served by scripts/leads-middleware.mjs.
 *
 * Request:  { leadId: string }
 * Success:  { ok: true, live_url: string }
 * Error:    { error, code? } with status 400/401/404/405/409/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004);
 * the 'publishing' → 'published' / rollback state machine (and the NO_SITE
 * precondition) lives in lib/leads/pipeline.
 *
 * Env (human-set, server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   DUDA_API_USER, DUDA_API_PASSWORD (lib/duda).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import { publishLeadSite } from '../lib/leads/pipeline.mjs';

export async function publishSiteHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { leadId?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  return publishLeadSite(sb, leadId);
}

export default withOpsHandler('POST', withServiceClient(publishSiteHandler));
