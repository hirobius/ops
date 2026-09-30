#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/eval-agent-models.mjs — should lib/agent generate (or judge) on Sonnet 5? (ops#7)
 *
 * Runs the real enrich → generate → judge stages over a lead set with each
 * candidate generation model, scores every config with the SAME reference judge
 * (production's strong model), measures real cost from API usage, and prints a
 * SWITCH / KEEP / INCONCLUSIVE verdict per candidate. The decision rule lives in
 * lib/agent/eval/score.mjs; the runner design in lib/agent/eval/run.mjs.
 *
 * Switch rule by default (Adrian, 2026-09-16): SWITCH when the lower bound of the 95% CI
 * of (candidate − Opus) judged overall is ≥ −0.25 AND the candidate's judge pass rate is
 * no lower than Opus's, with generation failures no more frequent and a lower cost per
 * passing site. --tolerance / --pass-tolerance override the two margins for one run; the
 * report then says it departed from the decided rule.
 *
 * THIS SPENDS MONEY: real, billed Claude API calls. --dry-run shows the plan and
 * a rough cost with no key and no calls; --max-usd caps the real spend.
 *
 * ── Usage ────────────────────────────────────────────────────────────────────
 *   node --env-file=.env.local scripts/eval-agent-models.mjs --dry-run
 *   node --env-file=.env.local scripts/eval-agent-models.mjs --from-db 8   # real leads (the decision run)
 *   node --env-file=.env.local scripts/eval-agent-models.mjs               # synthetic fixture leads
 *
 * Env (set by Adrian — agents never read or write .env* files):
 *   ANTHROPIC_API_KEY                              always (not needed for --dry-run)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY       only for --from-db (read-only; nothing is written)
 *
 * Output: temp/agent-model-eval/<timestamp>.md (the decision record) and .json
 * (every unit, config, usage and judge note). temp/ is gitignored. The .md names
 * no prospect — leads appear as # · trade · state, business names are redacted from
 * failure text — so it is the one to paste into #7 (a public repo). Never paste the
 * .json: it holds the real business names and generated configs.
 *
 * Exit codes: 0 finished (any verdict) · 1 stopped by an API refusal (rejected key,
 * unknown model, no credit, invalid request) · 2 invocation or setup error · 3 stopped
 * early at the --max-usd ceiling or because the API stayed unavailable after retries
 * (partial report still written).
 *
 * @module eval-agent-models
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARMS, DEFAULTS, planEval, runModelEval, validateLeads } from '../lib/agent/eval/run.mjs';
import { FIXTURE_LEADS } from '../lib/agent/eval/fixture-leads.mjs';
import { renderMarkdown } from '../lib/agent/eval/report.mjs';
import { PRICING_SOURCE } from '../lib/agent/eval/pricing.mjs';
import { SWITCH_MARGINS, describeMargins, isDecidedRule } from '../lib/agent/eval/score.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS_URL = 'https://console.anthropic.com/settings/keys';

const USAGE = `eval-agent-models.mjs — Sonnet 5 (and friends) vs production for lib/agent generate + judge (ops#7)

Leads (pick one):
  (default)             the ${FIXTURE_LEADS.length} synthetic fixture leads (lib/agent/eval/fixture-leads.mjs)
  --from-db <N>         the N most recent real leads from Supabase (skips do_not_contact rows)
  --leads <file.json>   a JSON array of leads in the pipeline's LeadSchema shape

Options:
  --arms <a,b,...>              generation arms (default ${DEFAULTS.arms.join(',')})
  --baseline <arm>              the arm to beat (default ${DEFAULTS.baseline} — production today)
  --judge-candidates <a,b|none> cheaper judges to test against the reference (default ${DEFAULTS.judgeCandidates.join(',')})
  --trials <N>                  repeats per lead × arm (default ${DEFAULTS.trials})
  --max-usd <N>                 stop scheduling work at this real spend (default ${DEFAULTS.maxUsd})
  --concurrency <N>             parallel lead × arm units (default ${DEFAULTS.concurrency})
  --tolerance <X>               quality margin: SWITCH needs the 95% CI lower bound of Δ judged overall ≥ −X, 1–5 scale (default ${SWITCH_MARGINS.tolerance})
  --pass-tolerance <X>          points the candidate's judge pass rate may trail the baseline's, 0–1 (default ${SWITCH_MARGINS.passTolerance} = no lower than the baseline; 0.1 = 10 points)
  --out <dir>                   report directory (default temp/agent-model-eval)
  --dry-run                     print the plan and a rough cost — no key, no API calls
  --help

Switch rule (Adrian, 2026-09-16): ${describeMargins(SWITCH_MARGINS)},
plus generation failures no more frequent and a lower cost per passing site. Override the
margins only for a one-off look; the decided rule is the one the verdict stands on.

Arms: ${Object.entries(ARMS)
  .map(([id, a]) => `\n  ${id.padEnd(22)} ${a.label}`)
  .join('')}

Prices verified ${PRICING_SOURCE.verifiedAt} from ${PRICING_SOURCE.url}.`;

class UsageError extends Error {}

function parseArgs(argv) {
  const o = {
    arms: DEFAULTS.arms,
    baseline: DEFAULTS.baseline,
    judgeCandidates: DEFAULTS.judgeCandidates,
    trials: DEFAULTS.trials,
    maxUsd: DEFAULTS.maxUsd,
    concurrency: DEFAULTS.concurrency,
    tolerance: SWITCH_MARGINS.tolerance,
    passTolerance: SWITCH_MARGINS.passTolerance,
    out: join(ROOT, 'temp', 'agent-model-eval'),
    fromDb: null,
    leadsFile: null,
    dryRun: false,
    help: false,
  };
  const value = (i, flag) => {
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new UsageError(`${flag} needs a value.`);
    return v;
  };
  const number = (i, flag, { integer = false, min = 0, max = Infinity } = {}) => {
    const n = Number(value(i, flag));
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
      const range = Number.isFinite(max) ? `between ${min} and ${max}` : `≥ ${min}`;
      throw new UsageError(`${flag} must be ${integer ? 'an integer' : 'a number'} ${range}.`);
    }
    return n;
  };
  const list = (i, flag) =>
    value(i, flag)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s && s !== 'none');

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--arms') o.arms = list(i++, a);
    else if (a === '--baseline') o.baseline = value(i++, a);
    else if (a === '--judge-candidates') o.judgeCandidates = list(i++, a);
    else if (a === '--trials') o.trials = number(i++, a, { integer: true, min: 1 });
    else if (a === '--max-usd') o.maxUsd = number(i++, a);
    else if (a === '--concurrency') o.concurrency = number(i++, a, { integer: true, min: 1 });
    else if (a === '--tolerance') o.tolerance = number(i++, a, { max: 4 });
    else if (a === '--pass-tolerance') o.passTolerance = number(i++, a, { max: 1 });
    else if (a === '--out') o.out = resolve(value(i++, a));
    else if (a === '--from-db') o.fromDb = number(i++, a, { integer: true, min: 1 });
    else if (a === '--leads') o.leadsFile = resolve(value(i++, a));
    else throw new UsageError(`Unknown flag: ${a}`);
  }
  if (o.fromDb && o.leadsFile) throw new UsageError('Use --from-db or --leads, not both.');
  return o;
}

/** @returns {Promise<{ source: string, raw: unknown[], limit?: number }>} */
async function loadLeads(o) {
  if (o.leadsFile) {
    const raw = JSON.parse(readFileSync(o.leadsFile, 'utf8'));
    if (!Array.isArray(raw))
      throw new UsageError(`${o.leadsFile} must contain a JSON array of leads.`);
    return { source: `file ${o.leadsFile}`, raw };
  }
  if (o.fromDb) {
    const { getServiceClient } = await import('../lib/supabase/server.mjs');
    const { listLeads } = await import('../lib/supabase/leads.mjs');
    // The same row → lead mapping production generation uses.
    const { toAgentLead } = await import('../lib/leads/pipeline.mjs');
    const sb = await getServiceClient();
    // Over-fetch so opted-out and pipeline-invalid rows don't shrink the sample;
    // main() keeps the first `limit` valid ones (most recent first).
    const { data, error } = await listLeads(sb, Math.max(o.fromDb * 3, o.fromDb + 20));
    if (error) throw new Error(`Reading leads from Supabase failed: ${error.message}`);
    const raw = (data ?? [])
      .filter((row) => row.do_not_contact !== true)
      .map((row) => toAgentLead(row));
    return { source: 'Supabase, most recent first', raw, limit: o.fromDb };
  }
  return { source: 'synthetic fixtures', raw: FIXTURE_LEADS };
}

function progressLine(event) {
  if (event.type === 'retry') {
    return `  ${event.stage} on ${event.model}: API error (${event.error}) — retrying in ${Math.round(event.delayMs / 1000)}s`;
  }
  if (event.type === 'enrich') {
    return `  enrich lead ${event.leadIndex} ${event.ok ? 'ok' : 'FAILED'} · spent $${event.spentUsd.toFixed(3)}`;
  }
  const u = event.unit;
  const head = `  [${event.done}/${event.total}] lead ${u.leadIndex} · ${u.arm} · trial ${u.trial}`;
  if (!u.generation.ok) return `${head} → generate FAILED · spent $${event.spentUsd.toFixed(3)}`;
  const j = u.judge?.ok
    ? `${u.judge.result.overall} ${u.judge.result.pass ? 'PASS' : 'fail'}`
    : 'judge FAILED';
  return `${head} → ${j} · gen $${u.generation.costUsd.toFixed(4)} (${u.generation.attempts} attempt${u.generation.attempts === 1 ? '' : 's'}) · spent $${event.spentUsd.toFixed(3)}`;
}

async function main() {
  let o;
  try {
    o = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n\nRun with --help for usage.`);
    return 2;
  }
  if (o.help) {
    console.log(USAGE);
    return 0;
  }

  let source;
  let leads;
  let plan;
  try {
    const loaded = await loadLeads(o);
    source = loaded.source;
    const validated = validateLeads(loaded.raw);
    leads = validated.leads.slice(0, loaded.limit ?? Infinity);
    if (!leads.length) throw new UsageError('No valid leads to evaluate.');
    plan = planEval({ ...o, leads });
    console.log(`Leads: ${leads.length} leads from ${source}.`);
    if (validated.rejected.length) {
      console.log(
        `  skipped ${validated.rejected.length} the pipeline would reject:\n` +
          validated.rejected.map((r) => `    - #${r.index} ${r.name}: ${r.error}`).join('\n'),
      );
    }
  } catch (err) {
    console.error(err.message);
    return 2;
  }

  console.log(
    [
      `Arms: ${o.arms.join(', ')} (baseline ${o.baseline}) · judge ${DEFAULTS.judgeModel}` +
        (o.judgeCandidates.length ? ` · judge candidates ${o.judgeCandidates.join(', ')}` : ''),
      `Trials: ${o.trials} · concurrency ${o.concurrency} · spend ceiling $${o.maxUsd}`,
      `Switch rule: ${describeMargins(o)} ` +
        (isDecidedRule(o)
          ? '(Adrian, 2026-09-16)'
          : `(overrides the decided rule: ${describeMargins(SWITCH_MARGINS)})`) +
        (o.tolerance
          ? ''
          : ' · at quality margin 0 a candidate only as good as the baseline usually comes out INCONCLUSIVE'),
      `Calls — enrich: ${plan.calls.enrich} · generate: ${plan.calls.generate} (+ repair retries) · ` +
        `reference judge: ${plan.calls.referenceJudge} · candidate judge: ${plan.calls.candidateJudge}`,
      `Rough upper estimate (every call at its max output, one generate attempt): $${plan.roughCostUsd.toFixed(2)}`,
    ].join('\n'),
  );

  if (o.dryRun) {
    console.log('\nDry run — no API calls made. Drop --dry-run to run it for real.');
    return 0;
  }

  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    console.error(
      [
        '',
        'ANTHROPIC_API_KEY is not set — the eval makes real, billed Claude API calls.',
        `  1. Create a key: ${KEYS_URL}`,
        '  2. Put it in .env.local as ANTHROPIC_API_KEY=<key> (or export it in your shell)',
        '  3. Re-run: node --env-file=.env.local scripts/eval-agent-models.mjs',
        'Nothing was spent.',
      ].join('\n'),
    );
    return 2;
  }

  console.log('\nRunning…');
  let result;
  try {
    result = await runModelEval({
      leads,
      arms: o.arms,
      baseline: o.baseline,
      judgeCandidates: o.judgeCandidates,
      trials: o.trials,
      maxUsd: o.maxUsd,
      concurrency: o.concurrency,
      onProgress: (event) => console.log(progressLine(event)),
    });
  } catch (err) {
    console.error(`\nEval stopped: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  result.options.source = source;
  result.options.tolerance = o.tolerance;
  result.options.passTolerance = o.passTolerance;
  const markdown = renderMarkdown(result, {
    tolerance: o.tolerance,
    passTolerance: o.passTolerance,
  });
  const stamp = result.startedAt.replace(/[:.]/g, '-');
  mkdirSync(o.out, { recursive: true });
  const mdPath = join(o.out, `${stamp}.md`);
  const jsonPath = join(o.out, `${stamp}.json`);
  writeFileSync(mdPath, markdown);
  writeFileSync(jsonPath, `${JSON.stringify(result, null, 2)}\n`);

  console.log(`\n${markdown}`);
  console.log(
    `Report: ${mdPath} (no business names — the one to paste into #7)\n` +
      `Full data: ${jsonPath} (real business names — keep it local)`,
  );
  return result.aborted ? 3 : 0;
}

process.exitCode = await main();
