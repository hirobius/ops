/**
 * scripts/clients-middleware.mjs
 *
 * Dev-only mirror of GET /api/clients (client records from the private store),
 * using the same ClientStore adapter + response mapping as the prod function
 * (lib/clients/store.mjs + lib/clients/respond.mjs). Wired in vite.config.mjs
 * with apply:'serve' so it never ships to prod.
 *
 *   GET /api/clients → { clients, localDrift? } | { error, code }
 *
 * Dev is the one place that can see both the store AND this machine's
 * gitignored clients/<slug>/ folders (where records are still written — by hand
 * and by scripts/auto-assigner.mjs). When they disagree the body carries
 * `localDrift: { create, update, problems }` (slugs and file problems only) and
 * the client pages warn with the import command, instead of silently rendering
 * the store's older copy. Production has no local folders, so it never adds it.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in process.env (vite.config
 * copies them from .env.local). Without them it answers 503
 * ENV_MISSING_SUPABASE, exactly like production.
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSupabaseClientStore } from '../lib/clients/store.mjs';
import { clientsResponse } from '../lib/clients/respond.mjs';
import { localDrift } from './import-client-records.mjs';

const DEFAULT_CLIENTS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../clients',
);

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

const messageOf = (err) => (err instanceof Error ? err.message : String(err));

/**
 * @param {{ openStore?: typeof openSupabaseClientStore, clientsDir?: string }} [options]
 *   seams for tests; defaults are the Supabase store and the repo's clients/ folder.
 */
export function createClientsMiddleware({
  openStore = openSupabaseClientStore,
  clientsDir = DEFAULT_CLIENTS_DIR,
} = {}) {
  return {
    // GET /api/clients
    list: async (req, res, next) => {
      if (req.method !== 'GET') return next();
      let store;
      try {
        store = await openStore();
      } catch (err) {
        return sendJson(res, 503, { error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
      }
      const { status, body } = await clientsResponse(store);
      if (status === 200) {
        const drift = localDrift(clientsDir, body.clients);
        if (drift) return sendJson(res, status, { ...body, localDrift: drift });
      }
      return sendJson(res, status, body);
    },
  };
}
