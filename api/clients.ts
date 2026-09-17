/**
 * Vercel Serverless Function — GET /api/clients
 *
 * Read side for the /ops client surfaces (the /ops/clients gallery, the
 * per-client dashboard/report/brand-audit pages, the Clients disclosure on
 * /ops). Client records live OUT of the public repo, in the private Supabase
 * `client_records` table (migration 0015) behind the ClientStore port in
 * lib/clients/store.mjs — this replaces the old build-time
 * import.meta.glob reads of clients/<slug>/*.json, which only ever worked on a
 * machine holding the gitignored files.
 *
 * Records enter the store via the one-time, idempotent
 * `node --env-file=.env.local scripts/import-client-records.mjs --apply`.
 *
 * Success: { clients: ClientRecord[] }  (slug order; empty until imported)
 * Error:   { error, code? } with status 401/405/500/503
 *          503 ENV_MISSING_SUPABASE          — SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY unset
 *          503 CLIENT_RECORDS_TABLE_MISSING  — migration 0015 not applied yet
 *
 * Auth + Supabase acquisition are owned by lib/api/handler (ADR-0004). The
 * status/body mapping is lib/clients/respond.mjs, shared with the dev
 * middleware (scripts/clients-middleware.mjs).
 */

import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { createSupabaseClientStore } from '../lib/clients/store.mjs';
import { clientsResponse } from '../lib/clients/respond.mjs';

/** The slice of the ClientStore port this route reads (lib/clients/store.mjs). */
export interface ClientStoreReader {
  list(): Promise<unknown[]>;
}

export function clientsHandler(store: ClientStoreReader): Promise<HandlerResult> {
  return clientsResponse(store);
}

export default withOpsHandler(
  'GET',
  withServiceClient((sb) => clientsHandler(createSupabaseClientStore(sb))),
);
