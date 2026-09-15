// @vitest-environment node
/**
 * tests/agent/assemble-palette.test.ts — ops#188.
 *
 * assemble() maps the agent's six-hex palette onto brand.cssVarOverrides —
 * the sanctioned free-palette surface (no new namespace, no site-engine schema
 * change). It must also stay total when the agent emits no palette: a config
 * without overrides is valid and falls back to the preset.
 */
import { describe, it, expect } from 'vitest';
import { assemble } from '../../lib/agent/generate.mjs';
import { defineClient } from '../../lib/schema/index.mjs';

const LEAD = {
  name: 'Violet Verge Landscaping',
  category: 'landscaping',
  city: 'Austin',
  region: 'TX',
  phone: '+1-555-0142',
  email: 'hi@violetverge.com',
};

const CONTENT = {
  palettePreset: 'landscaping',
  font: 'system',
  heroHeadline: 'Austin Landscaping',
  heroSub: 'Green all year.',
  ctaLabel: 'Get a Free Quote',
  about: 'Local and insured.',
  serviceAreas: ['Austin'],
  services: [{ title: 'Lawn care', description: 'We mow lawns.' }],
  reviews: [],
  seoTitle: 'Landscaping in Austin',
  seoDescription: 'Top-rated landscaping in Austin.',
};

const PALETTE = {
  primary: '#7b2d8e',
  accent: '#e0a800',
  bg: '#fdfcff',
  fg: '#1a121d',
  muted: '#efe7f2',
  onPrimary: '#ffffff',
};

describe('assemble() + palette', () => {
  it('maps the six hexes onto brand.cssVarOverrides', () => {
    const config = defineClient(assemble(LEAD, { ...CONTENT, palette: PALETTE }));
    expect(config.brand.cssVarOverrides).toEqual({
      '--brand-primary': '#7b2d8e',
      '--brand-accent': '#e0a800',
      '--brand-bg': '#fdfcff',
      '--brand-fg': '#1a121d',
      '--brand-muted': '#efe7f2',
      '--brand-on-primary': '#ffffff',
    });
  });

  it('keeps the preset alongside the overrides', () => {
    const config = defineClient(assemble(LEAD, { ...CONTENT, palette: PALETTE }));
    expect(config.brand.palettePreset).toBe('landscaping');
  });

  it('emits no overrides when the agent supplied no palette', () => {
    const config = defineClient(assemble(LEAD, CONTENT));
    expect(config.brand.cssVarOverrides).toEqual({});
  });

  it('still validates through defineClient with overrides present', () => {
    expect(() => defineClient(assemble(LEAD, { ...CONTENT, palette: PALETTE }))).not.toThrow();
  });
});
