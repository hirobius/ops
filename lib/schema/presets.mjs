/**
 * lib/schema/presets — trade palette presets + font stacks.
 *
 * Vendored verbatim from hirobius/clients `packages/schema/src/presets.ts`
 * (the canonical ClientConfig contract). Ported .ts → .mjs (type-only exports
 * dropped). Re-sync on contract change; do not fork the meaning.
 *
 * Each preset is a set of semantic brand tokens. Apps map these to Tailwind via
 * `@theme` by way of `--brand-*` CSS custom properties injected at build time
 * from the resolved config. Per-client tweaks belong in `brand.cssVarOverrides`,
 * NOT in new presets — adding a preset is a product decision, overriding a var
 * is a config-only customization.
 */

export const PALETTE_PRESET_IDS = [
  'landscaping',
  'junk-removal',
  'pressure-washing',
  'concrete-fencing',
];

export const PALETTE_PRESETS = {
  landscaping: {
    '--brand-primary': '#2f6f3e',
    '--brand-accent': '#a7c957',
    '--brand-bg': '#f7f8f3',
    '--brand-fg': '#1f2a1c',
    '--brand-muted': '#e7ecdd',
    '--brand-on-primary': '#ffffff',
  },
  'junk-removal': {
    '--brand-primary': '#f26419',
    '--brand-accent': '#ffb703',
    '--brand-bg': '#ffffff',
    '--brand-fg': '#161616',
    '--brand-muted': '#f3f0ec',
    '--brand-on-primary': '#0d0d0d',
  },
  'pressure-washing': {
    '--brand-primary': '#0a6cb5',
    '--brand-accent': '#21d4c4',
    '--brand-bg': '#f4fafd',
    '--brand-fg': '#0b2230',
    '--brand-muted': '#dceef6',
    '--brand-on-primary': '#ffffff',
  },
  'concrete-fencing': {
    '--brand-primary': '#3f4754',
    '--brand-accent': '#c9a227',
    '--brand-bg': '#f2f3f5',
    '--brand-fg': '#1b1f26',
    '--brand-muted': '#e2e4e8',
    '--brand-on-primary': '#ffffff',
  },
};

/** Built-in font stacks keyed by `brand.font`. Self-hostable; no FOUT risk. */
export const FONT_STACKS = {
  system:
    "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif",
  inter:
    "'Inter', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  geist:
    "'Geist', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  'work-sans':
    "'Work Sans', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
  slab: "'Roboto Slab', Georgia, Cambria, 'Times New Roman', serif",
};

export const FONT_IDS = Object.keys(FONT_STACKS);
