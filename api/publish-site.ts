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
 * Error:    { error, code? } with status 400/404/405/409/500/503
 *
 * Env (human-set, server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   DUDA_API_USER, DUDA_API_PASSWORD (used by the real lib/duda adapter).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { publishSite } from '../lib/duda/index.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const body = req.body as { leadId?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) {
    res.status(400).json({ error: 'leadId is required' });
    return;
  }

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    res.status(503).json({ error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return;
  }

  const { data: lead, error: fetchError } = await sb.from('leads').select('*').eq('id', leadId).single();
  if (fetchError || !lead) {
    res.status(404).json({ error: 'lead not found' });
    return;
  }
  if (!lead.duda_site_name) {
    res.status(409).json({ error: 'no site to publish — build the site first', code: 'NO_SITE' });
    return;
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
    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }
    res.status(200).json({ ok: true, live_url: result.live_url });
  } catch (err) {
    await sb.from('leads').update({ site_status: 'publish_failed' }).eq('id', leadId);
    res.status(500).json({ error: messageOf(err) });
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
