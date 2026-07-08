/**
 * lib/outreach/smartlead.mjs — the Smartlead implementation of OutreachProvider
 * (#9 outreach engine, docs/prospecting/outreach-providers.md).
 *
 * Contract verified 2026-07-08 against https://helpcenter.smartlead.ai/en/articles/125-full-api-documentation
 * and https://api.smartlead.ai/api-reference/leads/add-to-campaign, cross-checked
 * via two independent open-source Smartlead API clients (bcharleson/smartlead-cli,
 * LeadMagic/smartlead-mcp-server) because this sandbox's outbound proxy
 * policy-blocks direct requests to *.smartlead.ai (403 on CONNECT — confirmed
 * via /__agentproxy/status, not a code bug). Everywhere the sources disagreed
 * is flagged `// VERIFY` below — confirm against a live account/webhook before
 * this goes live.
 *
 *   Base URL  : https://server.smartlead.ai/api/v1
 *   Auth      : `?api_key=<key>` query param (NOT a header, NOT a bearer token)
 *   Add leads : POST /campaigns/{campaign_id}/leads?api_key=...
 *               body: { lead_list: [{ email, first_name, last_name, company_name, custom_fields }] }
 *               (up to 400 leads/request per docs; we don't chunk yet — VERIFY
 *               whether push-outreach.mjs's --limit needs to respect this.)
 *   Webhooks  : event names seen across sources (naming is inconsistent
 *               between the help-center prose and the API reference — treat
 *               both spellings as live until confirmed): EMAIL_SENT,
 *               EMAIL_OPENED, EMAIL_CLICKED, EMAIL_REPLIED (also seen as
 *               EMAIL_REPLY), EMAIL_BOUNCED (also seen as EMAIL_BOUNCE),
 *               LEAD_UNSUBSCRIBED (also seen as EMAIL_UNSUBSCRIBED).
 */

const BASE_URL = 'https://server.smartlead.ai/api/v1';
const ENV_VAR = 'SMARTLEAD_API_KEY';
const VERCEL_ENV_LINK = 'https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables';

/**
 * Reads SMARTLEAD_API_KEY from the environment. Fails loud + actionable
 * (CLAUDE.md standing rule): names the variable AND where to set it.
 * @returns {string}
 */
export function readApiKey() {
  const key = process.env[ENV_VAR]?.trim();
  if (!key) {
    throw new Error(
      `${ENV_VAR} is not set — Adrian: add it in Vercel (${VERCEL_ENV_LINK}), ` +
        'Production + Preview scopes. Get the key from app.smartlead.ai -> Settings -> ' +
        `API Keys. Local dev: put it in .env.local (agents never read/write .env* files).`,
    );
  }
  return key;
}

/**
 * @param {{ apiKey?: string, fetch?: typeof fetch }} [deps]
 * @returns {import('./types.mjs').OutreachProvider}
 */
export function makeSmartleadProvider(deps = {}) {
  const { apiKey, fetch: fetchImpl } = deps;
  const key = apiKey ?? readApiKey();
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    throw new Error(
      'makeSmartleadProvider: no fetch implementation available — pass { fetch } ' +
        '(e.g. a stub in tests) or run on Node >=18 where global fetch exists.',
    );
  }

  return {
    /**
     * @param {string} campaignId
     * @param {import('./types.mjs').OutreachLead[]} leads
     * @returns {Promise<import('./types.mjs').AddLeadsResult>}
     */
    async addLeads(campaignId, leads) {
      if (!campaignId) {
        throw new Error('makeSmartleadProvider.addLeads: campaignId is required.');
      }
      if (!Array.isArray(leads) || leads.length === 0) {
        return { added: 0, skipped: 0 };
      }

      const url = `${BASE_URL}/campaigns/${encodeURIComponent(campaignId)}/leads?api_key=${encodeURIComponent(key)}`;
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // VERIFY: docs show the leads array under a `lead_list` key.
        body: JSON.stringify({ lead_list: leads }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          `Smartlead addLeads failed (HTTP ${res.status}): ${body?.message || res.statusText || 'unknown error'}. ` +
            `Check ${ENV_VAR} is valid/not revoked and campaign "${campaignId}" exists.`,
        );
      }

      return {
        added: body?.added_count ?? body?.added ?? leads.length,
        skipped: body?.skipped_count ?? body?.skipped ?? 0,
        raw: body,
      };
    },
  };
}

// VERIFY: alias every spelling seen across sources for each normalized type —
// safer to over-match than to silently drop a real event because of a naming
// mismatch we can't confirm without a live payload.
function mapEventType(rawType) {
  switch (rawType) {
    case 'EMAIL_SENT':
      return 'sent';
    case 'EMAIL_REPLIED':
    case 'EMAIL_REPLY':
      return 'replied';
    case 'EMAIL_BOUNCED':
    case 'EMAIL_BOUNCE':
      return 'bounced';
    case 'LEAD_UNSUBSCRIBED':
    case 'EMAIL_UNSUBSCRIBED':
      return 'unsubscribed';
    default:
      return null;
  }
}

/**
 * Smartlead webhook payload -> our normalized OutreachEvent.
 *
 * VERIFY: the exact field names (`event_type` vs `event`, whether lead info
 * is nested under `lead` vs flattened) are inferred from cross-referenced
 * third-party docs, not a captured live payload — confirm against a real
 * webhook delivery before wiring api/outreach-webhook.ts (deferred, see doc).
 * Coded defensively: tries several plausible field names/paths per value.
 *
 * @param {Record<string, any>} body
 * @returns {import('./types.mjs').OutreachEvent | null} null when the event
 *   type or email can't be determined — a webhook route should still 200 on
 *   null (not throw) so Smartlead doesn't retry-storm an event we can't map.
 */
export function normalizeWebhook(body) {
  const raw = body ?? {};
  const rawType = String(raw.event_type ?? raw.event ?? raw.type ?? '').toUpperCase();
  const type = mapEventType(rawType);

  const email = raw.lead?.email ?? raw.to_email ?? raw.email ?? '';
  const at = raw.timestamp ?? raw.sent_time ?? raw.event_time ?? raw.created_at ?? new Date().toISOString();

  if (!type || !email) return null;

  return { type, email: String(email), at: String(at), raw };
}
