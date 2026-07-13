/**
 * lib/schema — re-sync of post-#134 canonical deltas (ops#129 follow-up).
 *
 * Guards the vendored copy against site-engine's canonical schema for the
 * changes that landed there after the brand.motion re-sync:
 * - site-engine#100 — NANP phone refine + duplicate sectionOrder rejection
 * - site-engine#118 — per-vertical content packs merged by defineClient
 * - site-engine#122 — deterministic leadToConfig lead-row mapper
 * Expected values mirror site-engine `packages/schema/src/*.test.ts`.
 */

import { describe, it, expect } from 'vitest';
import { defineClient } from '../../lib/schema/index.mjs';

function baseConfig(overrides = {}) {
  return {
    slug: 'pressure-pros',
    business: {
      name: 'Pressure Pros',
      phone: '(509) 838-4200',
      email: 'owner@pressurepros.example',
      hours: [{ days: 'Mon–Fri', hours: '8:00 AM – 6:00 PM' }],
      serviceAreas: ['Springfield'],
    },
    brand: { palettePreset: 'pressure-washing' },
    layout: { variant: 'A' },
    services: [{ title: 'Driveway Cleaning', description: 'Restores curb appeal.' }],
    copy: {
      heroHeadline: 'Pressure Washing in Springfield',
      heroSub: 'Fast, insured, guaranteed.',
      about: 'Family-owned since 2010.',
    },
    form: { provider: 'web3forms', accessKey: 'test-key' },
    seo: {
      title: 'Pressure Pros — Springfield Pressure Washing',
      description: 'Local pressure washing pros serving Springfield and nearby areas.',
      city: 'Springfield',
      region: 'IL',
      siteUrl: 'https://pressurepros.example',
    },
    ...overrides,
  };
}

function withPhone(phone) {
  const config = baseConfig();
  return { ...config, business: { ...config.business, phone } };
}

describe('business.phone (site-engine#100)', () => {
  it('rejects too-short, invalid-character, or non-10-digit phone numbers', () => {
    for (const bad of [
      '123',
      'call us!',
      '555-CALL-NOW',
      '1234567',
      '12345',
      '0123456789',
      '1123456789',
      '509-838-42001',
    ]) {
      expect(() => defineClient(withPhone(bad)), `should reject "${bad}"`).toThrow();
    }
  });

  it('accepts common phone formats', () => {
    for (const good of ['(509) 838-4200', '+1 509-838-4200', '5098384200']) {
      expect(() => defineClient(withPhone(good)), `should accept "${good}"`).not.toThrow();
    }
  });

  it("accepts the fleet's intentional 555 placeholder numbers", () => {
    for (const placeholder of [
      '(555) 010-0000',
      '(512) 555-0142',
      '(509) 555-0100',
      '(555) 010-3302',
    ]) {
      expect(() => defineClient(withPhone(placeholder)), `should accept "${placeholder}"`).not.toThrow();
    }
  });
});

describe('layout.sectionOrder duplicates (site-engine#100)', () => {
  it('rejects duplicate section ids', () => {
    expect(() =>
      defineClient(baseConfig({ layout: { sectionOrder: ['services', 'services'] } })),
    ).toThrow(/duplicate section id "services"/);
  });

  it('still accepts a valid subset and order', () => {
    const config = defineClient(baseConfig({ layout: { sectionOrder: ['contact', 'services'] } }));
    expect(config.layout.sectionOrder).toEqual(['contact', 'services']);
  });
});

describe('content packs (site-engine#118)', () => {
  function packConfig(overrides = {}) {
    const { services: _dropped, ...withoutServices } = baseConfig();
    return { ...withoutServices, contentPack: 'pressure-washing', ...overrides };
  }

  it('every palette preset has a matching content pack', async () => {
    const { CONTENT_PACKS, PALETTE_PRESET_IDS } = await import('../../lib/schema/index.mjs');
    expect(Object.keys(CONTENT_PACKS).sort()).toEqual([...PALETTE_PRESET_IDS].sort());
  });

  it('fills services, ctaLabel, and sectionOrder from the pack when a config omits them', () => {
    const config = defineClient(packConfig());
    expect(config.services.length).toBeGreaterThan(0);
    expect(config.copy.ctaLabel).toBe('Get a Free Washing Quote');
    expect(config.layout.sectionOrder).toEqual([
      'services',
      'gallery',
      'reviews',
      'serviceAreaMap',
      'contact',
    ]);
  });

  it('lets an explicit services array override the pack', () => {
    const config = defineClient(
      packConfig({ services: [{ title: 'Roof Washing', description: 'Streak-free rooflines.' }] }),
    );
    expect(config.services).toEqual([
      { title: 'Roof Washing', description: 'Streak-free rooflines.' },
    ]);
  });

  it('lets an explicit ctaLabel override the pack', () => {
    const base = packConfig();
    const config = defineClient({ ...base, copy: { ...base.copy, ctaLabel: 'Book Now' } });
    expect(config.copy.ctaLabel).toBe('Book Now');
  });

  it('throws a readable error for an unknown contentPack', () => {
    expect(() => defineClient(packConfig({ contentPack: 'roofing' }))).toThrow(
      /Unknown contentPack "roofing"/,
    );
  });

  it('still requires services when no contentPack is given (unchanged behavior)', () => {
    const { services: _dropped, ...withoutServices } = baseConfig();
    expect(() => defineClient(withoutServices)).toThrow();
  });
});

describe('leadToConfig (site-engine#122)', () => {
  const ROLLING_SUDS = {
    name: 'Rolling Suds of Seattle',
    slug: 'rolling-suds-of-seattle',
    category: 'Pressure washing service',
    city: 'Seattle',
    region: 'WA',
    phone: '(206) 555-0142',
    email: 'info@rollingsudsseattle.com',
    hours: [
      { days: 'Mon–Fri', hours: '8:00 AM – 5:00 PM' },
      { days: 'Sat', hours: '9:00 AM – 1:00 PM' },
    ],
    serviceArea: ['Seattle, WA', 'Bellevue, WA', 'Redmond, WA'],
  };

  it('maps a fully-populated lead to a valid config', async () => {
    const { leadToConfig } = await import('../../lib/schema/index.mjs');
    const { config, todos } = leadToConfig(ROLLING_SUDS);

    expect(config.slug).toBe('rolling-suds-of-seattle');
    expect(config.business.phone).toBe('(206) 555-0142');
    expect(config.business.serviceAreas).toEqual(['Seattle, WA', 'Bellevue, WA', 'Redmond, WA']);
    expect(config.brand.palettePreset).toBe('pressure-washing');
    expect(config.services.length).toBeGreaterThan(0);
    expect(config.layout.sectionOrder).toEqual(['services', 'serviceAreaMap', 'contact']);
    expect(config.seo.siteUrl).toBe('https://rolling-suds-of-seattle.example');

    // known facts present -> no stub todos for them
    expect(todos.some((t) => t.includes('business.phone'))).toBe(false);
    // never supplied by a lead row -> always flagged
    expect(todos.some((t) => t.includes('form.accessKey'))).toBe(true);
    expect(todos.some((t) => t.includes('no photos yet'))).toBe(true);
    expect(todos.some((t) => t.includes('no reviews yet'))).toBe(true);
  });

  it('never fabricates a missing phone/email/hours — stubs them and flags a todo', async () => {
    const { leadToConfig } = await import('../../lib/schema/index.mjs');
    const { config, todos } = leadToConfig({
      name: 'Clearwater Exteriors',
      slug: 'clearwater-exteriors',
      category: 'Power washing',
      city: 'Tacoma',
      region: 'WA',
    });

    expect(config.business.phone).toBe('(555) 010-0000');
    expect(config.business.email).toBe('hello@clearwater-exteriors.example');
    expect(config.business.hours).toEqual([{ days: 'Mon–Sun', hours: 'Call for hours' }]);
    expect(config.business.serviceAreas).toEqual(['Tacoma, WA']);

    expect(todos).toContain(
      'business.phone is missing — using a placeholder, replace before going live',
    );
    expect(todos).toContain(
      'business.email is missing — using a placeholder, replace before going live',
    );
  });

  it('flags an unmapped category and defaults to the beachhead trade', async () => {
    const { leadToConfig } = await import('../../lib/schema/index.mjs');
    const { config, todos } = leadToConfig({ ...ROLLING_SUDS, category: 'Widget assembly' });
    expect(config.brand.palettePreset).toBe('pressure-washing');
    expect(todos.some((t) => t.includes('category "Widget assembly" didn\'t match a known trade'))).toBe(
      true,
    );
  });

  it('maps every shipped trade from a realistic category string', async () => {
    const { mapCategoryToTrade, PALETTE_PRESET_IDS } = await import('../../lib/schema/index.mjs');
    const samples = {
      landscaping: 'Landscaper',
      'junk-removal': 'Junk removal service',
      'pressure-washing': 'Pressure washing service',
      'concrete-fencing': 'Fence contractor',
    };
    for (const trade of PALETTE_PRESET_IDS) {
      expect(mapCategoryToTrade(samples[trade])).toEqual({ trade, matched: true });
    }
  });
});
