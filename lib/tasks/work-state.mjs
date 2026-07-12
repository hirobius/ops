/**
 * lib/tasks/work-state — one derived work-state per task (ops#135).
 *
 * A task row carries ~10 status-ish fields (`status`, `derived`, `stage`,
 * `dispatch_status`, `claimed_by`, `tags` carrying ralph-* labels as state,
 * `deleted_at`, `completed_at`...) and every pane read a different subset,
 * so "done" was encoded 2 ways and "dispatched" 3 ways. `deriveWorkState`
 * folds all of it into one phase so every pane agrees on the operator-truth
 * state of a task. Pure, no I/O.
 *
 * Precedence is exact — this table IS the spec (first match wins):
 *   1. status==='done' OR completed_at set      → 'done'
 *   2. tags includes 'needs-adrian'              → 'needs-adrian'
 *   3. tags includes 'ralph-parked'               → 'parked'
 *   4. status==='blocked' OR dispatch_status==='failed' → 'blocked'
 *   5. tags includes 'ralph-wip'                   → 'wip'
 *   6. dispatch_status==='dispatched' OR
 *      (claimed_by==='claude' AND dispatch_url)    → 'dispatched'
 *   7. dispatch_status==='queued'                  → 'queued'
 *   8. tags includes 'ralph-ready'                 → 'ready'
 *   9. else                                        → 'backlog'
 *
 * Soft-deleted rows (`deleted_at` set) never reach the UI — `listTasks`
 * already filters them, so there's no phase for that here.
 */

/**
 * @typedef {'done' | 'needs-adrian' | 'parked' | 'blocked' | 'wip' | 'dispatched' | 'queued' | 'ready' | 'backlog'} WorkState
 * @typedef {{
 *   status?: string | null,
 *   completed_at?: string | null,
 *   tags?: string[] | null,
 *   dispatch_status?: string | null,
 *   claimed_by?: string | null,
 *   dispatch_url?: string | null,
 * }} WorkStateTask
 */

/**
 * @param {WorkStateTask} task
 * @returns {WorkState}
 */
export function deriveWorkState(task) {
  const {
    status = null,
    completed_at = null,
    tags = null,
    dispatch_status = null,
    claimed_by = null,
    dispatch_url = null,
  } = task ?? {};
  const hasTag = (tag) => Array.isArray(tags) && tags.includes(tag);

  if (status === 'done' || completed_at) return 'done';
  if (hasTag('needs-adrian')) return 'needs-adrian';
  if (hasTag('ralph-parked')) return 'parked';
  if (status === 'blocked' || dispatch_status === 'failed') return 'blocked';
  if (hasTag('ralph-wip')) return 'wip';
  if (dispatch_status === 'dispatched' || (claimed_by === 'claude' && !!dispatch_url))
    return 'dispatched';
  if (dispatch_status === 'queued') return 'queued';
  if (hasTag('ralph-ready')) return 'ready';
  return 'backlog';
}

/** Badge tone per phase — the single tone map every pane's phase badge shares. */
export const WORK_STATE_TONE = {
  done: 'success',
  'needs-adrian': 'danger',
  parked: 'warning',
  blocked: 'danger',
  wip: 'inProgress',
  dispatched: 'info',
  queued: 'info',
  ready: 'success',
  backlog: 'neutral',
};

/**
 * Card border tone per phase (ops#158) — the border IS the work-state signal.
 * Kept next to WORK_STATE_TONE so badge + card tones can't drift apart.
 */
export const WORK_STATE_CARD_TONE = {
  done: 'success',
  'needs-adrian': 'danger',
  parked: 'warning',
  blocked: 'warning',
  wip: 'neutral',
  dispatched: 'neutral',
  queued: 'neutral',
  ready: 'neutral',
  backlog: 'neutral',
};
