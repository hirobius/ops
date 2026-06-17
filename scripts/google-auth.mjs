#!/usr/bin/env node
/**
 * scripts/google-auth.mjs
 *
 * One-time OAuth setup: generates a Google refresh token with Gmail + Drive scope.
 * Run this once, copy the printed GMAIL_REFRESH_TOKEN into .env.local.
 *
 * Usage:
 *   node scripts/google-auth.mjs
 *
 * Prerequisites (in .env.local):
 *   GMAIL_CLIENT_ID      — from Google Cloud Console > OAuth 2.0 credentials
 *   GMAIL_CLIENT_SECRET  — same credential
 *
 * After running, add to .env.local:
 *   GMAIL_REFRESH_TOKEN=<printed token>
 *
 * The token covers both Gmail (read) and Drive (read) — one token for both
 * sync-client-emails.mjs and process-call-recording.mjs.
 */

import http    from 'http';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Load env
const envFile = path.join(ROOT, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const CLIENT_ID     = process.env.GMAIL_CLIENT_ID     || process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET must be set in .env.local');
  console.error('');
  console.error('Steps to get credentials:');
  console.error('  1. Go to console.cloud.google.com > APIs & Services > Credentials');
  console.error('  2. Create an OAuth 2.0 Client ID (type: Desktop App)');
  console.error('  3. Download or copy Client ID + Secret into .env.local');
  process.exit(1);
}

const REDIRECT_URI = 'http://localhost:3333/callback';
const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.readonly',
].join(' ');

const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
  new URLSearchParams({
    client_id:     CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES,
    access_type:   'offline',
    prompt:        'consent',   // forces refresh_token to be returned even if already authed
  });

console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for callback on http://localhost:3333/callback ...\n');

const server = http.createServer(async (req, res) => {
  const url  = new URL(req.url, 'http://localhost:3333');
  const code = url.searchParams.get('code');
  const err  = url.searchParams.get('error');

  if (err) {
    res.end('Auth failed: ' + err);
    console.error('Auth error:', err);
    server.close();
    process.exit(1);
  }

  if (!code) { res.end('No code — try again'); return; }

  res.end('<html><body><h2>Auth complete — you can close this tab.</h2></body></html>');

  // Exchange code for tokens
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });

  const tokens = await tokenRes.json();

  if (!tokens.refresh_token) {
    console.error('\nNo refresh_token returned. This happens if you already approved this app.');
    console.error('Go to https://myaccount.google.com/permissions and revoke the app, then re-run.');
    server.close();
    process.exit(1);
  }

  console.log('\n✓ Success! Add this to .env.local:\n');
  console.log(`GMAIL_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log('');
  console.log('This token covers: Gmail (read) + Drive (read)');
  console.log('Used by: sync-client-emails.mjs and process-call-recording.mjs');

  server.close();
});

server.listen(3333, () => {});
