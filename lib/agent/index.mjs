/**
 * lib/agent — the AI pipeline that turns a lead into a validated ClientConfig,
 * with an LLM-as-judge quality gate.
 *
 * Vendored from hirobius/clients `packages/agent` (the canonical engine), ported
 * .ts → .mjs. The site schema is the render contract; lead-gen is the ingestion
 * source; this is the applied-AI layer (structured output, validate/repair,
 * LLM-as-judge eval, model tiering, prompt caching). Reads ANTHROPIC_API_KEY.
 *
 * Entry point: `runPipeline(lead, opts?)` → { lead, brief, config, judge, attempts, loop }.
 */
export { runPipeline } from './pipeline.mjs';
export { refineLoop } from './loop.mjs';
export { enrich } from './enrich.mjs';
export { generate } from './generate.mjs';
export { judge } from './judge.mjs';
export { MODELS } from './llm.mjs';
export * from './types.mjs';
