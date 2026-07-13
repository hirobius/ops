/**
 * lib/health/verify-live.mjs — post-deploy site assertions.
 *
 * Vendored port of hirobius/site-engine's `scripts/verify-live.ts` (the
 * factory's own go-live checker; export surface declared in site-engine#108 /
 * PR #138) so ops's fleet-health monitor runs the SAME assertion library the
 * factory verifies launches with — one definition of "healthy". Re-sync from
 * site-engine if those assertions change.
 *
 * Pure functions over an injected fetch — no network in tests.
 *
 * Live mode expects what `apps/<slug>/middleware.ts` does once SITE_LIVE=true
 * (pass-through, no gate): 200, no `X-Robots-Tag: noindex`, a LocalBusiness
 * JSON-LD block, `/sitemap-index.xml` + `/robots.txt` + `/thanks` reachable.
 * Gated mode expects the OPPOSITE — the closed-by-default preview gate:
 * 401 with `WWW-Authenticate` + `X-Robots-Tag: noindex`.
 */

/** @typedef {{ name: string, pass: boolean, detail: string }} CheckResult */

function extractJsonLd(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    try {
      blocks.push(JSON.parse(match[1]));
    } catch {
      // Not valid JSON — doesn't count as a LocalBusiness block either way.
    }
  }
  return blocks;
}

function hasLocalBusiness(blocks) {
  return blocks.some((block) => {
    if (typeof block !== 'object' || block === null) return false;
    const type = block['@type'];
    return type === 'LocalBusiness' || (Array.isArray(type) && type.includes('LocalBusiness'));
  });
}

/**
 * Live-mode assertions: the site is public and fully functional.
 * @param {string} baseUrl
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<CheckResult[]>}
 */
export async function verifyLive(baseUrl, fetchImpl = fetch) {
  const root = baseUrl.replace(/\/$/, '');
  const results = [];

  const homeRes = await fetchImpl(root);
  const html = await homeRes.text();

  results.push({
    name: 'home page returns 200',
    pass: homeRes.status === 200,
    detail: `status ${homeRes.status}`,
  });

  const robotsTag = homeRes.headers.get('x-robots-tag');
  results.push({
    name: 'no noindex robots tag',
    pass: !robotsTag || !/noindex/i.test(robotsTag),
    detail: robotsTag ? `X-Robots-Tag: ${robotsTag}` : 'header absent',
  });

  const jsonLd = extractJsonLd(html);
  results.push({
    name: 'LocalBusiness JSON-LD present',
    pass: hasLocalBusiness(jsonLd),
    detail:
      jsonLd.length > 0
        ? `found ${jsonLd.length} JSON-LD block(s), none LocalBusiness`
        : 'no JSON-LD script found',
  });

  for (const path of ['/sitemap-index.xml', '/robots.txt', '/thanks']) {
    const res = await fetchImpl(`${root}${path}`);
    results.push({
      name: `${path} reachable`,
      pass: res.status === 200,
      detail: `status ${res.status}`,
    });
  }

  return results;
}

/**
 * Preview-gate assertions: the site is closed by default, per middleware.ts.
 * @param {string} baseUrl
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<CheckResult[]>}
 */
export async function verifyGated(baseUrl, fetchImpl = fetch) {
  const root = baseUrl.replace(/\/$/, '');
  const res = await fetchImpl(root);
  const results = [];

  results.push({
    name: 'home page returns 401',
    pass: res.status === 401,
    detail: `status ${res.status}`,
  });

  const auth = res.headers.get('www-authenticate');
  results.push({
    name: 'WWW-Authenticate header present',
    pass: Boolean(auth),
    detail: auth ?? 'header absent',
  });

  const robotsTag = res.headers.get('x-robots-tag');
  results.push({
    name: 'noindex header present',
    pass: Boolean(robotsTag && /noindex/i.test(robotsTag)),
    detail: robotsTag ?? 'header absent',
  });

  return results;
}
