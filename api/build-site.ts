/**
 * Vercel Serverless Function — POST /api/build-site
 *
 * Builds an UNPUBLISHED Duda site for a lead and injects its content, so the
 * preview link can be sent to the prospect before anything goes live (unpublished
 * sites are free; see docs/operations/lead-pipeline-platform-integrations.md).
 * Stores the Duda site name + preview/editor URLs on the lead and flips
 * site_status to 'built'.
 *
 * In dev, the same contract is served by scripts/leads-middleware.mjs.
 *
 * Request:  { leadId: string }
 * Success:  { ok: true, preview_url: string }
 * Error:    { error, code? } with status 400/401/404/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004).
 * The 'building' → 'built' / rollback-to-'build_failed' state machine stays here.
 *
 * Env (human-set, server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   DUDA_API_USER, DUDA_API_PASSWORD (used by the real lib/duda adapter).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, messageOf, type HandlerResult } from '../lib/api/handler';
import { buildSite } from '../lib/duda/index.mjs';

export async function buildSiteHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { leadId?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  const { data: lead, error: fetchError } = await sb
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };

  await sb.from('leads').update({ site_status: 'building' }).eq('id', leadId);

  try {
    const result = await buildSite(lead);
    const { error: updateError } = await sb
      .from('leads')
      .update({
        duda_site_name: result.duda_site_name,
        preview_url: result.preview_url,
        editor_url: result.editor_url,
        site_status: 'built',
      })
      .eq('id', leadId);
    if (updateError) return { status: 500, body: { error: updateError.message } };

    return { status: 200, body: { ok: true, preview_url: result.preview_url } };
  } catch (err) {
    await sb.from('leads').update({ site_status: 'build_failed' }).eq('id', leadId);
    return { status: 500, body: { error: messageOf(err) } };
  }
}

export default withOpsHandler('POST', withServiceClient(buildSiteHandler));
