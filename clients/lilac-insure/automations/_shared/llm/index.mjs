/**
 * LLM adapter factory.
 *
 * Reads `llm.provider` from automation-config.json and returns an adapter with
 * a uniform interface so downstream workflows don't care which provider is in
 * use. Customer flips provider in their config; we never see their data.
 *
 * Common interface (every adapter implements):
 *
 *   await adapter.probe()
 *     → { ok: true, model, latencyMs } | throws on connectivity failure
 *
 *   await adapter.complete({ systemPrompt, userMessage, maxTokens, temperature, responseFormat })
 *     → { text, structured?, usage }
 *
 *   adapter.providerName
 *     → 'ollama' | 'claude' | 'none'
 *
 * `responseFormat: 'json'` requests JSON-mode where supported.
 *
 * The `none` adapter throws on `complete()` to force deterministic-only paths.
 * Use it when the customer wants zero LLM calls under any circumstance.
 */

import { ollamaAdapter } from './ollama.mjs';
import { claudeAdapter } from './claude.mjs';
import { noneAdapter } from './none.mjs';

export function getLlmAdapter(rootConfig) {
  const provider = rootConfig?.llm?.provider ?? 'none';
  switch (provider) {
    case 'ollama':  return ollamaAdapter(rootConfig.llm.ollama ?? {});
    case 'claude':  return claudeAdapter(rootConfig.llm.claude ?? {});
    case 'none':    return noneAdapter();
    default: throw new Error(`Unknown llm.provider: ${provider}. Expected ollama | claude | none.`);
  }
}
