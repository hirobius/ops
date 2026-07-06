/**
 * lib/agent/judge — Stage 3: LLM-as-judge eval.
 *
 * Vendored from hirobius/clients `packages/agent/src/judge.ts`, ported .ts →
 * .mjs. A separate model call with an independent rubric scores the generated
 * config — a measurable quality gate that can trigger automatic regeneration.
 * Runs on the strong model.
 */
import { MODELS, callStructuredTool } from './llm.mjs';
import { JUDGE_SCHEMA } from './schemas.mjs';
import { JudgeResultSchema } from './types.mjs';

const SYSTEM = `You are a strict QA reviewer for local-business websites. Score the generated site content against the original lead. Be critical: reward concrete, locally-specific, conversion-oriented copy; penalize generic filler, fabricated facts, missing city references, and SEO-limit violations. "pass" is true only if overall >= 4 AND no individual score is below 3. Put specific, actionable fixes in notes so a regeneration pass can act on them.`;

/**
 * @param {import('./types.mjs').Lead} lead
 * @param {object} config   the generated ClientConfig
 * @returns {Promise<import('./types.mjs').JudgeResult>}
 */
export async function judge(lead, config) {
  const raw = await callStructuredTool({
    model: MODELS.strong,
    system: SYSTEM,
    user: [
      `Original lead:\n${JSON.stringify(lead, null, 2)}`,
      `Generated config:\n${JSON.stringify(config, null, 2)}`,
    ].join('\n\n'),
    toolName: 'record_evaluation',
    toolDescription: 'Record the quality evaluation scorecard.',
    inputSchema: JUDGE_SCHEMA,
    maxTokens: 1024,
    cacheSystem: true,
  });
  return JudgeResultSchema.parse(raw);
}
