/**
 * scripts/lib/site-audit.mjs — the 3rd score: "how badly does this business's
 * EXISTING website need a redesign" (the bad-site play, complementing the
 * no-site lead_score in outscraper-normalize.mjs).
 *
 * Pure + deterministic: takes a Google PageSpeed Insights v5 result (Google
 * fetches the prospect's site server-side, so this repo never has to reach an
 * arbitrary domain — see scripts/audit-sites.mjs for the network shell) and
 * derives a `siteQualityScore` (0–100, INVERSE: a worse site = higher
 * redesign-need = a better prospect) plus human-readable `issues` that double as
 * cold-outreach hooks ("your site scores 34/100 on mobile and isn't
 * mobile-friendly").
 *
 * Unit-tested against a checked-in PSI fixture (scripts/__tests__/site-audit.test.mjs).
 */

/** Clamp to an int in [0,100]. */
function clamp100(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** category score (0..1) or null if absent. */
function catScore(lhr, id) {
  const s = lhr?.categories?.[id]?.score;
  return typeof s === 'number' ? s : null;
}

/** audit score (0..1) or null; audits are pass(1)/fail(0)/n-a(null). */
function auditScore(lhr, id) {
  const s = lhr?.audits?.[id]?.score;
  return typeof s === 'number' ? s : null;
}

/**
 * Score one PageSpeed Insights v5 result.
 * @param {object} psi the full PSI response (expects `.lighthouseResult`)
 * @returns {{
 *   siteQualityScore: number, mobilePerf: number|null, seoScore: number|null,
 *   accessibilityScore: number|null, mobileFriendly: boolean, https: boolean,
 *   issues: string[], scored: boolean
 * }}
 */
export function scoreSiteFromPageSpeed(psi) {
  const lhr = psi?.lighthouseResult;
  if (!lhr || !lhr.categories) {
    // No usable Lighthouse data (site unreachable to Google, PSI error, etc.).
    // A site Google itself can't render is a strong redesign signal — but we
    // can't quantify it, so flag rather than fabricate a score.
    return {
      siteQualityScore: null,
      mobilePerf: null, seoScore: null, accessibilityScore: null,
      mobileFriendly: false, https: false, issues: ['PageSpeed could not analyze the site'],
      scored: false,
    };
  }

  const perf = catScore(lhr, 'performance'); // 0..1 mobile performance
  const seo = catScore(lhr, 'seo');
  const a11y = catScore(lhr, 'accessibility');

  const viewportPass = auditScore(lhr, 'viewport') === 1; // mobile viewport meta
  const fontPass = auditScore(lhr, 'font-size') !== 0; // legible mobile text (null=pass)
  const tapPass = auditScore(lhr, 'tap-targets') !== 0; // mobile tap targets
  const httpsPass = auditScore(lhr, 'is-on-https') !== 0; // null=assume ok
  const mobileFriendly = viewportPass && fontPass && tapPass;

  const issues = [];
  let need = 0;

  if (perf != null) {
    const p = Math.round(perf * 100);
    need += (1 - perf) * 40; // performance is the heaviest lever
    if (p < 50) issues.push(`mobile performance ${p}/100 (slow)`);
    else if (p < 75) issues.push(`mediocre mobile performance ${p}/100`);
  }
  if (!viewportPass) {
    need += 20;
    issues.push('not mobile-friendly (no responsive viewport)');
  } else if (!mobileFriendly) {
    need += 12;
    issues.push('mobile usability issues (tiny text / cramped tap targets)');
  }
  if (seo != null) {
    const s = Math.round(seo * 100);
    need += (1 - seo) * 20;
    if (s < 80) issues.push(`weak SEO (${s}/100)`);
  }
  if (!httpsPass) {
    need += 10;
    issues.push('not served over HTTPS');
  }
  if (a11y != null) {
    need += (1 - a11y) * 10;
  }

  return {
    siteQualityScore: clamp100(need),
    mobilePerf: perf == null ? null : Math.round(perf * 100),
    seoScore: seo == null ? null : Math.round(seo * 100),
    accessibilityScore: a11y == null ? null : Math.round(a11y * 100),
    mobileFriendly,
    https: httpsPass,
    issues,
    scored: true,
  };
}
