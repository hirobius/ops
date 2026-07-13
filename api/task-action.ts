/**
 * Vercel Serverless Function — POST /api/task-action
 *
 * Mutates one task on the /ops/tasks board. The `tasks_audit` trigger logs every
 * change to `task_events`, so this stays a thin row update.
 *
 * Request:  { key: string, action: Action, actor?: string, priority?: 'p0'|'p1'|'p2'|'p3'|null }
 *   Action = 'done' | 'reopen' | 'claim' | 'unclaim' | 'trash' | 'restore' | 'dispatch'
 *          | 'auto_on' | 'auto_off'
 *          | 'ralph_ready_on' | 'ralph_ready_off' | 'ralph_approve' | 'ralph_dispatch'
 *          | 'ralph_requeue' | 'ralph_auto_on' | 'ralph_auto_off' | 'set_priority'
 *
 * 'auto_on' / 'auto_off' flip `auto_ok` (migration 0008) — the Fleet
 * auto-dispatch opt-in (epic #41), read by scripts/fleet-dispatch.mjs. No UI
 * surfaces this toggle (ops#157); this action alone does not dispatch anything.
 *
 * 'dispatch' is the agentic-loop hand-off (decided design: no Claude API). It opens
 * a GitHub issue that @mentions Claude — GitHub turns that into a Claude Code
 * session on a branch — and stamps dispatch_url + claimed_by='claude' +
 * dispatch_status='dispatched'. Requires GITHUB_TOKEN (repo Issues: write);
 * 503 if unset.
 *
 * 'ralph_ready_on' / 'ralph_ready_off' (ops#88) add/remove the `ralph-ready`
 * label on the task's linked GitHub issue — the one human-approval tap the
 * Ralph loop polls for (`gh issue list --label ralph-ready`). Only issue-backed
 * tasks (a real dispatch_url) qualify; 400 otherwise. Mirrors the label into
 * the row's `tags` on success so the board badge updates immediately.
 *
 * 'ralph_approve' (ops#137) resolves the task's `github:<owner>/<repo>#<n>`
 * key to its `ralph/issue-<n>-*` PR (via `findRalphPr`) and labels it
 * `ralph-approved`, arming the ralph-gate workflow's human-approved
 * auto-merge from the board. A PR that's already merged/closed responds
 * `{ ok: true, note }` rather than erroring; no matching PR is a 404.
 *
 * 'ralph_dispatch' (ops#113, "Run Ralph") resolves the task's
 * `github:<owner>/<repo>#<n>` key into a workflow_dispatch call on that
 * repo's `ralph.yml` with `inputs.issue = <n>` — nothing on the row changes
 * (it's a fire, not a write), but the task must still exist (404 otherwise,
 * same as every other action here). An explicit issue number overrides
 * ralph.yml's single-flight + priority guard, so this genuinely jumps the
 * queue. Needs GITHUB_TOKEN scoped with "Actions: write" (distinct from the
 * "Issues: write" the rest of this route needs) — 401/403/404 responds 502
 * naming that permission. Returns `{ ok: true, runUrl? }`; runUrl points at the
 * workflow's Actions page (GitHub's dispatch response has no run id to hand
 * back synchronously).
 *
 * 'ralph_requeue' (ops#141, the fleet panel's parked inbox lane) removes
 * `ralph-parked` and adds `ralph-ready` on the task's linked GitHub issue —
 * the documented un-park gesture. Resolves owner/repo/issue straight from
 * `key` (a `github:<owner>/<repo>#<n>` reference) rather than a Supabase
 * task row, since a parked issue surfaced by the panel need not have one.
 * Idempotent; 400 if `key` isn't that shape.
 *
 * 'ralph_auto_on' / 'ralph_auto_off' (ops#138) add/remove the `ralph-auto`
 * label on the task's linked GitHub issue — the pre-approval that arms a
 * Ralph-shipped PR's merge without a human `ralph_approve` tap. Same
 * dispatch_url-or-source_url gate + tags mirror as `ralph_ready_on/off`.
 *
 * 'set_priority' (ops#138) sets the task's linked GitHub issue to carry
 * exactly one of the mutually-exclusive `p0`–`p3` labels — removes any other
 * priority label first, then adds the requested one; `priority: null` clears
 * the priority (removes without adding). Requires `priority` in the body;
 * 400 on a value outside `p0`–`p3`/`null`. Mirrors into the row's `tags`.
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
  const body = req.body as
    | { key?: unknown; action?: unknown; actor?: unknown; priority?: unknown }
    | undefined;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const actor = typeof body?.actor === 'string' ? body.actor.trim() : 'adrian';
  const priority =
    body?.priority === null ? null : typeof body?.priority === 'string' ? body.priority : undefined;
  if (!key || !action) return { status: 400, body: { error: 'key and action are required' } };

  return applyTaskAction(sb, { key, action, actor, priority }, { github: makeGitHubPort() });
}

export default withOpsHandler('POST', withServiceClient(taskActionHandler));
