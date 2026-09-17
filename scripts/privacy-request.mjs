#!/usr/bin/env node
/**
 * scripts/privacy-request.mjs — act on a privacy request (ops#38): stop
 * contacting a business, delete what we hold on it, or tell it what we hold.
 *
 * Intake is the privacy contact inbox (lib/compliance/identity.mjs). Read the
 * request, verify it for delete/know (see "Handling a privacy request" in
 * docs/prospecting/compliance.md), then:
 *
 *   node scripts/privacy-request.mjs --type opt-out --email <requester-address>          # dry run
 *   node scripts/privacy-request.mjs --type opt-out --email <requester-address> --apply  # write
 *   node scripts/privacy-request.mjs --type delete  --phone "(509) 555-0100" --apply
 *   node scripts/privacy-request.mjs --type know    --id <lead-id>
 *
 * Dry run by default. `know` never writes. The logic, and its tests, live in
 * lib/compliance/privacy-request.mjs.
 *
 * Env: SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (Adrian-set; agents never read
 * or write .env* files).
 */

import { PRIVACY_CONTACT_EMAIL } from '../lib/compliance/identity.mjs';
import {
  DELETION_KEEPS,
  REQUEST_TYPES,
  runPrivacyRequest,
} from '../lib/compliance/privacy-request.mjs';

function parseArgs(argv) {
  const o = { type: null, identifiers: {}, apply: false, allowMultiple: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--type') o.type = argv[++i];
    else if (a === '--id') o.identifiers.id = argv[++i];
    else if (a === '--email') o.identifiers.email = argv[++i];
    else if (a === '--phone') o.identifiers.phone = argv[++i];
    else if (a === '--place-id') o.identifiers.placeId = argv[++i];
    else if (a === '--website') o.identifiers.website = argv[++i];
    else if (a === '--apply') o.apply = true;
    else if (a === '--dry-run') o.apply = false;
    else if (a === '--allow-multiple') o.allowMultiple = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else {
      console.error(`Unknown argument "${a}". Run --help for usage.`);
      process.exit(1);
    }
  }
  return o;
}

function printHelp() {
  console.log(`privacy-request.mjs — act on a privacy request against the leads table.

Usage:
  node scripts/privacy-request.mjs --type <${REQUEST_TYPES.join('|')}> <identifier...> [--apply] [--allow-multiple]

Identifiers (any of them; a lead matching ANY is included):
  --id <lead-id>  --email <address>  --phone <number, any format>
  --website <site, any form>  --place-id <google place id>

Types:
  opt-out  Mark do_not_contact. push-outreach, the call list, the pitch queue, lead
           ingest and the email crawler skip these leads (audit-sites and site
           generation do not yet). Keeps an earlier opt-out's reason and date.
  delete   Null every column except the suppression minimum, and delete the lead's
           notes. Prints what it cannot reach (sample sites, Smartlead, local files).
           Kept: ${DELETION_KEEPS.join(', ')}
  know     Print everything held on the lead, notes included. Never writes.

Flags:
  --apply           Write. Without it this is a dry run.
  --allow-multiple  Let a deletion proceed when it matches more than one lead.
  --help, -h        This message.

Verify delete and know requests before running them. Opt-outs need no verification.
`);
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) return printHelp();
  // Validate before connecting, so a mistyped invocation fails without touching the database.
  if (!REQUEST_TYPES.includes(o.type)) {
    console.error(`Need --type ${REQUEST_TYPES.join(' | ')}. Run --help for usage.`);
    process.exitCode = 1;
    return;
  }

  const { getServiceClient } = await import('../lib/supabase/server.mjs');
  const sb = await getServiceClient();
  const result = await runPrivacyRequest(sb, {
    type: o.type,
    identifiers: o.identifiers,
    apply: o.apply,
    allowMultiple: o.allowMultiple,
  });

  if (!result.matches.length) {
    console.log(
      'No lead matches. Before telling the requester we hold nothing, try their other details\n' +
        '(phone, website, email). A business we do not hold cannot be suppressed ahead of time —\n' +
        'a known gap, see "Handling a privacy request" in docs/prospecting/compliance.md.',
    );
    return;
  }

  if (o.type === 'know') {
    console.log(JSON.stringify(result.disclosures, null, 2));
    console.log(
      `\n${result.disclosures.length} lead(s). Send this to the verified requester from ${PRIVACY_CONTACT_EMAIL}.`,
    );
    return;
  }

  for (const c of result.changes) {
    console.log(`\n${c.lead.id}  ${c.lead.name ?? '(no name)'}`);
    const cleared = Object.entries(c.patch)
      .filter(([, v]) => v === null)
      .map(([k]) => k);
    console.log(
      `  set: do_not_contact=true, suppression_reason=${c.patch.suppression_reason}, unsubscribed_at=${c.patch.unsubscribed_at}`,
    );
    if (cleared.length) console.log(`  clear ${cleared.length} column(s): ${cleared.join(', ')}`);
    if (c.deletesNotes) console.log('  delete all lead_notes for this lead');
    for (const w of c.warnings) console.log(`  MANUAL: ${w}`);
  }

  console.log(
    result.applied
      ? `\nApplied to ${result.changes.length} lead(s). Reply to the requester from ${PRIVACY_CONTACT_EMAIL} to confirm.`
      : `\nDRY RUN — nothing written. Re-run with --apply.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
