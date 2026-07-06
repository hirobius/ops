/**
 * scripts/lib/prospect-to-lead.mjs
 *
 * Pure mapper: a scored Prospect (from outscraper-normalize.mjs) -> a `leads`
 * table row (schema in supabase/migrations/0001+0002+0004). No network, no DB —
 * deterministic and unit-testable (scripts/__tests__/prospect-to-lead.test.mjs).
 *
 * `place_id` is the natural unique key: upserting on it (lib/supabase/leads.mjs
 * `upsertLeads`) makes re-running a niche/metro idempotent. Empty-string values
 * become NULL so the DB stays clean and partial indexes behave.
 */

// A prospect is "qualified" (worth outreach effort) once its need-score clears
// this. Tunable — it just seeds PR#1's boolean so its board renders sensibly.
export const QUALIFIED_LEAD_SCORE = 60;

/** '' / undefined -> null; otherwise the value unchanged. */
function orNull(v) {
  return v === undefined || v === '' ? null : v;
}

/**
 * Map one Prospect to a `leads` row.
 * @param {object} prospect a Prospect from normalizeResponse()
 * @param {string} [runId]  the pipeline run id, for provenance
 * @returns {object} a row shaped for the `leads` table
 */
export function prospectToLeadRow(prospect, runId) {
  const p = prospect ?? {};
  const s = p.signals ?? {};
  const c = p.content ?? {};

  return {
    // ── sourcing (0001) ──
    place_id: orNull(p.placeId),
    name: orNull(p.name),
    category: orNull(p.category),
    phone: orNull(p.phone),
    website: orNull(p.website),
    city: orNull(p.city),
    region: orNull(p.region),
    rating: p.rating ?? null,
    review_count: p.reviews ?? 0,
    has_website: Boolean(s.hasWebsite),
    qualified: (s.leadScore ?? 0) >= QUALIFIED_LEAD_SCORE,
    qualify_reason: orNull(s.sitePresence),
    status: 'sourced',

    // ── richer content (0002) — raw material for the eventual site build ──
    street_address: orNull(p.address),
    postal_code: orNull(c.postalCode),
    country: orNull(c.country),
    latitude: c.latitude ?? null,
    longitude: c.longitude ?? null,
    email: orNull(c.email),
    hours: c.hours ?? null,
    photos: Array.isArray(c.photos) && c.photos.length ? c.photos : null,
    logo_url: orNull(c.logoUrl),
    social: c.social ?? null,
    google_maps_url: orNull(p.mapsUrl),
    business_status: orNull(c.businessStatus),
    description: orNull(c.description),
    types: Array.isArray(c.types) && c.types.length ? c.types : null,

    // ── prospecting score + signals (0004) ──
    lead_score: s.leadScore ?? null,
    build_score: s.buildScore ?? null,
    site_presence: orNull(s.sitePresence),
    has_social_proof: s.hasSocialProof ?? null,
    owner_verified: s.ownerVerified ?? null,
    operational: s.operational ?? null,
    photos_count: p.photosCount ?? 0,
    source_query: orNull(p.sourceQuery),
    run_id: orNull(runId),
    slug: orNull(p.slug),
  };
}

/** Map a whole batch's prospects to rows, dropping any without a place_id
 *  (the upsert key — a null key would insert duplicates on every run). */
export function prospectsToLeadRows(prospects, runId) {
  return (prospects ?? [])
    .map((p) => prospectToLeadRow(p, runId))
    .filter((row) => row.place_id);
}
