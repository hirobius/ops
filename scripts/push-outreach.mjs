#!/usr/bin/env node
/**
 * scripts/push-outreach.mjs — pull eligible leads from Supabase and push them
 * into a Smartlead cold-outreach campaign (#9 outreach engine, scaffolding).
 *
 * Eligibility (COMPLIANCE — enforced here, ALL must hold):
 *   - lead_score >= 60           (qualified — see supabase/migrations/0005_lead_score.sql)
 *   - email is present
 *   - do_not_contact is not true (#36 suppression — opt-outs never re-contacted)
 *   - outreach_status is null    (never contacted — this script never re-sends)
 *
 * --dry-run is the DEFAULT: prints the count + a sample of who WOULD be
 * pushed, sends nothing, never touches SMARTLEAD_API_KEY. --apply performs
 * the real push and requires SMARTLEAD_API_KEY (fails loud, naming the var,
 * if unset — checked BEFORE the Supabase read so a missing key is reported
 * fast, not buried after a DB round trip).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign 123            # dry-run
 *   NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign 123 --apply    # real push
 *   node scripts/push-outreach.mjs --help
 *
 * Env: SMARTLEAD_API_KEY, SMARTLEAD_CAMPAIGN_ID (both server-only, Adrian-set
 * in Vercel — see docs/prospecting/outreach-providers.md for the link).
 */

const LEAD_SCORE_MIN = 60;

function parseArgs(argv) {
  const o = { dryRun: true, campaign: process.env.SMARTLEAD_CAMPAIGN_ID || null, limit: 50, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.dryRun = false;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--campaign') o.campaign = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`push-outreach.mjs — push eligible leads to a Smartlead campaign.

Usage:
  node scripts/push-outreach.mjs --campaign <id> [--dry-run|--apply] [--limit <n>]

Eligibility (ALL must hold): lead_score >= ${LEAD_SCORE_MIN}, email present,
do_not_contact is not true, outreach_status is null (never contacted).

Flags:
  --campaign <id>   Smartlead campaign id (or set SMARTLEAD_CAMPAIGN_ID). Required.
  --dry-run         Print who WOULD be pushed. Sends nothing. Default.
  --apply           Actually push to Smartlead. Requires SMARTLEAD_API_KEY.
  --limit <n>       Max eligible leads to fetch (default 50).
  --help, -h        This message.
`);
}

/** Eligible = lead_score >= 60 AND email present AND not suppressed AND never contacted. */
async function fetchEligibleLeads(sb, limit) {
  const { data, error } = await sb
    .from('leads')
    .select('*')
    .gte('lead_score', LEAD_SCORE_MIN)
    .not('email', 'is', null)
    .eq('do_not_contact', false)
    .is('outreach_status', null)
    .order('lead_score', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Supabase read failed: ${error.message || error}`);
  // Defensive re-check in JS: a blank-string email would pass the SQL `not
  // null` filter but isn't actually contactable.
  return (data || []).filter((l) => typeof l.email === 'string' && l.email.trim() && l.do_not_contact !== true);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    printHelp();
    return;
  }
  if (!o.campaign) {
    console.error('Missing --campaign <id> (or set SMARTLEAD_CAMPAIGN_ID). Run --help for usage.');
    process.exitCode = 1;
    return;
  }

  // Fail loud + fast: check the send credential BEFORE any DB round trip, so
  // an --apply run with a missing key errors immediately, not after a wasted
  // Supabase query. Dry-run never touches this — it can't send regardless.
  let readApiKey;
  if (!o.dryRun) {
    ({ readApiKey } = await import('../lib/outreach/smartlead.mjs'));
    readApiKey(); // throws, naming SMARTLEAD_API_KEY + the Vercel env link, if unset
  }

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const { leadsToOutreachLeads } = await import('../lib/outreach/map.mjs');

  const sb = await getServiceClient();
  const eligible = await fetchEligibleLeads(sb, o.limit);
  const mapped = leadsToOutreachLeads(eligible);

  console.log(
    `Eligible leads (lead_score >= ${LEAD_SCORE_MIN}, email present, not suppressed, never contacted): ${mapped.length}`,
  );
  if (mapped.length) {
    console.log('Sample (up to 5):');
    for (const l of mapped.slice(0, 5)) {
      console.log(`  ${l.email}  ${l.custom_fields?.business_name || ''}  ${l.custom_fields?.city || ''}`);
    }
  }

  if (o.dryRun) {
    console.log('\nDRY RUN — nothing sent. Re-run with --apply (and SMARTLEAD_API_KEY set) to push for real.');
    return;
  }

  if (!mapped.length) {
    console.log('\nNothing eligible to push.');
    return;
  }

  const { makeSmartleadProvider } = await import('../lib/outreach/smartlead.mjs');
  const provider = makeSmartleadProvider();
  const result = await provider.addLeads(o.campaign, mapped);
  console.log(`\nPushed to Smartlead campaign ${o.campaign}: added=${result.added} skipped=${result.skipped}`);
  console.log(
    'Note: outreach_status stays unset here — Smartlead flips it via the ' +
      "EMAIL_SENT webhook once it actually sends (push only queues the lead " +
      "into the campaign). The webhook route is deferred (see docs/prospecting/outreach-providers.md).",
  );
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
