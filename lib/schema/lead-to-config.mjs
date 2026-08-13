/**
 * lib/schema/lead-to-config — deterministic, no-LLM lead → config mapper
 * (vendored).
 *
 * Vendored from hirobius site-engine `packages/schema/src/lead-to-config.ts`
 * (site-engine#122). Ported .ts → .mjs (type-only exports dropped). Re-sync on
 * contract change; do not fork the meaning.
 *
 * The ops board's "Create site" button must work even before the AI agent's
 * `ANTHROPIC_API_KEY` lands — this is that fallback path. It never fabricates a
 * business fact: a missing phone, email, or hours row gets a schema-legal,
 * fleet-standard placeholder and a matching entry in `todos`, never an invented
 * value. `city`/`region` are always real lead facts, so falling back to them
 * for `serviceAreas`/the map query isn't fabrication.
 *
 * Gallery photos and reviews never come from a lead row at all, so
 * `layout.sectionOrder` deliberately omits "gallery"/"reviews" rather than
 * pointing at empty arrays.
 */

import { defineClient } from './index.mjs';
import { PALETTE_PRESET_IDS } from './presets.mjs';

/** Fleet-standard placeholder phone (see site-engine `apps/_template`'s stub). */
const PLACEHOLDER_PHONE = '(555) 010-0000';
/** Fleet-standard placeholder Web3Forms key (see site-engine `apps/_template`). */
const PLACEHOLDER_FORM_KEY = 'REPLACE_WITH_WEB3FORMS_ACCESS_KEY';

const TRADE_LABELS = {
  landscaping: 'landscaping',
  'junk-removal': 'junk removal',
  'pressure-washing': 'pressure washing',
  'concrete-fencing': 'concrete & fencing',
};

/** Keyword fragments matched against a lead's free-form `category` string. */
const TRADE_KEYWORDS = {
  landscaping: ['landscap', 'lawn', 'garden', 'yard', 'mowing', 'tree service', 'hardscap'],
  'junk-removal': ['junk', 'haul', 'debris', 'dumpster', 'cleanout', 'trash removal'],
  'pressure-washing': [
    'pressure wash',
    'power wash',
    'soft wash',
    'exterior clean',
    'roof clean',
    'moss removal',
    'gutter',
    'window clean',
  ],
  'concrete-fencing': ['concrete', 'fence', 'fencing', 'driveway', 'retaining wall', 'paving', 'mason'],
};

/** Default trade when a category doesn't match any known keyword — the exterior-cleaning beachhead. */
const DEFAULT_TRADE = 'pressure-washing';

/**
 * Maps a lead's free-form category to a shipped trade. Falls back to
 * `DEFAULT_TRADE` when nothing matches.
 * @param {string} category
 * @returns {{ trade: string, matched: boolean }}
 */
export function mapCategoryToTrade(category) {
  const normalized = category.toLowerCase();
  for (const trade of PALETTE_PRESET_IDS) {
    if (TRADE_KEYWORDS[trade].some((keyword) => normalized.includes(keyword))) {
      return { trade, matched: true };
    }
  }
  return { trade: DEFAULT_TRADE, matched: false };
}

/**
 * @param {string} value
 * @param {number} max
 */
function truncate(value, max) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

/** @param {{ serviceArea?: string[] | string | null, city: string, region: string }} lead */
function resolveServiceAreas(lead) {
  if (Array.isArray(lead.serviceArea) && lead.serviceArea.length > 0) {
    return lead.serviceArea;
  }
  if (typeof lead.serviceArea === 'string' && lead.serviceArea.trim().length > 0) {
    return lead.serviceArea
      .split(',')
      .map((area) => area.trim())
      .filter(Boolean);
  }
  return [`${lead.city}, ${lead.region}`];
}

/**
 * Map an ops `leads` row to a validated `ClientConfig`, no LLM involved.
 * Throws (via `defineClient`) if `lead.slug`/`lead.category` etc. produce an
 * otherwise-invalid config — same contract as every other `defineClient` caller.
 * @param {{ name: string, slug: string, category: string, city: string, region: string,
 *           phone?: string | null, email?: string | null,
 *           hours?: Array<{ days: string, hours: string }> | null,
 *           serviceArea?: string[] | string | null }} lead
 * @returns {{ config: object, todos: string[] }} the validated config plus the
 *   fields that were stubbed or defaulted — surface these to the human before go-live.
 */
export function leadToConfig(lead) {
  const todos = [];
  const { trade, matched } = mapCategoryToTrade(lead.category);
  if (!matched) {
    todos.push(
      `category "${lead.category}" didn't match a known trade — defaulted palette/copy to "${trade}"; confirm the fit`,
    );
  }
  const tradeLabel = TRADE_LABELS[trade];

  const phone = lead.phone?.trim();
  if (!phone) todos.push('business.phone is missing — using a placeholder, replace before going live');

  const email = lead.email?.trim();
  if (!email) todos.push('business.email is missing — using a placeholder, replace before going live');

  const hours = lead.hours && lead.hours.length > 0 ? lead.hours : undefined;
  if (!hours) todos.push('business.hours is missing — using a placeholder, replace before going live');

  todos.push('form.accessKey is a placeholder — set a real Web3Forms access key before going live');
  todos.push('no photos yet — add apps/<slug>/src/assets/photos and add "gallery" to layout.sectionOrder');
  todos.push('no reviews yet — add business.reviews and add "reviews" to layout.sectionOrder once available');

  const serviceAreas = resolveServiceAreas(lead);
  const mapQuery = `${lead.city}, ${lead.region}`;
  const sectionOrder = ['services', 'serviceAreaMap', 'contact'];

  const draft = {
    slug: lead.slug,
    business: {
      name: lead.name,
      phone: phone || PLACEHOLDER_PHONE,
      email: email || `hello@${lead.slug}.example`,
      hours: hours ?? [{ days: 'Mon–Sun', hours: 'Call for hours' }],
      serviceAreas,
    },
    brand: { palettePreset: trade },
    layout: { sectionOrder },
    contentPack: trade,
    copy: {
      heroHeadline: `Trusted ${tradeLabel[0]?.toUpperCase()}${tradeLabel.slice(1)} in ${lead.city}`,
      heroSub: `${lead.name} brings reliable, professional ${tradeLabel} to ${lead.city} and the surrounding area.`,
      about: `${lead.name} is a local ${tradeLabel} company serving ${lead.city}, ${lead.region} and nearby communities. Reach out today for a free quote.`,
    },
    map: { embedQuery: mapQuery },
    form: { provider: 'web3forms', accessKey: PLACEHOLDER_FORM_KEY },
    seo: {
      title: truncate(`${lead.name} | ${lead.city} ${tradeLabel}`, 70),
      description: truncate(
        `Professional ${tradeLabel} in ${lead.city}, ${lead.region}. Contact ${lead.name} for a free quote.`,
        180,
      ),
      city: lead.city,
      region: lead.region,
      siteUrl: `https://${lead.slug}.example`,
    },
  };

  return { config: defineClient(draft), todos };
}
