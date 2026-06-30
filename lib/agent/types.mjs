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
export const GeneratedContentSchema = z.object({
  palettePreset: z.enum(PALETTE_PRESET_IDS),
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
