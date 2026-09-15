#!/usr/bin/env node
/**
 * scripts/export-call-list.mjs — produce the ordered call queue as CSV.
 *
 * Read-only. Never writes to Supabase; logging an outcome is scripts/log-call.mjs.
 *
 *   node scripts/export-call-list.mjs --limit 100 > calls.csv
 *   node scripts/export-call-list.mjs --limit 100 --city Tacoma
 *   node scripts/export-call-list.mjs --json
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Adrian-set; agents never read
 * or write .env* files).
 *
 * COMPLIANCE NOTE, deliberately in the file rather than only in a doc: these are
 * business numbers, and B2B calls to businesses sit largely outside the US
 * national Do-Not-Call registry — but state law varies, and several states
 * (Washington included, which is where most of this list is) require ALL-PARTY
 * consent to record a call. If you record, say so on the call.
 */

import { buildCallList } from '../lib/leads/call-list.mjs';

const PAGE = 1000;

function parseArgs(argv) {
  const o = { limit: 100, city: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--city') o.city = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`export-call-list.mjs — the ordered call queue, as CSV. Read-only.

Usage:
  node scripts/export-call-list.mjs [--limit <n>] [--city <name>] [--json]

Ordering favours leads with a REAL opening line (an audited site finding beats a
Maps-listing fact beats nothing) and never-dialled over already-dialled.

Eligibility differs from email on purpose: no email needed, no lead_score gate.
Excluded: no phone, suppressed, permanently closed, terminal outcome, ${'4'} attempts,
or a scheduled callback still in the future.

Flags:
  --limit <n>   Queue size (default 100).
  --city <name> Filter to one city.
  --json        Machine-readable instead of CSV.
  --help, -h    This message.
`);
}

/** RFC4180-ish: quote every field, double internal quotes. Phone numbers keep their +. */
function csvCell(v) {
  return `"${String(v ?? '').replace(/"/g, '""')}"`;
}

async function fetchLeads(sb, city) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb
      .from('leads')
      .select(
        'id,name,phone,city,region,category,website,review_count,rating,site_presence,site_issues,site_mobile_friendly,site_https,operational,do_not_contact,suppression_reason,call_attempts,call_outcome,callback_at,last_call_at',
      )
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (city) q = q.ilike('city', city);
    const { data, error } = await q;
    if (error) throw new Error(`Supabase read failed: ${error.message || error}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return printHelp();

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();
  const leads = await fetchLeads(sb, o.city);
  const out = buildCallList(leads, { limit: o.limit });

  if (o.json) {
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const cols = [
    'id',
    'name',
    'phone',
    'city',
    'category',
    'reviews',
    'rating',
    'website',
    'opening_line',
    'hook_basis',
    'attempts',
  ];
  console.log(cols.map(csvCell).join(','));
  for (const q of out.queue) {
    const l = q.lead;
    console.log(
      [
        l.id,
        l.name,
        l.phone,
        l.city || l.region,
        l.category,
        l.review_count ?? 0,
        l.rating ?? '',
        l.website || '',
        q.hook?.hook || '',
        q.hook?.basis || 'none',
        l.call_attempts ?? 0,
      ]
        .map(csvCell)
        .join(','),
    );
  }

  // Summary to stderr so `> calls.csv` stays clean.
  console.error(
    `\n${out.queue.length} queued of ${out.eligibleTotal} eligible (${out.skipped} skipped).\n` +
      `${out.withHook} of ${out.queue.length} have a real opening line; ` +
      `${out.queue.length - out.withHook} do not (run audit-sites.mjs to fix that).`,
  );
  for (const [reason, n] of Object.entries(out.skippedReasons).sort((a, b) => b[1] - a[1])) {
    console.error(`  skipped ${String(n).padStart(4)}  ${reason}`);
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
