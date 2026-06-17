#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/telemetry-report.mjs
 *
 * Reads telemetry/events.jsonl and prints a generation-health summary:
 *   - total generations, success / exhausted breakdown, success rate
 *   - retry-exhaustion rate (over rolling 24 h, production-tagged)
 *   - top-5 failing validator error codes (from retry.exhausted payloads)
 *   - top-5 failing component names (from validator errors[].path)
 *
 * Flags:
 *   --alert            Enable threshold-check mode: exits 1 with a stderr
 *                      summary when the production retry-exhaustion rate in
 *                      the last 24 h exceeds the threshold AND at least
 *                      MIN_PROD_STARTS production retry.start events exist.
 *                      Without this flag the script always exits 0.
 *   --threshold=N      Override the default exhaustion % threshold (default 10).
 *                      Value is a percentage integer, e.g. --threshold=15 → 15%.
 *
 * The production filter (`enabled === true && source === 'pipeline'`) matches
 * the orchestrator's stop-condition logic so a clean report and a clean
 * `pnpm hds:run` agree on whether the pipeline is healthy.
 *
 * Missing or empty telemetry/events.jsonl is handled gracefully (exit 0).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = process.env.TELEMETRY_LOG_PATH ?? path.join(ROOT, 'telemetry', 'events.jsonl');
const POD_RUNS_PATH = path.join(ROOT, 'telemetry', 'pod-runs.jsonl');
const MIN_PROD_STARTS = 10;
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Parse CLI flags
const ALERT_MODE = process.argv.includes('--alert');
const thresholdArg = process.argv.find(a => a.startsWith('--threshold='));
const EXHAUSTION_THRESHOLD_PCT = thresholdArg ? Number(thresholdArg.split('=')[1]) : 10;
if (thresholdArg && (Number.isNaN(EXHAUSTION_THRESHOLD_PCT) || EXHAUSTION_THRESHOLD_PCT < 0 || EXHAUSTION_THRESHOLD_PCT > 100)) {
  process.stderr.write(`[telemetry-report] Invalid --threshold value: "${thresholdArg.split('=')[1]}". Must be a number 0–100.\n`);
  process.exit(1);
}
const EXHAUSTION_THRESHOLD = EXHAUSTION_THRESHOLD_PCT / 100;

function readEvents() {
  if (!fs.existsSync(LOG_PATH)) return [];
  return fs.readFileSync(LOG_PATH, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function isProdStart(e) {
  return e.event === 'retry.start' && e.data?.enabled === true && e.data?.source === 'pipeline';
}

function topN(map, n = 5) {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function pct(num, denom) {
  return denom === 0 ? '0.0%' : `${(num / denom * 100).toFixed(1)}%`;
}

/**
 * Read pod-runs.jsonl and print per-pod cost summary.
 * Each line: { ts, sessionId, model, totalTokens, durationMs, unitsCompleted }
 */
function podCostReport() {
  if (!fs.existsSync(POD_RUNS_PATH)) {
    console.log('ℹ️  No pod runs recorded yet.');
    console.log(`   Emit runs via: import { logPodRun } from './telemetry/pod-runs.mjs'`);
    process.exit(0);
  }

  const runs = fs.readFileSync(POD_RUNS_PATH, 'utf8').trim().split('\n').filter(Boolean)
    .map(line => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);

  if (runs.length === 0) {
    console.log('ℹ️  pod-runs.jsonl is empty.');
    process.exit(0);
  }

  // Aggregate by model
  const byModel = new Map();
  for (const run of runs) {
    const model = run.model ?? 'unknown';
    const entry = byModel.get(model) ?? { runs: 0, tokens: 0, durationMs: 0, units: 0 };
    entry.runs++;
    entry.tokens     += run.totalTokens  ?? 0;
    entry.durationMs += run.durationMs   ?? 0;
    entry.units      += run.unitsCompleted ?? 0;
    byModel.set(model, entry);
  }

  const totalRuns    = runs.length;
  const totalTokens  = runs.reduce((s, r) => s + (r.totalTokens  ?? 0), 0);
  const totalDurMs   = runs.reduce((s, r) => s + (r.durationMs   ?? 0), 0);
  const totalUnits   = runs.reduce((s, r) => s + (r.unitsCompleted ?? 0), 0);

  // Rolling 7-day window
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const recent = runs.filter(r => r.ts && Date.parse(r.ts) >= cutoff);
  const recentTokens = recent.reduce((s, r) => s + (r.totalTokens ?? 0), 0);

  console.log('📊 Pod Cost Report');
  console.log('─────────────────────────────────');
  console.log(`Log: ${path.relative(ROOT, POD_RUNS_PATH)} (${totalRuns} runs)`);
  console.log('');
  console.log('All-time:');
  console.log(`  Pods run:       ${totalRuns}`);
  console.log(`  Units done:     ${totalUnits}`);
  console.log(`  Total tokens:   ${totalTokens.toLocaleString()}`);
  console.log(`  Total wall-time: ${(totalDurMs / 60000).toFixed(1)} min`);
  console.log('');
  console.log('Last 7 days:');
  console.log(`  Pods:   ${recent.length}`);
  console.log(`  Tokens: ${recentTokens.toLocaleString()}`);
  console.log('');
  console.log('By model:');
  for (const [model, stats] of [...byModel.entries()].sort((a, b) => b[1].tokens - a[1].tokens)) {
    const avgTokens = stats.runs > 0 ? Math.round(stats.tokens / stats.runs) : 0;
    console.log(`  ${model.padEnd(16)} ${stats.runs} runs  ${stats.tokens.toLocaleString()} tokens  avg ${avgTokens.toLocaleString()}/run  ${stats.units} units`);
  }
  console.log('');
  console.log('✅ Pod cost report complete.');
}

function main() {
  const all = readEvents();

  const allTime = {
    starts: all.filter(e => e.event === 'retry.start').length,
    success: all.filter(e => e.event === 'retry.success').length,
    exhausted: all.filter(e => e.event === 'retry.exhausted').length,
  };

  const cutoff = Date.now() - WINDOW_MS;
  const recent = all.filter(e => e.ts && Date.parse(e.ts) >= cutoff);
  const prodStarts = recent.filter(isProdStart);
  const prodExhausted = recent.filter(e =>
    e.event === 'retry.exhausted' &&
    prodStarts.length > 0 &&
    e.ts >= prodStarts[0].ts &&
    e.ts <= prodStarts[prodStarts.length - 1].ts
  );

  const errorCodes = new Map();
  const componentNames = new Map();
  for (const e of all.filter(ev => ev.event === 'retry.exhausted')) {
    for (const err of (e.data?.errors ?? e.data?.lastErrors ?? [])) {
      if (err?.code) errorCodes.set(err.code, (errorCodes.get(err.code) ?? 0) + 1);
      if (err?.path) {
        const cname = String(err.path).split('.')[0];
        if (cname) componentNames.set(cname, (componentNames.get(cname) ?? 0) + 1);
      }
    }
  }

  console.log('📊 Telemetry Report');
  console.log('───────────────────');
  console.log(`Log: ${path.relative(ROOT, LOG_PATH)} (${all.length} events)`);
  console.log('');
  console.log('All-time:');
  console.log(`  retry.start     ${allTime.starts}`);
  console.log(`  retry.success   ${allTime.success}  (${pct(allTime.success, allTime.starts)})`);
  console.log(`  retry.exhausted ${allTime.exhausted}  (${pct(allTime.exhausted, allTime.starts)})`);
  console.log('');
  console.log('Last 24 h (production-tagged only):');
  console.log(`  retry.start     ${prodStarts.length}`);
  console.log(`  retry.exhausted ${prodExhausted.length}  (${pct(prodExhausted.length, prodStarts.length || 1)})`);

  if (errorCodes.size > 0) {
    console.log('');
    console.log('Top failing error codes (all-time):');
    for (const [code, count] of topN(errorCodes)) {
      console.log(`  ${count.toString().padStart(4)}  ${code}`);
    }
  }

  if (componentNames.size > 0) {
    console.log('');
    console.log('Top failing component names (all-time):');
    for (const [name, count] of topN(componentNames)) {
      console.log(`  ${count.toString().padStart(4)}  ${name}`);
    }
  }

  console.log('');
  if (prodStarts.length >= MIN_PROD_STARTS) {
    const rate = prodExhausted.length / prodStarts.length;
    const ratePct = (rate * 100).toFixed(1);
    const thresholdPct = EXHAUSTION_THRESHOLD_PCT.toFixed(1);
    if (rate > EXHAUSTION_THRESHOLD) {
      if (ALERT_MODE) {
        process.stderr.write(
          `\n[telemetry-alert] THRESHOLD BREACH\n` +
          `  Retry-exhaustion rate : ${ratePct}%\n` +
          `  Threshold             : ${thresholdPct}%\n` +
          `  Window                : last 24 h (production-tagged)\n` +
          `  Production starts     : ${prodStarts.length}\n` +
          `  Exhausted             : ${prodExhausted.length}\n` +
          `  Action: investigate the top failing error codes above and fix the\n` +
          `          most common prompt or validator issue before re-running.\n\n`
        );
        process.exit(1);
      } else {
        console.log(`⚠️  Exhaustion rate ${ratePct}% exceeds ${thresholdPct}% threshold (run with --alert to exit non-zero).`);
      }
    } else {
      console.log(`✅ Healthy — exhaustion rate ${ratePct}% within ${thresholdPct}% threshold${ALERT_MODE ? ' (alert mode)' : ''}.`);
    }
  } else {
    console.log(`ℹ️  Insufficient production data (${prodStarts.length}/${MIN_PROD_STARTS} starts in last 24 h) — threshold check skipped.`);
  }
}

// Route to sub-command based on CLI flags
if (process.argv.includes('--pod-cost')) {
  podCostReport();
} else {
  main();
}
