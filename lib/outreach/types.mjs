/**
 * lib/outreach/types.mjs — the outreach-provider interface + normalized event
 * shape (#9 outreach engine, docs/prospecting/outreach-providers.md).
 *
 * Provider-agnostic by design: Smartlead is the chosen implementation
 * (lib/outreach/smartlead.mjs), but nothing else in the codebase — the push
 * script, the future webhook route — talks to a vendor SDK directly. They
 * only ever see `OutreachProvider` / `OutreachEvent`, so swapping providers
 * later (Instantly, Lemlist) means writing one new file, not touching callers.
 *
 * @typedef {Object} OutreachLead
 * @property {string} email
 * @property {string} [first_name]
 * @property {Record<string, string>} [custom_fields]
 *
 * @typedef {Object} AddLeadsResult
 * @property {number} added
 * @property {number} skipped
 * @property {unknown} [raw] - the untouched provider response, for debugging
 *
 * @typedef {Object} OutreachProvider
 * @property {(campaignId: string, leads: OutreachLead[]) => Promise<AddLeadsResult>} addLeads
 *
 * @typedef {'sent'|'replied'|'bounced'|'unsubscribed'} OutreachEventType
 *
 * @typedef {Object} OutreachEvent
 * @property {OutreachEventType} type
 * @property {string} email
 * @property {string} at - ISO timestamp of the event
 * @property {unknown} raw - the untouched provider payload (audit/debug trail)
 */

/** Exhaustive list of normalized event types — used by tests and to drive switch coverage. */
export const OUTREACH_EVENT_TYPES = Object.freeze(['sent', 'replied', 'bounced', 'unsubscribed']);
