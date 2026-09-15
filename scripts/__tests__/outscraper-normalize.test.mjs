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
  presenceOpportunityPoints,
  scoreProspect,
  scoreBuildability,
  photoRichnessPoints,
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
  // The thesis (reweighted 2026-09-15): rank by how likely they are to BUY, not
  // by how badly they need one. Someone already paying for a website every month
  // is a proven buyer; someone who has operated for years with none has revealed
  // the opposite preference.
  const open = { reviews: 200, operational: true, ownerVerified: true };

  it('ranks a proven buyer (builder site) above an equivalent no-website business', () => {
    const builder = scoreProspect({ ...open, sitePresence: 'builder' });
    const none = scoreProspect({ ...open, sitePresence: 'none' });
    expect(builder).toBeGreaterThan(none);
  });

  it('never exceeds 100 for an operating business, on any presence type', () => {
    for (const sitePresence of ['none', 'social-only', 'builder', 'custom']) {
      const max = scoreProspect({
        sitePresence,
        reviews: 10_000,
        operational: true,
        ownerVerified: true,
        siteQualityScore: 100,
      });
      expect(max).toBeLessThanOrEqual(100);
    }
  });

  it('lets a custom-domain business qualify — the old formula capped it at 59 against a threshold of 60', () => {
    // Regression guard for the defect this reweight fixed: no amount of social
    // proof could carry a custom-domain business over QUALIFIED_LEAD_SCORE, so
    // the whole redesign play (migration 0006 + audit-sites.mjs) was orphaned.
    const terrible = scoreProspect({ ...open, sitePresence: 'custom', siteQualityScore: 90 });
    expect(terrible).toBeGreaterThanOrEqual(60);
  });

  it('scores a custom site by how bad it is — good sites are not prospects', () => {
    const terrible = scoreProspect({ ...open, sitePresence: 'custom', siteQualityScore: 90 });
    const decent = scoreProspect({ ...open, sitePresence: 'custom', siteQualityScore: 10 });
    expect(terrible).toBeGreaterThan(decent);
    expect(decent).toBeLessThan(60);
  });

  it('keeps an UNAUDITED custom site out of outreach — audit first, then email', () => {
    const unaudited = scoreProspect({ ...open, sitePresence: 'custom' });
    expect(unaudited).toBeLessThan(60);
  });

  it('gates closed businesses to the bottom regardless of presence', () => {
    const closedNoSite = scoreProspect({
      sitePresence: 'none',
      reviews: 41,
      operational: false,
      ownerVerified: false,
    });
    const openBuilder = scoreProspect({
      sitePresence: 'builder',
      reviews: 12,
      operational: true,
      ownerVerified: false,
    });
    expect(closedNoSite).toBeLessThan(openBuilder);
    expect(closedNoSite).toBe(9); // round((30 + 16) * 0.2)
  });
});

describe('presenceOpportunityPoints', () => {
  it('ignores site quality for non-custom presence types', () => {
    expect(presenceOpportunityPoints('builder', 90)).toBe(
      presenceOpportunityPoints('builder', undefined),
    );
  });
  it('clamps an out-of-range quality score rather than producing a wild total', () => {
    expect(presenceOpportunityPoints('custom', 5000)).toBe(
      presenceOpportunityPoints('custom', 100),
    );
    expect(presenceOpportunityPoints('custom', -50)).toBe(presenceOpportunityPoints('custom', 0));
  });
  it('treats a non-numeric quality score as unaudited', () => {
    expect(presenceOpportunityPoints('custom', 'nope')).toBe(
      presenceOpportunityPoints('custom', undefined),
    );
  });
  it('tops out level with a builder site — both are proven buyers', () => {
    expect(presenceOpportunityPoints('custom', 100)).toBe(presenceOpportunityPoints('builder'));
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

describe('scoreBuildability', () => {
  it('is 0 with no material and bounded at 100', () => {
    expect(scoreBuildability({ photosCount: 0, reviews: 0 })).toBe(0);
    const max = scoreBuildability({
      photosCount: 100,
      reviews: 10_000,
      hasDescription: true,
      hasHours: true,
      hasServices: true,
      hasLocation: true,
      hasLogo: true,
      hasCta: true,
    });
    expect(max).toBeLessThanOrEqual(100);
    expect(max).toBeGreaterThan(90);
  });
  it('rewards each material lever additively', () => {
    const base = scoreBuildability({ photosCount: 0, reviews: 0 });
    const withDesc = scoreBuildability({ photosCount: 0, reviews: 0, hasDescription: true });
    expect(withDesc).toBeGreaterThan(base);
  });
  it('photo richness is log-scaled and capped', () => {
    expect(photoRichnessPoints(0)).toBe(0);
    expect(photoRichnessPoints(1000)).toBeLessThanOrEqual(25);
    expect(photoRichnessPoints(40)).toBeGreaterThan(photoRichnessPoints(4));
  });
});

describe('normalizePlace', () => {
  it('derives buildScore and richer content from a live-shaped place', () => {
    const p = normalizePlace({
      name: 'Cascade Fence',
      place_id: 'B1',
      city: 'Olympia',
      state_code: 'WA',
      type: 'Fence contractor',
      reviews: 87,
      rating: 4.8,
      photos_count: 32,
      photo: 'https://img/x.jpg',
      description: 'Family-owned since 2009.',
      working_hours: { Monday: ['8AM-5PM'] },
      logo: 'https://img/logo.png',
      booking_appointment_link: 'https://x/quote',
      business_status: 'OPERATIONAL',
    });
    expect(p.signals.buildScore).toBeGreaterThan(70);
    expect(p.content.description).toBe('Family-owned since 2009.');
    expect(p.content.photos).toEqual(['https://img/x.jpg']);
    expect(p.content.logoUrl).toBe('https://img/logo.png');
    expect(p.content.cta).toBe('https://x/quote');
  });
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
  // Contract regression: the LIVE /maps/search-v3 response names these fields
  // `website`, `address`, and `state`/`state_code` — NOT `site`, `full_address`,
  // `us_state`. Verified against a live probe 2026-07-04. If the mapping ever
  // reverts to only the old names, a real business with a custom site would read
  // as `sitePresence: 'none'` and rank as a top no-website target — inverting the
  // scoring thesis. This locks the live shape.
  it('reads live Outscraper field names (website / address / state_code)', () => {
    const p = normalizePlace({
      name: "Pressure Wash Pro's",
      place_id: 'LIVE1',
      city: 'Bend',
      state: 'Oregon', // live full name
      state_code: 'OR', // live 2-letter — preferred for region
      type: 'Pressure washing service',
      reviews: 15,
      rating: 5,
      website: 'https://www.pressurewashproshop.com/', // live: `website`, not `site`
      address: '61819 Avonlea Cir, Bend, OR 97702', // live: `address`, not `full_address`
      business_status: 'OPERATIONAL',
      verified: true,
    });
    expect(p.website).toBe('https://www.pressurewashproshop.com/');
    expect(p.signals.sitePresence).toBe('custom'); // a real site is correctly detected
    expect(p.region).toBe('OR'); // state_code beats the full-name `state`
    expect(p.address).toBe('61819 Avonlea Cir, Bend, OR 97702');
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
    // 78 under the 2026-09-15 reweight (was 93): the fixture's top prospect is a
    // no-website business, whose presence weight dropped 45 -> 30 when the scorer
    // started ranking proven buyers ahead of proven non-buyers.
    expect(prospects[0].signals.leadScore).toBe(78);
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
