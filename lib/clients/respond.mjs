/**
 * lib/clients/respond.mjs — the GET /api/clients contract as a plain
 * `{ status, body }`, shared by the Vercel function (api/clients.ts) and the
 * dev middleware (scripts/clients-middleware.mjs) so the two cannot drift.
 *
 * Success: { clients: ClientRecord[] }
 * Error:   { error, code } with the ClientStoreError's status (503 table
 *          missing, 500 query failed) · { error } 500 for anything unexpected.
 */

/**
 * @param {{ list(): Promise<unknown[]> }} store a ClientStore (lib/clients/store.mjs)
 * @returns {Promise<{ status: number, body: unknown }>}
 */
export async function clientsResponse(store) {
  try {
    return { status: 200, body: { clients: await store.list() } };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (typeof err?.code === 'string' && typeof err?.status === 'number') {
      return { status: err.status, body: { error: message, code: err.code } };
    }
    return { status: 500, body: { error: message } };
  }
}
