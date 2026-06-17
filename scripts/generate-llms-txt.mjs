#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * generate-llms-txt.mjs
 *
 * Generates the machine-readable HDS system map for AI agents.
 * Source inputs:
 *   - public/hds-manifest.json
 *   - src/app/data/component-api.json
 *   - hirobius.tokens.json (token source of truth; referenced, not inlined)
 *
 * Output:
 *   - public/llms.txt
 *   - llms.txt (repo-root mirror for local tooling)
 */

import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { writeManifest as writeComponentApiManifest } from './generate-component-api.mjs';
import { buildTokenQuickReference } from './build-token-quick-reference.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const manifestPath = join(ROOT, 'public', 'hds-manifest.json');
const componentApiPath = join(ROOT, 'src', 'app', 'data', 'component-api.json');

function phasePercent(criteria = []) {
  if (!criteria.length) return 0;
  const weightedCount = criteria.reduce((sum, item) => {
    if (item.done) return sum + 1;
    if (item.partial) return sum + 0.5;
    return sum;
  }, 0);
  return Math.round((weightedCount / criteria.length) * 100);
}

const tokenRules = [
  'Component inventory: read `public/hds-manifest.json`. Do not duplicate inventories in markdown.',
  'Component prop API: read `src/app/data/component-api.json`. Do not inline prop tables in `llms.txt`.',
  'Token source of truth: read `hirobius.tokens.json` (W3C DTCG). Prefer `semantic.*` and `component.*` tokens over `primitive.*` for product UI.',
  'CSS variables: token path `semantic.color.surface.page` maps to `var(--semantic-color-surface-page)` (see generated token refs).',
  'Docs: use `DESIGN.md` as the default lean visual spec. Load `DESIGN-HANDOFF.md` only on-demand.',
  'Load `TOKEN_GOVERNANCE.md`, `SYSTEMS_REGISTRY.md`, and `BACKLOG.md` only on-demand (when explicitly requested or required by the task).',
  'Read `public/llms.txt` before touching code so AI workflows start from the same system map as humans.',
];

export function generateLlmsTxt() {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  writeComponentApiManifest();
  // Keep as an existence check (and to ensure the generated artifact is present).
  JSON.parse(readFileSync(componentApiPath, 'utf8'));

  const tokensPath = join(ROOT, 'hirobius.tokens.json');
  const quickTokenReference = buildTokenQuickReference(tokensPath);

  const phaseLines = manifest.phases
    .map((phase) => {
      const percent = phasePercent(phase.criteria);
      const criteriaSummary = phase.criteria
        .map((item) => `${item.done ? 'done' : item.partial ? 'partial' : 'todo'}: ${item.label}`)
        .join('; ');
      return `- ${phase.id}. ${phase.label} - ${percent}% - ${phase.description}\n  - Criteria: ${criteriaSummary}`;
    })
    .join('\n');

  const patternLines = Array.isArray(manifest.patternInventory) && manifest.patternInventory.length > 0
    ? manifest.patternInventory.map((name) => `- ${name}`).join('\n')
    : '';
  const patternSection = patternLines
    ? `## Pattern Inventory\n\n${patternLines}\n\n`
    : '';

  const generated = new Date().toISOString();

  const txt = `# Hirobius Design System

Generated: ${generated}
Primary sources: \`public/hds-manifest.json\`, \`src/app/data/component-api.json\`, \`hirobius.tokens.json\`

## System Architecture

- Engine: ${manifest.systemSpecs.engine}
- Icons: ${manifest.systemSpecs.icons}
- Tokens: ${manifest.systemSpecs.tokens}
- Styling: ${manifest.systemSpecs.styling}
- Token pipeline: \`hirobius.tokens.json\` -> \`pnpm tokens\` -> generated CSS vars + generated TS constants
- Docs pipeline: \`public/hds-manifest.json\` + \`src/app/data/component-api.json\` -> reflective docs pages
- AI entrypoint: read \`public/llms.txt\` before editing code

## Phase Snapshot

${phaseLines}

## Component Inventory (Source Of Truth)

This file intentionally does not embed the full component list to avoid duplication and excess context.

- Canonical inventory + metadata: read \`public/hds-manifest.json\`.
- If you see references to \`public/manifest.json\`, treat it as an optional alias; in this repo prefer \`public/hds-manifest.json\`.

## Component API (Source Of Truth)

This file intentionally does not embed prop tables or long-form API docs.

- Detailed prop types, unions, defaults, and descriptions: read \`src/app/data/component-api.json\`.
- Runtime behavior: read the actual component source under \`src/app/components/\` (and associated styles).

## Tokens (Primary Source Of Truth)

- Primary token source of truth: \`hirobius.tokens.json\` (W3C DTCG).
- Prefer \`semantic.*\` and \`component.*\` tokens for product UI. Use \`primitive.*\` only when editing the token system itself.
- CSS variable naming convention: token path \`semantic.color.surface.page\` maps to \`var(--semantic-color-surface-page)\`.

## Quick Token Reference

${quickTokenReference}

## HDS Card Anatomy (mandatory — every property is non-negotiable)

When building any card component or card-like surface, ALL of the following rules apply. There is no creative latitude here — deviation from any property is a bug.

| Property | Required value | Forbidden |
| --- | --- | --- |
| Background | \`var(--semantic-color-surface-raised)\` | Custom colors, gradients, tinted fills, any non-token value |
| Border | \`1px solid var(--semantic-color-border-default)\` | \`box-shadow\` as an elevation substitute |
| Border radius | \`var(--primitive-radius-8)\` (8 px) | 12 px, 16 px, 20 px, \`rounded-full\`, or any other value |
| Padding | \`var(--semantic-space-component-padding)\` or \`<Surface padding="component">\` | Raw pixel values, Tailwind spacing classes, ad hoc insets |
| Shadow | Resting cards: none (\`elevation.flat\`). Interactive lifted state: \`shadow.subtle\` via \`elevation.raised\`. Never reach for shadow values directly — bind via \`var(--semantic-elevation-{role}-shadow)\` | Raw \`box-shadow\` values, \`drop-shadow\`, glow, or any depth effect not bound to a role token |
| Title | \`hds.typeStyles.heading3\` / \`<Text variant="heading3">\` | Any other type style for the primary card heading |
| Subtitle / meta | \`hds.typeStyles.caption\` / \`<Text variant="caption">\` + \`var(--semantic-color-content-secondary)\` | Primary color, body size, or custom color for secondary text |
| Hover (interactive cards only) | \`transform: scale(1.02)\` CSS transform | Background color change, fill swap, border color shift on hover |

**NEVER on any card surface:** gradient backgrounds, glow effects, frosted glass (\`backdrop-filter: blur\`), decorative overlays, gradient borders, colored or tinted card backgrounds, inner shadows, patterned backgrounds, AI-aesthetic shimmer or particle effects. Never reach for shadow values directly — bind to a \`semantic.elevation.*\` role bundle so surface + shadow + border stay coherent.

## Elevation roles

| Surface | Role token | Background | Shadow | Border |
| --- | --- | --- | --- | --- |
| Card / panel resting | \`semantic.elevation.flat\` | \`surface.page\` | none | \`border.subtle\` 1px |
| Card / panel lifted (interactive only) | \`semantic.elevation.raised\` | \`surface.raised\` | \`shadow.subtle\` | none |
| Popover / dropdown / tooltip | \`semantic.elevation.floating\` | \`surface.raised\` | \`shadow.floating\` | none |
| Dialog / sheet / modal | \`semantic.elevation.overlay\` | \`surface.overlay\` | \`shadow.overlay\` | none |

Cards default to \`elevation.flat\`. Popovers/tooltips/dropdowns use \`elevation.floating\`. Dialogs/sheets use \`elevation.overlay\`. Interactive cards lift to \`elevation.raised\` on hover. Never combine \`raised\` with a border — depth is one mechanism (border OR shadow), not both stacked.

## Context Loading Rules (Credit Efficiency)

Default context (load first):

- \`public/llms.txt\`
- \`public/hds-manifest.json\`
- \`src/app/data/component-api.json\`
- \`hirobius.tokens.json\`
- \`DESIGN.md\`

On-demand only (load only if explicitly requested or the task clearly requires it):

- \`DESIGN-HANDOFF.md\`
- \`TOKEN_GOVERNANCE.md\`
- \`SYSTEMS_REGISTRY.md\`
- \`BACKLOG.md\`

${patternSection}## Token Rules

${tokenRules.map((rule) => `- ${rule}`).join('\n')}

## Agent Workflow

1. Read \`public/llms.txt\` and the relevant source files.
2. Check \`public/hds-manifest.json\` for component metadata and phase status.
3. Check \`src/app/data/component-api.json\` for prop names, unions, defaults, and descriptions.
4. Use \`hirobius.tokens.json\` (and generated CSS vars) for styling decisions, never raw hex or ad hoc values.
5. Run \`pnpm tokens:audit\` or \`pnpm build\` after changes that affect docs, tokens, or manifests.

## Key Files

- \`public/hds-manifest.json\` - canonical machine-readable system inventory, metadata, and token snapshot
- \`src/app/data/component-api.json\` - generated prop reference (source of truth for prop docs)
- \`hirobius.tokens.json\` - token source of truth (W3C DTCG)
- \`public/llms.txt\` - machine-readable AI context index
- \`DESIGN.md\` - lean agent-facing visual spec (default)
- \`DESIGN-HANDOFF.md\` - verbose visual language mirror (on-demand only)
`;

  mkdirSync(join(ROOT, 'public'), { recursive: true });
  writeFileSync(join(ROOT, 'public', 'llms.txt'), txt);
  writeFileSync(join(ROOT, 'llms.txt'), txt);

  return txt;
}

export function main() {
  generateLlmsTxt();
  console.log('✓ public/llms.txt');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
