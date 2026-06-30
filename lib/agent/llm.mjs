/**
 * lib/agent/llm — model tiering + structured output via forced tool use.
 *
 * Vendored from hirobius/clients `packages/agent/src/llm.ts`, ported .ts → .mjs.
 *
 * `strong` (Opus) for generation + judging where quality matters; `fast` (Haiku)
 * for cheap, high-volume enrichment. Reads ANTHROPIC_API_KEY from env.
 */
import Anthropic from '@anthropic-ai/sdk';

export const MODELS = {
  strong: 'claude-opus-4-8',
  fast: 'claude-haiku-4-5',
};

/** Reads ANTHROPIC_API_KEY from the env. */
export const anthropic = new Anthropic();

/**
 * Structured output via forced tool use. One tool whose `input_schema` is the
 * shape we want + `tool_choice` pinned to it, so the model MUST return matching
 * arguments. The returned `input` is parsed JSON — the caller validates it with
 * Zod (Zod is the real contract; the JSON schema just shapes the output).
 *
 * @param {object} opts
 * @param {string} opts.model
 * @param {string} opts.system
 * @param {string} opts.user
 * @param {string} opts.toolName
 * @param {string} opts.toolDescription
 * @param {object} opts.inputSchema   JSON Schema the model must fill
 * @param {number} [opts.maxTokens]
 * @param {boolean} [opts.cacheSystem]  cache the (stable, large) system prompt
 * @returns {Promise<unknown>}
 */
export async function callStructuredTool({
  model,
  system,
  user,
  toolName,
  toolDescription,
  inputSchema,
  maxTokens = 4096,
  cacheSystem = false,
}) {
  const response = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system: cacheSystem
      ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
      : system,
    tools: [{ name: toolName, description: toolDescription, input_schema: inputSchema }],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: user }],
  });

  const toolUse = response.content.find((block) => block.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') {
    throw new Error(`Model returned no tool call (stop_reason: ${response.stop_reason})`);
  }
  return toolUse.input;
}
