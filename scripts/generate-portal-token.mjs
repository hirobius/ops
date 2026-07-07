#!/usr/bin/env node
/**
 * generate-portal-token — mint a /c/:slug?token=… HMAC token for a client.
 *
 * Mirrors the server verifier `lib/portal-auth.mjs` exactly so tokens generated
 * here verify at `/api/portal-verify`. Algorithm:
 *
 *   token = lowercase-hex( HMAC-SHA256( secret, utf8(slug) ) )
 *
 * Secret resolution (in priority order):
 *   1. --secret <value> CLI flag.
 *   2. PORTAL_HMAC_SECRET environment variable — the canonical server-only
 *      secret (same var the Vercel function reads). Set it in Vercel + export
 *      it locally to mint links that verify in production.
 *   3. VITE_PORTAL_HMAC_SECRET environment variable — legacy fallback from the
 *      old client-side gate; kept so pre-migration exports still resolve.
 *   4. Dev fallback `hirobius-portal-dev-fallback-secret` — dev-only; the dev
 *      portal bypasses server verification entirely (DEV_BYPASS). Production
 *      deployments MUST set PORTAL_HMAC_SECRET.
 *
 * Usage:
 *   node scripts/generate-portal-token.mjs <slug>
 *   node scripts/generate-portal-token.mjs <slug> --secret <value>
 *   node scripts/generate-portal-token.mjs <slug> --base https://hirobius.com
 *   node scripts/generate-portal-token.mjs <slug> --json
 *
 * Examples:
 *   node scripts/generate-portal-token.mjs lilac-insure
 *   node scripts/generate-portal-token.mjs the-ranch-foundation --base https://hirobius.com
 *
 * Token verification is server-side (`/api/portal-verify`, secret
 * `PORTAL_HMAC_SECRET` never bundled), so a valid link is a real gate. Treat
 * the URL as the credential, rotate `PORTAL_HMAC_SECRET` per engagement, and
 * use this CLI to issue fresh links to clients.
 */

import { createHmac } from 'node:crypto';

// Dev-only fallback. The dev portal bypasses server verification (DEV_BYPASS),
// so this only exists to produce a non-empty token for local link previews.
const DEV_PORTAL_SECRET = 'hirobius-portal-dev-fallback-secret';

function parseArgs(argv) {
  const args = { positional: [], secret: null, base: null, json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--secret') args.secret = argv[++i];
    else if (a.startsWith('--secret=')) args.secret = a.slice('--secret='.length);
    else if (a === '--base') args.base = argv[++i];
    else if (a.startsWith('--base=')) args.base = a.slice('--base='.length);
    else if (!a.startsWith('-')) args.positional.push(a);
    else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function resolveSecret(flagSecret) {
  if (flagSecret) return { secret: flagSecret, source: 'flag' };
  if (process.env.PORTAL_HMAC_SECRET)
    return { secret: process.env.PORTAL_HMAC_SECRET, source: 'PORTAL_HMAC_SECRET' };
  if (process.env.VITE_PORTAL_HMAC_SECRET)
    return { secret: process.env.VITE_PORTAL_HMAC_SECRET, source: 'VITE_PORTAL_HMAC_SECRET' };
  return { secret: DEV_PORTAL_SECRET, source: 'dev-fallback' };
}

function generateToken(slug, secret) {
  return createHmac('sha256', secret).update(slug, 'utf8').digest('hex');
}

function help() {
  console.log(
    [
      'generate-portal-token — mint /c/:slug?token=… for a Hirobius client.',
      '',
      'Usage:',
      '  node scripts/generate-portal-token.mjs <slug> [--secret <value>] [--base <url>] [--json]',
      '',
      'Secret resolution: --secret > $PORTAL_HMAC_SECRET > $VITE_PORTAL_HMAC_SECRET > dev fallback.',
      'See `lib/portal-auth.mjs` (server verifier behind /api/portal-verify) for the matching check.',
    ].join('\n'),
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    help();
    process.exit(0);
  }
  const [slug] = args.positional;
  if (!slug) {
    console.error('Error: <slug> is required.\n');
    help();
    process.exit(2);
  }

  const { secret, source } = resolveSecret(args.secret);
  const token = generateToken(slug, secret);

  const base = args.base ?? 'http://localhost:5173';
  const url = `${base.replace(/\/+$/, '')}/c/${encodeURIComponent(slug)}?token=${token}`;

  if (args.json) {
    process.stdout.write(
      JSON.stringify({ slug, token, url, secretSource: source }, null, 2) + '\n',
    );
    return;
  }

  console.log(`slug:    ${slug}`);
  console.log(`secret:  (from ${source})`);
  console.log(`token:   ${token}`);
  console.log(`url:     ${url}`);
  if (source === 'dev-fallback') {
    console.log('');
    console.log(
      'WARN: using dev-fallback secret. Production must set PORTAL_HMAC_SECRET.',
    );
  }
}

main();
