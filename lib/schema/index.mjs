/**
 * lib/schema — the ClientConfig contract (vendored).
 *
 * Vendored from hirobius/site-engine `packages/schema/src/index.ts` — the single
 * source of truth for a client site (formerly hirobius/clients). The agent emits
 * a ClientConfig; the Astro factory consumes it. ops keeps this copy so the
 * engine can validate locally; re-sync on contract change, don't fork the
 * meaning. Ported .ts → .mjs (zod schemas + defineClient kept; compile-time type
 * exports dropped).
 *
 * Last full re-sync: ops#310 (2026-09-16), against site-engine `main` @ 9600459.
 * `check-schema-drift` only compares enum value sets, so refinements and new
 * optional fields do NOT trip it — re-diff this whole file on every re-sync.
 *
 * Deliberately NOT vendored (site-engine-side draft helpers, not the contract):
 * - `contentPack` / `design` draft keys and their `applyContentPack` /
 *   `applyDesignSkin` pre-Zod merges (content-packs.ts, skins.ts). Both are
 *   stripped before `ClientConfigSchema` sees the config — site-engine documents
 *   them as leaving the ops drift guard unaffected — and ops's renderer emits the
 *   fully-resolved config, never a draft.
 * - lead-to-config.ts and design-genome.ts: site-engine's own lead→config
 *   mapper and design selector. ops's generation agent (lib/agent) is the ops
 *   counterpart; it produces a resolved ClientConfig input directly.
 *
 * A site that needs something this schema can't express is, by policy, a custom
 * engagement, not a config tweak. Resist adding free-form "html" escape hatches.
 */
import { z } from 'zod';
import { PALETTE_PRESET_IDS, FONT_IDS, FONT_PAIRING_IDS } from './presets.mjs';

// ── Primitives ─────────────────────────────────────────────────────────────

/**
 * E.164-ish phone. Stored canonical; the template builds the `tel:` href.
 * Requires a 10-digit NANP number (optionally `+1`-prefixed) with a valid area
 * code lead digit (2-9) — deliberately does NOT enforce the exchange (NXX)
 * digit, since the fleet's intentional `555-01xx` placeholders use a leading
 * `0` there.
 */
const phone = z
  .string()
  .trim()
  .regex(/^[+]?[\d().\-\s]+$/, 'phone has invalid characters')
  .refine((value) => {
    const digits = value.replace(/\D/g, '');
    const tenDigits = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
    return tenDigits.length === 10 && /^[2-9]/.test(tenDigits);
  }, "phone must be a 10-digit US/Canada number (area code can't start with 0 or 1), optionally prefixed with +1");

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
  /**
   * Full Google Business Profile listing URL (site-engine#87), for a "See us on
   * Google" trust link. Intake-only — never fabricate one.
   */
  gbpUrl: z.string().url().optional(),
  /**
   * Licensed/insured/bonded trust flags (site-engine#87). Deliberately NOT
   * `.default(false)`: a missing value must render as "unknown / not shown",
   * never as an implied "no" — an absent negative claim is still a claim.
   * `licenseNumber` is independent of `licensed` (not cross-validated).
   */
  licensed: z.boolean().optional(),
  insured: z.boolean().optional(),
  bonded: z.boolean().optional(),
  licenseNumber: z.string().min(1).optional(),
});

/**
 * Social profile links, one optional URL per platform (site-engine#87). All
 * optional so a client with two active profiles doesn't pad the rest.
 * Intake-only, never invented.
 */
export const SocialLinksSchema = z.object({
  facebook: z.string().url().optional(),
  instagram: z.string().url().optional(),
  linkedin: z.string().url().optional(),
  x: z.string().url().optional(),
  youtube: z.string().url().optional(),
  tiktok: z.string().url().optional(),
  yelp: z.string().url().optional(),
  nextdoor: z.string().url().optional(),
});

export const BrandSchema = z.object({
  palettePreset: z.enum(PALETTE_PRESET_IDS),
  cssVarOverrides: z.record(z.string().regex(/^--brand-[a-z-]+$/), hexColor).default({}),
  font: z.enum(FONT_IDS).default('system'),
  /**
   * Optional heading/body art direction. When set it WINS over `font` — the
   * non-system pairings load a distinct heading face (Fraunces, Space Grotesk,
   * Archivo), which is the largest per-client visual differentiator the engine
   * offers. Optional, so omitting it reproduces today's output exactly.
   */
  fontPairing: z.enum(FONT_PAIRING_IDS).optional(),
  radius: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('md'),
  /** Shadow character (site-engine #157). `soft` reproduces today's values exactly. */
  shadow: z.enum(['flat', 'soft', 'hard']).default('soft'),
  /** Spacing density (site-engine #86). `comfortable` reproduces today's values exactly. */
  spacingDensity: z.enum(['compact', 'comfortable', 'airy']).default('comfortable'),
  /** Scroll-motion intensity: none | subtle | rich. See site-engine docs/adr/0001-motion-foundation.md. */
  motion: z.enum(['none', 'subtle', 'rich']).default('rich'),
  /**
   * Site logo image (site-engine#87), shown in place of the text wordmark once
   * the template wires it. Schema-only in site-engine for now.
   */
  logo: publicPath.optional(),
  /** Alt text for `logo` — non-empty when present (same posture as gallery alt). */
  logoAlt: z.string().min(1).optional(),
});

/**
 * Section style variants (vendored from site-engine
 * `packages/schema/src/section-variants.ts`). First value = default = the
 * classic design; ids are layout adjectives, never trade names. Closed set —
 * a design that can't be expressed as a variant is a custom engagement.
 */
export const SECTION_VARIANTS = {
  hero: ['classic', 'video', 'split-card', 'banner'],
  services: ['grid', 'cards', 'alternating'],
  gallery: ['grid'],
  reviews: ['cards'],
  serviceAreaMap: ['standard'],
  contact: ['standard'],
};

/** `{ variant }` object for one section, defaulting to the classic design. */
function sectionVariant(id) {
  const values = SECTION_VARIANTS[id];
  return z.object({ variant: z.enum(values).default(values[0]) }).default({});
}

export const LayoutSchema = z.object({
  /**
   * @deprecated Legacy hero variant switch — prefer
   * `layout.sections.hero.variant`; `defineClient()` maps 'B' onto 'video'
   * when no explicit hero variant is set.
   */
  variant: z.enum(['A', 'B']).default('A'),
  /** Per-section style variants (closed enums). Fully defaulted; strict. */
  sections: z
    .object({
      hero: sectionVariant('hero'),
      services: sectionVariant('services'),
      gallery: sectionVariant('gallery'),
      reviews: sectionVariant('reviews'),
      serviceAreaMap: sectionVariant('serviceAreaMap'),
      contact: sectionVariant('contact'),
    })
    .strict()
    .default({}),
  /**
   * Order of sections on the page. Unknown ids are rejected so a typo can't
   * silently drop a section, and so are duplicates. Hero and Footer are always
   * rendered (first/last) and must not appear here. A subset is allowed.
   */
  sectionOrder: z
    .array(z.enum(['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact']))
    .default(['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact'])
    .superRefine((ids, ctx) => {
      const seen = new Set();
      ids.forEach((id, index) => {
        if (seen.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `duplicate section id "${id}" in sectionOrder`,
            path: [index],
          });
        }
        seen.add(id);
      });
    }),
});

export const ServiceSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().min(1),
    icon: z.string().optional(),
    image: publicPath.optional(),
    /** Alt text for `image` — required whenever `image` is set (enforced below). */
    imageAlt: z.string().min(1).optional(),
    /**
     * Per-service display price (site-engine#87). Free-form on purpose — pricing
     * is commonly a range, a qualifier, or a unit. Capped at 40 chars to keep it a
     * label. Intake-only — never invented.
     */
    price: z.string().min(1).max(40).optional(),
  })
  .superRefine((service, ctx) => {
    if (service.image && !service.imageAlt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'imageAlt is required when image is set (accessibility)',
        path: ['imageAlt'],
      });
    }
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

export const HeroSchema = z
  .object({
    image: publicPath.optional(),
    /** Alt text for `image` — required whenever `image` is set (enforced below). */
    imageAlt: z.string().min(1).optional(),
    videoSrc: publicPath.optional(),
    videoPoster: publicPath.optional(),
  })
  .superRefine((hero, ctx) => {
    if (hero.image && !hero.imageAlt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'imageAlt is required when image is set (accessibility)',
        path: ['imageAlt'],
      });
    }
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
  /** Social profile links (site-engine#87). Optional, unset by default. */
  social: SocialLinksSchema.optional(),
});

/**
 * Bridge the deprecated `layout.variant` hero switch onto the variant system:
 * 'B' resolves to `layout.sections.hero.variant = 'video'` unless the config
 * sets an explicit hero variant, which wins. 'A' is the 'classic' default.
 * @param {any} config
 */
function applyLegacyHeroVariant(config) {
  const layout = config?.layout;
  if (!layout || layout.variant !== 'B' || layout.sections?.hero?.variant) {
    return config;
  }
  return {
    ...config,
    layout: {
      ...layout,
      sections: { ...layout.sections, hero: { variant: 'video' } },
    },
  };
}

/**
 * Validate and normalize a client config. Throws a readable error on invalid
 * config so the build (and CI / Vercel build) fails loudly rather than shipping
 * a broken site.
 * @param {unknown} config
 * @returns {object} the validated, normalized ClientConfig
 */
export function defineClient(config) {
  const result = ClientConfigSchema.safeParse(applyLegacyHeroVariant(config));
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
