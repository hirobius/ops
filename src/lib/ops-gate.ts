/**
 * /ops gate — client-side password check.
 *
 * NOT security. The source is public. This deters casual visitors and
 * keeps /ops out of the casual-browse experience and out of search-engine
 * indexes (paired with noindex meta + robots.txt).
 *
 * The stored hash comes from `import.meta.env.VITE_OPS_GATE_HASH` (set
 * locally + in Vercel dashboard). On a successful match, set a 7-day
 * localStorage flag so subsequent /ops visits pass through.
 */

export const OPS_GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STORAGE_KEY = 'ops-gate-access';

/** SHA-256 hex digest of the input. */
export async function hashPassword(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True iff `hashPassword(input) === expectedHash` and `expectedHash` non-empty. */
export async function verifyPassword(input: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash) return false;
  return (await hashPassword(input)) === expectedHash;
}

/** Returns true if a non-expired access timestamp exists in localStorage. */
export function getStoredAccess(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const ts = Number.parseInt(raw, 10);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < OPS_GATE_TTL_MS;
}

/** Stores current timestamp as the access flag. */
export function setStoredAccess(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

/** Clears the access flag (manual sign-out). */
export function clearStoredAccess(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
