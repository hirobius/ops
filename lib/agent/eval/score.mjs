/**
 * lib/agent/eval/score.mjs — turn an eval run into verdicts (ops#7).
 *
 * The rules, so "switch if quality holds and cost drops" means one thing:
 *
 * GENERATION — a candidate arm replaces the baseline only if ALL hold:
 *   sample       ≥ MIN_PAIRS lead×trial samples where both arms were judged
 *   quality      mean judged overall on those pairs ≥ baseline (− tolerance, default 0,
 *                which is the issue's literal "overall ≥ current baseline")
 *   reliability  no more failed generations than the baseline
 *   cost         lower spend per SUCCESSFUL generation (failed attempts count)
 * Too few pairs is INCONCLUSIVE, not a verdict.
 *
 * JUDGE — a candidate judge replaces the reference only if ALL hold:
 *   sample ≥ MIN_PAIRS · pass/fail agreement ≥ 90% · mean |Δ overall| ≤ 0.5 ·
 *   zero candidate-judge failures · lower cost per judgement.
 * The judge is also the refine loop's gate, so disagreement on pass/fail is what
 * matters most: a lenient judge silently ships worse sites.
 *
 * @module agent/eval/score
 */

export const MIN_PAIRS = 5;
export const JUDGE_SWAP_THRESHOLDS = { minPassAgreement: 0.9, maxMeanAbsDelta: 0.5 };

const SCORE_KEYS = ['copyQuality', 'completeness', 'localSeo', 'toneFit'];
const EPSILON = 1e-9;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : NaN);
const fmt = (n, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : 'n/a');
const usd = (n) => (Number.isFinite(n) ? `$${n.toFixed(4)}` : 'n/a');

const armUnits = (result, arm) => result.units.filter((u) => u.arm === arm && !u.skipped);
const isJudged = (u) => u.generation?.ok && u.judge?.ok;
const pairKey = (u) => `${u.leadIndex}:${u.trial}`;

function verdictOf(checks) {
  if (!checks.find((c) => c.name === 'sample').ok) return 'INCONCLUSIVE';
  return checks.every((c) => c.ok) ? 'SWITCH' : 'KEEP';
}

/** Aggregate one arm across every unit it attempted. */
export function summarizeArm(result, arm) {
  const units = armUnits(result, arm);
  const generated = units.filter((u) => u.generation?.ok);
  const judged = generated.filter((u) => u.judge?.ok);
  const spend = sum(units.map((u) => u.generation?.costUsd ?? 0));
  return {
    arm,
    attempted: units.length,
    generated: generated.length,
    generationErrors: units.length - generated.length,
    judged: judged.length,
    meanOverall: mean(judged.map((u) => u.judge.result.overall)),
    passRate: mean(judged.map((u) => (u.judge.result.pass ? 1 : 0))),
    meanScores: Object.fromEntries(
      SCORE_KEYS.map((k) => [
        k,
        mean(judged.map((u) => u.judge.result.scores?.[k]).filter((v) => typeof v === 'number')),
      ]),
    ),
    meanAttempts: mean(generated.map((u) => u.generation.attempts)),
    generationSpendUsd: spend,
    costPerGeneratedUsd: generated.length ? spend / generated.length : Infinity,
    meanGenerationMs: mean(units.map((u) => u.generation?.ms ?? 0)),
  };
}

/**
 * Candidate generation arm vs the baseline arm, on paired lead×trial samples.
 * @param {{ units: object[] }} result
 * @param {string} baselineArm
 * @param {string} candidateArm
 * @param {{ tolerance?: number, minPairs?: number }} [opts]
 */
export function compareArms(
  result,
  baselineArm,
  candidateArm,
  { tolerance = 0, minPairs = MIN_PAIRS } = {},
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

  const baselineMeanOverall = overall(b);
  const candidateMeanOverall = overall(c);

  const checks = [
    {
      name: 'sample',
      ok: keys.length >= minPairs,
      detail: `${keys.length} paired lead×trial samples judged in both arms (need ≥ ${minPairs})`,
    },
    {
      name: 'quality',
      ok: candidateMeanOverall + EPSILON >= baselineMeanOverall - tolerance,
      detail:
        `mean judged overall ${fmt(candidateMeanOverall)} vs baseline ${fmt(baselineMeanOverall)}` +
        (tolerance ? ` (tolerance ${tolerance})` : ''),
    },
    {
      name: 'reliability',
      ok: candidate.generationErrors <= baseline.generationErrors,
      detail: `failed generations ${candidate.generationErrors}/${candidate.attempted} vs baseline ${baseline.generationErrors}/${baseline.attempted}`,
    },
    {
      name: 'cost',
      ok: candidate.costPerGeneratedUsd < baseline.costPerGeneratedUsd,
      detail: `${usd(candidate.costPerGeneratedUsd)} vs baseline ${usd(baseline.costPerGeneratedUsd)} per successful generation`,
    },
  ];

  return {
    baselineArm,
    candidateArm,
    verdict: verdictOf(checks),
    checks,
    pairs: keys.length,
    tolerance,
    baselineMeanOverall,
    candidateMeanOverall,
    deltaOverall: candidateMeanOverall - baselineMeanOverall,
    baselinePassRate: passRate(b),
    candidatePassRate: passRate(c),
    baselineErrors: baseline.generationErrors,
    candidateErrors: candidate.generationErrors,
    costRatio: candidate.costPerGeneratedUsd / baseline.costPerGeneratedUsd,
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
  const scored = result.units.filter(
    (u) => !u.skipped && isJudged(u) && u.candidates?.[candidateArm],
  );
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
