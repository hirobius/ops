/**
 * Tests for lib/outreach/map.mjs (pure) and lib/outreach/smartlead.mjs (with a
 * stubbed fetch — no live network). Covers the #9 outreach adapter scaffold:
 * lead -> provider shape, webhook event -> Supabase patch, and the Smartlead
 * request/response contract + fail-loud-on-missing-key behavior.
 */

import { test } from 'vitest';
import assert from 'node:assert/strict';
import { leadToOutreachLead, leadsToOutreachLeads, webhookEventToPatch } from '../../lib/outreach/map.mjs';
import { makeSmartleadProvider, normalizeWebhook, readApiKey } from '../../lib/outreach/smartlead.mjs';

// ---------------------------------------------------------------------------
// leadToOutreachLead
// ---------------------------------------------------------------------------

test('leadToOutreachLead maps a full lead row into the provider shape', () => {
  const lead = {
    email: 'owner@cascadefence.example',
    name: 'Cascade Fence & Deck',
    category: 'Fence contractor',
    city: 'Olympia',
    region: 'WA',
    preview_url: 'https://preview.hirobius.dev/cascade-fence',
    live_url: 'https://cascadefence.example',
    owner_name: 'Jamie',
  };

  const out = leadToOutreachLead(lead);
  assert.deepEqual(out, {
    email: 'owner@cascadefence.example',
    first_name: 'Jamie',
    custom_fields: {
      trade: 'Fence contractor',
      city: 'Olympia',
      preview_url: 'https://preview.hirobius.dev/cascade-fence',
      business_name: 'Cascade Fence & Deck',
    },
  });
});

test('leadToOutreachLead skips leads with no email (returns null)', () => {
  assert.equal(leadToOutreachLead({ name: 'No Email Co' }), null);
  assert.equal(leadToOutreachLead({ email: '' }), null);
  assert.equal(leadToOutreachLead({ email: '   ' }), null);
  assert.equal(leadToOutreachLead({}), null);
});

test('leadToOutreachLead omits first_name when owner_name is absent (no fabricated greeting)', () => {
  const out = leadToOutreachLead({ email: 'info@shop.example', name: 'Shop Co' });
  assert.equal('first_name' in out, false);
});

test('leadToOutreachLead falls back city -> region and preview_url -> live_url', () => {
  const out = leadToOutreachLead({
    email: 'a@b.example',
    name: 'B Co',
    region: 'Oregon',
    live_url: 'https://b.example',
  });
  assert.equal(out.custom_fields.city, 'Oregon');
  assert.equal(out.custom_fields.preview_url, 'https://b.example');
});

test('leadToOutreachLead prefers preview_url over live_url when both present', () => {
  const out = leadToOutreachLead({
    email: 'a@b.example',
    name: 'B Co',
    preview_url: 'https://preview.example/b',
    live_url: 'https://b.example',
  });
  assert.equal(out.custom_fields.preview_url, 'https://preview.example/b');
});

test('leadsToOutreachLeads maps a batch and drops no-email rows', () => {
  const rows = [
    { email: 'a@a.example', name: 'A Co' },
    { name: 'No Email Co' },
    { email: 'c@c.example', name: 'C Co' },
  ];
  const out = leadsToOutreachLeads(rows);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((l) => l.email), ['a@a.example', 'c@c.example']);
});

// ---------------------------------------------------------------------------
// webhookEventToPatch — exhaustive over the #36 lifecycle
// ---------------------------------------------------------------------------

test('webhookEventToPatch: sent', () => {
  const patch = webhookEventToPatch({ type: 'sent', email: 'a@a.example', at: '2026-07-08T00:00:00Z', raw: {} });
  assert.deepEqual(patch, { outreach_status: 'sent', contacted_at: '2026-07-08T00:00:00Z' });
});

test('webhookEventToPatch: replied', () => {
  const patch = webhookEventToPatch({ type: 'replied', email: 'a@a.example', at: '2026-07-08T01:00:00Z', raw: {} });
  assert.deepEqual(patch, { outreach_status: 'replied', replied_at: '2026-07-08T01:00:00Z' });
});

test('webhookEventToPatch: bounced', () => {
  const patch = webhookEventToPatch({ type: 'bounced', email: 'a@a.example', at: '2026-07-08T02:00:00Z', raw: {} });
  assert.deepEqual(patch, { outreach_status: 'bounced' });
});

test('webhookEventToPatch: unsubscribed', () => {
  const patch = webhookEventToPatch({
    type: 'unsubscribed',
    email: 'a@a.example',
    at: '2026-07-08T03:00:00Z',
    raw: {},
  });
  assert.deepEqual(patch, {
    do_not_contact: true,
    unsubscribed_at: '2026-07-08T03:00:00Z',
    suppression_reason: 'unsubscribe',
  });
});

test('webhookEventToPatch throws on an unrecognized event type', () => {
  assert.throws(() => webhookEventToPatch({ type: 'bogus', email: 'a@a.example', at: 'x', raw: {} }), /unknown event type/);
});

// ---------------------------------------------------------------------------
// makeSmartleadProvider — stub fetch, no live network
// ---------------------------------------------------------------------------

test('makeSmartleadProvider.addLeads builds the right request (URL, method, api_key query param, body)', async () => {
  let captured;
  const stubFetch = async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, added_count: 2, skipped_count: 0 }),
    };
  };

  const provider = makeSmartleadProvider({ apiKey: 'test-key-123', fetch: stubFetch });
  const leads = [
    { email: 'a@a.example', custom_fields: { trade: 'roofing' } },
    { email: 'b@b.example', custom_fields: { trade: 'plumbing' } },
  ];
  const result = await provider.addLeads('campaign-42', leads);

  assert.equal(
    captured.url,
    'https://server.smartlead.ai/api/v1/campaigns/campaign-42/leads?api_key=test-key-123',
  );
  assert.equal(captured.init.method, 'POST');
  assert.equal(captured.init.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(captured.init.body), { lead_list: leads });
  assert.deepEqual(result, { added: 2, skipped: 0, raw: { success: true, added_count: 2, skipped_count: 0 } });
});

test('makeSmartleadProvider.addLeads returns added:0,skipped:0 without calling fetch for an empty batch', async () => {
  let called = false;
  const stubFetch = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const provider = makeSmartleadProvider({ apiKey: 'k', fetch: stubFetch });
  const result = await provider.addLeads('campaign-1', []);
  assert.deepEqual(result, { added: 0, skipped: 0 });
  assert.equal(called, false);
});

test('makeSmartleadProvider.addLeads throws a descriptive error on a non-OK response', async () => {
  const stubFetch = async () => ({
    ok: false,
    status: 401,
    statusText: 'Unauthorized',
    json: async () => ({ message: 'Invalid API key' }),
  });
  const provider = makeSmartleadProvider({ apiKey: 'bad-key', fetch: stubFetch });
  await assert.rejects(
    () => provider.addLeads('campaign-1', [{ email: 'a@a.example' }]),
    /Smartlead addLeads failed \(HTTP 401\).*Invalid API key/s,
  );
});

test('makeSmartleadProvider throws naming SMARTLEAD_API_KEY when no key is available', () => {
  const prevKey = process.env.SMARTLEAD_API_KEY;
  delete process.env.SMARTLEAD_API_KEY;
  try {
    assert.throws(() => makeSmartleadProvider({ fetch: async () => ({}) }), /SMARTLEAD_API_KEY is not set/);
  } finally {
    if (prevKey !== undefined) process.env.SMARTLEAD_API_KEY = prevKey;
  }
});

test('readApiKey throws naming SMARTLEAD_API_KEY and the Vercel env link when unset', () => {
  const prevKey = process.env.SMARTLEAD_API_KEY;
  delete process.env.SMARTLEAD_API_KEY;
  try {
    assert.throws(() => readApiKey(), /SMARTLEAD_API_KEY is not set.*vercel\.com/s);
  } finally {
    if (prevKey !== undefined) process.env.SMARTLEAD_API_KEY = prevKey;
  }
});

test('readApiKey returns the trimmed key when set', () => {
  const prevKey = process.env.SMARTLEAD_API_KEY;
  process.env.SMARTLEAD_API_KEY = '  abc123  ';
  try {
    assert.equal(readApiKey(), 'abc123');
  } finally {
    if (prevKey === undefined) delete process.env.SMARTLEAD_API_KEY;
    else process.env.SMARTLEAD_API_KEY = prevKey;
  }
});

// ---------------------------------------------------------------------------
// normalizeWebhook
// ---------------------------------------------------------------------------

test('normalizeWebhook maps EMAIL_SENT', () => {
  const evt = normalizeWebhook({
    event_type: 'EMAIL_SENT',
    timestamp: '2026-07-08T00:00:00Z',
    lead: { email: 'a@a.example' },
  });
  assert.deepEqual(evt.type, 'sent');
  assert.equal(evt.email, 'a@a.example');
  assert.equal(evt.at, '2026-07-08T00:00:00Z');
});

test('normalizeWebhook maps both EMAIL_REPLIED and EMAIL_REPLY spellings to replied', () => {
  assert.equal(normalizeWebhook({ event_type: 'EMAIL_REPLIED', lead: { email: 'a@a.example' } }).type, 'replied');
  assert.equal(normalizeWebhook({ event: 'EMAIL_REPLY', email: 'a@a.example' }).type, 'replied');
});

test('normalizeWebhook maps both EMAIL_BOUNCED and EMAIL_BOUNCE spellings to bounced', () => {
  assert.equal(normalizeWebhook({ event_type: 'EMAIL_BOUNCED', lead: { email: 'a@a.example' } }).type, 'bounced');
  assert.equal(normalizeWebhook({ event: 'EMAIL_BOUNCE', email: 'a@a.example' }).type, 'bounced');
});

test('normalizeWebhook maps both LEAD_UNSUBSCRIBED and EMAIL_UNSUBSCRIBED spellings to unsubscribed', () => {
  assert.equal(
    normalizeWebhook({ event_type: 'LEAD_UNSUBSCRIBED', lead: { email: 'a@a.example' } }).type,
    'unsubscribed',
  );
  assert.equal(normalizeWebhook({ event: 'EMAIL_UNSUBSCRIBED', email: 'a@a.example' }).type, 'unsubscribed');
});

test('normalizeWebhook returns null for an unrecognized event type', () => {
  assert.equal(normalizeWebhook({ event_type: 'EMAIL_OPENED', lead: { email: 'a@a.example' } }), null);
});

test('normalizeWebhook returns null when email is missing', () => {
  assert.equal(normalizeWebhook({ event_type: 'EMAIL_SENT' }), null);
});

test('normalizeWebhook feeds straight into webhookEventToPatch', () => {
  const evt = normalizeWebhook({
    event_type: 'LEAD_UNSUBSCRIBED',
    timestamp: '2026-07-08T05:00:00Z',
    lead: { email: 'a@a.example' },
  });
  const patch = webhookEventToPatch(evt);
  assert.deepEqual(patch, {
    do_not_contact: true,
    unsubscribed_at: '2026-07-08T05:00:00Z',
    suppression_reason: 'unsubscribe',
  });
});
