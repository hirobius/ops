/**
 * lib/leads/pipeline.mjs — the per-lead site state machines.
 *
 * Extracted from the api/{generate,build,publish}-site handlers (ADR-0004 seam)
 * and reused by the dev middleware (scripts/leads-middleware.mjs), so dev and prod
 * genuinely share one implementation. Each function owns: fetch lead → set
 * in-flight → run the step → update the row → roll back on ANY failure, and
 * returns a { status, body } the caller relays.
 *
 * Bug fix vs the inlined versions: if the *result update* itself errored (a
 * returned PostgREST error, not a throw), the row was left stranded in its
 * in-flight state ('generating' / 'building' / 'publishing'). Every failure path
 * — thrown OR returned — now rolls the row to the same failure state the throw
 * path already used. No new status values are introduced.
 *
 * Reads/writes the `leads` table through the repository (lib/supabase/leads), so
 * each function is testable with a stub client and stubbed agent/duda steps.
 */
import { getLead, updateLead } from '../supabase/leads.mjs';
import { runPipeline } from '../agent/index.mjs';
import { renderArtifacts } from '../render/index.mjs';
import { buildSite, publishSite } from '../duda/index.mjs';

/**
 * enrich → generate → judge for one lead; writes config + eval_* + status='scored'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function generateLeadSite(sb, leadId) {
  const { data: lead, error: fetchError } = await getLead(sb, leadId);
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };

  // Mark in-flight so the board reflects progress and double-clicks are visible.
  await updateLead(sb, leadId, { status: 'generating' });

  try {
    const result = await runPipeline({
      name: lead.name,
      category: lead.category ?? undefined, // let LeadSchema's default apply if null
      city: lead.city,
      region: lead.region,
      phone: lead.phone ?? undefined,
      email: lead.email ?? undefined,
      website: lead.website ?? undefined,
      rating: lead.rating ?? undefined,
      reviewCount: lead.review_count ?? undefined,
      notes: lead.description ?? undefined,
    });

    const { error: updateError } = await updateLead(sb, leadId, {
      status: 'scored',
      config: result.config,
      // judge.overall is the engine's 1–5 score; persist on the board's 0–100 scale.
      eval_score: Math.round(result.judge.overall * 20),
      eval_pass: result.judge.pass,
      eval_notes: result.judge.notes,
      loop_iterations: result.loop.iterations,
      // Contact fields (email/logo_url/social/description) are filled at sourcing
      // by Outscraper; the pipeline's enrich is now the marketing brief only.
    });
    if (updateError) {
      // BUGFIX: roll back so a failed result-write doesn't strand the row in 'generating'.
      await updateLead(sb, leadId, { status: 'sourced' });
      return { status: 500, body: { error: updateError.message } };
    }

    return { status: 200, body: { ok: true, score: result.judge.overall, pass: result.judge.pass } };
  } catch (err) {
    await updateLead(sb, leadId, { status: 'sourced' });
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/**
 * Astro render hand-off (cutover Part B). Emits the client.config.ts + deploy
 * commands for a scored lead via lib/render; when the human (or, later, the
 * deploy worker) reports the preview deploy back with `previewUrl`, flips the
 * lifecycle to status='rendered' + preview_url. Read-only until then — no
 * in-flight state needed because nothing long-running happens here.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} leadId
 * @param {{ previewUrl?: string }} [opts]
 */
export async function renderLeadSite(sb, leadId, { previewUrl } = {}) {
  const { data: lead, error: fetchError } = await getLead(sb, leadId);
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };
  if (!lead.config) {
    return { status: 409, body: { error: 'no generated config — run Generate first', code: 'NO_CONFIG' } };
  }

  let artifacts;
  try {
    artifacts = renderArtifacts(lead.config);
  } catch (err) {
    // Config drifted since generation — surface the zod issues, change nothing.
    return { status: 422, body: { error: messageOf(err), code: 'CONFIG_INVALID' } };
  }

  if (previewUrl) {
    const { error: updateError } = await updateLead(sb, leadId, {
      status: 'rendered',
      preview_url: previewUrl,
    });
    if (updateError) return { status: 500, body: { error: updateError.message } };
  }

  return { status: 200, body: { ok: true, rendered: Boolean(previewUrl), ...artifacts } };
}

/**
 * Build an unpublished Duda site for the lead; writes site URLs + site_status='built'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function buildLeadSite(sb, leadId) {
  const { data: lead, error: fetchError } = await getLead(sb, leadId);
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };

  await updateLead(sb, leadId, { site_status: 'building' });

  try {
    const result = await buildSite(lead);
    const { error: updateError } = await updateLead(sb, leadId, {
      duda_site_name: result.duda_site_name,
      preview_url: result.preview_url,
      editor_url: result.editor_url,
      site_status: 'built',
    });
    if (updateError) {
      // BUGFIX: roll the row to the failure state instead of leaving it 'building'.
      await updateLead(sb, leadId, { site_status: 'build_failed' });
      return { status: 500, body: { error: updateError.message } };
    }

    return { status: 200, body: { ok: true, preview_url: result.preview_url } };
  } catch (err) {
    await updateLead(sb, leadId, { site_status: 'build_failed' });
    return { status: 500, body: { error: messageOf(err) } };
  }
}

/**
 * Publish a previously-built Duda site (starts billing); writes live_url + site_status='published'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function publishLeadSite(sb, leadId) {
  const { data: lead, error: fetchError } = await getLead(sb, leadId);
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };
  if (!lead.duda_site_name) {
    return { status: 409, body: { error: 'no site to publish — build the site first', code: 'NO_SITE' } };
  }

  await updateLead(sb, leadId, { site_status: 'publishing' });

  try {
    const result = await publishSite(lead.duda_site_name);
    const { error: updateError } = await updateLead(sb, leadId, {
      site_status: 'published',
      live_url: result.live_url,
      published_at: new Date().toISOString(),
    });
    if (updateError) {
      // BUGFIX: roll the row to the failure state instead of leaving it 'publishing'.
      await updateLead(sb, leadId, { site_status: 'publish_failed' });
      return { status: 500, body: { error: updateError.message } };
    }

    return { status: 200, body: { ok: true, live_url: result.live_url } };
  } catch (err) {
    await updateLead(sb, leadId, { site_status: 'publish_failed' });
    return { status: 500, body: { error: messageOf(err) } };
  }
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
