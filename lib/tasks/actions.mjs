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
 * `queue`/`unqueue` (epic #41 Slice 3) flip `dispatch_status` (migration 0008)
 * to/from `'queued'` — the approvals-inbox flag. A queued task is *proposed*
 * for dispatch but awaiting a human click (`/admin/approvals`); it is NOT the
 * same as `auto_ok` (which self-dispatches with no approval step at all).
 * `dispatch` itself stamps `dispatch_status: 'dispatched'` plus
 * `last_dispatched_at`/`dispatch_count` so EVERY dispatch source (the
 * /admin/approvals Approve button, the /ops/tasks manual "Dispatch" button,
 * scripts/fleet-dispatch.mjs) leaves the same watchdog-visible trail — one
 * writer for the whole dispatch-lifecycle field set (ops#139). Callers that
 * also need routing fields (`tier`/`model`, which `dispatch` doesn't own)
 * write those separately.
 *
 * `redispatch`/`flag` (ops#139) are the same seam for
 * `scripts/fleet-watchdog.mjs`'s stale-dispatch sweep: `redispatch` re-kicks
 * a stalled dispatch (bumps `dispatch_count`, restamps `last_dispatched_at`,
 * re-asserts `dispatch_status='dispatched'`, optional best-effort re-ping
 * comment); `flag` blocks a task that exhausted its retries
 * (`dispatch_status='failed'`, `status='blocked'`). Before this, the
 * watchdog wrote these fields directly via `setTaskFields` — a second,
 * divergent mutation path this file was supposed to be the only one of.
 */

import { getTask, updateTask } from '../supabase/tasks.mjs';

/** The label the Ralph loop polls for (`ralph/prompt.md` step 1, ops#88). */
const RALPH_READY_LABEL = 'ralph-ready';

/** The label that arms a Ralph PR's human-approved auto-merge (ralph-gate workflow, ops#137). */
const RALPH_APPROVED_LABEL = 'ralph-approved';

/** The label that pre-approves a Ralph-shipped PR's merge without a human tap (ops#138). */
const RALPH_AUTO_LABEL = 'ralph-auto';

/** The label `park_issue()` applies to a genuinely-exhausted issue (ralph/lib.sh, ops#141). */
const RALPH_PARKED_LABEL = 'ralph-parked';

/** The fleet-repo workflow file the "Run Ralph" board action dispatches (ops#113). */
const RALPH_WORKFLOW_FILE = 'ralph.yml';

/** The mutually-exclusive priority labels `ralph/next.sh` orders the queue by (ops#138). */
const PRIORITY_LABELS = ['p0', 'p1', 'p2', 'p3'];

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
  // Fleet approvals inbox (epic #41, Slice 3). Marks/unmarks a task as
  // proposed-for-dispatch-awaiting-approval — picked up by /admin/approvals.
  queue: () => ({ dispatch_status: 'queued' }),
  unqueue: () => ({ dispatch_status: null }),
  // Stale-dispatch watchdog exhausted-retries outcome (ops#139) — no fetch
  // needed, so this is a plain field flip like its SIMPLE siblings.
  flag: () => ({ dispatch_status: 'failed', status: 'blocked' }),
};

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ key: string, action: string, actor?: string, priority?: string|null,
 *   comment?: boolean, maxRetries?: number }} input
 * @param {{ github?: import('../github/issues.mjs').GitHubIssuePort | null }} [deps]
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function applyTaskAction(
  sb,
  { key, action, actor, priority, comment, maxRetries },
  { github } = {},
) {
  // Simple field updates.
  if (Object.prototype.hasOwnProperty.call(SIMPLE, action)) {
    const patch = SIMPLE[action](actor);
    const { error } = await updateTask(sb, key, patch);
    if (error) return { status: 500, body: { error: error.message } };
    return { status: 200, body: { ok: true, ...patch } };
  }

  if (action === 'dispatch') return dispatch(sb, key, github);
  if (action === 'redispatch') return redispatch(sb, key, github, { comment, maxRetries });
  if (action === 'ralph_ready_on')
    return toggleIssueLabel(sb, key, github, RALPH_READY_LABEL, true);
  if (action === 'ralph_ready_off')
    return toggleIssueLabel(sb, key, github, RALPH_READY_LABEL, false);
  if (action === 'ralph_auto_on') return toggleIssueLabel(sb, key, github, RALPH_AUTO_LABEL, true);
  if (action === 'ralph_auto_off')
    return toggleIssueLabel(sb, key, github, RALPH_AUTO_LABEL, false);
  if (action === 'set_priority') return setPriority(sb, key, priority, github);
  if (action === 'ralph_approve') return approveRalphMerge(sb, key, github);
  if (action === 'ralph_dispatch') return ralphDispatch(sb, key, github);
  if (action === 'ralph_requeue') return ralphRequeue(key, github);

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
 * The one-tap "Run Ralph" board action (ops#113): dispatches the fleet
 * repo's `ralph.yml` workflow_dispatch for this task's issue via the
 * injected port, with `inputs.issue` explicitly set — an explicit issue
 * number overrides ralph.yml's single-flight + priority guard, so this
 * genuinely jumps the queue. Nothing on the row changes (it's a fire, not a
 * write), but — same as every sibling action in this file — it still
 * confirms `key` names a real tracked row before touching GitHub, rather
 * than trusting a client-supplied string to pick which repo's workflow
 * fires.
 *
 * The GITHUB_TOKEN this wraps needs "Actions: write" on the fleet repos —
 * distinct from the "Issues: read/write" scope the rest of this file needs
 * (2026-07-11 scope-pin comment on ops#113) — so a 401/403/404 is reported
 * naming that permission specifically, via `githubPortError`'s `permission`
 * override.
 */
async function ralphDispatch(sb, key, github) {
  if (!github) {
    return {
      status: 503,
      body: {
        error: 'GITHUB_TOKEN not set — needed to dispatch the Ralph workflow.',
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
      body: { error: 'task is not a github-tracked issue — cannot resolve its owner/repo/issue.' },
    };
  }

  try {
    const result = await github.dispatchWorkflow({
      owner: ref.owner,
      repo: ref.repo,
      workflow: RALPH_WORKFLOW_FILE,
      inputs: { issue: ref.number },
    });
    return { status: 200, body: { ok: true, runUrl: result?.runUrl } };
  } catch (err) {
    return githubPortError(err, {
      action: 'workflow dispatch',
      code: 'GITHUB_WORKFLOW_DISPATCH_FAILED',
      permission: 'Actions: write',
    });
  }
}

/**
 * The parked-inbox lane's one-tap "re-queue" (ops#141, extends #112):
 * removes `ralph-parked` and adds `ralph-ready` on the linked GitHub issue —
 * the exact documented un-park gesture (`ralph/lib.sh`'s park_issue()
 * comment: "To retry: fix the cause, then re-add `ralph-ready`."). This
 * resets the attempt budget per ops#121 (`count_failed_attempts` only counts
 * failures newer than the latest `ralph-ready`-labeled event).
 *
 * Parked issues come straight from GitHub (the fleet panel's read, same as
 * the queue lane) — not necessarily a Supabase task row — so this resolves
 * owner/repo/issue from `key` directly instead of going through `getTask`.
 * Idempotent: re-queuing an already-queued issue just re-applies both label
 * writes (`addLabel`/`removeLabel` are themselves idempotent on the port).
 *
 * `needs-adrian` rows are not offered this button by the panel (it shows a
 * DoD hint instead — the intake filter would just re-park a DoD-less body on
 * sight) but this action itself doesn't need to know that; it only ever
 * touches `ralph-parked`/`ralph-ready`.
 *
 * @param {import('../github/issues.mjs').GitHubIssuePort | null | undefined} github
 */
async function ralphRequeue(key, github) {
  if (!github) {
    return {
      status: 503,
      body: {
        error: 'GITHUB_TOKEN not set — needed to update the issue label.',
        code: 'ENV_MISSING_GITHUB_TOKEN',
      },
    };
  }

  const ref = parseGithubTaskKey(key);
  if (!ref) {
    return {
      status: 400,
      body: { error: 'key must be a github:<owner>/<repo>#<n> issue reference.' },
    };
  }

  const issueUrl = `https://github.com/${ref.owner}/${ref.repo}/issues/${ref.number}`;

  try {
    await github.removeLabel({ issueUrl, label: RALPH_PARKED_LABEL });
    await github.addLabel({ issueUrl, label: RALPH_READY_LABEL });
  } catch (err) {
    return githubPortError(err, { action: 'label update', code: 'GITHUB_LABEL_FAILED' });
  }

  return { status: 200, body: { ok: true } };
}

/**
 * The GitHub issue URL to act on for a task: `dispatch_url` (set once Ralph
 * dispatches) wins, falling back to `source_url` (the import-time provenance
 * link, ops#105) so a row imported-but-never-dispatched is still toggleable —
 * the gate `setRalphReady` used to apply only to `dispatch_url`, which 400'd
 * every source_url-only row (ops#138).
 */
function resolveIssueUrl(task) {
  if (typeof task.dispatch_url === 'string' && task.dispatch_url) return task.dispatch_url;
  if (typeof task.source_url === 'string' && task.source_url) return task.source_url;
  return '';
}

/**
 * The one-tap label toggle shared by every board-driven label action (ops#88's
 * "Ralph-ready", ops#138's "Auto-merge"): adds/removes `label` on the task's
 * linked GitHub issue via the injected port, then mirrors the change into the
 * row's `tags` so the board badge updates without a full re-import. Only
 * issue-backed tasks (`resolveIssueUrl`) qualify.
 *
 * @param {import('../github/issues.mjs').GitHubIssuePort | null | undefined} github
 */
async function toggleIssueLabel(sb, key, github, label, on) {
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

  const issueUrl = resolveIssueUrl(task);
  if (!issueUrl) {
    return {
      status: 400,
      body: { error: 'task has no linked GitHub issue — dispatch it first.' },
    };
  }

  try {
    if (on) await github.addLabel({ issueUrl, label });
    else await github.removeLabel({ issueUrl, label });
  } catch (err) {
    return githubPortError(err, { action: 'label update', code: 'GITHUB_LABEL_FAILED' });
  }

  const tags = Array.isArray(task.tags) ? task.tags : [];
  const nextTags = on
    ? tags.includes(label)
      ? tags
      : [...tags, label]
    : tags.filter((t) => t !== label);

  const { error: updateError } = await updateTask(sb, key, { tags: nextTags });
  if (updateError) return { status: 500, body: { error: updateError.message } };

  return { status: 200, body: { ok: true, tags: nextTags } };
}

/**
 * The p0–p3 priority chip selector (ops#138): the labels are mutually
 * exclusive, so this removes whichever `p0`–`p3` label the issue currently
 * carries (if any, and if different from the target) before adding the new
 * one — `removeLabel`'s 404-tolerant behavior makes this idempotent.
 * `priority: null` clears the priority entirely (removes without adding).
 * Mirrors the result into the row's `tags`, same shape as `toggleIssueLabel`.
 *
 * @param {import('../github/issues.mjs').GitHubIssuePort | null | undefined} github
 */
async function setPriority(sb, key, priority, github) {
  if (priority !== null && !PRIORITY_LABELS.includes(priority)) {
    return {
      status: 400,
      body: { error: `priority must be one of ${PRIORITY_LABELS.join(', ')}, or null` },
    };
  }

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

  const issueUrl = resolveIssueUrl(task);
  if (!issueUrl) {
    return {
      status: 400,
      body: { error: 'task has no linked GitHub issue — dispatch it first.' },
    };
  }

  const tags = Array.isArray(task.tags) ? task.tags : [];
  const existing = tags.filter((t) => PRIORITY_LABELS.includes(t));

  try {
    for (const label of existing) {
      if (label !== priority) await github.removeLabel({ issueUrl, label });
    }
    if (priority && !existing.includes(priority)) {
      await github.addLabel({ issueUrl, label: priority });
    }
  } catch (err) {
    return githubPortError(err, { action: 'label update', code: 'GITHUB_LABEL_FAILED' });
  }

  const nextTags = tags.filter((t) => !PRIORITY_LABELS.includes(t));
  if (priority) nextTags.push(priority);

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
    last_dispatched_at: new Date().toISOString(),
    dispatch_count: nextDispatchCount(task),
  });
  if (updateError) return { status: 500, body: { error: updateError.message } };

  return { status: 200, body: { ok: true, dispatch_url: dispatchUrl } };
}

/** `task.dispatch_count`, bumped by one — treats a missing/non-finite count as 0. */
function nextDispatchCount(task) {
  return (Number.isFinite(task.dispatch_count) ? task.dispatch_count : 0) + 1;
}

/**
 * Re-kicks one stalled dispatch (`scripts/fleet-watchdog.mjs`, ops#139):
 * bumps `dispatch_count`, restamps `last_dispatched_at`, re-asserts
 * `dispatch_status='dispatched'`. `comment` optionally leaves a fresh
 * `@claude` re-ping on the task's linked issue — best-effort, since the
 * fields are already re-dispatched a failed/skipped comment doesn't fail
 * the action (mirrors the watchdog's pre-refactor behavior).
 */
async function redispatch(sb, key, github, { comment, maxRetries } = {}) {
  const { data: task, error: fetchError } = await getTask(sb, key);
  if (fetchError || !task) return { status: 404, body: { error: 'task not found' } };

  const nextCount = nextDispatchCount(task);
  const { error: updateError } = await updateTask(sb, key, {
    dispatch_count: nextCount,
    last_dispatched_at: new Date().toISOString(),
    dispatch_status: 'dispatched',
  });
  if (updateError) return { status: 500, body: { error: updateError.message } };

  let commented = false;
  if (comment && github && task.dispatch_url) {
    try {
      const retryOf = Number.isFinite(maxRetries) ? `${nextCount}/${maxRetries}` : `#${nextCount}`;
      await github.commentOnIssue({
        issueUrl: task.dispatch_url,
        body:
          `@claude this dispatch went stale (no PR after the staleness window) — ` +
          `re-kicking, retry ${retryOf}.`,
      });
      commented = true;
    } catch {
      // best-effort — fields are already re-dispatched, a comment failure isn't fatal
    }
  }

  return {
    status: 200,
    body: { ok: true, dispatch_count: nextCount, dispatch_url: task.dispatch_url || null, commented },
  };
}

/**
 * Maps a thrown GitHub port error to a 502 with an actionable token hint.
 * `action`/`code` let callers other than `dispatch` (e.g. the ralph-ready
 * label toggle) report a failure that names what actually broke.
 */
function githubPortError(
  err,
  { action = 'dispatch', code = 'GITHUB_DISPATCH_FAILED', permission = 'Issues: write' } = {},
) {
  const detail = messageOf(err);
  // Actionable auth failure: token present but rejected (expired/revoked/wrong
  // scope), or — for endpoints like workflow_dispatch — a 404 GitHub uses to
  // obscure a permission error on a private repo. Name the fix so a stale or
  // under-scoped GITHUB_TOKEN is obvious, not cryptic; `permission` lets a
  // caller whose action needs a different scope (e.g. ralph_dispatch needs
  // "Actions: write", not this file's usual "Issues: write") name the right one.
  if (/\b40[134]\b|bad credentials|requires authentication/i.test(detail)) {
    return {
      status: 502,
      body: {
        error:
          'GitHub rejected the token (401/403/404). GITHUB_TOKEN is expired, revoked, ' +
          `or missing the "${permission}" permission — rotate it at ` +
          'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables ' +
          '(Production), then redeploy.',
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
