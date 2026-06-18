/**
 * lib/duda — Duda site build + publish adapter.
 *
 * ⚠️ STUB IMPLEMENTATION. `buildSite`/`publishSite` return deterministic mock
 * results so the build → preview → publish flow works end to end before the real
 * Duda Partner REST API is wired. Replace the bodies (keep the signatures + return
 * shapes stable; the routes and `leads` columns depend on them).
 *
 * Real implementation (Duda Partner REST API, Basic auth with DUDA_API_USER /
 * DUDA_API_PASS — server-only):
 *   buildSite   → create site from template (POST /api/sites/multiscreen/create),
 *                 inject content (Content Library / Content Injection API), LEAVE
 *                 UNPUBLISHED, return the shareable preview URL + editor SSO URL.
 *   publishSite → POST /api/sites/multiscreen/publish/{site_name}, return live URL.
 *
 * Billing note: unpublished sites are free; only publishSite starts per-site
 * billing. So build broadly (previews), publish on conversion. See
 * docs/operations/lead-pipeline-platform-integrations.md.
 *
 * @typedef {Object} BuildResult
 * @property {string} duda_site_name   Duda's site identifier (idempotency key)
 * @property {string} preview_url      shareable preview link (unpublished)
 * @property {string} editor_url       SSO link into the Duda editor
 *
 * @typedef {Object} PublishResult
 * @property {string} live_url         public URL once published
 */

/**
 * Map a `leads` row → the Duda content-injection / business-data payload.
 *
 * This is the single source of truth for the field mapping. The real `buildSite`
 * sends this object to the Content Injection API (template elements tagged with
 * `data-inject`) + the business-data/local-business-schema endpoints. Keeping it
 * here documents exactly which scraped fields feed the site.
 *
 * @param {Record<string, any>} lead  a row from the `leads` table
 */
export function toDudaContent(lead) {
  return {
    businessName: lead.name ?? '',
    description: lead.description ?? '',
    category: lead.category ?? '',
    logoUrl: lead.logo_url ?? null,
    serviceArea: lead.service_area ?? [lead.city, lead.region].filter(Boolean).join(', '),
    location: {
      address: lead.street_address ?? '',
      city: lead.city ?? '',
      region: lead.region ?? '',
      postalCode: lead.postal_code ?? '',
      country: lead.country ?? '',
      lat: lead.latitude ?? null,
      lng: lead.longitude ?? null,
    },
    phones: lead.phone ? [{ label: 'Main', number: lead.phone }] : [],
    emails: lead.email ? [{ label: 'Main', email: lead.email }] : [],
    socialAccounts: lead.social ?? {},
    hours: lead.hours ?? null,
    photos: lead.photos ?? [],
    schema: { type: 'LocalBusiness', mapsUrl: lead.google_maps_url ?? null },
    // The generated ClientConfig drives template selection / section content.
    config: lead.config ?? null,
  };
}

/** @param {string} s */
function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/**
 * Create (or update) an UNPUBLISHED Duda site for a lead and inject its content.
 * @param {Record<string, any>} lead
 * @returns {Promise<BuildResult>}
 */
export async function buildSite(lead) {
  // STUB — real impl: createSite(template) → injectContent(toDudaContent(lead)) → return preview URL.
  const content = toDudaContent(lead); // exercise the mapper so its shape is validated
  void content;
  const siteName = lead.duda_site_name || `stub-${slug(lead.name || lead.place_id || 'site')}-${String(lead.id || '').slice(0, 8)}`;
  return {
    duda_site_name: siteName,
    preview_url: `https://preview.multiscreensite.com/${siteName}`,
    editor_url: `https://my.duda.co/home/site/${siteName}`,
  };
}

/**
 * Publish a previously-built site (starts per-site billing).
 * @param {string} siteName
 * @returns {Promise<PublishResult>}
 */
export async function publishSite(siteName) {
  // STUB — real impl: POST /api/sites/multiscreen/publish/{siteName}.
  return { live_url: `https://${siteName}.multiscreensite.com` };
}
