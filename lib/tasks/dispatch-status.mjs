/**
 * lib/tasks/dispatch-status.mjs — closes the loop issue #50 describes: a
 * dispatched task's `dispatch_status` (migration 0008) sits at 'dispatched'
 * forever unless something reads the linked GitHub issue back. This resolves
 * live status from the PR linked to `dispatch_url` (via
 * lib/github/issues.mjs::getLinkedPullRequest) and patches the row.
 *
 * Smallest version: collapses onto the existing 5-value dispatch_status enum
 * instead of adding new states —
 *   dispatched (no PR yet) → running (PR open) → done (merged) / failed (closed unmerged)
 * `done` also flips the task's own `status` to 'done' (mirrors #44's
 * auto-record-on-deploy pattern: read an external source of truth, write it
 * back once, don't hold it open as a separate concept).
 *
 * TTL-cached + fail-soft, same shape as lib/projects/index.mjs's
 * attachRepoStatuses — GET /api/tasks calls this on every poll (client polls
 * every 8s), so a per-issue cache keeps a warm lambda from hammering GitHub's
 * rate limit.
 */

const DISPATCH_STATUS_TTL_MS = 60_000;
/** @type {Map<string, { at: number, value: import('../github/issues.mjs').LinkedPullRequest | null }>} */
const linkedPrCache = new Map();

/**
 * Terminal dispatch statuses — a live re-check is skipped once here. Everything
 * else (including null/undefined, for dispatch_url rows dispatched before
 * migration 0008 stamped dispatch_status) is treated as "still worth checking".
 */
const TERMINAL_DISPATCH_STATUSES = new Set(['done', 'failed']);

/**
 * Pure: map a resolved linked-PR (or null) to the row patch that reflects it.
 * @param {import('../github/issues.mjs').LinkedPullRequest | null} linkedPr
 * @param {string} [now]
 * @returns {{ dispatch_status: string, pr_url: string, status?: 'done', completed_at?: string } | null} null = no change yet
 */
export function deriveDispatchPatch(linkedPr, now = new Date().toISOString()) {
  if (!linkedPr) return null;
  if (linkedPr.merged) {
    return { dispatch_status: 'done', status: 'done', pr_url: linkedPr.url, completed_at: now };
  }
  if (linkedPr.state === 'closed') {
    return { dispatch_status: 'failed', pr_url: linkedPr.url };
  }
  return { dispatch_status: 'running', pr_url: linkedPr.url };
}

/**
 * Resolves + applies live dispatch status to every eligible task IN PLACE
 * (so the caller's already-fetched list reflects it in the same response),
 * and best-effort persists the patch so it sticks without re-deriving next
 * poll. Never throws — a GitHub failure for one task just leaves it as-is.
 * @param {object[]} tasks
 * @param {{ github: import('../github/issues.mjs').GitHubIssuePort | null, updateTask?: Function, sb?: object }} deps
 */
export async function resolveLiveDispatchStatuses(tasks, { github, updateTask, sb } = {}) {
  if (!github) return tasks;
  const eligible = tasks.filter(
    (t) => t.dispatch_url && t.status !== 'done' && !TERMINAL_DISPATCH_STATUSES.has(t.dispatch_status),
  );
  await Promise.allSettled(eligible.map((t) => resolveOne(t, { github, updateTask, sb })));
  return tasks;
}

async function resolveOne(task, { github, updateTask, sb }) {
  let linkedPr;
  const cached = linkedPrCache.get(task.dispatch_url);
  if (cached && Date.now() - cached.at < DISPATCH_STATUS_TTL_MS) {
    linkedPr = cached.value;
  } else {
    try {
      linkedPr = await github.getLinkedPullRequest({ issueUrl: task.dispatch_url });
    } catch {
      return; // fail-soft: leave the task's existing status alone
    }
    linkedPrCache.set(task.dispatch_url, { at: Date.now(), value: linkedPr });
  }

  const patch = deriveDispatchPatch(linkedPr);
  if (!patch) return;
  Object.assign(task, patch);
  if (updateTask && sb) {
    try {
      await updateTask(sb, task.key, patch);
    } catch {
      /* best-effort persistence — the in-place patch above still renders this poll */
    }
  }
}
