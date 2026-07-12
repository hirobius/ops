/**
 * lib/tasks/dispatch-status — the live dispatch-status poller (ops#107).
 *
 * Once a task is `dispatch_status='dispatched'` (an @claude issue is open, see
 * lib/tasks/actions.mjs::dispatch), nothing today advances it as the linked PR
 * progresses — an operator has to click through to GitHub to see whether it's
 * still running or already shipped. This resolves the live state via the
 * GitHub port's `getLinkedPullRequest` (issue timeline cross-references, the
 * same signal GitHub's "Development" sidebar uses) and drives the lifecycle:
 *
 *   dispatched → running (PR open) → done (merged — also flips the task's own
 *   `status` + stamps `completed_at`) / failed (closed unmerged)
 *
 * `resolveLiveDispatchStatuses` is TTL-cached (module-scope Map, same pattern
 * as lib/projects/index.mjs::attachRepoStatuses) so GET /api/tasks's ~8s poll
 * doesn't hammer the GitHub API on every request, and fail-soft: a GitHub
 * lookup error or a failed write leaves the task's stored state untouched
 * (or, for a write failure, still reflects the live state in THIS response —
 * the next poll retries the write) rather than throwing.
 */

/** Only these dispatch states are worth polling — terminal states (done/failed) and
 * pre-dispatch states (queued/null) have no PR lifecycle left to advance. */
const LIVE_DISPATCH_STATES = new Set(['dispatched', 'running']);

const PR_CACHE_TTL_MS = 60_000;
/** @type {Map<string, { at: number, prs: Array<{ number: number, url: string, state: string, merged: boolean, created_at: string }> }>} */
let prCache = new Map();

/** Test-only: clears the module-scope PR-lookup cache. */
export function resetDispatchStatusCache() {
  prCache = new Map();
}

/** Parses a `github:<owner>/<repo>#<n>` task key into its parts, or null. */
function parseGithubTaskKey(key) {
  const m = /^github:([^/]+)\/([^#]+)#(\d+)$/.exec(key || '');
  if (!m) return null;
  return { owner: m[1], repo: m[2], number: m[3] };
}

/**
 * Resolves the one PR to act on when a task's issue has more than one
 * cross-referenced PR (e.g. a re-dispatch after a closed PR): the most
 * recently referenced. Null when there are none.
 * @param {Array<{ created_at: string }>} prs
 */
export function pickLatestLinkedPr(prs) {
  if (!Array.isArray(prs) || prs.length === 0) return null;
  return [...prs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];
}

/**
 * The Supabase patch a task needs given its currently-linked PR, or null if
 * the task already reflects that PR's state (idempotent — safe to call every
 * poll). Pure — `now` is caller-supplied, no Date.now() inside.
 * @param {{ dispatch_status?: string|null, status?: string|null, completed_at?: string|null, pr_url?: string|null }} task
 * @param {{ url: string, state: 'open'|'closed', merged: boolean }|null} pr
 * @param {{ now: number }} opts
 */
export function deriveDispatchPatch(task, pr, { now } = {}) {
  if (!Number.isFinite(now)) throw new Error('deriveDispatchPatch requires a numeric `now`');
  if (!pr) return null; // no linked PR yet — stays dispatched, nothing to write

  if (pr.merged) {
    if (task.dispatch_status === 'done' && task.status === 'done' && task.pr_url === pr.url) {
      return null;
    }
    return {
      dispatch_status: 'done',
      status: 'done',
      completed_at: task.completed_at || new Date(now).toISOString(),
      pr_url: pr.url,
    };
  }

  if (pr.state === 'closed') {
    if (task.dispatch_status === 'failed' && task.pr_url === pr.url) return null;
    return { dispatch_status: 'failed', pr_url: pr.url };
  }

  if (task.dispatch_status === 'running' && task.pr_url === pr.url) return null;
  return { dispatch_status: 'running', pr_url: pr.url };
}

/**
 * Resolves live dispatch status for every github:*-keyed, currently
 * dispatched/running task in `tasks`, against the injected GitHub port.
 * Returns a new array — tasks needing no change pass through by reference,
 * tasks with a resolved patch come back merged with it. Writes each patch via
 * `writePatch` (if given) so it persists past this one response; both a
 * GitHub-lookup failure and a write failure are fail-soft (per-task, never
 * thrown).
 * @param {Array<object>} tasks
 * @param {{ github: import('../github/issues.mjs').GitHubIssuePort | null | undefined, now: number, writePatch?: (key: string, patch: object) => Promise<unknown> }} opts
 */
export async function resolveLiveDispatchStatuses(tasks, { github, now, writePatch } = {}) {
  if (!Array.isArray(tasks)) return tasks ?? [];
  if (!github) return tasks;
  if (!Number.isFinite(now)) {
    throw new Error('resolveLiveDispatchStatuses requires a numeric `now`');
  }

  return Promise.all(
    tasks.map(async (task) => {
      if (!LIVE_DISPATCH_STATES.has(task.dispatch_status)) return task;
      const ref = parseGithubTaskKey(task.key);
      if (!ref) return task;

      const cacheKey = `${ref.owner}/${ref.repo}#${ref.number}`;
      let prs;
      const cached = prCache.get(cacheKey);
      if (cached && now - cached.at < PR_CACHE_TTL_MS) {
        prs = cached.prs;
      } else {
        try {
          prs = await github.getLinkedPullRequest({
            owner: ref.owner,
            repo: ref.repo,
            issueNumber: ref.number,
          });
          prCache.set(cacheKey, { at: now, prs });
        } catch {
          return task; // fail-soft: leave the task as-is on a lookup error
        }
      }

      const pr = pickLatestLinkedPr(prs);
      const patch = deriveDispatchPatch(task, pr, { now });
      if (!patch) return task;

      if (writePatch) {
        try {
          await writePatch(task.key, patch);
        } catch {
          // fail-soft: still reflect the live state in this response even
          // when the write fails — the next poll retries it.
        }
      }

      return { ...task, ...patch };
    }),
  );
}
