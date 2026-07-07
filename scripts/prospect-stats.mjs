#!/usr/bin/env node
/**
 * scripts/prospect-stats.mjs — saturation + yield analytics over the `leads`
 * table. Auto-computes what Run 01 had to be hand-SQL'd: per source_query
 * (= niche × metro) how many leads, the qualified rate, %no-site, and avg
 * need/build/site-quality. Read-only, zero Outscraper cost.
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/prospect-stats.mjs           # per-query yield table
 *   NODE_USE_ENV_PROXY=1 node scripts/prospect-stats.mjs --json    # machine-readable
 *
 * Needs Supabase env (human-set). QUALIFIED_LEAD_SCORE mirrors prospect-to-lead.mjs.
 */

const QUAL = 60;
const asJson = process.argv.includes('--json');

function avg(nums) {
  const v = nums.filter((n) => typeof n === 'number');
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

async function main() {
  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();
  const { data, error } = await sb
    .from('leads')
    .select('site_presence,lead_score,build_score,site_quality_score,source_query,review_count');
  if (error) { console.error('Supabase read failed:', error.message || error); process.exit(1); }
  const rows = data || [];

  const presence = {};
  for (const r of rows) presence[r.site_presence || '?'] = (presence[r.site_presence || '?'] || 0) + 1;
  const qualified = rows.filter((r) => (r.lead_score ?? 0) >= QUAL).length;

  const byQuery = new Map();
  for (const r of rows) {
    const k = r.source_query || '(none)';
    if (!byQuery.has(k)) byQuery.set(k, []);
    byQuery.get(k).push(r);
  }
  const perQuery = [...byQuery.entries()].map(([query, v]) => ({
    query,
    n: v.length,
    qualified: v.filter((r) => (r.lead_score ?? 0) >= QUAL).length,
    pctNoSite: Math.round((v.filter((r) => r.site_presence === 'none').length / v.length) * 100),
    avgNeed: avg(v.map((r) => r.lead_score)),
    avgBuild: avg(v.map((r) => r.build_score)),
    avgSiteQuality: avg(v.map((r) => r.site_quality_score)),
  })).sort((a, b) => (b.qualified - a.qualified) || ((b.avgNeed ?? 0) - (a.avgNeed ?? 0)));

  if (asJson) {
    console.log(JSON.stringify({ total: rows.length, qualified, presence, perQuery }, null, 2));
    return;
  }

  console.log(`\nLeads: ${rows.length}  ·  qualified (need>=${QUAL}): ${qualified}  ·  presence: ${JSON.stringify(presence)}\n`);
  console.log('per query (niche × metro) — sorted by qualified, then avg need:');
  console.log('  qual  n   %noSite  avgNeed  avgBuild  avgSiteQ  query');
  for (const q of perQuery) {
    console.log(
      `  ${String(q.qualified).padStart(4)}  ${String(q.n).padStart(2)}  ` +
      `${String(q.pctNoSite).padStart(6)}%  ${String(q.avgNeed ?? '-').padStart(7)}  ` +
      `${String(q.avgBuild ?? '-').padStart(8)}  ${String(q.avgSiteQuality ?? '-').padStart(8)}  ${q.query}`,
    );
  }
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
