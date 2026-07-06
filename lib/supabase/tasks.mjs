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
 * Bulk upsert rows (insert-or-update on the natural `key`). Used by the backlog
 * importer to seed/refresh source='backlog' rows without duplicating.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Array<Record<string, unknown>>} rows
 */
export function upsertTasks(sb, rows) {
  return sb.from('tasks').upsert(rows, { onConflict: 'key' }).select('key');
}
