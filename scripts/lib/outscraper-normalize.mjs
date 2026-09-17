/**
 * scripts/lib/outscraper-normalize.mjs
 *
 * Pure, deterministic normalizer + lead scoring for the Outscraper prospecting
 * pipeline. No network, no LLM, no filesystem — a given raw place always yields
 * the same Prospect, which is what makes scoring reproducible and unit-testable
 * (see scripts/__tests__/outscraper-normalize.test.mjs).
 *
 * Raw OutscraperPlace  ->  normalizePlace()  ->  Prospect (typed in
 * src/app/pages/ops/prospectTypes.ts). normalizeResponse() runs the whole
 * array: normalize -> dedupe by place id -> sort by leadScore desc.
 *
 * SCORING THESIS: the best mock-site target is a REAL, reachable business with
 * a WEAK or ABSENT web presence. So a listing with no site, real reviews, an
 * operating status, and a claimed (contactable) owner scores highest; a business
 * that already runs a custom-domain site is the hardest sell and scores low.
 */

// Hosts that indicate a business has NO real site of its own — only a social /
// link-in-bio / auto-generated presence. These are prime targets.
export const SOCIAL_HOSTS = [
  'facebook.com',
  'fb.com',
  'instagram.com',
  'linktr.ee',
  'linktree.com',
  'business.site', // Google's auto-generated "website"
  'g.page',
  'yelp.com',
  'nextdoor.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
];

// DIY site-builder hosts — the business has *something*, but it's templated and
// usually a soft sell for a better spec site.
export const BUILDER_HOSTS = [
  'wixsite.com',
  'wix.com',
  'squarespace.com',
  'godaddysites.com',
  'godaddy.com',
  'weebly.com',
  'myshopify.com',
  'shopify.com',
  'wordpress.com',
  'blogspot.com',
  'webnode.com',
  'jimdo.com',
  'square.site',
];

// Scoring weights. For an OPERATING business the levers sum to a 0–100 ceiling:
// presence-opportunity (45) + social-proof (30) + operational (15) + owner-verified (10).
//
// PRESENCE_OPPORTUNITY answers "how good a prospect does their current web
// presence make them?" — which is NOT the same question as "how bad is their
// web presence?", and the difference is the whole point of the 2026-09-15
// reweight.
//
// The original weighting (none: 45, social-only: 34, builder: 20, custom: 4)
// ranked need alone, and so ranked the HARDEST sells highest. A business
// operating for years with no website has had every chance to buy one and has
// revealed a preference. A business on Wix or Squarespace pays for a website
// every single month — proven buyer, existing budget line, and switching costs
// they already accepted once.
//
// It also had a provable defect: the `custom` ceiling was
// 4 + 30 + 10 + 15 = 59 against a QUALIFIED_LEAD_SCORE of 60, so a business
// with its own domain could NEVER be marked qualified — not with 1,000 reviews,
// not with 100,000. That silently orphaned the entire redesign play: migration
// 0006_site_quality.sql, scripts/audit-sites.mjs and every PageSpeed audit fed a
// column that could not influence who got contacted.
//
// The fix: `custom` is no longer a flat penalty. Its opportunity is a function
// of how bad the site actually is, read from site_quality_score (0–100, INVERSE
// — higher means worse). An unaudited custom site keeps the low base and stays
// out of outreach, which is the honest default: we do not know, so we do not
// email.
const PRESENCE_OPPORTUNITY = {
  none: 30, // real need, but an unproven buyer — keep in the pool, rank below
  'social-only': 34, // needs one AND demonstrably cares about being findable
  builder: 45, // PROVEN BUYER: already pays monthly for exactly this
  custom: 4, // base only — see CUSTOM_QUALITY_MAX below
};

// How much a custom-domain site's opportunity can grow with how bad it is.
// PRESENCE_OPPORTUNITY.custom (4) + 41 = 45, matching the `builder` ceiling:
// a truly terrible custom site is as good a prospect as a Wix site, and for the
// same reason — they have already paid for a website once.
const CUSTOM_QUALITY_MAX = 41;
const SOCIAL_PROOF_MAX = 30;
const OPERATIONAL_POINTS = 15;
const OWNER_VERIFIED_POINTS = 10;

// A permanently-closed business is worthless as a prospect no matter how weak
// its web presence, so `operational` is a GATE, not a flat bonus: closed
// listings keep only a fraction of their base score and always sink to the
// bottom of the ranking.
const NON_OPERATIONAL_FACTOR = 0.2;

// A business is "operating social proof" once it clears this review count.
const SOCIAL_PROOF_MIN_REVIEWS = 10;

/** Parse a hostname from a possibly-messy URL. Returns '' if unparseable. */
export function hostOf(url) {
  if (!url || typeof url !== 'string') return '';
  let s = url.trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  try {
    return new URL(s).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return '';
  }
}

/** True if `host` equals or is a subdomain of `base`. */
function hostMatches(host, base) {
  return host === base || host.endsWith(`.${base}`);
}

/**
 * Classify how much of a real web presence a URL represents.
 *   ''            -> 'none'
 *   social host   -> 'social-only'
 *   builder host  -> 'builder'
 *   anything else -> 'custom'
 */
export function classifySitePresence(url) {
  const host = hostOf(url);
  if (!host) return 'none';
  if (SOCIAL_HOSTS.some((h) => hostMatches(host, h))) return 'social-only';
  if (BUILDER_HOSTS.some((h) => hostMatches(host, h))) return 'builder';
  return 'custom';
}

/** Reviews -> 0..SOCIAL_PROOF_MAX, log-scaled so 1k reviews ≈ the ceiling. */
export function socialProofPoints(reviews) {
  const n = Number(reviews) || 0;
  if (n <= 0) return 0;
  return Math.min(SOCIAL_PROOF_MAX, Math.round(Math.log10(n + 1) * 10));
}

/** True when a business_status string is anything other than closed-permanently. */
export function isOperational(businessStatus) {
  if (!businessStatus) return true; // Google omits status for most operating listings
  return String(businessStatus).toUpperCase() !== 'CLOSED_PERMANENTLY';
}

/**
 * Compute the 0–100 lead score from the derived signals. Pure arithmetic over
 * the four levers so a reader can see exactly why a prospect ranks where it does.
 */
export function scoreProspect({
  sitePresence,
  reviews,
  operational,
  ownerVerified,
  siteQualityScore,
}) {
  const presence = presenceOpportunityPoints(sitePresence, siteQualityScore);
  const social = socialProofPoints(reviews);
  const owner = ownerVerified ? OWNER_VERIFIED_POINTS : 0;
  const base = presence + social + owner; // 0..85
  if (!operational) return Math.round(base * NON_OPERATIONAL_FACTOR);
  return base + OPERATIONAL_POINTS; // 0..100
}

/**
 * Presence -> 0..45 opportunity points.
 *
 * `custom` is the only presence type whose score depends on a second input: a
 * custom domain tells us they bought a website, not whether it is any good.
 * siteQualityScore (supabase/migrations/0006, written by scripts/audit-sites.mjs)
 * is 0–100 INVERSE — higher means a worse site means a better redesign prospect.
 *
 * A null/undefined quality score means "not audited yet", which scores the bare
 * base and keeps them out of outreach until someone actually looks. Audit first,
 * then email — never the other way round.
 *
 * @param {string} sitePresence
 * @param {number|null|undefined} siteQualityScore
 * @returns {number}
 */
export function presenceOpportunityPoints(sitePresence, siteQualityScore) {
  const base = PRESENCE_OPPORTUNITY[sitePresence] ?? PRESENCE_OPPORTUNITY.custom;
  if (sitePresence !== 'custom') return base;
  const q = Number(siteQualityScore);
  if (!Number.isFinite(q)) return base; // unaudited — we don't know, so we don't email
  const clamped = Math.min(100, Math.max(0, q));
  return base + Math.round((clamped / 100) * CUSTOM_QUALITY_MAX);
}

// ── buildability scoring ─────────────────────────────────────────────────────
//
// `leadScore` answers "how much do they NEED a site?" (weak web presence).
// `buildScore` answers "how COMPELLING a spec site can we build from what they
// already have online?" — more real material (photos, copy, reviews, hours,
// services, location, branding, a booking link) means we can show them a
// believable one-page site of their OWN business before they pay, which is the
// strongest move in the outreach playbook. The best target scores high on BOTH.
//
// Weights sum to a 100 ceiling; photos and reviews are the richest raw material
// (imagery + testimonials), so they carry the most weight.
const BUILD_WEIGHTS = {
  photos: 25, // hero + gallery imagery
  reviews: 20, // testimonials / star ratings
  description: 15, // real "about" copy
  hours: 10, // hours block
  services: 10, // a service list (category / subtypes)
  location: 10, // map + service area
  logo: 5, // branding
  cta: 5, // a booking / order link
};

/** Photos -> 0..photos-ceiling, log-scaled so a full gallery ≈ the ceiling. */
export function photoRichnessPoints(photosCount) {
  const n = Number(photosCount) || 0;
  if (n <= 0) return 0;
  return Math.min(BUILD_WEIGHTS.photos, Math.round(Math.log10(n + 1) * 15));
}

/** Reviews -> 0..reviews-ceiling for buildability (testimonial material). */
function reviewRichnessPoints(reviews) {
  const n = Number(reviews) || 0;
  if (n <= 0) return 0;
  return Math.min(BUILD_WEIGHTS.reviews, Math.round(Math.log10(n + 1) * 10));
}

/**
 * Compute the 0–100 buildability score from richness signals. Pure arithmetic
 * over presence/volume of the material a spec site is built from.
 */
export function scoreBuildability({
  photosCount,
  reviews,
  hasDescription,
  hasHours,
  hasServices,
  hasLocation,
  hasLogo,
  hasCta,
}) {
  return (
    photoRichnessPoints(photosCount) +
    reviewRichnessPoints(reviews) +
    (hasDescription ? BUILD_WEIGHTS.description : 0) +
    (hasHours ? BUILD_WEIGHTS.hours : 0) +
    (hasServices ? BUILD_WEIGHTS.services : 0) +
    (hasLocation ? BUILD_WEIGHTS.location : 0) +
    (hasLogo ? BUILD_WEIGHTS.logo : 0) +
    (hasCta ? BUILD_WEIGHTS.cta : 0)
  );
}

/** URL/filesystem-safe slug from a business name + city, deduped-friendly. */
export function slugify(name, city) {
  const base = [name, city]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
  return base || 'prospect';
}

/** First non-empty value among the given keys on `place`. */
function pick(place, ...keys) {
  for (const k of keys) {
    const v = place[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

/**
 * Normalize one raw OutscraperPlace into a scored Prospect. Deterministic:
 * derives signals, scores, and slugs without any side effects.
 */
export function normalizePlace(place = {}) {
  const name = String(pick(place, 'name') ?? '').trim();
  const city = String(pick(place, 'city') ?? '').trim();
  // Live Outscraper returns `state` (full name, e.g. "Oregon") + `state_code`
  // ("OR"); prefer the 2-letter code. `us_state` is the older/alt field name.
  const region = String(pick(place, 'us_state', 'state_code', 'state') ?? '').trim();
  // Live Outscraper returns the site URL as `website`; `site` is the alt name.
  const website = String(pick(place, 'site', 'website') ?? '').trim();
  const category = String(pick(place, 'type', 'category') ?? '').trim();
  const reviews = Number(pick(place, 'reviews', 'reviews_count')) || 0;
  const ratingRaw = pick(place, 'rating');
  const rating = ratingRaw === undefined ? null : Number(ratingRaw);
  const photosCount = Number(pick(place, 'photos_count')) || 0;
  const placeId = String(pick(place, 'place_id', 'google_id') ?? '').trim();

  // Live Outscraper returns `address`; `full_address` is the alt name.
  const address = String(pick(place, 'full_address', 'address') ?? '').trim();

  const sitePresence = classifySitePresence(website);
  const operational = isOperational(place.business_status);
  const ownerVerified = Boolean(place.verified);
  const hasSocialProof = reviews >= SOCIAL_PROOF_MIN_REVIEWS;

  // ── richer content — the raw material a spec site is built from. Feeds
  //    buildScore AND the `leads` content columns (0002) for the eventual build.
  const description = String(pick(place, 'description') ?? '').trim();
  const workingHours =
    place.working_hours && typeof place.working_hours === 'object' ? place.working_hours : null;
  const logoUrl = String(pick(place, 'logo') ?? '').trim();
  const mainPhoto = String(pick(place, 'photo') ?? '').trim();
  const photos = mainPhoto ? [mainPhoto] : []; // search-v3 gives one photo + a count
  const subtypesRaw = pick(place, 'subtypes', 'type', 'category');
  const types = subtypesRaw
    ? String(subtypesRaw)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const orderLinks = Array.isArray(place.order_links) ? place.order_links.filter(Boolean) : [];
  const cta = String(pick(place, 'booking_appointment_link') ?? '').trim() || (orderLinks[0] ?? '');
  const latRaw = pick(place, 'latitude');
  const lngRaw = pick(place, 'longitude');
  const latitude = Number.isFinite(Number(latRaw)) ? Number(latRaw) : null;
  const longitude = Number.isFinite(Number(lngRaw)) ? Number(lngRaw) : null;
  // Social-only presence means the "website" IS their social page — surface it as
  // a { host: url } social link so the build step has it.
  const social = sitePresence === 'social-only' && website ? { [hostOf(website)]: website } : null;

  const hasDescription = description.length > 0;
  const hasHours = !!workingHours && Object.keys(workingHours).length > 0;
  const hasServices = types.length > 0 || category.length > 0;
  const hasLocation = address.length > 0 || (latitude !== null && longitude !== null);
  const hasLogo = logoUrl.length > 0;
  const hasCta = cta.length > 0;

  const signals = {
    hasWebsite: sitePresence !== 'none',
    sitePresence,
    hasSocialProof,
    ownerVerified,
    operational,
    leadScore: scoreProspect({ sitePresence, reviews, operational, ownerVerified }),
    buildScore: scoreBuildability({
      photosCount,
      reviews,
      hasDescription,
      hasHours,
      hasServices,
      hasLocation,
      hasLogo,
      hasCta,
    }),
  };

  return {
    slug: slugify(name, city),
    name,
    category,
    address,
    city,
    region,
    phone: String(pick(place, 'phone') ?? '').trim(),
    website,
    rating: Number.isFinite(rating) ? rating : null,
    reviews,
    photosCount,
    placeId,
    mapsUrl: String(pick(place, 'location_link') ?? '').trim(),
    sourceQuery: String(pick(place, 'query') ?? '').trim(),
    signals,
    // Richer material for the site build + the leads content columns. Not part of
    // scoring — buildScore already summarised it into signals.
    content: {
      description,
      hours: workingHours,
      photos,
      logoUrl,
      social,
      types,
      cta,
      email: String(pick(place, 'email', 'email_1') ?? '').trim(),
      postalCode: String(pick(place, 'postal_code') ?? '').trim(),
      country: String(pick(place, 'country') ?? '').trim(),
      latitude,
      longitude,
      businessStatus: String(pick(place, 'business_status') ?? '').trim(),
    },
  };
}

/**
 * Flatten Outscraper's response shape into a flat array of places. The
 * /maps/search-v3 `data` field is one array of places PER submitted query, so a
 * multi-query run arrives as an array of arrays; a single query may arrive flat.
 */
export function flattenPlaces(data) {
  if (!Array.isArray(data)) return [];
  const out = [];
  for (const entry of data) {
    if (Array.isArray(entry)) out.push(...entry);
    else if (entry && typeof entry === 'object') out.push(entry);
  }
  return out;
}

/** Dedupe prospects by place id (falling back to slug when id is missing). */
export function dedupeProspects(prospects) {
  const seen = new Set();
  const out = [];
  for (const p of prospects) {
    const key = p.placeId || `slug:${p.slug}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * End-to-end: raw Outscraper `data` (array-of-arrays or flat) -> deduped,
 * score-sorted Prospect[]. This is the pure core the CLI wraps with I/O.
 */
export function normalizeResponse(data) {
  const places = flattenPlaces(data);
  const prospects = places
    .filter((p) => p && (p.name || p.place_id || p.google_id))
    .map(normalizePlace);
  return dedupeProspects(prospects).sort((a, b) => b.signals.leadScore - a.signals.leadScore);
}

export const _internal = {
  SOCIAL_HOSTS,
  BUILDER_HOSTS,
  PRESENCE_OPPORTUNITY,
  CUSTOM_QUALITY_MAX,
  SOCIAL_PROOF_MIN_REVIEWS,
  BUILD_WEIGHTS,
};
