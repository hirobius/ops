/**
 * lib/tasks/import-issues.mjs — GitHub issues → tasks-table rows.
 *
 * Slice 1 of the task-importer foundation (#8/#13). Pure mapper: takes the
 * array shape returned by `makeGitHubPort().listOpenIssues()`
 * (lib/github/issues.mjs) and produces rows ready for `upsertTasks`
 * (lib/supabase/tasks.mjs). No network, no DB — unit-testable as plain
 * data-in/data-out.
 *
 * Row shape (migration 0003_tasks.sql):
 *   key          'github:<owner>/<repo>#<number>'  — the namespaced upsert key
 *   source       'github:<owner>/<repo>'            — collision-free namespace
 *   native_key   String(number)
 *   title        issue.title
 *   status       'open'   — listOpenIssues() only ever returns open issues
 *   lane         '<repo name>' (without the owner) — satisfies the NOT NULL lane column
 *   group        'Internal' — GitHub issues are ops-internal work, not client/lead pipeline
 *   dispatch_url issue.url  — the issue already IS the dispatch target
 *   tags         issue.labels — surfaces `ralph-ready` / `triage` / etc. as board
 *                badges (ops#88) and re-syncs on every re-import, same as title/status
 */

/**
 * @param {Array<{ repo: string, number: number, title: string, url: string, labels?: string[] }>} issues
 *   The shape returned by GitHubIssuePort#listOpenIssues (lib/github/issues.mjs).
 * @returns {object[]} rows shaped for upsertTasks(sb, rows)
 */
export function mapIssuesToTasks(issues) {
  if (!Array.isArray(issues)) return [];
  return issues.map((issue) => {
    const repo = String(issue.repo || '');
    const laneName = repo.includes('/') ? repo.slice(repo.indexOf('/') + 1) : repo;
    return {
      key: `github:${repo}#${issue.number}`,
      source: `github:${repo}`,
      native_key: String(issue.number),
      title: issue.title,
      status: 'open',
      lane: laneName,
      group: 'Internal',
      dispatch_url: issue.url,
      tags: Array.isArray(issue.labels) ? issue.labels : [],
    };
  });
}

/**
 * The importer only ever upserts — rows for issues that closed, or that moved
 * to a new `owner/repo` after a rename/transfer, are never revisited and pile
 * up as stale/duplicate board rows (ops#99). This is the pure decision half of
 * the fix: given the `github:*` keys currently stored and the keys the latest
 * `listOpenIssues()` pull actually produced, return the stored keys that no
 * longer have a live issue behind them — the caller retires those (see
 * `retireGithubTasks` in lib/supabase/tasks.mjs). No network, no DB.
 *
 * Scoped to `github:` keys only, even if a non-github key is passed in, so a
 * caller that accidentally includes tracker/backlog/client keys can't retire
 * pipeline work by mistake.
 *
 * @param {string[]} existingKeys - `key`s of currently-stored `github:*` tasks
 * @param {string[]} liveKeys - `key`s just produced by `mapIssuesToTasks`
 * @returns {string[]} keys to retire
 */
export function reconcileGithubTasks(existingKeys, liveKeys) {
  if (!Array.isArray(existingKeys)) return [];
  const live = new Set(Array.isArray(liveKeys) ? liveKeys : []);
  return existingKeys.filter((key) => key.startsWith('github:') && !live.has(key));
}
