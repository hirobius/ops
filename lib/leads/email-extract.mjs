/**
 * lib/leads/email-extract.mjs — pull contact addresses out of a business's own
 * website. Pure: takes HTML strings, returns addresses. No network, no DB.
 *
 * Why crawl rather than buy
 * -------------------------
 * 1 lead of 263 has an email address. Google Business Profile has no email
 * field, so no Maps scraper returns one — Outscraper, Apify, SerpApi and
 * BrightData all hand back phone and website only. The B2B enrichment tier
 * (Hunter, Apollo, Clay) is built by crawling corporate domains and inferring
 * firstname@company patterns, which covers a 3-person plumbing outfit badly;
 * Apollo's own documentation says its SMB coverage is thin. This is a segment
 * problem, not a tooling problem, and the business's own site is the one place
 * the address reliably exists.
 *
 * What this module will NOT do, deliberately
 * ------------------------------------------
 * - No pattern GUESSING. `info@<domain>` is a fabrication until something
 *   observed says otherwise; the fabrication bans apply to a lead's contact
 *   details exactly as they apply to generated site copy. Every address
 *   returned here was literally present in fetched HTML.
 * - No sending. This module collects; `lib/outreach/guard.mjs` remains the only
 *   outbound path and it is untouched by this work.
 */

/** Addresses that are never a business contact, only site furniture. */
const JUNK_LOCALPARTS = new Set([
  'example',
  'test',
  'noreply',
  'no-reply',
  'donotreply',
  'do-not-reply',
  'your',
  'youremail',
  'name',
  'email',
  'user',
  'username',
  'sentry',
]);

const JUNK_DOMAINS = new Set([
  'example.com',
  'example.org',
  'domain.com',
  'yourdomain.com',
  'email.com',
  'sentry.io',
  'wixpress.com',
  'godaddy.com',
  'squarespace.com',
  'w3.org',
]);

/** Image/asset extensions that sneak through a naive address regex. */
const ASSET_TAIL = /\.(png|jpe?g|gif|svg|webp|css|js|woff2?|ico)$/i;

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const MAILTO_RE = /mailto:([^"'?\s>]+)/gi;

/**
 * Is this a plausible human-reachable business address?
 * @param {string} address
 * @returns {boolean}
 */
export function isUsableAddress(address) {
  if (typeof address !== 'string') return false;
  const email = address.trim().toLowerCase();
  if (!email || email.length > 254) return false;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return false;
  if (ASSET_TAIL.test(email)) return false;

  const [local, domain] = email.split('@');
  if (JUNK_LOCALPARTS.has(local)) return false;
  if (JUNK_DOMAINS.has(domain)) return false;
  // A hex-looking localpart is a tracking or build artifact, not a person.
  if (/^[0-9a-f]{16,}$/.test(local)) return false;
  return true;
}

/**
 * Extract every usable address from one HTML document.
 *
 * `mailto:` links rank above bare text: a mailto is markup the site author
 * wrote to be contacted at, whereas a bare address in body text is as likely to
 * belong to a supplier, a web designer's credit line, or a pasted testimonial.
 *
 * @param {string} html
 * @returns {{ address: string, source: 'mailto' | 'text' }[]} deduped, mailto first
 */
export function extractEmails(html) {
  if (typeof html !== 'string' || !html) return [];

  const seen = new Map();

  for (const m of html.matchAll(MAILTO_RE)) {
    let raw = m[1];
    try {
      raw = decodeURIComponent(raw);
    } catch {
      /* a malformed escape is not a reason to drop the address */
    }
    const address = raw.trim().toLowerCase();
    if (isUsableAddress(address) && !seen.has(address)) {
      seen.set(address, { address, source: 'mailto' });
    }
  }

  for (const m of html.matchAll(EMAIL_RE)) {
    const address = m[0].trim().toLowerCase();
    if (isUsableAddress(address) && !seen.has(address)) {
      seen.set(address, { address, source: 'text' });
    }
  }

  return [...seen.values()].sort((a, b) =>
    a.source === b.source ? 0 : a.source === 'mailto' ? -1 : 1,
  );
}

/**
 * Which address should become `leads.email`?
 *
 * Preference order, most to least defensible:
 *   1. a mailto on the business's OWN domain
 *   2. any mailto
 *   3. body text on the business's own domain
 *   4. any remaining address
 *
 * Own-domain matters because a webmaster's or supplier's address is common in
 * footers, and mailing the wrong party is worse than mailing nobody.
 *
 * @param {{address: string, source: string}[]} candidates
 * @param {string} [siteHost] the lead's website host, for own-domain matching
 * @returns {{ address: string, source: string, ownDomain: boolean } | null}
 */
export function pickBestAddress(candidates, siteHost) {
  const list = (candidates ?? []).filter((c) => c && isUsableAddress(c.address));
  if (!list.length) return null;

  const base = String(siteHost || '')
    .replace(/^www\./i, '')
    .toLowerCase();

  const scored = list.map((c) => {
    const domain = c.address.split('@')[1] || '';
    const ownDomain = Boolean(base) && (domain === base || domain.endsWith(`.${base}`));
    return { ...c, ownDomain };
  });

  const rank = (c) => (c.ownDomain ? 0 : 2) + (c.source === 'mailto' ? 0 : 1);
  scored.sort((a, b) => rank(a) - rank(b));
  return scored[0];
}

/**
 * Contact-page URLs worth trying when the homepage yields nothing. Small and
 * fixed on purpose: this is a targeted second look, not a site spider.
 *
 * @param {string} siteUrl
 * @returns {string[]}
 */
export function contactUrls(siteUrl) {
  let origin;
  try {
    origin = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`).origin;
  } catch {
    return [];
  }
  return ['/contact', '/contact-us', '/about', '/contact.html'].map((p) => `${origin}${p}`);
}
