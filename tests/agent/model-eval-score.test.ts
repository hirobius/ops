// @vitest-environment node
/**
 * tests/agent/model-eval-score.test.ts — ops#7.
 *
 * The verdict rule, written down as tests so "switch if quality holds and cost
 * drops" means one thing. From the issue's acceptance line: judged overall on
 * the same leads >= the production baseline, at lower cost. The guards that keep
 * it honest:
 *   - a model that fails to produce valid configs more often has not "held quality"
 *   - a model whose sites fail the judge's pass bar more often has not either, and
 *     the regenerations that failure triggers in production are part of its cost
 *   - quality is a confidence interval against a margin, not two raw means, so
 *     equally good models come out INCONCLUSIVE rather than as a coin flip
 */
import { describe, it, expect } from 'vitest';
import {
  MIN_LEADS,
  MIN_PAIRS,
  compareArms,
  costPerPassingSite,
  judgeAgreement,
  meanCI,
  summarizeArm,
} from '../../lib/agent/eval/score.mjs';
import { renderMarkdown } from '../../lib/agent/eval/report.mjs';

type UnitSpec = {
  overall?: number;
  pass?: boolean;
  cost?: number;
  ok?: boolean;
  error?: string;
  candidate?: { overall: number; pass: boolean; cost?: number } | { error: string };
  refJudgeCost?: number;
};
type Check = { name: string; ok: boolean | null; detail: string };

function unit(leadIndex: number, arm: string, trial: number, spec: UnitSpec = {}) {
  const {
    overall = 4,
    pass = true,
    cost = 0.05,
    ok = true,
    error = 'boom',
    candidate,
    refJudgeCost = 0.03,
  } = spec;
  return {
    leadIndex,
    arm,
    trial,
    generation: ok
      ? { ok: true, attempts: 1, costUsd: cost, tokens: {}, ms: 1000, stopReasons: ['tool_use'] }
      : { ok: false, error, costUsd: cost, tokens: {}, ms: 1000, stopReasons: [] },
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

/** leads × trials, with a per-sample spec for each arm. */
function grid(
  leads: number,
  trials: number,
  spec: (lead: number, trial: number) => { b: UnitSpec; c: UnitSpec },
) {
  const units = [];
  for (let t = 1; t <= trials; t++) {
    for (let i = 0; i < leads; i++) {
      const { b, c } = spec(i, t);
      units.push(unit(i, 'opus-4-8', t, b), unit(i, 'sonnet-5', t, c));
    }
  }
  return { units, totalCostUsd: 1, aborted: false };
}

const check = (r: { checks: Check[] }, name: string) => r.checks.find((c) => c.name === name)!;

/** Deterministic PRNG so the simulation test never flakes. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('compareArms', () => {
  it('SWITCH when judged quality holds and it is cheaper per passing site', () => {
    const r = compareArms(
      paired(12, { overall: 4.0, cost: 0.06 }, { overall: 4.25, cost: 0.03 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('SWITCH');
    expect(r.pairs).toBe(12);
    expect(r.deltaOverall).toBeCloseTo(0.25);
    // (generate + reference judge) per passing site: (0.03 + 0.03) vs (0.06 + 0.03).
    expect(r.costRatio).toBeCloseTo(2 / 3);
  });

  it('SWITCH on an exact tie in quality — the issue says ">= baseline"', () => {
    const r = compareArms(
      paired(10, { overall: 4, cost: 0.06 }, { overall: 4, cost: 0.03 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('SWITCH');
  });

  it('KEEP when judged quality drops, and says so', () => {
    const r = compareArms(
      paired(10, { overall: 4.5, cost: 0.06 }, { overall: 4.0, cost: 0.03 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('KEEP');
    expect(check(r, 'quality').ok).toBe(false);
  });

  it('honours an explicit non-inferiority margin on the quality check', () => {
    const data = paired(10, { overall: 4.5, cost: 0.06 }, { overall: 4.375, cost: 0.03 });
    expect(compareArms(data, 'opus-4-8', 'sonnet-5').verdict).toBe('KEEP');
    expect(compareArms(data, 'opus-4-8', 'sonnet-5', { tolerance: 0.125 }).verdict).toBe('SWITCH');
  });

  it('KEEP when it is not cheaper per passing site', () => {
    const r = compareArms(
      paired(10, { overall: 4, cost: 0.03 }, { overall: 4.5, cost: 0.04 }),
      'opus-4-8',
      'sonnet-5',
    );
    expect(r.verdict).toBe('KEEP');
    expect(check(r, 'cost').ok).toBe(false);
  });

  it('KEEP when the candidate fails to generate more often, even if what it made scored well', () => {
    const data = paired(10, { overall: 4, cost: 0.06 }, { overall: 4.5, cost: 0.02 });
    data.units.push(
      unit(10, 'opus-4-8', 1, { cost: 0.06 }),
      unit(10, 'sonnet-5', 1, { ok: false, cost: 0.02 }),
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
    expect(check(compareArms(worse, 'opus-4-8', 'sonnet-5'), 'reliability').ok).toBe(false);

    // Baseline 2 of 10 failed (20%); candidate 2 of 11 (18%) → not worse, though the count ties.
    const better = paired(10, { cost: 0.06 }, { cost: 0.02 });
    better.units[0] = unit(0, 'opus-4-8', 1, { ok: false, cost: 0.06 });
    better.units[2] = unit(1, 'opus-4-8', 1, { ok: false, cost: 0.06 });
    better.units[3] = unit(1, 'sonnet-5', 1, { ok: false, cost: 0.02 });
    better.units.push(unit(10, 'sonnet-5', 1, { ok: false, cost: 0.02 }));
    expect(check(compareArms(better, 'opus-4-8', 'sonnet-5'), 'reliability').ok).toBe(true);
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

describe('compareArms — the judge pass bar production regenerates on', () => {
  it("KEEP when the candidate's sites fail the judge, even with a higher mean score", () => {
    // Review probe: overall 4.25 but a sub-score below 3, so pass=false every time.
    const data = grid(8, 2, () => ({
      b: { overall: 4.0, pass: true, cost: 0.06 },
      c: { overall: 4.25, pass: false, cost: 0.03 },
    }));
    const r = compareArms(data, 'opus-4-8', 'sonnet-5');
    expect(r.candidatePassRate).toBe(0);
    expect(r.baselinePassRate).toBe(1);
    expect(check(r, 'pass-rate').ok).toBe(false);
    // No Sonnet site ever passes, so there is no finite cost per passing site.
    expect(r.candidate.costPerPassingSiteUsd).toBe(Infinity);
    expect(check(r, 'cost').ok).toBe(false);
    expect(r.verdict).toBe('KEEP');
  });

  it('prices the regenerations a lower pass rate causes into cost per passing site', () => {
    // Candidate generates at half the price but passes 2 in 10, so each passing site
    // costs five rounds of (generate + judge).
    const data = grid(10, 1, (i) => ({
      b: { overall: 4, pass: true, cost: 0.06 },
      c: { overall: 4, pass: i < 2, cost: 0.03 },
    }));
    const r = compareArms(data, 'opus-4-8', 'sonnet-5', { passTolerance: 1 });
    expect(r.candidate.costPerGeneratedUsd).toBeLessThan(r.baseline.costPerGeneratedUsd);
    expect(r.candidate.costPerPassingSiteUsd).toBeCloseTo(0.06 / 0.2);
    expect(r.baseline.costPerPassingSiteUsd).toBeCloseTo(0.09);
    expect(check(r, 'cost').ok).toBe(false);
    expect(r.verdict).toBe('KEEP');
  });

  it('summarizeArm prices generate + reference judge at the arm pass rate', () => {
    const data = grid(4, 1, (i) => ({
      b: {},
      c: { cost: 0.02, refJudgeCost: 0.03, pass: i % 2 === 0 },
    }));
    const s = summarizeArm(data, 'sonnet-5');
    expect(s.passRate).toBe(0.5);
    expect(s.referenceJudgeCostUsd).toBeCloseTo(0.03);
    expect(s.roundCostUsd).toBeCloseTo(0.05);
    expect(s.costPerPassingSiteUsd).toBeCloseTo(0.1);
  });
});

describe('costPerPassingSite', () => {
  it('divides one generate + judge round by the pass rate production regenerates on', () => {
    expect(costPerPassingSite(0.05, 1)).toBeCloseTo(0.05);
    expect(costPerPassingSite(0.05, 0.5)).toBeCloseTo(0.1);
  });

  it('is infinite when nothing passes or nothing was measured', () => {
    expect(costPerPassingSite(0.05, 0)).toBe(Infinity);
    expect(costPerPassingSite(0.05, NaN)).toBe(Infinity);
    expect(costPerPassingSite(Infinity, 1)).toBe(Infinity);
  });
});

describe('compareArms — confidence interval, not a coin flip', () => {
  it('meanCI gives a two-sided 95% t interval', () => {
    const ci = meanCI([1, 2, 3, 4, 5]);
    expect(ci.n).toBe(5);
    expect(ci.mean).toBe(3);
    expect(ci.sd).toBeCloseTo(Math.sqrt(2.5));
    // t(0.975, df 4) = 2.776
    expect(ci.low).toBeCloseTo(3 - 2.776 * Math.sqrt(0.5), 3);
    expect(ci.high).toBeCloseTo(3 + 2.776 * Math.sqrt(0.5), 3);
    const one = meanCI([4]);
    expect(one.low).toBe(-Infinity);
    expect(one.high).toBe(Infinity);
  });

  it('raises the minimum sample above the old 5 pairs', () => {
    expect(MIN_PAIRS).toBeGreaterThanOrEqual(10);
    expect(MIN_LEADS).toBeGreaterThanOrEqual(6);
  });

  it('INCONCLUSIVE when the interval straddles the margin; SWITCH once the margin clears it', () => {
    // Per-lead deltas alternate +0.25 / −0.25: mean 0, 95% CI about ±0.19.
    const data = grid(10, 1, (i) => ({
      b: { overall: 4, cost: 0.06 },
      c: { overall: i % 2 ? 4.25 : 3.75, cost: 0.03 },
    }));
    const strict = compareArms(data, 'opus-4-8', 'sonnet-5');
    expect(check(strict, 'quality').ok).toBeNull();
    expect(strict.verdict).toBe('INCONCLUSIVE');
    expect(strict.quality.low).toBeLessThan(0);
    expect(strict.quality.high).toBeGreaterThan(0);
    expect(check(strict, 'quality').detail).toMatch(/95% CI/);

    expect(compareArms(data, 'opus-4-8', 'sonnet-5', { tolerance: 0.25 }).verdict).toBe('SWITCH');
  });

  it('KEEP only when the whole interval sits below the margin', () => {
    // Per-lead deltas alternate −0.75 / −0.25: mean −0.5, 95% CI about [−0.69, −0.31].
    const data = grid(10, 1, (i) => ({
      b: { overall: 4.5, cost: 0.06 },
      c: { overall: i % 2 ? 3.75 : 4.25, cost: 0.03 },
    }));
    expect(compareArms(data, 'opus-4-8', 'sonnet-5').verdict).toBe('KEEP');
    // A 0.5 margin sits inside the interval — the data can't tell.
    expect(compareArms(data, 'opus-4-8', 'sonnet-5', { tolerance: 0.5 }).verdict).toBe(
      'INCONCLUSIVE',
    );
  });

  it('a definite failure on another check still means KEEP while quality is undecided', () => {
    const data = grid(10, 1, (i) => ({
      b: { overall: 4, cost: 0.03 },
      c: { overall: i % 2 ? 4.25 : 3.75, cost: 0.06 },
    }));
    const r = compareArms(data, 'opus-4-8', 'sonnet-5');
    expect(check(r, 'quality').ok).toBeNull();
    expect(check(r, 'cost').ok).toBe(false);
    expect(r.verdict).toBe('KEEP');
  });

  it('treats a lead, not a lead×trial, as the independent sample', () => {
    // 15 pairs, but only 3 leads: repeating trials does not buy leads.
    const data = grid(3, 5, () => ({
      b: { overall: 4, cost: 0.06 },
      c: { overall: 4, cost: 0.03 },
    }));
    const r = compareArms(data, 'opus-4-8', 'sonnet-5');
    expect(r.pairs).toBe(15);
    expect(r.leads).toBe(3);
    expect(r.verdict).toBe('INCONCLUSIVE');
    expect(check(r, 'sample').detail).toMatch(/3 leads/);
  });

  it('two equally good arms almost never come out SWITCH or KEEP by chance', () => {
    const rand = mulberry32(7);
    const score = () => 3.5 + rand(); // same distribution for both arms
    const tally = { SWITCH: 0, KEEP: 0, INCONCLUSIVE: 0 };
    const runs = 400;
    for (let run = 0; run < runs; run++) {
      const data = grid(8, 2, () => {
        const b = score();
        const c = score();
        return {
          b: { overall: b, pass: b >= 4, cost: 0.06 },
          c: { overall: c, pass: c >= 4, cost: 0.03 },
        };
      });
      tally[compareArms(data, 'opus-4-8', 'sonnet-5').verdict as keyof typeof tally]++;
    }
    // Was ~53% SWITCH / ~47% KEEP on raw means. A 95% interval puts each wrong call near 2.5%.
    expect(tally.SWITCH / runs).toBeLessThan(0.05);
    expect(tally.KEEP / runs).toBeLessThan(0.1);
    expect(tally.INCONCLUSIVE / runs).toBeGreaterThan(0.85);
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
    const units = Array.from({ length: 11 }, (_, i) =>
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
  const baseReport = (units: object[], leads: object[]) => ({
    units,
    totalCostUsd: 1,
    aborted: false,
    startedAt: '2026-09-16T00:00:00.000Z',
    leads,
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
  });

  it('leads with the verdicts, cites when prices were verified, and shows the interval', () => {
    const { units } = paired(
      10,
      { overall: 4, cost: 0.06, candidate: { overall: 4, pass: true } },
      { overall: 4.25, cost: 0.03 },
    );
    const leads = Array.from({ length: 10 }, (_, i) => ({
      index: i,
      name: `L${i}`,
      category: 'landscaping',
      city: 'Boise',
      region: 'ID',
    }));
    const md = renderMarkdown({
      ...baseReport(units, leads),
      pricing: { verifiedAt: '2026-09-16', url: 'https://example.test/pricing' },
    });
    expect(md).toMatch(/sonnet-5.*SWITCH/);
    expect(md).toMatch(/2026-09-16/);
    expect(md).toMatch(/Judge swap/i);
    expect(md).toMatch(/95% CI/);
    expect(md).toMatch(/per passing site/);
  });

  it('keeps business names and towns out — the report is pasted into a public issue', () => {
    const name = "Violet Verge's Landscaping";
    // generate() slugs the name and cuts the slug at 40 characters mid-word.
    const longName = 'Greater Treasure Valley Premium Landscaping and Snow Removal';
    const leads = [
      { index: 0, name, category: 'landscaping', city: 'Tinytown', region: 'TX' },
      { index: 1, name: longName, category: 'landscaping', city: 'Tinytown', region: 'TX' },
      ...Array.from({ length: 8 }, (_, i) => ({
        index: i + 2,
        name: `Other Biz ${i}`,
        category: 'junk removal',
        city: 'Tinytown',
        region: 'TX',
      })),
    ];
    const { units } = paired(10, { cost: 0.06 }, { cost: 0.03 });
    units.push(
      unit(0, 'sonnet-5', 2, {
        ok: false,
        error:
          'generate: config did not validate after 3 attempts.\nLast errors:\nInvalid client config for "violet-verge-s-landscaping":\n  • seo.title: too long',
      }),
      unit(1, 'sonnet-5', 2, {
        ok: false,
        error: `no tool call for VIOLET VERGE'S LANDSCAPING; Invalid client config for "greater-treasure-valley-premium-landscap"`,
      }),
    );
    const md = renderMarkdown(baseReport(units, leads));
    expect(md).not.toMatch(/violet/i);
    expect(md).not.toMatch(/treasure/i);
    expect(md).not.toMatch(/other biz/i);
    expect(md).not.toMatch(/Tinytown/);
    // What stays: the lead number, the trade and the state.
    expect(md).toMatch(/\| 0 \| landscaping \| TX \|/);
    expect(md).toMatch(/seo\.title: too long/);
  });
});
