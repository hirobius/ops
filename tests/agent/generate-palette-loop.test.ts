// @vitest-environment node
/**
 * tests/agent/generate-palette-loop.test.ts — ops#188.
 *
 * The palette checks only matter if generate() actually acts on them. A gate
 * that computes a verdict and returns the config anyway is decoration.
 *
 * These drive the real repair loop with a stubbed model: first attempt emits a
 * bad palette, second emits a good one, and we assert the loop regenerated AND
 * fed the specific reason back into the retry prompt.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callStructuredTool = vi.fn();
vi.mock('../../lib/agent/llm.mjs', () => ({
  callStructuredTool: (...args: unknown[]) => callStructuredTool(...args),
  MODELS: { strong: 'stub-strong', fast: 'stub-fast' },
}));

const { generate } = await import('../../lib/agent/generate.mjs');
const { PALETTE_PRESETS } = await import('../../lib/schema/presets.mjs');

const LEAD = {
  name: 'Violet Verge Landscaping',
  category: 'landscaping',
  city: 'Austin',
  region: 'TX',
  phone: '+1-555-0142',
  email: 'hi@violetverge.com',
};
const BRIEF = { summary: 'Landscaper.', suggestedPreset: 'landscaping', suggestedFont: 'system' };

const GOOD_PALETTE = {
  primary: '#7b2d8e', accent: '#e0a800', bg: '#fdfcff',
  fg: '#1a121d', muted: '#efe7f2', onPrimary: '#ffffff',
};
const p = PALETTE_PRESETS.landscaping;
const LAZY_PALETTE = {
  primary: p['--brand-primary'], accent: p['--brand-accent'], bg: p['--brand-bg'],
  fg: p['--brand-fg'], muted: p['--brand-muted'], onPrimary: p['--brand-on-primary'],
};

const content = (palette: Record<string, string>) => ({
  palettePreset: 'landscaping',
  palette,
  font: 'system',
  heroHeadline: 'Austin Landscaping',
  heroSub: 'Green all year.',
  ctaLabel: 'Get a Free Quote',
  about: 'Local and insured.',
  serviceAreas: ['Austin'],
  services: [{ title: 'Lawn care', description: 'We mow lawns.' }],
  reviews: [],
  seoTitle: 'Landscaping in Austin',
  seoDescription: 'Top-rated landscaping in Austin.',
});

beforeEach(() => callStructuredTool.mockReset());

describe('generate() palette gate', () => {
  it('regenerates when the agent echoes a stock preset, then succeeds', async () => {
    callStructuredTool
      .mockResolvedValueOnce(content(LAZY_PALETTE))
      .mockResolvedValueOnce(content(GOOD_PALETTE));

    const result = await generate(LEAD, BRIEF);

    expect(callStructuredTool).toHaveBeenCalledTimes(2);
    expect(result.attempts).toBe(2);
    expect(result.config.brand.cssVarOverrides['--brand-primary']).toBe('#7b2d8e');
  });

  it('tells the retry which preset it echoed', async () => {
    callStructuredTool
      .mockResolvedValueOnce(content(LAZY_PALETTE))
      .mockResolvedValueOnce(content(GOOD_PALETTE));

    await generate(LEAD, BRIEF);

    const retryPrompt = callStructuredTool.mock.calls[1][0].user as string;
    expect(retryPrompt).toMatch(/landscaping/);
    expect(retryPrompt).toMatch(/Fix these problems/);
  });

  it('regenerates on a sub-4.5:1 pair and names it', async () => {
    callStructuredTool
      .mockResolvedValueOnce(content({ ...GOOD_PALETTE, fg: '#cccccc', bg: '#ffffff' }))
      .mockResolvedValueOnce(content(GOOD_PALETTE));

    await generate(LEAD, BRIEF);

    const retryPrompt = callStructuredTool.mock.calls[1][0].user as string;
    expect(retryPrompt).toMatch(/fg\/bg/);
    expect(retryPrompt).toMatch(/4\.5/);
  });

  it('does not regenerate when the palette is already good', async () => {
    callStructuredTool.mockResolvedValueOnce(content(GOOD_PALETTE));
    const result = await generate(LEAD, BRIEF);
    expect(callStructuredTool).toHaveBeenCalledTimes(1);
    expect(result.attempts).toBe(1);
  });

  it('gives up after maxAttempts rather than shipping a lazy palette', async () => {
    callStructuredTool.mockResolvedValue(content(LAZY_PALETTE));
    await expect(generate(LEAD, BRIEF, { maxAttempts: 2 })).rejects.toThrow(/did not validate/i);
    expect(callStructuredTool).toHaveBeenCalledTimes(2);
  });
});
