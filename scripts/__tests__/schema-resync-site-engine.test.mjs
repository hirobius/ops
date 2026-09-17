/**
 * lib/schema/index.mjs — re-sync against site-engine `packages/schema/src/index.ts` (ops#310).
 *
 * `check-schema-drift` compares ENUM VALUE SETS only (see lib/schema/drift.mjs),
 * so every drift below slipped past it: a refinement, a tightened primitive, and
 * the site-engine#87 trust/conversion fields. Each one was a config ops accepted
 * and site-engine would reject at the client build — or a field ops silently
 * stripped. Cases are ported from site-engine's own `index.test.ts` so the two
 * copies are held to the same examples.
 */

import { describe, it, expect } from 'vitest';
import { defineClient } from '../../lib/schema/index.mjs';

/** site-engine index.test.ts BASE_INPUT, verbatim. */
const BASE_INPUT = {
  slug: 'acme-co',
  business: {
    name: 'Real Business Co',
    phone: '(509) 838-4200',
    email: 'hello@realbusinessco.com',
    hours: [{ days: 'Mon–Fri', hours: '8:00 AM – 6:00 PM' }],
    serviceAreas: ['Spokane'],
  },
  brand: { palettePreset: 'pressure-washing' },
  layout: { sectionOrder: ['services', 'contact'] },
  services: [{ title: 'Washing', description: 'We wash things.' }],
  copy: {
    heroHeadline: 'Headline',
    heroSub: 'Sub',
    about: 'About us.',
  },
  form: { provider: 'web3forms', accessKey: 'real-web3forms-key-123' },
  seo: {
    title: 'Real Business Co | Spokane',
    description: "Spokane's real business.",
    city: 'Spokane',
    region: 'WA',
    siteUrl: 'https://realbusinessco.com',
  },
};

const config = (overrides = {}) => ({ ...BASE_INPUT, ...overrides });
const withBusiness = (fields) => config({ business: { ...BASE_INPUT.business, ...fields } });

describe('layout.sectionOrder — duplicate rejection (the ops#310 drift)', () => {
  it('rejects duplicate section ids with a readable message', () => {
    expect(() =>
      defineClient(config({ layout: { sectionOrder: ['services', 'services'] } })),
    ).toThrow(/duplicate section id "services"/);
  });

  it('points the issue at the index of the repeat, not the whole array', () => {
    expect(() =>
      defineClient(
        config({
          layout: { sectionOrder: ['services', 'reviews', 'gallery', 'reviews', 'contact'] },
        }),
      ),
    ).toThrow(/layout\.sectionOrder\.3: duplicate section id "reviews"/);
  });

  it('still accepts a valid subset and order', () => {
    const result = defineClient(config({ layout: { sectionOrder: ['contact', 'services'] } }));
    expect(result.layout.sectionOrder).toEqual(['contact', 'services']);
  });

  it('still defaults to the full section order when omitted', () => {
    const result = defineClient(config({ layout: {} }));
    expect(result.layout.sectionOrder).toEqual([
      'services',
      'gallery',
      'reviews',
      'serviceAreaMap',
      'contact',
    ]);
  });

  it('still rejects unknown section ids', () => {
    expect(() =>
      defineClient(config({ layout: { sectionOrder: ['services', 'not-a-real-section'] } })),
    ).toThrow();
  });
});

describe('business.phone — 10-digit NANP (was: any 7+ chars)', () => {
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
      expect(() => defineClient(withBusiness({ phone: bad })), bad).toThrow();
    }
  });

  it('rejects the old 8-digit "+1-555-0142" shape the vendored copy used to accept', () => {
    expect(() => defineClient(withBusiness({ phone: '+1-555-0142' }))).toThrow(
      /10-digit US\/Canada number/,
    );
  });

  it('accepts common phone formats', () => {
    for (const good of ['(509) 838-4200', '+1 509-838-4200', '5098384200']) {
      expect(() => defineClient(withBusiness({ phone: good })), good).not.toThrow();
    }
  });

  it("accepts the fleet's intentional 555 placeholder numbers", () => {
    for (const placeholder of [
      '(555) 010-0000',
      '(512) 555-0142',
      '(509) 555-0100',
      '(555) 010-3302',
      '(555) 010-2201',
      '(555) 010-4403',
    ]) {
      expect(() => defineClient(withBusiness({ phone: placeholder })), placeholder).not.toThrow();
    }
  });
});

describe('business.gbpUrl (site-engine#87)', () => {
  it('is unset by default', () => {
    expect(defineClient(config()).business.gbpUrl).toBeUndefined();
  });

  it('accepts a valid Google Business Profile URL', () => {
    const result = defineClient(withBusiness({ gbpUrl: 'https://g.page/realbusinessco' }));
    expect(result.business.gbpUrl).toBe('https://g.page/realbusinessco');
  });

  it('rejects a non-URL value', () => {
    expect(() => defineClient(withBusiness({ gbpUrl: 'not-a-url' }))).toThrow();
  });
});

describe('business.licensed/insured/bonded/licenseNumber (site-engine#87)', () => {
  it('are unset by default (never a fabricated false)', () => {
    const { business } = defineClient(config());
    expect(business.licensed).toBeUndefined();
    expect(business.insured).toBeUndefined();
    expect(business.bonded).toBeUndefined();
    expect(business.licenseNumber).toBeUndefined();
  });

  it('accepts explicit true/false flags and a license number', () => {
    const { business } = defineClient(
      withBusiness({ licensed: true, insured: true, bonded: false, licenseNumber: 'WA-LIC-12345' }),
    );
    expect(business.licensed).toBe(true);
    expect(business.insured).toBe(true);
    expect(business.bonded).toBe(false);
    expect(business.licenseNumber).toBe('WA-LIC-12345');
  });

  it('rejects an empty licenseNumber', () => {
    expect(() => defineClient(withBusiness({ licenseNumber: '' }))).toThrow();
  });
});

describe('social (site-engine#87)', () => {
  it('is unset by default', () => {
    expect(defineClient(config()).social).toBeUndefined();
  });

  it('accepts a partial set of valid platform URLs', () => {
    const social = {
      facebook: 'https://facebook.com/realbusinessco',
      instagram: 'https://instagram.com/realbusinessco',
    };
    expect(defineClient(config({ social })).social).toEqual(social);
  });

  it('accepts every platform the canonical schema lists', () => {
    const social = Object.fromEntries(
      ['facebook', 'instagram', 'linkedin', 'x', 'youtube', 'tiktok', 'yelp', 'nextdoor'].map(
        (p) => [p, `https://${p}.example/realbusinessco`],
      ),
    );
    expect(defineClient(config({ social })).social).toEqual(social);
  });

  it('rejects an invalid URL on any platform', () => {
    expect(() => defineClient(config({ social: { facebook: 'not-a-url' } }))).toThrow();
  });
});

describe('brand.logo / brand.logoAlt (site-engine#87)', () => {
  it('are unset by default', () => {
    const { brand } = defineClient(config());
    expect(brand.logo).toBeUndefined();
    expect(brand.logoAlt).toBeUndefined();
  });

  it('accepts a public-rooted logo path and non-empty alt', () => {
    const { brand } = defineClient(
      config({
        brand: {
          palettePreset: 'pressure-washing',
          logo: '/logo.svg',
          logoAlt: 'Real Business Co logo',
        },
      }),
    );
    expect(brand.logo).toBe('/logo.svg');
    expect(brand.logoAlt).toBe('Real Business Co logo');
  });

  it('rejects a logo path not rooted under public/', () => {
    expect(() =>
      defineClient(config({ brand: { palettePreset: 'pressure-washing', logo: 'logo.svg' } })),
    ).toThrow();
  });

  it('rejects an empty logoAlt', () => {
    expect(() =>
      defineClient(
        config({ brand: { palettePreset: 'pressure-washing', logo: '/logo.svg', logoAlt: '' } }),
      ),
    ).toThrow();
  });
});

describe('hero.imageAlt (site-engine#87)', () => {
  it('is unset by default', () => {
    expect(defineClient(config()).hero.imageAlt).toBeUndefined();
  });

  it('accepts a non-empty value', () => {
    const result = defineClient(
      config({ hero: { image: '/photos/hero.jpg', imageAlt: 'Crew on a job site' } }),
    );
    expect(result.hero.imageAlt).toBe('Crew on a job site');
  });

  it('rejects an empty value', () => {
    expect(() =>
      defineClient(config({ hero: { image: '/photos/hero.jpg', imageAlt: '' } })),
    ).toThrow();
  });

  it('requires imageAlt when image is set', () => {
    expect(() => defineClient(config({ hero: { image: '/photos/hero.jpg' } }))).toThrow(
      /hero\.imageAlt: imageAlt is required when image is set/,
    );
  });

  it('stays valid when both image and imageAlt are omitted', () => {
    expect(() => defineClient(config({ hero: {} }))).not.toThrow();
  });
});

describe('services[].price / services[].imageAlt (site-engine#87)', () => {
  const service = (fields) => ({ title: 'Washing', description: 'We wash things.', ...fields });

  it('are unset by default', () => {
    const [first] = defineClient(config()).services;
    expect(first.price).toBeUndefined();
    expect(first.imageAlt).toBeUndefined();
  });

  it('accepts a free-form price string', () => {
    for (const price of ['$150', '$150–$300', 'Starting at $99', 'Free estimate']) {
      const [first] = defineClient(config({ services: [service({ price })] })).services;
      expect(first.price).toBe(price);
    }
  });

  it('rejects a price over 40 chars', () => {
    expect(() =>
      defineClient(config({ services: [service({ price: 'x'.repeat(41) })] })),
    ).toThrow();
  });

  it('accepts a non-empty imageAlt paired with image', () => {
    const [first] = defineClient(
      config({
        services: [
          service({ image: '/photos/service.jpg', imageAlt: 'Freshly pressure-washed driveway' }),
        ],
      }),
    ).services;
    expect(first.imageAlt).toBe('Freshly pressure-washed driveway');
  });

  it('rejects an empty imageAlt', () => {
    expect(() => defineClient(config({ services: [service({ imageAlt: '' })] }))).toThrow();
  });

  it('requires imageAlt when image is set', () => {
    expect(() =>
      defineClient(config({ services: [service({ image: '/photos/service.jpg' })] })),
    ).toThrow(/services\.0\.imageAlt: imageAlt is required when image is set/);
  });

  it('stays valid when both image and imageAlt are omitted', () => {
    expect(() => defineClient(config({ services: [service({})] }))).not.toThrow();
  });
});

describe('defaults are unchanged by the re-sync', () => {
  it('applies the documented defaults', () => {
    const result = defineClient(config());
    expect(result.brand.font).toBe('system');
    expect(result.brand.fontPairing).toBeUndefined();
    expect(result.brand.radius).toBe('md');
    expect(result.brand.shadow).toBe('soft');
    expect(result.brand.spacingDensity).toBe('comfortable');
    expect(result.brand.cssVarOverrides).toEqual({});
    expect(result.layout.variant).toBe('A');
    expect(result.copy.ctaLabel).toBe('Get a Free Quote');
    expect(result.gallery).toEqual([]);
    expect(result.reviews).toEqual([]);
    expect(result.map).toEqual({});
    expect(result.hero).toEqual({});
  });

  it('throws a readable, slug-tagged error on an invalid config', () => {
    expect(() => defineClient(config({ slug: 'Not Kebab' }))).toThrow(
      /Invalid client config for "Not Kebab"/,
    );
  });
});
