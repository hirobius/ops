/**
 * Tests for scripts/lib/query-presets.mjs — the named Outscraper query matrices
 * ported from hirobius/clients scripts/lead-gen/config.ts.
 */

import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_NAMES, buildQueries } from '../lib/query-presets.mjs';

describe('query-presets', () => {
  it('exposes the exterior-cleaning beachhead preset', () => {
    expect(PRESET_NAMES).toContain('exterior-cleaning');
  });

  it('expands to one query per (area × keyword) — 37 areas × 7 keywords = 259', () => {
    const preset = PRESETS['exterior-cleaning'];
    const areaCount = preset.metros.reduce((n, m) => n + m.areas.length, 0);
    const expected = areaCount * preset.keywords.length;
    const queries = buildQueries('exterior-cleaning');
    expect(areaCount).toBe(37);
    expect(preset.keywords).toHaveLength(7);
    expect(queries).toHaveLength(expected);
    expect(queries).toHaveLength(259);
  });

  it('formats queries as "<keyword> in <area>"', () => {
    const queries = buildQueries('exterior-cleaning');
    expect(queries[0]).toBe('pressure washing in Seattle, WA');
    expect(queries.every((q) => / in /.test(q))).toBe(true);
  });

  it('throws a helpful error on an unknown preset', () => {
    expect(() => buildQueries('nope')).toThrow(/Unknown preset "nope"/);
  });

  it('includes the underserved-trade presets (added after Run 01)', () => {
    for (const name of ['excavation-wa', 'welding-wa', 'well-drilling-wa', 'masonry-wa']) {
      expect(PRESET_NAMES).toContain(name);
    }
  });

  it('reaches the home market — Idaho areas exist in no other preset', () => {
    // WA_METROS is WA-only, so before the Inland NW presets the whole matrix
    // could not scrape Coeur d'Alene or Post Falls at all — the metro Adrian
    // lives in and has a portfolio piece in.
    const idahoQueries = buildQueries('home-market-inw').filter((q) => /, ID$/.test(q));
    expect(idahoQueries.length).toBeGreaterThan(0);
    expect(buildQueries('home-market-inw')).toContain('excavation contractor in Post Falls, ID');
    expect(buildQueries('forestry-mulching-inw')).toContain(
      "forestry mulching in Coeur d'Alene, ID",
    );

    // No WA_METROS-based preset reaches Idaho. This is what the new constant buys.
    expect(buildQueries('excavation-wa').some((q) => /, ID$/.test(q))).toBe(false);
  });

  it('leaves WA_METROS presets untouched — widening it would multiply every bill', () => {
    // INLAND_NW_METROS is a separate constant on purpose: every other preset
    // expands over WA_METROS, so an edit there changes the Outscraper spend of
    // all of them at once. Pinned so a future "just add Spokane suburbs" edit
    // to WA_METROS fails loudly here instead of silently on the invoice.
    for (const name of ['fencing-wa', 'tree-service-wa', 'excavation-wa', 'law-wa']) {
      const areaCount = PRESETS[name].metros.reduce((n, m) => n + m.areas.length, 0);
      expect(areaCount).toBe(21);
    }
  });

  it('excludes the agency-saturated trades from the home-market sweep', () => {
    // niche-targeting.md rules HVAC/plumbing/roofing out: not low-penetration,
    // most agency-saturated vertical there is. They belong to the audit-led
    // redesign play, not a "you have no website" cold email. Pinned so they are
    // only ever added deliberately.
    const keywords = PRESETS['home-market-inw'].keywords.join(' ');
    for (const banned of ['hvac', 'plumb', 'roofing']) {
      expect(keywords.toLowerCase()).not.toContain(banned);
    }
  });

  it('includes the high-ticket professional tier', () => {
    for (const name of [
      'law-wa',
      'dental-wa',
      'medical-specialist-wa',
      'financial-advisor-wa',
      'custom-home-builder-wa',
    ]) {
      expect(PRESET_NAMES).toContain(name);
      expect(buildQueries(name).length).toBeGreaterThan(0);
    }
  });

  it('underserved presets expand over the 21 WA_METROS areas × 5 keywords = 105', () => {
    for (const name of ['excavation-wa', 'welding-wa', 'well-drilling-wa', 'masonry-wa']) {
      const preset = PRESETS[name];
      const areaCount = preset.metros.reduce((n, m) => n + m.areas.length, 0);
      expect(areaCount).toBe(21);
      expect(preset.keywords).toHaveLength(5);
      expect(buildQueries(name)).toHaveLength(105);
    }
  });
});
