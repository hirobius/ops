/**
 * lib/supabase/leads.mjs — the leads repository.
 *
 * Named operations over the `leads` table so the raw Supabase query builder stops
 * crossing the seam into every caller (the api/* handlers, lib/leads/pipeline, and
 * the dev middleware). One place owns "how to talk to leads": a schema change lands
 * here, and callers are testable against this small interface. (Candidate #4.)
 *
 * Each op returns the Supabase result shape ({ data, error } or { error }), so call
 * sites destructure exactly as they did against the raw client. `sb` is the
 * service-role client from getServiceClient().
 */

/**
 * Most-recent-first page of leads.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export function listLeads(sb, limit) {
  return sb.from('leads').select('*').order('created_at', { ascending: false }).limit(limit);
}

/** One lead by id. PostgREST .single() errors unless exactly one row matches. */
export function getLead(sb, id) {
  return sb.from('leads').select('*').eq('id', id).single();
}

/** Patch one lead by id. */
export function updateLead(sb, id, patch) {
  return sb.from('leads').update(patch).eq('id', id);
}

/** Idempotent insert/update of sourced leads, keyed on place_id. */
export function upsertLeads(sb, rows) {
  return sb.from('leads').upsert(rows, { onConflict: 'place_id' });
}
