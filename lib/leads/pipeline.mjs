/**
 * lib/leads/pipeline.mjs — the per-lead site state machines.
 *
 * Extracted from the api/{generate,build,publish}-site handlers (ADR-0004 seam).
 * Each function owns: fetch lead → set in-flight → run the step → update the row
 * → roll back on ANY failure, and returns a { status, body } the handler relays.
 *
 * Bug fix vs the inlined handlers: previously, if the *result update* itself
 * errored (a returned PostgREST error, not a throw), the row was left stranded in
 * its in-flight state ('generating' / 'building' / 'publishing'). Now every
 * failure path — thrown OR returned — rolls the row to the same failure state the
 * throw path already used. No new status values are introduced.
 *
 * Takes `sb` (injected, per ADR-0004), so each function is testable with a stub
 * client and stubbed agent/duda steps — no HTTP. See tests/api/lead-pipeline.test.ts.
 */
import { runPipeline } from '../agent/index.mjs';
import { buildSite, publishSite } from '../duda/index.mjs';

/**
 * enrich → generate → judge for one lead; writes config + eval_* + status='scored'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function generateLeadSite(sb, leadId) {
  const { data: lead, error: fetchError } = await sb
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };

  // Mark in-flight so the board reflects progress and double-clicks are visible.
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
      // BUGFIX: roll back so a failed result-write doesn't strand the row in 'generating'.
      await sb.from('leads').update({ status: 'sourced' }).eq('id', leadId);
      return { status: 500, body: { error: updateError.message } };
    }

    return { status: 200, body: { ok: true, score: result.judge.overall, pass: result.judge.pass } };
  } catch (err) {
    await sb.from('leads').update({ status: 'sourced' }).eq('id', leadId);
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/**
 * Build an unpublished Duda site for the lead; writes site URLs + site_status='built'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function buildLeadSite(sb, leadId) {
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
    if (updateError) {
      // BUGFIX: roll the row to the failure state instead of leaving it 'building'.
      await sb.from('leads').update({ site_status: 'build_failed' }).eq('id', leadId);
      return { status: 500, body: { error: updateError.message } };
    }

    return { status: 200, body: { ok: true, preview_url: result.preview_url } };
  } catch (err) {
    await sb.from('leads').update({ site_status: 'build_failed' }).eq('id', leadId);
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/**
 * Publish a previously-built Duda site (starts billing); writes live_url + site_status='published'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function publishLeadSite(sb, leadId) {
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
    if (updateError) {
      // BUGFIX: roll the row to the failure state instead of leaving it 'publishing'.
      await sb.from('leads').update({ site_status: 'publish_failed' }).eq('id', leadId);
      return { status: 500, body: { error: updateError.message } };
    }

    return { status: 200, body: { ok: true, live_url: result.live_url } };
  } catch (err) {
    await sb.from('leads').update({ site_status: 'publish_failed' }).eq('id', leadId);
    return { status: 500, body: { error: messageOf(err) } };
  }
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
