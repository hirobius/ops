/**
 * scripts/digest-middleware.mjs — dev-only mirror of /api/digest +
 * /api/digest-action. Reuses lib/digests/actions.mjs + lib/supabase/digests.mjs
 * (same logic as the prod functions). Wired in vite.config.mjs with
 * apply:'serve' so it never ships to prod.
 *
 *   GET  /api/digest         ?include_dismissed=0   → { items }
 *   POST /api/digest-action  { key, action }          → { ok, ... }
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in process.env (vite.config
 * copies them from .env.local).
 */

import { getServiceClient } from '../lib/supabase/server.mjs';
import { listDigestItems } from '../lib/supabase/digests.mjs';
import { applyDigestAction } from '../lib/digests/actions.mjs';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}
function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
async function clientOr503(res) {
  try {
    return await getServiceClient();
  } catch (err) {
    sendJson(res, 503, { error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return null;
  }
}

export function createDigestMiddleware() {
  return {
    // GET /api/digest
    list: async (req, res, next) => {
      if (req.method !== 'GET') return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        const includeDismissed = url.searchParams.get('include_dismissed') !== '0';
        const rawLimit = Number(url.searchParams.get('limit'));
        const limit = Number.isFinite(rawLimit)
          ? Math.max(1, Math.min(Math.floor(rawLimit), MAX_LIMIT))
          : DEFAULT_LIMIT;

        const sb = await clientOr503(res);
        if (!sb) return;

        const { data, error } = await listDigestItems(sb, { limit, includeDismissed });
        if (error) return sendJson(res, 500, { error: error.message });
        return sendJson(res, 200, { items: data ?? [] });
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },

    // POST /api/digest-action
    action: async (req, res, next) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJson(req);
        const key = typeof body.key === 'string' ? body.key.trim() : '';
        const action = typeof body.action === 'string' ? body.action.trim() : '';
        if (!key || !action) return sendJson(res, 400, { error: 'key and action are required' });

        const sb = await clientOr503(res);
        if (!sb) return;

        const result = await applyDigestAction(sb, { key, action });
        return sendJson(res, result.status, result.body);
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },
  };
}
