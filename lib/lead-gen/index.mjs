/**
 * lib/lead-gen — lead sourcing.
 *
 * Sources outreach-ready business records via **Outscraper** (managed Google
 * Maps scraper + email/contact enrichment, pay-as-you-go). Replaces the retired
 * self-built Google Places puller (2026-06-30 engine decision — see
 * docs/ARCHITECTURE.md + docs/operations/ops-astro-cutover-plan.md).
 *
 * The provider call is isolated in `sourceViaOutscraper()` so it can be swapped
 * for another managed scraper (e.g. an Apify Google-Maps actor) without touching
 * callers — only `mapPlace()` and the one fetch would change.
 *
 * CONTRACT — do NOT change without updating callers:
 *   pullLeads({ niche, metro, max }) → Promise<SourcedLead[]>
 *   api/pull-leads.ts adds `status:'sourced'` and upserts on `place_id`
 *   (idempotent); the `leads` table columns mirror SourcedLead.
 *
 * LIVE vs MOCK: live when OUTSCRAPER_API_KEY is set; otherwise returns
 * deterministic mock rows so `pnpm dev` + the board stay exercisable without a
 * key. Adrian sets the key in Vercel / .env — Claude never touches .env.
 *
 * ⚠️ VERIFY before trusting LIVE output (cannot be tested here without a key):
 *   - the exact REST param that enables email/contact enrichment
 *     (`enrichment=...`) and the enriched email field name (`email_1` / `emails`);
 *   - large `limit` runs may go async (return a results URL) instead of inline;
 *   - native `fetch` honours no proxy by default — fine on Vercel, may need
 *     attention behind an egress proxy.
 *   Base Google-Maps field names below are from the Outscraper SDK and are all
 *   mapped in `mapPlace()`, so a field rename is a one-function fix.
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
 *   --- richer fields for the render step ---
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
 * @property {string[]}      types          full category list
 * @property {string|null}   service_area   "area served"
 */

const MAX_RESULTS_CAP = 60;
const OUTSCRAPER_BASE = 'https://api.outscraper.com';
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Source leads for a niche + metro.
 * @param {PullLeadsInput} input
 * @returns {Promise<SourcedLead[]>}
 */
export async function pullLeads({ niche, metro, max = 20 }) {
  const count = Math.max(1, Math.min(Number(max) || 20, MAX_RESULTS_CAP));
  const { city, region } = splitMetro(metro);
  const apiKey = process.env.OUTSCRAPER_API_KEY;

  // No key → mock mode (keeps dev + the board working end-to-end without a key).
  if (!apiKey) {
    console.warn('[lead-gen] OUTSCRAPER_API_KEY not set — returning mock leads (dev mode).');
    return mockLeads({ niche, metro, city, region, count });
  }

  const query = `${niche} in ${metro}`;
  const places = await sourceViaOutscraper(query, { limit: count, apiKey });
  const mapped = places.map((p) => mapPlace(p, { niche, city, region, metro }));
  return dedupeByPlaceId(mapped).slice(0, count);
}

/**
 * Provider seam — the only Outscraper-specific code. Swap this (and `mapPlace`)
 * to change scrapers. Returns the raw place objects for one query.
 * @returns {Promise<any[]>}
 */
async function sourceViaOutscraper(query, { limit, apiKey }) {
  const url = new URL('/maps/search-v3', OUTSCRAPER_BASE);
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('async', 'false');
  url.searchParams.set('enrichment', 'domains_service'); // ⚠️ VERIFY: enables email/contact fields

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'X-API-KEY': apiKey }, signal: ctrl.signal });
    if (!res.ok) {
      const detail = await res.text().catch(() => res.statusText);
      throw new Error(`Outscraper ${res.status}: ${detail}`);
    }
    const json = await res.json();
    // search-v3 returns { data: [ [ ...places ] ] } — one inner array per query.
    const data = json && json.data;
    if (Array.isArray(data) && Array.isArray(data[0])) return data[0];
    if (Array.isArray(data)) return data;
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Map one Outscraper Google-Maps place → SourcedLead. Isolated so a provider/
 * field change is a one-function edit.
 * @returns {SourcedLead}
 */
function mapPlace(p, { niche, city, region, metro }) {
  const website = p.site || null;
  const place_id =
    p.place_id || p.google_id || `outscraper-${slug(p.name || niche)}-${slug(p.full_address || metro)}`;
  // ⚠️ VERIFY enriched email field name against Outscraper docs.
  const email = p.email_1 || (Array.isArray(p.emails) ? p.emails[0] : null) || null;

  return {
    place_id,
    name: p.name || `${titleCase(niche)} (unnamed)`,
    category: p.category || p.type || titleCase(niche),
    phone: p.phone || null,
    website,
    city: p.city || city,
    region: p.state || region,
    rating: numOrNull(p.rating),
    review_count: numOrNull(p.reviews),
    has_website: !!website,
    qualified: !website, // no website → qualified lead (needs one built)
    qualify_reason: website ? 'has existing website' : 'no website detected',
    street_address: p.street || p.full_address || null,
    postal_code: p.postal_code || null,
    country: p.country_code || null,
    latitude: numOrNull(p.latitude),
    longitude: numOrNull(p.longitude),
    email,
    hours: p.working_hours || null,
    photos: [], // search returns photos_count, not URLs — photo URLs need a details/photos pass
    logo_url: null,
    social: null, // populated by enrichment when available — VERIFY shape
    google_maps_url: place_id
      ? `https://www.google.com/maps/place/?q=place_id:${place_id}`
      : null,
    price_level: null, // Outscraper exposes a price "range" string, not a 0–4 level
    business_status: p.business_status || null,
    description: typeof p.about === 'string' ? p.about : p.description || null,
    types: Array.isArray(p.subtypes) ? p.subtypes : p.type ? [p.type] : [],
    service_area: [p.city || city, p.state || region].filter(Boolean).join(', ') || metro,
  };
}

// ── helpers ───────────────────────────────────────────────────────────────────

function dedupeByPlaceId(leads) {
  const seen = new Set();
  const out = [];
  for (const l of leads) {
    if (!l.place_id || seen.has(l.place_id)) continue;
    seen.add(l.place_id);
    out.push(l);
  }
  return out;
}

/** Parse "City, REGION" → { city, region }. */
function splitMetro(metro) {
  const [cityRaw, regionRaw] = String(metro)
    .split(',')
    .map((p) => p.trim());
  return { city: cityRaw || null, region: regionRaw || null };
}

function numOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** @param {string} s */
function slug(s) {
  return String(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** @param {string} s */
function titleCase(s) {
  return String(s).replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Deterministic mock rows — used only when OUTSCRAPER_API_KEY is unset, so the
 * board + pipeline stay exercisable in dev. Same shape + idempotent place_ids as
 * the live path.
 * @returns {SourcedLead[]}
 */
function mockLeads({ niche, metro, city, region, count }) {
  const nicheSlug = slug(niche) || 'business';
  const metroSlug = slug(metro) || 'metro';
  /** @type {SourcedLead[]} */
  const leads = [];
  for (let i = 0; i < count; i++) {
    const place_id = `stub-${nicheSlug}-${metroSlug}-${i + 1}`;
    const hasWebsite = i % 3 !== 0; // ~1/3 have no site → prime acquisition targets
    leads.push({
      place_id,
      name: `${titleCase(niche)} #${i + 1} of ${city || metro}`,
      category: titleCase(niche),
      phone: `+1-555-${String(1000 + i).slice(-4)}`,
      website: hasWebsite ? `https://example-${nicheSlug}-${i + 1}.com` : null,
      city,
      region,
      rating: Number((3.6 + ((i * 7) % 14) / 10).toFixed(1)),
      review_count: 5 + ((i * 17) % 240),
      has_website: hasWebsite,
      qualified: !hasWebsite,
      qualify_reason: hasWebsite ? 'has existing website' : 'no website detected',
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
      description: `${titleCase(niche)} serving ${city || metro}.`,
      types: [nicheSlug, 'point_of_interest', 'establishment'],
      service_area: [city, region].filter(Boolean).join(', ') || metro,
    });
  }
  return leads;
}
