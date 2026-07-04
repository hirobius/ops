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
import { buildQueries, PRESET_NAMES } from './lib/query-presets.mjs';
import { prospectsToLeadRows } from './lib/prospect-to-lead.mjs';

// Outscraper Google Maps search: 500 records/month free per service, then
// ~$3/1,000. Used only for the dry-run estimate; verify current pricing.
const FREE_RECORDS = 500;
const COST_PER_1K = 3;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const API_BASE = process.env.OUTSCRAPER_API_BASE || 'https://api.app.outscraper.com';

// ── arg parsing ────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const opts = {
    queries: [],
    preset: null,
    limit: 20,
    language: 'en',
    region: 'us',
    async: false,
    fixture: null,
    dryRun: false,
    out: false,
    scaffold: false,
    supabase: false,
    ingestBatch: null,
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
      case '--preset': opts.preset = next(); break;
      case '--limit': opts.limit = Number(next()); break;
      case '--language': opts.language = next(); break;
      case '--region': opts.region = next(); break;
      case '--async': opts.async = true; break;
      case '--fixture': opts.fixture = next(); break;
      case '--dry-run': opts.dryRun = true; break;
      case '--out': opts.out = true; break;
      case '--scaffold-clients': opts.scaffold = true; break;
      case '--supabase': opts.supabase = true; break;
      case '--ingest-batch': opts.ingestBatch = next(); break;
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
      `  --preset <name>     expand a built-in query matrix (${PRESET_NAMES.join(', ')})\n` +
      `  --limit <n>         results per query (default 20)\n` +
      `  --language <l>      default en\n` +
      `  --region <r>        default us\n` +
      `  --async             async submit+poll flow\n` +
      `  --fixture <path>    normalize a saved response instead of calling the API\n` +
      `  --dry-run           print the request(s) and exit (no key, no network)\n` +
      `  --out               write prospects/<runId>/{batch.json,prospects.csv}\n` +
      `  --scaffold-clients  scaffold clients/<slug>/ for the top prospects\n` +
      `  --supabase          upsert scored leads to Supabase (onConflict place_id)\n` +
      `  --ingest-batch <p>  backfill a saved batch/summary JSON (no scrape); pair with --supabase\n` +
      `  --top <n>           how many to scaffold (default 5)\n` +
      `  --out-dir <dir>     base dir for output (default: repo root)\n` +
      `  --json              machine-readable summary\n` +
      `\nSupabase needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (human-set, never in\n` +
      `.env by an agent) and @supabase/supabase-js installed. In this proxied env run\n` +
      `with NODE_USE_ENV_PROXY=1 (Node >=22.21) so writes traverse the egress proxy.\n` +
      `Preview the exact rows with --supabase --dry-run (needs --fixture/--ingest-batch).\n`,
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
    'leadScore', 'buildScore', 'name', 'category', 'city', 'region', 'phone', 'website',
    'sitePresence', 'reviews', 'rating', 'ownerVerified', 'operational',
    'placeId', 'mapsUrl', 'sourceQuery', 'slug',
  ];
  const rows = prospects.map((p) => [
    p.signals.leadScore, p.signals.buildScore, p.name, p.category, p.city, p.region, p.phone, p.website,
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

// ── Supabase upsert ──────────────────────────────────────────────────────────

/**
 * Map the batch's prospects to `leads` rows and upsert them (onConflict place_id).
 * With opts.dryRun this prints the rows that WOULD be written and returns without
 * importing @supabase/supabase-js or touching the DB — a no-key, no-package smoke
 * test of the exact payload. Otherwise it dynamically imports the server client
 * (kept out of the offline/fixture/dry paths on purpose) and writes.
 * @returns {Promise<{upserted:number, dryRun?:boolean, rows:number, error?:string}>}
 */
async function upsertBatchToSupabase(batch, opts) {
  const rows = prospectsToLeadRows(batch.prospects, batch.runId);

  if (opts.dryRun) {
    if (!opts.json) {
      console.log(
        `\n--supabase --dry-run — ${rows.length} row(s) that WOULD upsert to \`leads\` ` +
          `(no DB, no @supabase import):\n`,
      );
    }
    console.log(JSON.stringify(rows, null, 2));
    return { upserted: 0, dryRun: true, rows: rows.length };
  }

  if (rows.length === 0) return { upserted: 0, rows: 0 };

  // Guarded imports — only here, so fixture/dry/offline runs never need the package.
  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const { upsertLeads } = await import('../lib/supabase/leads.mjs');
  const sb = await getServiceClient();
  const { error } = await upsertLeads(sb, rows);
  if (error) return { upserted: 0, rows: rows.length, error: error.message || String(error) };
  return { upserted: rows.length, rows: rows.length };
}

/** Load a previously saved batch/summary JSON (has a `prospects` array) for
 *  --ingest-batch backfill — no scrape, no API spend. */
function loadBatch(filePath) {
  const raw = JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
  const prospects = Array.isArray(raw?.prospects) ? raw.prospects : [];
  return {
    runId: raw?.runId || makeRunId(),
    queries: Array.isArray(raw?.queries) ? raw.queries : [],
    rawCount: raw?.rawCount ?? prospects.length,
    prospects,
  };
}

// ── reporting ────────────────────────────────────────────────────────────────

function printRanking(batch) {
  console.log(`\nRun ${batch.runId} — ${batch.prospects.length} prospects (from ${batch.rawCount} raw):`);
  console.log(`  [need/build] name  ·  presence, reviews  ·  location\n`);
  for (const p of batch.prospects.slice(0, 20)) {
    const s = p.signals;
    const loc = [p.city, p.region].filter(Boolean).join(', ');
    const build = s.buildScore === undefined ? '  -' : String(s.buildScore).padStart(3);
    console.log(
      `  [${String(s.leadScore).padStart(3)}/${build}] ${p.name}` +
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

  // Expand a preset matrix into individual queries (in addition to any --query).
  if (opts.preset) {
    try {
      opts.queries.push(...buildQueries(opts.preset));
    } catch (err) {
      console.error(String(err.message || err));
      process.exit(1);
    }
  }

  // ── --ingest-batch: backfill a previously saved batch, no scrape ──
  let batch;
  if (opts.ingestBatch) {
    batch = loadBatch(opts.ingestBatch);
    if (batch.prospects.length === 0) {
      console.error(`No prospects found in ${opts.ingestBatch} (expected a { prospects: [...] } summary).`);
      process.exit(1);
    }
    if (!opts.supabase && !opts.out) {
      console.error('--ingest-batch loads a saved batch to persist it. Add --supabase (backfill DB) or --out.');
    }
    await persistAndReport(batch, opts);
    return;
  }

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
      const preview = opts.queries.slice(0, 8);
      console.log('DRY RUN — no key used, no network call. Requests that WOULD be sent:\n');
      for (const q of preview) {
        console.log(`  GET ${buildRequestUrl(q, opts)}`);
        console.log(`      header: X-API-KEY: <OUTSCRAPER_API_KEY>\n`);
      }
      if (opts.queries.length > preview.length) {
        console.log(`  … and ${opts.queries.length - preview.length} more queries\n`);
      }
      // Size + cost estimate. `limit` is an upper bound per query; real record
      // counts are usually lower, so this is a worst-case ceiling.
      const maxRecords = opts.queries.length * opts.limit;
      const billable = Math.max(0, maxRecords - FREE_RECORDS);
      const estCost = (billable / 1000) * COST_PER_1K;
      console.log(
        `Queries: ${opts.queries.length}  ·  limit ${opts.limit}/query  ·  ` +
          `up to ${maxRecords} records (worst case)`,
      );
      console.log(
        `Est. cost ceiling: ${billable === 0 ? 'FREE (within the 500-record/mo tier)' : `~$${estCost.toFixed(2)}`}` +
          ` (500 free/mo, then ~$${COST_PER_1K}/1k — verify current Outscraper pricing).`,
      );
      console.log(`\nSync mode returns { status:"Success", data:[[...places]] } per query.`);
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
  batch = { runId: makeRunId(), queries: opts.queries, rawCount, prospects };

  await persistAndReport(batch, opts);
}

/** Shared tail: upsert to Supabase (if asked), write files (if asked), report. */
async function persistAndReport(batch, opts) {
  // Supabase first so a --supabase --dry-run can print the payload and exit before
  // any file I/O or ranking noise.
  let supabase = null;
  if (opts.supabase) {
    supabase = await upsertBatchToSupabase(batch, opts);
    if (supabase.dryRun) process.exit(0);
  }

  const written = opts.out || opts.scaffold ? writeOutput(batch, opts) : [];

  if (opts.json) {
    console.log(JSON.stringify({
      runId: batch.runId,
      queries: batch.queries,
      rawCount: batch.rawCount,
      prospectCount: batch.prospects.length,
      written,
      supabase,
      prospects: batch.prospects,
    }, null, 2));
  } else {
    printRanking(batch);
    if (written.length) {
      console.log(`\nWrote ${written.length} file(s):`);
      for (const f of written) console.log(`  ${path.relative(opts.outDir, f)}`);
    }
    if (supabase) {
      console.log(
        supabase.error
          ? `\nSupabase upsert FAILED: ${supabase.error}`
          : `\nSupabase: upserted ${supabase.upserted} lead(s) (onConflict place_id).`,
      );
    }
    if (!written.length && !supabase) {
      console.log(`\n(nothing persisted — add --out, --scaffold-clients, and/or --supabase)`);
    }
  }
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exit(1);
});
