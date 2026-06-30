/**
 * lib/schema — the ClientConfig contract (vendored).
 *
 * Vendored from hirobius/clients `packages/schema/src/index.ts` — the single
 * source of truth for a client site. The agent emits a ClientConfig; the Astro
 * factory consumes it. ops keeps this copy so the engine can validate locally;
 * re-sync on contract change, don't fork the meaning. Ported .ts → .mjs
 * (zod schemas + defineClient kept; compile-time type exports dropped).
 *
 * A site that needs something this schema can't express is, by policy, a custom
 * engagement, not a config tweak. Resist adding free-form "html" escape hatches.
 */
import { z } from 'zod';
import { PALETTE_PRESET_IDS, FONT_IDS } from './presets.mjs';

// ── Primitives ─────────────────────────────────────────────────────────────

/** E.164-ish phone. Stored canonical; the template builds the `tel:` href. */
const phone = z
  .string()
  .trim()
  .min(7, 'phone looks too short')
  .regex(/^[+]?[\d().\-\s]+$/, 'phone has invalid characters');

const hexColor = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'must be a hex color like #1a2b3c');

/** A relative path under the app's `public/` dir, e.g. `/photos/hero.jpg`. */
const publicPath = z
  .string()
  .startsWith('/', 'must be an absolute path under public/, e.g. /photos/x.jpg');

// ── Sections ───────────────────────────────────────────────────────────────

export const BusinessHoursSchema = z.object({
  days: z.string().min(1),
  hours: z.string().min(1),
});

export const BusinessSchema = z.object({
  name: z.string().min(1),
  phone,
  email: z.string().email(),
  address: z.string().optional(),
  hours: z.array(BusinessHoursSchema).min(1, 'list at least one hours row'),
  serviceAreas: z.array(z.string().min(1)).min(1),
});

export const BrandSchema = z.object({
  palettePreset: z.enum(PALETTE_PRESET_IDS),
  cssVarOverrides: z.record(z.string().regex(/^--brand-[a-z-]+$/), hexColor).default({}),
  font: z.enum(FONT_IDS).default('system'),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('md'),
});

export const LayoutSchema = z.object({
  variant: z.enum(['A', 'B']).default('A'),
  sectionOrder: z
    .array(z.enum(['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact']))
    .default(['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact']),
});

export const ServiceSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().optional(),
  image: publicPath.optional(),
});

export const ReviewSchema = z.object({
  author: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().min(1),
  source: z.string().optional(),
});

export const GalleryPhotoSchema = z.object({
  src: publicPath,
  alt: z.string().min(1, 'alt text is required for SEO and a11y'),
});

export const CopySchema = z.object({
  heroHeadline: z.string().min(1),
  heroSub: z.string().min(1),
  ctaLabel: z.string().min(1).default('Get a Free Quote'),
  about: z.string().min(1),
});

export const FormSchema = z.object({
  provider: z.literal('web3forms'),
  accessKey: z.string().min(1),
  hcaptchaSiteKey: z.string().optional(),
  redirectUrl: z.string().url().optional(),
});

export const SeoSchema = z.object({
  title: z.string().min(1).max(70, 'title should stay under ~70 chars'),
  description: z.string().min(1).max(180, 'description should stay under ~180 chars'),
  city: z.string().min(1),
  region: z.string().min(1),
  siteUrl: z.string().url(),
  ogImage: publicPath.optional(),
});

export const HeroSchema = z.object({
  image: publicPath.optional(),
  videoSrc: publicPath.optional(),
  videoPoster: publicPath.optional(),
});

export const MapSchema = z.object({
  staticImage: publicPath.optional(),
  embedQuery: z.string().optional(),
});

// ── Root schema ──────────────────────────────────────────────────────────────

export const ClientConfigSchema = z.object({
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case, e.g. pressure-pros'),
  business: BusinessSchema,
  brand: BrandSchema,
  layout: LayoutSchema,
  hero: HeroSchema.default({}),
  services: z.array(ServiceSchema).min(1),
  copy: CopySchema,
  gallery: z.array(GalleryPhotoSchema).default([]),
  reviews: z.array(ReviewSchema).default([]),
  map: MapSchema.default({}),
  form: FormSchema,
  seo: SeoSchema,
});

/**
 * Validate and normalize a client config. Throws a readable error on invalid
 * config so the build (and CI / Vercel build) fails loudly rather than shipping
 * a broken site.
 * @param {unknown} config
 * @returns {object} the validated, normalized ClientConfig
 */
export function defineClient(config) {
  const result = ClientConfigSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid client config${config?.slug ? ` for "${config.slug}"` : ''}:\n${issues}`,
    );
  }
  return result.data;
}

export * from './presets.mjs';
