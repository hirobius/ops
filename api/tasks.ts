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
 * Error:    { error, code? } with status 401/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004).
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { listTasks } from '../lib/supabase/tasks.mjs';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;

export async function tasksHandler(sb: SupabaseClient, req: VercelRequest): Promise<HandlerResult> {
  const limit = clampLimit(pick(req.query['limit']));
  const includeDeleted = pick(req.query['include_deleted']) === '1';

  const { data, error } = await listTasks(sb, { limit, includeDeleted });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { tasks: data ?? [] } };
}

export default withOpsHandler('GET', withServiceClient(tasksHandler));

function pick(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;
}
function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}
