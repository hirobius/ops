/**
 * lib/agent/loop — the refine-loop primitive.
 *
 * Vendored from hirobius/clients `packages/agent/src/loop.ts`, ported .ts → .mjs
 * (generic type params dropped; runtime unchanged).
 *
 * Captures the act → observe → decide cycle once: stopping conditions, feedback
 * incorporation, convergence detection, budgets, and a per-iteration trace. The
 * pipeline uses it for generate → judge → regenerate; the same primitive drives
 * any produce → evaluate → retry-with-feedback loop.
 *
 * @param {object} opts
 * @param {number} opts.maxIterations   hard ceiling — the primary budget control
 * @param {(feedback: string|undefined, iteration: number) => Promise<any>} opts.produce
 * @param {(value: any) => Promise<{ passed: boolean, score?: number, feedback: string }>} opts.evaluate
 * @param {number} [opts.minImprovement]  stop early if score gains less than this
 * @param {(trace: object) => void} [opts.onIteration]
 * @returns {Promise<{ value: any, iterations: number, converged: boolean, stopReason: 'converged'|'max_iterations'|'plateau', traces: object[] }>}
 */
export async function refineLoop(opts) {
  const traces = [];
  let feedback;
  let best;

  for (let i = 1; i <= opts.maxIterations; i++) {
    const start = Date.now();
    const output = await opts.produce(feedback, i);
    const verdict = await opts.evaluate(output);

    const trace = {
      iteration: i,
      output,
      score: verdict.score,
      passed: verdict.passed,
      feedback: verdict.feedback,
      ms: Date.now() - start,
    };
    traces.push(trace);
    opts.onIteration?.(trace);

    const score = verdict.score ?? 0;
    if (!best || score > best.score) best = { value: output, score };

    if (verdict.passed) {
      return { value: output, iterations: i, converged: true, stopReason: 'converged', traces };
    }

    // Convergence guard: bail if the model has stopped meaningfully improving.
    if (opts.minImprovement !== undefined && traces.length >= 2) {
      const prev = traces[traces.length - 2].score ?? 0;
      if (score - prev < opts.minImprovement) {
        return { value: best.value, iterations: i, converged: false, stopReason: 'plateau', traces };
      }
    }

    feedback = verdict.feedback;
  }

  return {
    value: best.value,
    iterations: traces.length,
    converged: false,
    stopReason: 'max_iterations',
    traces,
  };
}
