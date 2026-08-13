/**
 * lib/agent/generate — a lead with no phone must assemble the fleet-standard
 * `(555) 010-0000` placeholder, which the re-synced NANP phone rule
 * (site-engine#100) accepts. The old `(000) 000-0000` stub fails validation on
 * a field the model can't repair, so generation would exhaust every attempt.
 * Mocks only the LLM boundary (`lib/agent/llm.mjs`).
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/agent/llm.mjs', () => ({
  MODELS: { strong: 'stub-model', fast: 'stub-model' },
  callStructuredTool: vi.fn(async () => ({
    palettePreset: 'pressure-washing',
    font: 'system',
    heroHeadline: 'Pressure Washing in Boise',
    heroSub: 'Fast, insured, guaranteed.',
    ctaLabel: 'Get a Free Quote',
    about: 'Locally owned and operated.',
    serviceAreas: ['Boise, ID'],
    services: [{ title: 'House Washing', description: 'Soft washing for siding.' }],
    reviews: [],
    seoTitle: 'Boise Pressure Washing Pros',
    seoDescription: 'Professional pressure washing in Boise, ID.',
  })),
}));

const { generate } = await import('../../lib/agent/generate.mjs');

describe('generate with a phone-less lead', () => {
  it('assembles the fleet-standard 555 placeholder and validates', async () => {
    const lead = { name: 'Boise Wash Co', category: 'Pressure washing', city: 'Boise', region: 'ID' };
    const brief = {
      summary: 'stub',
      suggestedPreset: 'pressure-washing',
      suggestedFont: 'system',
      likelyServices: ['House Washing'],
    };

    const { config, attempts } = await generate(lead, brief);

    expect(attempts).toBe(1);
    expect(config.business.phone).toBe('(555) 010-0000');
  });
});
