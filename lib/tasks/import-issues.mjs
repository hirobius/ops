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
 *   source_url   issue.url  — where this row was imported from. `dispatch_url` is
 *                deliberately omitted here (not even set to null) so re-importing an
 *                already-dispatched task doesn't clobber it — upsertTasks only touches
 *                the columns present in each row. Stamping the issue's own URL into
 *                dispatch_url at import time (the old behavior) made every imported row
 *                look already-dispatched, so auto-dispatch could never pick it up (ops#105).
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
      source_url: issue.url,
      tags: Array.isArray(issue.labels) ? issue.labels : [],
    };
  });
}
