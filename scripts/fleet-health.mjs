#!/usr/bin/env node
/**
 * fleet-health — uptime/health check for client sites (site-engine#108's
 * ops half). MANUAL TRIGGER, no cron (standing rule: converting to a
 * schedule needs an explicit per-item yes from Adrian).
 *
 * Runs the factory's own go-live assertions (lib/health/verify-live.mjs,
 * vendored from site-engine's scripts/verify-live.ts) against each target:
 * live sites must answer 200/indexable/JSON-LD with /thanks + sitemap +
 * robots reachable; preview sites must still be GATED (401 + noindex) —
 * a preview answering 200 means the gate fell open, the Monroe-class bug.
 *
 * Targets, in priority order:
 *   --url <u>          repeatable — check as a LIVE site
 *   --gated-url <u>    repeatable — check as a GATED preview
 *   (none given)       fall back to Supabase leads: rows with live_url →
 *                      live-mode, rows with preview_url → gated-mode.
 *                      Fail-soft without SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.
 *
 * Output: stdout always; failures append docs/ops/alert-log.jsonl (rendered
 * by the /ops Fleet timeline) + POST to DISCORD_WEBHOOK_URL fail-soft —
 * both skipped under --dry-run. Mirrors scripts/deploy-alert.mjs (#11).
 *
 * Flags: --dry-run (no writes/Discord) · --json · --help
 * Exit:  0 all healthy (or nothing to check) · 2 failures found · 1 usage/env error
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { verifyLive, verifyGated } from '../lib/health/verify-live.mjs';
import { postToDiscord } from '../lib/ops/notify.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG_PATH = join(ROOT, 'docs', 'ops', 'alert-log.jsonl');
const VERCEL_ENV_URL =
  'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Pure core: run the right assertion set per target, aggregate.
 * @param {Array<{ url: string, mode: 'live' | 'gated', label?: string }>} targets
 * @param {{ fetchImpl?: typeof fetch }} [opts]
 */
export async function checkTargets(targets, { fetchImpl = fetch } = {}) {
  const out = [];
  for (const t of targets) {
    const label = t.label ?? t.url;
    try {
      const checks = t.mode === 'gated' ? await verifyGated(t.url, fetchImpl) : await verifyLive(t.url, fetchImpl);
      const failed = checks.filter((c) => !c.pass);
      out.push({ label, url: t.url, mode: t.mode, ok: failed.length === 0, checks, failed });
    } catch (err) {
      out.push({
        label,
        url: t.url,
        mode: t.mode,
        ok: false,
        checks: [],
        failed: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  const failures = out.filter((t) => !t.ok);
  return { ok: failures.length === 0, targets: out, failures };
}

// ── Target discovery (leads fallback) ─────────────────────────────────────────

async function targetsFromLeads() {
  let sb;
  try {
    const { getServiceClient } = await import('../lib/supabase/server.mjs');
    sb = await getServiceClient();
  } catch (err) {
    console.error(
      `No --url targets given and the leads fallback is unavailable: ${err instanceof Error ? err.message : err}\n` +
        `Fix: pass --url/--gated-url explicitly, or set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY at ${VERCEL_ENV_URL} / in the shell.`,
    );
    return null;
  }
  const { data, error } = await sb
    .from('leads')
    .select('slug,business_name,live_url,preview_url')
    .or('live_url.not.is.null,preview_url.not.is.null');
  if (error) {
    console.error(`Leads query failed: ${error.message}`);
    return null;
  }
  const targets = [];
  for (const row of data ?? []) {
    const label = row.business_name || row.slug || undefined;
    if (row.live_url) targets.push({ url: row.live_url, mode: 'live', label });
    else if (row.preview_url) targets.push({ url: row.preview_url, mode: 'gated', label });
  }
  return targets;
}

// ── Reporting ─────────────────────────────────────────────────────────────────

function appendAlertLog(report, now) {
  const lines = report.failures.map((f) =>
    JSON.stringify({
      ts: now,
      type: 'site_health',
      message:
        `${f.label} (${f.mode}) failed health check: ` +
        (f.error ?? f.failed.map((c) => `${c.name} (${c.detail})`).join('; ')),
      url: f.url,
    }),
  );
  if (!lines.length) return;
  mkdirSync(dirname(LOG_PATH), { recursive: true });
  appendFileSync(LOG_PATH, lines.map((l) => `${l}\n`).join(''), 'utf8');
}

function printReport(report) {
  for (const t of report.targets) {
    console.log(`${t.ok ? '✓' : '✖'} ${t.label} [${t.mode}] ${t.url}`);
    if (t.error) console.log(`    fetch error: ${t.error}`);
    for (const c of t.failed) console.log(`    ✖ ${c.name} — ${c.detail}`);
  }
  console.log(
    report.targets.length === 0
      ? 'Nothing to check — no targets given and no leads carry a live_url/preview_url yet.'
      : report.ok
        ? `\n✓ ${report.targets.length} site(s) healthy.`
        : `\n✖ ${report.failures.length} of ${report.targets.length} site(s) UNHEALTHY.`,
  );
}

function parseArgs(argv) {
  const o = { urls: [], gatedUrls: [], dryRun: false, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') o.urls.push(argv[++i]);
    else if (a === '--gated-url') o.gatedUrls.push(argv[++i]);
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else {
      console.error(`Unknown argument: ${a} (see --help)`);
      process.exitCode = 1;
      o.help = true;
    }
  }
  return o;
}

function printHelp() {
  console.log(
    'fleet-health — health-check client sites with the factory\'s own go-live assertions\n\n' +
      'Usage: node scripts/fleet-health.mjs [--url <u>]... [--gated-url <u>]... [--dry-run] [--json]\n\n' +
      'No --url args → falls back to Supabase leads (live_url → live checks, preview_url → gated checks).\n' +
      'Failures append docs/ops/alert-log.jsonl and post to DISCORD_WEBHOOK_URL (skipped with --dry-run).\n' +
      'Exit: 0 healthy · 2 failures · 1 usage/env error',
  );
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    printHelp();
    return;
  }

  let targets = [
    ...o.urls.map((url) => ({ url, mode: /** @type {const} */ ('live') })),
    ...o.gatedUrls.map((url) => ({ url, mode: /** @type {const} */ ('gated') })),
  ];
  if (targets.length === 0) {
    const fromLeads = await targetsFromLeads();
    if (fromLeads === null) {
      process.exitCode = 1;
      return;
    }
    targets = fromLeads;
  }

  const now = new Date().toISOString();
  const report = await checkTargets(targets);

  if (o.json) console.log(JSON.stringify({ ts: now, dryRun: o.dryRun, ...report }, null, 2));
  else printReport(report);

  if (!report.ok && !o.dryRun) {
    appendAlertLog(report, now);
    const text =
      `🩺 fleet-health: ${report.failures.length} site(s) unhealthy\n` +
      report.failures
        .map((f) => `• ${f.label} (${f.mode}): ${f.error ?? f.failed.map((c) => c.name).join(', ')}`)
        .join('\n');
    await postToDiscord(text); // fail-soft: never throws, skips without DISCORD_WEBHOOK_URL
  }

  if (!report.ok) process.exitCode = 2;
}

function isMain() {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(resolve(entry)).href;
}

if (isMain()) {
  await main();
}
