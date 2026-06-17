#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * scripts/scaffold-tenant.mjs
 *
 * Bootstraps a new HDS tenant directory from tenants/_template.
 * Emits tenants/<slug>/tokens.json + tenants/<slug>/metadata.json +
 * tenants/<slug>/README.md pre-filled with the supplied brand args.
 *
 *   node scripts/scaffold-tenant.mjs --slug=acme-co --primary-color=#2563EB
 *   pnpm scaffold:tenant --slug=acme-co --primary-color=#2563EB
 *   pnpm scaffold:tenant --slug=acme-co --primary-color=#2563EB --dry-run
 *
 * After the scaffold completes, follow the next-steps printed to stdout
 * (or consult docs/operations/tenant-onboarding.md for the full runbook).
 *
 * Options
 *   --slug=<kebab-case>        Required. Directory name + data-tenant attribute.
 *   --primary-color=<#hex>     Required. 6-digit hex for semantic.accent.rest.
 *   --display-name=<string>    Optional. Human brand name (defaults to title-case slug).
 *   --tier=<1|2|3>             Optional. 1=brand, 2=e-commerce, 3=product (default 1).
 *   --dry-run                  Print planned writes without touching disk.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const TENANTS_DIR = path.join(ROOT, 'tenants');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function usage() {
  console.error('Usage: pnpm scaffold:tenant --slug=<kebab-case> --primary-color=<#hex> [options]');
  console.error('  --slug           Required. Lowercase kebab-case (e.g. acme-co).');
  console.error('  --primary-color  Required. 6-digit hex (e.g. #2563EB).');
  console.error('  --display-name   Optional. Human brand name.');
  console.error('  --tier           Optional. 1=brand, 2=ecom, 3=product (default 1).');
  console.error('  --dry-run        Print planned writes without touching disk.');
}

/** Parse --key=value and --flag args from process.argv */
function parseArgs(argv) {
  const args = argv.slice(2);
  const flags = {};
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      flags[key] = rest.length ? rest.join('=') : true;
    }
  }
  return flags;
}

function validateSlug(slug) {
  if (!slug) return '--slug is required';
  if (!/^[a-z][a-z0-9-]*$/.test(slug)) return '--slug must be lowercase kebab-case (e.g. acme-co)';
  if (slug === '_template') return '--slug cannot be "_template"';
  return null;
}

function validateHex(hex) {
  if (!hex) return '--primary-color is required';
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return '--primary-color must be a 6-digit hex (e.g. #2563EB)';
  return null;
}

/** Derive a hover shade (~15% darker) from a hex by reducing each channel. */
function darken(hex, factor = 0.85) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const d = (c) => Math.round(c * factor).toString(16).padStart(2, '0');
  return `#${d(r)}${d(g)}${d(b)}`;
}

/** Derive a pressed shade (~30% darker). */
function pressed(hex) {
  return darken(hex, 0.70);
}

/** Derive a subtle tint (mix toward white). */
function tint(hex, factor = 0.92) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const t = (c) => Math.round(c + (255 - c) * factor).toString(16).padStart(2, '0');
  return `#${t(r)}${t(g)}${t(b)}`;
}

/** Convert kebab-case to Title Case display name */
function toDisplayName(slug) {
  return slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Build the tokens.json overlay for the new tenant. */
function buildTokens(slug, hex) {
  const hoverHex = darken(hex);
  const pressedHex = pressed(hex);
  const subtleHex = tint(hex);

  return {
    $schema: '../../hirobius.tokens.schema.json',
    $description: `${slug} brand token overlay. Overrides semantic.accent.* with tenant primary color. Run \`pnpm tokens\` to compile. See docs/operations/tenant-onboarding.md for full workflow.`,
    semantic: {
      accent: {
        $type: 'color',
        rest: {
          $value: hex,
          $description: `${slug} primary accent — rest state.`,
          $extensions: {
            'com.figma.variables': {
              modes: { Light: hex, Dark: hoverHex },
            },
          },
        },
        hover: {
          $value: hoverHex,
          $description: `${slug} primary accent — hover state (auto-derived; refine if needed).`,
          $extensions: {
            'com.figma.variables': {
              modes: { Light: hoverHex, Dark: hex },
            },
          },
        },
        pressed: {
          $value: pressedHex,
          $description: `${slug} primary accent — pressed state (auto-derived; refine if needed).`,
          $extensions: {
            'com.figma.variables': {
              modes: { Light: pressedHex, Dark: hoverHex },
            },
          },
        },
        subtle: {
          $value: subtleHex,
          $description: `${slug} accent tint — hover halos and surface accents (auto-derived).`,
          $extensions: {
            'com.figma.variables': {
              modes: { Light: subtleHex, Dark: pressedHex },
            },
          },
        },
        content: {
          $value: hoverHex,
          $description: `${slug} accent text color — links and accent labels (auto-derived).`,
          $extensions: {
            'com.figma.variables': {
              modes: { Light: hoverHex, Dark: hex },
            },
          },
        },
      },
      color: {
        $type: 'color',
        surface: {
          accent: {
            $value: hex,
            $description: `${slug} accent surface fill — CTAs, primary buttons (auto-derived).`,
            $extensions: {
              'com.figma.variables': {
                modes: { Light: hex, Dark: hex },
              },
            },
          },
          accentSubtle: {
            $value: subtleHex,
            $description: `${slug} faint accent tint surface (auto-derived).`,
            $extensions: {
              'com.figma.variables': {
                modes: { Light: subtleHex, Dark: pressedHex },
              },
            },
          },
        },
        border: {
          accent: {
            $value: hex,
            $description: `${slug} accent border and focus ring (auto-derived).`,
            $extensions: {
              'com.figma.variables': {
                modes: { Light: hex, Dark: hoverHex },
              },
            },
          },
        },
      },
    },
  };
}

/** Build the metadata.json for the new tenant. */
function buildMetadata(slug, displayName, tier, hex) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    $schema: '../../hirobius.tenant-metadata.schema.json',
    slug,
    displayName,
    tagline: `${displayName} — scaffolded by scaffold-tenant.mjs on ${today}. Update this tagline.`,
    tier: Number(tier),
    deployment: {
      vercelProject: null,
      primaryDomain: null,
      previewDomain: null,
    },
    brand: {
      primaryHex: hex,
      accentName: 'brand-accent',
      logoPath: null,
    },
    legal: {
      entity: null,
      jurisdiction: null,
      stripeAccountKind: tier >= 2 ? 'platform-checkout' : null,
    },
    createdAt: today,
    status: 'scaffold',
    _notes: [
      `Scaffolded with: pnpm scaffold:tenant --slug=${slug} --primary-color=${hex} --tier=${tier}`,
      'Set vercelProject, primaryDomain once the Vercel project is created.',
      'Fill legal.entity + jurisdiction before going live (required for tier >= 2).',
      'Brand hexes in tokens.json are auto-derived from --primary-color; refine hover/pressed/subtle before production.',
    ],
  };
}

/** Build the per-tenant README.md. */
function buildReadme(slug, displayName, hex, tier) {
  return `# ${displayName} Tenant

Hirobius Design System tenant overlay for **${displayName}**.

## Quick reference

| Key | Value |
|---|---|
| Slug | \`${slug}\` |
| Tier | ${tier} (${tier === 1 ? 'brand presence' : tier === 2 ? 'e-commerce' : 'product'}) |
| Primary hex | \`${hex}\` |
| Token overlay | \`tokens.json\` |
| Metadata | \`metadata.json\` |

## Finishing setup

1. Open \`metadata.json\` and fill \`deployment.vercelProject\`, \`deployment.primaryDomain\`,
   and \`legal.*\` fields.
2. Open \`tokens.json\` and refine hover / pressed / subtle shades
   (auto-derived defaults are safe but rarely perfect).
3. Run \`pnpm tokens\` from the repo root to compile the CSS overlay.
4. Verify: \`rg 'data-tenant="${slug}"' src/styles/tokens.css\`
5. Set \`<html data-tenant="${slug}">\` in the tenant's SSR entry point.
6. Follow the full runbook at \`docs/operations/tenant-onboarding.md\`.

## Token override scope

This overlay targets **semantic tier and above only**:
- \`semantic.*\` — color roles, typography, motion, spacing
- \`component.*\` — component-specific slots (add as needed)

Do NOT override \`primitive.*\`. See
\`docs/architecture/tenant-token-overlay-format.md\` for the rationale.
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const flags = parseArgs(process.argv);
  const dryRun = Boolean(flags['dry-run']);

  const slugErr = validateSlug(flags.slug);
  if (slugErr) {
    console.error('Error:', slugErr);
    usage();
    process.exit(1);
  }

  const hexErr = validateHex(flags['primary-color']);
  if (hexErr) {
    console.error('Error:', hexErr);
    usage();
    process.exit(1);
  }

  const slug = flags.slug;
  const primaryHex = flags['primary-color'].toUpperCase().replace(/^([^#])/, '#$1');
  const tier = Number(flags.tier ?? 1);
  if (![1, 2, 3].includes(tier)) {
    console.error('Error: --tier must be 1, 2, or 3');
    process.exit(1);
  }
  const displayName = flags['display-name'] ?? toDisplayName(slug);

  const tenantDir = path.join(TENANTS_DIR, slug);

  if (!dryRun && fs.existsSync(tenantDir)) {
    console.error(`Error: tenants/${slug} already exists. Remove it first or choose a different slug.`);
    process.exit(1);
  }

  const tokensPath = path.join(tenantDir, 'tokens.json');
  const metadataPath = path.join(tenantDir, 'metadata.json');
  const readmePath = path.join(tenantDir, 'README.md');

  const tokensContent = JSON.stringify(buildTokens(slug, primaryHex), null, 2) + '\n';
  const metadataContent = JSON.stringify(buildMetadata(slug, displayName, tier, primaryHex), null, 2) + '\n';
  const readmeContent = buildReadme(slug, displayName, primaryHex, tier);

  if (dryRun) {
    console.log('[dry-run] would create directory:', `tenants/${slug}/`);
    console.log('[dry-run] would write:', `tenants/${slug}/tokens.json`, `(${tokensContent.length} bytes)`);
    console.log('[dry-run] would write:', `tenants/${slug}/metadata.json`, `(${metadataContent.length} bytes)`);
    console.log('[dry-run] would write:', `tenants/${slug}/README.md`, `(${readmeContent.length} bytes)`);
    console.log('[dry-run] primary-color:', primaryHex);
    console.log('[dry-run] hover (auto):', darken(primaryHex));
    console.log('[dry-run] pressed (auto):', pressed(primaryHex));
    console.log('[dry-run] subtle tint (auto):', tint(primaryHex));
    return;
  }

  fs.mkdirSync(tenantDir, { recursive: true });
  fs.writeFileSync(tokensPath, tokensContent);
  fs.writeFileSync(metadataPath, metadataContent);
  fs.writeFileSync(readmePath, readmeContent);

  console.log(`\nScaffolded tenant: ${slug}`);
  console.log('  tokens.json  →', tokensPath);
  console.log('  metadata.json →', metadataPath);
  console.log('  README.md    →', readmePath);
  console.log('\nNext steps:');
  console.log('  1. Edit tenants/' + slug + '/tokens.json  — refine hover/pressed/subtle shades');
  console.log('  2. Edit tenants/' + slug + '/metadata.json — fill deployment + legal fields');
  console.log('  3. Run: pnpm tokens');
  console.log('  4. Verify: rg \'data-tenant="' + slug + '"\' src/styles/tokens.css');
  console.log('  5. Set <html data-tenant="' + slug + '"> in the tenant SSR entry point');
  console.log('  6. Deploy via Vercel project for this tenant');
  console.log('\nFull runbook: docs/operations/tenant-onboarding.md');
}

main();
