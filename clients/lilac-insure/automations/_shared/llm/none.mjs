/**
 * Null adapter — refuses all LLM calls.
 *
 * Use when the customer wants the strongest possible privacy posture: no LLM
 * calls anywhere, ever. Workflows must rely entirely on deterministic paths
 * (classifier rules, regex, keyword matching).
 *
 * `complete()` throws to make accidental LLM dependencies fail loudly during
 * development, not silently in production.
 */

export function noneAdapter() {
  return {
    providerName: 'none',

    async probe() {
      return {
        ok: true,
        provider: 'none',
        note: 'LLM disabled — deterministic-only mode. No external calls will be made.',
      };
    },

    async complete() {
      throw new Error(
        'LLM provider is "none" — this workflow cannot run. ' +
        'Either enable an LLM in automation-config.json (provider: ollama | claude) or ' +
        'redesign the workflow to use deterministic paths only.',
      );
    },
  };
}
