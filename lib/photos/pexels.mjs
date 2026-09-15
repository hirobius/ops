/**
 * lib/photos/pexels — trade-appropriate stock imagery for imagery-less previews (ops#196).
 *
 * Outscraper's search tier returns `photos_count`, not photo URLs, so sourcing
 * hardcodes `photos: []` and every generated preview would ship an empty hero
 * and an empty gallery. The paid details pass (#190) would fix that; this is the
 * free path, and it is the one we run.
 *
 * Business photos always win. This is a fallback for slots nothing else filled —
 * once a source provides real photos they take precedence (#190's future
 * Outscraper entries write `source:'outscraper'`).
 *
 * FABRICATION BAN: stock alt text says it is stock. Generic trade imagery is
 * honest; imagery captioned as the client's own work is not, and this module is
 * the only place that alt text is written, so the rule is enforced here rather
 * than hoped for downstream.
 *
 * Node built-ins only (global fetch). Reads `PEXELS_API_KEY` at call time, not
 * at import, so a module load never depends on env.
 *
 * @module photos/pexels
 */

const API = 'https://api.pexels.com/v1/search';

/** Longest-edge cap, matching the factory's photo-optimization rule + Lighthouse budget. */
const MAX_EDGE = 1600;

const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Thrown when `PEXELS_API_KEY` is absent. A distinct type so callers can degrade
 * to placeholder behaviour rather than treating it as a generation failure.
 */
export class MissingPexelsKeyError extends Error {
  constructor() {
    super(
      'PEXELS_API_KEY is not set — generated previews will ship without stock imagery. ' +
        `Fix: set or verify PEXELS_API_KEY in Vercel → hirobius-ops → Settings → ` +
        `Environment Variables (Production + Preview), then REDEPLOY the branch ` +
        `(env changes only take effect on a new build, not the dashboard Redeploy button) — ` +
        VERCEL_ENV_URL,
    );
    this.name = 'MissingPexelsKeyError';
  }
}

/** Trade → search phrase. Keyed off the four palette presets, with a category fallback. */
const TRADE_QUERIES = {
  landscaping: 'landscaped garden lawn care',
  'junk-removal': 'junk removal truck hauling',
  'pressure-washing': 'pressure washing concrete driveway',
  'concrete-fencing': 'concrete driveway and fence installation',
};

/** Used when neither the preset nor the lead category tells us anything useful. */
const GENERIC_QUERY = 'local home services contractor at work';

/**
 * Search phrase for a lead's trade.
 *
 * @param {string|null|undefined} preset palette preset id
 * @param {string|null|undefined} category the lead's own category
 * @returns {string} never empty
 */
export function tradeQuery(preset, category) {
  if (preset && TRADE_QUERIES[preset]) return TRADE_QUERIES[preset];
  if (typeof category === 'string' && category.trim()) return category.trim();
  return GENERIC_QUERY;
}

/**
 * Cap a Pexels CDN url at MAX_EDGE on its longest edge.
 *
 * Pexels resizes via query params, so this costs nothing at fetch time and keeps
 * us inside the Lighthouse budget without a local resize step.
 *
 * @param {string} src
 */
function capped(src) {
  const u = new URL(src);
  u.searchParams.set('auto', 'compress');
  u.searchParams.set('w', String(MAX_EDGE));
  return u.toString();
}

/**
 * Fetch trade-appropriate stock photos.
 *
 * @param {{ query: string, count: number }} input
 * @returns {Promise<Array<{ id: number, url: string, path: string, alt: string, source: 'pexels', photographer: string }>>}
 * @throws {MissingPexelsKeyError} when the key is absent — caller degrades
 * @throws {Error} naming PEXELS_API_KEY when the key is rejected
 */
export async function searchStockPhotos({ query, count }) {
  const key = process.env.PEXELS_API_KEY;
  if (!key) throw new MissingPexelsKeyError();

  const url = new URL(API);
  url.searchParams.set('query', query);
  url.searchParams.set('per_page', String(count));
  url.searchParams.set('orientation', 'landscape');
  url.searchParams.set('w', String(MAX_EDGE));

  const res = await fetch(url.toString(), {
    headers: { Authorization: key },
    signal: AbortSignal.timeout(9000),
  });

  if (res.status === 401 || res.status === 403) {
    throw new Error(
      `Pexels rejected the request (${res.status}). PEXELS_API_KEY is invalid, expired or revoked — ` +
        `replace it in Vercel → hirobius-ops → Settings → Environment Variables ` +
        `(Production + Preview), then redeploy the branch — ${VERCEL_ENV_URL}`,
    );
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Pexels HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ''}`);
  }

  const { photos = [] } = await res.json();
  return photos.map((p) => ({
    id: p.id,
    url: capped(p.src.large),
    path: `/photos/stock-pexels-${p.id}.jpg`,
    // Honest by construction: describes the imagery and says it is stock.
    alt: `${p.alt || query} — stock photo`,
    source: 'pexels',
    photographer: p.photographer ?? 'Pexels contributor',
  }));
}
