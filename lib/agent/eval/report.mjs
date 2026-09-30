/**
 * lib/agent/eval/report.mjs — render an eval run as a markdown decision record (ops#7).
 *
 * Verdicts first, then the evidence behind each check, then per-lead detail and
 * every failure verbatim — so "keep and document why" is this file, pasted.
 *
 * It gets pasted into a PUBLIC issue, so it carries no prospect identity: leads are
 * `#index · trade · state`, and business names (as written, and as the slug
 * generate() builds from them) are redacted out of failure text. Names stay in the
 * gitignored .json.
 *
 * @module agent/eval/report
 */
import { slugify } from '../generate.mjs';
import {
  MIN_LEADS,
  MIN_PAIRS,
  JUDGE_SWAP_THRESHOLDS,
  SWITCH_MARGINS,
  compareArms,
  describeMargins,
  isDecidedRule,
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
const box = (ok) => (ok === null ? '[?]' : ok ? '[x]' : '[ ]');
/** A margin as typed: 0.25 → "0.25", 0.1 × 100 → "10" (no float noise). */
const num = (n) => String(Number(n.toFixed(4)));

/**
 * Replace each lead's business name — any case or punctuation, and its generated
 * slug (which generate() may cut mid-word) — with `<lead N>`.
 * @param {{ index: number, name?: string }[]} leads
 * @returns {(text: string) => string}
 */
export function nameRedactor(leads) {
  const patterns = [];
  for (const lead of leads ?? []) {
    const words =
      String(lead.name ?? '')
        .toLowerCase()
        .match(/[a-z0-9]+/g) ?? [];
    // Too short to match without eating ordinary words; nothing identifying either.
    if (words.join('').length < 3) continue;
    const label = `<lead ${lead.index}>`;
    patterns.push({
      re: new RegExp(`(?<![a-z0-9])${words.join('[^a-z0-9]+')}(?![a-z0-9])`, 'gi'),
      label,
    });
    patterns.push({ re: new RegExp(`(?<![a-z0-9])${slugify(lead.name)}`, 'gi'), label });
  }
  // Longest first, so a name that contains another lead's name is replaced whole.
  patterns.sort((a, b) => b.re.source.length - a.re.source.length);
  return (text) => patterns.reduce((t, { re, label }) => t.replace(re, label), String(text));
}

/** Where the switch rule came from, for the report header and the decision rule. */
const ruleSource = (margins) =>
  isDecidedRule(margins)
    ? "Adrian's decided rule (2026-09-16, ops#7)"
    : `this run's --tolerance / --pass-tolerance, which override the decided rule (2026-09-16, ops#7: ${describeMargins(SWITCH_MARGINS)})`;

/**
 * @param {object} result  the object runModelEval returns (plus `options.source`, set by the CLI)
 * @param {{ tolerance?: number, passTolerance?: number }} [opts]  default SWITCH_MARGINS
 * @returns {string}
 */
export function renderMarkdown(
  result,
  { tolerance = SWITCH_MARGINS.tolerance, passTolerance = SWITCH_MARGINS.passTolerance } = {},
) {
  const o = result.options;
  const margins = { tolerance, passTolerance };
  const candidates = o.arms.filter((a) => a !== o.baseline);
  const comparisons = candidates.map((arm) =>
    compareArms(result, o.baseline, arm, { tolerance, passTolerance }),
  );
  const agreements = (o.judgeCandidates ?? []).map((arm) => judgeAgreement(result, arm));
  const modelOf = (id) => result.arms?.[id]?.model ?? id;
  const redact = nameRedactor(result.leads);
  const out = [];

  out.push('# lib/agent model-tiering eval (ops#7)', '');
  out.push(
    `Run ${result.startedAt} · leads: ${o.source ?? 'n/a'} (${result.leads.length}) · trials: ${o.trials} · ` +
      `spend ${usd(result.totalCostUsd, 2)} of the ${usd(o.maxUsd, 2)} ceiling`,
  );
  if (result.pricing) {
    out.push(`Prices verified ${result.pricing.verifiedAt} from ${result.pricing.url}.`);
  }
  out.push('', `Switch rule: ${describeMargins(margins)} — ${ruleSource(margins)}.`);
  if (result.aborted) {
    out.push(
      '',
      `> **Stopped early — ${redact(result.abortReason)}.** Verdicts below cover only the work that ran.`,
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
      `- cost ratio: ${fmt(c.costRatio)}× baseline per passing site (${fmt(c.generationCostRatio)}× per successful generation)`,
    );
    if (c.verdict === 'INCONCLUSIVE' && c.checks.some((check) => check.ok === null)) {
      out.push(
        '',
        '> `[?]` = a 95% interval straddles its margin, so the data can’t call it yet. More LEADS narrow the interval ' +
          '(a larger `--from-db N`); more `--trials` repeat the same leads and narrow it far less. ' +
          'Re-run with more leads rather than loosening the margins — those are the decided rule.',
      );
    }
    out.push('');
  }

  out.push(
    '## Per-arm summary',
    '',
    '| Arm | Model | Generated | Failed | Mean overall | Pass rate | Copy | Complete | Local SEO | Tone | Attempts | $/successful gen | $/passing site | Mean gen time |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const arm of o.arms) {
    const s = summarizeArm(result, arm);
    out.push(
      `| ${arm} | \`${modelOf(arm)}\` | ${s.generated}/${s.attempted} | ${s.generationErrors} | ${fmt(s.meanOverall)} | ${pct(s.passRate)} | ` +
        `${fmt(s.meanScores.copyQuality)} | ${fmt(s.meanScores.completeness)} | ${fmt(s.meanScores.localSeo)} | ${fmt(s.meanScores.toneFit)} | ` +
        `${fmt(s.meanAttempts)} | ${usd(s.costPerGeneratedUsd)} | ${usd(s.costPerPassingSiteUsd)} | ${fmt(s.meanGenerationMs / 1000, 1)}s |`,
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
    `| # | Trade | State | ${o.arms.join(' | ')} |`,
    `| --- | --- | --- | ${o.arms.map(() => '---').join(' | ')} |`,
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
      `| ${lead.index} | ${redact(lead.category)} | ${lead.region} | ${cells.join(' | ')} |`,
    );
  }

  const failures = [];
  const said = (err) => oneLine(redact(err));
  for (const e of result.enrich ?? []) {
    if (!e.ok) failures.push(`- lead ${e.leadIndex} · enrich: ${said(e.error)}`);
  }
  for (const u of result.units) {
    const where = `lead ${u.leadIndex} · ${u.arm} · trial ${u.trial}`;
    if (!u.generation?.ok) failures.push(`- ${where} · generate: ${said(u.generation?.error)}`);
    else if (!u.judge?.ok) failures.push(`- ${where} · reference judge: ${said(u.judge?.error)}`);
    for (const [id, cand] of Object.entries(u.candidates ?? {})) {
      if (!cand.ok) failures.push(`- ${where} · judge candidate ${id}: ${said(cand.error)}`);
    }
  }
  out.push('', '## Failures', '', ...(failures.length ? failures : ['None.']));

  out.push(
    '',
    '## Decision rule',
    '',
    `- **generate → SWITCH** needs all of: ≥ ${MIN_PAIRS} paired samples over ≥ ${MIN_LEADS} leads; ` +
      `the lower bound of the 95% CI of Δ judged overall (candidate − baseline, one Δ per lead) ≥ −${num(tolerance)}; ` +
      `the candidate's judge pass rate on the same paired samples ${passTolerance > 0 ? `≥ the baseline's − ${num(passTolerance * 100)} pts` : "no lower than the baseline's"}; ` +
      'generation failure rate no higher than baseline; ' +
      'lower expected cost per passing site ((generate + reference judge) ÷ pass rate) even at the candidate’s worst plausible pass rate.',
    `- Margins: ${ruleSource(margins)}.`,
    '- **KEEP** when any check fails outright — for quality, the whole interval sits below the margin; for pass rate, any shortfall beyond its margin. ' +
      '**INCONCLUSIVE** when the sample is too small, or no check fails but an interval (quality, or cost across the pass-rate interval) straddles its margin.',
    `- **judge → SWITCH** needs all of: ≥ ${MIN_PAIRS} configs scored by both judges; pass/fail agreement ≥ ${JUDGE_SWAP_THRESHOLDS.minPassAgreement * 100}%; mean |Δ overall| ≤ ${JUDGE_SWAP_THRESHOLDS.maxMeanAbsDelta}; zero candidate-judge failures; lower cost per judgement.`,
    '- Every arm generates from the same enrich brief and is scored by the same reference judge, so generation model is the only variable in the quality comparison. ' +
      'Rate limits, overload and connection errors are retried and never scored as a model failure.',
    '',
  );

  return out.join('\n');
}
