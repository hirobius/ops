/**
 * Client portal token — HMAC-SHA256 of the slug, signed with a shared secret.
 *
 * NOT a hardened authn boundary. The frontend secret is bundled into the
 * static build (Vite inlines `import.meta.env.VITE_*` values), so a
 * sufficiently motivated reader can mint tokens. This is "casual unguessable
 * link" privacy — the same threat model as `/ops` gating. The acceptable
 * deployment is: rotate `VITE_PORTAL_HMAC_SECRET` per engagement, hand each
 * client a unique slug+token URL, treat the URL itself as the credential.
 *
 * The CLI counterpart `scripts/generate-portal-token.mjs` produces tokens
 * offline using Node `crypto`; this module verifies them in the browser
 * using Web Crypto SubtleCrypto. Both must agree on the same algorithm:
 *   token = lowercase-hex( HMAC-SHA256( secret, utf8(slug) ) )
 *
 * Secret resolution:
 *   1. `import.meta.env.VITE_PORTAL_HMAC_SECRET` if present (production).
 *   2. The dev-only fallback `DEV_PORTAL_SECRET` below (reproducible for
 *      local previews — never use in production; rotate before going live).
 *
 * Adrian: production deployments MUST set `VITE_PORTAL_HMAC_SECRET` in the
 * Vercel dashboard. The fallback is only for local-dev convenience so that
 * `pnpm dev` produces working portal links without `.env.local` plumbing.
 */

/**
 * Dev-only fallback secret. Stable across runs so that tokens generated
 * locally with the CLI continue to verify on subsequent dev sessions.
 * Production builds MUST override this via `VITE_PORTAL_HMAC_SECRET`.
 */
export const DEV_PORTAL_SECRET = 'hirobius-portal-dev-fallback-secret';

/** Resolves the active HMAC secret (env > dev fallback). */
export function getPortalSecret(): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env['VITE_PORTAL_HMAC_SECRET'] ?? DEV_PORTAL_SECRET;
}

/**
 * Computes lowercase-hex HMAC-SHA256(secret, slug) using Web Crypto.
 * Pure function — same input → same output.
 */
export async function computePortalToken(slug: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(slug));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Constant-time-ish equality on hex strings of identical length. Web Crypto
 * exposes no direct timing-safe compare, so this hand-rolled XOR loop is
 * the closest approximation available in-browser. Length mismatch is
 * non-secret (caller already lost) so we early-return on it.
 */
export function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * True iff `token` is a valid HMAC for `slug` under the active secret.
 * Empty / missing tokens always return false.
 */
export async function verifyPortalToken(
  slug: string,
  token: string | null | undefined,
): Promise<boolean> {
  if (!slug) return false;
  if (!token) return false;
  // Hex digest is 64 chars; reject anything else cheaply before crypto work.
  if (!/^[0-9a-f]{64}$/i.test(token)) return false;
  const expected = await computePortalToken(slug, getPortalSecret());
  return constantTimeEqualHex(expected.toLowerCase(), token.toLowerCase());
}
