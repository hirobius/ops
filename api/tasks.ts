/**
 * Vercel Serverless Function — /api/tasks
 *
 * GET  — read side for the /ops/tasks board. Returns live (non-deleted) tasks
 *        from the consolidated Supabase `tasks` table (migration 0003).
 *        Query: ?limit=<n> (default 1000, max 2000) · ?include_done=1 · ?include_deleted=1
 *        Success: { tasks: Task[] }
 *
 * POST — the task importer (Slice 1, #8/#13): pulls every open GitHub issue
 *        the server's GITHUB_TOKEN can see across ALL fleet repos
 *        (lib/github/issues.mjs) and upserts each as a task row, keyed
 *        `github:<owner>/<repo>#<number>` so re-running is idempotent. This is
 *        the single issues+tasks board — the standalone /ops/issues surface was
 *        retired into /ops/tasks (#52, 2026-07-09).
 *        Reconcile (#99): after the upsert, any stored `github:*` task whose
 *        key isn't in the live-open set (closed issue, or renamed/transferred
 *        repo re-imported under a new owner/repo) is soft-deleted, so the
 *        board's repo chips and counts reflect reality instead of
 *        accumulating forever. Scoped to `github:*` — never touches
 *        client/lead-pipeline tasks from other sources.
 *        Success: { imported: n, retired: n }
 *
 * Both methods are service-role + ops-gated, so no Supabase/GitHub credential
 * reaches the browser. In dev, GET is also served by scripts/tasks-middleware.mjs.
 *
 * One function, two methods — folded together to stay under the Vercel Hobby
 * plan's 12-function cap (11/12 used; see docs/ai/HANDOFF.md). `withOpsHandler`
 * only guards a single method, so this composes TWO fully-wrapped handlers
 * (one per method, each still going through the ops auth + service-client +
 * 500-backstop prologue) and dispatches between them by `req.method` — no
 * duplication of the auth/backstop logic itself.
 *
 * Error:  { error, code? } with status 401/405/500/502/503
 *
 * Auth + Supabase acquisition are owned by lib/api/handler (ADR-0004).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  withOpsHandler,
  withServiceClient,
  messageOf,
  type HandlerResult,
} from '../lib/api/handler.js';
import { listTasks, upsertTasks, listGithubTaskKeys, retireTasks } from '../lib/supabase/tasks.mjs';
import { mapIssuesToTasks } from '../lib/tasks/import-issues.mjs';
import { reconcileGithubTasks } from '../lib/tasks/reconcile-github-tasks.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;

export async function tasksHandler(sb: SupabaseClient, req: VercelRequest): Promise<HandlerResult> {
  const limit = clampLimit(pick(req.query['limit']));
  const includeDeleted = pick(req.query['include_deleted']) === '1';

  const { data, error } = await listTasks(sb, { limit, includeDeleted });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { tasks: data ?? [] } };
}

export async function importIssuesHandler(
  sb: SupabaseClient,
  _req: VercelRequest,
): Promise<HandlerResult> {
  const gh = makeGitHubPort();
  if (!gh) {
    return {
      status: 503,
      body: {
        error:
          'GITHUB_TOKEN not set — needed to import GitHub issues. Add it in Vercel → ' +
          'Settings → Environment Variables (Production), then redeploy.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }

  let issues;
  try {
    issues = await gh.listOpenIssues();
  } catch (err) {
    return { status: 502, body: { error: messageOf(err), code: 'GITHUB_LIST_FAILED' } };
  }

  const rows = mapIssuesToTasks(issues);
  const { error } = await upsertTasks(sb, rows);
  if (error) return { status: 500, body: { error: error.message } };

  const { data: existing, error: existingError } = await listGithubTaskKeys(sb);
  if (existingError) return { status: 500, body: { error: existingError.message } };

  const staleKeys = reconcileGithubTasks(
    (existing ?? []).map((row: { key: string }) => row.key),
    rows.map((row) => row.key),
  );
  const { error: retireError } = await retireTasks(sb, staleKeys);
  if (retireError) return { status: 500, body: { error: retireError.message } };

  return { status: 200, body: { imported: rows.length, retired: staleKeys.length } };
}

const getHandler = withOpsHandler('GET', withServiceClient(tasksHandler));
const postHandler = withOpsHandler('POST', withServiceClient(importIssuesHandler));

export default function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method === 'POST') return postHandler(req, res);
  return getHandler(req, res);
}

function pick(v: unknown): string | undefined {
  return Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;
}
function clampLimit(raw: string | undefined): number {
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.max(1, Math.min(Math.floor(n), MAX_LIMIT));
}
