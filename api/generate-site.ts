/**
 * Vercel Serverless Function — POST /api/generate-site
 *
 * v2 per-lead trigger from the /ops Leads board. Runs the enrich→generate→judge
 * agent on a single lead (~30s — fits the serverless timeout) and writes the
 * result back to the `leads` row (config, eval_*, loop_iterations, status).
 *
 * In dev (`pnpm dev`), the same contract is served by the Vite middleware in
 * scripts/leads-middleware.mjs (wired in vite.config.mjs).
 *
 * Request:  { leadId: string }   (the leads.id uuid)
 * Success:  { ok: true, score: number, pass: boolean }
 * Error:    { error: string, code?: string } with status 400/404/405/500/503
 *
 * Env (set by the human — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY                          used by the real agent (lib/agent)
 *
 * NOTE on auth: fronted only by the client-side ops gate today. This endpoint
 * spends Anthropic + Places budget — add real server-side auth before exposing.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOpsAuth } from '../lib/ops-auth.mjs';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { runPipeline } from '../lib/agent/index.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Server-side /ops gate — reject callers without a valid ops session cookie.
  if (!requireOpsAuth(req)) {
    res.status(401).json({ error: 'Unauthorized.', code: 'UNAUTHENTICATED' });
    return;
  }
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

  // Fetch the lead.
  const { data: lead, error: fetchError } = await sb
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (fetchError || !lead) {
    res.status(404).json({ error: 'lead not found' });
    return;
  }

  // Mark in-flight so the board reflects work in progress and double-clicks are visible.
  await sb.from('leads').update({ status: 'generating' }).eq('id', leadId);

  try {
    const result = await runPipeline({
      name: lead.name,
      city: lead.city,
      region: lead.region,
      category: lead.category,
      phone: lead.phone,
      website: lead.website,
    });

    const { error: updateError } = await sb
      .from('leads')
      .update({
        status: 'scored',
        config: result.config,
        eval_score: result.judge.overall,
        eval_pass: result.judge.pass,
        eval_notes: result.judge.notes,
        loop_iterations: result.loop.iterations,
        // enrichment — fill what Places can't supply, without clobbering existing values
        email: lead.email ?? result.enrichment.email,
        logo_url: lead.logo_url ?? result.enrichment.logo_url,
        social: lead.social ?? result.enrichment.social,
        description: lead.description ?? result.enrichment.description,
      })
      .eq('id', leadId);
    if (updateError) {
      res.status(500).json({ error: updateError.message });
      return;
    }

    res.status(200).json({ ok: true, score: result.judge.overall, pass: result.judge.pass });
  } catch (err) {
    // Roll the row back out of 'generating' so it isn't stuck.
    await sb.from('leads').update({ status: 'sourced' }).eq('id', leadId);
    res.status(500).json({ error: messageOf(err) });
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
