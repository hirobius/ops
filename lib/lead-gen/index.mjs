/**
 * lib/lead-gen — Places "lead puller" (sourcing).
 *
 * ⚠️ STUB IMPLEMENTATION. The real logic is ported from hirobius/clients
 * (`scripts/lead-gen/*`: config.ts, places.ts, qualify.ts, pull-leads.ts —
 * Google Places API sourcing + website/tech detection + qualification). That
 * source is not reachable from this session, so `pullLeads()` currently returns
 * deterministic mock rows. This lets the full pipeline — button → /api/pull-leads
 * → Supabase upsert → board — be exercised end to end.
 *
 * TO GO LIVE: replace the body of `pullLeads()` with the ported sourcing logic
 * (Google Places Text Search, one page ~20 results, 20s request timeout — the
 * puller intentionally avoids pagination, which stalls behind some egress
 * proxies). Keep the signature and the returned object shape stable; the route
 * and table schema depend on them. Reads GOOGLE_PLACES_API_KEY from env.
 *
 * @typedef {Object} PullLeadsInput
 * @property {string} niche   e.g. "roofers"
 * @property {string} metro   e.g. "Austin, TX"
 * @property {number} [max]   max results to source (default 20)
 *
 * @typedef {Object} SourcedLead   one row per business — sourcing columns only;
 *   the route adds `status: 'sourced'` before upserting to the `leads` table.
 * @property {string}        place_id        natural unique key (idempotent upserts)
 * @property {string}        name
 * @property {string|null}   category
 * @property {string|null}   phone
 * @property {string|null}   website
 * @property {string|null}   city
 * @property {string|null}   region
 * @property {number|null}   rating
 * @property {number|null}   review_count
 * @property {boolean}       has_website
 * @property {boolean}       qualified
 * @property {string|null}   qualify_reason
 *   --- richer fields for Duda build (map from Places Place Details) ---
 * @property {string|null}   street_address
 * @property {string|null}   postal_code
 * @property {string|null}   country
 * @property {number|null}   latitude
 * @property {number|null}   longitude
 * @property {string|null}   email
 * @property {object|null}   hours          opening hours (structured)
 * @property {string[]}      photos         image URLs
 * @property {string|null}   logo_url
 * @property {object|null}   social         { platform: url }
 * @property {string|null}   google_maps_url
 * @property {number|null}   price_level
 * @property {string|null}   business_status
 * @property {string|null}   description    editorial summary / about
 * @property {string[]}      types          full Places category list
 * @property {string|null}   service_area   Duda "area served"
 */

const MAX_RESULTS_CAP = 60;

/** @param {string} s */
function slug(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Source leads for a niche + metro.
 * @param {PullLeadsInput} input
 * @returns {Promise<SourcedLead[]>}
 */
export async function pullLeads({ niche, metro, max = 20 }) {
  const count = Math.max(1, Math.min(Number(max) || 20, MAX_RESULTS_CAP));
  const nicheSlug = slug(niche) || 'business';
  const metroSlug = slug(metro) || 'metro';

  // Parse "City, REGION" if present.
  const [cityRaw, regionRaw] = String(metro).split(',').map((p) => p.trim());
  const city = cityRaw || null;
  const region = regionRaw || null;

  /** @type {SourcedLead[]} */
  const leads = [];
  for (let i = 0; i < count; i++) {
    // Deterministic place_id → re-running the same sweep upserts, never duplicates.
    const place_id = `stub-${nicheSlug}-${metroSlug}-${i + 1}`;
    const hasWebsite = i % 3 !== 0; // ~1/3 have no site → prime acquisition targets
    const reviewCount = 5 + ((i * 17) % 240);
    const rating = Number((3.6 + ((i * 7) % 14) / 10).toFixed(1));
    leads.push({
      place_id,
      name: `${titleCase(niche)} #${i + 1} of ${cityRaw || metro}`,
      category: titleCase(niche),
      phone: `+1-555-${String(1000 + i).slice(-4)}`,
      website: hasWebsite ? `https://example-${nicheSlug}-${i + 1}.com` : null,
      city,
      region,
      rating,
      review_count: reviewCount,
      has_website: hasWebsite,
      qualified: !hasWebsite, // no website → qualified lead (needs one built)
      qualify_reason: hasWebsite ? 'has existing website' : 'no website detected',
      // richer fields (real puller maps these from Places Place Details)
      street_address: `${100 + i} Main St`,
      postal_code: String(70000 + ((i * 137) % 20000)),
      country: 'US',
      latitude: Number((30 + ((i * 7) % 100) / 100).toFixed(4)),
      longitude: Number((-97 - ((i * 11) % 100) / 100).toFixed(4)),
      email: hasWebsite ? `info@example-${nicheSlug}-${i + 1}.com` : null,
      hours: { mon_fri: '9:00–17:00', sat: '10:00–14:00', sun: 'Closed' },
      photos: [],
      logo_url: null,
      social: null,
      google_maps_url: `https://www.google.com/maps/place/?q=place_id:${place_id}`,
      price_level: i % 4,
      business_status: 'OPERATIONAL',
      description: `${titleCase(niche)} serving ${cityRaw || metro}.`,
      types: [nicheSlug, 'point_of_interest', 'establishment'],
      service_area: [cityRaw, regionRaw].filter(Boolean).join(', ') || metro,
    });
  }
  return leads;
}

/** @param {string} s */
function titleCase(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}
