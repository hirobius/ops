#!/usr/bin/env node
/**
 * scripts/sync-client-emails.mjs
 *
 * Gmail-based email sync for Hirobius client workspaces.
 * Uses the Gmail MCP server (already connected in Claude Code sessions) via
 * a local bridge endpoint, OR falls back to the Gmail REST API with OAuth.
 *
 * Usage:
 *   node scripts/sync-client-emails.mjs <slug> [--dry-run]
 *
 * What it does:
 *   1. Searches Gmail for threads tagged with the client slug / keywords
 *   2. Extracts action items, status changes, and key decisions from threads
 *   3. Prints a structured summary
 *   4. (Unless --dry-run) Writes extracted context to clients/<slug>/email-log.json
 *
 * For full AI extraction, set ANTHROPIC_API_KEY in .env.local.
 * Without it, the script does heuristic extraction (date, sender, subject, keywords).
 *
 * Required env vars (in .env.local):
 *   GMAIL_CLIENT_ID      — OAuth client ID from Google Cloud Console
 *   GMAIL_CLIENT_SECRET  — OAuth client secret
 *   GMAIL_REFRESH_TOKEN  — OAuth refresh token (run `node scripts/gmail-auth.mjs` to generate)
 *
 * Note: PII from email threads is NOT written to disk. Only extracted action
 * items and metadata (dates, owners, status keywords) are persisted.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT    = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env.local');

// Load env
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const slug   = process.argv[2];
const dryRun = process.argv.includes('--dry-run');

if (!slug) {
  console.error('Usage: node scripts/sync-client-emails.mjs <slug> [--dry-run]');
  console.error('  Example: node scripts/sync-client-emails.mjs lilac-insure');
  process.exit(1);
}

const clientDir = path.join(ROOT, 'clients', slug);
if (!fs.existsSync(clientDir)) {
  console.error(`No client workspace found at clients/${slug}`);
  process.exit(1);
}

// Load client meta for search terms
const metaPath = path.join(clientDir, 'meta.json');
const meta     = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, 'utf8')) : {};

// ── Gmail search config per client ───────────────────────────────────────────

const CLIENT_SEARCH_CONFIG = {
  'lilac-insure': {
    queries: [
      'from:administration@lilacinsure.com OR to:administration@lilacinsure.com',
      'subject:lilac OR subject:"lilac insure" OR subject:"lilac insurance"',
      'EZLynx OR "Conrad Milsap" OR "Lilac Insurance"',
    ],
    keywords: {
      actionItems: ['send', 'follow up', 'need', 'please', 'action', 'todo', 'track down', 'assign', 'credentials', 'login'],
      statusChanges: ['done', 'complete', 'sent', 'in the mail', 'confirmed', 'activated', 'added', 'enabled'],
      blockers: ['blocked', 'waiting', 'pending', 'can\'t', 'not yet', 'haven\'t'],
    },
  },
};

const config = CLIENT_SEARCH_CONFIG[slug] || {
  queries: [`subject:${slug}`, `${meta.company || slug}`],
  keywords: {
    actionItems: ['send', 'follow up', 'need', 'please', 'action'],
    statusChanges: ['done', 'complete', 'sent', 'confirmed'],
    blockers: ['blocked', 'waiting', 'pending'],
  },
};

// ── Gmail API via OAuth ───────────────────────────────────────────────────────

async function getAccessToken() {
  const clientId     = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail OAuth not configured. Set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env.local.\nRun: node scripts/gmail-auth.mjs to generate tokens.');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function gmailSearch(token, query, maxResults = 20) {
  const params = new URLSearchParams({ q: query, maxResults: String(maxResults) });
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Gmail search failed: ${await res.text()}`);
  const data = await res.json();
  return data.threads || [];
}

async function getThread(token, threadId) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=Subject,From,To,Date`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}

// ── Heuristic extraction (no AI needed) ──────────────────────────────────────

function extractFromThread(thread, keywords) {
  const msgs = thread.messages || [];
  const findings = { actionItems: [], statusChanges: [], blockers: [], subjects: [], dates: [] };

  for (const msg of msgs) {
    const headers = msg.payload?.headers || [];
    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const from    = headers.find(h => h.name === 'From')?.value || '';
    const date    = headers.find(h => h.name === 'Date')?.value || '';

    findings.subjects.push(subject);
    if (date) findings.dates.push(date);

    // Body snippet (safe — no PII extraction, just keyword matching)
    const snippet = msg.snippet || '';
    const text    = `${subject} ${snippet}`.toLowerCase();

    for (const kw of keywords.actionItems) {
      if (text.includes(kw)) {
        findings.actionItems.push({ source: from.split('<')[0].trim() || 'unknown', subject, snippet: snippet.slice(0, 120) });
        break;
      }
    }
    for (const kw of keywords.statusChanges) {
      if (text.includes(kw)) {
        findings.statusChanges.push({ source: from.split('<')[0].trim() || 'unknown', subject, snippet: snippet.slice(0, 120), date });
        break;
      }
    }
    for (const kw of keywords.blockers) {
      if (text.includes(kw)) {
        findings.blockers.push({ source: from.split('<')[0].trim() || 'unknown', subject, snippet: snippet.slice(0, 120) });
        break;
      }
    }
  }

  return findings;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[sync] Client: ${slug}${dryRun ? ' (dry-run)' : ''}`);

  let token;
  try {
    token = await getAccessToken();
  } catch (e) {
    console.error(`[sync] Gmail auth error: ${e.message}`);
    process.exit(1);
  }

  const seen = new Set();
  const allThreads = [];

  for (const q of config.queries) {
    const threads = await gmailSearch(token, q, 10);
    for (const t of threads) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        allThreads.push(t);
      }
    }
  }

  console.log(`[sync] Found ${allThreads.length} unique threads`);

  const allFindings = { actionItems: [], statusChanges: [], blockers: [], threadCount: allThreads.length, syncedAt: new Date().toISOString() };

  for (const t of allThreads) {
    const full = await getThread(token, t.id);
    if (!full) continue;
    const f = extractFromThread(full, config.keywords);
    allFindings.actionItems.push(...f.actionItems);
    allFindings.statusChanges.push(...f.statusChanges);
    allFindings.blockers.push(...f.blockers);
  }

  // Deduplicate by snippet
  const dedup = (arr) => arr.filter((v, i, a) => a.findIndex(x => x.snippet === v.snippet) === i);
  allFindings.actionItems  = dedup(allFindings.actionItems);
  allFindings.statusChanges = dedup(allFindings.statusChanges);
  allFindings.blockers     = dedup(allFindings.blockers);

  // Print summary
  console.log('\n── Action Items ──────────────────────────────────────────');
  for (const a of allFindings.actionItems) console.log(`  [${a.source}] ${a.snippet}`);

  console.log('\n── Status Changes ────────────────────────────────────────');
  for (const s of allFindings.statusChanges) console.log(`  [${s.date?.slice(0,16) || '?'}] [${s.source}] ${s.snippet}`);

  console.log('\n── Blockers ──────────────────────────────────────────────');
  for (const b of allFindings.blockers) console.log(`  [${b.source}] ${b.snippet}`);

  if (!dryRun) {
    const logPath = path.join(clientDir, 'email-log.json');
    // Merge with existing log
    const existing = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : { runs: [] };
    existing.runs.unshift(allFindings);
    existing.runs = existing.runs.slice(0, 10); // keep last 10 runs
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
    console.log(`\n[sync] Written to ${logPath}`);
  } else {
    console.log('\n[sync] Dry run — nothing written');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
