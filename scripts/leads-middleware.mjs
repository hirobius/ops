/**
 * scripts/leads-middleware.mjs — dev parity for GET /api/leads.
 *
 * In production `api/leads.ts` (a Vercel function) serves the read side of the
 * /ops Leads board; in `pnpm dev` this Vite middleware serves the same contract
 * so the board works locally. READ-ONLY: it only lists leads — the Duda
 * generate/build/publish lifecycle (PR #1's /api/pull-leads + /api/lead-action)
 * is intentionally not wired here (sourcing stays CLI-side, via
 * scripts/outscraper-fetch.mjs --supabase).
 *
 *   GET /api/leads?limit=<n>   → { leads: Lead[] }   (newest first)
 *
 * Auth: mirrors prod — requires a valid ops session cookie when the gate is
 * configured (OPS_GATE_PASSWORD + OPS_SESSION_SECRET). When it is NOT configured
 * (a bare local dev with no auth env), the gate is skipped for convenience.
 * The Supabase service-role key never reaches the browser — reads happen here.
 */

import { getServiceClient } from '../lib/supabase/server.mjs';
import { listLeads } from '../lib/supabase/leads.mjs';
import { requireOpsAuth, opsAuthConfigured } from '../lib/ops-auth.mjs';

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function clampLimit(raw) {
  const n = typeof raw === 'string' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/** Vite `configureServer` plugin serving GET /api/leads. */
export function leadsMiddleware() {
  return {
    name: 'leads-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || '';
        if (!url.startsWith('/api/leads')) return next();

        // Auth: enforce only when the gate is configured (see header note).
        if (opsAuthConfigured() && !requireOpsAuth(req)) {
          return sendJson(res, 401, { error: 'Unauthorized.', code: 'UNAUTHENTICATED' });
        }
        if (req.method !== 'GET') {
          return sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
        }

        try {
          const sb = await getServiceClient();
          const limit = clampLimit(new URL(url, 'http://localhost').searchParams.get('limit'));
          const { data, error } = await listLeads(sb, limit);
          if (error) return sendJson(res, 500, { error: error.message });
          return sendJson(res, 200, { leads: data ?? [] });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          const missingEnv = msg.startsWith('SUPABASE_MISSING_ENV');
          return sendJson(res, missingEnv ? 503 : 500, {
            error: msg,
            ...(missingEnv ? { code: 'ENV_MISSING_SUPABASE' } : {}),
          });
        }
      });
    },
  };
}
