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
 * Three modes, all routed through lib/outreach/guard.mjs (the single outbound
 * choke point — nothing here talks to a provider without passing through it):
 *
 *   --dry-run   DEFAULT. Counts and samples who WOULD be pushed. Sends nothing,
 *               never touches SMARTLEAD_API_KEY, never imports the provider.
 *   --rehearse <your-email>
 *               A REAL push through the REAL provider carrying the REAL
 *               merge-field data of real leads — with every recipient rewritten
 *               to plus-tagged variants of an address you own, capped at 3.
 *               This is the step between "never run" and "39 strangers get
 *               email": the Smartlead contract in lib/outreach/smartlead.mjs
 *               has never executed against a live account (its header carries
 *               // VERIFY markers), so rehearse it before a prospect is involved.
 *               Use a THROWAWAY campaign id — leads added to a campaign stay in it.
 *   --apply     The real push, to real businesses. Requires SMARTLEAD_API_KEY
 *               (fails loud, naming the var, if unset — checked BEFORE the
 *               Supabase read so a missing key is reported fast, not buried
 *               after a DB round trip).
 *
 *   NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign 123
 *   NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign 999 --rehearse adrian@hirobius.com
 *   NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign 123 --apply
 *   node scripts/push-outreach.mjs --help
 *
 * Env: SMARTLEAD_API_KEY, SMARTLEAD_CAMPAIGN_ID (both server-only, Adrian-set
 * in Vercel — see docs/prospecting/outreach-providers.md for the link).
 */

import { REHEARSAL_MAX, guardOutreach, resolveMode } from '../lib/outreach/guard.mjs';

const LEAD_SCORE_MIN = 60;

function parseArgs(argv) {
  const o = {
    apply: false,
    rehearse: null,
    campaign: process.env.SMARTLEAD_CAMPAIGN_ID || null,
    limit: 50,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--rehearse') o.rehearse = argv[++i];
    else if (a === '--campaign') o.campaign = argv[++i];
    else if (a === '--limit') o.limit = Number(argv[++i]);
    else if (a === '--help' || a === '-h') o.help = true;
  }
  return o;
}

function printHelp() {
  console.log(`push-outreach.mjs — push eligible leads to a Smartlead campaign.

Usage:
  node scripts/push-outreach.mjs --campaign <id> [--dry-run | --rehearse <email> | --apply] [--limit <n>]

Eligibility (ALL must hold): lead_score >= ${LEAD_SCORE_MIN}, email present,
do_not_contact is not true, outreach_status is null (never contacted).

Flags:
  --campaign <id>      Smartlead campaign id (or set SMARTLEAD_CAMPAIGN_ID). Required.
  --dry-run            Print who WOULD be pushed. Sends nothing. Default.
  --rehearse <email>   Real push, real provider, real merge data — every recipient
                       rewritten to plus-tagged variants of <email>, capped at
                       ${REHEARSAL_MAX}. Proves the transport before a prospect is
                       involved. Requires SMARTLEAD_API_KEY. Use a THROWAWAY campaign.
  --apply              The real push, to real businesses. Requires SMARTLEAD_API_KEY.
  --limit <n>          Max eligible leads to fetch (default 50).
  --help, -h           This message.
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
  return (data || []).filter(
    (l) => typeof l.email === 'string' && l.email.trim() && l.do_not_contact !== true,
  );
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

  // resolveMode throws on the --apply + --rehearse contradiction rather than
  // picking one for you. Do this before any I/O so a bad invocation costs nothing.
  const mode = resolveMode({ apply: o.apply, rehearse: o.rehearse });

  // Fail loud + fast: check the send credential BEFORE any DB round trip, so a
  // sending run with a missing key errors immediately, not after a wasted
  // Supabase query. Dry-run never touches this — it can't send regardless.
  if (mode !== 'dry-run') {
    const { readApiKey } = await import('../lib/outreach/smartlead.mjs');
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

  // THE choke point. Nothing below this line may reach a provider except
  // `decision.leads` — see lib/outreach/guard.mjs.
  const decision = guardOutreach({ mode, leads: mapped, rehearsalRecipient: o.rehearse });

  if (decision.preview.length) {
    console.log('Sample (up to 5):');
    for (const l of decision.preview.slice(0, 5)) {
      console.log(
        `  ${l.email}  ${l.custom_fields?.business_name || ''}  ${l.custom_fields?.city || ''}`,
      );
    }
  }

  if (!decision.send) {
    console.log(
      '\nDRY RUN — nothing sent, and the provider was never even imported.' +
        '\nNext step is NOT --apply. Rehearse the transport against yourself first:' +
        `\n  node scripts/push-outreach.mjs --campaign <throwaway-id> --rehearse you@yourdomain.com`,
    );
    return;
  }

  if (!decision.leads.length) {
    console.log('\nNothing eligible to push.');
    return;
  }

  if (decision.mode === 'rehearse') {
    console.log(
      `\n── REHEARSAL ── ${decision.leads.length} lead(s), every recipient rewritten to you.`,
    );
    for (const r of decision.rewrites) {
      console.log(`  ${r.business || '(unnamed)'}: ${r.from}  ->  ${r.to}`);
    }
    if (decision.capped) {
      console.log(
        `  (capped at ${REHEARSAL_MAX} of ${mapped.length} eligible — a rehearsal proves the path, not the volume)`,
      );
    }
    console.log(
      `  Merge fields are the REAL lead data, so what lands in your inbox is what a\n` +
        `  prospect would have seen. Campaign ${o.campaign} should be a throwaway —\n` +
        `  Smartlead keeps leads in a campaign once added.`,
    );
  }

  const { makeSmartleadProvider } = await import('../lib/outreach/smartlead.mjs');
  const provider = makeSmartleadProvider();
  const result = await provider.addLeads(o.campaign, decision.leads);
  console.log(
    `\n${decision.mode === 'rehearse' ? 'Rehearsal pushed' : 'Pushed'} to Smartlead campaign ${o.campaign}: ` +
      `added=${result.added} skipped=${result.skipped}`,
  );

  if (decision.mode === 'rehearse') {
    console.log(
      'Check your inbox. If the merge fields render and the mail arrives, the transport\n' +
        'contract in lib/outreach/smartlead.mjs is confirmed — update its // VERIFY notes,\n' +
        'then and only then consider --apply. No real lead was touched by this run.',
    );
    return;
  }

  console.log(
    'Note: outreach_status stays unset here — Smartlead flips it via the ' +
      'EMAIL_SENT webhook once it actually sends (push only queues the lead ' +
      'into the campaign). The webhook route is deferred (see docs/prospecting/outreach-providers.md).',
  );
}

main().catch((e) => {
  console.error(e?.stack || String(e));
  process.exitCode = 1;
});
