/**
 * lib/tasks/budget.mjs — pure spend-ceiling logic for the fleet dispatcher
 * (issue #47, B.1 — the highest-priority gate: "fleet-dispatch + tier.mjs
 * route by tier but enforce no budget").
 *
 * Mines scripts/auto-assigner.mjs's still-live PRICE_PER_M_TOKENS + projected
 * cost idea, narrowed to the two models lib/tasks/tier.mjs ever routes to
 * (never haiku — see tier.mjs's module doc). These are ROUGH PROJECTIONS,
 * the same caveat auto-assigner carried: a pre-dispatch estimate from a
 * fixed per-tier token budget, not metered actual spend — this repo only
 * opens the `@claude` GitHub issue, it never sees the real token usage of
 * the session that picks it up. Treat the ceiling as "how much we're willing
 * to project-commit per run/day," not a hard accounting truth.
 *
 * No network, no Date — pure and unit-testable.
 */

export const PRICE_PER_M_TOKENS = { sonnet: 3.0, opus: 15.0 };

// Rough effort-per-tier token budget — mirrors auto-assigner's EFFORT_TOKENS
// (min/standard/high), mapped onto lib/tasks/tier.mjs's tier names.
const EFFORT_TOKENS = { mechanical: 2_000, standard: 8_000, judgment: 30_000 };

export const DEFAULT_PER_RUN_CEILING_USD = 5;
export const DEFAULT_DAILY_CEILING_USD = 25;

/**
 * Projected USD cost of dispatching one task at the given tier/model.
 * @param {'mechanical'|'standard'|'judgment'} tier
 * @param {'sonnet'|'opus'} model
 * @returns {number}
 */
export function projectedCostUsd(tier, model) {
  const price = PRICE_PER_M_TOKENS[model];
  if (price === undefined) throw new Error(`No price entry for model: ${model}`);
  const tokens = EFFORT_TOKENS[tier];
  if (tokens === undefined) throw new Error(`No effort-token entry for tier: ${tier}`);
  return Number(((price * tokens) / 1_000_000).toFixed(4));
}

/**
 * Pure: given routed dispatch candidates (in order) and how much has
 * already been spent today, keep taking candidates until either the
 * per-run ceiling or the daily ceiling (today's spend + this run's running
 * total) would be exceeded. This is cost-aware TRIMMING, not a hard error —
 * the caller still dispatches whatever DID fit and can report/log the rest.
 *
 * @param {Array<{task:object, tier:string, model:string}>} candidates
 * @param {{ dailySpentUsd?: number, perRunCeilingUsd?: number, dailyCeilingUsd?: number }} [opts]
 * @returns {{ affordable: Array, skipped: Array, runTotalUsd: number }}
 */
export function capByBudget(candidates, opts = {}) {
  const dailySpentUsd = Number.isFinite(opts.dailySpentUsd) ? opts.dailySpentUsd : 0;
  const perRunCeilingUsd = Number.isFinite(opts.perRunCeilingUsd)
    ? opts.perRunCeilingUsd
    : DEFAULT_PER_RUN_CEILING_USD;
  const dailyCeilingUsd = Number.isFinite(opts.dailyCeilingUsd)
    ? opts.dailyCeilingUsd
    : DEFAULT_DAILY_CEILING_USD;

  const affordable = [];
  const skipped = [];
  let runTotalUsd = 0;

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    const costUsd = projectedCostUsd(candidate.tier, candidate.model);
    const wouldRunTotal = Number((runTotalUsd + costUsd).toFixed(4));
    const wouldDailyTotal = Number((dailySpentUsd + wouldRunTotal).toFixed(4));

    if (wouldRunTotal > perRunCeilingUsd || wouldDailyTotal > dailyCeilingUsd) {
      skipped.push({ ...candidate, costUsd });
      continue;
    }
    runTotalUsd = wouldRunTotal;
    affordable.push({ ...candidate, costUsd });
  }

  return { affordable, skipped, runTotalUsd };
}
