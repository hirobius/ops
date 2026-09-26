/**
 * Tests for lib/leads/gbp-gaps.mjs — deriving Google Business Profile gaps as
 * outreach opening lines (ops#413).
 */
import { describe, expect, it } from 'vitest';

import { deriveGbpGaps } from '../../lib/leads/gbp-gaps.mjs';

/** A lead that has been through the scoring pipeline (lead_score set) and has
 * every GBP signal in good shape — the "no gaps" baseline. Individual tests
 * override one field at a time. */
const row = (over = {}) => ({
  id: 'l1',
  website: 'https://acme.example',
  hours: { monday: ['09:00-17:00'] },
  photos_count: 12,
  owner_verified: true,
  logo_url: 'https://img.example/acme-logo.png',
  rating: 4.8,
  review_count: 40,
  lead_score: 70,
  ...over,
});

describe('deriveGbpGaps', () => {
  it('returns no gaps for a lead with a clean profile', () => {
    expect(deriveGbpGaps(row())).toEqual([]);
  });

  it('returns [] for a null/undefined lead', () => {
    expect(deriveGbpGaps(null)).toEqual([]);
    expect(deriveGbpGaps(undefined)).toEqual([]);
  });

  it('flags no website', () => {
    const gaps = deriveGbpGaps(row({ website: null }));
    expect(gaps).toHaveLength(1);
    expect(gaps[0].gap).toBe('no_website');
    expect(gaps[0].line).toMatch(/website/i);
  });

  it('treats an empty-string website the same as null', () => {
    const gaps = deriveGbpGaps(row({ website: '' }));
    expect(gaps.map((g) => g.gap)).toContain('no_website');
  });

  it('flags no hours listed when the row was scraped and hours came back empty', () => {
    const gaps = deriveGbpGaps(row({ hours: {} }));
    expect(gaps.map((g) => g.gap)).toEqual(['no_hours']);
  });

  it('does NOT flag hours when hours was never scraped (column is NULL)', () => {
    const gaps = deriveGbpGaps(row({ hours: null }));
    expect(gaps.map((g) => g.gap)).not.toContain('no_hours');
  });

  it('flags no photos at all when photos_count is scraped as 0', () => {
    const gaps = deriveGbpGaps(row({ photos_count: 0 }));
    expect(gaps.map((g) => g.gap)).toEqual(['no_photos']);
  });

  it('flags few photos for 1-4 photos', () => {
    expect(deriveGbpGaps(row({ photos_count: 1 })).map((g) => g.gap)).toEqual(['few_photos']);
    expect(deriveGbpGaps(row({ photos_count: 4 })).map((g) => g.gap)).toEqual(['few_photos']);
  });

  it('does not flag photos at 5 or more', () => {
    expect(deriveGbpGaps(row({ photos_count: 5 })).map((g) => g.gap)).toEqual([]);
  });

  it('does NOT flag photos when photos_count was never scraped (NULL, not 0)', () => {
    const gaps = deriveGbpGaps(row({ photos_count: null }));
    expect(gaps.map((g) => g.gap)).not.toContain('no_photos');
    expect(gaps.map((g) => g.gap)).not.toContain('few_photos');
  });

  it('flags not owner-verified only on an explicit false', () => {
    expect(deriveGbpGaps(row({ owner_verified: false })).map((g) => g.gap)).toEqual([
      'not_owner_verified',
    ]);
  });

  it('does NOT flag owner-verified when it was never scraped (NULL)', () => {
    const gaps = deriveGbpGaps(row({ owner_verified: null }));
    expect(gaps.map((g) => g.gap)).not.toContain('not_owner_verified');
  });

  it('flags no logo when the row was scraped and logo_url came back empty', () => {
    const gaps = deriveGbpGaps(row({ logo_url: null }));
    expect(gaps.map((g) => g.gap)).toEqual(['no_logo']);
  });

  it('flags a low rating below 4.3 (with reviews on record)', () => {
    const gaps = deriveGbpGaps(row({ rating: 4.0, review_count: 12 }));
    expect(gaps.map((g) => g.gap)).toEqual(['low_rating']);
  });

  it('does not flag rating at or above 4.3', () => {
    expect(deriveGbpGaps(row({ rating: 4.3 })).map((g) => g.gap)).toEqual([]);
  });

  it('does not flag a rating with zero reviews on record (meaningless average)', () => {
    const gaps = deriveGbpGaps(row({ rating: 3.0, review_count: 0 }));
    expect(gaps.map((g) => g.gap)).not.toContain('low_rating');
  });

  it('does NOT flag rating when it was never scraped (NULL)', () => {
    expect(deriveGbpGaps(row({ rating: null })).map((g) => g.gap)).not.toContain('low_rating');
  });

  it('a lead that never went through GBP scoring at all (lead_score NULL) reports no scored gaps', () => {
    // Legacy/manually-added row: only base sourcing columns are real: name +
    // website. Every GBP-derived column is NULL because the scoring pipeline
    // never ran on it, not because Google confirmed those fields are empty.
    const legacy = {
      id: 'legacy-1',
      website: 'https://real-site.example',
      hours: null,
      photos_count: null,
      owner_verified: null,
      logo_url: null,
      rating: null,
      review_count: null,
      lead_score: null,
    };
    expect(deriveGbpGaps(legacy)).toEqual([]);
  });

  it('still flags no_website on a never-scraped legacy row (sourced independently of GBP scoring)', () => {
    const legacy = {
      id: 'legacy-2',
      website: null,
      hours: null,
      photos_count: null,
      owner_verified: null,
      logo_url: null,
      rating: null,
      review_count: null,
      lead_score: null,
    };
    expect(deriveGbpGaps(legacy).map((g) => g.gap)).toEqual(['no_website']);
  });

  it('orders several gaps by strength: website, hours, photos, few-photos n/a, verified, logo, rating', () => {
    const gaps = deriveGbpGaps(
      row({
        website: null,
        hours: {},
        photos_count: 2,
        owner_verified: false,
        logo_url: null,
        rating: 3.9,
        review_count: 10,
      }),
    );
    expect(gaps.map((g) => g.gap)).toEqual([
      'no_website',
      'no_hours',
      'few_photos',
      'not_owner_verified',
      'no_logo',
      'low_rating',
    ]);
  });

  it('every gap carries a non-empty ready-to-say line and evidence', () => {
    const gaps = deriveGbpGaps(
      row({
        website: null,
        hours: {},
        photos_count: 0,
        owner_verified: false,
        logo_url: null,
        rating: 3.5,
      }),
    );
    expect(gaps.length).toBeGreaterThan(0);
    for (const g of gaps) {
      expect(typeof g.gap).toBe('string');
      expect(typeof g.evidence).toBe('string');
      expect(g.evidence.length).toBeGreaterThan(0);
      expect(typeof g.line).toBe('string');
      expect(g.line.length).toBeGreaterThan(0);
    }
  });

  it('never emits a description or social gap (pending live-profile verification, see issue)', () => {
    const gaps = deriveGbpGaps(row({ description: null, social: null }));
    expect(gaps.map((g) => g.gap)).not.toContain('no_description');
    expect(gaps.map((g) => g.gap)).not.toContain('no_social');
  });
});
