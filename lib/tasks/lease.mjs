/**
 * lib/tasks/lease.mjs — claim/lease primitive for the fleet dispatcher
 * (issue #47, B.2 — the "headline decision" gate before the mayor can be
 * scheduled unattended).
 *
 * Today `fleet-dispatch.mjs` selects eligible rows then writes
 * `dispatch_status` back — there's a window between the read and the write
 * where two concurrent runs (a mayor Routine firing while Adrian runs
 * `--apply` by hand, or two overlapping Routine firings) could both select
 * the SAME row and both dispatch it. `claimLease` closes that window with an
 * atomic conditional UPDATE: it only succeeds if the row is unleased or its
 * existing lease has already expired, so a lost race is visible as
 * `claimed: false` — never a silent double-write.
 *
 * Mines swarm-watchdog.mjs's stale-claim-revert idea (a claim that outlives
 * its TTL is abandoned, not permanent) — reimplemented here against the
 * Supabase `tasks` row (migration 0009) instead of a JSON store.
 *
 * `isLeased`/`filterUnleased` are pure (no Date-inside — `now` is ms epoch,
 * caller-supplied); `claimLease`/`releaseLease` are the one live-Supabase
 * write each.
 */

export const DEFAULT_LEASE_MINUTES = 15;

/**
 * Pure: true when `task` currently holds an unexpired lease.
 * @param {{ lease_expires_at?: string | null }} task
 * @param {number} now — ms epoch, caller-supplied
 * @returns {boolean}
 */
export function isLeased(task, now) {
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new Error('isLeased requires a numeric `now` (ms epoch) passed by the caller.');
  }
  if (!task?.lease_expires_at) return false;
  const expiresAt = new Date(task.lease_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > now;
}

/**
 * Pure: drop currently-leased tasks from a list.
 * @param {Array<object>} tasks
 * @param {number} now — ms epoch, caller-supplied
 */
export function filterUnleased(tasks, now) {
  return (Array.isArray(tasks) ? tasks : []).filter((t) => t && !isLeased(t, now));
}

/**
 * Attempts to atomically claim the lease on one task row — the write that
 * actually prevents two concurrent runs from both dispatching the same
 * task. Only succeeds if the row is unleased (`lease_expires_at IS NULL`)
 * or its existing lease has expired (`lease_expires_at < now`).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} key
 * @param {{ owner: string, ttlMinutes?: number, now: number }} opts
 * @returns {Promise<{ claimed: boolean, error: object|null }>}
 */
export async function claimLease(sb, key, { owner, ttlMinutes = DEFAULT_LEASE_MINUTES, now } = {}) {
  if (typeof now !== 'number' || !Number.isFinite(now)) {
    throw new Error('claimLease requires a numeric `now` (ms epoch) passed by the caller.');
  }
  const nowIso = new Date(now).toISOString();
  const expiresAtIso = new Date(now + ttlMinutes * 60_000).toISOString();

  const { data, error } = await sb
    .from('tasks')
    .update({ lease_owner: owner, lease_expires_at: expiresAtIso })
    .eq('key', key)
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${nowIso}`)
    .select('key');

  if (error) return { claimed: false, error };
  return { claimed: (data ?? []).length > 0, error: null };
}

/** Releases a lease unconditionally — call once dispatch reaches a terminal outcome. */
export function releaseLease(sb, key) {
  return sb.from('tasks').update({ lease_owner: null, lease_expires_at: null }).eq('key', key);
}
