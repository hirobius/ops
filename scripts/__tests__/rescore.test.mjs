/**
 * Tests for lib/leads/rescore.mjs — recomputing stored lead scores after the
 * 2026-09-15 scoring reweight, without re-paying Outscraper for data we hold.
 */
import { describe, expect, it } from 'vitest';

import { rescoreLead, rescoreLeads, summarizeRescore } from '../../lib/leads/rescore.mjs';

const row = (over = {}) => ({
  id: 'l1',
  website: 'https://acme.example',
  site_presence: 'custom',
  review_count: 200,
  operational: true,
  owner_verified: true,
  lead_score: 52,
  qualified: false,
  ...over,
});

describe('rescoreLead', () => {
  it('recomputes from stored columns without needing the original scrape', () => {
    const r = rescoreLead(row({ site_presence: 'builder' }));
    expect(r.patch.lead_score).toBeGreaterThan(0);
    expect(r.patch.qualified).toBe(true);
  });

  it('lifts an audited-bad custom site into the qualified pool', () => {
    const r = rescoreLead(row({ site_quality_score: 90 }));
    expect(r.before.qualified).toBe(false);
    expect(r.patch.qualified).toBe(true);
    expect(r.changed).toBe(true);
  });

  it('leaves an unaudited custom site unqualified — audit first, then contact', () => {
    const r = rescoreLead(row({ site_quality_score: null }));
    expect(r.patch.qualified).toBe(false);
  });

  it('does not qualify a custom site that is actually good', () => {
    expect(rescoreLead(row({ site_quality_score: 10 })).patch.qualified).toBe(false);
  });

  describe('site_presence backfill', () => {
    it('reads a NULL presence with no website as "none", not as the custom fallback', () => {
      const r = rescoreLead(row({ site_presence: null, website: null, review_count: 50 }));
      expect(r.patch.site_presence).toBe('none');
      expect(r.presenceBackfilled).toBe(true);
    });

    it('classifies a NULL presence from the website column when one exists', () => {
      const r = rescoreLead(row({ site_presence: null, website: 'https://facebook.com/acme' }));
      expect(r.patch.site_presence).toBe('social-only');
    });

    it('never overwrites a presence that is already stored', () => {
      const r = rescoreLead(
        row({ site_presence: 'builder', website: 'https://facebook.com/acme' }),
      );
      expect(r.patch.site_presence).toBe('builder');
      expect(r.presenceBackfilled).toBe(false);
    });
  });

  describe('nullable column defaults mirror the normalizer', () => {
    it('treats a NULL operational as operating (Google omits it for most open listings)', () => {
      const withNull = rescoreLead(row({ operational: null })).patch.lead_score;
      const withTrue = rescoreLead(row({ operational: true })).patch.lead_score;
      expect(withNull).toBe(withTrue);
    });

    it('treats a NULL owner_verified as NOT verified', () => {
      const withNull = rescoreLead(row({ owner_verified: null })).patch.lead_score;
      const withFalse = rescoreLead(row({ owner_verified: false })).patch.lead_score;
      expect(withNull).toBe(withFalse);
    });

    it('still gates a permanently-closed business to the bottom', () => {
      const closed = rescoreLead(row({ operational: false, site_presence: 'none' })).patch;
      expect(closed.qualified).toBe(false);
    });
  });

  it('reports changed=false when the stored score already matches', () => {
    const first = rescoreLead(row());
    const settled = rescoreLead(row({ ...first.patch }));
    expect(settled.changed).toBe(false);
  });
});

describe('summarizeRescore', () => {
  it('separates gained from lost rather than reporting only a net delta', () => {
    // A net delta of zero can still mean the entire pool was swapped out — which
    // is exactly what the reweight does, so the summary must show both sides.
    const results = rescoreLeads([
      row({ id: 'gain', site_quality_score: 90, qualified: false }),
      row({
        id: 'lose',
        site_presence: 'none',
        review_count: 0,
        qualified: true,
        operational: false,
      }),
    ]);
    const s = summarizeRescore(results);
    expect(s.gained).toBe(1);
    expect(s.lost).toBe(1);
    expect(s.qualifiedDelta).toBe(0);
    expect(s.total).toBe(2);
  });

  it('counts presence backfills so the operator sees schema drift being repaired', () => {
    const s = summarizeRescore(rescoreLeads([row({ site_presence: null, website: null })]));
    expect(s.presenceBackfilled).toBe(1);
  });

  it('handles an empty batch', () => {
    expect(summarizeRescore([]).total).toBe(0);
    expect(rescoreLeads(null)).toEqual([]);
  });
});
