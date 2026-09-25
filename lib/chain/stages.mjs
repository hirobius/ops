/**
 * lib/chain/stages.mjs — the eight links from lead to paid site.
 *
 * This file declares STRUCTURE only: what each stage is called, which funnel
 * count proves it, which env vars it cannot run without, and which issues move
 * it. It deliberately holds no judgement — no "60% built", no "this one is
 * broken". Those are derived in `evidence.mjs` from the live funnel counts and
 * the live env, because a hand-authored verdict is exactly the thing that goes
 * stale without anyone noticing.
 *
 * It replaced a hand-written version on 2026-09-15, which by then claimed
 * migration 0007 was unapplied (it was applied), that generation had never run
 * on a real lead (three configs existed), and that publish was the break (two
 * sites were deployed; the real first-zero was outreach).
 *
 * `metric` keys match lib/supabase/leads.mjs::leadFunnel. Order IS the funnel,
 * and each stage's count MUST be a subset of the one before it — that nesting is
 * what lets the break be computed rather than asserted. Only stages every lead
 * has to pass through belong here: the site-quality audit is a side-branch
 * (leads reach generation without it), so counting it as a link made an
 * unrun enrichment look like a severed chain. It rides on stage 3's note.
 */

/**
 * @typedef {object} ChainStage
 * @property {number} n 1-based position; the order carries the dependency.
 * @property {string} name
 * @property {string} metric key into the funnel counts — the proof this stage ran
 * @property {string} unit what one unit of this stage's count IS, for the UI
 * @property {string[]} envKeys env vars without which this stage cannot run
 * @property {string[]} [optionalEnvKeys] env vars that sharpen the stage but never block it
 * @property {number[]} issues hirobius/ops issues that move this stage
 * @property {string} note what this stage does — descriptive, never a verdict
 */

/** @type {readonly ChainStage[]} */
export const STAGES = [
  {
    n: 1,
    name: 'Find leads',
    metric: 'sourced',
    unit: 'leads sourced',
    envKeys: ['OUTSCRAPER_API_KEY'],
    issues: [],
    note: 'Outscraper pulls local businesses into the leads table.',
  },
  {
    n: 2,
    name: 'Score them',
    metric: 'scored',
    unit: 'scored',
    envKeys: [],
    issues: [],
    note: 'lead_score + build_score; qualified at ≥60.',
  },
  {
    n: 3,
    name: 'Qualify them',
    metric: 'qualified',
    unit: 'qualified',
    envKeys: [],
    issues: [],
    optionalEnvKeys: ['PAGESPEED_API_KEY'],
    note: 'Score ≥60. The site-quality audit sharpens it when it can run.',
  },
  {
    n: 4,
    name: 'Generate a site',
    metric: 'generated',
    unit: 'configs built',
    envKeys: ['ANTHROPIC_API_KEY'],
    issues: [186, 188, 191, 196],
    note: 'enrich → generate → judge, emitting a client.config.ts.',
  },
  {
    n: 5,
    name: 'Publish it',
    metric: 'published',
    unit: 'preview URLs',
    envKeys: [],
    issues: [187, 309],
    note: 'Config → a deployed site. Astro factory; the Duda path is retired.',
  },
  {
    n: 6,
    name: 'Cold email',
    metric: 'contacted',
    unit: 'contacted',
    envKeys: ['SMARTLEAD_API_KEY', 'SMARTLEAD_CAMPAIGN_ID'],
    issues: [9, 35, 38, 27],
    note: 'Send the preview. The compliance issues below must close before a scaled send.',
  },
  {
    n: 7,
    name: 'Get a reply',
    metric: 'replied',
    unit: 'replied',
    envKeys: [],
    issues: [],
    note: 'Reply tracking on the lead row (replied_at).',
  },
  {
    n: 8,
    name: 'Win the deal',
    metric: 'won',
    unit: 'won',
    envKeys: ['STRIPE_SECRET_KEY'],
    issues: [200],
    note: 'A lead marked won (won_at). Payment is not read from Stripe here.',
  },
];

/** Every env var any stage names — the set the server reports presence for. */
export const CHAIN_ENV_KEYS = [
  ...new Set(STAGES.flatMap((s) => [...s.envKeys, ...(s.optionalEnvKeys ?? [])])),
];
