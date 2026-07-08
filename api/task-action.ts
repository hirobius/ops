/**
 * Vercel Serverless Function — POST /api/task-action
 *
 * Mutates one task on the /ops/tasks board. The `tasks_audit` trigger logs every
 * change to `task_events`, so this stays a thin row update.
 *
 * Request:  { key: string, action: Action, actor?: string }
 *   Action = 'done' | 'reopen' | 'claim' | 'unclaim' | 'trash' | 'restore' | 'dispatch'
 *          | 'auto_on' | 'auto_off' | 'queue' | 'unqueue'
 *
 * 'auto_on' / 'auto_off' flip `auto_ok` (migration 0008) — the Fleet
 * auto-dispatch opt-in (epic #41). Slice 2's dispatcher only picks up rows
 * with auto_ok=true; this action alone does not dispatch anything.
 *
 * 'queue' / 'unqueue' flip `dispatch_status` to/from 'queued' (epic #41 Slice
 * 3) — the /admin/approvals inbox flag. A queued task is proposed for
 * dispatch but awaiting a human's Approve/Deny click; distinct from auto_ok
 * (which skips approval entirely).
 *
 * 'dispatch' is the agentic-loop hand-off (decided design: no Claude API). It opens
 * a GitHub issue that @mentions Claude — GitHub turns that into a Claude Code
 * session on a branch — and stamps dispatch_url + claimed_by='claude' +
 * dispatch_status='dispatched' (clears 'queued' so an approved task leaves the
 * inbox). Requires GITHUB_TOKEN (repo Issues: write); 503 if unset.
 *
 * In dev, the same contract is served by scripts/tasks-middleware.mjs.
 * Success:  { ok: true, ...extra } · Error: { error, code? } 400/401/404/405/500/503
 *
 * Auth + method + Supabase acquisition are owned by lib/api/handler (ADR-0004);
 * the row-mutation logic lives in lib/tasks/actions.mjs (already returns {status, body}).
 *
 * Env (server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   GITHUB_TOKEN (+ optional GITHUB_REPO, default 'hirobius/ops') for dispatch.
 */

import type { VercelRequest } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { withOpsHandler, withServiceClient, type HandlerResult } from '../lib/api/handler.js';
import { applyTaskAction } from '../lib/tasks/actions.mjs';
import { makeGitHubPort } from '../lib/github/issues.mjs';

export async function taskActionHandler(
  sb: SupabaseClient,
  req: VercelRequest,
): Promise<HandlerResult> {
  const body = req.body as { key?: unknown; action?: unknown; actor?: unknown } | undefined;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const actor = typeof body?.actor === 'string' ? body.actor.trim() : 'adrian';
  if (!key || !action) return { status: 400, body: { error: 'key and action are required' } };

  return applyTaskAction(sb, { key, action, actor }, { github: makeGitHubPort() });
}

export default withOpsHandler('POST', withServiceClient(taskActionHandler));
