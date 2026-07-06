/**
 * scripts/leads-middleware.mjs — dev-only mirror of the /api/* leads functions.
 *
 * Backs the /ops Leads board under `pnpm dev` (Vite). It reuses the EXACT same
 * logic modules as the production Vercel functions — lib/supabase/leads (the
 * repository) and lib/leads/pipeline (the generate/build/publish state machines) —
 * so dev and prod genuinely can't drift. Previously this file copy-pasted those
 * state machines (and carried the same stranded-status bug); now it delegates.
 * Wired in vite.config.mjs with `apply: 'serve'` so it never ships to prod.
 *
 * Endpoints (match api/pull-leads.ts, api/lead-action.ts, api/leads.ts):
 *   POST /api/pull-leads     { niche, metro, count? }        → { inserted }
 *   POST /api/lead-action    { leadId, action, previewUrl? } → per-action result
 *     action 'generate' → { ok, score, pass }
 *     action 'build'    → { ok, preview_url }
 *     action 'publish'  → { ok, live_url }
 *     action 'render'   → { ok, rendered, slug, preset, configFile, commands }
 *   GET  /api/leads          ?limit=<n>                      → { leads }
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in process.env (vite.config
 * copies them from .env.local). Missing env → 503 with a clear message.
 */

import { getServiceClient } from '../lib/supabase/server.mjs';
import { listLeads, upsertLeads } from '../lib/supabase/leads.mjs';
import {
  generateLeadSite,
  buildLeadSite,
  publishLeadSite,
  renderLeadSite,
} from '../lib/leads/pipeline.mjs';
import { pullLeads } from '../lib/lead-gen/index.mjs';

const LEAD_ACTIONS = ['generate', 'build', 'publish', 'render'];

const MAX_COUNT = 50;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(obj));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString() || '{}';
  return JSON.parse(raw);
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}

/** Resolve a service client or send a 503 and return null. */
async function clientOr503(res) {
  try {
    return await getServiceClient();
  } catch (err) {
    sendJson(res, 503, { error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return null;
  }
}

export function createLeadsMiddleware() {
  return {
    // POST /api/pull-leads
    pull: async (req, res, next) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJson(req);
        const niche = typeof body.niche === 'string' ? body.niche.trim() : '';
        const metro = typeof body.metro === 'string' ? body.metro.trim() : '';
        const count = Math.max(1, Math.min(Math.floor(Number(body.count) || 20), MAX_COUNT));
        if (!niche || !metro) return sendJson(res, 400, { error: 'niche and metro are required' });

        const sb = await clientOr503(res);
        if (!sb) return;

        const leads = await pullLeads({ niche, metro, max: count });
        const rows = leads.map((l) => ({ ...l, status: 'sourced' }));
        const { error } = await upsertLeads(sb, rows);
        if (error) return sendJson(res, 500, { error: error.message });
        return sendJson(res, 200, { inserted: rows.length });
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },

    // POST /api/lead-action — dispatch on { action } (mirrors api/lead-action.ts)
    action: async (req, res, next) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJson(req);
        const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
        if (!leadId) return sendJson(res, 400, { error: 'leadId is required' });

        const action = typeof body.action === 'string' ? body.action : '';
        if (!LEAD_ACTIONS.includes(action)) {
          return sendJson(res, 400, {
            error: `action must be one of: ${LEAD_ACTIONS.join(', ')}`,
          });
        }

        const sb = await clientOr503(res);
        if (!sb) return;

        let result;
        if (action === 'generate') {
          result = await generateLeadSite(sb, leadId);
        } else if (action === 'build') {
          result = await buildLeadSite(sb, leadId);
        } else if (action === 'publish') {
          result = await publishLeadSite(sb, leadId);
        } else {
          const previewUrl = typeof body.previewUrl === 'string' ? body.previewUrl.trim() : '';
          if (previewUrl && !/^https?:\/\//.test(previewUrl)) {
            return sendJson(res, 400, { error: 'previewUrl must be an http(s) URL' });
          }
          result = await renderLeadSite(sb, leadId, previewUrl ? { previewUrl } : {});
        }
        return sendJson(res, result.status, result.body);
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },

    // GET /api/leads
    list: async (req, res, next) => {
      if (req.method !== 'GET') return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        const rawLimit = url.searchParams.get('limit');
        const parsed = rawLimit ? Number(rawLimit) : NaN;
        const limit = Number.isFinite(parsed)
          ? Math.max(1, Math.min(Math.floor(parsed), MAX_LIMIT))
          : DEFAULT_LIMIT;

        const sb = await clientOr503(res);
        if (!sb) return;

        const { data, error } = await listLeads(sb, limit);
        if (error) return sendJson(res, 500, { error: error.message });
        return sendJson(res, 200, { leads: data ?? [] });
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },

  };
}
