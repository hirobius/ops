/**
 * lib/agent/enrich — fill the business fields Places can't supply.
 *
 * Places gives address/geo/phone/hours/photos, but NOT a reliable email, logo, or
 * social links. This step derives them — primarily from the lead's existing
 * website — so the Duda build (and the generated config) have a complete picture.
 *
 * ⚠️ STUB IMPLEMENTATION. Real impl: fetch the lead's website and parse
 *   - `mailto:` links / contact page         → email
 *   - `<link rel="icon">` / `og:image`        → logo
 *   - footer + JSON-LD `sameAs` social links  → social
 *   - an optional LLM pass (ANTHROPIC_API_KEY) → a clean description
 * If there's no website, a real impl may fall back to a web/LLM search; the stub
 * returns nulls so downstream coalescing keeps whatever Places already provided.
 *
 * @typedef {Object} Enrichment
 * @property {string|null} email
 * @property {string|null} logo_url
 * @property {Record<string,string>|null} social
 * @property {string|null} description
 */

/** @param {string|null|undefined} website */
function domainOf(website) {
  if (!website) return null;
  try {
    return new URL(website).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/**
 * @param {{ name?: string, website?: string|null, category?: string|null, city?: string|null, region?: string|null, description?: string|null }} input
 * @returns {Promise<Enrichment>}
 */
export async function enrich(input) {
  const domain = domainOf(input.website);

  if (!domain) {
    // Nothing to scrape from — leave fields null (coalesced downstream).
    return { email: null, logo_url: null, social: null, description: null };
  }

  // STUB: derive plausible values from the domain.
  const handle = domain.split('.')[0];
  return {
    email: `info@${domain}`,
    logo_url: `https://${domain}/favicon.ico`,
    social: { facebook: `https://www.facebook.com/${handle}` },
    description:
      input.description ??
      `${input.name ?? 'This business'} — ${input.category ?? 'local business'} in ${
        [input.city, input.region].filter(Boolean).join(', ') || 'the area'
      }.`,
  };
}
