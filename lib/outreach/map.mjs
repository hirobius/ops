/**
 * lib/outreach/map.mjs — pure mapping between our domain (Supabase `leads`
 * rows, #36 lifecycle columns from supabase/migrations/0007_lead_lifecycle.sql)
 * and the provider-agnostic outreach shapes in lib/outreach/types.mjs.
 *
 * No I/O, no fetch, no Supabase client — fully unit-testable in isolation.
 * The eligibility filter (lead_score, do_not_contact, outreach_status) lives
 * in scripts/push-outreach.mjs, NOT here; this module only shapes data that's
 * already been decided as eligible.
 *
 * @typedef {import('./types.mjs').OutreachLead} OutreachLead
 * @typedef {import('./types.mjs').OutreachEvent} OutreachEvent
 */

/**
 * A Supabase `leads` row -> a provider-agnostic outreach lead.
 *
 * Field sources (see lib/supabase/leads.mjs + src/app/pages/ops/leads/types.ts):
 *   - custom_fields.trade        <- category
 *   - custom_fields.city         <- city, falling back to region (state) if city is blank
 *   - custom_fields.preview_url  <- preview_url, falling back to live_url
 *   - custom_fields.business_name <- name
 *   - first_name                 <- owner_name (migration 0007's CRM contact-name
 *     column). Google Places gives us a *business* name, never a person's name,
 *     so first_name is only set once owner_name has been enriched onto the row;
 *     until then it's simply omitted (no fabricated greeting).
 *
 * Leads with no email are un-contactable by this channel and return `null` —
 * the push script's eligibility filter already excludes these, but this stays
 * defensive so a caller that forgets the filter can't ship a broken lead.
 *
 * @param {Record<string, unknown>} lead
 * @returns {OutreachLead | null}
 */
export function leadToOutreachLead(lead) {
  const email = typeof lead?.email === 'string' ? lead.email.trim() : '';
  if (!email) return null;

  /** @type {OutreachLead} */
  const out = { email };

  const firstName = typeof lead.owner_name === 'string' ? lead.owner_name.trim() : '';
  if (firstName) out.first_name = firstName;

  const trade = lead.category ? String(lead.category) : '';
  const city = lead.city ? String(lead.city) : lead.region ? String(lead.region) : '';
  const previewUrl = lead.preview_url ? String(lead.preview_url) : lead.live_url ? String(lead.live_url) : '';
  const businessName = lead.name ? String(lead.name) : '';

  out.custom_fields = {
    trade,
    city,
    preview_url: previewUrl,
    business_name: businessName,
  };

  return out;
}

/**
 * Batch form of leadToOutreachLead — maps a page of eligible rows, silently
 * dropping any without an email (see leadToOutreachLead).
 * @param {Record<string, unknown>[]} leads
 * @returns {OutreachLead[]}
 */
export function leadsToOutreachLeads(leads) {
  return (leads || []).map(leadToOutreachLead).filter((l) => l !== null);
}

/**
 * A normalized OutreachEvent -> the Supabase `leads` patch for the #36
 * lifecycle columns. Pure — the caller (today: nothing yet: the inbound
 * webhook route is deferred, see docs/prospecting/outreach-providers.md)
 * does `updateLead(sb, leadId, webhookEventToPatch(event))`.
 *
 * @param {OutreachEvent} event
 * @returns {Record<string, unknown>}
 */
export function webhookEventToPatch(event) {
  switch (event.type) {
    case 'sent':
      return { outreach_status: 'sent', contacted_at: event.at };
    case 'replied':
      return { outreach_status: 'replied', replied_at: event.at };
    case 'bounced':
      return { outreach_status: 'bounced' };
    case 'unsubscribed':
      return {
        do_not_contact: true,
        unsubscribed_at: event.at,
        suppression_reason: 'unsubscribe',
      };
    default:
      throw new Error(`webhookEventToPatch: unknown event type "${event.type}"`);
  }
}
