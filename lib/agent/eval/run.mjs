/**
 * lib/agent/eval/run.mjs — the model-tiering eval runner (ops#7).
 *
 * Question it answers: can `generate` (and separately `judge`) move off Opus to
 * a cheaper model without the judged quality of generated sites dropping?
 *
 * Design — generation is the ONLY variable in the quality comparison:
 *   1. enrich each lead ONCE on the production fast model; every arm and trial
 *      generates from that same brief
 *   2. each arm generates through the real generate() — same prompt, same
 *      validate/repair loop, same palette gate — with only model/thinking swapped
 *   3. every generated config is scored by the SAME reference judge (production's
 *      strong model), so scores are comparable across arms
 *   4. each candidate judge re-scores those same configs, which measures how
 *      closely a cheaper judge agrees with the reference — the "or vice versa"
 *
 * First-pass quality only: no judge→regenerate outer loop. The judge's pass rate is
 * what drives how often production regenerates, so score.mjs checks it and prices
 * those regenerations into cost per passing site.
 *
 * Cost is measured from each call's `usage`, never estimated (see pricing.mjs).
 * The run stops scheduling work at `maxUsd`.
 *
 * Only the MODEL's failures count against a model (see classifyError). API trouble is
 * not evidence about a model: a rate limit, overload, server error or dropped
 * connection is retried with backoff and, if it persists, stops the run early with a
 * partial result; a request the API refuses outright (rejected key, unknown model,
 * no credit, invalid request) stops the run with the fix.
 *
 * @module agent/eval/run
 */
import { APIConnectionError } from '@anthropic-ai/sdk';
import { enrich as realEnrich } from '../enrich.mjs';
import { generate as realGenerate } from '../generate.mjs';
import { judge as realJudge } from '../judge.mjs';
import { MODELS } from '../llm.mjs';
import { LeadSchema } from '../types.mjs';
import { PRICING_SOURCE, costOfUsage, priceFor } from './pricing.mjs';

/** Model configurations an arm (generation) or judge candidate can run on. */
export const ARMS = {
  'opus-4-8': { model: 'claude-opus-4-8', label: 'Opus 4.8 — production today' },
  'opus-5': { model: 'claude-opus-5', label: 'Opus 5 — same per-token price as Opus 4.8' },
  'sonnet-5': {
    model: 'claude-sonnet-5',
    label: 'Sonnet 5 as a drop-in swap (adaptive thinking is its default when unset)',
  },
  'sonnet-5-no-thinking': {
    model: 'claude-sonnet-5',
    thinking: { type: 'disabled' },
    label: 'Sonnet 5 with thinking disabled (no thinking tokens inside max_tokens)',
  },
};

export const DEFAULTS = {
  arms: ['opus-4-8', 'sonnet-5', 'sonnet-5-no-thinking'],
  /** Must be the arm that runs exactly what production runs (MODELS.strong, no thinking override). */
  baseline: 'opus-4-8',
  judgeModel: MODELS.strong,
  judgeCandidates: ['sonnet-5', 'sonnet-5-no-thinking'],
  trials: 2,
  maxUsd: 15,
  concurrency: 2,
  /** Backoff between retries of a transient API error, on top of the SDK's own 2 retries. */
  retryDelaysMs: [10_000, 30_000, 60_000],
};

/**
 * Rough per-call token sizes for the pre-run estimate only: input measured by eye
 * from the prompts + tool schemas, output at each stage's max_tokens cap. The
 * verdict never uses these — it prices real usage.
 */
const ROUGH_TOKENS = {
  enrich: { input_tokens: 1500, output_tokens: 1024 },
  generate: { input_tokens: 4500, output_tokens: 4096 },
  judge: { input_tokens: 5500, output_tokens: 1024 },
};

const KEYS_URL = 'https://console.anthropic.com/settings/keys';
const BILLING_URL = 'https://console.anthropic.com/settings/billing';
/** Request timeout, conflict, rate limit — plus every 5xx (incl. 529 overloaded). */
const TRANSIENT_STATUSES = new Set([408, 409, 429]);

/**
 * Split raw leads into pipeline-valid input and rejects (with the reason).
 * @param {unknown[]} raw
 */
export function validateLeads(raw) {
  const leads = [];
  const rejected = [];
  raw.forEach((candidate, index) => {
    const parsed = LeadSchema.safeParse(candidate);
    if (parsed.success) leads.push(parsed.data);
    else {
      rejected.push({
        index,
        name: /** @type {{ name?: string }} */ (candidate)?.name ?? '(unnamed)',
        error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
      });
    }
  });
  return { leads, rejected };
}

function resolveOptions(opts) {
  const o = { ...DEFAULTS, ...opts };
  for (const id of [...o.arms, ...o.judgeCandidates]) {
    if (!ARMS[id]) {
      throw new Error(`Unknown arm "${id}". Known arms: ${Object.keys(ARMS).join(', ')}.`);
    }
  }
  if (!o.arms.includes(o.baseline)) {
    throw new Error(
      `Baseline arm "${o.baseline}" must be one of the arms being run (${o.arms.join(', ')}).`,
    );
  }
  if (!Number.isInteger(o.trials) || o.trials < 1)
    throw new Error('trials must be a positive integer.');
  if (!(o.maxUsd > 0)) throw new Error('maxUsd must be a positive number.');
  if (!Array.isArray(o.retryDelaysMs) || !o.retryDelaysMs.every((ms) => ms >= 0)) {
    throw new Error('retryDelaysMs must be an array of non-negative millisecond delays.');
  }
  // Every model the run can bill must have a verified price BEFORE anything is spent.
  const models = new Set([
    MODELS.fast,
    o.judgeModel,
    ...[...o.arms, ...o.judgeCandidates].map((id) => ARMS[id].model),
  ]);
  for (const m of models) priceFor(m);
  return o;
}

/**
 * What a run will do, and a rough upper estimate of what it will cost.
 * @param {{ leads: unknown[], arms?: string[], baseline?: string, judgeModel?: string, judgeCandidates?: string[], trials?: number, maxUsd?: number }} opts
 */
export function planEval(opts) {
  const o = resolveOptions(opts);
  const leads = o.leads.length;
  const generate = leads * o.arms.length * o.trials;
  const calls = {
    enrich: leads,
    generate,
    referenceJudge: generate,
    candidateJudge: generate * o.judgeCandidates.length,
  };
  const perArm = leads * o.trials;
  const roughCostUsd =
    leads * costOfUsage(MODELS.fast, ROUGH_TOKENS.enrich) +
    o.arms.reduce(
      (sum, id) => sum + perArm * costOfUsage(ARMS[id].model, ROUGH_TOKENS.generate),
      0,
    ) +
    generate * costOfUsage(o.judgeModel, ROUGH_TOKENS.judge) +
    o.judgeCandidates.reduce(
      (sum, id) => sum + generate * costOfUsage(ARMS[id].model, ROUGH_TOKENS.judge),
      0,
    );
  return { calls, roughCostUsd };
}

const messageOf = (err) => (err instanceof Error ? err.message : String(err));
const statusOf = (err) => /** @type {{ status?: unknown }} */ (err)?.status;

/**
 * What a stage error says about the model under test:
 *   'transient' — the API was rate-limited, overloaded, erroring or unreachable (after
 *                 the SDK's own retries). Says nothing about the model: retry, then stop.
 *   'fatal'     — the API refused the request itself (key, model id, credit, invalid
 *                 request). Every unit would fail the same way: stop with the fix.
 *   'output'    — the model answered and the answer failed: no tool call, or Zod /
 *                 palette / defineClient still failing after every repair attempt.
 *                 Only these count against the model.
 * @param {unknown} err
 * @returns {'transient' | 'fatal' | 'output'}
 */
export function classifyError(err) {
  if (err instanceof APIConnectionError) return 'transient';
  const status = statusOf(err);
  if (typeof status !== 'number') return 'output';
  return TRANSIENT_STATUSES.has(status) || status >= 500 ? 'transient' : 'fatal';
}

/** The loud, actionable error a fatal API refusal stops the run with. */
function fatalError(err, model) {
  const status = statusOf(err);
  const said = `HTTP ${status}: ${messageOf(err)}`;
  if (status === 401 || status === 403) {
    return new Error(
      `ANTHROPIC_API_KEY was rejected (${said}). Create or rotate a key at ${KEYS_URL}, set it in .env.local or your shell, then re-run.`,
    );
  }
  if (status === 404) {
    return new Error(
      `Model "${model}" was not found (${said}). Check the model id in lib/agent/eval/run.mjs ARMS, and that this API key's organization has access to it.`,
    );
  }
  if (/credit balance/i.test(messageOf(err))) {
    return new Error(
      `The Anthropic account is out of credit (${said}). Add credit at ${BILLING_URL}, then re-run — spend so far is not scored.`,
    );
  }
  return new Error(
    `The Claude API refused a request to "${model}" (${said}). That is a request problem, not model output, so the eval stopped rather than score it against the model. Check the arm's settings in lib/agent/eval/run.mjs ARMS.`,
  );
}

/** A transient API error that outlasted every retry — ends the run early, blames nobody. */
class ApiUnavailable extends Error {}

/** Sum the calls one stage made: cost, tokens, stop reasons. */
function callStats(calls) {
  const tokens = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 };
  for (const { usage } of calls) {
    tokens.input += usage?.input_tokens ?? 0;
    tokens.output += usage?.output_tokens ?? 0;
    tokens.cacheWrite += usage?.cache_creation_input_tokens ?? 0;
    tokens.cacheRead += usage?.cache_read_input_tokens ?? 0;
  }
  return {
    costUsd: calls.reduce((sum, c) => sum + c.costUsd, 0),
    tokens,
    calls: calls.length,
    stopReasons: calls.map((c) => c.stopReason),
  };
}

async function pool(items, concurrency, worker) {
  let next = 0;
  const lanes = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (next < items.length) await worker(items[next++]);
    },
  );
  await Promise.all(lanes);
}

/**
 * Run the eval. Stages default to the real lib/agent stages; tests inject stubs.
 *
 * @param {object} opts
 * @param {unknown[]} opts.leads
 * @param {string[]} [opts.arms]
 * @param {string} [opts.baseline]
 * @param {string} [opts.judgeModel]
 * @param {string[]} [opts.judgeCandidates]
 * @param {number} [opts.trials]
 * @param {number} [opts.maxUsd]
 * @param {number} [opts.concurrency]
 * @param {number[]} [opts.retryDelaysMs]  backoff before each retry of a transient API error
 * @param {(ms: number) => Promise<void>} [opts.sleep]  injectable for tests
 * @param {{ enrich?: Function, generate?: Function, judge?: Function }} [opts.stages]
 * @param {(event: object) => void} [opts.onProgress]
 */
export async function runModelEval(opts) {
  const o = resolveOptions(opts);
  const plan = planEval(o);
  const stages = { enrich: realEnrich, generate: realGenerate, judge: realJudge, ...opts.stages };
  const onProgress = opts.onProgress ?? (() => {});
  const sleep = opts.sleep ?? ((ms) => new Promise((done) => setTimeout(done, ms)));
  const leads = o.leads.map((lead) => LeadSchema.parse(lead));
  const startedAt = new Date().toISOString();

  let spent = 0;
  let aborted = false;
  let abortReason;
  let fatal = null;
  const meter = (bucket) => (call) => {
    const costUsd = costOfUsage(call.model, call.usage);
    spent += costUsd;
    bucket.push({ ...call, costUsd });
  };
  const stopping = () => {
    if (!aborted && spent >= o.maxUsd) {
      aborted = true;
      abortReason = `spend reached the $${o.maxUsd} ceiling`;
    }
    return aborted || fatal !== null;
  };

  /**
   * One stage call, with transient API errors retried. Only the try that settled is
   * priced onto the unit — production would not have paid for an abandoned one — but
   * every try counts toward real spend and the ceiling.
   * @returns {Promise<{ ok: true, value: any, calls: object[], retries: number } | { ok: false, error: string, calls: object[], retries: number }>}
   * @throws {Error} fatal API refusals · {ApiUnavailable} when retries run out
   */
  const attempt = async (stage, model, invoke) => {
    for (let retries = 0; ; retries++) {
      const calls = [];
      try {
        return { ok: true, value: await invoke(meter(calls)), calls, retries };
      } catch (err) {
        const kind = classifyError(err);
        if (kind === 'fatal') throw fatalError(err, model);
        if (kind === 'output') return { ok: false, error: messageOf(err), calls, retries };
        const said = `${statusOf(err) ? `HTTP ${statusOf(err)}: ` : ''}${messageOf(err)}`;
        if (aborted || retries >= o.retryDelaysMs.length) {
          throw new ApiUnavailable(
            `the Claude API kept failing on ${stage} (${model}) after ${retries} ${retries === 1 ? 'retry' : 'retries'} — last error ${said}. That is API trouble, not model output; re-run when the API recovers`,
          );
        }
        onProgress({ type: 'retry', stage, model, delayMs: o.retryDelaysMs[retries], error: said });
        await sleep(o.retryDelaysMs[retries]);
      }
    }
  };

  /** Route a thrown stage error: API outage → graceful early stop; anything else → fatal. */
  const halt = (err) => {
    if (err instanceof ApiUnavailable) {
      if (!aborted) {
        aborted = true;
        abortReason = err.message;
      }
    } else {
      fatal ??= err;
    }
  };

  // ── 1. enrich once per lead ──────────────────────────────────────────────
  const briefs = [];
  const enrichResults = [];
  await pool(
    leads.map((lead, index) => ({ lead, index })),
    o.concurrency,
    async ({ lead, index }) => {
      if (stopping()) return;
      let r;
      try {
        r = await attempt('enrich', MODELS.fast, (onUsage) => stages.enrich(lead, { onUsage }));
      } catch (err) {
        halt(err);
        return;
      }
      if (r.ok) briefs[index] = r.value;
      enrichResults[index] = {
        leadIndex: index,
        ok: r.ok,
        ...(r.ok ? { brief: r.value } : { error: r.error }),
        retries: r.retries,
        ...callStats(r.calls),
      };
      onProgress({ type: 'enrich', leadIndex: index, ok: r.ok, spentUsd: spent });
    },
  );
  if (fatal) throw fatal;

  // ── 2. generate × judge, interleaved so a budget stop leaves balanced arms ──
  const work = [];
  for (let trial = 1; trial <= o.trials; trial++) {
    leads.forEach((_, leadIndex) => {
      if (!enrichResults[leadIndex]?.ok) return;
      for (const arm of o.arms) work.push({ leadIndex, arm, trial });
    });
  }

  /** @param {{ model: string, thinking?: object }} judgeSpec */
  const judged = async (lead, config, { model, thinking }) => {
    const r = await attempt('judge', model, (onUsage) =>
      stages.judge(lead, config, { model, thinking, onUsage }),
    );
    return {
      ok: r.ok,
      ...(r.ok ? { result: r.value } : { error: r.error }),
      retries: r.retries,
      ...callStats(r.calls),
    };
  };

  const units = [];
  await pool(work, o.concurrency, async ({ leadIndex, arm, trial }) => {
    if (stopping()) return;
    const spec = ARMS[arm];
    const lead = leads[leadIndex];
    const unit = { leadIndex, arm, trial, generation: null, judge: null, candidates: {} };
    try {
      const t0 = Date.now();
      const r = await attempt('generate', spec.model, (onUsage) =>
        stages.generate(lead, briefs[leadIndex], {
          model: spec.model,
          thinking: spec.thinking,
          onUsage,
        }),
      );
      unit.generation = {
        ok: r.ok,
        ...(r.ok ? { attempts: r.value.attempts, config: r.value.config } : { error: r.error }),
        ms: Date.now() - t0,
        retries: r.retries,
        ...callStats(r.calls),
      };

      if (unit.generation.ok) {
        unit.judge = await judged(lead, unit.generation.config, { model: o.judgeModel });
        for (const id of o.judgeCandidates) {
          unit.candidates[id] = await judged(lead, unit.generation.config, ARMS[id]);
        }
      }
    } catch (err) {
      // A unit cut short by the API is dropped whole, never recorded as a failure.
      halt(err);
      return;
    }
    units.push(unit);
    onProgress({ type: 'unit', unit, done: units.length, total: work.length, spentUsd: spent });
  });
  if (fatal) throw fatal;

  const armOrder = (id) => o.arms.indexOf(id);
  units.sort(
    (a, b) => a.trial - b.trial || a.leadIndex - b.leadIndex || armOrder(a.arm) - armOrder(b.arm),
  );

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    options: {
      arms: o.arms,
      baseline: o.baseline,
      judgeModel: o.judgeModel,
      judgeCandidates: o.judgeCandidates,
      trials: o.trials,
      maxUsd: o.maxUsd,
      concurrency: o.concurrency,
      enrichModel: MODELS.fast,
    },
    arms: Object.fromEntries(
      [...new Set([...o.arms, ...o.judgeCandidates])].map((id) => [id, ARMS[id]]),
    ),
    pricing: PRICING_SOURCE,
    plan,
    leads: leads.map((l, index) => ({
      index,
      name: l.name,
      category: l.category,
      city: l.city,
      region: l.region,
    })),
    enrich: enrichResults.filter(Boolean),
    units,
    totalCostUsd: spent,
    aborted,
    ...(aborted ? { abortReason } : {}),
  };
}
