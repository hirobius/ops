#!/usr/bin/env node
/**
 * scripts/youtube-knowledge.mjs
 *
 * Fetches liked + Watch Later videos from multiple Google accounts,
 * gets transcripts, summarizes via local Hermes, writes structured
 * markdown to data/knowledge/grow/youtube/.
 *
 * Usage:
 *   node scripts/youtube-knowledge.mjs --auth          # first-time OAuth (run once per account)
 *   node scripts/youtube-knowledge.mjs                 # fetch + summarize new videos
 *   node scripts/youtube-knowledge.mjs --dry-run       # show what would be fetched
 *   node scripts/youtube-knowledge.mjs --limit 20      # cap videos per account
 *
 * Accounts:
 *   adrian.milsap@gmail.com  → .youtube-token-personal.json
 *   adrian@hirobius.com      → .youtube-token-work.json
 *
 * Throttling:
 *   YouTube Data API: ~4 quota units per 200 videos (well under 10K/day limit)
 *   Transcript fetching: unofficial endpoint, 1.5s delay between requests
 *   Already-processed videos are cached — never re-fetched
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT      = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR   = path.join(ROOT, 'data/knowledge/grow/youtube');
const CACHE_FILE = path.join(ROOT, 'data/knowledge/grow/youtube/.processed.json');
const OAUTH_CLIENT = path.join(ROOT, '.youtube-oauth-client.json');

// Auto-load .env.local
const envLocal = path.join(ROOT, '.env.local');
if (fs.existsSync(envLocal)) {
  for (const line of fs.readFileSync(envLocal, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const argv      = process.argv.slice(2);
const DRY_RUN   = argv.includes('--dry-run');
const DIGEST    = argv.includes('--digest');
const limitIdx  = argv.indexOf('--limit');
const LIMIT     = limitIdx !== -1 ? parseInt(argv[limitIdx + 1], 10) : 50;
const acctIdx   = argv.indexOf('--account');
const ONLY_ACCT = acctIdx !== -1 ? argv[acctIdx + 1] : null; // 'personal' | 'work'

const DIGEST_CACHE = path.join(ROOT, 'data/knowledge/grow/youtube/.digest-sent.json');

const ACCOUNTS = [
  { label: 'personal', email: 'adrian.milsap@gmail.com', tokenFile: path.join(ROOT, '.youtube-token-personal.json') },
  { label: 'work',     email: 'adrian@hirobius.com',     tokenFile: path.join(ROOT, '.youtube-token-work.json')     },
];

// ── Dependency check ──────────────────────────────────────────────────────────

function checkDeps() {
  const missing = [];
  try { execSync('node -e "require(\'googleapis\')"', { stdio: 'pipe' }); } catch { missing.push('googleapis'); }
  try { execSync('node -e "require(\'youtube-transcript\')"', { stdio: 'pipe' }); } catch { missing.push('youtube-transcript'); }
  if (missing.length) {
    console.error(`[youtube] Missing deps: ${missing.join(', ')}`);
    console.error(`[youtube] Run: pnpm add -D ${missing.join(' ')}`);
    process.exit(1);
  }
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

async function getAuthClient(account) {
  const { google } = await import('googleapis');
  const creds = JSON.parse(fs.readFileSync(OAUTH_CLIENT, 'utf8'));
  const { client_id, client_secret, redirect_uris } = creds.installed;

  const oauth2 = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

  if (fs.existsSync(account.tokenFile)) {
    const token = JSON.parse(fs.readFileSync(account.tokenFile, 'utf8'));
    oauth2.setCredentials(token);
    // Refresh if expired
    if (token.expiry_date && token.expiry_date < Date.now()) {
      const { credentials } = await oauth2.refreshAccessToken();
      fs.writeFileSync(account.tokenFile, JSON.stringify(credentials, null, 2));
      oauth2.setCredentials(credentials);
    }
    return oauth2;
  }

  // First-time auth — spin up a local server to capture the redirect
  const { createServer } = await import('http');
  const PORT = 8085;

  const oauth2Local = new google.auth.OAuth2(client_id, client_secret, `http://localhost:${PORT}`);
  const authUrl = oauth2Local.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/youtube.readonly'],
  });

  console.log(`\n[youtube] Authorize ${account.email}:`);
  console.log(`\nOpen this URL in your browser:\n${authUrl}\n`);

  // Try to open browser automatically
  try { execSync(`wslview "${authUrl}" 2>/dev/null || xdg-open "${authUrl}" 2>/dev/null || true`); } catch {}

  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<h2>Authorized! You can close this tab.</h2>');
      server.close();
      if (code) resolve(code); else reject(new Error('No code in redirect'));
    });
    server.listen(PORT, () => console.log(`[youtube] Waiting for auth on http://localhost:${PORT} ...`));
    server.on('error', reject);
  });

  // Swap back to original oauth2 client with correct redirect
  oauth2.redirectUri = `http://localhost:${PORT}`;

  const { tokens } = await oauth2Local.getToken(code);
  fs.writeFileSync(account.tokenFile, JSON.stringify(tokens, null, 2));
  oauth2.setCredentials(tokens);
  console.log(`[youtube] Token saved for ${account.email}`);
  return oauth2;
}

// ── Playlist fetcher ──────────────────────────────────────────────────────────

async function fetchPlaylist(youtube, playlistId, label) {
  const videos = [];
  let pageToken;

  do {
    const res = await youtube.playlistItems.list({
      part: ['snippet'],
      playlistId,
      maxResults: 50,
      pageToken,
    });
    for (const item of res.data.items || []) {
      const snip = item.snippet;
      if (!snip?.resourceId?.videoId) continue;
      videos.push({
        id: snip.resourceId.videoId,
        title: snip.title,
        channel: snip.videoOwnerChannelTitle || '',
        description: (snip.description || '').slice(0, 200),
        publishedAt: snip.publishedAt,
        playlist: label,
      });
    }
    pageToken = res.data.nextPageToken;
  } while (pageToken && videos.length < LIMIT);

  return videos.slice(0, LIMIT);
}

// ── Transcript fetcher ────────────────────────────────────────────────────────

async function getTranscript(videoId) {
  try {
    const { YoutubeTranscript } = await import('youtube-transcript');
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    return segments.map(s => s.text).join(' ').slice(0, 8000); // cap at 8K chars
  } catch {
    return null; // no transcript available (live streams, music, etc.)
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Summarizer + Triage ───────────────────────────────────────────────────────
//
// signal levels:
//   high   — directly actionable NOW (implementable technique, tool that replaces
//             something in our stack, AI/agency/design insight that changes how we work)
//   medium — useful reference, general learning, good to have indexed
//   low    — mildly interesting but not relevant to BUILD/GROW/RUN
//   noise  — entertainment, gaming, music, algorithm filler, outdated content

function summarizeWithHermes(video, transcript) {
  const prompt = `You are triaging a YouTube video for a solo AI agency founder's knowledge base.
The founder builds design systems (BUILD), runs an agency (GROW), and maintains AI infrastructure (RUN).

Title: ${video.title}
Channel: ${video.channel}
${transcript ? `Transcript excerpt: ${transcript.slice(0, 3000)}` : `Description: ${video.description}`}

Output JSON only — no markdown, no explanation:
{
  "summary": "2-3 sentences on what this video actually covers",
  "key_takeaways": ["specific actionable point 1", "specific actionable point 2"],
  "why_saved": "one sentence on why this was worth saving",
  "pillar": "build|grow|run",
  "tags": ["tag1", "tag2"],
  "signal": "high|medium|low|noise",
  "signal_reason": "one sentence explaining the signal rating"
}

Signal guide:
- high: implementable technique/tool directly applicable to HDS, agency work, or Concrete Creations; OR introduces an AI workflow that replaces something in our stack
- medium: useful learning about design, AI, dev, business — worth indexing, not urgent
- low: tangentially related, general inspiration, not immediately actionable
- noise: entertainment, gaming, music, unrelated lifestyle, very outdated content`;

  try {
    const HERMES = path.join(process.env.HOME, '.local/bin/hermes');
    const result = execSync(
      `${HERMES} chat -q ${JSON.stringify(prompt)} -Q --yolo -m "qwen2.5-coder:14b-hds" --provider local-ollama`,
      { cwd: ROOT, encoding: 'utf8', timeout: 60_000, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
  } catch { /* fall through */ }

  return {
    summary: video.description || video.title,
    key_takeaways: [],
    why_saved: 'Saved for later review',
    pillar: 'run',
    tags: [],
    signal: 'medium',
    signal_reason: 'Could not analyze — fallback entry',
  };
}

// ── Discord signal post ───────────────────────────────────────────────────────

function postSignalToDiscord(video, summary) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return;

  const emoji = { high: '🔥', medium: '📌', low: '📎', noise: '🗑️' };
  const e = emoji[summary.signal] || '📌';

  // Only auto-post high signal — medium goes into weekly digest, low/noise skipped
  if (summary.signal !== 'high') return;

  const msg = {
    embeds: [{
      title: `${e} ${video.title}`,
      url: `https://www.youtube.com/watch?v=${video.id}`,
      description: summary.summary,
      color: 0xFF4500,
      fields: [
        { name: 'Channel', value: video.channel, inline: true },
        { name: 'Pillar', value: summary.pillar?.toUpperCase() || 'RUN', inline: true },
        { name: 'Why', value: summary.signal_reason || summary.why_saved, inline: false },
        { name: 'Takeaways', value: (summary.key_takeaways || []).map(t => `• ${t}`).join('\n') || '—', inline: false },
      ],
      footer: { text: `Signal: ${summary.signal?.toUpperCase()} · youtube-knowledge` },
    }],
  };

  try {
    execSync(
      `curl -s -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify(msg))} "${url}"`,
      { stdio: 'ignore', timeout: 5000 }
    );
  } catch { /* non-fatal */ }
}

// ── Writer ────────────────────────────────────────────────────────────────────

function writeVideoMarkdown(video, summary, account) {
  const dir = path.join(OUT_DIR, summary.pillar || 'run');
  fs.mkdirSync(dir, { recursive: true });

  const signal = summary.signal || 'medium';
  const content = `---
pillar: ${summary.pillar || 'run'}
source: youtube
account: ${account.label}
video_id: ${video.id}
channel: ${video.channel}
playlist: ${video.playlist}
date_saved: ${new Date().toISOString().slice(0, 10)}
signal: ${signal}
tags: [${(summary.tags || []).map(t => `"${t}"`).join(', ')}]
---

# ${video.title}

**Channel:** ${video.channel}
**URL:** https://www.youtube.com/watch?v=${video.id}
**Signal:** ${signal.toUpperCase()} — ${summary.signal_reason || ''}

## Summary
${summary.summary}

## Why Saved
${summary.why_saved}

## Key Takeaways
${(summary.key_takeaways || []).map(t => `- ${t}`).join('\n') || '- (no transcript available)'}
`;

  fs.writeFileSync(path.join(dir, `${video.id}.md`), content, 'utf8');
}

// ── Cache ─────────────────────────────────────────────────────────────────────

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return new Set();
  return new Set(JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')));
}

function saveCache(processed) {
  fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify([...processed], null, 2));
}

// ── Weekly digest ─────────────────────────────────────────────────────────────

function runWeeklyDigest() {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) { console.error('[youtube] DISCORD_WEBHOOK_URL not set'); process.exit(1); }

  const sent = fs.existsSync(DIGEST_CACHE)
    ? new Set(JSON.parse(fs.readFileSync(DIGEST_CACHE, 'utf8')))
    : new Set();

  // Scan all pillar dirs for medium-signal .md files not yet digested
  const items = [];
  for (const pillar of ['build', 'grow', 'run']) {
    const dir = path.join(OUT_DIR, pillar);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.md') && f !== 'index.md')) {
      const videoId = file.replace('.md', '');
      if (sent.has(videoId)) continue;
      const content = fs.readFileSync(path.join(dir, file), 'utf8');
      const signalMatch = content.match(/^signal:\s*(.+)$/m);
      const signal = signalMatch?.[1]?.trim();
      if (signal !== 'medium') continue;
      const titleMatch = content.match(/^# (.+)$/m);
      const urlMatch = content.match(/\*\*URL:\*\* (https:\/\/[^\s]+)/m);
      const channelMatch = content.match(/\*\*Channel:\*\* (.+)$/m);
      const summaryMatch = content.match(/## Summary\n([\s\S]+?)\n\n/);
      items.push({
        id: videoId,
        title: titleMatch?.[1] || videoId,
        url: urlMatch?.[1] || `https://www.youtube.com/watch?v=${videoId}`,
        channel: channelMatch?.[1]?.trim() || '',
        summary: summaryMatch?.[1]?.trim() || '',
        pillar: pillar.toUpperCase(),
      });
    }
  }

  if (items.length === 0) {
    console.log('[youtube] No new medium-signal items for digest');
    return;
  }

  const lines = items.map(i =>
    `📌 **[${i.title}](${i.url})**\n${i.channel} · ${i.pillar}\n${i.summary ? i.summary.slice(0, 120) + '…' : ''}`
  );

  const content = `## 📋 Weekly YouTube Intel Digest — ${new Date().toISOString().slice(0, 10)}\n${items.length} medium-signal videos saved this week:\n\n${lines.join('\n\n')}`;

  // Discord has a 2000 char limit — chunk if needed
  const chunks = [];
  let current = '';
  for (const line of content.split('\n\n')) {
    if ((current + '\n\n' + line).length > 1900) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? current + '\n\n' + line : line;
    }
  }
  if (current) chunks.push(current);

  for (const chunk of chunks) {
    try {
      execSync(
        `curl -s -X POST -H "Content-Type: application/json" -d ${JSON.stringify(JSON.stringify({ content: chunk }))} "${url}"`,
        { stdio: 'ignore', timeout: 5000 }
      );
    } catch { /* non-fatal */ }
  }

  // Mark all as sent
  for (const item of items) sent.add(item.id);
  fs.writeFileSync(DIGEST_CACHE, JSON.stringify([...sent], null, 2));
  console.log(`[youtube] Digest sent — ${items.length} items → Discord`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (DIGEST) { runWeeklyDigest(); return; }
  checkDeps();
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const processed = loadCache();
  const { google } = await import('googleapis');
  let totalNew = 0;

  const accountsToRun = ONLY_ACCT
    ? ACCOUNTS.filter(a => a.label === ONLY_ACCT)
    : ACCOUNTS;

  if (accountsToRun.length === 0) {
    console.error(`[youtube] Unknown account: ${ONLY_ACCT}. Use 'personal' or 'work'.`);
    process.exit(1);
  }

  for (const account of accountsToRun) {
    console.log(`\n[youtube] Account: ${account.email}`);

    let auth;
    try {
      auth = await getAuthClient(account);
    } catch (e) {
      console.log(`[youtube] Skipping ${account.label} — auth failed: ${e.message}`);
      console.log(`[youtube] Run with --auth to set up tokens for this account`);
      continue;
    }

    const youtube = google.youtube({ version: 'v3', auth });
    const videos = [];

    // Liked Videos (LL) + Watch Later (WL)
    for (const [id, label] of [['LL', 'liked'], ['WL', 'watch-later']]) {
      try {
        const batch = await fetchPlaylist(youtube, id, label);
        console.log(`  ${label}: ${batch.length} videos`);
        videos.push(...batch);
      } catch (e) {
        console.log(`  ${label}: skipped (${e.message})`);
      }
    }

    const newVideos = videos.filter(v => !processed.has(v.id));
    console.log(`  ${newVideos.length} new (${videos.length - newVideos.length} already processed)`);

    if (DRY_RUN) continue;

    for (const video of newVideos) {
      process.stdout.write(`  Processing: ${video.title.slice(0, 60)}...`);
      const transcript = await getTranscript(video.id);
      const summary = summarizeWithHermes(video, transcript);
      writeVideoMarkdown(video, summary, account);
      postSignalToDiscord(video, summary);
      processed.add(video.id);
      totalNew++;
      process.stdout.write(` [${(summary.signal || 'medium').toUpperCase()}] done\n`);
      await sleep(1500); // respect unofficial transcript API rate limit
    }
  }

  if (!DRY_RUN) {
    saveCache(processed);
    console.log(`\n[youtube] Complete — ${totalNew} new videos processed → data/knowledge/grow/youtube/`);
  }
}

main().catch(e => { console.error('[youtube] Fatal:', e.message); process.exit(1); });
