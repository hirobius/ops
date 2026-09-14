/**
 * lib/agent/generate — Stage 2: generation with a validate/repair loop.
 *
 * Vendored from hirobius/clients `packages/agent/src/generate.ts`, ported .ts →
 * .mjs. The model emits structured content; we assemble + run `defineClient`
 * (Zod). On validation failure we feed the exact errors back and let the model
 * fix them — the same build-time schema gate the whole site factory uses.
 */
import { defineClient } from '../schema/index.mjs';
import { checkPalette, toCssVarOverrides } from './palette.mjs';
import { MODELS, callStructuredTool } from './llm.mjs';
import { GENERATED_CONTENT_SCHEMA } from './schemas.mjs';
import { GeneratedContentSchema } from './types.mjs';

const SYSTEM = `You write conversion-focused copy for local service businesses and assemble it into a structured site config. Rules:
- Headlines name the service AND the city. Copy is concrete, not generic filler.
- Never fabricate phone numbers, reviews, or facts not present in the lead.
- Respect SEO limits: title <= 70 chars, description <= 180 chars.
- Choose the palette preset and font that fit the trade.
- Derive a DISTINCTIVE six-colour palette from this specific business — its trade, name and locale.
  Echoing a stock preset's colours is a failure: every site would look alike, which is the problem
  the palette exists to solve. Keep primary/onPrimary, fg/bg and fg/muted each at or above WCAG AA
  4.5:1, or the site build gate rejects the config.`;

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'client'
  );
}

const STUB_HOURS = [
  { days: 'Mon–Fri', hours: '8:00 AM – 6:00 PM' },
  { days: 'Sat', hours: '9:00 AM – 2:00 PM' },
  { days: 'Sun', hours: 'Closed' },
];

/** `{ mon_fri: '...' }` / `{ Monday: '...' }` → `[{ days: 'Mon–Fri', hours: '...' }]`. */
function formatHours(hours) {
  return Object.entries(hours).map(([key, text]) => ({
    days: key
      .split(/[_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('–'),
    hours: text,
  }));
}

/** Assemble generated content + the raw lead into a full ClientConfig input. */
export function assemble(lead, content) {
  const hasHours = lead.hours && Object.keys(lead.hours).length > 0;
  return {
    slug: slugify(lead.name),
    business: {
      name: lead.name,
      phone: lead.phone ?? '(000) 000-0000',
      email: lead.email ?? 'owner@example.com',
      address: lead.streetAddress ?? undefined,
      hours: hasHours ? formatHours(lead.hours) : STUB_HOURS,
      serviceAreas: content.serviceAreas,
    },
    brand: {
      palettePreset: content.palettePreset,
      font: content.font,
      radius: 'lg',
      // The free-palette surface (ops#188): cssVarOverrides is merged over the
      // preset by resolvePalette(), so the preset stays as fallback/scaffold.
      // Omitted entirely when the agent emitted no palette — a config without
      // overrides is valid and simply uses the preset.
      ...(content.palette ? { cssVarOverrides: toCssVarOverrides(content.palette) } : {}),
    },
    layout: {
      variant: 'A',
      sectionOrder: ['services', 'gallery', 'reviews', 'serviceAreaMap', 'contact'],
    },
    services: content.services,
    copy: {
      heroHeadline: content.heroHeadline,
      heroSub: content.heroSub,
      ctaLabel: content.ctaLabel,
      about: content.about,
    },
    // Never remote photo URLs — defineClient's publicPath rejects anything not
    // under the app's public/ dir. A local path only exists once a (future)
    // download step has produced one; until then this is always empty.
    gallery: (lead.photos ?? [])
      .filter((src) => typeof src === 'string' && src.startsWith('/'))
      .map((src) => ({ src, alt: `${lead.name} photo` })),
    reviews: content.reviews,
    map: {
      embedQuery: lead.streetAddress
        ? `${lead.streetAddress}, ${lead.city}, ${lead.region}`
        : `${lead.city}, ${lead.region}`,
    },
    form: { provider: 'web3forms', accessKey: 'REPLACE_WITH_WEB3FORMS_ACCESS_KEY' },
    seo: {
      title: content.seoTitle,
      description: content.seoDescription,
      city: lead.city,
      region: lead.region,
      siteUrl: `https://${slugify(lead.name)}.example`,
    },
  };
}

/**
 * @param {import('./types.mjs').Lead} lead
 * @param {import('./types.mjs').Brief} brief
 * @param {{ maxAttempts?: number, feedback?: string }} [opts]
 * @returns {Promise<{ config: object, content: import('./types.mjs').GeneratedContent, attempts: number }>}
 */
export async function generate(lead, brief, opts = {}) {
  const maxAttempts = opts.maxAttempts ?? 3;
  let repairNote = opts.feedback ?? '';

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const user = [
      `Lead:\n${JSON.stringify(lead, null, 2)}`,
      `Brief:\n${JSON.stringify(brief, null, 2)}`,
      repairNote ? `Fix these problems from the previous attempt:\n${repairNote}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const raw = await callStructuredTool({
      model: MODELS.strong,
      system: SYSTEM,
      user,
      toolName: 'record_site_content',
      toolDescription: 'Record the site content for this business.',
      inputSchema: GENERATED_CONTENT_SCHEMA,
      maxTokens: 4096,
      cacheSystem: true,
    });

    const parsed = GeneratedContentSchema.safeParse(raw);
    if (!parsed.success) {
      repairNote = parsed.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n');
      continue;
    }

    // Pre-render palette gate (ops#188): a lazy or inaccessible palette is a
    // generation failure, caught here rather than at the site-engine build gate
    // where it would cost a failed client build instead of a regeneration.
    const palette = checkPalette(parsed.data.palette);
    if (!palette.ok) {
      repairNote = palette.note;
      continue;
    }

    try {
      const config = defineClient(assemble(lead, parsed.data));
      return { config, content: parsed.data, attempts: attempt };
    } catch (err) {
      // defineClient throws a human-readable list of Zod issues — feed it back.
      repairNote = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(
    `generate: config did not validate after ${maxAttempts} attempts.\nLast errors:\n${repairNote}`,
  );
}
