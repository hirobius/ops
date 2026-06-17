#!/usr/bin/env node
/**
 * email-triage — live Microsoft Graph runner.
 *
 * Reads recent messages from the test mailbox, classifies each, optionally
 * applies an Outlook category. Uses raw fetch — no SDK dep.
 *
 * Modes:
 *   --auth-check          Acquire a token; print TTL and exit.
 *   --read [N]            Fetch N most recent unread messages (default 20),
 *                         classify each, print results. No mutation.
 *   --apply [N]           Same as --read, then PATCH /messages/{id} to apply
 *                         category tag `lilac-<bucket>`. Idempotent.
 *   --sweep               Full-mailbox classification sweep with aggregated report.
 *
 *     --sweep [--from-fixture <path>] [--dry-run | --apply]
 *
 *     Live path (requires Graph creds): paginates over ALL /messages (no isRead
 *     filter, no cap) with page size 100, classifies each, writes an aggregated
 *     report to clients/lilac-insure/inbox-discovery-results/sweep-<ISO-ts>.json.
 *
 *     Fixture path (no creds needed): loads { messages: [...] } from a JSON file
 *     (same shape as Pattern A discovery fixtures or the Graph $select response).
 *     Use fixtures/sweep-sample.json for a synthetic 30-message test.
 *
 *     --dry-run (default): report only, no Graph mutations.
 *     --apply: also PATCH category tags via applyCategory(). Forbidden with
 *              --from-fixture.
 *
 *     Report sections: runMeta, totals, byBucket, topSenderDomains,
 *     confidenceHistogram, lowConfidenceOutliers.
 *     Privacy: message bodies and previews are NEVER written to the report.
 *
 * Env keys (set in .env.local — Claude does not touch .env files):
 *   MS_GRAPH_TENANT_ID
 *   MS_GRAPH_CLIENT_ID
 *   MS_GRAPH_CLIENT_SECRET
 *   MS_GRAPH_TEST_MAILBOX     e.g. lilac-triage@yourname.onmicrosoft.com
 *
 * See docs/operations/m365-dev-tenant-setup.md for provisioning.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classify } from './classify.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = path.resolve(HERE, '..', '..', 'inbox-discovery-results');
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..');
const ENV_FILE = path.join(REPO_ROOT, '.env.local');

if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const TENANT = process.env.MS_GRAPH_TENANT_ID;
const CLIENT = process.env.MS_GRAPH_CLIENT_ID;
const SECRET = process.env.MS_GRAPH_CLIENT_SECRET;
const MAILBOX = process.env.MS_GRAPH_TEST_MAILBOX;

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function requireCreds() {
  const missing = [];
  if (!TENANT) missing.push('MS_GRAPH_TENANT_ID');
  if (!CLIENT) missing.push('MS_GRAPH_CLIENT_ID');
  if (!SECRET) missing.push('MS_GRAPH_CLIENT_SECRET');
  if (!MAILBOX) missing.push('MS_GRAPH_TEST_MAILBOX');
  if (missing.length) {
    fail(`missing env keys: ${missing.join(', ')} — see docs/operations/m365-dev-tenant-setup.md`);
  }
}

async function getToken() {
  const url = `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT,
    client_secret: SECRET,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(json);
    fail(`token request failed: ${res.status} ${json.error ?? ''} ${json.error_description ?? ''}`);
  }
  return { token: json.access_token, expiresIn: json.expires_in };
}

async function listUnreadMessages(token, top = 20) {
  const url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/messages` +
    `?$filter=isRead eq false` +
    `&$select=id,from,subject,bodyPreview,categories,receivedDateTime` +
    `&$top=${top}` +
    `&$orderby=receivedDateTime desc`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!res.ok) {
    console.error(json);
    fail(`list messages failed: ${res.status}`);
  }
  return json.value ?? [];
}

async function applyCategory(token, messageId, categoryTag) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/messages/${messageId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ categories: [categoryTag] }),
  });
  if (!res.ok) {
    const json = await res.json();
    console.error(json);
    return false;
  }
  return true;
}

function threadFromMessage(m) {
  return {
    from: m.from?.emailAddress?.address ?? '',
    subject: m.subject ?? '',
    body: m.bodyPreview ?? '',
  };
}

/** Paginate through the entire mailbox via @odata.nextLink. No isRead filter, no cap. */
async function listAllMessages(token) {
  const PAGE_SIZE = 100;
  const SELECT = 'id,from,subject,bodyPreview,categories,receivedDateTime';
  let url =
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(MAILBOX)}/messages` +
    `?$select=${SELECT}&$top=${PAGE_SIZE}&$orderby=receivedDateTime desc`;
  const all = [];
  let page = 0;
  while (url) {
    page++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = await res.json();
    if (!res.ok) {
      console.error(json);
      fail(`list all messages failed on page ${page}: ${res.status}`);
    }
    all.push(...(json.value ?? []));
    process.stdout.write(`\r  paginating… page ${page} — ${all.length} messages fetched`);
    url = json['@odata.nextLink'] ?? null;
  }
  process.stdout.write('\n');
  return all;
}

/** Extract the domain part from an email address string, lower-cased. */
function senderDomain(addr) {
  const at = (addr ?? '').indexOf('@');
  return at >= 0 ? addr.slice(at + 1).toLowerCase() : '(none)';
}

/**
 * Build the aggregated sweep report from an array of classified results.
 * Each entry: { id, from, subject, bucket, confidence, score }
 * Privacy: this function never touches bodyPreview beyond what classify() already consumed.
 */
function buildReport({ results, runMeta }) {
  const total = results.length;

  // --- byBucket ---
  const bucketMap = {};
  for (const r of results) {
    if (!bucketMap[r.bucket]) bucketMap[r.bucket] = 0;
    bucketMap[r.bucket]++;
  }
  const byBucket = Object.entries(bucketMap)
    .sort((a, b) => b[1] - a[1])
    .map(([bucket, count]) => ({
      bucket,
      count,
      pct: total > 0 ? +((count / total) * 100).toFixed(1) : 0,
    }));

  // --- topSenderDomains ---
  const domainMap = {};
  for (const r of results) {
    const d = senderDomain(r.from);
    domainMap[d] = (domainMap[d] ?? 0) + 1;
  }
  const topSenderDomains = Object.entries(domainMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 50)
    .map(([domain, count]) => ({ domain, count }));

  // --- confidenceHistogram ---
  const hist = { '0.0-0.5': 0, '0.5-0.7': 0, '0.7-0.9': 0, '0.9-1.0': 0 };
  for (const r of results) {
    const c = r.confidence;
    if (c < 0.5) hist['0.0-0.5']++;
    else if (c < 0.7) hist['0.5-0.7']++;
    else if (c < 0.9) hist['0.7-0.9']++;
    else hist['0.9-1.0']++;
  }

  // --- lowConfidenceOutliers (top 25 lowest confidence) ---
  // Privacy: only id, from (address only), subject, bucket, score — no body/preview.
  const lowConfidenceOutliers = [...results]
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 25)
    .map(({ id, from, subject, bucket, confidence, score }) => ({
      id,
      from,
      subject,
      bucket,
      confidence,
      score,
    }));

  return {
    runMeta,
    totals: { messageCount: total },
    byBucket,
    topSenderDomains,
    confidenceHistogram: hist,
    lowConfidenceOutliers,
  };
}

async function runSweep({ fixtureFile, applyTags }) {
  const ranAt = new Date().toISOString();
  let msgs;
  let source;

  if (fixtureFile) {
    if (applyTags) fail('--apply is forbidden in fixture mode (no real mailbox to mutate).');
    const raw = JSON.parse(fs.readFileSync(fixtureFile, 'utf8'));
    msgs = raw.messages ?? raw.value ?? [];
    source = `fixture:${path.basename(fixtureFile)}`;
    console.log(`sweep (fixture) — ${msgs.length} messages from ${fixtureFile}`);
  } else {
    requireCreds();
    const { token: tok } = await getToken();
    console.log(`sweep (live) — paginating full mailbox for ${MAILBOX}…`);
    msgs = await listAllMessages(tok);
    source = `graph:${MAILBOX}`;
  }

  // Classify each message. bodyPreview is used transiently by classify() and never
  // written to the report — only aggregate stats and id+from+subject+bucket+score
  // for outliers (privacy posture matches discovery.mjs).
  const results = [];
  let appliedCount = 0;
  let token = null;

  if (applyTags && !fixtureFile) {
    ({ token } = await getToken());
  }

  for (const m of msgs) {
    const thread = threadFromMessage(m);
    const r = classify(thread);
    results.push({
      id: m.id,
      from: thread.from,
      subject: thread.subject,
      bucket: r.category,
      confidence: r.confidence,
      score: r.score,
    });
    if (applyTags && token) {
      const ok = await applyCategory(token, m.id, `lilac-${r.category}`);
      if (ok) appliedCount++;
    }
  }

  const runMeta = {
    ranAt,
    source,
    mode: applyTags ? 'apply' : 'dry-run',
    messageCount: msgs.length,
    appliedCategoryTags: applyTags ? appliedCount : null,
  };

  const report = buildReport({ results, runMeta });

  if (!fs.existsSync(RESULTS_DIR)) fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const ts = ranAt.replace(/[:.]/g, '-');
  const outPath = path.join(RESULTS_DIR, `sweep-${ts}.json`);
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  // Console summary
  const { totals, byBucket, confidenceHistogram: h } = report;
  console.log(`\n── sweep complete ────────────────────────────────────`);
  console.log(`  messages classified : ${totals.messageCount}`);
  if (applyTags) console.log(`  category tags applied: ${appliedCount}`);
  console.log(`\n  by bucket:`);
  for (const b of byBucket) {
    console.log(`    ${b.bucket.padEnd(16)} ${String(b.count).padStart(5)}  (${b.pct}%)`);
  }
  console.log(`\n  confidence histogram:`);
  for (const [band, n] of Object.entries(h)) {
    console.log(`    ${band}   ${n}`);
  }
  console.log(`\n  top 3 sender domains:`);
  for (const d of report.topSenderDomains.slice(0, 3)) {
    console.log(`    ${d.domain.padEnd(40)} ${d.count}`);
  }
  console.log(`\n  report saved: ${outPath}`);
}

// ── arg parsing ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(name);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const mode = args[0];
const top = Number(args[1]) > 0 ? Number(args[1]) : 20;

(async () => {
  if (mode === '--sweep') {
    const fixtureFile = flagValue('--from-fixture') ?? null;
    const applyTags = hasFlag('--apply');
    // --dry-run is the default; --apply opts in to mutations
    await runSweep({ fixtureFile, applyTags });
    process.exit(0);
  }

  requireCreds();

  if (mode === '--auth-check') {
    const { expiresIn } = await getToken();
    console.log(`✓ auth ok — token TTL ~${Math.round(expiresIn / 60)}min`);
    process.exit(0);
  }

  if (mode === '--read' || mode === '--apply') {
    const { token } = await getToken();
    const msgs = await listUnreadMessages(token, top);
    console.log(`fetched ${msgs.length} unread messages from ${MAILBOX}\n`);
    console.log('result  category            conf   from                              subject');
    console.log('─'.repeat(120));

    const counts = {};
    let applied = 0;

    for (const m of msgs) {
      const thread = threadFromMessage(m);
      const r = classify(thread);
      counts[r.category] = (counts[r.category] ?? 0) + 1;

      const tag = mode === '--apply' ? '[apply]' : '[read]';
      console.log(
        `${tag.padEnd(8)}${String(r.category).padEnd(20)}${String(r.confidence).padEnd(7)}` +
          `${(thread.from || '(none)').padEnd(34).slice(0, 34)}${(thread.subject || '(none)').slice(0, 60)}`,
      );

      if (mode === '--apply') {
        const ok = await applyCategory(token, m.id, `lilac-${r.category}`);
        if (ok) applied++;
      }
    }

    console.log('─'.repeat(120));
    console.log(`\nbreakdown:`);
    for (const [cat, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${cat.padEnd(16)} ${n}`);
    }
    if (mode === '--apply') console.log(`\napplied ${applied}/${msgs.length} category tags`);
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node live-graph.mjs --auth-check');
  console.log('  node live-graph.mjs --read [N]');
  console.log('  node live-graph.mjs --apply [N]');
  console.log('  node live-graph.mjs --sweep [--from-fixture <path>] [--dry-run | --apply]');
  process.exit(2);
})().catch((e) => fail(e.message));
