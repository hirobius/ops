/**
 * lib/api/handler.ts — composable wrappers for the /ops serverless functions.
 *
 * Two deep modules sit under every guarded `api/` route, so each handler stops
 * re-owning the auth → method → client → error prologue and becomes its domain
 * logic returning a plain `{ status, body }`:
 *
 *   withOpsHandler(method, fn)   owns: requireOpsAuth → 401, method guard → 405,
 *                                a top-level try/catch → 500 backstop, and the
 *                                single `res.status().json()` call. `fn` returns
 *                                `{ status, body }` — the return value IS the test
 *                                surface (no `res` leaks into a handler).
 *
 *   withServiceClient(fn)        owns: getServiceClient → 503 ENV_MISSING_SUPABASE.
 *                                Composes INSIDE withOpsHandler for the routes that
 *                                need Supabase; injects `sb` and returns a result, so
 *                                routes that don't need a client (api/route.ts) just
 *                                skip it.
 *
 * Because the inner fn is a plain `(sb, req) => { status, body }` (or `(req) => …`),
 * a handler's logic is testable with a stub `sb` and a plain request object — no
 * cookie, no env, no `res` mock. See tests/api/ops-handler.test.ts.
 *
 * Dependency categories (codebase-design DEEPENING.md): the wrapper is in-process;
 * auth and Supabase are local-substitutable (env + signSession for auth, a stub
 * object for `sb`), so there is no port at the external interface.
 *
 * ADR-0004 records the decision.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireOpsAuth } from '../ops-auth.mjs';
import { getServiceClient } from '../supabase/server.mjs';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** What every inner handler returns; the wrapper writes it to the response. */
export interface HandlerResult {
  status: number;
  body: unknown;
}

/** Inner handler with no Supabase dependency (e.g. api/route.ts). */
export type OpsHandler = (req: VercelRequest) => HandlerResult | Promise<HandlerResult>;

/** Inner handler that needs the service-role Supabase client. */
export type ServiceHandler = (
  sb: SupabaseClient,
  req: VercelRequest,
) => HandlerResult | Promise<HandlerResult>;

/** Normalise any thrown value to a string message. Centralised — was copied into 6 handlers. */
export function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Wrap an inner handler with the /ops gate, a method guard, and a 500 backstop.
 * The returned function is the Vercel handler (the route's default export).
 */
export function withOpsHandler(
  method: HttpMethod,
  fn: OpsHandler,
): (req: VercelRequest, res: VercelResponse) => Promise<void> {
  return async (req, res) => {
    // Server-side /ops gate — reject callers without a valid ops session cookie.
    if (!requireOpsAuth(req)) {
      res.status(401).json({ error: 'Unauthorized.', code: 'UNAUTHENTICATED' });
      return;
    }
    if (req.method !== method) {
      res.status(405).json({ error: `Method not allowed. Use ${method}.` });
      return;
    }
    try {
      const result = await fn(req);
      res.status(result.status).json(result.body);
    } catch (err) {
      // Backstop: any uncaught throw becomes a uniform JSON 500. Handlers that
      // need cleanup-on-error (e.g. a lead-status rollback) keep their own
      // try/catch and return { status: 500, … } explicitly.
      res.status(500).json({ error: messageOf(err) });
    }
  };
}

/**
 * Compose a service-role Supabase client into an inner handler. Acquires the
 * client (503 ENV_MISSING_SUPABASE if its env is unset) and injects it. Returns
 * an {@link OpsHandler}, so it slots straight into {@link withOpsHandler}.
 */
export function withServiceClient(fn: ServiceHandler): OpsHandler {
  return async (req) => {
    let sb: SupabaseClient;
    try {
      sb = await getServiceClient();
    } catch (err) {
      return { status: 503, body: { error: messageOf(err), code: 'ENV_MISSING_SUPABASE' } };
    }
    return fn(sb, req);
  };
}
