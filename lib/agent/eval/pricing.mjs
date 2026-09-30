/**
 * lib/agent/eval/pricing.mjs — per-model token prices for the model eval (ops#7).
 *
 * The issue says "check current pricing before deciding — do not assume", so
 * these are copied from the live pricing page on the date below, not recalled.
 * Re-verify before trusting a verdict run long after that date: a price change
 * moves the cost check, and the cost check is half the decision.
 *
 * Cost is computed from the `usage` block each API call actually returned —
 * thinking tokens are billed as output, so a model that thinks by default
 * (Sonnet 5) pays for it here exactly as it would in production.
 *
 * @module agent/eval/pricing
 */

export const PRICING_SOURCE = {
  url: 'https://platform.claude.com/docs/en/about-claude/pricing',
  verifiedAt: '2026-09-16',
};

/**
 * USD per million tokens, first-party Claude API, global routing.
 * `cacheWrite` is the 5-minute ephemeral write — the only TTL lib/agent uses.
 */
const OPUS_TIER = { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
const HAIKU_4_5 = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 };

export const PRICES = {
  'claude-opus-4-8': OPUS_TIER,
  'claude-opus-5': OPUS_TIER,
  // $2/$10 was launch pricing; the page confirms it became the standard price
  // (the scheduled Sep 1 2026 rise to $3/$15 was cancelled).
  'claude-sonnet-5': { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
  'claude-haiku-4-5': HAIKU_4_5,
  'claude-haiku-4-5-20251001': HAIKU_4_5,
};

/**
 * @param {string} model
 * @returns {{ input: number, output: number, cacheWrite: number, cacheRead: number }}
 * @throws {Error} for a model with no verified price — never priced as free.
 */
export function priceFor(model) {
  const price = PRICES[model];
  if (!price) {
    throw new Error(
      `No verified price for model "${model}". Add it to lib/agent/eval/pricing.mjs from ` +
        `${PRICING_SOURCE.url} before running an eval that uses it.`,
    );
  }
  return price;
}

/**
 * USD cost of one API call's usage block.
 * @param {string} model
 * @param {{ input_tokens?: number, output_tokens?: number, cache_creation_input_tokens?: number|null, cache_read_input_tokens?: number|null }} usage
 * @returns {number}
 */
export function costOfUsage(model, usage) {
  const p = priceFor(model);
  const n = (v) => (typeof v === 'number' ? v : 0);
  return (
    (n(usage.input_tokens) * p.input +
      n(usage.output_tokens) * p.output +
      n(usage.cache_creation_input_tokens) * p.cacheWrite +
      n(usage.cache_read_input_tokens) * p.cacheRead) /
    1_000_000
  );
}
