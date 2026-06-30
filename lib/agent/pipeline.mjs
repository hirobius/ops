/**
 * lib/agent/pipeline — the agent: enrich → [ generate (validate/repair) → judge ]loop.
 *
 * Vendored from hirobius/clients `packages/agent/src/pipeline.ts`, ported .ts →
 * .mjs (interfaces + generics dropped; runtime unchanged).
 *
 * Two nested loops — loop engineering at two levels:
 *   • inner (generate.mjs): produce JSON → validate with Zod → repair on error
 *   • outer (here): produce config → judge with a rubric → regenerate on fail
 * A workflow, not an open-ended agent: the steps are known, only the iteration
 * count is dynamic.
 *
 * @typedef {Object} PipelineResult
 * @property {import('./types.mjs').Lead} lead
 * @property {import('./types.mjs').Brief} brief
 * @property {object} config   the validated ClientConfig
 * @property {import('./types.mjs').JudgeResult} judge
 * @property {number} attempts
 * @property {{ iterations: number, converged: boolean, stopReason: string, steps: object[] }} loop
 */
import { enrich } from './enrich.mjs';
import { generate } from './generate.mjs';
import { judge } from './judge.mjs';
import { refineLoop } from './loop.mjs';
import { LeadSchema } from './types.mjs';

/**
 * @param {unknown} input   a raw lead (validated by LeadSchema)
 * @param {{ maxIterations?: number, minImprovement?: number, onStep?: (step: string, detail?: string) => void }} [opts]
 * @returns {Promise<PipelineResult>}
 */
export async function runPipeline(input, opts = {}) {
  const lead = LeadSchema.parse(input);
  const log = opts.onStep ?? (() => {});

  log('enrich', lead.name);
  const brief = await enrich(lead);

  // Capture each iteration's judge verdict + attempt count alongside the loop.
  const verdicts = [];
  let attempts = 0;

  const result = await refineLoop({
    maxIterations: 1 + (opts.maxIterations ?? 1),
    minImprovement: opts.minImprovement,
    produce: async (feedback, iteration) => {
      log(iteration === 1 ? 'generate' : 'regenerate', feedback ? 'applying eval feedback' : undefined);
      const r = await generate(lead, brief, feedback ? { feedback } : {});
      attempts += r.attempts;
      return r;
    },
    evaluate: async (r) => {
      log('judge');
      const verdict = await judge(lead, r.config);
      verdicts.push(verdict);
      return { passed: verdict.pass, score: verdict.overall, feedback: verdict.notes };
    },
    onIteration: (t) =>
      log('iteration', `#${t.iteration} → ${t.score}/5 ${t.passed ? 'PASS' : 'FAIL'} (${t.ms}ms)`),
  });

  return {
    lead,
    brief,
    config: result.value.config,
    judge: verdicts[verdicts.length - 1],
    attempts,
    loop: {
      iterations: result.iterations,
      converged: result.converged,
      stopReason: result.stopReason,
      steps: result.traces.map((t) => ({ iteration: t.iteration, score: t.score, passed: t.passed, ms: t.ms })),
    },
  };
}
