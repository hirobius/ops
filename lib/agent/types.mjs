/**
 * lib/agent/types — zod contracts for the pipeline's inputs/outputs.
 *
 * Vendored from hirobius/clients `packages/agent/src/types.ts`, ported .ts → .mjs
 * (zod schemas kept; `z.infer` type exports dropped — JSDoc typedefs below stand
 * in for documentation).
 *
 * @typedef {import('zod').infer<typeof LeadSchema>} Lead
 * @typedef {import('zod').infer<typeof BriefSchema>} Brief
 * @typedef {import('zod').infer<typeof GeneratedContentSchema>} GeneratedContent
 * @typedef {import('zod').infer<typeof JudgeResultSchema>} JudgeResult
 */
import { z } from 'zod';
import { PALETTE_PRESET_IDS, FONT_IDS } from '../schema/index.mjs';

/** A raw lead — what lead-gen produces, or a hand-typed stub. Pipeline input. */
export const LeadSchema = z.object({
  name: z.string(),
  category: z.string().default('local service business'),
  city: z.string(),
  region: z.string(),
  phone: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  rating: z.number().optional(),
  reviewCount: z.number().optional(),
  notes: z.string().optional(),
  /** Structured opening hours, e.g. `{ Monday: '9 AM–5 PM', ... }`. Sourcing-provided; absent when unknown. */
  hours: z.record(z.string(), z.string()).optional(),
  streetAddress: z.string().optional(),
  /** Only ever local `public/` paths — a remote URL fails `defineClient`'s publicPath check downstream. */
  photos: z.array(z.string()).default([]),
  logoUrl: z.string().optional(),
});

/** Enrichment output — a normalized brief the generator consumes. */
export const BriefSchema = z.object({
  summary: z.string(),
  suggestedPreset: z.enum(PALETTE_PRESET_IDS),
  suggestedFont: z.enum(FONT_IDS),
  likelyServices: z.array(z.string()),
  trustSignals: z.array(z.string()),
  toneNotes: z.string(),
});

/** What the generator must produce — assembled into a full ClientConfig. */
/**
 * The six semantic colours of a generated palette (ops#188). Mapped onto
 * `brand.cssVarOverrides` by assemble(); the preset stays as fallback/scaffold.
 */
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex colour like #1a2b3c');
export const GeneratedPaletteSchema = z.object({
  primary: hex,
  accent: hex,
  bg: hex,
  fg: hex,
  muted: hex,
  onPrimary: hex,
});

/**
 * Section ids the model may order (ops#191). Must be a true permutation: all
 * five, no duplicates. The vendored ClientConfig schema rejects duplicates too
 * since the ops#310 re-sync, but it allows a subset — requiring all five is
 * agent policy, so the length rule stays here (see the drift guard in
 * tests/agent/assemble-layout.test.ts).
 */
const SECTION_IDS = ['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact'];

export const GeneratedContentSchema = z.object({
  palettePreset: z.enum(PALETTE_PRESET_IDS),
  palette: GeneratedPaletteSchema,
  /**
   * 'video' is deliberately excluded though the vendored schema allows it: the
   * agent has no video asset, and the acceptance gate fails an empty video hero.
   */
  heroVariant: z.enum(['classic', 'split-card', 'banner']).optional(),
  sectionOrder: z
    .array(z.enum(SECTION_IDS))
    .length(SECTION_IDS.length)
    .refine((v) => new Set(v).size === v.length, {
      message: 'sectionOrder must be a permutation — no duplicates',
    })
    .optional(),
  font: z.enum(FONT_IDS),
  heroHeadline: z.string(),
  heroSub: z.string(),
  ctaLabel: z.string(),
  about: z.string(),
  serviceAreas: z.array(z.string()).min(1),
  services: z.array(z.object({ title: z.string(), description: z.string() })).min(1),
  reviews: z
    .array(
      z.object({
        author: z.string(),
        rating: z.number().int().min(1).max(5),
        text: z.string(),
        source: z.string().optional(),
      }),
    )
    .default([]),
  seoTitle: z.string(),
  seoDescription: z.string(),
});

/** LLM-as-judge output — the eval scorecard. */
export const JudgeResultSchema = z.object({
  scores: z.object({
    copyQuality: z.number().int().min(1).max(5),
    completeness: z.number().int().min(1).max(5),
    localSeo: z.number().int().min(1).max(5),
    toneFit: z.number().int().min(1).max(5),
  }),
  overall: z.number().min(1).max(5),
  pass: z.boolean(),
  notes: z.string(),
});
