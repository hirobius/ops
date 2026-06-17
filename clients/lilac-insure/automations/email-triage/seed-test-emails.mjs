#!/usr/bin/env node
/**
 * Inject the 12 canonical test emails directly into the test mailbox inbox via
 * Microsoft Graph. Requires Mail.ReadWrite — no Mail.Send permission needed.
 *
 * Usage:
 *   node seed-test-emails.mjs            # inject all 12
 *   node seed-test-emails.mjs --dry-run  # print what would be sent, no network calls
 *
 * After seeding, run:
 *   node live-graph.mjs --read           # verify classification
 *   node live-graph.mjs --apply          # apply category tags
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const CLIENT_ROOT = path.resolve(HERE, '..', '..');

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadEnv(path.join(CLIENT_ROOT, '.env.local'));
loadEnv(path.join(REPO_ROOT, '.env.local'));

const TENANT  = process.env.MS_GRAPH_TENANT_ID;
const CLIENT  = process.env.MS_GRAPH_CLIENT_ID;
const SECRET  = process.env.MS_GRAPH_CLIENT_SECRET;
const MAILBOX = process.env.MS_GRAPH_TEST_MAILBOX;

function fail(msg) { console.error(`✗ ${msg}`); process.exit(1); }

function requireCreds() {
  const missing = [];
  if (!TENANT)  missing.push('MS_GRAPH_TENANT_ID');
  if (!CLIENT)  missing.push('MS_GRAPH_CLIENT_ID');
  if (!SECRET)  missing.push('MS_GRAPH_CLIENT_SECRET');
  if (!MAILBOX) missing.push('MS_GRAPH_TEST_MAILBOX');
  if (missing.length) fail(`missing env keys: ${missing.join(', ')}`);
}

async function getToken() {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT, client_secret: SECRET,
        scope: 'https://graph.microsoft.com/.default',
        grant_type: 'client_credentials',
      }),
    },
  );
  const json = await res.json();
  if (!res.ok) { console.error(json); fail(`token request failed: ${res.status}`); }
  return json.access_token;
}

// ── 12 canonical test cases (+ 3 edge cases) from test-emails.md ─────────────

const TEST_EMAILS = [
  {
    label: '1. lead',
    from: { address: 'forms@lilacinsure.com', name: 'Lilac Website Forms' },
    subject: 'New lead: Quote request from website',
    body: 'Name: Jane Doe\nEmail: jane@example.com\nPhone: 509-555-0100\nLooking for a quote on auto and home.\nBest contact method: email.',
  },
  {
    label: '2. quoting',
    from: { address: 'underwriter@rtspecialty.com', name: 'RT Specialty Underwriting' },
    subject: 'Submission #88421 — quote indication ready for review',
    body: 'Please review the attached indication. Rate is locked through Friday.\nPlease bind by EOD if accepting.',
  },
  {
    label: '3. onboarding',
    from: { address: 'dse_NA4@docusign.net', name: 'DocuSign' },
    subject: 'Completed: Lilac Insurance — Auto Application Signed',
    body: 'All parties have completed the document. Welcome aboard!\nYour policy is now in effect.',
  },
  {
    label: '4. service',
    from: { address: 'client@example.com', name: 'A. Client' },
    subject: 'Need a copy of my insurance card',
    body: 'Hi Conrad, can you send me a proof of insurance for my auto policy?\nI need it for the DMV today.',
  },
  {
    label: '5. claim',
    from: { address: 'claims@progressive.com', name: 'Progressive Claims' },
    subject: 'FNOL — Auto claim filed for policy 99-AUTO-123',
    body: 'First notice of loss received. Insured reports a rear-end collision on I-90.\nPlease assist with documentation.',
  },
  {
    label: '6. renewal',
    from: { address: 'renewals@carrier.com', name: 'Carrier Renewals' },
    subject: 'Renewal proposal ready — policy expires 2026-06-15',
    body: "Your client's home policy is up for renewal.\nRenewal effective 2026-06-15. Please review attached proposal.",
  },
  {
    label: '7. retention',
    from: { address: 'billing@libertymutual.com', name: 'Liberty Mutual Billing' },
    subject: 'Notice of intent to cancel — non-payment / NSF on policy 44-HO-7788',
    body: 'Returned check received. Policy is scheduled for cancellation in 10 days\nunless payment is received.',
  },
  {
    label: '8. carrier-ops',
    from: { address: 'agent-bulletin@travelers.com', name: 'Travelers Agent Services' },
    subject: 'April commission statement + 1099 reminder',
    body: 'Your April commission report is attached.\nReminder: 1099 forms available in agent portal.',
  },
  {
    label: '9. vendor-ops',
    from: { address: 'no-reply@ezlynx.com', name: 'EZLynx' },
    subject: 'Scheduled maintenance window — Saturday 2026-05-09 02:00 PT',
    body: 'EZLynx will be unavailable for scheduled downtime from 02:00–04:00 PT on\nSaturday. Release notes attached.',
  },
  {
    label: '10. compliance',
    from: { address: 'licensing@oic.wa.gov', name: 'WA Office of Insurance Commissioner' },
    subject: 'Producer license renewal due — CE credit required',
    body: 'Your producer license is expiring 2026-08-30. Continuing education credits\nrequired before renewal.',
  },
  {
    label: '11. internal',
    from: { address: 'adrian@hirobius.com', name: 'Adrian' },
    subject: "Status check on this week's deliverables",
    body: "Hey Conrad — quick check-in on the EZLynx login + brand audit deck.\nLet me know what's blocking.",
  },
  {
    label: '12. noise',
    from: { address: 'newsletter@insurancemarketingweekly.com', name: 'Insurance Marketing Weekly' },
    subject: 'Limited time: save 20% on your agent CRM upgrade',
    body: 'Exclusive offer for independent agents. View in browser.\nUnsubscribe from this list.',
  },
  // Edge cases
  {
    label: 'edge: renewal-from-carrier-domain',
    from: { address: 'submissions@rpsins.com', name: 'RPS Insurance' },
    subject: 'Renewal proposal — expires 2026-07-01, please review',
    body: 'Policy renews on 2026-07-01. Up for renewal. Please review attached proposal.',
  },
  {
    label: 'edge: client-reports-accident',
    from: { address: 'client2@example.com', name: 'B. Client' },
    subject: 'I was in an accident — need to file a claim',
    body: 'Hi Conrad, I was in an accident on Division St. No injuries.\nNeed to report a loss / file a claim ASAP.',
  },
  {
    label: 'edge: ambiguous question',
    from: { address: 'someone@example.com', name: 'Someone' },
    subject: 'Question',
    body: 'Hey, got a sec?',
  },
];

async function injectMessage(token, email) {
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}` +
    `/mailFolders/Inbox/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: email.subject,
      body: { contentType: 'Text', content: email.body },
      from: { emailAddress: email.from },
      sender: { emailAddress: email.from },
      isRead: false,
    }),
  });
  const json = await res.json();
  if (!res.ok) { console.error(json); return false; }
  return true;
}

// ── main ─────────────────────────────────────────────────────────────────────

const dryRun = process.argv.includes('--dry-run');

if (dryRun) {
  console.log(`dry-run — ${TEST_EMAILS.length} messages would be injected into ${MAILBOX ?? '(MAILBOX not set)'}\n`);
  for (const e of TEST_EMAILS) {
    console.log(`  ${e.label.padEnd(40)} from: ${e.from.address}`);
    console.log(`  ${''.padEnd(40)} subj: ${e.subject}\n`);
  }
  process.exit(0);
}

requireCreds();

(async () => {
  const token = await getToken();
  console.log(`injecting ${TEST_EMAILS.length} test messages into ${MAILBOX}…\n`);

  let ok = 0;
  for (const email of TEST_EMAILS) {
    const success = await injectMessage(token, email);
    const mark = success ? '✓' : '✗';
    console.log(`  ${mark} ${email.label}`);
    if (success) ok++;
  }

  console.log(`\n${ok}/${TEST_EMAILS.length} messages injected.`);
  if (ok === TEST_EMAILS.length) {
    console.log('\nNext: node live-graph.mjs --read');
  }
})().catch((e) => fail(e.message));
