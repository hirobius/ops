/**
 * lib/leads/gbp-gaps.mjs — Google Business Profile gaps as opening lines (ops#413).
 *
 * A stronger, cheaper outreach angle than the site-quality scorer: every GBP
 * field we already scrape is a column on `leads`, and nothing read them for
 * outreach until now. `deriveGbpGaps(lead)` is a pure, offline derivation —
 * no network calls, no LLM — over columns already on the row.
 *
 * THE TRAP THIS FILE EXISTS TO AVOID: a gap in OUR data is not a gap in
 * THEIR profile. `description` and `social` are deliberately NOT covered
 * here — `social` is empty for 263/263 live rows and `description` for
 * 195/263, both suspicious rates for genuine profile gaps rather than a
 * scraper coverage gap. They stay out until each is checked against a live
 * profile for at least 5 leads (see the issue) — telling an owner their
 * description is missing when it's visibly there ends the call.
 *
 * NULL vs never-scraped: a column can be NULL because Google Business
 * Profile genuinely has nothing there, or because our pipeline never wrote
 * to that column for this row (an old/legacy lead, or a partial ingest).
 * Reporting the second case as a gap is the same trap as description/social
 * above, just at the row level instead of the column level. We use
 * `lead_score` as the "this row went through GBP scoring" signal — it is
 * set by `prospectToLeadRow` (scripts/lib/prospect-to-lead.mjs) in the same
 * write as every other GBP-derived column (`hours`, `photos_count`,
 * `owner_verified`, `logo_url`, `rating`), so its presence means those
 * columns were actually populated (possibly with an empty/zero value),
 * not merely defaulted by a schema migration. `website` is the one
 * exception: it is written at base sourcing (migration 0001), independent
 * of GBP scoring, so "no website" is trustworthy even on a never-scored row.
 *
 * `photos_count` is the sharpest example of the NULL-vs-zero distinction the
 * issue calls out: NULL means never scraped (no gap), `0` means the row was
 * scraped and Google Business Profile genuinely has no photos (a gap).
 *
 * Ordered by strength (call-opener effectiveness, per triage): no website,
 * no hours, no photos, few photos, not owner-verified, no logo, low rating.
 *
 * @typedef {{ gap: string, evidence: string, line: string }} GbpGap
 */

const FEW_PHOTOS_MAX = 4;
const LOW_RATING_THRESHOLD = 4.3;

/** '' / null / undefined all count as blank. */
function isBlank(v) {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** True once the row has actually been through GBP scoring — see module doc. */
function wasGbpScraped(lead) {
  return lead.lead_score !== null && lead.lead_score !== undefined;
}

/** `hours` jsonb with no entries — an object or array with nothing in it. */
function isEmptyHours(hours) {
  if (Array.isArray(hours)) return hours.length === 0;
  if (hours && typeof hours === 'object') return Object.keys(hours).length === 0;
  return isBlank(hours);
}

/**
 * Derive this lead's Google Business Profile gaps, ordered strongest first.
 * Pure — no network calls. Never reports description or social gaps (see
 * module doc), and never reports a gap for a column that was never scraped.
 *
 * @param {Record<string, unknown>|null|undefined} lead a `leads` row (or a
 *   subset of it — only the columns below are read)
 * @returns {GbpGap[]}
 */
export function deriveGbpGaps(lead) {
  if (!lead || typeof lead !== 'object') return [];

  /** @type {GbpGap[]} */
  const gaps = [];
  const scraped = wasGbpScraped(lead);

  // 1. No website — sourced independently of GBP scoring, so this is
  //    trustworthy even on a lead that was never run through scoring.
  if (isBlank(lead.website)) {
    gaps.push({
      gap: 'no_website',
      evidence: 'website is empty',
      line:
        "Your business doesn't have a website linked on your Google listing — people who find you " +
        'there have nowhere to click through to.',
    });
  }

  if (scraped) {
    // 2. No hours listed — column populated but empty. NULL means never
    //    scraped, so it is excluded rather than treated as "no hours".
    if (lead.hours !== null && lead.hours !== undefined && isEmptyHours(lead.hours)) {
      gaps.push({
        gap: 'no_hours',
        evidence: 'hours has no entries',
        line:
          "Your Google listing doesn't show any hours — someone searching for you tonight can't tell " +
          "if you're even open.",
      });
    }

    // 3 & 4. Photos — NULL is never-scraped (no gap); 0 is a real gap.
    if (lead.photos_count !== null && lead.photos_count !== undefined) {
      const n = Number(lead.photos_count);
      if (Number.isFinite(n)) {
        if (n === 0) {
          gaps.push({
            gap: 'no_photos',
            evidence: 'photos_count is 0',
            line:
              "There isn't a single photo on your Google listing — people size up a business by that " +
              'gallery before they ever pick up the phone.',
          });
        } else if (n >= 1 && n <= FEW_PHOTOS_MAX) {
          gaps.push({
            gap: 'few_photos',
            evidence: `photos_count is ${n}`,
            line:
              `Your Google listing only has ${n} photo${n === 1 ? '' : 's'} — most people scroll past ` +
              'a listing that thin.',
          });
        }
      }
    }

    // 5. Not owner-verified — only an explicit false; null means unchecked.
    if (lead.owner_verified === false) {
      gaps.push({
        gap: 'not_owner_verified',
        evidence: 'owner_verified is false',
        line:
          "Your Google listing isn't verified as owner-managed — right now anyone could be the one " +
          'editing your hours and info.',
      });
    }

    // 6. No logo.
    if (isBlank(lead.logo_url)) {
      gaps.push({
        gap: 'no_logo',
        evidence: 'logo_url is empty',
        line: 'Your Google listing has no logo on it — it just shows a plain gray map pin.',
      });
    }

    // 7. Low rating — meaningless without at least one review on record.
    if (lead.rating !== null && lead.rating !== undefined) {
      const rating = Number(lead.rating);
      const reviewCount = Number(lead.review_count) || 0;
      if (Number.isFinite(rating) && rating < LOW_RATING_THRESHOLD && reviewCount > 0) {
        gaps.push({
          gap: 'low_rating',
          evidence: `rating is ${rating}`,
          line: `Your rating on Google is ${rating} — that's often enough to send someone to the next result instead.`,
        });
      }
    }
  }

  return gaps;
}

/** The lead's single strongest gap, or null if it has none — what the call
 * sheet shows as the opening line. */
export function strongestGbpGap(lead) {
  const gaps = deriveGbpGaps(lead);
  return gaps.length > 0 ? gaps[0] : null;
}
