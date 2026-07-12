/**
 * lib/supabase/digests.mjs — the digest_items repository.
 *
 * Named operations over the `digest_items` table (migration 0011). One place
 * owns "how to talk to digest_items" — mirrors lib/supabase/tasks.mjs's shape
 * and conventions.
 *
 * Each op returns the Supabase result shape ({ data, error } or { error }).
 * `sb` is the service-role client from getServiceClient().
 */

/**
 * Digest items, newest date first. Includes dismissed rows by default — the
 * /ops/digest page fetches everything once and splits it client-side into
 * the main flow + the collapsible dismissed stash. Pass includeDismissed:
 * false for a live-only read (e.g. a future integration that only wants the
 * active queue).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export function listDigestItems(sb, { limit, includeDismissed = true } = {}) {
  let q = sb.from('digest_items').select('*');
  if (!includeDismissed) q = q.neq('status', 'dismissed');
  return q.order('date', { ascending: false }).order('created_at', { ascending: true }).limit(limit);
}

/** One digest item by its stable `item_key`. */
export function getDigestItem(sb, itemKey) {
  return sb.from('digest_items').select('*').eq('item_key', itemKey).single();
}

/** Patch one digest item by `item_key`. */
export function updateDigestItem(sb, itemKey, patch) {
  return sb.from('digest_items').update(patch).eq('item_key', itemKey);
}

/**
 * Idempotent insert/update of imported digest items, keyed on `item_key`
 * (`'<date>::<title-slug>'`). Mirrors upsertTasks' shape in
 * lib/supabase/tasks.mjs — re-running the seed for the same committed JSON
 * updates existing rows in place rather than duplicating them.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {object[]} rows
 */
export async function upsertDigestItems(sb, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { data: [], error: null };
  return sb.from('digest_items').upsert(rows, { onConflict: 'item_key' });
}
