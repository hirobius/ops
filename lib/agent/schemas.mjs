/**
 * lib/agent/schemas — JSON Schemas for the forced-tool-use calls.
 *
 * Vendored from hirobius/clients `packages/agent/src/schemas.ts`, ported .ts →
 * .mjs. Hand-written (not generated) so the shape the model sees is explicit.
 * Zod (in types.mjs) is the real validation contract; these shape the model's
 * output toward it.
 */
import { PALETTE_PRESET_IDS, FONT_IDS } from '../schema/index.mjs';

export const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: '2-3 sentence summary of the business.' },
    suggestedPreset: { type: 'string', enum: [...PALETTE_PRESET_IDS] },
    suggestedFont: { type: 'string', enum: [...FONT_IDS] },
    likelyServices: { type: 'array', items: { type: 'string' }, description: '3-6 likely services.' },
    trustSignals: {
      type: 'array',
      items: { type: 'string' },
      description: "e.g. 'family-owned', '10+ yrs', high rating.",
    },
    toneNotes: { type: 'string', description: 'Voice guidance for the copy.' },
  },
  required: ['summary', 'suggestedPreset', 'suggestedFont', 'likelyServices', 'trustSignals', 'toneNotes'],
};

export const GENERATED_CONTENT_SCHEMA = {
  type: 'object',
  properties: {
    palettePreset: { type: 'string', enum: [...PALETTE_PRESET_IDS] },
    font: { type: 'string', enum: [...FONT_IDS] },
    heroHeadline: { type: 'string', description: 'Names the service AND the place. <= 60 chars.' },
    heroSub: { type: 'string', description: 'One sentence on the promise.' },
    ctaLabel: { type: 'string', description: "e.g. 'Get a Free Quote'." },
    about: { type: 'string', description: 'Short paragraph; why locals trust them. No invented facts.' },
    serviceAreas: { type: 'array', items: { type: 'string' }, minItems: 1 },
    services: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string', description: 'One sentence.' },
        },
        required: ['title', 'description'],
      },
    },
    reviews: {
      type: 'array',
      description: "Only include reviews grounded in the lead's data; otherwise leave empty.",
      items: {
        type: 'object',
        properties: {
          author: { type: 'string' },
          rating: { type: 'integer', minimum: 1, maximum: 5 },
          text: { type: 'string' },
          source: { type: 'string' },
        },
        required: ['author', 'rating', 'text'],
      },
    },
    seoTitle: { type: 'string', description: '<= 70 chars, includes city.' },
    seoDescription: { type: 'string', description: '<= 180 chars.' },
  },
  required: [
    'palettePreset', 'font', 'heroHeadline', 'heroSub', 'ctaLabel', 'about',
    'serviceAreas', 'services', 'reviews', 'seoTitle', 'seoDescription',
  ],
};

export const JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: {
        copyQuality: { type: 'integer', minimum: 1, maximum: 5 },
        completeness: { type: 'integer', minimum: 1, maximum: 5 },
        localSeo: { type: 'integer', minimum: 1, maximum: 5 },
        toneFit: { type: 'integer', minimum: 1, maximum: 5 },
      },
      required: ['copyQuality', 'completeness', 'localSeo', 'toneFit'],
    },
    overall: { type: 'number', minimum: 1, maximum: 5 },
    pass: { type: 'boolean', description: 'true only if overall >= 4 and no score < 3.' },
    notes: { type: 'string', description: 'Specific, actionable critique for a regeneration pass.' },
  },
  required: ['scores', 'overall', 'pass', 'notes'],
};
