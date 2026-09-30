/**
 * lib/agent/eval/score.mjs — turn an eval run into verdicts (ops#7).
 *
 * The rules, so "switch if quality holds and cost drops" means one thing. The default
 * margins are Adrian's decision (2026-09-16, on #7): switch when the lower bound of the
 * 95% CI of (Sonnet − Opus) judged overall is ≥ −0.25 AND Sonnet's judge pass rate is no
 * lower than Opus's, plus the cost and reliability conditions. SWITCH_MARGINS holds
 * them; the CLI's --tolerance / --pass-tolerance override them for one run.
 *
 * GENERATION — a candidate arm replaces the baseline only if ALL hold:
 *   sample       ≥ MIN_PAIRS lead×trial samples judged in both arms, over ≥ MIN_LEADS leads
 *   quality      paired Δ judged overall (candidate − baseline) is non-inferior: the lower
 *                bound of its 95% CI ≥ −tolerance (default 0.25, on the 1–5 scale)
 *   pass-rate    the candidate's judge pass rate on those same paired samples is no lower
 *                than the baseline's, less passTolerance (default 0). A comparison of the
 *                two rates, not an interval: `pass` is what production regenerates on, so
 *                a candidate that passes fewer sites has not held quality
 *   reliability  model-output failure rate no higher than the baseline's
 *   cost         lower expected spend per PASSING site — (generate + reference judge) ÷
 *                pass rate, since production regenerates failing sites — even at the
 *                candidate's worst plausible pass rate (from the 95% CI of the per-lead
 *                pass-rate Δ)
 *
 * A check is true (holds), false (fails) or null (an interval straddles its margin — the
 * data can't tell yet; only quality and cost can be null). Verdict: too small a sample →
 * INCONCLUSIVE; any false → KEEP; any null → INCONCLUSIVE; else SWITCH.
 *
 * Why an interval for quality: with raw means and margin 0, two equally good models
 * split ~53/47 SWITCH/KEEP across re-runs of the same command. The unit of the interval
 * is the LEAD (trials of one lead are averaged first) — trials share the lead, so they
 * are not independent samples.
 *
 * JUDGE — a candidate judge replaces the reference only if ALL hold:
 *   sample ≥ MIN_PAIRS · pass/fail agreement ≥ 90% · mean |Δ overall| ≤ 0.5 ·
 *   zero candidate-judge failures · lower cost per judgement.
 * The judge is also the refine loop's gate, so disagreement on pass/fail is what
 * matters most: a lenient judge silently ships worse sites.
 *
 * @module agent/eval/score
 */

export const MIN_PAIRS = 10;
export const MIN_LEADS = 6;

/**
 * The default generation switch rule — Adrian's decision, 2026-09-16 (ops#7).
 * tolerance: how far below zero the lower bound of the 95% CI of Δ judged overall may
 * sit (1–5 scale). passTolerance: how far the candidate's pass rate may trail the
 * baseline's (0–1, so 0.1 = 10 points); 0 = no lower than the baseline's.
 */
export const SWITCH_MARGINS = Object.freeze({ tolerance: 0.25, passTolerance: 0 });
export const JUDGE_SWAP_THRESHOLDS = { minPassAgreement: 0.9, maxMeanAbsDelta: 0.5 };

const SCORE_KEYS = ['copyQuality', 'completeness', 'localSeo', 'toneFit'];
const EPSILON = 1e-9;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
const fmt = (n, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : 'n/a');
const signed = (n, digits = 2) => (Number.isFinite(n) && n > 0 ? '+' : '') + fmt(n, digits);
const bound = (n, digits = 2) => (Number.isFinite(n) ? signed(n, digits) : n > 0 ? '+∞' : '−∞');
const usd = (n) => (Number.isFinite(n) ? `$${n.toFixed(4)}` : 'n/a');

const armUnits = (result, arm) => result.units.filter((u) => u.arm === arm);
const failureRate = (summary) =>
  summary.attempted ? summary.generationErrors / summary.attempted : 0;
const isJudged = (u) => u.generation?.ok && u.judge?.ok;
const pairKey = (u) => `${u.leadIndex}:${u.trial}`;

/**
 * Two-sided 95% t critical values (the 0.975 quantile) for df 1–30; beyond that the
 * value for the largest tabulated df at or below it, which errs slightly wide.
 */
const T_975 = [
  12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145,
  2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048,
  2.045, 2.042,
];
const T_975_TAIL = [
  [40, 2.021],
  [60, 2.0],
  [120, 1.98],
];

function tCritical975(df) {
  if (df <= 30) return T_975[df - 1];
  let t = T_975[29];
  for (const [d, v] of T_975_TAIL) if (df >= d) t = v;
  return t;
}

/**
 * Mean with a two-sided 95% t confidence interval. Each value must be an independent
 * sample (here: one per lead). Fewer than two values → an unbounded interval.
 * @param {number[]} xs
 * @returns {{ n: number, mean: number, sd: number, se: number, low: number, high: number }}
 */
export function meanCI(xs) {
  const n = xs.length;
  const m = mean(xs);
  if (n < 2) return { n, mean: m, sd: NaN, se: NaN, low: -Infinity, high: Infinity };
  const sd = Math.sqrt(sum(xs.map((x) => (x - m) ** 2)) / (n - 1));
  const se = sd / Math.sqrt(n);
  const half = tCritical975(n - 1) * se;
  return { n, mean: m, sd, se, low: m - half, high: m + half };
}

/** true = not worse than −margin · false = worse than −margin · null = can't tell yet. */
function nonInferior(ci, margin) {
  if (ci.low + EPSILON >= -margin) return true;
  if (ci.high < -margin - EPSILON) return false;
  return null;
}

/** A margin as typed: 0.25 → "0.25", 0.1 × 100 → "10" (no float noise). */
const trimmed = (n) => String(Number(n.toFixed(4)));

/**
 * The generation switch rule in words — shared by the CLI plan and the report.
 * @param {{ tolerance?: number, passTolerance?: number }} [margins]
 * @returns {string}
 */
export function describeMargins({
  tolerance = SWITCH_MARGINS.tolerance,
  passTolerance = SWITCH_MARGINS.passTolerance,
} = {}) {
  const pass =
    passTolerance > 0
      ? `pass rate ≥ the baseline's − ${trimmed(passTolerance * 100)} pts`
      : "pass rate no lower than the baseline's";
  return `Δ overall 95% CI lower bound ≥ −${trimmed(tolerance)} · ${pass}`;
}

/**
 * Whether a run used the decided margins (SWITCH_MARGINS) rather than an override.
 * @param {{ tolerance?: number, passTolerance?: number }} [margins]
 */
export function isDecidedRule({
  tolerance = SWITCH_MARGINS.tolerance,
  passTolerance = SWITCH_MARGINS.passTolerance,
} = {}) {
  return (
    Math.abs(tolerance - SWITCH_MARGINS.tolerance) < EPSILON &&
    Math.abs(passTolerance - SWITCH_MARGINS.passTolerance) < EPSILON
  );
}

const decided = (ok, straddles = 'the margin') =>
  ok === null ? `undecided — the interval straddles ${straddles}` : ok ? 'holds' : 'fails';

function verdictOf(checks) {
  if (!checks.find((c) => c.name === 'sample').ok) return 'INCONCLUSIVE';
  if (checks.some((c) => c.ok === false)) return 'KEEP';
  if (checks.some((c) => c.ok === null)) return 'INCONCLUSIVE';
  return 'SWITCH';
}

/**
 * Expected spend per site that passes the judge. Production (lib/agent/pipeline.mjs)
 * runs rounds of one generate + one judge call and regenerates while the judge fails,
 * up to a cap of N rounds. At pass rate p (q = 1 − p) a lead costs round × (1 − q^N)/p
 * and ends passing with probability 1 − q^N, so spend per passing site is round / p
 * for any cap N. Assumes a regeneration passes at the first-pass rate: the eval
 * measures first passes only, and both arms get the same assumption.
 * @param {number} roundUsd  one generate (failed attempts included) + one reference-judge call
 * @param {number} passRate  0–1
 * @returns {number} Infinity when no site would pass, or nothing was measured
 */
export function costPerPassingSite(roundUsd, passRate) {
  return Number.isFinite(roundUsd) && passRate > 0 ? roundUsd / passRate : Infinity;
}

/** Aggregate one arm across every unit it attempted. */
export function summarizeArm(result, arm) {
  const units = armUnits(result, arm);
  const generated = units.filter((u) => u.generation?.ok);
  const judged = generated.filter((u) => u.judge?.ok);
  const spend = sum(units.map((u) => u.generation?.costUsd ?? 0));
  const costPerGeneratedUsd = generated.length ? spend / generated.length : Infinity;
  const passRate = mean(judged.map((u) => (u.judge.result.pass ? 1 : 0)));
  const referenceJudgeCostUsd = mean(judged.map((u) => u.judge.costUsd ?? 0));
  const roundCostUsd = costPerGeneratedUsd + referenceJudgeCostUsd;
  return {
    arm,
    attempted: units.length,
    generated: generated.length,
    generationErrors: units.length - generated.length,
    judged: judged.length,
    meanOverall: mean(judged.map((u) => u.judge.result.overall)),
    passRate,
    meanScores: Object.fromEntries(
      SCORE_KEYS.map((k) => [
        k,
        mean(judged.map((u) => u.judge.result.scores?.[k]).filter((v) => typeof v === 'number')),
      ]),
    ),
    meanAttempts: mean(generated.map((u) => u.generation.attempts)),
    generationSpendUsd: spend,
    costPerGeneratedUsd,
    referenceJudgeCostUsd,
    roundCostUsd,
    costPerPassingSiteUsd: costPerPassingSite(roundCostUsd, passRate),
    meanGenerationMs: mean(units.map((u) => u.generation?.ms ?? 0)),
  };
}

/**
 * Candidate generation arm vs the baseline arm, on paired lead×trial samples.
 * @param {{ units: object[] }} result
 * @param {string} baselineArm
 * @param {string} candidateArm
 * @param {{ tolerance?: number, passTolerance?: number, minPairs?: number, minLeads?: number }} [opts]
 *   tolerance: non-inferiority margin on the 95% CI of Δ judged overall (1–5 scale;
 *   default SWITCH_MARGINS.tolerance, 0.25);
 *   passTolerance: how far the candidate's pass rate may trail the baseline's (0–1, so
 *   0.1 = 10 points; default SWITCH_MARGINS.passTolerance, 0)
 */
export function compareArms(
  result,
  baselineArm,
  candidateArm,
  {
    tolerance = SWITCH_MARGINS.tolerance,
    passTolerance = SWITCH_MARGINS.passTolerance,
    minPairs = MIN_PAIRS,
    minLeads = MIN_LEADS,
  } = {},
) {
  const baseline = summarizeArm(result, baselineArm);
  const candidate = summarizeArm(result, candidateArm);

  const judgedByPair = (arm) =>
    new Map(
      armUnits(result, arm)
        .filter(isJudged)
        .map((u) => [pairKey(u), u]),
    );
  const b = judgedByPair(baselineArm);
  const c = judgedByPair(candidateArm);
  const keys = [...b.keys()].filter((k) => c.has(k));
  const overall = (m) => mean(keys.map((k) => m.get(k).judge.result.overall));
  const passRate = (m) => mean(keys.map((k) => (m.get(k).judge.result.pass ? 1 : 0)));

  // One Δ per lead: its trials averaged, so the interval counts leads, not repeats.
  const byLead = new Map();
  for (const k of keys) {
    const bu = b.get(k).judge.result;
    const cu = c.get(k).judge.result;
    const lead = b.get(k).leadIndex;
    const d = byLead.get(lead) ?? { overall: [], pass: [] };
    d.overall.push(cu.overall - bu.overall);
    d.pass.push((cu.pass ? 1 : 0) - (bu.pass ? 1 : 0));
    byLead.set(lead, d);
  }
  const perLead = [...byLead.values()];
  const quality = meanCI(perLead.map((d) => mean(d.overall)));
  const pass = meanCI(perLead.map((d) => mean(d.pass)));

  const baselineMeanOverall = overall(b);
  const candidateMeanOverall = overall(c);
  const baselinePassRate = passRate(b);
  const candidatePassRate = passRate(c);
  const qualityOk = nonInferior(quality, tolerance);
  // The decided rule compares the two paired rates, not an interval: equal rates earned
  // on different leads hold; one fewer passing site fails.
  const passOk = candidatePassRate + EPSILON >= baselinePassRate - passTolerance;
  const pts = (n) => (Number.isFinite(n) ? `${bound(n * 100, 0)}` : bound(n));

  // Cost per passing site hinges on the candidate's pass rate, which is as noisy as the
  // pass-rate check. Decide it across that interval: cheaper even at the candidate's
  // worst plausible pass rate → holds; dearer even at its best → fails; else undecided.
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const baselinePerPass = costPerPassingSite(baseline.roundCostUsd, baselinePassRate);
  const candidateAt = (p) => costPerPassingSite(candidate.roundCostUsd, clamp01(p));
  const candidateWorst = candidateAt(baselinePassRate + pass.low);
  const candidateBest = candidateAt(baselinePassRate + pass.high);
  const costOk =
    candidateWorst < baselinePerPass ? true : candidateBest >= baselinePerPass ? false : null;

  const checks = [
    {
      name: 'sample',
      ok: keys.length >= minPairs && byLead.size >= minLeads,
      detail: `${keys.length} paired lead×trial samples over ${byLead.size} leads judged in both arms (need ≥ ${minPairs} samples and ≥ ${minLeads} leads)`,
    },
    {
      name: 'quality',
      ok: qualityOk,
      detail:
        `Δ judged overall (candidate − baseline) ${signed(quality.mean)}, 95% CI [${bound(quality.low)}, ${bound(quality.high)}] over ${quality.n} leads; ` +
        `margin −${trimmed(tolerance)} → ${decided(qualityOk)} · means ${fmt(candidateMeanOverall)} vs baseline ${fmt(baselineMeanOverall)}`,
    },
    {
      name: 'pass-rate',
      ok: passOk,
      detail:
        `judge pass rate ${fmt(candidatePassRate * 100, 0)}% vs baseline ${fmt(baselinePassRate * 100, 0)}% on the same ${keys.length} samples; ` +
        `needs ${passTolerance > 0 ? `≥ baseline − ${trimmed(passTolerance * 100)} pts` : 'no lower than baseline'} → ${passOk ? 'holds' : 'fails'} · ` +
        `per-lead Δ ${pts(pass.mean)} pts, 95% CI [${pts(pass.low)}, ${pts(pass.high)}] pts (the range the cost check prices)`,
    },
    {
      name: 'reliability',
      // Rates, not counts: a run stopped at the spend ceiling can leave the arms with
      // slightly different numbers of attempts.
      ok: failureRate(candidate) <= failureRate(baseline) + EPSILON,
      detail: `failed generations ${candidate.generationErrors}/${candidate.attempted} vs baseline ${baseline.generationErrors}/${baseline.attempted}`,
    },
    {
      name: 'cost',
      ok: costOk,
      detail:
        `${usd(candidateAt(candidatePassRate))} vs baseline ${usd(baselinePerPass)} expected per passing site ` +
        `(one generate + one reference judge, ÷ pass rate: production regenerates failing sites); ` +
        `candidate ${usd(candidateBest)}–${usd(candidateWorst)} across the pass-rate CI → ${decided(costOk, "the baseline's cost")} · ` +
        `generation alone ${usd(candidate.costPerGeneratedUsd)} vs ${usd(baseline.costPerGeneratedUsd)}`,
    },
  ];

  return {
    baselineArm,
    candidateArm,
    verdict: verdictOf(checks),
    checks,
    pairs: keys.length,
    leads: byLead.size,
    tolerance,
    passTolerance,
    quality,
    passDelta: pass,
    baselineMeanOverall,
    candidateMeanOverall,
    deltaOverall: quality.mean,
    baselinePassRate,
    candidatePassRate,
    baselineErrors: baseline.generationErrors,
    candidateErrors: candidate.generationErrors,
    costRatio: candidate.costPerPassingSiteUsd / baseline.costPerPassingSiteUsd,
    generationCostRatio: candidate.costPerGeneratedUsd / baseline.costPerGeneratedUsd,
    baseline,
    candidate,
  };
}

/**
 * How closely a candidate judge agrees with the reference judge on the same configs.
 * @param {{ units: object[] }} result
 * @param {string} candidateArm  judge-candidate arm id (a key of each unit's `candidates`)
 * @param {{ minPairs?: number }} [opts]
 */
export function judgeAgreement(result, candidateArm, { minPairs = MIN_PAIRS } = {}) {
  const scored = result.units.filter((u) => isJudged(u) && u.candidates?.[candidateArm]);
  const pairs = scored.filter((u) => u.candidates[candidateArm].ok);
  const errors = scored.length - pairs.length;
  const deltas = pairs.map(
    (u) => u.candidates[candidateArm].result.overall - u.judge.result.overall,
  );

  const passAgreement = mean(
    pairs.map((u) => (u.candidates[candidateArm].result.pass === u.judge.result.pass ? 1 : 0)),
  );
  const meanAbsDelta = mean(deltas.map(Math.abs));
  const referenceCostUsd = mean(scored.map((u) => u.judge.costUsd ?? 0));
  const candidateCostUsd = mean(scored.map((u) => u.candidates[candidateArm].costUsd ?? 0));
  const { minPassAgreement, maxMeanAbsDelta } = JUDGE_SWAP_THRESHOLDS;

  const checks = [
    {
      name: 'sample',
      ok: pairs.length >= minPairs,
      detail: `${pairs.length} configs scored by both judges (need ≥ ${minPairs})`,
    },
    {
      name: 'agreement',
      ok: passAgreement + EPSILON >= minPassAgreement,
      detail: `pass/fail agreement ${fmt(passAgreement * 100, 0)}% (need ≥ ${minPassAgreement * 100}%)`,
    },
    {
      name: 'drift',
      ok: meanAbsDelta <= maxMeanAbsDelta + EPSILON,
      detail: `mean |Δ overall| ${fmt(meanAbsDelta)} (need ≤ ${maxMeanAbsDelta}); signed ${fmt(mean(deltas))} (positive = more lenient)`,
    },
    { name: 'reliability', ok: errors === 0, detail: `${errors} candidate-judge failures` },
    {
      name: 'cost',
      ok: candidateCostUsd < referenceCostUsd,
      detail: `${usd(candidateCostUsd)} vs reference ${usd(referenceCostUsd)} per judgement`,
    },
  ];

  return {
    candidateArm,
    verdict: verdictOf(checks),
    checks,
    pairs: pairs.length,
    errors,
    passAgreement,
    meanAbsDelta,
    meanSignedDelta: mean(deltas),
    referenceCostUsd,
    candidateCostUsd,
  };
}
