/**
 * lib/supabase/tasks.mjs — the tasks repository.
 *
 * Named operations over the consolidated `tasks` table (migration 0003), so the
 * raw query builder stops crossing the seam into api/tasks.ts, the dev middleware,
 * and lib/tasks/actions.mjs. One place owns "how to talk to tasks". (Candidate #4.)
 *
 * Each op returns the Supabase result shape ({ data, error } or { error }).
 * `sb` is the service-role client from getServiceClient().
 */

/**
 * Live tasks, status- then sort-ordered. Excludes soft-deleted rows unless asked.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export function listTasks(sb, { limit, includeDeleted = false } = {}) {
  let q = sb.from('tasks').select('*');
  if (!includeDeleted) q = q.is('deleted_at', null);
  return q
    .order('status', { ascending: true })
    .order('sort_order', { ascending: true })
    .limit(limit);
}

/** One task by its stable `key`. */
export function getTask(sb, key) {
  return sb.from('tasks').select('*').eq('key', key).single();
}

/** Patch one task by `key`. */
export function updateTask(sb, key, patch) {
  return sb.from('tasks').update(patch).eq('key', key);
}

/**
 * Patch the Fleet auto-dispatch fields (migration 0008) on one task by `key`.
 * Thin alias over `updateTask` — kept as a named op so callers (the Slice 2
 * dispatcher, the /ops/tasks auto toggle) don't reach for a raw `updateTask`
 * with an ad-hoc column set and drift from the dispatch-field contract.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} key
 * @param {{ auto_ok?: boolean, tier?: string | null, model?: string | null,
 *   dispatch_status?: string | null, dispatch_count?: number,
 *   last_dispatched_at?: string | null }} patch
 */
export function setTaskFields(sb, key, patch) {
  return updateTask(sb, key, patch);
}

/**
 * Idempotent insert/update of imported tasks, keyed on the namespaced `key`
 * (`'<source>:<native_id>'`, e.g. `github:hirobius/ops#42`). Mirrors
 * upsertLeads' shape in lib/supabase/leads.mjs — same repo, same convention.
 * Re-running an import for the same issues updates the existing rows in place
 * rather than duplicating them.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {object[]} rows
 */
export async function upsertTasks(sb, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { data: [], error: null };
  return sb.from('tasks').upsert(rows, { onConflict: 'key' });
}
