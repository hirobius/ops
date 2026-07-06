/**
 * Vercel Serverless Function — POST /api/tasks-import
 *
 * One-click seed/refresh of the `tasks` board from BACKLOG.md. Ops-gated. Runs
 * server-side with SUPABASE_SERVICE_ROLE_KEY (never reaches the browser), so the
 * human doesn't hand-run SQL or expose the key. Replaces the retired importer.
 *
 * The rows are precomputed at build time from BACKLOG.md into
 * lib/tasks/backlog.tasks.json (scripts/gen-backlog-tasks.mjs via ensure-ops-data),
 * so the function bundles the data — no runtime filesystem read.
 *
 * Idempotent: upsert on the natural `key` ('backlog:<slug>'), so re-running just
 * refreshes existing rows.
 *
 * Success:  { ok: true, imported: <n> } · Error: { error, code? } 401/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { upsertTasks } from '../lib/supabase/tasks.mjs';
import backlogTasks from '../lib/tasks/backlog.tasks.json';

export async function tasksImportHandler(sb: SupabaseClient): Promise<HandlerResult> {
  const rows = backlogTasks as Array<Record<string, unknown>>;
  if (!rows.length) return { status: 200, body: { ok: true, imported: 0 } };

  const { data, error } = await upsertTasks(sb, rows);
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { ok: true, imported: data?.length ?? rows.length } };
}

export default withOpsHandler('POST', withServiceClient(tasksImportHandler));
