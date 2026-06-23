/**
 * lib/agent — enrich → generate → judge pipeline (+ loop primitive).
 *
 * ⚠️ STUB IMPLEMENTATION. The real logic is ported from hirobius/clients
 * (`packages/agent/src/*`: llm, types, schemas, enrich, generate, judge, loop,
 * pipeline) and `packages/schema` (the `ClientConfig` contract + `defineClient`).
 * That source is not reachable from this session, so `runPipeline()` returns a
 * deterministic mock result. This lets the per-lead "Generate site" flow —
 * button → /api/generate-site → Supabase update → board — be exercised.
 *
 * TO GO LIVE: replace the body of `runPipeline()` with the ported pipeline
 * (enrich the business, generate a ClientConfig, judge it, loop until the judge
 * passes or the iteration cap is hit). Keep the input + result shape stable; the
 * route and `leads` columns depend on them. Reads ANTHROPIC_API_KEY from env.
 *
 * @typedef {Object} PipelineInput
 * @property {string}      name
 * @property {string|null} [city]
 * @property {string|null} [region]
 * @property {string|null} [category]
 * @property {string|null} [phone]
 * @property {string|null} [website]
 *
 * @typedef {Object} JudgeResult
 * @property {number}  overall   0–100 quality score
 * @property {boolean} pass
 * @property {string}  notes
 *
 * @typedef {Object} LoopResult
 * @property {number} iterations
 *
 * @typedef {Object} PipelineResult
 * @property {import('./enrich.mjs').Enrichment} enrichment  email/logo/social/description
 * @property {Record<string, unknown>} config   the generated ClientConfig
 * @property {JudgeResult}             judge
 * @property {LoopResult}              loop
 */

import { enrich } from './enrich.mjs';

/**
 * Run the enrich→generate→judge pipeline for a single lead.
 * @param {PipelineInput} input
 * @returns {Promise<PipelineResult>}
 */
export async function runPipeline(input) {
  const { name, city, region, category } = input;

  // 1. Enrich — fill fields Places can't supply (email, logo, socials, description).
  const enrichment = await enrich(input);

  // Deterministic pseudo-score so the board shows stable, varied values.
  const seed = hashString(`${name}|${city ?? ''}|${region ?? ''}`);
  const overall = 72 + (seed % 26); // 72–97
  const pass = overall >= 80;
  const iterations = pass ? 1 + (seed % 2) : 3;

  const config = {
    business: {
      name,
      city: city ?? null,
      region: region ?? null,
      category: category ?? null,
      email: enrichment.email,
      logo: enrichment.logo_url,
      social: enrichment.social,
    },
    theme: { palette: seed % 2 === 0 ? 'slate' : 'warm', layout: 'classic-local' },
    sections: ['hero', 'services', 'reviews', 'service-area', 'contact'],
    _stub: true, // marker — replace with the real generated ClientConfig
  };

  return {
    enrichment,
    config,
    judge: {
      overall,
      pass,
      notes: pass
        ? 'Stub judge: config meets the quality bar.'
        : 'Stub judge: below bar after max iterations — review before sending.',
    },
    loop: { iterations },
  };
}

/** @param {string} s */
function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
