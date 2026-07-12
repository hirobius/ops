/**
 * lib/tasks/reconcile-github-tasks.mjs — the GitHub-import prune step.
 *
 * `importIssuesHandler` (api/tasks.ts) only ever upserts, so a task row for an
 * issue that's since closed, or whose repo was renamed/transferred (the old
 * `owner/repo` slug re-imports under a new key), never leaves the board (ops#99).
 * These two pure helpers turn "stored `github:*` keys" + "keys from the live
 * open-issues fetch" into a safe retire decision — no network, no DB, plain
 * data-in/data-out like `mapIssuesToTasks` (lib/tasks/import-issues.mjs).
 *
 * `reconcileGithubTasks` alone is NOT safe to act on — a truncated or empty
 * live fetch looks identical to "everything closed". `reconcileGuard` must run
 * first and gate the retire; see api/tasks.ts's importIssuesHandler wiring.
 */

/**
 * Stored `github:*` keys absent from the live open-issues set — closed issues
 * and renamed/transferred-repo strays alike.
 * @param {string[]} existingKeys
 * @param {string[]} liveKeys
 * @returns {string[]}
 */
export function reconcileGithubTasks(existingKeys, liveKeys) {
  const live = new Set(liveKeys ?? []);
  return (existingKeys ?? []).filter((key) => !live.has(key));
}

/** Floor below which a retire batch is never blocked as a "mass retire". */
const MASS_RETIRE_MIN_COUNT = 5;
/** Fraction of stored keys a retire batch must exceed to be blocked. */
const MASS_RETIRE_FRACTION = 0.5;

/**
 * Decides whether it's safe to act on `reconcileGithubTasks`'s diff. Refuses
 * when the live fetch looks empty-while-stored-keys-exist (a degenerate 200,
 * a rate-limit glitch) or when the resulting retire batch would wipe more
 * than half of the stored `github:*` keys — either shape means "the live
 * fetch is suspect", not "everything really closed at once".
 * @param {string[]} existingKeys
 * @param {string[]} liveKeys
 * @returns {{ ok: true } | { ok: false, reason: 'empty-live-set' | 'mass-retire' }}
 */
export function reconcileGuard(existingKeys, liveKeys) {
  const existing = existingKeys ?? [];
  const live = liveKeys ?? [];

  if (existing.length > 0 && live.length === 0) {
    return { ok: false, reason: 'empty-live-set' };
  }

  const toRetire = reconcileGithubTasks(existing, live);
  if (
    toRetire.length >= MASS_RETIRE_MIN_COUNT &&
    toRetire.length > existing.length * MASS_RETIRE_FRACTION
  ) {
    return { ok: false, reason: 'mass-retire' };
  }

  return { ok: true };
}
