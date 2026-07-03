/**
 * Unit tests for scripts/lib/outscraper-normalize.mjs — the deterministic
 * Outscraper-place → Prospect normalizer and its lead-scoring heuristics.
 * Runs against the synthetic fixture (no network, no key).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  classifySitePresence,
  slugify,
  deriveSignals,
  normalizePlace,
  normalizeResponse,
} from '../lib/outscraper-normalize.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = JSON.parse(
  readFileSync(path.join(ROOT, 'fixtures/outscraper-maps-search/response.json'), 'utf8'),
);

describe('classifySitePresence', () => {
  it('treats empty/missing as none', () => {
    expect(classifySitePresence('')).toBe('none');
    expect(classifySitePresence(undefined)).toBe('none');
    expect(classifySitePresence(null)).toBe('none');
  });
  it('detects social/link-in-bio hosts', () => {
    expect(classifySitePresence('https://www.facebook.com/foo')).toBe('social-only');
    expect(classifySitePresence('https://linktr.ee/foo')).toBe('social-only');
    expect(classifySitePresence('https://foo.business.site')).toBe('social-only');
  });
  it('detects hosted builders', () => {
    expect(classifySitePresence('https://foo.squarespace.com')).toBe('builder');
    expect(classifySitePresence('https://foo.wixsite.com/site')).toBe('builder');
  });
  it('treats a real domain as custom', () => {
    expect(classifySitePresence('https://www.establisheddentalgroup.com')).toBe('custom');
    expect(classifySitePresence('acme-roofing.com')).toBe('custom');
  });
});

describe('slugify', () => {
  it('produces url-safe slugs from name + city', () => {
    expect(slugify('Bright Smile Dental', 'Testville')).toBe('bright-smile-dental-testville');
  });
  it('strips diacritics and punctuation', () => {
    expect(slugify('Café Renée!', 'São Paulo')).toBe('cafe-renee-sao-paulo');
  });
  it('never returns empty', () => {
    expect(slugify('', '')).toBe('prospect');
  });
});

describe('deriveSignals leadScore ordering', () => {
  const base = { business_status: 'OPERATIONAL', verified: true, reviews: 100 };
  it('ranks no-site above social above builder above custom', () => {
    const none = deriveSignals({ ...base, site: '' }).leadScore;
    const social = deriveSignals({ ...base, site: 'https://facebook.com/x' }).leadScore;
    const builder = deriveSignals({ ...base, site: 'https://x.squarespace.com' }).leadScore;
    const custom = deriveSignals({ ...base, site: 'https://x.com-real.com' }).leadScore;
    expect(none).toBeGreaterThan(social);
    expect(social).toBeGreaterThan(builder);
    expect(builder).toBeGreaterThan(custom);
  });
  it('clamps to 0..100', () => {
    const s = deriveSignals({ ...base, site: '', reviews: 100000 }).leadScore;
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(100);
  });
  it('flags closed businesses as not operational', () => {
    const s = deriveSignals({ site: '', business_status: 'CLOSED_PERMANENTLY', reviews: 3 });
    expect(s.operational).toBe(false);
  });
});

describe('normalizePlace', () => {
  it('maps core fields and derives signals', () => {
    const place = FIXTURE.data[0][0]; // Bright Smile Dental, no site, 214 reviews
    const p = normalizePlace(place);
    expect(p.name).toContain('Bright Smile');
    expect(p.website).toBe('');
    expect(p.reviews).toBe(214);
    expect(p.signals.hasWebsite).toBe(false);
    expect(p.signals.sitePresence).toBe('none');
    expect(p.signals.hasSocialProof).toBe(true);
    expect(p.placeId).toBe('ChIJ_sample_no_site_0001');
  });
});

describe('normalizeResponse', () => {
  const batch = normalizeResponse(FIXTURE);
  it('flattens, scores, and sorts by leadScore desc', () => {
    expect(batch.rawCount).toBe(5);
    expect(batch.prospects.length).toBe(5);
    const scores = batch.prospects.map((p) => p.signals.leadScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });
  it('puts the no-site, high-review, verified business on top', () => {
    expect(batch.prospects[0].name).toContain('Bright Smile');
  });
  it('collects the source queries', () => {
    expect(batch.queries).toContain('dentists, Testville TX');
  });
  it('is resilient to an empty/garbage response', () => {
    expect(normalizeResponse({}).prospects).toEqual([]);
    expect(normalizeResponse({ data: [[null, {}]] }).rawCount).toBe(1);
  });
});
