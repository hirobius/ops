/**
 * lib/tasks/reconcile-github-tasks.mjs — set-diff between stored and live
 * GitHub-issue task keys (ops#99).
 *
 * `mapIssuesToTasks` + `upsertTasks` only ever add/update rows, so a key that
 * stops appearing in the live import — because its issue closed, or its repo
 * was renamed/transferred and re-imports under a new owner/repo — never gets
 * revisited. This pure diff tells the importer which stored `github:*` keys
 * to retire. No network, no DB — data-in/data-out like `mapIssuesToTasks`.
 */

/**
 * @param {string[]} existingKeys - `github:*` task keys currently stored (live, non-deleted)
 * @param {string[]} liveKeys - `github:*` task keys from the current import (currently-open issues)
 * @returns {string[]} keys present in existingKeys but absent from liveKeys — retire these
 */
export function reconcileGithubTasks(existingKeys, liveKeys) {
  const live = new Set(Array.isArray(liveKeys) ? liveKeys : []);
  return (Array.isArray(existingKeys) ? existingKeys : []).filter((key) => !live.has(key));
}
