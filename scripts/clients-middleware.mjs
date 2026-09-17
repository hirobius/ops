/**
 * scripts/clients-middleware.mjs
 *
 * Dev-only mirror of GET /api/clients (client records from the private store),
 * using the same ClientStore adapter + response mapping as the prod function
 * (lib/clients/store.mjs + lib/clients/respond.mjs). Wired in vite.config.mjs
 * with apply:'serve' so it never ships to prod.
 *
 *   GET /api/clients → { clients } | { error, code }
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in process.env (vite.config
 * copies them from .env.local). Without them it answers 503
 * ENV_MISSING_SUPABASE, exactly like production.
 */

import { getServiceClient } from '../lib/supabase/server.mjs';
import { createSupabaseClientStore } from '../lib/clients/store.mjs';
import { clientsResponse } from '../lib/clients/respond.mjs';

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

const messageOf = (err) => (err instanceof Error ? err.message : String(err));

export function createClientsMiddleware() {
  return {
    // GET /api/clients
    list: async (req, res, next) => {
      if (req.method !== 'GET') return next();
      let sb;
      try {
        sb = await getServiceClient();
      } catch (err) {
        return sendJson(res, 503, { error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
      }
      const { status, body } = await clientsResponse(createSupabaseClientStore(sb));
      return sendJson(res, status, body);
    },
  };
}
