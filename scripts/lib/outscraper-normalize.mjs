/**
 * scripts/lib/outscraper-normalize.mjs
 *
 * Pure normalizer: Outscraper Google-Maps place objects → our `Prospect`
 * records with derived proposal signals. No network, no env, no LLM — every
 * function here is deterministic so it can be unit-tested and re-run cheaply.
 *
 * Type contract mirrors src/app/pages/ops/prospectTypes.ts (Prospect,
 * ProspectSignals, OutscraperPlace). Kept in JS (JSDoc) to match the other
 * scripts/lib modules; the .ts types are the source of truth for the dashboard.
 *
 * @module outscraper-normalize
 */

/**
 * Domains that are a social/link-in-bio presence rather than a real website.
 * A business whose only "site" is one of these is a strong mock-site target.
 */
const SOCIAL_HOSTS = [
  'facebook.com',
  'instagram.com',
  'linktr.ee',
  'linktree.com',
  'linkedin.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'yelp.com',
  'google.com',
  'business.site', // Google Business "website"
  'sites.google.com',
];

/**
 * Hosted site-builders. A real domain built on one of these is still an easy
 * out-build, so we grade it above social-only but below a custom build.
 */
const BUILDER_HOSTS = [
  'wixsite.com',
  'wix.com',
  'squarespace.com',
  'godaddysites.com',
  'godaddy.com',
  'weebly.com',
  'wordpress.com',
  'myshopify.com',
  'square.site',
  'webflow.io',
  'carrd.co',
];

/** @param {string} url @returns {string} lowercased hostname, or '' */
function hostOf(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url.includes('://') ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Classify a website URL into the proposal-relevant buckets.
 * @param {string | undefined | null} site
 * @returns {'none' | 'social-only' | 'builder' | 'custom'}
 */
export function classifySitePresence(site) {
  const host = hostOf(site ?? '');
  if (!host) return 'none';
  if (SOCIAL_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'social-only';
  if (BUILDER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`))) return 'builder';
  return 'custom';
}

/**
 * URL-safe slug from a business name + optional city. Stable and collision-
 * resistant enough for a clients/<slug> folder; callers dedupe on place_id.
 * @param {string} name @param {string | null | undefined} city
 * @returns {string}
 */
export function slugify(name, city) {
  const base = [name, city].filter(Boolean).join(' ');
  const slug = base
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'prospect';
}

/**
 * Derive proposal signals from a raw place.
 * @param {import('./outscraper-normalize.mjs').RawPlace} place
 * @returns {import('./outscraper-normalize.mjs').Signals}
 */
export function deriveSignals(place) {
  const sitePresence = classifySitePresence(place.site);
  const hasWebsite = sitePresence !== 'none';
  const reviews = Number(place.reviews) || 0;
  const hasSocialProof = reviews >= 10;
  const ownerVerified = place.verified === true;
  const operational =
    !place.business_status || place.business_status === 'OPERATIONAL';

  // leadScore: reward a *real, reachable* business with a *weak* web presence.
  //   web weakness  → up to 45  (none is the whole pitch; custom kills it)
  //   social proof  → up to 30  (log-scaled review count)
  //   operational   → 15
  //   owner verified→ 10  (a claimed listing = a contactable decision-maker)
  const webWeakness = { none: 45, 'social-only': 34, builder: 20, custom: 4 }[sitePresence];
  const proof = Math.min(30, Math.round(Math.log10(reviews + 1) * 12));
  const score =
    webWeakness + proof + (operational ? 15 : 0) + (ownerVerified ? 10 : 0);
  const leadScore = Math.max(0, Math.min(100, Math.round(score)));

  return { hasWebsite, sitePresence, hasSocialProof, ownerVerified, operational, leadScore };
}

/**
 * Normalize one raw place into a Prospect.
 * @param {import('./outscraper-normalize.mjs').RawPlace} place
 * @returns {import('./outscraper-normalize.mjs').ProspectRecord}
 */
export function normalizePlace(place) {
  const name = (place.name ?? '').trim() || 'Unknown business';
  const city = place.city ?? null;
  const region = place.us_state ?? place.state ?? null;
  return {
    slug: slugify(name, city),
    name,
    category: place.category ?? place.type ?? null,
    address: place.full_address ?? null,
    city,
    region,
    phone: place.phone ?? null,
    website: place.site ?? null,
    rating: typeof place.rating === 'number' ? place.rating : null,
    reviews: Number(place.reviews) || 0,
    photosCount: Number(place.photos_count) || 0,
    placeId: place.place_id ?? null,
    mapsUrl: place.location_link ?? null,
    sourceQuery: place.query ?? null,
    signals: deriveSignals(place),
  };
}

/**
 * Normalize a full Outscraper response into a scored, deduped batch.
 * Dedupe key: place_id when present, else slug. Sorted by leadScore desc.
 * @param {import('./outscraper-normalize.mjs').OutscraperEnvelope} response
 * @returns {import('./outscraper-normalize.mjs').Batch}
 */
export function normalizeResponse(response) {
  const groups = Array.isArray(response?.data) ? response.data : [];
  const flat = groups.flat().filter((p) => p && typeof p === 'object');
  const queries = [...new Set(flat.map((p) => p.query).filter(Boolean))];

  const byKey = new Map();
  for (const place of flat) {
    const prospect = normalizePlace(place);
    const key = prospect.placeId || prospect.slug;
    // Keep the higher-scoring duplicate (defensive; usually identical).
    const existing = byKey.get(key);
    if (!existing || prospect.signals.leadScore > existing.signals.leadScore) {
      byKey.set(key, prospect);
    }
  }

  const prospects = [...byKey.values()].sort(
    (a, b) => b.signals.leadScore - a.signals.leadScore,
  );

  return { queries, prospects, rawCount: flat.length };
}
