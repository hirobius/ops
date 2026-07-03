/**
 * Tests for scripts/lib/outscraper-normalize.mjs — the pure normalize + score
 * core of the Outscraper prospecting pipeline. Deterministic: no network, no
 * clock, no filesystem beyond reading the checked-in synthetic fixture.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import {
  hostOf,
  classifySitePresence,
  socialProofPoints,
  isOperational,
  scoreProspect,
  slugify,
  normalizePlace,
  normalizeResponse,
  flattenPlaces,
  dedupeProspects,
} from '../lib/outscraper-normalize.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE = path.resolve(HERE, '../../fixtures/outscraper-maps-search/response.json');

describe('hostOf', () => {
  it('extracts and normalizes the host', () => {
    expect(hostOf('https://www.Example.com/path')).toBe('example.com');
    expect(hostOf('facebook.com/biz')).toBe('facebook.com'); // no scheme
  });
  it('returns empty string for missing/garbage input', () => {
    expect(hostOf('')).toBe('');
    expect(hostOf(undefined)).toBe('');
    expect(hostOf('   ')).toBe('');
  });
});

describe('classifySitePresence', () => {
  it('maps no url to none', () => {
    expect(classifySitePresence('')).toBe('none');
    expect(classifySitePresence(undefined)).toBe('none');
  });
  it('maps social / link-in-bio hosts (incl. subdomains) to social-only', () => {
    expect(classifySitePresence('https://facebook.com/biz')).toBe('social-only');
    expect(classifySitePresence('https://instagram.com/biz')).toBe('social-only');
    expect(classifySitePresence('https://mybiz.business.site')).toBe('social-only');
    expect(classifySitePresence('https://linktr.ee/biz')).toBe('social-only');
  });
  it('maps DIY builder hosts to builder', () => {
    expect(classifySitePresence('https://biz.squarespace.com')).toBe('builder');
    expect(classifySitePresence('https://biz.wixsite.com/home')).toBe('builder');
    expect(classifySitePresence('https://biz.myshopify.com')).toBe('builder');
  });
  it('maps a real custom domain to custom', () => {
    expect(classifySitePresence('https://www.summitgroundsco.com')).toBe('custom');
  });
});

describe('socialProofPoints', () => {
  it('is 0 at zero reviews and monotonic non-decreasing', () => {
    expect(socialProofPoints(0)).toBe(0);
    expect(socialProofPoints(-5)).toBe(0);
    let prev = -1;
    for (const n of [1, 10, 50, 100, 500, 1000, 5000]) {
      const pts = socialProofPoints(n);
      expect(pts).toBeGreaterThanOrEqual(prev);
      prev = pts;
    }
  });
  it('is capped at 30', () => {
    expect(socialProofPoints(1_000_000)).toBeLessThanOrEqual(30);
  });
});

describe('isOperational', () => {
  it('treats missing status as operating', () => {
    expect(isOperational(undefined)).toBe(true);
    expect(isOperational('')).toBe(true);
  });
  it('only CLOSED_PERMANENTLY is non-operational', () => {
    expect(isOperational('OPERATIONAL')).toBe(true);
    expect(isOperational('CLOSED_TEMPORARILY')).toBe(true);
    expect(isOperational('CLOSED_PERMANENTLY')).toBe(false);
  });
});

describe('scoreProspect', () => {
  it('scores the ideal target (no site, real reviews, verified, open) highest', () => {
    expect(scoreProspect({ sitePresence: 'none', reviews: 214, operational: true, ownerVerified: true })).toBe(93);
  });
  it('never exceeds 100 for an operating business', () => {
    const max = scoreProspect({ sitePresence: 'none', reviews: 10_000, operational: true, ownerVerified: true });
    expect(max).toBeLessThanOrEqual(100);
  });
  it('a custom-domain site scores lower than an equivalent no-site business', () => {
    const noSite = scoreProspect({ sitePresence: 'none', reviews: 100, operational: true, ownerVerified: false });
    const custom = scoreProspect({ sitePresence: 'custom', reviews: 100, operational: true, ownerVerified: false });
    expect(custom).toBeLessThan(noSite);
  });
  it('gates closed businesses to the bottom regardless of web weakness', () => {
    const closedNoSite = scoreProspect({ sitePresence: 'none', reviews: 41, operational: false, ownerVerified: false });
    const openBuilder = scoreProspect({ sitePresence: 'builder', reviews: 12, operational: true, ownerVerified: false });
    expect(closedNoSite).toBeLessThan(openBuilder);
    expect(closedNoSite).toBe(12); // round((45 + 16) * 0.2)
  });
});

describe('slugify', () => {
  it('produces a url-safe slug from name + city', () => {
    expect(slugify('Summit Grounds Co', 'Faketown')).toBe('summit-grounds-co-faketown');
  });
  it('strips accents and collapses separators', () => {
    expect(slugify('Café Déjà Vu!!', 'São Paulo')).toBe('cafe-deja-vu-sao-paulo');
  });
  it('falls back to "prospect" for empty input', () => {
    expect(slugify('', '')).toBe('prospect');
  });
});

describe('normalizePlace', () => {
  it('derives signals and tolerates field aliases (us_state / category / reviews_count)', () => {
    const p = normalizePlace({
      name: 'Alias Co',
      place_id: 'X1',
      city: 'Faketown',
      state: 'ZZ', // alias for us_state
      category: 'Roofer', // alias for type
      reviews_count: 30, // alias for reviews
      site: 'https://instagram.com/aliasco',
      business_status: 'OPERATIONAL',
      verified: true,
    });
    expect(p.region).toBe('ZZ');
    expect(p.category).toBe('Roofer');
    expect(p.reviews).toBe(30);
    expect(p.signals.sitePresence).toBe('social-only');
    expect(p.signals.hasWebsite).toBe(true);
    expect(p.signals.ownerVerified).toBe(true);
    expect(p.slug).toBe('alias-co-faketown');
  });
  it('handles a bare/empty place without throwing', () => {
    const p = normalizePlace({});
    expect(p.slug).toBe('prospect');
    expect(p.rating).toBeNull();
    expect(p.signals.sitePresence).toBe('none');
  });
});

describe('flattenPlaces / dedupeProspects', () => {
  it('flattens array-of-arrays and flat arrays alike', () => {
    expect(flattenPlaces([[{ name: 'a' }], [{ name: 'b' }]])).toHaveLength(2);
    expect(flattenPlaces([{ name: 'a' }, { name: 'b' }])).toHaveLength(2);
    expect(flattenPlaces('nope')).toEqual([]);
  });
  it('dedupes by place id', () => {
    const out = dedupeProspects([
      { placeId: 'A', slug: 'a' },
      { placeId: 'A', slug: 'a' },
      { placeId: 'B', slug: 'b' },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe('normalizeResponse (fixture)', () => {
  const body = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const prospects = normalizeResponse(body.data);

  it('dedupes the repeated place_id (6 raw places -> 5 unique)', () => {
    expect(prospects).toHaveLength(5);
  });

  it('ranks by leadScore desc, proving the scoring thesis', () => {
    const scores = prospects.map((p) => p.signals.leadScore);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(prospects[0].name).toBe('Evergreen Yardworks'); // no-site, verified, 214 reviews
    expect(prospects[0].signals.leadScore).toBe(93);
    expect(prospects[prospects.length - 1].name).toBe('Old Town Hauling (Closed)');
  });

  it('classifies every site-presence bucket present in the fixture', () => {
    const byName = Object.fromEntries(prospects.map((p) => [p.name, p.signals.sitePresence]));
    expect(byName['Evergreen Yardworks']).toBe('none');
    expect(byName['Bluebird Lawn & Snow']).toBe('social-only');
    expect(byName['Summit Grounds Co']).toBe('custom');
    expect(byName['Clearout Junk Haulers']).toBe('builder');
  });
});
