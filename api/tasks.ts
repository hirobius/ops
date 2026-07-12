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
 *
 *        After the upsert, reconciles: any stored `github:*` task whose key
 *        dropped out of the live-open set (issue closed, or repo renamed/
 *        transferred — the old slug never re-imports) is retired to
 *        `status: 'done'` (ops#99). `reconcileGuard` (lib/tasks/
 *        reconcile-github-tasks.mjs) skips the retire step on a suspect live
 *        fetch (empty while stored keys exist, or a would-be mass-retire) —
 *        never mass-retire on one anomalous read. Scoped strictly to
 *        `github:*` keys; other sources are untouched.
 *        Success: { imported: n, retired: n, reconcile: 'ok' | 'skipped:<reason>' }
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
import { orderRalphQueue } from '../lib/tasks/ralph-queue.mjs';
import { parseParkedReason, hasDodMarker } from '../lib/tasks/ralph-parked.mjs';
import { classifyWedged } from '../lib/tasks/ralph-wedge.mjs';
import { reconcileGithubTasks, reconcileGuard } from '../lib/tasks/reconcile-github-tasks.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';

const DEFAULT_LIMIT = 1000;
const MAX_LIMIT = 2000;

/** The repos whose Ralph loops the board's fleet panel watches (ops#112). */
const FLEET_REPOS = ['hirobius/ops', 'hirobius/hds', 'hirobius/site-engine'];

export async function tasksHandler(sb: SupabaseClient, req: VercelRequest): Promise<HandlerResult> {
  if (pick(req.query['ralph']) === '1') return ralphStatusHandler();

  const limit = clampLimit(pick(req.query['limit']));
  const includeDeleted = pick(req.query['include_deleted']) === '1';

  const { data, error } = await listTasks(sb, { limit, includeDeleted });
  if (error) return { status: 500, body: { error: error.message } };
  return { status: 200, body: { tasks: data ?? [] } };
}

/**
 * GET /api/tasks?ralph=1 — the fleet Ralph panel's read (ops#112, extended by
 * #141): recent runs + the selector-ordered queue + the parked inbox
 * (ralph-parked/needs-adrian issues with their latest 🅿️ reason) + open Ralph
 * PRs classified wedged/healthy — all per fleet repo, straight from GitHub
 * (labels ARE the loop's state store; Supabase isn't consulted). Folded in
 * here to stay under the Vercel Hobby function cap. Per-repo GitHub failures
 * surface as `errors` entries (fail-soft per repo, loud per message).
 */
export async function ralphStatusHandler(): Promise<HandlerResult> {
  const gh = makeGitHubPort();
  if (!gh) {
    return {
      status: 503,
      body: {
        error:
          'GITHUB_TOKEN not set — needed for the Ralph fleet panel. Add it in Vercel → ' +
          'Settings → Environment Variables (Production + Preview), then redeploy.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }
  try {
    const [runs, ready, parkedByRepo, prsByRepo] = await Promise.all([
      gh.listRalphRuns({ repos: FLEET_REPOS }),
      gh.listRalphReadyIssues({ repos: FLEET_REPOS }),
      gh.listParkedIssues({ repos: FLEET_REPOS }),
      gh.listOpenRalphPrs({ repos: FLEET_REPOS }),
    ]);
    const queue = orderRalphQueue(ready.flatMap((r) => r.issues));

    const parked = parkedByRepo.flatMap((r) =>
      r.issues.map((i) => {
        const needsAdrian = i.labels.includes('needs-adrian');
        return {
          repo: i.repo,
          number: i.number,
          title: i.title,
          url: i.url,
          key: `github:${i.repo}#${i.number}`,
          reason: parseParkedReason(i.parkedComment),
          needsAdrian,
          needsDod: needsAdrian && !hasDodMarker(i.body),
        };
      }),
    );

    const now = Date.now();
    const prs = prsByRepo.flatMap((r) =>
      r.prs.map((pr) => {
        const { wedged, reason } = classifyWedged(
          { gate: pr.gate, updatedAt: pr.updated_at },
          now,
        );
        return {
          repo: r.repo,
          number: pr.number,
          title: pr.title,
          url: pr.url,
          wedged,
          wedgeReason: reason,
        };
      }),
    );

    const errors = [...runs, ...ready, ...parkedByRepo, ...prsByRepo]
      .filter((e) => e.error)
      .map((e) => ({ repo: e.repo, error: e.error as string }));
    return { status: 200, body: { runs, queue, parked, prs, errors } };
  } catch (err) {
    return { status: 502, body: { error: messageOf(err), code: 'GITHUB_RALPH_STATUS_FAILED' } };
  }
}

export async function importIssuesHandler(
  sb: SupabaseClient,
  _req: VercelRequest,
  deps: { github?: ReturnType<typeof makeGitHubPort> } = {},
): Promise<HandlerResult> {
  const gh = deps.github !== undefined ? deps.github : makeGitHubPort();
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
  const { error: upsertError } = await upsertTasks(sb, rows);
  if (upsertError) return { status: 500, body: { error: upsertError.message } };

  const liveKeys = rows.map((row) => row.key);
  const { data: existingRows, error: listError } = await listGithubTaskKeys(sb);
  if (listError) return { status: 500, body: { error: listError.message } };
  const existingKeys = (existingRows ?? []).map((row: { key: string }) => row.key);

  const guard = reconcileGuard(existingKeys, liveKeys);
  if (!guard.ok) {
    return {
      status: 200,
      body: { imported: rows.length, retired: 0, reconcile: `skipped:${guard.reason}` },
    };
  }

  const keysToRetire = reconcileGithubTasks(existingKeys, liveKeys);
  if (keysToRetire.length) {
    const { error: retireError } = await retireTasks(sb, keysToRetire);
    if (retireError) return { status: 500, body: { error: retireError.message } };
  }

  return {
    status: 200,
    body: { imported: rows.length, retired: keysToRetire.length, reconcile: 'ok' },
  };
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
