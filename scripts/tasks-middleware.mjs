/**
 * scripts/tasks-middleware.mjs — dev-only mirror of /api/tasks + /api/task-action.
 * Reuses lib/tasks/actions.mjs (same logic as the prod functions). Wired in
 * vite.config.mjs with apply:'serve' so it never ships to prod.
 *
 *   GET  /api/tasks         ?include_deleted=1   → { tasks }
 *   POST /api/task-action   { key, action, actor? } → { ok, ... }
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in process.env (vite.config
 * copies them from .env.local). Dispatch also needs GITHUB_TOKEN.
 */

import { getServiceClient } from '../lib/supabase/server.mjs';
import { listTasks } from '../lib/supabase/tasks.mjs';
import { applyTaskAction } from '../lib/tasks/actions.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';

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

export function createTasksMiddleware() {
  return {
    // GET /api/tasks
    list: async (req, res, next) => {
      if (req.method !== 'GET') return next();
      try {
        const url = new URL(req.url, 'http://localhost');
        const includeDeleted = url.searchParams.get('include_deleted') === '1';
        const rawLimit = Number(url.searchParams.get('limit'));
        const limit = Number.isFinite(rawLimit)
          ? Math.max(1, Math.min(Math.floor(rawLimit), MAX_LIMIT))
          : 1000;

        const sb = await clientOr503(res);
        if (!sb) return;

        const { data, error } = await listTasks(sb, { limit, includeDeleted });
        if (error) return sendJson(res, 500, { error: error.message });
        return sendJson(res, 200, { tasks: data ?? [] });
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },

    // POST /api/task-action
    action: async (req, res, next) => {
      if (req.method !== 'POST') return next();
      try {
        const body = await readJson(req);
        const key = typeof body.key === 'string' ? body.key.trim() : '';
        const action = typeof body.action === 'string' ? body.action.trim() : '';
        const actor = typeof body.actor === 'string' ? body.actor.trim() : 'adrian';
        if (!key || !action) return sendJson(res, 400, { error: 'key and action are required' });

        const sb = await clientOr503(res);
        if (!sb) return;

        const result = await applyTaskAction(sb, { key, action, actor }, { github: makeGitHubPort() });
        return sendJson(res, result.status, result.body);
      } catch (err) {
        return sendJson(res, 500, { error: messageOf(err) });
      }
    },
  };
}
