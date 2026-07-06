/**
 * lib/agent/enrich — Stage 1: turn a sparse lead into a normalized brief.
 *
 * Vendored from hirobius/clients `packages/agent/src/enrich.ts`, ported .ts →
 * .mjs. Runs on the fast/cheap model — high-volume, low-stakes work.
 *
 * (Replaces the previous contact-enrichment stub: email/logo/socials now arrive
 * at sourcing time from Outscraper, so the pipeline's enrich is purely the
 * marketing brief, matching the canonical clients pipeline.)
 */
import { MODELS, callStructuredTool } from './llm.mjs';
import { BRIEF_SCHEMA } from './schemas.mjs';
import { BriefSchema } from './types.mjs';

const SYSTEM = `You are a local-marketing analyst. Given a raw business lead, produce a concise brief that a copywriter will use to build a one-page website. Pick the closest visual preset and an appropriate font. Never invent facts not supported by the lead — infer only what's reasonable for the trade.`;

/**
 * @param {import('./types.mjs').Lead} lead
 * @returns {Promise<import('./types.mjs').Brief>}
 */
export async function enrich(lead) {
  const raw = await callStructuredTool({
    model: MODELS.fast,
    system: SYSTEM,
    user: `Lead:\n${JSON.stringify(lead, null, 2)}`,
    toolName: 'record_brief',
    toolDescription: 'Record the structured brief for this business.',
    inputSchema: BRIEF_SCHEMA,
    maxTokens: 1024,
  });
  // Zod is the contract — parse() throws on anything the model got wrong.
  return BriefSchema.parse(raw);
}
