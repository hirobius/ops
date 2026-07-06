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
});
