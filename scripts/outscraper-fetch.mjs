#!/usr/bin/env node
/**
 * scripts/outscraper-fetch.mjs
 *
 * Outscraper Google-Maps search → normalized prospect batch. This is the
 * intake stage of the rapid-proposal pipeline: scrape local businesses, score
 * them as mock-site candidates, and optionally scaffold a clients/<slug>/
 * folder per prospect so the /ops dashboard and the site-build step can pick
 * them up. See docs/prospecting/outscraper-pipeline.md.
 *
 * ── API contract (Outscraper) ───────────────────────────────────────────────
 *   Base:   https://api.app.outscraper.com
 *   Auth:   header  X-API-KEY: <key>
 *   Search: GET /maps/search-v3?query=<q>&limit=<n>&language=<l>&region=<r>&async=<bool>
 *   Async:  a 202 returns { id, status:"Pending", results_location } — poll
 *           GET /requests/{id} (same X-API-KEY) until status:"Success", then
 *           `.data` holds one array of places per submitted query.
 *   Sync:   async=false blocks and returns the finished { status, data } body.
 *
 * ── Credentials (set by the human — Hirobius never touches .env) ─────────────
 *   OUTSCRAPER_API_KEY   required for a live call. Not needed for --dry-run or
 *                        --fixture. If unset, live mode exits 2 with guidance.
 *
 * ── Usage ───────────────────────────────────────────────────────────────────
 *   # See the exact request without a key or a network call:
 *   node scripts/outscraper-fetch.mjs --query "dentists, Austin TX" --dry-run
 *
 *   # Exercise the full normalize/score/scaffold path offline against a fixture:
 *   node scripts/outscraper-fetch.mjs --fixture fixtures/outscraper-maps-search/response.json
 *
 *   # Live pull (needs OUTSCRAPER_API_KEY), 20 places, write prospects JSON:
 *   node scripts/outscraper-fetch.mjs --query "roofers, Boise ID" --limit 20 --out
 *
 *   # ...and scaffold a local clients/<slug>/ folder per prospect (gitignored):
 *   node scripts/outscraper-fetch.mjs --fixture <f> --scaffold-clients
 *
 * Flags:
 *   --query <str>        search query (repeatable). Required for live/dry-run.
 *   --limit <n>          places per query (default 20).
 *   --language <l>       default "en".  --region <r> default "US".
 *   --async              use the async 202+poll flow (default sync async=false).
 *   --fixture <path>     read a saved Outscraper JSON instead of calling the API.
 *   --dry-run            print the request that would be sent; no network, no key.
 *   --out                write prospects to prospects/<timestamp>/ (gitignored).
 *   --scaffold-clients   also write clients/<slug>/meta.json (gitignored) per
 *                        prospect, status:"prospect", from clients/_template.
 *   --top <n>            when scaffolding, only the top-N by leadScore (default 5).
 *   --json               machine-readable summary to stdout.
 *
 * Output (with --out): prospects/<ISO>/batch.json + prospects.csv (gitignored).
 *
 * @module outscraper-fetch
 */

import { promises as fsp, existsSync, readFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeResponse } from './lib/outscraper-normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = process.env.OUTSCRAPER_API_BASE || 'https://api.app.outscraper.com';
const SEARCH_PATH = '/maps/search-v3';
const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 180000;

// ── Args ─────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
function flag(name) { return argv.includes(`--${name}`); }
function values(name) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith('--')) out.push(argv[i + 1]);
  }
  return out;
}
function value(name, fallback) { const v = values(name); return v.length ? v[0] : fallback; }

const opts = {
  queries: values('query'),
  limit: Number(value('limit', '20')) || 20,
  language: value('language', 'en'),
  region: value('region', 'US'),
  useAsync: flag('async'),
  fixture: value('fixture', null),
  dryRun: flag('dry-run'),
  out: flag('out'),
  scaffold: flag('scaffold-clients'),
  top: Number(value('top', '5')) || 5,
  json: flag('json'),
};

// ── Request building ─────────────────────────────────────────────────────────

/** Build the search URL exactly as the live call would send it. */
function buildSearchUrl() {
  const u = new URL(API_BASE + SEARCH_PATH);
  for (const q of opts.queries) u.searchParams.append('query', q);
  u.searchParams.set('limit', String(opts.limit));
  u.searchParams.set('language', opts.language);
  u.searchParams.set('region', opts.region);
  u.searchParams.set('async', String(opts.useAsync));
  return u;
}

/** Redact the key for logging: keep first 4 chars. */
function redact(key) { return key ? `${key.slice(0, 4)}…(${key.length} chars)` : '<unset>'; }

// ── Live fetch (sync + async poll) ───────────────────────────────────────────

async function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/** @returns {Promise<import('./lib/outscraper-normalize.mjs').OutscraperEnvelope>} */
async function fetchLive(apiKey) {
  const url = buildSearchUrl();
  const headers = { 'X-API-KEY': apiKey, Accept: 'application/json' };
  const res = await fetch(url, { headers });

  // 202 → async job accepted; poll results_location (or /requests/{id}).
  if (res.status === 202 || opts.useAsync) {
    const body = await res.json().catch(() => ({}));
    const pollUrl = body.results_location || (body.id ? `${API_BASE}/requests/${body.id}` : null);
    if (!pollUrl) throw new Error(`async accepted but no results_location/id in response: ${JSON.stringify(body).slice(0, 200)}`);
    return pollResults(pollUrl, headers);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Outscraper HTTP ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function pollResults(pollUrl, headers) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await fetch(pollUrl, { headers });
    const body = await res.json().catch(() => ({}));
    const status = body.status;
    if (status === 'Success' || status === 'Completed') return body;
    if (status === 'Error' || status === 'Failed') throw new Error(`Outscraper job failed: ${JSON.stringify(body).slice(0, 200)}`);
    if (Date.now() > deadline) throw new Error(`Outscraper poll timed out after ${POLL_TIMEOUT_MS}ms (last status: ${status})`);
    process.stderr.write(`  …job ${status ?? 'pending'}, retrying in ${POLL_INTERVAL_MS / 1000}s\n`);
    await sleep(POLL_INTERVAL_MS);
  }
}

// ── Scaffold clients/<slug> (local-only; clients/* is gitignored) ────────────

/** Load the clients/_template/meta.json as the base for a prospect meta. */
function templateMeta() {
  const p = path.join(ROOT, 'clients/_template/meta.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** @param {import('./lib/outscraper-normalize.mjs').ProspectRecord} prospect */
async function scaffoldClient(prospect) {
  const dir = path.join(ROOT, 'clients', prospect.slug);
  if (existsSync(dir)) return { slug: prospect.slug, skipped: true };
  mkdirSync(dir, { recursive: true });
  const meta = {
    ...templateMeta(),
    id: prospect.slug,
    name: prospect.name,
    website: prospect.website ?? '',
    contact: { name: '', role: '', email: '', phone: prospect.phone ?? '' },
    location: [prospect.city, prospect.region].filter(Boolean).join(', '),
    type: prospect.category ?? 'Local business',
    status: 'prospect',
    referredBy: 'outscraper',
    notes: `Auto-scaffolded from Outscraper. leadScore=${prospect.signals.leadScore}, sitePresence=${prospect.signals.sitePresence}, reviews=${prospect.reviews}, rating=${prospect.rating ?? 'n/a'}. Source query: ${prospect.sourceQuery ?? 'n/a'}.`,
  };
  await fsp.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');
  // Keep the scraped signal alongside meta for the site-build step.
  await fsp.writeFile(path.join(dir, 'prospect.json'), JSON.stringify(prospect, null, 2) + '\n');
  return { slug: prospect.slug, skipped: false };
}

// ── Output writers ───────────────────────────────────────────────────────────

function toCsv(prospects) {
  const cols = ['slug', 'name', 'category', 'city', 'region', 'phone', 'website', 'rating', 'reviews', 'leadScore', 'sitePresence'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = prospects.map((p) => [p.slug, p.name, p.category, p.city, p.region, p.phone, p.website, p.rating, p.reviews, p.signals.leadScore, p.signals.sitePresence].map(esc).join(','));
  return [cols.join(','), ...rows].join('\n') + '\n';
}

async function writeBatch(batch) {
  // Timestamp comes from mtime-free ISO; Date is fine in a script (not a workflow).
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = path.join(ROOT, 'prospects', stamp);
  mkdirSync(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, 'batch.json'), JSON.stringify(batch, null, 2) + '\n');
  await fsp.writeFile(path.join(dir, 'prospects.csv'), toCsv(batch.prospects));
  return dir;
}

// ── Main ─────────────────────────────────────────────────────────────────────

function die(msg, code = 1) { process.stderr.write(`✗ ${msg}\n`); process.exit(code); }

async function main() {
  // 1. Resolve the source of raw data: fixture | dry-run | live.
  let raw;

  if (opts.fixture) {
    const fp = path.isAbsolute(opts.fixture) ? opts.fixture : path.join(ROOT, opts.fixture);
    if (!existsSync(fp)) die(`fixture not found: ${fp}`);
    raw = JSON.parse(readFileSync(fp, 'utf8'));
    process.stderr.write(`• source: fixture ${path.relative(ROOT, fp)}\n`);
  } else if (opts.dryRun) {
    if (!opts.queries.length) die('--dry-run needs at least one --query');
    const url = buildSearchUrl();
    const preview = {
      method: 'GET',
      url: url.toString(),
      headers: { 'X-API-KEY': redact(process.env.OUTSCRAPER_API_KEY), Accept: 'application/json' },
      note: 'No request sent (--dry-run). Set OUTSCRAPER_API_KEY and drop --dry-run to run it for real.',
    };
    process.stdout.write(JSON.stringify(preview, null, 2) + '\n');
    return;
  } else {
    if (!opts.queries.length) die('provide at least one --query (or use --fixture / --dry-run)');
    const apiKey = process.env.OUTSCRAPER_API_KEY;
    if (!apiKey) {
      die('OUTSCRAPER_API_KEY is not set. It must be exported in your shell / .env.local (Hirobius never edits .env files). Use --dry-run to preview the request or --fixture to test the pipeline offline.', 2);
    }
    process.stderr.write(`• live call → ${API_BASE}${SEARCH_PATH} (key ${redact(apiKey)})\n`);
    raw = await fetchLive(apiKey);
  }

  // 2. Normalize → score → dedupe.
  const batch = normalizeResponse(raw);

  // 3. Report.
  process.stderr.write(`• normalized ${batch.rawCount} raw → ${batch.prospects.length} prospects across ${batch.queries.length} quer${batch.queries.length === 1 ? 'y' : 'ies'}\n`);
  const top = batch.prospects.slice(0, Math.min(opts.top, batch.prospects.length));
  for (const p of top) {
    process.stderr.write(`   [${String(p.signals.leadScore).padStart(3)}] ${p.name} — ${p.signals.sitePresence}, ${p.reviews} reviews${p.rating ? `, ${p.rating}★` : ''}\n`);
  }

  // 4. Optional writes.
  let outDir = null;
  if (opts.out) { outDir = await writeBatch(batch); process.stderr.write(`• wrote ${path.relative(ROOT, outDir)}/{batch.json,prospects.csv}\n`); }

  let scaffolded = [];
  if (opts.scaffold) {
    for (const p of top) scaffolded.push(await scaffoldClient(p));
    const made = scaffolded.filter((s) => !s.skipped).length;
    process.stderr.write(`• scaffolded ${made} clients/<slug>/ folder(s) (${scaffolded.length - made} already existed) — local-only, gitignored\n`);
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({
      queries: batch.queries,
      rawCount: batch.rawCount,
      prospectCount: batch.prospects.length,
      outDir: outDir ? path.relative(ROOT, outDir) : null,
      scaffolded,
      top: top.map((p) => ({ slug: p.slug, name: p.name, leadScore: p.signals.leadScore, sitePresence: p.signals.sitePresence })),
    }, null, 2) + '\n');
  }
}

main().catch((err) => die(err instanceof Error ? err.message : String(err)));
