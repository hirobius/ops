// @vitest-environment node
/**
 * tests/photos/render-photo-downloads.test.ts — ops#196.
 *
 * A config referencing /photos/stock-pexels-*.jpg is a broken build unless
 * something puts those files under public/. renderArtifacts takes the lead's
 * photo manifest and emits the curl block that does it.
 *
 * The block must match the manifest EXACTLY — only paths the config actually
 * references. A download for an unreferenced photo is wasted bytes in the
 * client repo; a referenced path with no download is a 404 on the live site.
 */
import { describe, it, expect } from 'vitest';
import { renderArtifacts } from '../../lib/render/index.mjs';

const base = {
  slug: 'violet-verge',
  business: {
    name: 'Violet Verge Landscaping',
    phone: '+1-555-0142',
    email: 'hi@violetverge.com',
    hours: [{ days: 'Mon–Fri', hours: '8–6' }],
    serviceAreas: ['Austin'],
  },
  brand: { palettePreset: 'landscaping' },
  layout: {},
  services: [{ title: 'Lawn care', description: 'We mow lawns.' }],
  copy: { heroHeadline: 'Austin Landscaping', heroSub: 'Green all year.', about: 'Local & insured.' },
  form: { provider: 'web3forms', accessKey: 'abc123' },
  seo: {
    title: 'Landscaping in Austin',
    description: 'Top-rated landscaping.',
    city: 'Austin',
    region: 'TX',
    siteUrl: 'https://violetverge.com',
  },
};

const photo = (id: number) => ({
  id,
  url: `https://images.pexels.com/photos/${id}/x.jpg?auto=compress&w=1600`,
  path: `/photos/stock-pexels-${id}.jpg`,
  alt: 'A tidy green lawn — stock photo',
  source: 'pexels',
  photographer: 'Jane Doe',
});

describe('renderArtifacts(config, { photos })', () => {
  it('emits a curl download for each referenced photo', () => {
    const config = {
      ...base,
      hero: { image: '/photos/stock-pexels-1.jpg' },
      gallery: [{ src: '/photos/stock-pexels-2.jpg', alt: 'A tidy green lawn — stock photo' }],
    };
    const { commands } = renderArtifacts(config, { photos: [photo(1), photo(2)] });

    expect(commands).toContain('public/photos/stock-pexels-1.jpg');
    expect(commands).toContain('public/photos/stock-pexels-2.jpg');
    expect(commands).toContain('https://images.pexels.com/photos/1/x.jpg');
  });

  it('skips photos the config does not reference', () => {
    const config = { ...base, hero: { image: '/photos/stock-pexels-1.jpg' }, gallery: [] };
    const { commands } = renderArtifacts(config, { photos: [photo(1), photo(99)] });

    expect(commands).toContain('stock-pexels-1.jpg');
    expect(commands).not.toContain('stock-pexels-99');
  });

  it('emits no download block at all when the config references no photos', () => {
    const { commands } = renderArtifacts({ ...base, gallery: [] }, { photos: [photo(1)] });
    expect(commands).not.toContain('curl');
  });

  it('is unchanged when no photos option is passed (the pre-#196 shape)', () => {
    const a = renderArtifacts({ ...base, gallery: [] }).commands;
    const b = renderArtifacts({ ...base, gallery: [] }, {}).commands;
    expect(a).toBe(b);
    expect(a).not.toContain('curl');
  });

  it('notes the imagery is stock and swappable, without making it a gate', () => {
    const config = { ...base, hero: { image: '/photos/stock-pexels-1.jpg' }, gallery: [] };
    const { commands } = renderArtifacts(config, { photos: [photo(1)] });
    expect(commands).toMatch(/stock imagery/i);
    expect(commands).toMatch(/optional/i);
  });

  it('creates the target directory before downloading into it', () => {
    const config = { ...base, hero: { image: '/photos/stock-pexels-1.jpg' }, gallery: [] };
    const { commands } = renderArtifacts(config, { photos: [photo(1)] });
    expect(commands).toMatch(/mkdir -p public\/photos/);
  });
});
