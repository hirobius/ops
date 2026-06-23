/**
 * Vercel Serverless Function — GET /api/tasks
 *
 * Read side for the /ops/tasks board. Returns live (non-deleted) tasks from the
 * consolidated Supabase `tasks` table (migration 0003), newest-relevant first.
 * Service-role read, so no Supabase key reaches the browser.
 *
 * In dev, the same contract is served by scripts/tasks-middleware.mjs.
 *
 * Query:    ?limit=<n> (default 1000, max 2000) · ?include_done=1 · ?include_deleted=1
 * Success:  { tasks: Task[] }
 * Error:    { error, code? } with status 405/500/503
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { requireOpsAuth } from '../lib/ops-auth.mjs';
import { getServiceClient } from '../lib/supabase/server.mjs';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  // Server-side /ops gate — reject callers without a valid ops session cookie.
  if (!requireOpsAuth(req)) {
    res.status(401).json({ error: 'Unauthorized.', code: 'UNAUTHENTICATED' });
    return;
  }
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed. Use GET.' });
    return;
  }

  const limit = clampLimit(pick(req.query.limit));
  const includeDeleted = pick(req.query.include_deleted) === '1';

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    res.status(503).json({ error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return;
  }

  let q = sb
    .from('tasks')
    .select('*')
    .order('status', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(limit);
  if (!includeDeleted) q = q.is('deleted_at', null);

  const { data, error } = await q;
  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }
  res.status(200).json({ tasks: data ?? [] });
}

function pick(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;
}
function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
