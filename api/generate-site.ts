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
 * Error:    { error: string, code?: string } with status 400/401/404/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004).
 * The 'generating' → 'scored' / rollback-to-'sourced' state machine stays here;
 * the inner try/catch performs the rollback and returns { status: 500, … }
 * explicitly (the wrapper's 500 backstop only catches anything unexpected).
 *
 * Env (set by the human — never in .env by an agent):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   ANTHROPIC_API_KEY                          used by the real agent (lib/agent)
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, messageOf, type HandlerResult } from '../lib/api/handler';
import { runPipeline } from '../lib/agent/index.mjs';

export async function generateSiteHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { leadId?: unknown } | undefined;
  const leadId = typeof body?.leadId === 'string' ? body.leadId.trim() : '';
  if (!leadId) return { status: 400, body: { error: 'leadId is required' } };

  // Fetch the lead.
  const { data: lead, error: fetchError } = await sb
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };

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
    if (updateError) return { status: 500, body: { error: updateError.message } };

    return { status: 200, body: { ok: true, score: result.judge.overall, pass: result.judge.pass } };
  } catch (err) {
    // Roll the row back out of 'generating' so it isn't stuck.
    await sb.from('leads').update({ status: 'sourced' }).eq('id', leadId);
    return { status: 500, body: { error: messageOf(err) } };
  }
}

export default withOpsHandler('POST', withServiceClient(generateSiteHandler));
