/**
 * lib/supabase/server.mjs — server-only Supabase client (service-role).
 *
 * ⚠️ SERVER ONLY. The service-role key bypasses Row Level Security. NEVER import
 * this from client/browser code (anything under src/). It is consumed only by:
 *   - the Vercel serverless functions in api/ (production)
 *   - the Vite dev middleware in scripts/leads-middleware.mjs (local dev)
 *
 * `@supabase/supabase-js` is loaded via a dynamic import so this module can be
 * referenced from vite.config.mjs (which imports the dev middleware at
 * config-load time) WITHOUT the package being installed yet. The client is only
 * constructed when a request actually arrives.
 *
 * Env (set by the human in Vercel / .env.local — never written by an agent):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 */

/** @type {import('@supabase/supabase-js').SupabaseClient | undefined} */
let cached;

/**
 * Returns a memoised service-role Supabase client.
 * @throws {Error} with code-prefixed message when env vars are missing.
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient>}
 */
export async function getServiceClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_MISSING_ENV: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        '(Vercel project env, server-side only).',
    );
  }

  if (cached) return cached;

  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
