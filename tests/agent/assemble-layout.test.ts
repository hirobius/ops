// @vitest-environment node
/**
 * tests/agent/assemble-layout.test.ts — ops#191.
 *
 * assemble() shipped the `classic` hero on every site and a hardcoded
 * sectionOrder, so the other hero variants were dead weight. The schema freedom
 * already existed in both site-engine's canonical schema and ops's vendored
 * copy — zero schema change needed, the agent just never chose.
 */
import { describe, it, expect } from 'vitest';
import { assemble } from '../../lib/agent/generate.mjs';
import { GeneratedContentSchema } from '../../lib/agent/types.mjs';
import { GENERATED_CONTENT_SCHEMA } from '../../lib/agent/schemas.mjs';
import { defineClient, SECTION_VARIANTS } from '../../lib/schema/index.mjs';

const LEAD = {
  name: 'Violet Verge Landscaping',
  category: 'landscaping',
  city: 'Austin',
  region: 'TX',
  phone: '+1-512-555-0142',
  email: 'hi@violetverge.com',
};

const CONTENT = {
  palettePreset: 'landscaping',
  palette: {
    primary: '#7b2d8e',
    accent: '#e0a800',
    bg: '#fdfcff',
    fg: '#1a121d',
    muted: '#efe7f2',
    onPrimary: '#ffffff',
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

const ALL_SECTIONS = ['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact'];

describe('assemble() + layout', () => {
  it("emits the model's hero variant", () => {
    const config = defineClient(assemble(LEAD, { ...CONTENT, heroVariant: 'split-card' }));
    expect(config.layout.sections.hero.variant).toBe('split-card');
  });

  it("emits the model's sectionOrder instead of the hardcoded array", () => {
    const order = ['reviews', 'services', 'contact', 'gallery', 'serviceAreaMap'];
    const config = defineClient(assemble(LEAD, { ...CONTENT, sectionOrder: order }));
    expect(config.layout.sectionOrder).toEqual(order);
  });

  it('no longer emits the deprecated layout.variant', () => {
    const raw = assemble(LEAD, { ...CONTENT, heroVariant: 'banner', sectionOrder: ALL_SECTIONS });
    expect(raw.layout).not.toHaveProperty('variant');
  });

  it('falls back to schema defaults when the model omits both', () => {
    const config = defineClient(assemble(LEAD, CONTENT));
    expect(config.layout.sectionOrder).toEqual(ALL_SECTIONS);
    expect(config.layout.sections.hero.variant).toBe('classic');
  });

  it.each(['classic', 'split-card', 'banner'])('validates the %s hero variant', (variant) => {
    expect(() => defineClient(assemble(LEAD, { ...CONTENT, heroVariant: variant }))).not.toThrow();
  });
});

describe('the agent schema constrains what the model may choose', () => {
  it("excludes 'video' — the agent has no video asset and the acceptance gate fails an empty video hero", () => {
    const enumValues = GENERATED_CONTENT_SCHEMA.properties.heroVariant.enum;
    expect(enumValues).toEqual(['classic', 'split-card', 'banner']);
    expect(enumValues).not.toContain('video');
    // 'video' is a real variant in the vendored schema — this is a deliberate
    // agent-side narrowing, not an absence.
    expect(SECTION_VARIANTS.hero).toContain('video');
  });

  it("rejects 'video' at the zod layer too, not just in the tool schema", () => {
    const r = GeneratedContentSchema.safeParse({ ...CONTENT, heroVariant: 'video' });
    expect(r.success).toBe(false);
  });

  it('requires sectionOrder to be a true permutation — no duplicates', () => {
    const dupes = ['services', 'services', 'reviews', 'gallery', 'contact'];
    const r = GeneratedContentSchema.safeParse({ ...CONTENT, sectionOrder: dupes });
    expect(r.success).toBe(false);
  });

  it('requires all five sections — no omissions', () => {
    const short = ['services', 'reviews'];
    const r = GeneratedContentSchema.safeParse({ ...CONTENT, sectionOrder: short });
    expect(r.success).toBe(false);
  });

  it('accepts a genuine permutation', () => {
    const r = GeneratedContentSchema.safeParse({
      ...CONTENT,
      heroVariant: 'banner',
      sectionOrder: ['reviews', 'services', 'gallery', 'contact', 'serviceAreaMap'],
    });
    expect(r.success).toBe(true);
  });

  it('constrains the tool schema to a 5-item unique permutation', () => {
    const s = GENERATED_CONTENT_SCHEMA.properties.sectionOrder;
    expect(s.minItems).toBe(5);
    expect(s.maxItems).toBe(5);
    expect(s.uniqueItems).toBe(true);
  });
});

/**
 * Drift guard (ops#191 → resolved by ops#310). ops#191 listed "Zod gate
 * (sectionOrder superRefine dupe rejection)" as a gate that must hold, but the
 * vendored ClientConfig schema had drifted from site-engine's and lacked it — a
 * duplicate-containing sectionOrder passed defineClient here and would only
 * have failed at the site-engine build.
 *
 * ops#310 re-synced lib/schema from site-engine, so the vendored contract now
 * rejects duplicates itself. The agent schema above keeps its stricter
 * exactly-five permutation rule: that is agent policy, not the contract (the
 * contract allows a subset).
 */
describe('vendored schema drift', () => {
  it('vendored defineClient rejects a duplicate sectionOrder (re-synced in ops#310)', () => {
    const cfg = assemble(LEAD, CONTENT);
    cfg.layout.sectionOrder = ['services', 'services', 'reviews', 'gallery', 'contact'];
    expect(() => defineClient(cfg)).toThrow(/duplicate section id "services"/);
  });
});
