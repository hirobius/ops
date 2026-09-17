// @vitest-environment node
/**
 * tests/agent/model-eval-run.test.ts — ops#7.
 *
 * The Sonnet 5 tiering decision is only as good as the harness that makes it.
 * These pin the properties the verdict leans on, with stub stages (no API):
 *   - cost comes from the usage each call really reported, at verified prices
 *   - generation is the ONLY variable: one brief per lead, one reference judge
 *   - failures are recorded per unit, never silently dropped
 *   - the spend ceiling actually stops the run
 *   - a bad key or model id stops the run loudly instead of logging 48 errors
 */
import { describe, it, expect, vi } from 'vitest';
import { costOfUsage, priceFor, PRICING_SOURCE } from '../../lib/agent/eval/pricing.mjs';
import {
  runModelEval,
  planEval,
  validateLeads,
  ARMS,
  DEFAULTS,
} from '../../lib/agent/eval/run.mjs';
import { FIXTURE_LEADS } from '../../lib/agent/eval/fixture-leads.mjs';
import { LeadSchema } from '../../lib/agent/types.mjs';
import { MODELS } from '../../lib/agent/llm.mjs';

type Usage = Record<string, number>;
type StageOpts = {
  model?: string;
  thinking?: unknown;
  onUsage?: (c: { model: string; usage: Usage; stopReason: string }) => void;
};

const USAGE: Usage = { input_tokens: 1000, output_tokens: 2000 };

const BRIEF = { summary: 's' };

function stubStages(overrides: Partial<Record<'enrich' | 'generate' | 'judge', unknown>> = {}) {
  const enrich = vi.fn(async (_lead: unknown, opts: StageOpts = {}) => {
    opts.onUsage?.({
      model: opts.model ?? 'claude-haiku-4-5',
      usage: USAGE,
      stopReason: 'tool_use',
    });
    return BRIEF;
  });
  const generate = vi.fn(async (_lead: unknown, _brief: unknown, opts: StageOpts = {}) => {
    opts.onUsage?.({ model: opts.model!, usage: USAGE, stopReason: 'tool_use' });
    return { config: { generatedBy: opts.model }, attempts: 1 };
  });
  const judge = vi.fn(
    async (_lead: unknown, config: { generatedBy: string }, opts: StageOpts = {}) => {
      opts.onUsage?.({ model: opts.model!, usage: USAGE, stopReason: 'tool_use' });
      const overall = config.generatedBy === 'claude-sonnet-5' ? 4.5 : 4;
      return { scores: {}, overall, pass: true, notes: '' };
    },
  );
  return { enrich, generate, judge, ...overrides };
}

const LEADS = [
  { name: 'A', category: 'landscaping', city: 'Boise', region: 'ID', photos: [] },
  { name: 'B', category: 'junk removal', city: 'Fresno', region: 'CA', photos: [] },
];

const baseOpts = {
  leads: LEADS,
  arms: ['opus-4-8', 'sonnet-5'],
  baseline: 'opus-4-8',
  judgeModel: 'claude-opus-4-8',
  judgeCandidates: ['sonnet-5'],
  trials: 2,
  maxUsd: 100,
  concurrency: 1,
};

describe('pricing', () => {
  it('prices every token class at the verified per-MTok rate', () => {
    const million = {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    };
    // Sonnet 5: $2 in, $10 out, $2.50 5-min cache write, $0.20 cache read.
    expect(costOfUsage('claude-sonnet-5', million)).toBeCloseTo(14.7, 6);
    // Opus 4.8: $5 in, $25 out — missing cache fields count as zero.
    expect(costOfUsage('claude-opus-4-8', { input_tokens: 1000, output_tokens: 2000 })).toBeCloseTo(
      0.055,
      6,
    );
  });

  it('prices the dated Haiku id the same as its alias', () => {
    expect(priceFor('claude-haiku-4-5-20251001')).toEqual(priceFor('claude-haiku-4-5'));
  });

  it('refuses to price an unknown model instead of counting it as free', () => {
    expect(() => priceFor('claude-mystery-9')).toThrow(/claude-mystery-9/);
    expect(() => priceFor('claude-mystery-9')).toThrow(PRICING_SOURCE.url);
  });
});

describe('fixture leads', () => {
  it('are all valid pipeline input and cover every palette preset trade', () => {
    expect(FIXTURE_LEADS.length).toBeGreaterThanOrEqual(8);
    for (const lead of FIXTURE_LEADS) expect(LeadSchema.safeParse(lead).success).toBe(true);
    const cats = FIXTURE_LEADS.map((l: { category: string }) => l.category).join(' ');
    for (const trade of ['landscap', 'junk', 'pressure', 'fenc']) expect(cats).toMatch(trade);
  });
});

describe('defaults', () => {
  it('baseline arm and reference judge are exactly what production runs today', () => {
    // If MODELS.strong changes, the baseline must move with it — otherwise the
    // eval compares candidates against a model production no longer uses.
    expect(ARMS[DEFAULTS.baseline].model).toBe(MODELS.strong);
    expect(ARMS[DEFAULTS.baseline].thinking).toBeUndefined();
    expect(DEFAULTS.judgeModel).toBe(MODELS.strong);
  });

  it('splits leads the pipeline would reject out, with the reason', () => {
    const { leads, rejected } = validateLeads([LEADS[0], { name: 'No Town', region: 'TX' }]);
    expect(leads).toHaveLength(1);
    expect(rejected).toEqual([
      expect.objectContaining({ index: 1, name: 'No Town', error: expect.stringMatching(/city/) }),
    ]);
  });
});

describe('planEval', () => {
  it('counts every call the run will make and gives a rough cost', () => {
    const plan = planEval(baseOpts);
    expect(plan.calls).toEqual({
      enrich: 2,
      generate: 8, // 2 leads × 2 arms × 2 trials
      referenceJudge: 8,
      candidateJudge: 8, // × 1 candidate
    });
    expect(plan.roughCostUsd).toBeGreaterThan(0);
  });
});

describe('runModelEval', () => {
  it('enriches each lead once and shares the brief across arms and trials', async () => {
    const stages = stubStages();
    await runModelEval({ ...baseOpts, stages });
    expect(stages.enrich).toHaveBeenCalledTimes(2);
    for (const call of stages.generate.mock.calls) expect(call[1]).toBe(BRIEF);
  });

  it('judges every arm with the same reference judge, then each candidate judge', async () => {
    const stages = stubStages();
    const result = await runModelEval({ ...baseOpts, stages });
    const judgeModels = stages.judge.mock.calls.map((c) => (c[2] as StageOpts).model);
    expect(judgeModels.filter((m) => m === 'claude-opus-4-8')).toHaveLength(8);
    expect(judgeModels.filter((m) => m === 'claude-sonnet-5')).toHaveLength(8);
    expect(result.units).toHaveLength(8);
    const sonnet = result.units.find((u: { arm: string }) => u.arm === 'sonnet-5');
    expect(sonnet.judge.result.overall).toBe(4.5);
    expect(sonnet.candidates['sonnet-5'].ok).toBe(true);
  });

  it("passes the arm's model and thinking setting to generation", async () => {
    const stages = stubStages();
    await runModelEval({ ...baseOpts, arms: ['opus-4-8', 'sonnet-5-no-thinking'], stages });
    const opts = stages.generate.mock.calls.map((c) => c[2] as StageOpts);
    expect(opts).toContainEqual(
      expect.objectContaining({ model: 'claude-sonnet-5', thinking: { type: 'disabled' } }),
    );
    expect(ARMS['opus-4-8'].thinking).toBeUndefined();
  });

  it('records measured cost per unit and in total', async () => {
    const result = await runModelEval({ ...baseOpts, stages: stubStages() });
    const opus = result.units.find((u: { arm: string }) => u.arm === 'opus-4-8');
    expect(opus.generation.costUsd).toBeCloseTo(costOfUsage('claude-opus-4-8', USAGE), 9);
    expect(opus.generation.tokens).toMatchObject({ input: 1000, output: 2000 });
    expect(result.totalCostUsd).toBeGreaterThan(opus.generation.costUsd);
  });

  it('records a failed generation on its unit and keeps going', async () => {
    const stages = stubStages();
    const realGenerate = stages.generate.getMockImplementation()!;
    stages.generate.mockImplementation(async (lead, brief, opts: StageOpts = {}) => {
      if (opts.model === 'claude-sonnet-5') {
        opts.onUsage?.({ model: opts.model, usage: USAGE, stopReason: 'max_tokens' });
        throw new Error('Model returned no tool call (stop_reason: max_tokens)');
      }
      return realGenerate(lead, brief, opts);
    });
    const result = await runModelEval({ ...baseOpts, stages });
    const failed = result.units.filter((u: { generation: { ok: boolean } }) => !u.generation.ok);
    expect(failed).toHaveLength(4);
    expect(failed[0].generation.error).toMatch(/max_tokens/);
    // The failed call was still billed, so it still counts.
    expect(failed[0].generation.costUsd).toBeGreaterThan(0);
    expect(failed[0].judge).toBeNull();
  });

  it('stops scheduling work once the spend ceiling is reached', async () => {
    const result = await runModelEval({ ...baseOpts, maxUsd: 0.1, stages: stubStages() });
    expect(result.aborted).toBe(true);
    expect(result.units.length).toBeLessThan(8);
  });

  it('fails loud and actionable on a rejected API key', async () => {
    const stages = stubStages({
      enrich: vi.fn(async () => {
        throw Object.assign(new Error('invalid x-api-key'), { status: 401 });
      }),
    });
    await expect(runModelEval({ ...baseOpts, stages })).rejects.toThrow(
      /ANTHROPIC_API_KEY.*console\.anthropic\.com\/settings\/keys/,
    );
  });

  it('fails loud on a model id the API does not know', async () => {
    const stages = stubStages();
    stages.generate.mockImplementation(async () => {
      throw Object.assign(new Error('model not found'), { status: 404 });
    });
    await expect(runModelEval({ ...baseOpts, stages })).rejects.toThrow(/claude-opus-4-8.*404/);
  });

  it('rejects an unknown arm before spending anything', async () => {
    const stages = stubStages();
    await expect(
      runModelEval({ ...baseOpts, arms: ['opus-4-8', 'gpt-9'], stages }),
    ).rejects.toThrow(/gpt-9/);
    expect(stages.enrich).not.toHaveBeenCalled();
  });
});
