// @vitest-environment node
/**
 * tests/agent/model-eval-score.test.ts — ops#7.
 *
 * The verdict rule, written down as tests so "switch if quality holds and cost
 * drops" means one thing. From the issue's acceptance line: judged overall on
 * the same leads >= the production baseline, at lower cost. Two guards keep it
 * honest: a model that fails to produce valid configs more often has not "held
 * quality", and too few paired samples is INCONCLUSIVE rather than a coin flip.
 */
import { describe, it, expect } from 'vitest';
import { compareArms, judgeAgreement, summarizeArm } from '../../lib/agent/eval/score.mjs';
import { renderMarkdown } from '../../lib/agent/eval/report.mjs';

type UnitSpec = {
  overall?: number;
  pass?: boolean;
  cost?: number;
  ok?: boolean;
  candidate?: { overall: number; pass: boolean; cost?: number } | { error: string };
  refJudgeCost?: number;
};

function unit(leadIndex: number, arm: string, trial: number, spec: UnitSpec = {}) {
  const { overall = 4, pass = true, cost = 0.05, ok = true, candidate, refJudgeCost = 0.03 } = spec;
  return {
    leadIndex,
    arm,
    trial,
    generation: ok
      ? { ok: true, attempts: 1, costUsd: cost, tokens: {}, ms: 1000, stopReasons: ['tool_use'] }
      : { ok: false, error: 'boom', costUsd: cost, tokens: {}, ms: 1000, stopReasons: [] },
    judge: ok
      ? {
          ok: true,
          result: {
            overall,
            pass,
            scores: { copyQuality: 4, completeness: 4, localSeo: 4, toneFit: 4 },
          },
          costUsd: refJudgeCost,
        }
      : null,
    candidates:
      ok && candidate
        ? {
            'sonnet-5':
              'error' in candidate
                ? { ok: false, error: candidate.error, costUsd: 0.01 }
                : { ok: true, result: candidate, costUsd: candidate.cost ?? 0.012 },
          }
        : {},
  };
}

/** n paired leads, one trial each, baseline scored `b`, candidate scored `c`. */
function paired(n: number, b: UnitSpec, c: UnitSpec) {
  const units = [];
  for (let i = 0; i < n; i++) units.push(unit(i, 'opus-4-8', 1, b), unit(i, 'sonnet-5', 1, c));
  return { units, totalCostUsd: 1, aborted: false };
}

describe('compareArms', () => {
  it('SWITCH when judged quality holds and generation is cheaper', () => {
    const r = compareArms(
      paired(8, { overall: 4.0, cost: 0.06 }, { overall: 4.25, cost: 0.03 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('SWITCH');
    expect(r.pairs).toBe(8);
    expect(r.deltaOverall).toBeCloseTo(0.25);
    expect(r.costRatio).toBeCloseTo(0.5);
  });

  it('SWITCH on an exact tie in quality — the issue says ">= baseline"', () => {
    const r = compareArms(
      paired(6, { overall: 4, cost: 0.06 }, { overall: 4, cost: 0.03 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('SWITCH');
  });

  it('KEEP when judged quality drops, and says so', () => {
    const r = compareArms(
      paired(8, { overall: 4.5, cost: 0.06 }, { overall: 4.0, cost: 0.03 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('KEEP');
    expect(r.checks.find((c: { name: string }) => c.name === 'quality').ok).toBe(false);
  });

  it('honours an explicit noise tolerance on the quality check', () => {
    const data = paired(8, { overall: 4.5, cost: 0.06 }, { overall: 4.375, cost: 0.03 });
    expect(compareArms(data, 'opus-4-8', 'sonnet-5').verdict).toBe('KEEP');
    expect(compareArms(data, 'opus-4-8', 'sonnet-5', { tolerance: 0.125 }).verdict).toBe('SWITCH');
  });

  it('KEEP when it is not cheaper per successful generation', () => {
    const r = compareArms(
      paired(8, { overall: 4, cost: 0.03 }, { overall: 4.5, cost: 0.04 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('KEEP');
    expect(r.checks.find((c: { name: string }) => c.name === 'cost').ok).toBe(false);
  });

  it('KEEP when the candidate fails to generate more often, even if what it made scored well', () => {
    const data = paired(8, { overall: 4, cost: 0.06 }, { overall: 4.5, cost: 0.02 });
    data.units.push(
      unit(8, 'opus-4-8', 1, { cost: 0.06 }),
      unit(8, 'sonnet-5', 1, { ok: false, cost: 0.02 }),
    );
    const r = compareArms(data, 'opus-4-8', 'sonnet-5');
    expect(r.candidateErrors).toBe(1);
    expect(r.verdict).toBe('KEEP');
  });

  it('judges reliability on failure RATE, so a run stopped mid-pair is not skewed by unequal attempts', () => {
    // Baseline attempted 10 with 1 failure (10%); candidate attempted 9 with 1 (11%) → worse.
    const worse = paired(9, { cost: 0.06 }, { cost: 0.02 });
    worse.units.push(unit(9, 'opus-4-8', 1, { ok: false, cost: 0.06 }));
    worse.units[1] = unit(0, 'sonnet-5', 1, { ok: false, cost: 0.02 });
    expect(
      compareArms(worse, 'opus-4-8', 'sonnet-5').checks.find(
        (c: { name: string }) => c.name === 'reliability',
      ).ok,
    ).toBe(false);

    // Baseline 2 of 10 failed (20%); candidate 2 of 11 (18%) → not worse, though the count ties.
    const better = paired(10, { cost: 0.06 }, { cost: 0.02 });
    better.units[0] = unit(0, 'opus-4-8', 1, { ok: false, cost: 0.06 });
    better.units[2] = unit(1, 'opus-4-8', 1, { ok: false, cost: 0.06 });
    better.units[3] = unit(1, 'sonnet-5', 1, { ok: false, cost: 0.02 });
    better.units.push(unit(10, 'sonnet-5', 1, { ok: false, cost: 0.02 }));
    expect(
      compareArms(better, 'opus-4-8', 'sonnet-5').checks.find(
        (c: { name: string }) => c.name === 'reliability',
      ).ok,
    ).toBe(true);
  });

  it('prices failed attempts into cost per successful generation', () => {
    const data = paired(4, { cost: 0.06 }, { cost: 0.02 });
    data.units.push(unit(4, 'sonnet-5', 1, { ok: false, cost: 0.02 }));
    // 5 attempts × $0.02 over 4 successes.
    expect(summarizeArm(data, 'sonnet-5').costPerGeneratedUsd).toBeCloseTo(0.025);
  });

  it('INCONCLUSIVE below the minimum number of paired samples', () => {
    const r = compareArms(
      paired(3, { overall: 4, cost: 0.06 }, { overall: 5, cost: 0.01 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('INCONCLUSIVE');
  });

  it('compares quality only on leads both arms were judged on', () => {
    const data = paired(6, { overall: 4, cost: 0.06 }, { overall: 4, cost: 0.03 });
    // An extra baseline-only unit with a low score must not drag the baseline mean.
    data.units.push(unit(9, 'opus-4-8', 1, { overall: 1 }));
    const r = compareArms(data, 'opus-4-8', 'sonnet-5');
    expect(r.pairs).toBe(6);
    expect(r.baselineMeanOverall).toBe(4);
  });
});

describe('judgeAgreement', () => {
  it('measures pass agreement and score drift of a candidate judge against the reference', () => {
    const units = [
      unit(0, 'opus-4-8', 1, { overall: 4, pass: true, candidate: { overall: 4.5, pass: true } }),
      unit(1, 'opus-4-8', 1, { overall: 3, pass: false, candidate: { overall: 4, pass: true } }),
    ];
    const r = judgeAgreement({ units }, 'sonnet-5');
    expect(r.pairs).toBe(2);
    expect(r.passAgreement).toBe(0.5);
    expect(r.meanAbsDelta).toBeCloseTo(0.75);
    expect(r.meanSignedDelta).toBeCloseTo(0.75); // candidate is more lenient
    expect(r.verdict).toBe('INCONCLUSIVE'); // 2 pairs is too few to trust
  });

  it('SWITCH only when the cheaper judge agrees closely on enough samples', () => {
    const agree = Array.from({ length: 10 }, (_, i) =>
      unit(i, 'opus-4-8', 1, { overall: 4, pass: true, candidate: { overall: 4.25, pass: true } }),
    );
    expect(judgeAgreement({ units: agree }, 'sonnet-5').verdict).toBe('SWITCH');

    const drift = Array.from({ length: 10 }, (_, i) =>
      unit(i, 'opus-4-8', 1, { overall: 4, pass: true, candidate: { overall: 3, pass: i < 5 } }),
    );
    expect(judgeAgreement({ units: drift }, 'sonnet-5').verdict).toBe('KEEP');
  });

  it('counts candidate-judge failures and keeps the reference judge when any occur', () => {
    const units = Array.from({ length: 10 }, (_, i) =>
      unit(i, 'opus-4-8', 1, {
        candidate: i === 0 ? { error: 'no tool call' } : { overall: 4, pass: true },
      }),
    );
    const r = judgeAgreement({ units }, 'sonnet-5');
    expect(r.errors).toBe(1);
    expect(r.verdict).toBe('KEEP');
  });
});

describe('renderMarkdown', () => {
  it('leads with the verdicts and cites when prices were verified', () => {
    const data = {
      ...paired(
        8,
        { overall: 4, cost: 0.06, candidate: { overall: 4, pass: true } },
        { overall: 4.25, cost: 0.03 },
      ),
      startedAt: '2026-09-16T00:00:00.000Z',
      leads: Array.from({ length: 9 }, (_, i) => ({
        index: i,
        name: `L${i}`,
        category: 'landscaping',
        city: 'Boise',
        region: 'ID',
      })),
      options: {
        baseline: 'opus-4-8',
        arms: ['opus-4-8', 'sonnet-5'],
        judgeModel: 'claude-opus-4-8',
        judgeCandidates: ['sonnet-5'],
        trials: 1,
        maxUsd: 10,
        source: 'fixtures',
      },
      enrich: [],
    };
    const md = renderMarkdown(data);
    expect(md).toMatch(/sonnet-5.*SWITCH/);
    expect(md).toMatch(/2026-09-16/);
    expect(md).toMatch(/Judge swap/i);
  });
});
