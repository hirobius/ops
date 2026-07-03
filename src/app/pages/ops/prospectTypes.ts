// Shared types for the Outscraper → proposal-site prospecting pipeline.
//
// A "prospect" is a business we scraped from Google Maps (via Outscraper) that
// we might build a mock proposal site for. It is the pre-client stage: a
// prospect becomes a `clients/<slug>/` folder (meta.json `status: "prospect"`)
// once we decide to pursue it. See docs/prospecting/outscraper-pipeline.md.
//
// Two layers live here:
//   1. `OutscraperPlace` — the raw shape Outscraper returns per business.
//      Only the fields we consume are typed; the API returns ~50 more, so
//      `[extra: string]: unknown` keeps unknown fields without lying about them.
//   2. `Prospect` — our normalized record: identity + the derived
//      "proposal signals" that decide whether a business is worth a mock site
//      (do they have a site already? is it weak? how much social proof?).
//
// The normalizer that maps 1 → 2 is scripts/lib/outscraper-normalize.mjs.

// ── 1. Raw Outscraper place (subset we read) ────────────────────────────────

/** A single business as returned by Outscraper's Google Maps search. */
export interface OutscraperPlace {
  /** The search query this result came back for, e.g. "dentists, Austin TX". */
  query?: string;
  name?: string;
  /** Google place id, e.g. "ChIJ...". Stable identity key. */
  place_id?: string;
  google_id?: string;
  full_address?: string;
  city?: string;
  state?: string;
  us_state?: string;
  postal_code?: string;
  country?: string;
  country_code?: string;
  latitude?: number;
  longitude?: number;
  /** Primary phone in international format when available. */
  phone?: string;
  /** The business website. Empty/absent is the signal we care about most. */
  site?: string;
  /** Primary category, e.g. "Dentist". */
  type?: string;
  /** Human category label; often same as `type`. */
  category?: string;
  subtypes?: string;
  rating?: number;
  /** Total review count. */
  reviews?: number;
  reviews_link?: string;
  photos_count?: number;
  photo?: string;
  /** "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY". */
  business_status?: string;
  /** True when the owner has claimed the listing. */
  verified?: boolean;
  working_hours?: Record<string, string> | null;
  /** Google Maps listing link. */
  location_link?: string;
  [extra: string]: unknown;
}

/** Top-level Outscraper response envelope (sync `async=false` or polled result). */
export interface OutscraperResponse {
  id?: string;
  status?: 'Success' | 'Pending' | 'Error' | string;
  /** One inner array per submitted query. */
  data?: OutscraperPlace[][];
  /** Present on 202 async responses; poll this for the finished payload. */
  results_location?: string;
}

// ── 2. Normalized prospect + proposal signals ───────────────────────────────

/**
 * Why a prospect is (or isn't) a good mock-site candidate. Everything here is
 * derived deterministically from an OutscraperPlace — no network, no LLM — so
 * it is cheap to recompute and safe to unit-test.
 */
export interface ProspectSignals {
  /** Business has any website URL at all. */
  hasWebsite: boolean;
  /**
   * Heuristic read of the existing web presence:
   *   - "none"        no site → strongest pitch (we build their first site)
   *   - "social-only" links to facebook/instagram/linktr.ee etc., no real site
   *   - "builder"     wix/squarespace/godaddy/weebly → easy to out-build
   *   - "custom"      an apparent real domain → hardest sell
   */
  sitePresence: 'none' | 'social-only' | 'builder' | 'custom';
  /** Enough social proof (reviews) to be worth pitching. */
  hasSocialProof: boolean;
  /** Listing is claimed/verified by the owner (reachable decision-maker). */
  ownerVerified: boolean;
  /** Business is currently operating. */
  operational: boolean;
  /**
   * 0–100 composite. Higher = better mock-site candidate. Rewards "real
   * business (reviews, operational) with a weak/absent site". See normalizer
   * for the exact weighting.
   */
  leadScore: number;
}

/** A scraped business, normalized into our prospecting shape. */
export interface Prospect {
  /** URL-safe slug derived from name + city; also the clients/<slug> folder. */
  slug: string;
  name: string;
  category: string | null;
  /** Best available single-line address. */
  address: string | null;
  city: string | null;
  region: string | null;
  phone: string | null;
  /** Existing website, or null. */
  website: string | null;
  rating: number | null;
  reviews: number;
  photosCount: number;
  /** Google place id — stable dedupe key across runs. */
  placeId: string | null;
  mapsUrl: string | null;
  /** The Outscraper query this prospect surfaced from. */
  sourceQuery: string | null;
  signals: ProspectSignals;
}

/** Result of a normalize run over one Outscraper response. */
export interface ProspectBatch {
  /** Queries that produced this batch. */
  queries: string[];
  /** Deduped, scored prospects sorted by leadScore desc. */
  prospects: Prospect[];
  /** Count before dedupe, for run reporting. */
  rawCount: number;
}
