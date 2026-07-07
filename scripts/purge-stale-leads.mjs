#!/usr/bin/env node
/**
 * scripts/purge-stale-leads.mjs — enforce the 12-month data-retention policy
 * (compliance #37, Adrian 2026-07-07). Deletes leads that are stale AND
 * unworked AND not suppressed. KEEPS forever: `won` leads, do_not_contact /
 * unsubscribed tombstones (so opt-outs are never re-scraped), and anything
 * currently in outreach.
 *
 * --dry-run by default (prints counts, deletes nothing). Needs Supabase env +
 * migration 0007 (do_not_contact / won_at / outreach_status). Manual/passive
 * trigger only — no cron until Adrian opts in (standing rule).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/purge-stale-leads.mjs             # dry-run
 *   NODE_USE_ENV_PROXY=1 node scripts/purge-stale-leads.mjs --apply     # delete
 *   --months <n>   retention window (default 12)
 */

function parseArgs(argv) {
  const o = { months: 12, apply: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--months') o.months = Number(argv[++i]);
    else if (argv[i] === '--apply') o.apply = true;
    else if (argv[i] === '--help' || argv[i] === '-h') { console.log('See header.'); process.exit(0); }
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - o.months);
  const cutoffIso = cutoff.toISOString();

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();

  // Candidates: older than the window, never worked, not won, not suppressed.
  const filter = (q) => q
    .lt('created_at', cutoffIso)
    .is('outreach_status', null)
    .is('won_at', null)
    .eq('do_not_contact', false);

  const { count, error } = await filter(sb.from('leads').select('id', { count: 'exact', head: true }));
  if (error) {
    console.error('Supabase read failed (did migration 0007 apply?):', error.message || error);
    process.exit(1);
  }
  console.log(`Retention: ${o.months} months (cutoff ${cutoffIso.slice(0, 10)}).`);
  console.log(`Purge candidates (stale + unworked + not won + not suppressed): ${count ?? 0}`);
  console.log('Kept regardless: won leads, do_not_contact / unsubscribed tombstones, in-outreach leads.');

  if (!o.apply) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to delete the above.');
    return;
  }
  if (!count) { console.log('\nNothing to purge.'); return; }

  const { error: delErr } = await filter(sb.from('leads').delete());
  if (delErr) { console.error('Delete failed:', delErr.message || delErr); process.exit(1); }
  console.log(`\nPurged ${count} stale lead(s). (Logged count only — the PII itself is gone, per #37.)`);
}

main().catch((e) => { console.error(e?.stack || String(e)); process.exit(1); });
