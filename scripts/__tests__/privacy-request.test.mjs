/**
 * Tests for lib/compliance/privacy-request.mjs — how a privacy request
 * (opt-out / delete / know, ops#38) becomes do_not_contact suppression.
 *
 * Runs against an in-memory fake of the few Supabase builder calls the module
 * uses, and asserts on the resulting table state: the observable effect of
 * honoring a request is what ends up stored.
 */

import { describe, expect, test } from 'vitest';
import { runPrivacyRequest } from '../../lib/compliance/privacy-request.mjs';

const NOW = '2026-09-16T20:00:00.000Z';

/** Minimal in-memory Supabase: select/eq/range/order/single/update/delete over arrays. */
function fakeSupabase(tables) {
  const db = structuredClone(tables);

  function from(table) {
    const state = { op: 'select', filters: [], range: null, single: false, patch: null };
    const rows = () => db[table].filter((r) => state.filters.every(([c, v]) => r[c] === v));

    const builder = {
      select() {
        return builder;
      },
      eq(col, val) {
        state.filters.push([col, val]);
        return builder;
      },
      order() {
        return builder;
      },
      range(a, b) {
        state.range = [a, b];
        return builder;
      },
      single() {
        state.single = true;
        return builder;
      },
      update(patch) {
        state.op = 'update';
        state.patch = patch;
        return builder;
      },
      delete() {
        state.op = 'delete';
        return builder;
      },
      then(resolve, reject) {
        try {
          resolve(execute());
        } catch (e) {
          reject(e);
        }
      },
    };

    function execute() {
      if (state.op === 'update') {
        for (const r of rows()) Object.assign(r, state.patch);
        return { data: null, error: null };
      }
      if (state.op === 'delete') {
        const doomed = new Set(rows());
        db[table] = db[table].filter((r) => !doomed.has(r));
        return { data: null, error: null };
      }
      let out = rows().map((r) => ({ ...r }));
      if (state.range) out = out.slice(state.range[0], state.range[1] + 1);
      if (state.single) {
        return out.length === 1
          ? { data: out[0], error: null }
          : { data: null, error: { message: 'not exactly one row' } };
      }
      return { data: out, error: null };
    }

    return builder;
  }

  return { from, db };
}

function lead(overrides) {
  return {
    id: 'lead-1',
    created_at: '2026-07-07T00:00:00.000Z',
    place_id: 'ChIJ-cascade',
    status: 'sourced',
    name: 'Cascade Fence & Deck',
    phone: '+1 509-555-0100',
    email: 'owner@cascadefence.example',
    website: 'https://cascadefence.example',
    do_not_contact: false,
    suppression_reason: null,
    unsubscribed_at: null,
    ...overrides,
  };
}

describe('runPrivacyRequest — opt-out', () => {
  test('suppresses the lead matching the requester email, and only that lead', async () => {
    const sb = fakeSupabase({
      leads: [lead({}), lead({ id: 'lead-2', place_id: 'ChIJ-other', email: 'hi@other.example' })],
      lead_notes: [],
    });

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { email: 'Owner@CascadeFence.example' },
      apply: true,
      now: NOW,
    });

    const [cascade, other] = sb.db.leads;
    expect(cascade.do_not_contact).toBe(true);
    expect(cascade.suppression_reason).toBe('opt-out-request');
    expect(cascade.unsubscribed_at).toBe(NOW);
    expect(other.do_not_contact).toBe(false);
  });

  test('a dry run reports the change it would make and writes nothing', async () => {
    const sb = fakeSupabase({ leads: [lead({})], lead_notes: [] });

    const result = await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { email: 'owner@cascadefence.example' },
      now: NOW,
    });

    expect(result.applied).toBe(false);
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].patch.do_not_contact).toBe(true);
    expect(sb.db.leads[0].do_not_contact).toBe(false);
  });

  test('matches a phone number however the requester formats it', async () => {
    const sb = fakeSupabase({ leads: [lead({ phone: '+1 509-555-0100' })], lead_notes: [] });

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { phone: '(509) 555 0100' },
      apply: true,
      now: NOW,
    });

    expect(sb.db.leads[0].do_not_contact).toBe(true);
  });

  test('matches by Google place id or by lead id', async () => {
    const sb = fakeSupabase({
      leads: [lead({}), lead({ id: 'lead-2', place_id: 'ChIJ-other', email: null, phone: null })],
      lead_notes: [],
    });

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { placeId: 'ChIJ-other' },
      apply: true,
      now: NOW,
    });
    expect(sb.db.leads.map((l) => l.do_not_contact)).toEqual([false, true]);

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { id: 'lead-1' },
      apply: true,
      now: NOW,
    });
    expect(sb.db.leads.map((l) => l.do_not_contact)).toEqual([true, true]);
  });

  test('matches the website a requester gives, however they write it', async () => {
    const sb = fakeSupabase({
      leads: [
        lead({ website: 'https://www.cascadefence.example/services' }),
        lead({ id: 'lead-2', place_id: 'ChIJ-other', website: 'https://cascadefence.example.net' }),
      ],
      lead_notes: [],
    });

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { website: 'CascadeFence.example' },
      apply: true,
      now: NOW,
    });

    expect(sb.db.leads.map((l) => l.do_not_contact)).toEqual([true, false]);
  });

  test('tells the operator to stop any Smartlead sequence already sending to the lead', async () => {
    // Suppression only stops future pushes; a campaign already in flight keeps
    // sending its follow-ups until the lead is removed from it in Smartlead.
    const sb = fakeSupabase({
      leads: [lead({}), lead({ id: 'lead-2', place_id: 'ChIJ-no-email', email: null })],
      lead_notes: [],
    });

    const withEmail = await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { id: 'lead-1' },
      now: NOW,
    });
    expect(withEmail.changes[0].warnings.join('\n')).toMatch(/Smartlead/);

    const withoutEmail = await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { id: 'lead-2' },
      now: NOW,
    });
    expect(withoutEmail.changes[0].warnings).toEqual([]);
  });

  test('keeps the original reason and date on a lead that had already opted out', async () => {
    const sb = fakeSupabase({
      leads: [
        lead({
          do_not_contact: true,
          suppression_reason: 'unsubscribe',
          unsubscribed_at: '2026-08-01T00:00:00.000Z',
        }),
      ],
      lead_notes: [],
    });

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { email: 'owner@cascadefence.example' },
      apply: true,
      now: NOW,
    });

    expect(sb.db.leads[0]).toMatchObject({
      do_not_contact: true,
      suppression_reason: 'unsubscribe',
      unsubscribed_at: '2026-08-01T00:00:00.000Z',
    });
  });
});

describe('runPrivacyRequest — delete', () => {
  const full = () =>
    lead({
      street_address: '12 Main St',
      owner_name: 'Jamie',
      config: { business: { name: 'Cascade Fence & Deck' } },
      preview_url: 'https://cascade-fence.vercel.app',
      lead_score: 72,
      call_outcome: 'callback',
      outreach_status: 'queued',
    });

  test('reduces the record to the suppression minimum the policy promises, and removes its notes', async () => {
    const sb = fakeSupabase({
      leads: [full(), lead({ id: 'lead-2', place_id: 'ChIJ-other', email: 'hi@other.example' })],
      lead_notes: [
        { id: 'n1', lead_id: 'lead-1', author: 'adrian', body: 'wants mobile fixed' },
        { id: 'n2', lead_id: 'lead-2', author: 'adrian', body: 'call back Tuesday' },
      ],
    });

    await runPrivacyRequest(sb, {
      type: 'delete',
      identifiers: { email: 'owner@cascadefence.example' },
      apply: true,
      now: NOW,
    });

    expect(sb.db.leads[0]).toEqual({
      id: 'lead-1',
      created_at: '2026-07-07T00:00:00.000Z',
      status: 'sourced',
      place_id: 'ChIJ-cascade',
      do_not_contact: true,
      suppression_reason: 'deletion-request',
      unsubscribed_at: NOW,
      name: null,
      phone: null,
      email: null,
      website: null,
      street_address: null,
      owner_name: null,
      config: null,
      preview_url: null,
      lead_score: null,
      call_outcome: null,
      outreach_status: null,
    });
    expect(sb.db.leads[1].email).toBe('hi@other.example');
    expect(sb.db.lead_notes.map((n) => n.id)).toEqual(['n2']);
  });

  test('warns about copies outside the database it cannot reach, before they are forgotten', async () => {
    const sb = fakeSupabase({ leads: [full()], lead_notes: [] });

    const result = await runPrivacyRequest(sb, {
      type: 'delete',
      identifiers: { id: 'lead-1' },
      now: NOW,
    });

    const warnings = result.changes[0].warnings.join('\n');
    expect(warnings).toContain('https://cascade-fence.vercel.app');
    expect(warnings).toMatch(/Smartlead/);
  });

  test('warns about copies in public GitHub repos, naming the business so it can still be searched for', async () => {
    // hirobius/site-engine and hirobius/ops are public: a sample site's
    // client.config.ts and run-log.md carry real lead facts, in git history too.
    const sb = fakeSupabase({
      leads: [lead({ slug: 'cascade-fence-deck', preview_url: null })],
      lead_notes: [],
    });

    const result = await runPrivacyRequest(sb, {
      type: 'delete',
      identifiers: { id: 'lead-1' },
      apply: true,
      now: NOW,
    });

    const warnings = result.changes[0].warnings.join('\n');
    expect(warnings).toContain('site-engine');
    expect(warnings).toContain('apps/cascade-fence-deck');
    expect(warnings).toMatch(/git history/);
    expect(warnings).toContain('run-log.md');
    expect(warnings).toContain('Cascade Fence & Deck');
  });

  test('warns that a lead without a place id cannot be kept from being collected again', async () => {
    const sb = fakeSupabase({ leads: [lead({ place_id: null })], lead_notes: [] });

    const result = await runPrivacyRequest(sb, {
      type: 'delete',
      identifiers: { id: 'lead-1' },
      now: NOW,
    });

    expect(result.changes[0].warnings.join('\n')).toMatch(/place id/i);
  });
});

describe('runPrivacyRequest — know', () => {
  test('returns everything held about the business, including conversation notes, and writes nothing', async () => {
    const sb = fakeSupabase({
      leads: [lead({ lead_score: 72 })],
      lead_notes: [{ id: 'n1', lead_id: 'lead-1', author: 'adrian', body: 'wants mobile fixed' }],
    });

    const result = await runPrivacyRequest(sb, {
      type: 'know',
      identifiers: { phone: '509.555.0100' },
      apply: true,
      now: NOW,
    });

    expect(result.disclosures).toHaveLength(1);
    expect(result.disclosures[0].record).toMatchObject({
      name: 'Cascade Fence & Deck',
      lead_score: 72,
    });
    expect(result.disclosures[0].notes).toEqual([
      { id: 'n1', lead_id: 'lead-1', author: 'adrian', body: 'wants mobile fixed' },
    ]);
    expect(result.changes).toEqual([]);
    expect(sb.db.leads[0].do_not_contact).toBe(false);
  });
});

describe('runPrivacyRequest — a website on a shared platform names one page, not the platform', () => {
  // Social-only leads store their Facebook/Instagram/linktr.ee page in `website`
  // (scripts/lib/outscraper-normalize.mjs), so many unrelated businesses share a host.
  const socialLeads = () =>
    fakeSupabase({
      leads: [
        lead({
          id: 'alpha',
          place_id: 'ChIJ-alpha',
          name: 'Alpha Roofing',
          email: null,
          phone: null,
          website: 'https://www.facebook.com/alpha-roofing/',
        }),
        lead({
          id: 'beta',
          place_id: 'ChIJ-beta',
          name: 'Beta Plumbing',
          email: null,
          phone: null,
          website: 'https://facebook.com/beta-plumbing',
        }),
        lead({
          id: 'gamma',
          place_id: 'ChIJ-gamma',
          name: 'Gamma Septic',
          email: null,
          phone: null,
          website: 'https://m.facebook.com/profile.php?id=100064',
        }),
      ],
      lead_notes: [{ id: 'n-beta', lead_id: 'beta', author: 'adrian', body: 'owner is selling' }],
    });

  test('know discloses only the requester page, never other businesses on the same host', async () => {
    const result = await runPrivacyRequest(socialLeads(), {
      type: 'know',
      identifiers: { website: 'facebook.com/alpha-roofing' },
      now: NOW,
    });

    expect(result.disclosures.map((d) => d.record.name)).toEqual(['Alpha Roofing']);
    expect(JSON.stringify(result.disclosures)).not.toContain('owner is selling');
  });

  test('opt-out suppresses only the requester page', async () => {
    const sb = socialLeads();

    await runPrivacyRequest(sb, {
      type: 'opt-out',
      identifiers: { website: 'https://facebook.com/Alpha-Roofing' },
      apply: true,
      now: NOW,
    });

    expect(sb.db.leads.map((l) => [l.id, l.do_not_contact])).toEqual([
      ['alpha', true],
      ['beta', false],
      ['gamma', false],
    ]);
  });

  test('a profile id in the query string is what tells two profile pages apart', async () => {
    const sb = socialLeads();

    const result = await runPrivacyRequest(sb, {
      type: 'know',
      identifiers: { website: 'facebook.com/profile.php?id=100064' },
      now: NOW,
    });

    expect(result.disclosures.map((d) => d.record.name)).toEqual(['Gamma Septic']);
  });

  test('the bare platform address identifies no one', async () => {
    await expect(
      runPrivacyRequest(socialLeads(), {
        type: 'know',
        identifiers: { website: 'https://www.facebook.com/' },
      }),
    ).rejects.toThrow(/identifier/);
  });
});

describe('runPrivacyRequest — refuses to guess', () => {
  const sb = () => fakeSupabase({ leads: [lead({})], lead_notes: [] });

  test('an unknown request type', async () => {
    await expect(
      runPrivacyRequest(sb(), { type: 'forget-me', identifiers: { id: 'lead-1' } }),
    ).rejects.toThrow(/opt-out, delete, know/);
  });

  test('a deletion that matches more than one business, unless multiple matches are explicitly allowed', async () => {
    const twoLocations = () =>
      fakeSupabase({
        leads: [
          lead({}),
          lead({ id: 'lead-2', place_id: 'ChIJ-branch', email: 'branch@x.example' }),
        ],
        lead_notes: [],
      });
    const request = {
      type: 'delete',
      identifiers: { phone: '509-555-0100' },
      apply: true,
      now: NOW,
    };

    const refused = twoLocations();
    await expect(runPrivacyRequest(refused, request)).rejects.toThrow(/2 leads/);
    expect(refused.db.leads.every((l) => l.name === 'Cascade Fence & Deck')).toBe(true);

    const allowed = twoLocations();
    await runPrivacyRequest(allowed, { ...request, allowMultiple: true });
    expect(allowed.db.leads.every((l) => l.name === null)).toBe(true);
  });

  const twoBusinessesOneNumber = () =>
    fakeSupabase({
      leads: [
        lead({}),
        lead({
          id: 'lead-2',
          place_id: 'ChIJ-shared-line',
          name: 'Other Business',
          email: 'hi@other.example',
        }),
      ],
      lead_notes: [{ id: 'n2', lead_id: 'lead-2', author: 'adrian', body: 'not the requester' }],
    });

  test('a know request that matches more than one business discloses nothing, unless allowed', async () => {
    const request = { type: 'know', identifiers: { phone: '509-555-0100' }, now: NOW };

    await expect(runPrivacyRequest(twoBusinessesOneNumber(), request)).rejects.toThrow(/2 leads/);

    const allowed = await runPrivacyRequest(twoBusinessesOneNumber(), {
      ...request,
      allowMultiple: true,
    });
    expect(allowed.disclosures).toHaveLength(2);
  });

  test('an opt-out that matches more than one business writes nothing, unless allowed', async () => {
    const request = {
      type: 'opt-out',
      identifiers: { phone: '509-555-0100' },
      apply: true,
      now: NOW,
    };

    const refused = twoBusinessesOneNumber();
    await expect(runPrivacyRequest(refused, request)).rejects.toThrow(/2 leads/);
    expect(refused.db.leads.every((l) => l.do_not_contact === false)).toBe(true);

    const allowed = twoBusinessesOneNumber();
    await runPrivacyRequest(allowed, { ...request, allowMultiple: true });
    expect(allowed.db.leads.every((l) => l.do_not_contact === true)).toBe(true);
  });

  test('a request with no usable identifier, which would otherwise match nothing silently', async () => {
    await expect(
      runPrivacyRequest(sb(), { type: 'opt-out', identifiers: { phone: '555-0100' } }),
    ).rejects.toThrow(/identifier/);
  });
});
