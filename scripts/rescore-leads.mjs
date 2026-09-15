#!/usr/bin/env node
/**
 * scripts/rescore-leads.mjs — recompute lead_score / qualified / site_presence
 * for leads already in Supabase, from columns we already hold.
 *
 * Why: scoreProspect had two callers — the Outscraper normalizer (at ingest) and
 * audit-sites.mjs (custom domains only). When the scoring thesis changed on
 * 2026-09-15 (a3f698e), every already-sourced lead kept its old-formula score
 * with no way to recompute short of re-paying Outscraper for data we have. This
 * is that recompute. No API cost, no network beyond Supabase.
 *
 * --dry-run is the DEFAULT and prints the full before/after distribution.
 * --apply writes, skipping rows whose score is already correct.
 *
 *   node scripts/rescore-leads.mjs                 # show what would change
 *   node scripts/rescore-leads.mjs --apply         # write it
 *   node scripts/rescore-leads.mjs --json          # machine-readable
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Adrian-set; agents never read
 * or write .env* files).
 */

import { rescoreLeads, summarizeRescore } from '../lib/leads/rescore.mjs';

const PAGE = 1000;

function parseArgs(argv) {
  const o = { apply: false, json: false, help: false, limit: Infinity };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--json') o.json = true;
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`rescore-leads.mjs — recompute lead scores from stored columns. No API cost.

Usage:
  node scripts/rescore-leads.mjs [--apply] [--json] [--limit <n>]

Flags:
  --dry-run   Print the before/after distribution. Writes nothing. Default.
  --apply     Write lead_score / qualified / site_presence for rows that changed.
  --json      Machine-readable output.
  --limit <n> Cap rows read (default: all).
  --help, -h  This message.

Note: an UNAUDITED custom-domain lead scores low on purpose and will not become
qualified here. Run 'node scripts/audit-sites.mjs --presence custom --write'
first — that writes site_quality_score AND rescores those rows itself.
`);
}

/** Read every lead, paging past PostgREST's default 1000-row ceiling. */
async function fetchAllLeads(sb, limit) {
  const rows = [];
  for (let from = 0; rows.length < limit; from += PAGE) {
    const { data, error } = await sb
      .from('leads')
      .select(
        'id,name,website,site_presence,review_count,operational,owner_verified,site_quality_score,lead_score,qualified',
      )
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Supabase read failed: ${error.message || error}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows.slice(0, limit === Infinity ? undefined : limit);
}

/** Distribution of the qualified pool by presence, so the shape of the change is visible. */
function byPresence(results) {
  const out = {};
  for (const r of results) {
    const p = r.patch.site_presence;
    out[p] ??= { total: 0, qualified: 0 };
    out[p].total++;
    if (r.patch.qualified) out[p].qualified++;
  }
  return out;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return printHelp();

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();

  const leads = await fetchAllLeads(sb, o.limit);
  const results = rescoreLeads(leads);
  const summary = summarizeRescore(results);
  const dist = byPresence(results);

  if (o.json) {
    console.log(JSON.stringify({ summary, byPresence: dist, applied: o.apply }, null, 2));
  } else {
    console.log(`Read ${summary.total} lead(s).\n`);
    console.log(`  changed:              ${summary.changed}`);
    console.log(`  site_presence backfilled: ${summary.presenceBackfilled}`);
    console.log(`  qualified before:     ${summary.qualifiedBefore}`);
    console.log(
      `  qualified after:      ${summary.qualifiedAfter}  (${summary.qualifiedDelta >= 0 ? '+' : ''}${summary.qualifiedDelta})`,
    );
    console.log(`    gained:             ${summary.gained}`);
    console.log(`    lost:               ${summary.lost}`);
    console.log('\n  by presence (qualified / total):');
    for (const [p, v] of Object.entries(dist).sort((a, b) => b[1].total - a[1].total)) {
      console.log(`    ${p.padEnd(12)} ${String(v.qualified).padStart(4)} / ${v.total}`);
    }
  }

  if (!o.apply) {
    console.log('\nDRY RUN — nothing written. Re-run with --apply to persist.');
    return;
  }

  const changed = results.filter((r) => r.changed);
  let wrote = 0;
  const failures = [];
  for (const r of changed) {
    const { error } = await sb.from('leads').update(r.patch).eq('id', r.id);
    if (error) failures.push(`${r.id}: ${error.message || error}`);
    else wrote++;
  }

  console.log(`\nWrote ${wrote} of ${changed.length} changed row(s).`);
  if (failures.length) {
    console.error(`${failures.length} write(s) failed:`);
    for (const f of failures.slice(0, 10)) console.error(`  ${f}`);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
