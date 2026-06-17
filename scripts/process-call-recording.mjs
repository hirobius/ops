#!/usr/bin/env node
/**
 * scripts/process-call-recording.mjs
 *
 * Download, extract, and transcribe call recording ZIPs from Google Drive.
 * Point it at a folder ID and it processes every unread ZIP inside.
 * Point it at a single file ID and it processes just that one.
 *
 * Usage:
 *   node scripts/process-call-recording.mjs <folder-or-file-id> [options]
 *
 * Options:
 *   --client <slug>         write transcript into clients/<slug>/recordings/
 *   --out <path>            write transcript to an explicit file path
 *   --provider openai|groq  transcription backend (default: openai)
 *   --dry-run               download + extract only, skip transcription
 *   --keep-zip              don't delete downloaded ZIP after extraction
 *
 * Required env vars (.env.local):
 *   GMAIL_CLIENT_ID       Google OAuth client ID (same account, needs Drive scope)
 *   GMAIL_CLIENT_SECRET   Google OAuth client secret
 *   GMAIL_REFRESH_TOKEN   Refresh token — must include drive.readonly scope
 *                         (re-run scripts/google-auth.mjs if you get a 403)
 *   OPENAI_API_KEY        For OpenAI Whisper (or set GROQ_API_KEY for Groq)
 *
 * Audio formats recognised inside the ZIP:
 *   .m4a  .mp3  .wav  .mp4  .aac  .ogg  .flac  .webm
 */

import fs   from 'fs';
import os   from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath }      from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── Env ───────────────────────────────────────────────────────────────────────

const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Args ──────────────────────────────────────────────────────────────────────

const args     = process.argv.slice(2);
const driveId  = args.find(a => !a.startsWith('--'));
const dryRun   = args.includes('--dry-run');
const keepZip  = args.includes('--keep-zip');
const provider = args[args.indexOf('--provider') + 1] ?? (process.env.GROQ_API_KEY ? 'groq' : 'openai');
const clientSlug = args[args.indexOf('--client') + 1] ?? null;
const outPath    = args[args.indexOf('--out') + 1]    ?? null;

if (!driveId) {
  console.error('Usage: node scripts/process-call-recording.mjs <folder-or-file-id> [--client <slug>] [--dry-run]');
  process.exit(1);
}

// ── Google OAuth token refresh ────────────────────────────────────────────────

async function getAccessToken() {
  const clientId     = process.env.GMAIL_CLIENT_ID     || process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_DRIVE_REFRESH_TOKEN || process.env.GMAIL_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('Missing Google OAuth credentials. Need GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN in .env.local');
    console.error('Run scripts/google-auth.mjs to generate a token with Gmail + Drive scopes.');
    process.exit(1);
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

  const data = await res.json();
  if (!data.access_token) {
    console.error('Token refresh failed:', JSON.stringify(data));
    if (data.error === 'invalid_grant' || data.error_description?.includes('scope')) {
      console.error('\nThe existing token may lack Drive scope.');
      console.error('Run: node scripts/google-auth.mjs --scopes gmail,drive');
    }
    process.exit(1);
  }
  return data.access_token;
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveGet(token, endpoint, params = {}) {
  const url = new URL(`https://www.googleapis.com/drive/v3/${endpoint}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API ${res.status}: ${err}`);
  }
  return res.json();
}

async function getFileMeta(token, fileId) {
  return driveGet(token, `files/${fileId}`, { fields: 'id,name,mimeType,size,parents' });
}

async function listFolderZips(token, folderId) {
  const q = `'${folderId}' in parents and mimeType = 'application/x-zip' and trashed = false`;
  const data = await driveGet(token, 'files', { q, fields: 'files(id,name,size,createdTime)', pageSize: '50' });
  return data.files ?? [];
}

async function downloadFile(token, fileId, destPath) {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${await res.text()}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

// ── ZIP extraction (Python3 zipfile — no extra deps) ──────────────────────────

const AUDIO_EXTS = new Set(['.m4a', '.mp3', '.wav', '.mp4', '.aac', '.ogg', '.flac', '.webm']);

function extractZip(zipPath, destDir) {
  const result = spawnSync('python3', ['-c', `
import zipfile, os, sys
zf = zipfile.ZipFile(sys.argv[1])
zf.extractall(sys.argv[2])
names = zf.namelist()
print('\\n'.join(names))
`, zipPath, destDir], { encoding: 'utf8' });

  if (result.status !== 0) throw new Error(`Extraction failed: ${result.stderr}`);
  return result.stdout.trim().split('\n').filter(Boolean);
}

function findAudioFiles(dir) {
  const results = [];
  function walk(d) {
    for (const entry of fs.readdirSync(d)) {
      const full = path.join(d, entry);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (AUDIO_EXTS.has(path.extname(entry).toLowerCase())) results.push(full);
    }
  }
  walk(dir);
  return results;
}

// ── Transcription ─────────────────────────────────────────────────────────────

async function transcribeOpenAI(audioPath) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY not set in .env.local');

  const audioData = fs.readFileSync(audioPath);
  const ext       = path.extname(audioPath).slice(1) || 'm4a';
  const mimeMap   = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm' };
  const mime      = mimeMap[ext] ?? 'audio/mpeg';

  const form = new FormData();
  form.append('file', new Blob([audioData], { type: mime }), path.basename(audioPath));
  form.append('model', 'whisper-1');
  form.append('response_format', 'verbose_json');
  form.append('language', 'en');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Whisper API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function transcribeGroq(audioPath) {
  const key = process.env.GROQ_API_KEY;
  if (!key) throw new Error('GROQ_API_KEY not set in .env.local');

  const audioData = fs.readFileSync(audioPath);
  const ext       = path.extname(audioPath).slice(1) || 'm4a';
  const mimeMap   = { m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', mp4: 'video/mp4' };
  const mime      = mimeMap[ext] ?? 'audio/mpeg';

  const form = new FormData();
  form.append('file', new Blob([audioData], { type: mime }), path.basename(audioPath));
  form.append('model', 'whisper-large-v3');
  form.append('response_format', 'verbose_json');
  form.append('language', 'en');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });

  if (!res.ok) throw new Error(`Groq Whisper ${res.status}: ${await res.text()}`);
  return res.json();
}

async function transcribe(audioPath) {
  const sizeMB = (fs.statSync(audioPath).size / 1024 / 1024).toFixed(1);
  console.log(`  Transcribing ${path.basename(audioPath)} (${sizeMB} MB) via ${provider}...`);
  return provider === 'groq' ? transcribeGroq(audioPath) : transcribeOpenAI(audioPath);
}

// ── Transcript formatter ──────────────────────────────────────────────────────

function formatTranscript(result, meta) {
  const durationMin = result.duration ? (result.duration / 60).toFixed(1) : '?';
  const lines = [
    `# Call Transcript`,
    ``,
    `**Source:** ${meta.sourceName}`,
    `**Processed:** ${new Date().toISOString().split('T')[0]}`,
    `**Duration:** ~${durationMin} min`,
    `**Provider:** ${provider}`,
    ``,
    `---`,
    ``,
  ];

  if (result.segments?.length) {
    for (const seg of result.segments) {
      const ts = formatTime(seg.start);
      lines.push(`**[${ts}]** ${seg.text.trim()}`);
      lines.push('');
    }
  } else {
    lines.push(result.text ?? '');
  }

  return lines.join('\n');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Output path ───────────────────────────────────────────────────────────────

function resolveOutputPath(sourceName) {
  const stem = path.basename(sourceName, path.extname(sourceName))
    .replace(/[^a-z0-9_-]/gi, '-').toLowerCase();
  const date = new Date().toISOString().split('T')[0];
  const filename = `${date}-${stem}.md`;

  if (outPath) return outPath;
  if (clientSlug) {
    const dir = path.join(ROOT, 'clients', clientSlug, 'recordings');
    fs.mkdirSync(dir, { recursive: true });
    return path.join(dir, filename);
  }
  return path.join(ROOT, 'docs', 'transcripts', filename);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function processFile(token, fileId, fileName) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hiro-rec-'));
  const zipPath = path.join(tmpDir, fileName);

  try {
    console.log(`\n→ ${fileName}`);

    // Download
    process.stdout.write('  Downloading...');
    const bytes = await downloadFile(token, fileId, zipPath);
    console.log(` ${(bytes / 1024 / 1024).toFixed(1)} MB`);

    // Extract
    process.stdout.write('  Extracting...');
    const extracted = extractZip(zipPath, tmpDir);
    const audioFiles = findAudioFiles(tmpDir);
    console.log(` ${extracted.length} files, ${audioFiles.length} audio`);

    if (audioFiles.length === 0) {
      console.log('  No audio files found — skipping');
      return null;
    }

    if (!keepZip) fs.unlinkSync(zipPath);

    if (dryRun) {
      console.log('  [dry-run] audio files:', audioFiles.map(f => path.relative(tmpDir, f)));
      return null;
    }

    // Transcribe (first audio file found — most recordings are single-track)
    const audioPath = audioFiles[0];
    const result    = await transcribe(audioPath);
    const transcript = formatTranscript(result, { sourceName: fileName });

    // Write
    const dest = resolveOutputPath(fileName);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, transcript);
    console.log(`  Written → ${path.relative(ROOT, dest)}`);

    return dest;

  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
}

async function main() {
  console.log('process-call-recording — Hirobius');
  const token = await getAccessToken();

  // Determine if input is a folder or a file
  const meta = await getFileMeta(token, driveId);
  const isFolder = meta.mimeType === 'application/vnd.google-apps.folder';

  let files;
  if (isFolder) {
    console.log(`Folder: ${meta.name}`);
    files = await listFolderZips(token, driveId);
    console.log(`Found ${files.length} ZIP(s)`);
    if (files.length === 0) { console.log('Nothing to process.'); process.exit(0); }
  } else {
    console.log(`File: ${meta.name} (${meta.mimeType})`);
    files = [{ id: meta.id, name: meta.name }];
  }

  const results = [];
  for (const f of files) {
    const dest = await processFile(token, f.id, f.name);
    if (dest) results.push(dest);
  }

  if (results.length) {
    console.log(`\nDone. ${results.length} transcript(s) written.`);
    if (clientSlug) {
      console.log(`Tip: update clients/${clientSlug}/notes.md with key takeaways from the transcript.`);
    }
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
