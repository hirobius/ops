/**
 * lib/leads/rescore.mjs — recompute a stored `leads` row's score from columns
 * already in Supabase. Pure: no network, no client, no I/O.
 *
 * Why this exists
 * ---------------
 * `scoreProspect` had exactly two callers: the Outscraper normalizer (at ingest)
 * and audit-sites.mjs (custom domains only, after a PageSpeed audit). So when the
 * scoring thesis changed on 2026-09-15 (a3f698e — rank by likelihood to BUY, not
 * by need), every already-sourced lead kept its old-formula score with no way to
 * recompute short of re-paying Outscraper for data we already have.
 *
 * Everything the scorer needs is already on the row: site_presence, review_count,
 * operational, owner_verified, site_quality_score. This module is that recompute.
 *
 * It also backfills `site_presence`, because 14 of the first 263 rows carry NULL
 * there (sourced before migration 0005 added the column) and a NULL presence
 * scores as the `custom` fallback — the harshest bucket — which is wrong for a
 * business that simply has no website.
 */

import { classifySitePresence, scoreProspect } from '../../scripts/lib/outscraper-normalize.mjs';
import { QUALIFIED_LEAD_SCORE } from '../../scripts/lib/prospect-to-lead.mjs';

/**
 * Recompute one lead. Returns the patch plus what changed, so a caller can
 * report honestly and skip no-op writes.
 *
 * @param {Record<string, unknown>} lead a `leads` row
 * @returns {{
 *   id: unknown,
 *   patch: { lead_score: number, qualified: boolean, site_presence: string },
 *   before: { lead_score: number|null, qualified: boolean|null, site_presence: string|null },
 *   changed: boolean,
 *   presenceBackfilled: boolean
 * }}
 */
export function rescoreLead(lead) {
  const l = lead ?? {};

  // Backfill presence from the website column when it's missing. classifySitePresence
  // maps '' / null -> 'none', which is the correct reading of "no website recorded".
  const storedPresence =
    typeof l.site_presence === 'string' && l.site_presence ? l.site_presence : null;
  const presence = storedPresence ?? classifySitePresence(l.website ?? '');

  const lead_score = scoreProspect({
    sitePresence: presence,
    reviews: l.review_count ?? 0,
    // Both columns are nullable. Mirror the normalizer's own defaults rather than
    // inventing new ones: Google omits status for most operating listings, and an
    // unset owner_verified means "not verified", not "unknown".
    operational: l.operational !== false,
    ownerVerified: l.owner_verified === true,
    siteQualityScore: l.site_quality_score,
  });

  const qualified = lead_score >= QUALIFIED_LEAD_SCORE;

  const before = {
    lead_score: l.lead_score ?? null,
    qualified: l.qualified ?? null,
    site_presence: storedPresence,
  };

  return {
    id: l.id,
    patch: { lead_score, qualified, site_presence: presence },
    before,
    changed:
      before.lead_score !== lead_score ||
      before.qualified !== qualified ||
      before.site_presence !== presence,
    presenceBackfilled: storedPresence === null,
  };
}

/** Batch form. Order is preserved so a caller can zip results back to input rows. */
export function rescoreLeads(leads) {
  return (leads ?? []).map(rescoreLead);
}

/**
 * Roll a batch of results into the numbers a human actually wants to see before
 * approving a write: how many move, and how the qualified pool changes size.
 *
 * @param {ReturnType<typeof rescoreLead>[]} results
 */
export function summarizeRescore(results) {
  const rows = results ?? [];
  const qualifiedBefore = rows.filter((r) => r.before.qualified === true).length;
  const qualifiedAfter = rows.filter((r) => r.patch.qualified).length;
  return {
    total: rows.length,
    changed: rows.filter((r) => r.changed).length,
    presenceBackfilled: rows.filter((r) => r.presenceBackfilled).length,
    qualifiedBefore,
    qualifiedAfter,
    qualifiedDelta: qualifiedAfter - qualifiedBefore,
    // Leads that gained qualification and leads that lost it, separately — a net
    // delta of zero can still mean the whole pool was swapped out.
    gained: rows.filter((r) => r.patch.qualified && r.before.qualified !== true).length,
    lost: rows.filter((r) => !r.patch.qualified && r.before.qualified === true).length,
  };
}
