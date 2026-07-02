/**
 * Vercel Serverless Function — POST /api/render-site
 *
 * Astro-cutover render hand-off (docs/operations/ops-astro-cutover-plan.md,
 * Part B). For a lead with a generated config, returns the drop-in
 * `client.config.ts` source + the scaffold/deploy commands for the clients-repo
 * Astro factory. Pass `previewUrl` once the preview deploy is live to flip the
 * lifecycle to status='rendered' (the future deploy worker calls the same
 * contract; automation = executing the commands instead of displaying them).
 *
 * Request:  { leadId: string, previewUrl?: string }
 * Success:  { ok: true, rendered: boolean, slug, preset, configFile, commands }
 * Error:    { error, code? } with status 400/401/404/405/409/422/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004);
 * the state transition lives in lib/leads/pipeline (renderLeadSite).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler';
import { renderLeadSite } from '../lib/leads/pipeline.mjs';

export async function renderSiteHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { leadId?: unknown; previewUrl?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  const previewUrl = typeof body?.previewUrl === 'string' ? body.previewUrl.trim() : '';
  if (previewUrl && !/^https?:\/\//.test(previewUrl)) {
    return { status: 400, body: { error: 'previewUrl must be an http(s) URL' } };
  }

  return renderLeadSite(sb, leadId, previewUrl ? { previewUrl } : {});
}

export default withOpsHandler('POST', withServiceClient(renderSiteHandler));
