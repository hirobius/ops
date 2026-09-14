// @vitest-environment node
/**
 * tests/photos/assemble-photos.test.ts — ops#196.
 *
 * assemble() must consume BOTH shapes of lead.photos: the legacy plain strings
 * (#186) and the provenance objects this issue introduces
 * ({ url, path, alt, source, photographer }). The first photo becomes the hero,
 * the rest the gallery.
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
  palette: {
    primary: '#7b2d8e', accent: '#e0a800', bg: '#fdfcff',
    fg: '#1a121d', muted: '#efe7f2', onPrimary: '#ffffff',
  },
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

const stock = (id: number) => ({
  id,
  url: `https://images.pexels.com/photos/${id}/x.jpg?w=1600`,
  path: `/photos/stock-pexels-${id}.jpg`,
  alt: `A tidy green lawn — stock photo`,
  source: 'pexels',
  photographer: 'Jane Doe',
});

describe('assemble() + photo provenance objects', () => {
  it('uses the first photo as the hero image', () => {
    const config = defineClient(assemble({ ...LEAD, photos: [stock(1), stock(2)] }, CONTENT));
    expect(config.hero.image).toBe('/photos/stock-pexels-1.jpg');
  });

  it('puts the remaining photos in the gallery, preserving their alt text', () => {
    const config = defineClient(
      assemble({ ...LEAD, photos: [stock(1), stock(2), stock(3)] }, CONTENT),
    );
    expect(config.gallery).toEqual([
      { src: '/photos/stock-pexels-2.jpg', alt: 'A tidy green lawn — stock photo' },
      { src: '/photos/stock-pexels-3.jpg', alt: 'A tidy green lawn — stock photo' },
    ]);
  });

  it('keeps the stock disclosure in gallery alt text — the fabrication ban', () => {
    const config = defineClient(assemble({ ...LEAD, photos: [stock(1), stock(2)] }, CONTENT));
    for (const g of config.gallery) expect(g.alt).toMatch(/stock photo/i);
  });

  it('still accepts legacy plain-string photos (#186 shape)', () => {
    const config = defineClient(
      assemble({ ...LEAD, photos: ['/photos/real-1.jpg', '/photos/real-2.jpg'] }, CONTENT),
    );
    expect(config.hero.image).toBe('/photos/real-1.jpg');
    expect(config.gallery).toEqual([
      { src: '/photos/real-2.jpg', alt: 'Violet Verge Landscaping photo' },
    ]);
  });

  it('drops remote URLs in either shape — publicPath would reject them', () => {
    const config = defineClient(
      assemble(
        {
          ...LEAD,
          photos: [
            'https://example.com/remote.jpg',
            { ...stock(9), path: 'https://example.com/also-remote.jpg' },
            stock(4),
          ],
        },
        CONTENT,
      ),
    );
    expect(config.hero.image).toBe('/photos/stock-pexels-4.jpg');
    expect(config.gallery).toEqual([]);
  });

  it('emits no hero image and an empty gallery when the lead has no photos', () => {
    const config = defineClient(assemble(LEAD, CONTENT));
    expect(config.hero.image).toBeUndefined();
    expect(config.gallery).toEqual([]);
  });

  it('validates through defineClient with a full hero + 4-photo gallery', () => {
    const photos = [1, 2, 3, 4, 5].map(stock);
    const config = defineClient(assemble({ ...LEAD, photos }, CONTENT));
    expect(config.hero.image).toBe('/photos/stock-pexels-1.jpg');
    expect(config.gallery).toHaveLength(4);
  });
});
