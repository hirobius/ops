// @vitest-environment node
/**
 * tests/agent/manual-generate.test.ts — the no-API generation path.
 *
 * A Claude Code session authors the content JSON (it runs on the Max
 * subscription, so no metered ANTHROPIC_API_KEY call happens), and this module
 * runs it through the SAME gates the API pipeline uses: the palette checks from
 * ops#188, assemble() from #186/#188/#191/#196, and defineClient.
 *
 * The point of the tests is that skipping the API must NOT skip the gates.
 */
import { describe, it, expect } from 'vitest';
import { buildFromContent } from '../../lib/agent/manual-generate.mjs';
import { PALETTE_PRESETS } from '../../lib/schema/presets.mjs';

const LEAD = {
  name: 'Violet Verge Landscaping',
  category: 'landscaping',
  city: 'Austin',
  region: 'TX',
  phone: '+1-512-555-0142',
  email: 'hi@violetverge.com',
};

const GOOD_PALETTE = {
  primary: '#7b2d8e',
  accent: '#e0a800',
  bg: '#fdfcff',
  fg: '#1a121d',
  muted: '#efe7f2',
  onPrimary: '#ffffff',
};

const CONTENT = {
  palettePreset: 'landscaping',
  palette: GOOD_PALETTE,
  heroVariant: 'split-card',
  sectionOrder: ['services', 'reviews', 'gallery', 'serviceAreaMap', 'contact'],
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

describe('buildFromContent', () => {
  it('produces a validated config and the render artifacts', () => {
    const r = buildFromContent(LEAD, CONTENT);
    expect(r.ok).toBe(true);
    expect(r.notes).toEqual([]);
    expect(r.config?.slug).toBe('violet-verge-landscaping');
    expect(r.artifacts?.configFile).toContain('defineClient');
    expect(r.artifacts?.commands).toContain('pnpm new-client');
  });

  it('carries the chosen palette through to cssVarOverrides', () => {
    const r = buildFromContent(LEAD, CONTENT);
    expect(r.config?.brand.cssVarOverrides['--brand-primary']).toBe('#7b2d8e');
  });

  it('carries the chosen hero variant and section order through', () => {
    const r = buildFromContent(LEAD, CONTENT);
    expect(r.config?.layout.sections.hero.variant).toBe('split-card');
    expect(r.config?.layout.sectionOrder[1]).toBe('reviews');
  });

  // The gates must still bite without the API loop behind them.
  it('rejects a stock preset palette, same as the API repair loop would', () => {
    const p = PALETTE_PRESETS.landscaping;
    const lazy = {
      primary: p['--brand-primary'],
      accent: p['--brand-accent'],
      bg: p['--brand-bg'],
      fg: p['--brand-fg'],
      muted: p['--brand-muted'],
      onPrimary: p['--brand-on-primary'],
    };
    const r = buildFromContent(LEAD, { ...CONTENT, palette: lazy });
    expect(r.ok).toBe(false);
    expect(r.notes.join('\n')).toMatch(/landscaping/);
    expect(r.config).toBeUndefined();
  });

  it('rejects a sub-4.5:1 contrast pair', () => {
    const r = buildFromContent(LEAD, {
      ...CONTENT,
      palette: { ...GOOD_PALETTE, fg: '#cccccc', bg: '#ffffff' },
    });
    expect(r.ok).toBe(false);
    expect(r.notes.join('\n')).toMatch(/fg\/bg/);
  });

  it('rejects content the agent schema would have rejected (video hero)', () => {
    const r = buildFromContent(LEAD, { ...CONTENT, heroVariant: 'video' });
    expect(r.ok).toBe(false);
    expect(r.notes.join('\n')).toMatch(/heroVariant/);
  });

  it('rejects a duplicate sectionOrder', () => {
    const r = buildFromContent(LEAD, {
      ...CONTENT,
      sectionOrder: ['services', 'services', 'reviews', 'gallery', 'contact'],
    });
    expect(r.ok).toBe(false);
    expect(r.notes.join('\n')).toMatch(/sectionOrder/);
  });

  it('reports defineClient failures as readable notes rather than throwing', () => {
    const r = buildFromContent(LEAD, { ...CONTENT, services: [] });
    expect(r.ok).toBe(false);
    expect(r.notes.length).toBeGreaterThan(0);
  });

  it('passes photos through to the hero, gallery and download block', () => {
    const photos = [1, 2].map((id) => ({
      id,
      url: `https://images.pexels.com/photos/${id}/x.jpg?w=1600`,
      path: `/photos/stock-pexels-${id}.jpg`,
      alt: 'A tidy green lawn — stock photo',
      source: 'pexels',
      photographer: 'Jane Doe',
    }));
    const r = buildFromContent({ ...LEAD, photos }, CONTENT);
    expect(r.config?.hero.image).toBe('/photos/stock-pexels-1.jpg');
    expect(r.artifacts?.commands).toContain('public/photos/stock-pexels-2.jpg');
  });

  it('never invents a phone or email — absent stays a visible placeholder', () => {
    const r = buildFromContent({ name: 'X Co', city: 'Austin', region: 'TX' }, CONTENT);
    // The fleet-standard placeholder (site-engine lead-to-config.ts): legal under
    // the 10-digit NANP phone rule, yet never dialable (its exchange starts with 0).
    expect(r.ok).toBe(true);
    expect(r.config?.business.phone).toBe('(555) 010-0000');
    expect(r.notes.join('\n')).toMatch(/placeholder/i);
  });
});
