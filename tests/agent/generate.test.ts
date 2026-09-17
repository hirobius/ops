// @vitest-environment node
/**
 * lib/agent/generate.mjs `assemble()` — pure lead+content → ClientConfig-input
 * mapping, tested directly (no LLM call). Covers #186: real `hours` /
 * `streetAddress` flow through; their absence leaves today's stubs unchanged.
 */
import { describe, it, expect } from 'vitest';
import { assemble } from '../../lib/agent/generate.mjs';
import { defineClient } from '../../lib/schema/index.mjs';

const CONTENT = {
  palettePreset: 'landscaping',
  font: 'system',
  heroHeadline: 'Austin Roofing Done Right',
  heroSub: 'Local, reliable, fast.',
  ctaLabel: 'Get a Free Quote',
  about: 'We serve Austin with pride.',
  serviceAreas: ['Austin, TX'],
  services: [{ title: 'Roof repair', description: 'Fast, reliable roof repair.' }],
  reviews: [],
  seoTitle: 'Austin Roofing | Roof Repair',
  seoDescription: 'Austin Roofing offers fast, reliable roof repair in Austin, TX.',
};

const BASE_LEAD = {
  name: 'Acme Roofing',
  category: 'roofing',
  city: 'Austin',
  region: 'TX',
  phone: '+1-512-555-1000',
  email: 'owner@acmeroofing.com',
  photos: [],
};

describe('assemble', () => {
  it('yields a config with real hours + street address when the lead has them', () => {
    const lead = {
      ...BASE_LEAD,
      hours: { Monday: '9 AM–5 PM', Tuesday: '9 AM–5 PM' },
      streetAddress: '123 Main St',
    };
    const config = defineClient(assemble(lead, CONTENT));

    expect(config.business.hours).toEqual([
      { days: 'Monday', hours: '9 AM–5 PM' },
      { days: 'Tuesday', hours: '9 AM–5 PM' },
    ]);
    expect(config.business.address).toBe('123 Main St');
    expect(config.map.embedQuery).toBe('123 Main St, Austin, TX');
  });

  it("keeps today's stubs when hours + street address are absent", () => {
    const config = defineClient(assemble(BASE_LEAD, CONTENT));

    expect(config.business.hours).toEqual([
      { days: 'Mon–Fri', hours: '8:00 AM – 6:00 PM' },
      { days: 'Sat', hours: '9:00 AM – 2:00 PM' },
      { days: 'Sun', hours: 'Closed' },
    ]);
    expect(config.business.address).toBeUndefined();
    expect(config.map.embedQuery).toBe('Austin, TX');
  });

  // ops#196 changed where local photos land: the FIRST becomes the hero image
  // and the rest become the gallery. The assertion that matters here — a remote
  // URL never reaches the config in either slot — is unchanged and now covers
  // both, since publicPath would reject it wherever it surfaced.
  it('never emits remote photo URLs into hero or gallery, only local public/ paths', () => {
    const lead = {
      ...BASE_LEAD,
      photos: ['https://example.com/a.jpg', '/photos/local.jpg', '/photos/local-2.jpg'],
    };
    const config = defineClient(assemble(lead, CONTENT));

    expect(config.hero.image).toBe('/photos/local.jpg');
    expect(config.gallery).toEqual([{ src: '/photos/local-2.jpg', alt: 'Acme Roofing photo' }]);
    expect(JSON.stringify(config)).not.toContain('example.com');
  });

  it('leaves the hero and gallery empty when no photos are present', () => {
    const config = defineClient(assemble(BASE_LEAD, CONTENT));
    expect(config.hero.image).toBeUndefined();
    expect(config.gallery).toEqual([]);
  });
});
