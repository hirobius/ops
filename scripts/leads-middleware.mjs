/**
 * scripts/leads-middleware.mjs — dev-only mirror of the /api/* leads functions.
 *
 * Backs the /ops Leads board when running `pnpm dev` (Vite). It reuses the exact
 * same logic modules as the production Vercel functions in api/* — lib/supabase,
 * lib/lead-gen, lib/agent — so dev and prod can never drift. Wired in
 * vite.config.mjs with `apply: 'serve'` so it is NEVER bundled into prod builds.
 *
 * Endpoints (match api/pull-leads.ts, api/generate-site.ts, api/leads.ts):
 *   POST /api/pull-leads     { niche, metro, count? } → { inserted }
 *   POST /api/generate-site  { leadId }               → { ok, score, pass }
 *   GET  /api/leads          ?limit=<n>               → { leads }
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in process.env (vite.config
 * copies them from .env.local). Missing env → 503 with a clear message.
 */

import { getServiceClient } from '../lib/supabase/server.mjs';
import { pullLeads } from '../lib/lead-gen/index.mjs';
import { runPipeline } from '../lib/agent/index.mjs';

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
        const { error } = await sb.from('leads').upsert(rows, { onConflict: 'place_id' });
        if (error) return sendJson(res, 500, { error: error.message });
        return sendJson(res, 200, { inserted: rows.length });
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },

    // POST /api/generate-site
    generate: async (req, res, next) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJson(req);
        const leadId = typeof body.leadId === 'string' ? body.leadId.trim() : '';
        if (!leadId) return sendJson(res, 400, { error: 'leadId is required' });

        const sb = await clientOr503(res);
        if (!sb) return;

        const { data: lead, error: fetchError } = await sb
          .from('leads')
          .select('*')
          .eq('id', leadId)
          .single();
        if (fetchError || !lead) return sendJson(res, 404, { error: 'lead not found' });

        await sb.from('leads').update({ status: 'generating' }).eq('id', leadId);
        try {
          const result = await runPipeline({
            name: lead.name,
            city: lead.city,
            region: lead.region,
            category: lead.category,
            phone: lead.phone,
            website: lead.website,
          });
          const { error: updateError } = await sb
            .from('leads')
            .update({
              status: 'scored',
              config: result.config,
              eval_score: result.judge.overall,
              eval_pass: result.judge.pass,
              eval_notes: result.judge.notes,
              loop_iterations: result.loop.iterations,
            })
            .eq('id', leadId);
          if (updateError) return sendJson(res, 500, { error: updateError.message });
          return sendJson(res, 200, { ok: true, score: result.judge.overall, pass: result.judge.pass });
        } catch (err) {
          await sb.from('leads').update({ status: 'sourced' }).eq('id', leadId);
          return sendJson(res, 500, { error: messageOf(err) });
        }
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

        const { data, error } = await sb
          .from('leads')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (error) return sendJson(res, 500, { error: error.message });
        return sendJson(res, 200, { leads: data ?? [] });
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },
  };
}
