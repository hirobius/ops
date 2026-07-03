#!/usr/bin/env node
/**
 * scripts/outscraper-fetch.mjs
 *
 * Intake stage for the rapid-proposal consulting model: scrape local businesses
 * from Google Maps via Outscraper, score each as a "mock-site candidate," and
 * (optionally) scaffold a per-prospect client folder the /ops dashboard already
 * renders. Pure normalize/score/dedupe lives in ./lib/outscraper-normalize.mjs;
 * this file is the network + filesystem shell around it.
 *
 * FULLY TESTABLE OFFLINE — no API key needed:
 *   # See the exact request that would be sent (no key, no network):
 *   node scripts/outscraper-fetch.mjs --query "dentists, Austin TX" --limit 20 --dry-run
 *
 *   # Run the whole normalize/score/scaffold path against a checked-in fixture:
 *   node scripts/outscraper-fetch.mjs --fixture fixtures/outscraper-maps-search/response.json --json
 *
 * LIVE (the human sets the key in their shell or an --env-file; agents never
 * touch .env* files — see ops/CLAUDE.md hard rule #0):
 *   export OUTSCRAPER_API_KEY=...
 *   node scripts/outscraper-fetch.mjs --query "roofers, Boise ID" --limit 20 --out --scaffold-clients
 *   # or, to load a local env file without exporting:
 *   node --env-file=.env.local scripts/outscraper-fetch.mjs --query "..." --out
 *
 * OUTPUT (gitignored — scraped records are PII, same policy as clients/*):
 *   <out-dir>/prospects/<runId>/batch.json      full ProspectBatch
 *   <out-dir>/prospects/<runId>/prospects.csv   flat, spreadsheet-friendly
 *   <out-dir>/clients/<slug>/meta.json          dashboard record (status:"prospect")
 *   <out-dir>/clients/<slug>/prospect.json      signals for the downstream site build
 *
 * FLAGS:
 *   --query "<q>"        search query; repeatable for multiple queries
 *   --limit <n>          max results per query (default 20)
 *   --language <l>       Outscraper `language` (default en)
 *   --region <r>         Outscraper `region` (default us)
 *   --async              use Outscraper's async submit+poll flow (default sync)
 *   --fixture <path>     read a saved response JSON instead of calling the API
 *   --dry-run            print the request(s) and exit; no key, no network
 *   --out                write prospects/<runId>/{batch.json,prospects.csv}
 *   --scaffold-clients   scaffold clients/<slug>/ folders for the top prospects
 *   --top <n>            how many top prospects to scaffold (default 5)
 *   --out-dir <dir>      base dir for all output (default: repo root)
 *   --json               print a machine-readable JSON summary
 *   --help               show this help
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { normalizeResponse } from './lib/outscraper-normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = process.env.OUTSCRAPER_API_BASE || 'https://api.app.outscraper.com';

// ── arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    queries: [],
    limit: 20,
    language: 'en',
    region: 'us',
    async: false,
    fixture: null,
    dryRun: false,
    out: false,
    scaffold: false,
    top: 5,
    outDir: ROOT,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--query': opts.queries.push(next()); break;
      case '--limit': opts.limit = Number(next()); break;
      case '--language': opts.language = next(); break;
      case '--region': opts.region = next(); break;
      case '--async': opts.async = true; break;
      case '--fixture': opts.fixture = next(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--out': opts.out = true; break;
      case '--scaffold-clients': opts.scaffold = true; break;
      case '--top': opts.top = Number(next()); break;
      case '--out-dir': opts.outDir = path.resolve(next()); break;
      case '--json': opts.json = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        console.error(`Unknown flag: ${a}`);
        opts.help = true;
    }
  }
  return opts;
}

function printHelp() {
  // The banner comment is the canonical usage; keep this in sync with it.
  console.log(
    `Usage: node scripts/outscraper-fetch.mjs [--query "<q>" ...] [flags]\n\n` +
      `  --query "<q>"       search query; repeatable\n` +
      `  --limit <n>         results per query (default 20)\n` +
      `  --language <l>      default en\n` +
      `  --region <r>        default us\n` +
      `  --async             async submit+poll flow\n` +
      `  --fixture <path>    normalize a saved response instead of calling the API\n` +
      `  --dry-run           print the request(s) and exit (no key, no network)\n` +
      `  --out               write prospects/<runId>/{batch.json,prospects.csv}\n` +
      `  --scaffold-clients  scaffold clients/<slug>/ for the top prospects\n` +
      `  --top <n>           how many to scaffold (default 5)\n` +
      `  --out-dir <dir>     base dir for output (default: repo root)\n` +
      `  --json              machine-readable summary\n`,
  );
}

// ── request building ─────────────────────────────────────────────────────────

/** Build the GET URL for one query against /maps/search-v3. */
function buildRequestUrl(query, opts) {
  const u = new URL(`${API_BASE}/maps/search-v3`);
  u.searchParams.set('query', query);
  u.searchParams.set('limit', String(opts.limit));
  u.searchParams.set('language', opts.language);
  u.searchParams.set('region', opts.region);
  u.searchParams.set('async', String(opts.async));
  return u.toString();
}

// ── API client ───────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch one query synchronously (async=false): Outscraper blocks and returns
 * { status:"Success", data:[[...places]] }. Returns the raw place array for
 * this query (the first element of `data`).
 */
async function fetchQuerySync(query, opts, apiKey) {
  const res = await fetch(buildRequestUrl(query, opts), {
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`Outscraper ${res.status} ${res.statusText} for query "${query}"`);
  }
  const body = await res.json();
  // `data` is one array of places PER submitted query; we submit one at a time.
  return Array.isArray(body?.data) ? body.data : [];
}

/**
 * Async flow: submit (async=true) -> 202 { id, results_location } -> poll
 * GET /requests/{id} until status:"Success". Returns this query's `data`.
 */
async function fetchQueryAsync(query, opts, apiKey) {
  const submit = await fetch(buildRequestUrl(query, { ...opts, async: true }), {
    headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
  });
  const submitBody = await submit.json();
  const id = submitBody?.id;
  if (!id) throw new Error(`Async submit returned no request id for "${query}"`);

  const pollUrl = submitBody.results_location || `${API_BASE}/requests/${id}`;
  for (let attempt = 0; attempt < 60; attempt++) {
    await sleep(5000);
    const poll = await fetch(pollUrl, {
      headers: { 'X-API-KEY': apiKey, Accept: 'application/json' },
    });
    const pollBody = await poll.json();
    const status = String(pollBody?.status || '').toLowerCase();
    if (status === 'success') return Array.isArray(pollBody?.data) ? pollBody.data : [];
    if (status === 'error' || status === 'failed') {
      throw new Error(`Async request ${id} failed: ${JSON.stringify(pollBody)}`);
    }
  }
  throw new Error(`Async request ${id} did not complete within the poll window`);
}

/** Run every query, concatenating each query's data (array-of-place-arrays). */
async function fetchAll(opts, apiKey) {
  const data = [];
  for (const q of opts.queries) {
    const one = opts.async
      ? await fetchQueryAsync(q, opts, apiKey)
      : await fetchQuerySync(q, opts, apiKey);
    // Tag each place with the query that surfaced it (Outscraper usually echoes
    // `query`, but not always) so provenance survives into the Prospect.
    for (const arr of one) {
      if (Array.isArray(arr)) arr.forEach((p) => { if (p && !p.query) p.query = q; });
    }
    data.push(...one);
  }
  return data;
}

// ── output writers ───────────────────────────────────────────────────────────

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(prospects) {
  const cols = [
    'leadScore', 'name', 'category', 'city', 'region', 'phone', 'website',
    'sitePresence', 'reviews', 'rating', 'ownerVerified', 'operational',
    'placeId', 'mapsUrl', 'sourceQuery', 'slug',
  ];
  const rows = prospects.map((p) => [
    p.signals.leadScore, p.name, p.category, p.city, p.region, p.phone, p.website,
    p.signals.sitePresence, p.reviews, p.rating, p.signals.ownerVerified,
    p.signals.operational, p.placeId, p.mapsUrl, p.sourceQuery, p.slug,
  ].map(csvCell).join(','));
  return [cols.join(','), ...rows].join('\n') + '\n';
}

/** Dashboard record — mirrors clients/_template/meta.json, status "prospect". */
function toMeta(p, runId) {
  return {
    id: p.slug,
    name: p.name,
    website: p.website || null,
    contact: { name: null, role: null, email: null, phone: p.phone || null },
    location: [p.city, p.region].filter(Boolean).join(', '),
    type: p.category || null,
    scale: { customers: null, policies: null, employees: null },
    engagementType: 'Cold-outreach spec site (prospect)',
    startDate: null,
    status: 'prospect',
    serviceModel:
      'Hirobius: software vendor — code runs on customer infrastructure, customer remains data controller',
    domains: [],
    portalUrl: {},
    figmaFileUrl: {},
    referredBy: null,
    notes: `Sourced via Outscraper prospecting run ${runId} — query "${p.sourceQuery}". Unverified scraped data; confirm all business facts before outreach.`,
  };
}

function writeOutput(batch, opts) {
  const written = [];
  const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });

  if (opts.out) {
    const dir = path.join(opts.outDir, 'prospects', batch.runId);
    mkdirp(dir);
    const batchPath = path.join(dir, 'batch.json');
    const csvPath = path.join(dir, 'prospects.csv');
    fs.writeFileSync(batchPath, JSON.stringify(batch, null, 2) + '\n');
    fs.writeFileSync(csvPath, toCsv(batch.prospects));
    written.push(batchPath, csvPath);
  }

  if (opts.scaffold) {
    const top = batch.prospects.slice(0, opts.top);
    for (const p of top) {
      const dir = path.join(opts.outDir, 'clients', p.slug);
      mkdirp(dir);
      const metaPath = path.join(dir, 'meta.json');
      const prospectPath = path.join(dir, 'prospect.json');
      fs.writeFileSync(metaPath, JSON.stringify(toMeta(p, batch.runId), null, 2) + '\n');
      fs.writeFileSync(prospectPath, JSON.stringify({ runId: batch.runId, ...p }, null, 2) + '\n');
      written.push(metaPath, prospectPath);
    }
  }
  return written;
}

// ── reporting ────────────────────────────────────────────────────────────────

function printRanking(batch) {
  console.log(`\nRun ${batch.runId} — ${batch.prospects.length} prospects (from ${batch.rawCount} raw):\n`);
  for (const p of batch.prospects.slice(0, 20)) {
    const s = p.signals;
    const loc = [p.city, p.region].filter(Boolean).join(', ');
    console.log(
      `  [${String(s.leadScore).padStart(3)}] ${p.name}` +
        `  ·  ${s.sitePresence}, ${p.reviews} reviews` +
        `${s.ownerVerified ? ', verified' : ''}${s.operational ? '' : ', CLOSED'}` +
        `${loc ? `  ·  ${loc}` : ''}`,
    );
  }
  if (batch.prospects.length > 20) console.log(`  … and ${batch.prospects.length - 20} more`);
}

// ── main ─────────────────────────────────────────────────────────────────────

/** Timestamp-derived run id, e.g. 2026-07-03T2319-a3f. Stable within a run. */
function makeRunId() {
  const iso = new Date().toISOString().replace(/:/g, '').replace(/\..+/, '').replace('T', 'T');
  const rand = Math.random().toString(36).slice(2, 5);
  return `${iso.slice(0, 13)}-${rand}`;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { printHelp(); process.exit(0); }

  // ── resolve the raw response `data` (fixture, dry-run, or live) ──
  let data;
  if (opts.fixture) {
    const raw = JSON.parse(fs.readFileSync(path.resolve(opts.fixture), 'utf8'));
    // Accept either a full { status, data } body or a bare data array.
    data = Array.isArray(raw) ? raw : raw?.data ?? [];
    if (opts.queries.length === 0) opts.queries = ['(fixture)'];
  } else {
    if (opts.queries.length === 0) {
      console.error('No --query given. Pass at least one --query "<q>", or use --fixture <path>.');
      printHelp();
      process.exit(1);
    }
    if (opts.dryRun) {
      console.log('DRY RUN — no key used, no network call. Requests that WOULD be sent:\n');
      for (const q of opts.queries) {
        console.log(`  GET ${buildRequestUrl(q, opts)}`);
        console.log(`      header: X-API-KEY: <OUTSCRAPER_API_KEY>\n`);
      }
      console.log(`Sync mode returns { status:"Success", data:[[...places]] } per query.`);
      console.log(`Add --out and/or --scaffold-clients to persist results on a live run.`);
      process.exit(0);
    }
    const apiKey = process.env.OUTSCRAPER_API_KEY;
    if (!apiKey) {
      console.error(
        'OUTSCRAPER_API_KEY is not set. Export it in your shell, or run with\n' +
          '  node --env-file=.env.local scripts/outscraper-fetch.mjs ...\n' +
          '(Agents never read or write .env* files — set the key yourself.)\n' +
          'To preview the request without a key, add --dry-run.',
      );
      process.exit(1);
    }
    data = await fetchAll(opts, apiKey);
  }

  // ── normalize + score + dedupe (pure) ──
  const rawCount = Array.isArray(data)
    ? data.reduce((n, e) => n + (Array.isArray(e) ? e.length : 1), 0)
    : 0;
  const prospects = normalizeResponse(data);
  const batch = { runId: makeRunId(), queries: opts.queries, rawCount, prospects };

  // ── persist + report ──
  const written = opts.out || opts.scaffold ? writeOutput(batch, opts) : [];

  if (opts.json) {
    console.log(JSON.stringify({
      runId: batch.runId,
      queries: batch.queries,
      rawCount: batch.rawCount,
      prospectCount: batch.prospects.length,
      written,
      prospects: batch.prospects,
    }, null, 2));
  } else {
    printRanking(batch);
    if (written.length) {
      console.log(`\nWrote ${written.length} file(s):`);
      for (const f of written) console.log(`  ${path.relative(opts.outDir, f)}`);
    } else {
      console.log(`\n(no files written — add --out and/or --scaffold-clients to persist)`);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
