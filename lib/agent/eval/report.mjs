/**
 * lib/agent/eval/report.mjs — render an eval run as a markdown decision record (ops#7).
 *
 * Verdicts first, then the evidence behind each check, then per-lead detail and
 * every failure verbatim — so "keep and document why" is this file, pasted.
 *
 * @module agent/eval/report
 */
import {
  MIN_PAIRS,
  JUDGE_SWAP_THRESHOLDS,
  compareArms,
  judgeAgreement,
  summarizeArm,
} from './score.mjs';

const fmt = (n, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : 'n/a');
const pct = (n) => (Number.isFinite(n) ? `${Math.round(n * 100)}%` : 'n/a');
const usd = (n, digits = 4) => (Number.isFinite(n) ? `$${n.toFixed(digits)}` : 'n/a');
const oneLine = (s, max = 240) => {
  const flat = String(s).replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
};
const box = (ok) => (ok ? '[x]' : '[ ]');

/**
 * @param {object} result  the object runModelEval returns (plus `options.source`, set by the CLI)
 * @param {{ tolerance?: number }} [opts]
 * @returns {string}
 */
export function renderMarkdown(result, { tolerance = 0 } = {}) {
  const o = result.options;
  const candidates = o.arms.filter((a) => a !== o.baseline);
  const comparisons = candidates.map((arm) => compareArms(result, o.baseline, arm, { tolerance }));
  const agreements = (o.judgeCandidates ?? []).map((arm) => judgeAgreement(result, arm));
  const modelOf = (id) => result.arms?.[id]?.model ?? id;
  const out = [];

  out.push('# lib/agent model-tiering eval (ops#7)', '');
  out.push(
    `Run ${result.startedAt} · leads: ${o.source ?? 'n/a'} (${result.leads.length}) · trials: ${o.trials} · ` +
      `spend ${usd(result.totalCostUsd, 2)} of the ${usd(o.maxUsd, 2)} ceiling`,
  );
  if (result.pricing) {
    out.push(`Prices verified ${result.pricing.verifiedAt} from ${result.pricing.url}.`);
  }
  if (result.aborted) {
    out.push(
      '',
      `> **Stopped early — ${result.abortReason}.** Verdicts below cover only the work that ran.`,
    );
  }

  out.push(
    '',
    '## Verdicts',
    '',
    '| Stage | Candidate | Against | Verdict |',
    '| --- | --- | --- | --- |',
  );
  for (const c of comparisons) {
    out.push(
      `| generate | ${c.candidateArm} (\`${modelOf(c.candidateArm)}\`) | ${o.baseline} (\`${modelOf(o.baseline)}\`) | **${c.verdict}** |`,
    );
  }
  for (const a of agreements) {
    out.push(
      `| judge | ${a.candidateArm} (\`${modelOf(a.candidateArm)}\`) | \`${o.judgeModel}\` | **${a.verdict}** |`,
    );
  }

  out.push('', '## Generation — candidate vs baseline', '');
  for (const c of comparisons) {
    out.push(`### ${c.candidateArm} vs ${o.baseline} — ${c.verdict}`, '');
    for (const check of c.checks)
      out.push(`- ${box(check.ok)} **${check.name}** — ${check.detail}`);
    out.push(
      `- pass rate on pairs: ${pct(c.candidatePassRate)} vs ${pct(c.baselinePassRate)} (drives how often production regenerates)`,
      `- cost ratio: ${fmt(c.costRatio)}× baseline per successful generation`,
      '',
    );
  }

  out.push(
    '## Per-arm summary',
    '',
    '| Arm | Model | Generated | Failed | Mean overall | Pass rate | Copy | Complete | Local SEO | Tone | Attempts | $/successful gen | Mean gen time |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const arm of o.arms) {
    const s = summarizeArm(result, arm);
    out.push(
      `| ${arm} | \`${modelOf(arm)}\` | ${s.generated}/${s.attempted} | ${s.generationErrors} | ${fmt(s.meanOverall)} | ${pct(s.passRate)} | ` +
        `${fmt(s.meanScores.copyQuality)} | ${fmt(s.meanScores.completeness)} | ${fmt(s.meanScores.localSeo)} | ${fmt(s.meanScores.toneFit)} | ` +
        `${fmt(s.meanAttempts)} | ${usd(s.costPerGeneratedUsd)} | ${fmt(s.meanGenerationMs / 1000, 1)}s |`,
    );
  }

  if (agreements.length) {
    out.push(
      '',
      `## Judge swap — candidate judges vs the reference judge (\`${o.judgeModel}\`)`,
      '',
      '| Candidate | Pairs | Failures | Pass agreement | Mean abs Δ overall | Mean Δ (cand − ref) | $/judgement cand vs ref | Verdict |',
      '| --- | --- | --- | --- | --- | --- | --- | --- |',
    );
    for (const a of agreements) {
      out.push(
        `| ${a.candidateArm} | ${a.pairs} | ${a.errors} | ${pct(a.passAgreement)} | ${fmt(a.meanAbsDelta)} | ${fmt(a.meanSignedDelta)} | ` +
          `${usd(a.candidateCostUsd)} vs ${usd(a.referenceCostUsd)} | **${a.verdict}** |`,
      );
    }
    for (const a of agreements) {
      out.push('', `### ${a.candidateArm} as judge — ${a.verdict}`, '');
      for (const check of a.checks)
        out.push(`- ${box(check.ok)} **${check.name}** — ${check.detail}`);
    }
  }

  out.push('', '## Per lead — mean judged overall by arm', '');
  out.push(
    `| # | Lead | Trade | Town | ${o.arms.join(' | ')} |`,
    `| --- | --- | --- | --- | ${o.arms.map(() => '---').join(' | ')} |`,
  );
  for (const lead of result.leads) {
    const cells = o.arms.map((arm) => {
      const judged = result.units.filter(
        (u) => u.leadIndex === lead.index && u.arm === arm && u.judge?.ok,
      );
      const attempted = result.units.filter(
        (u) => u.leadIndex === lead.index && u.arm === arm,
      ).length;
      if (!attempted) return '—';
      const m = judged.reduce((s, u) => s + u.judge.result.overall, 0) / (judged.length || NaN);
      return `${fmt(m)} (${judged.length}/${attempted})`;
    });
    out.push(
      `| ${lead.index} | ${lead.name} | ${lead.category} | ${lead.city}, ${lead.region} | ${cells.join(' | ')} |`,
    );
  }

  const failures = [];
  for (const e of result.enrich ?? []) {
    if (!e.ok) failures.push(`- lead ${e.leadIndex} · enrich: ${oneLine(e.error)}`);
  }
  for (const u of result.units) {
    const where = `lead ${u.leadIndex} · ${u.arm} · trial ${u.trial}`;
    if (!u.generation?.ok) failures.push(`- ${where} · generate: ${oneLine(u.generation?.error)}`);
    else if (!u.judge?.ok)
      failures.push(`- ${where} · reference judge: ${oneLine(u.judge?.error)}`);
    for (const [id, cand] of Object.entries(u.candidates ?? {})) {
      if (!cand.ok) failures.push(`- ${where} · judge candidate ${id}: ${oneLine(cand.error)}`);
    }
  }
  out.push('', '## Failures', '', ...(failures.length ? failures : ['None.']));

  out.push(
    '',
    '## Decision rule',
    '',
    `- **generate → SWITCH** needs all of: ≥ ${MIN_PAIRS} paired samples; mean judged overall ≥ baseline` +
      `${tolerance ? ` − ${tolerance}` : ''} on those pairs; no more failed generations than baseline; lower cost per successful generation. Fewer pairs → INCONCLUSIVE.`,
    `- **judge → SWITCH** needs all of: ≥ ${MIN_PAIRS} configs scored by both judges; pass/fail agreement ≥ ${JUDGE_SWAP_THRESHOLDS.minPassAgreement * 100}%; mean |Δ overall| ≤ ${JUDGE_SWAP_THRESHOLDS.maxMeanAbsDelta}; zero candidate-judge failures; lower cost per judgement.`,
    '- Every arm generates from the same enrich brief and is scored by the same reference judge, so generation model is the only variable in the quality comparison.',
    '',
  );

  return out.join('\n');
}
