/**
 * Tests for lib/leads/call-list.mjs — the call channel's own eligibility and
 * ordering, which deliberately differ from the email channel's.
 */
import { describe, expect, it } from 'vitest';

import {
  MAX_CALL_ATTEMPTS,
  buildCallList,
  callEligibility,
  callHook,
  callPriority,
} from '../../lib/leads/call-list.mjs';

const lead = (over = {}) => ({
  id: 'l1',
  name: 'Acme Plumbing',
  phone: '+1 253 555 0100',
  review_count: 120,
  operational: true,
  do_not_contact: false,
  call_attempts: 0,
  site_presence: 'custom',
  ...over,
});

describe('callEligibility', () => {
  it('accepts a lead with a phone and nothing against it', () => {
    expect(callEligibility(lead()).eligible).toBe(true);
  });

  it('does NOT require an email — 260 of 263 leads have only a phone', () => {
    expect(callEligibility(lead({ email: null })).eligible).toBe(true);
  });

  it('does NOT require the lead to be email-qualified — the audit gates email, not calls', () => {
    expect(callEligibility(lead({ qualified: false, lead_score: 52 })).eligible).toBe(true);
  });

  it('rejects a lead with no phone', () => {
    expect(callEligibility(lead({ phone: '  ' }))).toEqual({
      eligible: false,
      reason: 'no phone number',
    });
  });

  it('rejects a suppressed lead and names the reason', () => {
    const r = callEligibility(lead({ do_not_contact: true, suppression_reason: 'unsubscribe' }));
    expect(r.eligible).toBe(false);
    expect(r.reason).toContain('unsubscribe');
  });

  it('rejects a permanently closed business', () => {
    expect(callEligibility(lead({ operational: false })).eligible).toBe(false);
  });

  it.each(['not-interested', 'wrong-number', 'disconnected', 'do-not-call', 'meeting-booked'])(
    'retires a lead whose outcome is terminal: %s',
    (outcome) => {
      expect(callEligibility(lead({ call_outcome: outcome })).eligible).toBe(false);
    },
  );

  it.each(['no-answer', 'voicemail', 'gatekeeper'])(
    'keeps a retryable outcome in the queue: %s',
    (outcome) => {
      expect(callEligibility(lead({ call_outcome: outcome, call_attempts: 1 })).eligible).toBe(
        true,
      );
    },
  );

  it(`stops after ${MAX_CALL_ATTEMPTS} attempts`, () => {
    expect(callEligibility(lead({ call_attempts: MAX_CALL_ATTEMPTS })).eligible).toBe(false);
    expect(callEligibility(lead({ call_attempts: MAX_CALL_ATTEMPTS - 1 })).eligible).toBe(true);
  });

  describe('callbacks are commitments', () => {
    const now = new Date('2026-09-15T12:00:00Z');
    it('suppresses a lead until its callback time', () => {
      const r = callEligibility(lead({ callback_at: '2026-09-16T09:00:00Z' }), now);
      expect(r.eligible).toBe(false);
      expect(r.reason).toContain('callback scheduled');
    });
    it('releases it once the callback time has passed', () => {
      expect(callEligibility(lead({ callback_at: '2026-09-15T09:00:00Z' }), now).eligible).toBe(
        true,
      );
    });
    it('ignores an unparseable callback rather than suppressing forever', () => {
      expect(callEligibility(lead({ callback_at: 'not-a-date' }), now).eligible).toBe(true);
    });
  });
});

describe('callHook — never invent an observation', () => {
  it('prefers a real audited finding', () => {
    const h = callHook(lead({ site_issues: ['loads in 8.2s on mobile', 'no meta description'] }));
    expect(h).toEqual({ hook: 'loads in 8.2s on mobile', basis: 'pagespeed-audit' });
  });

  it('falls back to mobile-friendliness, then HTTPS', () => {
    expect(callHook(lead({ site_mobile_friendly: false })).basis).toBe('pagespeed-audit');
    expect(callHook(lead({ site_https: false })).hook).toContain('HTTPS');
  });

  it('uses a listing fact when there is no audit', () => {
    expect(callHook(lead({ site_presence: 'none' }))).toEqual({
      hook: 'no website at all on their Google listing',
      basis: 'maps-listing',
    });
  });

  it('returns null for an UNAUDITED custom site — we have not looked, so we claim nothing', () => {
    expect(callHook(lead({ site_presence: 'custom' }))).toBeNull();
  });

  it('ignores empty or non-string entries in site_issues', () => {
    expect(callHook(lead({ site_issues: ['', '   ', null] }))).toBeNull();
  });
});

describe('callPriority', () => {
  it('ranks an audited hook above a listing-derived one', () => {
    const audited = callPriority(lead({ site_issues: ['loads in 8.2s'] }));
    const listing = callPriority(lead({ site_presence: 'none' }));
    expect(audited).toBeGreaterThan(listing);
  });

  it('ranks a listing hook above no hook at all', () => {
    expect(callPriority(lead({ site_presence: 'none' }))).toBeGreaterThan(
      callPriority(lead({ site_presence: 'custom' })),
    );
  });

  it('prefers a never-dialled lead over an equivalent already-dialled one', () => {
    expect(callPriority(lead())).toBeGreaterThan(callPriority(lead({ call_attempts: 2 })));
  });

  it('does not let a review outlier swamp the ordering', () => {
    const huge = callPriority(lead({ review_count: 100000, site_presence: 'custom' }));
    const modest = callPriority(lead({ review_count: 50, site_issues: ['loads in 8.2s'] }));
    expect(modest).toBeGreaterThan(huge);
  });
});

describe('buildCallList', () => {
  it('orders by priority and caps at the limit', () => {
    const leads = [
      lead({ id: 'cold', site_presence: 'custom', review_count: 5 }),
      lead({ id: 'hot', site_issues: ['loads in 8.2s'], review_count: 200 }),
      lead({ id: 'warm', site_presence: 'none', review_count: 100 }),
    ];
    const out = buildCallList(leads, { limit: 2 });
    expect(out.queue.map((q) => q.lead.id)).toEqual(['hot', 'warm']);
    expect(out.eligibleTotal).toBe(3);
  });

  it('reports why leads were skipped, grouped', () => {
    const out = buildCallList([
      lead({ phone: null }),
      lead({ phone: null }),
      lead({ operational: false }),
    ]);
    expect(out.skipped).toBe(3);
    expect(out.skippedReasons['no phone number']).toBe(2);
    expect(out.skippedReasons['permanently closed']).toBe(1);
  });

  it('counts how many queued calls have a real opening line', () => {
    const out = buildCallList([lead({ site_issues: ['slow'] }), lead({ site_presence: 'custom' })]);
    expect(out.queue).toHaveLength(2);
    expect(out.withHook).toBe(1);
  });

  it('handles an empty input', () => {
    expect(buildCallList([]).queue).toEqual([]);
    expect(buildCallList(null).eligibleTotal).toBe(0);
  });
});
