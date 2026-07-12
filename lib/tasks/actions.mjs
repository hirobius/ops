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
 *
 * The `/admin/approvals` inbox + its `queue`/`unqueue` actions were retired
 * 2026-07-12 (ops#157) — merge governance now lives in ralph-gate's
 * `ralph-auto`/`ralph-approved` labels (see `ralph_approve` below), not a
 * separate human Approve/Deny click. `dispatch` stamps
 * `dispatch_status: 'dispatched'` regardless of caller (the /ops/tasks
 * manual "Dispatch" button or scripts/fleet-dispatch.mjs, which already
 * stamps 'dispatched' itself via setTaskFields before calling this).
 */

import { getTask, updateTask } from '../supabase/tasks.mjs';

/** The label the Ralph loop polls for (`ralph/prompt.md` step 1, ops#88). */
const RALPH_READY_LABEL = 'ralph-ready';

/** The label that arms a Ralph PR's human-approved auto-merge (ralph-gate workflow, ops#137). */
const RALPH_APPROVED_LABEL = 'ralph-approved';

const SIMPLE = {
  done: () => ({ status: 'done' }),
  reopen: () => ({ status: 'open' }),
  claim: (actor) => ({ claimed_by: actor || 'adrian', claimed_at: new Date().toISOString() }),
  unclaim: () => ({ claimed_by: null, claimed_at: null }),
  trash: () => ({ deleted_at: new Date().toISOString() }),
  restore: () => ({ deleted_at: null }),
  // Fleet auto-dispatch opt-in/out (epic #41, Slice 1). Flips `auto_ok`
  // (migration 0008) — Slice 2's dispatcher only picks up auto_ok=true rows.
  // The /ops/tasks toggle was retired (ops#157, never wired to a live
  // schedule) but scripts/fleet-dispatch.mjs still reads `auto_ok`, so this
  // action stays for any script/future caller.
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
  if (action === 'ralph_ready_on') return setRalphReady(sb, key, true, github);
  if (action === 'ralph_ready_off') return setRalphReady(sb, key, false, github);
  if (action === 'ralph_approve') return approveRalphMerge(sb, key, github);

  return { status: 400, body: { error: `unknown action: ${action}` } };
}

/** Parses a `github:<owner>/<repo>#<n>` task key into its parts, or null. */
function parseGithubTaskKey(key) {
  const m = /^github:([^/]+)\/([^#]+)#(\d+)$/.exec(key || '');
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

/**
 * The board-only "Approve merge" action (ops#137, board-only lifecycle
 * candidate 6): labels the linked `ralph/issue-<n>-*` PR `ralph-approved`,
 * which arms the ralph-gate workflow's human-approved auto-merge — the
 * approval step no longer requires a trip to the GitHub tab. Only
 * github:*-keyed tasks qualify — the key is where `owner/repo/#n` comes from
 * to resolve the PR via `findRalphPr`.
 *
 * A PR that's already merged or closed is reported back as a graceful no-op
 * (not an error) — the approval intent is moot, not failed.
 */
async function approveRalphMerge(sb, key, github) {
  if (!github) {
    return {
      status: 503,
      body: {
        error: 'GITHUB_TOKEN not set — needed to label the Ralph PR.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }

  const { data: task, error: fetchError } = await getTask(sb, key);
  if (fetchError || !task) return { status: 404, body: { error: 'task not found' } };

  const ref = parseGithubTaskKey(task.key);
  if (!ref) {
    return {
      status: 400,
      body: { error: 'task is not a github-tracked issue — cannot resolve its Ralph PR.' },
    };
  }

  let pr;
  try {
    pr = await github.findRalphPr({ owner: ref.owner, repo: ref.repo, issueNumber: ref.number });
  } catch (err) {
    return githubPortError(err, { action: 'PR lookup', code: 'GITHUB_PR_LOOKUP_FAILED' });
  }

  if (!pr) {
    return {
      status: 404,
      body: { error: `no PR found for branch prefix ralph/issue-${ref.number}-` },
    };
  }

  if (pr.merged) return { status: 200, body: { ok: true, note: 'already merged', prUrl: pr.url } };
  if (pr.state === 'closed')
    return { status: 200, body: { ok: true, note: 'closed', prUrl: pr.url } };

  try {
    await github.addLabel({ issueUrl: pr.url, label: RALPH_APPROVED_LABEL });
  } catch (err) {
    return githubPortError(err, { action: 'label update', code: 'GITHUB_LABEL_FAILED' });
  }

  return { status: 200, body: { ok: true, prUrl: pr.url } };
}

/**
 * The one-tap "Ralph-ready" governor (ops#88): adds/removes the `ralph-ready`
 * label on the task's linked GitHub issue via the injected port, then mirrors
 * the change into the row's `tags` so the board badge updates without a full
 * re-import. Only issue-backed tasks (a real `dispatch_url`) qualify — a task
 * dispatch hasn't been opened for yet has nothing to tag.
 *
 * @param {import('../github/issues.mjs').GitHubIssuePort | null | undefined} github
 */
async function setRalphReady(sb, key, on, github) {
  if (!github) {
    return {
      status: 503,
      body: {
        error: 'GITHUB_TOKEN not set — needed to update the issue label.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }

  const { data: task, error: fetchError } = await getTask(sb, key);
  if (fetchError || !task) return { status: 404, body: { error: 'task not found' } };

  const issueUrl = typeof task.dispatch_url === 'string' ? task.dispatch_url : '';
  if (!issueUrl) {
    return {
      status: 400,
      body: { error: 'task has no linked GitHub issue — dispatch it first.' },
    };
  }

  try {
    if (on) await github.addLabel({ issueUrl, label: RALPH_READY_LABEL });
    else await github.removeLabel({ issueUrl, label: RALPH_READY_LABEL });
  } catch (err) {
    return githubPortError(err, { action: 'label update', code: 'GITHUB_LABEL_FAILED' });
  }

  const tags = Array.isArray(task.tags) ? task.tags : [];
  const nextTags = on
    ? tags.includes(RALPH_READY_LABEL)
      ? tags
      : [...tags, RALPH_READY_LABEL]
    : tags.filter((t) => t !== RALPH_READY_LABEL);

  const { error: updateError } = await updateTask(sb, key, { tags: nextTags });
  if (updateError) return { status: 500, body: { error: updateError.message } };

  return { status: 200, body: { ok: true, tags: nextTags } };
}

/**
 * Hands the task to @claude via the injected port, then stamps the row.
 *
 * Uniform one-click dispatch: a task that already has a linked issue — either
 * previously dispatched (`dispatch_url`) or imported from GitHub with a source
 * issue not yet dispatched (`source_url`, ops#105) — is handed off by
 * COMMENTING `@claude` on that issue (no duplicate opened); a task with
 * neither gets a fresh one CREATED. Either path leaves the row 'dispatched' +
 * claimed, so every task on the board is one click from the fleet regardless of
 * where it came from. (`commentOnIssue` is the same port method the Slice 5
 * stale-dispatch watchdog uses to re-ping a stalled issue.)
 *
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
  const body = [
    `@claude please pick up this task.`,
    ``,
    `**Task:** \`${task.key}\` — ${task.title}`,
    `**Lane:** ${task.lane}${task.phase ? ` · ${task.phase}` : ''}`,
    task.deps?.length ? `**Deps:** ${task.deps.join(', ')}` : '',
    notes.length ? `\n**Notes:**\n${notes.map((n) => `- ${n}`).join('\n')}` : '',
    ``,
    `**How to work this** (engineering skills live in \`.claude/skills/\` — use them, per CLAUDE.md Skill protocol):`,
    `- Epic / multi-part / fuzzy? Run \`/to-tickets\` to split it into dependency-ordered sub-issues first, then ship the smallest slice.`,
    `- Build with \`/implement\` + \`/tdd\` (test-first). Bug? \`/diagnosing-bugs\`.`,
    `- Run \`/code-review\` before opening the PR.`,
    `- Blocked on a human decision? Don't guess or false-close — open a draft PR with the non-blocked work, post the question, and apply \`needs-adrian\`.`,
    ``,
    `Work on a branch and open a PR; do not push to main. (Dispatched from /ops/tasks.)`,
  ]
    .filter(Boolean)
    .join('\n');

  const existingUrl =
    (typeof task.dispatch_url === 'string' && task.dispatch_url) ||
    (typeof task.source_url === 'string' && task.source_url) ||
    '';
  let dispatchUrl;
  try {
    if (existingUrl) {
      await github.commentOnIssue({ issueUrl: existingUrl, body });
      dispatchUrl = existingUrl;
    } else {
      const issue = await github.createIssue({
        title: `[task] ${task.key}: ${task.title}`.slice(0, 250),
        body,
      });
      dispatchUrl = issue.html_url;
    }
  } catch (err) {
    return githubPortError(err);
  }

  const { error: updateError } = await updateTask(sb, key, {
    dispatch_url: dispatchUrl,
    claimed_by: 'claude',
    claimed_at: new Date().toISOString(),
    dispatch_status: 'dispatched',
  });
  if (updateError) return { status: 500, body: { error: updateError.message } };

  return { status: 200, body: { ok: true, dispatch_url: dispatchUrl } };
}

/**
 * Maps a thrown GitHub port error to a 502 with an actionable token hint.
 * `action`/`code` let callers other than `dispatch` (e.g. the ralph-ready
 * label toggle) report a failure that names what actually broke.
 */
function githubPortError(err, { action = 'dispatch', code = 'GITHUB_DISPATCH_FAILED' } = {}) {
  const detail = messageOf(err);
  // Actionable auth failure: token present but rejected (expired/revoked/wrong
  // scope). Name the fix so a stale GITHUB_TOKEN is obvious, not cryptic.
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
    body: { error: `GitHub ${action} failed: ${detail}`, code },
  };
}

function messageOf(err) {
  return err instanceof Error ? err.message : String(err);
}
