/**
 * lib/tasks/needs-adrian-pager.mjs — detects a task's `needs-adrian` label
 * transition during import (ops#51 slice: pager only — the lane itself is
 * already live on /ops/standing's "Waiting on you" section, fed by
 * lib/tasks/fleet.mjs; that surface predates this issue's DoD and reads
 * live GitHub directly rather than the tasks-table mirror this pager watches).
 *
 * Transition-based, not presence-based, so the importer's existing poll/
 * import pass (api/tasks.ts POST /api/tasks) can page Discord exactly once
 * per task entering the state — the same "compare before to after" de-dup
 * idiom scripts/sync-preview-urls.mjs uses (a null preview_url, not a new
 * timestamp column) instead of adding a `paged_at` column.
 */

const NEEDS_ADRIAN = 'needs-adrian';

function hasTag(tags, tag) {
  return Array.isArray(tags) && tags.includes(tag);
}

/**
 * @param {Array<{key: string, tags?: string[]|null}>} existingRows
 *   Stored `{key, tags}` rows, read BEFORE this import's upsert overwrites them.
 * @param {Array<{key: string, tags?: string[]|null}>} importedRows
 *   This pass's rows (mapIssuesToTasks output) — the "after" state.
 * @returns {Array} the subset of `importedRows` newly carrying `needs-adrian`
 */
export function detectNewlyNeedsAdrian(existingRows, importedRows) {
  const before = new Map((existingRows ?? []).map((row) => [row.key, row.tags]));
  return (importedRows ?? []).filter((row) => {
    if (!hasTag(row.tags, NEEDS_ADRIAN)) return false;
    return !hasTag(before.get(row.key), NEEDS_ADRIAN);
  });
}
