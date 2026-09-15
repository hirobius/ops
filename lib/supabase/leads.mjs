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

/**
 * Idempotent insert/update of sourced leads, keyed on place_id.
 *
 * Compliance (#36): a lead tombstoned `do_not_contact = true` (opt-out /
 * deletion request) is NEVER re-surfaced by a later scrape. Before upserting we
 * drop any incoming row whose place_id already matches a suppressed lead, so a
 * re-scrape can't resurrect or overwrite an opt-out. The suppression lookup is
 * defensive: if the `do_not_contact` column doesn't exist yet (migration 0007
 * not applied), the lookup errors and we fall back to a plain upsert rather than
 * blocking ingest — the guard activates automatically once 0007 lands.
 */
export async function upsertLeads(sb, rows) {
  if (!Array.isArray(rows) || rows.length === 0) return { data: [], error: null };

  const placeIds = rows.map((r) => r.place_id).filter(Boolean);
  if (placeIds.length) {
    const { data: suppressed, error: supErr } = await sb
      .from('leads')
      .select('place_id')
      .in('place_id', placeIds)
      .eq('do_not_contact', true);
    // supErr (e.g. column absent pre-0007) → skip suppression, proceed to upsert.
    if (!supErr && suppressed && suppressed.length) {
      const blocked = new Set(suppressed.map((r) => r.place_id));
      rows = rows.filter((r) => !blocked.has(r.place_id));
      if (rows.length === 0) return { data: [], error: null };
    }
  }

  return sb.from('leads').upsert(rows, { onConflict: 'place_id' });
}

/**
 * The funnel: one count per stage of lead → paid site, from the leads table.
 *
 * This is the deterministic backbone of /ops/standing. Every figure is a row
 * count, so nothing about the pipeline's state has to be asserted by hand — the
 * stage where the count first reaches zero IS where the chain stops, and that
 * is derived rather than authored (lib/chain/evidence.mjs).
 *
 * PostgREST has no GROUP BY, so this issues one `head: true` count per stage and
 * reads the row count off each. Counts only — no lead rows cross this seam, so
 * no PII reaches the caller (ops is a public repo; #27).
 *
 * A count whose column does not exist yet (a migration not applied) comes back
 * as an error; that stage reports `null` rather than 0, so "not measurable" is
 * never silently rendered as "nothing got through".
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<{ data: Record<string, number|null>, error: null } | { data: null, error: Error }>}
 */
export async function leadFunnel(sb) {
  /** Each entry narrows `leads` to the rows that reached that stage. */
  const STAGES = {
    sourced: (q) => q,
    scored: (q) => q.not('lead_score', 'is', null),
    qualified: (q) => q.eq('qualified', true),
    siteAudited: (q) => q.not('site_quality_score', 'is', null),
    generated: (q) => q.not('config', 'is', null),
    published: (q) => q.not('preview_url', 'is', null),
    contacted: (q) => q.not('contacted_at', 'is', null),
    replied: (q) => q.not('replied_at', 'is', null),
    won: (q) => q.not('won_at', 'is', null),
  };

  const entries = await Promise.all(
    Object.entries(STAGES).map(async ([key, narrow]) => {
      const { count, error } = await narrow(sb.from('leads').select('*', { count: 'exact', head: true }));
      // Column missing → null ("cannot measure"), never 0 ("measured, none").
      return [key, error ? null : (count ?? 0)];
    }),
  );

  return { data: Object.fromEntries(entries), error: null };
}

/* ── the pitch queue (0012) ──────────────────────────────────────────────── */

/**
 * The call sheet: every pitchable lead, newest note attached.
 *
 * Two filters are compliance, not preference — `do_not_contact` leads never
 * re-enter any campaign (#36), and a lead with no `preview_url` has nothing to
 * pitch. Both are enforced in SQL rather than in the UI so no caller can
 * accidentally surface a suppressed business.
 *
 * Ordering is left to `orderPitchQueue` (pure, tested) rather than done here.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 */
export async function listPitchQueue(sb, limit = 200) {
  const { data, error } = await sb
    .from('leads')
    .select(
      'id, name, phone, email, city, region, lead_score, preview_url, ' +
        'outreach_status, contacted_at, replied_at, won_at, lost_at, contact_channel, ' +
        'assigned_to, next_action_at, do_not_contact',
    )
    .eq('do_not_contact', false)
    .not('preview_url', 'is', null)
    .limit(limit);
  if (error) return { data: null, error };

  const ids = (data ?? []).map((l) => l.id);
  if (ids.length === 0) return { data: [], error: null };

  const { data: notes, error: notesError } = await sb
    .from('lead_notes')
    .select('id, lead_id, created_at, author, body')
    .in('lead_id', ids)
    .order('created_at', { ascending: false });
  if (notesError) return { data: null, error: notesError };

  const byLead = new Map();
  for (const n of notes ?? []) {
    if (!byLead.has(n.lead_id)) byLead.set(n.lead_id, []);
    byLead.get(n.lead_id).push(n);
  }

  return {
    data: (data ?? []).map((lead) => ({
      ...lead,
      notes: byLead.get(lead.id) ?? [],
    })),
    error: null,
  };
}

/** The timestamps `stagePatch` needs so it never overwrites an earlier one. */
export function getPitchState(sb, leadId) {
  return sb
    .from('leads')
    .select('id, contacted_at, replied_at, won_at, lost_at, do_not_contact, preview_url')
    .eq('id', leadId)
    .single();
}

/** Append one note. Notes are never edited or deleted — it is a log. */
export function addLeadNote(sb, leadId, { author, body }) {
  return sb.from('lead_notes').insert({ lead_id: leadId, author, body });
}
