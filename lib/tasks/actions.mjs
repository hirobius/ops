/**
 * lib/tasks/actions — shared task-action logic for /api/task-action (prod) and
 * scripts/tasks-middleware.mjs (dev). One implementation, no drift.
 *
 * The `tasks_audit` trigger (migration 0003) logs each change to `task_events`,
 * so these are thin row updates — except `dispatch`, which opens a GitHub issue
 * that @mentions Claude (the agentic-loop hand-off; GitHub spins up a Claude Code
 * session — no Claude API call here). The GitHub call is INJECTED as a port (see
 * lib/github/issues.mjs → makeGitHubPort), so dispatch is testable with a stub —
 * no env, no fetch. (ADR-0004 sibling: ports and adapters.)
 */

import { getTask, updateTask } from '../supabase/tasks.mjs';

const SIMPLE = {
  done: () => ({ status: 'done' }),
  reopen: () => ({ status: 'open' }),
  claim: (actor) => ({ claimed_by: actor || 'adrian', claimed_at: new Date().toISOString() }),
  unclaim: () => ({ claimed_by: null, claimed_at: null }),
  trash: () => ({ deleted_at: new Date().toISOString() }),
  restore: () => ({ deleted_at: null }),
  // Fleet auto-dispatch opt-in/out (epic #41, Slice 1). Flips `auto_ok`
  // (migration 0008) — Slice 2's dispatcher only picks up auto_ok=true rows.
  auto_on: () => ({ auto_ok: true }),
  auto_off: () => ({ auto_ok: false }),
};

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ key: string, action: string, actor?: string }} input
 * @param {{ github?: import('../github/issues.mjs').GitHubIssuePort | null }} [deps]
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function applyTaskAction(sb, { key, action, actor }, { github } = {}) {
  // Simple field updates.
  if (Object.prototype.hasOwnProperty.call(SIMPLE, action)) {
    const patch = SIMPLE[action](actor);
    const { error } = await updateTask(sb, key, patch);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { ok: true, ...patch } };
  }

  if (action === 'dispatch') return dispatch(sb, key, github);

  return { status: 400, body: { error: `unknown action: ${action}` } };
}

/**
 * Opens a GitHub issue for the task via the injected port, then stamps the row.
 * @param {import('../github/issues.mjs').GitHubIssuePort | null | undefined} github
 */
async function dispatch(sb, key, github) {
  if (!github) {
    return {
      status: 503,
      body: {
        error: 'GITHUB_TOKEN not set — needed to open the dispatch issue.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }

  const { data: task, error: fetchError } = await getTask(sb, key);
  if (fetchError || !task) return { status: 404, body: { error: 'task not found' } };

  const notes = Array.isArray(task.notes) ? task.notes : [];
  const issueBody = [
    `@claude please pick up this task.`,
    ``,
    `**Task:** \`${task.key}\` — ${task.title}`,
    `**Lane:** ${task.lane}${task.phase ? ` · ${task.phase}` : ''}`,
    task.deps?.length ? `**Deps:** ${task.deps.join(', ')}` : '',
    notes.length ? `\n**Notes:**\n${notes.map((n) => `- ${n}`).join('\n')}` : '',
    ``,
    `Work on a branch and open a PR; do not push to main. (Dispatched from /ops/tasks.)`,
  ]
    .filter(Boolean)
    .join('\n');

  let issue;
  try {
    issue = await github.createIssue({
      title: `[task] ${task.key}: ${task.title}`.slice(0, 250),
      body: issueBody,
    });
  } catch (err) {
    const detail = messageOf(err);
    // Actionable auth failure: token present but rejected (expired/revoked/
    // wrong scope). Name the fix so a stale GITHUB_TOKEN is obvious, not cryptic.
    if (/\b40[13]\b|bad credentials|requires authentication/i.test(detail)) {
      return {
        status: 502,
        body: {
          error:
            'GitHub rejected the token (401/403). GITHUB_TOKEN is expired, revoked, ' +
            'or missing the "Issues: write" permission — rotate it in Vercel → ' +
            'Settings → Environment Variables (Production), then redeploy.',
          code: 'GITHUB_TOKEN_REJECTED',
          detail,
        },
      };
    }
    return {
      status: 502,
      body: { error: `GitHub issue create failed: ${detail}`, code: 'GITHUB_ISSUE_CREATE_FAILED' },
    };
  }

  const { error: updateError } = await updateTask(sb, key, {
    dispatch_url: issue.html_url,
    claimed_by: 'claude',
    claimed_at: new Date().toISOString(),
  });
  if (updateError) return { status: 500, body: { error: updateError.message } };

  return { status: 200, body: { ok: true, dispatch_url: issue.html_url } };
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
