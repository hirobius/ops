/**
 * Vercel Serverless Function — POST /api/task-action
 *
 * Mutates one task on the /ops/tasks board. The `tasks_audit` trigger logs every
 * change to `task_events`, so this stays a thin row update.
 *
 * Request:  { key: string, action: Action, actor?: string }
 *   Action = 'done' | 'reopen' | 'claim' | 'unclaim' | 'trash' | 'restore' | 'dispatch'
 *
 * 'dispatch' is the agentic-loop hand-off (decided design: no Claude API). It opens
 * a GitHub issue that @mentions Claude — GitHub turns that into a Claude Code
 * session on a branch — and stamps dispatch_url + claimed_by='claude'. Requires
 * GITHUB_TOKEN (repo Issues: write); 503 if unset.
 *
 * In dev, the same contract is served by scripts/tasks-middleware.mjs.
 * Success:  { ok: true, ...extra } · Error: { error, code? } 400/404/405/500/503
 *
 * Env (server-only): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *   GITHUB_TOKEN (+ optional GITHUB_REPO, default 'hirobius/ops') for dispatch.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getServiceClient } from '../lib/supabase/server.mjs';
import { applyTaskAction } from '../lib/tasks/actions.mjs';

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const body = req.body as { key?: unknown; action?: unknown; actor?: unknown } | undefined;
  const key = typeof body?.key === 'string' ? body.key.trim() : '';
  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const actor = typeof body?.actor === 'string' ? body.actor.trim() : 'adrian';
  if (!key || !action) {
    res.status(400).json({ error: 'key and action are required' });
    return;
  }

  let sb;
  try {
    sb = await getServiceClient();
  } catch (err) {
    res.status(503).json({ error: messageOf(err), code: 'ENV_MISSING_SUPABASE' });
    return;
  }

  const result = await applyTaskAction(sb, { key, action, actor });
  res.status(result.status).json(result.body);
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
