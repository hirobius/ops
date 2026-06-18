/**
 * lib/tasks/actions — shared task-action logic for /api/task-action (prod) and
 * scripts/tasks-middleware.mjs (dev). One implementation, no drift.
 *
 * The `tasks_audit` trigger (migration 0003) logs each change to `task_events`,
 * so these are thin row updates — except `dispatch`, which opens a GitHub issue
 * that @mentions Claude (the agentic-loop hand-off; GitHub spins up a Claude Code
 * session — no Claude API call here). Requires GITHUB_TOKEN.
 */

const SIMPLE = {
  done: () => ({ status: 'done' }),
  reopen: () => ({ status: 'open' }),
  claim: (actor) => ({ claimed_by: actor || 'adrian', claimed_at: new Date().toISOString() }),
  unclaim: () => ({ claimed_by: null, claimed_at: null }),
  trash: () => ({ deleted_at: new Date().toISOString() }),
  restore: () => ({ deleted_at: null }),
};

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ key: string, action: string, actor?: string }} input
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function applyTaskAction(sb, { key, action, actor }) {
  // Simple field updates.
  if (Object.prototype.hasOwnProperty.call(SIMPLE, action)) {
    const patch = SIMPLE[action](actor);
    const { error } = await sb.from('tasks').update(patch).eq('key', key);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { ok: true, ...patch } };
  }

  if (action === 'dispatch') return dispatch(sb, key);

  return { status: 400, body: { error: `unknown action: ${action}` } };
}

async function dispatch(sb, key) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return {
      status: 503,
      body: {
        error: 'GITHUB_TOKEN not set — needed to open the dispatch issue.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }
  const repo = process.env.GITHUB_REPO || 'hirobius/ops';

  const { data: task, error: fetchError } = await sb.from('tasks').select('*').eq('key', key).single();
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
  ].filter(Boolean).join('\n');

  let issue;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'hirobius-ops',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title: `[task] ${task.key}: ${task.title}`.slice(0, 250), body: issueBody }),
      signal: AbortSignal.timeout(9000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { status: 502, body: { error: `GitHub issue create failed: HTTP ${res.status}`, detail: text.slice(0, 300) } };
    }
    issue = await res.json();
  } catch (err) {
    return { status: 502, body: { error: `GitHub unreachable: ${err instanceof Error ? err.message : String(err)}` } };
  }

  const { error: updateError } = await sb
    .from('tasks')
    .update({ dispatch_url: issue.html_url, claimed_by: 'claude', claimed_at: new Date().toISOString() })
    .eq('key', key);
  if (updateError) return { status: 500, body: { error: updateError.message } };

  return { status: 200, body: { ok: true, dispatch_url: issue.html_url } };
}
