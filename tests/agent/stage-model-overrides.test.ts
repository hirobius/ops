// @vitest-environment node
/**
 * tests/agent/stage-model-overrides.test.ts — ops#7.
 *
 * The model eval varies ONE stage's model at a time (generation on Sonnet 5,
 * judge held on the production model), so each stage must accept a per-call
 * model. The defaults must stay the MODELS tiers — the production pipeline
 * passes nothing and must keep running exactly what it ran before.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callStructuredTool = vi.fn();
vi.mock('../../lib/agent/llm.mjs', () => ({
  callStructuredTool: (...args: unknown[]) => callStructuredTool(...args),
  MODELS: { strong: 'stub-strong', fast: 'stub-fast' },
}));

const { enrich } = await import('../../lib/agent/enrich.mjs');
const { generate } = await import('../../lib/agent/generate.mjs');
const { judge } = await import('../../lib/agent/judge.mjs');

const LEAD = {
  name: 'Violet Verge Landscaping',
  category: 'landscaping',
  city: 'Austin',
  region: 'TX',
  photos: [],
};

const BRIEF = {
  summary: 'Landscaper.',
  suggestedPreset: 'landscaping',
  suggestedFont: 'system',
  likelyServices: ['Lawn care'],
  trustSignals: ['local'],
  toneNotes: 'Friendly.',
};

const CONTENT = {
  palettePreset: 'landscaping',
  palette: {
    primary: '#7b2d8e',
    accent: '#e0a800',
    bg: '#fdfcff',
    fg: '#1a121d',
    muted: '#efe7f2',
    onPrimary: '#ffffff',
  },
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
};

const VERDICT = {
  scores: { copyQuality: 4, completeness: 4, localSeo: 4, toneFit: 4 },
  overall: 4,
  pass: true,
  notes: 'Fine.',
};

const lastCall = () => callStructuredTool.mock.calls.at(-1)?.[0];

beforeEach(() => callStructuredTool.mockReset());

describe('per-stage model overrides', () => {
  it('enrich defaults to the fast tier and honours an override', async () => {
    callStructuredTool.mockResolvedValue(BRIEF);
    await enrich(LEAD);
    expect(lastCall().model).toBe('stub-fast');

    const onUsage = vi.fn();
    await enrich(LEAD, { model: 'claude-haiku-4-5', onUsage });
    expect(lastCall()).toMatchObject({ model: 'claude-haiku-4-5', onUsage });
  });

  it('generate defaults to the strong tier and passes model, thinking and onUsage through', async () => {
    callStructuredTool.mockResolvedValue(CONTENT);
    await generate(LEAD, BRIEF);
    expect(lastCall().model).toBe('stub-strong');
    expect(lastCall().thinking).toBeUndefined();

    const onUsage = vi.fn();
    await generate(LEAD, BRIEF, {
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      onUsage,
    });
    expect(lastCall()).toMatchObject({
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      onUsage,
    });
  });

  it('judge defaults to the strong tier and honours an override', async () => {
    callStructuredTool.mockResolvedValue(VERDICT);
    await judge(LEAD, { slug: 'x' });
    expect(lastCall().model).toBe('stub-strong');

    const onUsage = vi.fn();
    await judge(LEAD, { slug: 'x' }, { model: 'claude-sonnet-5', onUsage });
    expect(lastCall()).toMatchObject({ model: 'claude-sonnet-5', onUsage });
  });
});
