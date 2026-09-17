// @vitest-environment node
/**
 * tests/agent/render-css-var-overrides.test.ts — ops#188.
 *
 * The free palette is only real if it survives the hand-off. `assemble()` may
 * map a palette onto `brand.cssVarOverrides` perfectly and it still ships stock
 * colours if `configFileSource` drops the block on the way into the emitted
 * `client.config.ts` — the file a human actually pastes into the clients repo.
 *
 * Uses the real vendored schema, no mocks: renderArtifacts round-trips through
 * defineClient, so this also proves the override keys pass the schema's
 * `^--brand-[a-z-]+$` regex.
 */
import { describe, it, expect } from 'vitest';
import { renderArtifacts } from '../../lib/render/index.mjs';
import { toCssVarOverrides } from '../../lib/agent/palette.mjs';

const PALETTE = {
  primary: '#7b2d8e',
  accent: '#e0a800',
  bg: '#fdfcff',
  fg: '#1a121d',
  muted: '#efe7f2',
  onPrimary: '#ffffff',
};

/** Minimal valid ClientConfig; defaults fill the rest via defineClient. */
const base = {
  slug: 'violet-verge',
  business: {
    name: 'Violet Verge Landscaping',
    phone: '+1-512-555-0142',
    email: 'hi@violetverge.com',
    hours: [{ days: 'Mon–Fri', hours: '8–6' }],
    serviceAreas: ['Austin'],
  },
  layout: {},
  services: [{ title: 'Lawn care', description: 'We mow lawns.' }],
  copy: {
    heroHeadline: 'Austin Landscaping',
    heroSub: 'Green all year.',
    about: 'Local & insured.',
  },
  form: { provider: 'web3forms', accessKey: 'abc123' },
  seo: {
    title: 'Landscaping in Austin',
    description: 'Top-rated landscaping.',
    city: 'Austin',
    region: 'TX',
    siteUrl: 'https://violetverge.com',
  },
};

describe('configFileSource + brand.cssVarOverrides', () => {
  it('serializes every override into the emitted client.config.ts', () => {
    const overrides = toCssVarOverrides(PALETTE);
    const { configFile } = renderArtifacts({
      ...base,
      brand: { palettePreset: 'landscaping', cssVarOverrides: overrides },
    });

    for (const [key, hex] of Object.entries(overrides)) {
      expect(configFile).toContain(key);
      expect(configFile).toContain(hex);
    }
  });

  it('keeps the preset alongside the overrides (fallback/scaffold stays)', () => {
    const { configFile, preset } = renderArtifacts({
      ...base,
      brand: { palettePreset: 'landscaping', cssVarOverrides: toCssVarOverrides(PALETTE) },
    });
    expect(preset).toBe('landscaping');
    expect(configFile).toContain('palettePreset');
  });

  it('round-trips through defineClient — the override keys pass the schema regex', () => {
    expect(() =>
      renderArtifacts({
        ...base,
        brand: { palettePreset: 'landscaping', cssVarOverrides: toCssVarOverrides(PALETTE) },
      }),
    ).not.toThrow();
  });

  it('emits an empty overrides block when the agent supplied none (today’s behaviour)', () => {
    const { configFile } = renderArtifacts({ ...base, brand: { palettePreset: 'landscaping' } });
    expect(configFile).toContain('palettePreset');
    expect(configFile).not.toContain('--brand-primary');
  });
});
