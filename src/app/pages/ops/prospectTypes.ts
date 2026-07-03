// Shared types for the Outscraper prospecting pipeline. A "prospect" is a
// scraped local business scored as a candidate for a cold-outreach spec site.
// These types sit next to clientTypes.ts because a prospect is the pre-client
// record: once it converts, it graduates into a clients/<slug>/ folder that the
// /ops dashboard already knows how to render (status flips prospect -> active).
//
// The pipeline is: Outscraper /maps/search-v3 -> OutscraperPlace[] (raw) ->
// normalize + score + dedupe -> Prospect[] (sorted by leadScore desc). The
// normalizer (scripts/lib/outscraper-normalize.mjs) is pure JS; this file is the
// typed contract consumed by any TS surface (a future /ops prospects view).

/**
 * Raw place object from Outscraper's Google Maps search. Only the subset the
 * normalizer consumes is typed here; Outscraper returns many more fields. Field
 * names mirror Outscraper's response keys (snake_case), with the common aliases
 * they emit across endpoint versions (`state`/`us_state`, `type`/`category`).
 */
export interface OutscraperPlace {
  /** The query string this place was returned for (Outscraper echoes it back). */
  query?: string;
  name?: string;
  place_id?: string;
  google_id?: string;
  full_address?: string;
  city?: string;
  state?: string;
  us_state?: string;
  postal_code?: string;
  phone?: string;
  /** The business's own website, if Google has one on the listing. */
  site?: string;
  /** Human-facing category, e.g. "Dentist". Outscraper uses `type` or `category`. */
  type?: string;
  category?: string;
  rating?: number;
  /** Review count. Outscraper uses `reviews`; some payloads use `reviews_count`. */
  reviews?: number;
  reviews_count?: number;
  photos_count?: number;
  /** e.g. "OPERATIONAL" | "CLOSED_TEMPORARILY" | "CLOSED_PERMANENTLY". */
  business_status?: string;
  /** True when the owner has claimed the listing (a contactable decision-maker). */
  verified?: boolean;
  /** Deep link back to the Google Maps listing. */
  location_link?: string;
}

/** How much of a real web presence a business has — drives the pitch. */
export type SitePresence =
  | 'none' // no website on the listing at all
  | 'social-only' // only a facebook/instagram/linktree/business.site URL
  | 'builder' // a DIY builder (wix/squarespace/godaddy/weebly/shopify)
  | 'custom'; // a real custom domain — hardest to sell a new site to

/**
 * Deterministically derived from an OutscraperPlace. No network, no LLM — the
 * same place always yields the same signals, so scoring is reproducible and
 * unit-testable.
 */
export interface ProspectSignals {
  hasWebsite: boolean;
  sitePresence: SitePresence;
  /** Meaningful review volume — proxy for a real, operating business. */
  hasSocialProof: boolean;
  /** Owner has claimed the listing — implies a reachable decision-maker. */
  ownerVerified: boolean;
  /** Not permanently closed. */
  operational: boolean;
  /** 0–100. Higher = better mock-site candidate. See the normalizer for weights. */
  leadScore: number;
}

/** A normalized, scored prospect ready to rank, export, or scaffold. */
export interface Prospect {
  slug: string;
  name: string;
  category: string;
  address: string;
  city: string;
  region: string;
  phone: string;
  website: string;
  rating: number | null;
  reviews: number;
  photosCount: number;
  placeId: string;
  mapsUrl: string;
  /** The query that surfaced this prospect — provenance for the run. */
  sourceQuery: string;
  signals: ProspectSignals;
}

/** One pipeline run: the ranked prospects plus reproducibility metadata. */
export interface ProspectBatch {
  /** Run identifier (a timestamp-derived id, stamped by the CLI). */
  runId: string;
  /** The queries submitted to Outscraper for this run. */
  queries: string[];
  /** Total raw places received before dedupe. */
  rawCount: number;
  /** Prospects after normalize + dedupe, sorted by leadScore desc. */
  prospects: Prospect[];
}
