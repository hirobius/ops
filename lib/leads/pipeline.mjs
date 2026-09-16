/**
 * lib/leads/pipeline.mjs — the per-lead site state machines.
 *
 * Extracted from the api/generate-site handler (ADR-0004 seam) and reused by
 * the dev middleware (scripts/leads-middleware.mjs), so dev and prod
 * genuinely share one implementation. Each function owns: fetch lead → set
 * in-flight → run the step → update the row → roll back on ANY failure, and
 * returns a { status, body } the caller relays.
 *
 * Bug fix vs the inlined version: if the *result update* itself errored (a
 * returned PostgREST error, not a throw), the row was left stranded in its
 * in-flight state ('generating'). Every failure path — thrown OR returned —
 * now rolls the row to the same failure state the throw path already used.
 * No new status values are introduced.
 *
 * Reads/writes the `leads` table through the repository (lib/supabase/leads), so
 * each function is testable with a stub client and stubbed agent steps.
 */
import { getLead, updateLead } from '../supabase/leads.mjs';
import { runPipeline } from '../agent/index.mjs';
import { renderArtifacts } from '../render/index.mjs';
import { searchStockPhotos, tradeQuery, MissingPexelsKeyError } from '../photos/pexels.mjs';

/**
 * enrich → generate → judge for one lead; writes config + eval_* + status='scored'.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
/**
 * Stock imagery for a lead that has none (ops#196).
 *
 * Business photos always win, so this only runs when the lead has none at all.
 * Never fails the generation: imagery is a nice-to-have, and a preview with
 * placeholder TODOs is strictly better than no preview. A missing key returns an
 * actionable note instead of an error, because that is a setup gap rather than a
 * failure of this lead.
 *
 * @param {{ photos?: unknown[], category?: string|null, config?: object }} lead
 * @param {string|null|undefined} preset the palette preset, when already known
 * @returns {Promise<{ photos: object[], note: string|null }>}
 */
async function stockPhotosFor(lead, preset) {
  if (Array.isArray(lead.photos) && lead.photos.length > 0) return { photos: [], note: null };

  try {
    // 1 hero + 4 gallery.
    const photos = await searchStockPhotos({
      query: tradeQuery(preset, lead.category),
      count: 5,
    });
    return { photos, note: null };
  } catch (err) {
    if (err instanceof MissingPexelsKeyError) return { photos: [], note: err.message };
    // Any other failure (rate limit, 5xx, network) degrades silently to
    // placeholder behaviour — it is not this lead's problem and not worth
    // failing a generation over.
    return { photos: [], note: err instanceof Error ? err.message : String(err) };
  }
}

export async function generateLeadSite(sb, leadId) {
  const { data: lead, error: fetchError } = await getLead(sb, leadId);
  if (fetchError || !lead) return { status: 404, body: { error: 'lead not found' } };

  // Mark in-flight so the board reflects progress and double-clicks are visible.
  await updateLead(sb, leadId, { status: 'generating' });

  const stock = await stockPhotosFor(lead, lead.config?.brand?.palettePreset ?? null);
  const photos = stock.photos.length ? stock.photos : lead.photos;

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
      hours: lead.hours ?? undefined,
      streetAddress: lead.street_address ?? undefined,
      photos: Array.isArray(photos) ? photos : undefined,
      logoUrl: lead.logo_url ?? undefined,
    });

    const { error: updateError } = await updateLead(sb, leadId, {
      status: 'scored',
      config: result.config,
      // judge.overall is the engine's 1–5 score; persist on the board's 0–100 scale.
      eval_score: Math.round(result.judge.overall * 20),
      eval_pass: result.judge.pass,
      eval_notes: result.judge.notes,
      loop_iterations: result.loop.iterations,
      // Persist the stock manifest (provenance objects) so the render hand-off
      // can emit a download block for exactly what the config references.
      ...(stock.photos.length ? { photos: stock.photos } : {}),
      // Contact fields (email/logo_url/social/description) are filled at sourcing
      // by Outscraper; the pipeline's enrich is now the marketing brief only.
    });
    if (updateError) {
      // BUGFIX: roll back so a failed result-write doesn't strand the row in 'generating'.
      await updateLead(sb, leadId, { status: 'sourced' });
      return { status: 500, body: { error: updateError.message } };
    }

    return {
      status: 200,
      body: {
        ok: true,
        score: result.judge.overall,
        pass: result.judge.pass,
        // Surfaced, not swallowed: a missing/expired PEXELS_API_KEY means every
        // preview ships without imagery, and the board is where that gets noticed.
        ...(stock.note ? { photosNote: stock.note } : {}),
      },
    };
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
    return {
      status: 409,
      body: { error: 'no generated config — run Generate first', code: 'NO_CONFIG' },
    };
  }

  let artifacts;
  try {
    artifacts = renderArtifacts(lead.config, {
      photos: Array.isArray(lead.photos) ? lead.photos : [],
    });
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

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
