/**
 * Vercel Serverless Function — POST /api/publish-site
 *
 * Publishes a previously-built Duda site (this is the step that STARTS per-site
 * billing — call it on conversion, not before). Flips site_status to 'published'
 * and records the live URL + published_at.
 *
 * In dev, the same contract is served by scripts/leads-middleware.mjs.
 *
 * Request:  { leadId: string }
 * Success:  { ok: true, live_url: string }
 * Error:    { error, code? } with status 400/401/404/405/409/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004).
 * The 'publishing' → 'published' / rollback-to-'publish_failed' state machine
 * stays here.
 *
 * Env (human-set, server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   DUDA_API_USER, DUDA_API_PASSWORD (used by the real lib/duda adapter).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, messageOf, type HandlerResult } from '../lib/api/handler';
import { publishSite } from '../lib/duda/index.mjs';

export async function publishSiteHandler(
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
  if (!lead.duda_site_name) {
    return { status: 409, body: { error: 'no site to publish — build the site first', code: 'NO_SITE' } };
  }

  await sb.from('leads').update({ site_status: 'publishing' }).eq('id', leadId);

  try {
    const result = await publishSite(lead.duda_site_name);
    const { error: updateError } = await sb
      .from('leads')
      .update({
        site_status: 'published',
        live_url: result.live_url,
        published_at: new Date().toISOString(),
      })
      .eq('id', leadId);
    if (updateError) return { status: 500, body: { error: updateError.message } };

    return { status: 200, body: { ok: true, live_url: result.live_url } };
  } catch (err) {
    await sb.from('leads').update({ site_status: 'publish_failed' }).eq('id', leadId);
    return { status: 500, body: { error: messageOf(err) } };
  }
}

export default withOpsHandler('POST', withServiceClient(publishSiteHandler));
