/**
 * lib/schema/index.mjs — BrandSchema.motion (re-synced from site-engine#40).
 *
 * Guards the vendored copy against the canonical schema: `motion` accepts
 * none/subtle/rich, defaults to "rich" when omitted, and rejects bad values.
 */

import { describe, it, expect } from 'vitest';
import { defineClient } from '../../lib/schema/index.mjs';

function baseConfig(brandOverrides = {}) {
  return {
    slug: 'pressure-pros',
    business: {
      name: 'Pressure Pros',
      phone: '(555) 555-5555',
      email: 'owner@pressurepros.example',
      hours: [{ days: 'Mon–Fri', hours: '8:00 AM – 6:00 PM' }],
      serviceAreas: ['Springfield'],
    },
    brand: { palettePreset: 'pressure-washing', ...brandOverrides },
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
  };
}

describe('BrandSchema.motion', () => {
  it('defaults to "rich" when omitted', () => {
    const config = defineClient(baseConfig());
    expect(config.brand.motion).toBe('rich');
  });

  it('accepts "none" and "subtle"', () => {
    expect(defineClient(baseConfig({ motion: 'none' })).brand.motion).toBe('none');
    expect(defineClient(baseConfig({ motion: 'subtle' })).brand.motion).toBe('subtle');
  });

  it('rejects an unknown motion value', () => {
    expect(() => defineClient(baseConfig({ motion: 'extreme' }))).toThrow(/motion/);
  });
});
