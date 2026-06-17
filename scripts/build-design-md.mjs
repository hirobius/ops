#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — DESIGN.md Builder
 *
 * Reads DESIGN.source.md (hand-authored template with auto markers),
 * fills the marker blocks from hirobius.tokens.json and public/hds-manifest.json,
 * and writes the assembled result to DESIGN.md at the repo root.
 *
 * DESIGN.md follows the Google Stitch DESIGN.md convention — a lean,
 * agent-facing specification of the visual system. It is complementary to
 * DESIGN-HANDOFF.md, which is the verbose human reference.
 *
 * Sections managed (auto-filled):
 *   colors       — primary + feedback + neutral role summary
 *   typography   — family, weights, type ramp roles
 *   spacing      — base + scale summary
 *   radius       — action / container / full usage table
 *   motion       — duration tiers + easing intents
 *   components   — ~8 visual atoms with radius + states + token refs
 *   build-meta   — generation timestamp + source files
 *
 * Narrative sections (Overview, Elevation, Corner-Radius Policy prose,
 * Do's and Don'ts) live hand-authored in DESIGN.source.md and are copied
 * through unchanged.
 *
 * Reuses helpers exported from build-handoff.mjs to avoid drift:
 *   walk, resolveRef, header, row, replaceSection, escRe.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname }               from 'path';
import { fileURLToPath }               from 'url';

import {
  walk,
  resolveRef,
  header,
  row,
  replaceSection,
} from './build-handoff.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Value helpers ─────────────────────────────────────────────────────────────
/** Resolves a dimension token value to "Npx" / "Nms", or returns the raw string. */
function dim(value) {
  if (value && typeof value === 'object' && 'value' in value && 'unit' in value) {
    return `${value.value}${value.unit}`;
  }
  return String(value ?? '');
}

// ── Section builders ──────────────────────────────────────────────────────────
/**
 * Colors — primary accent, feedback palette, neutral summary. Lean by design;
 * the full semantic table lives in DESIGN-HANDOFF.md.
 */
export function buildColors(raw) {
  const blue    = (raw.primitive?.color?.blue?.['500']?.$value ?? '').toUpperCase();
  const fb      = raw.semantic?.color?.feedback ?? {};
  const red     = resolveRef(fb.error?.$value,   raw);
  const green   = resolveRef(fb.success?.$value, raw);
  const amber   = resolveRef(fb.warning?.$value, raw);
  const info    = resolveRef(fb.info?.$value,    raw);

  const lines = [];
  lines.push('**One accent — one neutral system.**');
  lines.push('');
  lines.push(`- **Primary** (\`${blue}\`): CTAs, active states, selected focus rings, and the single brand accent. \`primitive.color.blue.500\` / \`semantic.accent.rest\`.`);
  lines.push('- **Neutral**: backgrounds, surfaces, borders, text. True monochromatic — `primitive.color.neutral.50` through `950`. Use `semantic.color.surface.*`, `semantic.color.content.*`, `semantic.color.border.*`; never reach directly for primitives in components.');
  lines.push(`- **Feedback — Error** (\`${String(red).toUpperCase()}\`): destructive confirms, error banners, validation failures. \`semantic.color.feedback.error\`.`);
  lines.push(`- **Feedback — Success** (\`${String(green).toUpperCase()}\`): positive confirmations, completed states. \`semantic.color.feedback.success\`.`);
  lines.push(`- **Feedback — Warning** (\`${String(amber).toUpperCase()}\`): cautions, recoverable issues. \`semantic.color.feedback.warning\`.`);
  lines.push(`- **Feedback — Info** (\`${String(info).toUpperCase()}\`): neutral announcements and inline guidance. \`semantic.color.feedback.info\`.`);
  lines.push('');
  lines.push('Feedback hues are never decorative; do not use them as accents. Light and dark mode values are defined per-token in `hirobius.tokens.json`.');
  return lines.join('\n');
}

/**
 * Typography — family + weights + ramp roles. Type values come from the live
 * semantic.typography composites; descriptions trim to the role phrase.
 */
export function buildTypography(raw) {
  const semanticTypography = raw.semantic?.typography ?? {};
  const sizes    = raw.primitive?.typography?.size          ?? {};
  const weights  = raw.primitive?.typography?.weight         ?? {};
  const fontRaw    = raw.primitive?.typography?.family?.primary?.$value;
  const displayRaw = raw.primitive?.typography?.family?.display?.$value;
  const monoRaw    = raw.primitive?.typography?.family?.mono?.$value;
  const family     = (Array.isArray(fontRaw)    ? fontRaw[0]    : fontRaw)    ?? 'Clash Grotesk';
  const displayFam = (Array.isArray(displayRaw) ? displayRaw[0] : displayRaw) ?? 'Clash Display';
  const mono       = (Array.isArray(monoRaw)    ? monoRaw[0]    : monoRaw)    ?? 'Geist Mono';

  const sizeMap   = Object.fromEntries(
    Object.keys(sizes).filter(k => !k.startsWith('$')).map(k => [k, resolveRef(sizes[k].$value, raw)])
  );
  const weightMap = Object.fromEntries(
    Object.keys(weights).filter(k => !k.startsWith('$')).map(k => [k, resolveRef(weights[k].$value, raw)])
  );
  const lookup = (val, map) => {
    if (typeof val !== 'string' || !val.startsWith('{')) return resolveRef(val, raw);
    const key = val.slice(1, -1).split('.').at(-1);
    return map[key] ?? resolveRef(val, raw);
  };

  const collect = (node, path = []) => {
    if (!node || typeof node !== 'object') return [];
    if ('$value' in node) return [{ path, node }];
    return Object.entries(node)
      .filter(([k]) => !k.startsWith('$'))
      .flatMap(([k, v]) => collect(v, [...path, k]));
  };

  const lines = [];
  lines.push(`HDS ships three typefaces — each with a distinct and exclusive role:`);
  lines.push('');
  lines.push(`- **Display / Heading font**: ${displayFam}. Bound exclusively to \`display\`, \`h1\`, \`h2\`, and \`h3\` styles. Never used for body copy or UI labels.`);
  lines.push(`- **Body / UI font**: ${family}. All prose, labels, small text, captions, and UI copy.`);
  lines.push(`- **Mono font**: ${mono}. Reserved for tokens, code, technical callouts, and metric readouts.`);
  lines.push('');
  lines.push('Weights in use: `400` regular, `500` medium, `600` semibold, `700` bold. All heading styles (display · h1 · h2 · h3) use `500` medium. Body, small, and caption use `400` regular.');
  lines.push('');
  lines.push('### Type ramp');
  lines.push('');
  lines.push(header('Role', 'Size (desktop max)', 'Weight', 'Use'));

  for (const { path, node: t } of collect(semanticTypography)) {
    const v    = t?.$value ?? {};
    const raw  = t?.$description ?? '';
    const afterDash = raw.split(' — ')[1];
    const desc = ((afterDash ?? raw).split('.')[0] ?? '').trim();
    const size = lookup(v.fontSize,   sizeMap);
    const wgt  = lookup(v.fontWeight, weightMap);
    lines.push(row(`\`semantic.typography.${path.join('.')}\``, size, wgt, desc || '—'));
  }
  lines.push('');
  lines.push('> Responsive `clamp()` overrides live in `src/styles/theme.css`; tokens store the desktop-max static value.');
  return lines.join('\n');
}

/**
 * Spacing — base + scale summary. Concise by design; the full primitive
 * table lives in DESIGN-HANDOFF.md.
 */
export function buildSpacing(raw) {
  const space = raw.primitive?.space ?? {};
  const base  = resolveRef(space['1']?.$value ?? '4px', raw);
  const keys  = Object.keys(space).filter(k => !k.startsWith('$'));

  const scale = keys
    .map(k => ({ key: k, val: resolveRef(space[k].$value, raw) }))
    .filter(({ val }) => /^\d+px$/.test(val))
    .sort((a, b) => parseInt(a.val, 10) - parseInt(b.val, 10))
    .map(({ key, val }) => `\`${val}\` (\`primitive.space.${key}\`)`)
    .join(' · ');

  const lines = [];
  lines.push(`**Base unit: ${base}.** All spacing snaps to the primitive scale; never introduce half-steps or arbitrary px values.`);
  lines.push('');
  lines.push(`Scale: ${scale}`);
  lines.push('');
  lines.push('Use `primitive.space.*` for layout rhythm, padding, and gaps. Use `semantic.space.*` aliases (e.g. `semantic.space.component-padding`) when the purpose is established. `--hds-space-{xs…4xl}` CSS vars provide comfortable/compact density scaling per `document.documentElement.dataset.density`.');
  return lines.join('\n');
}

/**
 * Radius — tiered usage table. Derives the action/container values from
 * live tokens so the rule narrative in the template stays accurate.
 */
export function buildRadius(raw) {
  const action     = resolveRef(raw.semantic?.radius?.action?.$value ?? '{primitive.radius.4}', raw);
  const container  = resolveRef(raw.primitive?.radius?.[8]?.$value  ?? '8px', raw);
  const full       = resolveRef(raw.primitive?.radius?.full?.$value ?? '9999px', raw);
  const zero       = resolveRef(raw.primitive?.radius?.[0]?.$value  ?? '0px', raw);

  const lines = [header('Tier', 'Value', 'Token', 'Applies to')];
  lines.push(row('Action',    `\`${action}\``,    '`semantic.radius.action`',     'Buttons, inputs, badges, alerts, disclosures, segmented control items'));
  lines.push(row('Container', `\`${container}\``, '`primitive.radius.8`',          'Cards, segmented control surface, modal/sheet containers'));
  lines.push(row('Full',      `\`${full}\``,      '`primitive.radius.full`',       'Pills, avatars, indicator dots, any intentionally circular form'));
  lines.push(row('Zero',      `\`${zero}\``,      '`primitive.radius.0`',          'Outer canvas / substrate boundaries only — never on everyday UI controls'));
  return lines.join('\n');
}

/**
 * Motion — duration tiers + easing intents. Brief, agent-facing.
 */
export function buildMotion(raw) {
  const durations = raw.primitive?.duration ?? {};
  const motions   = raw.semantic?.motion    ?? {};

  const durationUse = {
    instant: 'Immediate dismissals, binary toggles',
    short:   'Productive micro-interactions (default for hover/focus/press)',
    medium:  'Expressive entrances, teaching moments',
    long:    'Spatial movement, page travel, parallax',
  };

  const durLines = [header('Tier', 'Value', 'When to use')];
  for (const { path, value } of walk(durations)) {
    const key = path.at(-1);
    durLines.push(row(`\`primitive.duration.${key}\``, `\`${dim(value)}\``, durationUse[key] ?? ''));
  }

  const intentLines = [header('Intent', 'Duration', 'Purpose')];
  for (const { path, value, desc } of walk(motions)) {
    const duration = resolveRef(value?.duration, raw);
    intentLines.push(row(`\`semantic.motion.${path.join('.')}\``, `\`${duration}\``, desc ?? ''));
  }

  return [
    'Motion (lift on hover, parallax) is the interaction-affordance layer; static depth comes from the `semantic.elevation.*` role-token bundles.',
    '',
    '### Duration tiers',
    '',
    durLines.join('\n'),
    '',
    '### Semantic intents',
    '',
    intentLines.join('\n'),
    '',
    'Default most interactive feedback to `productive` (150ms, decelerate). Reserve `expressive` (250ms, spring) for teaching moments where the motion itself carries meaning. `spatial` (400ms) is for travel, not decoration.',
  ].join('\n');
}

/**
 * Components — 8 visual atoms covering Google Stitch's DESIGN.md spec:
 * Buttons, Inputs, Cards, Badges, Alerts, Disclosures, Toggles,
 * Segmented Controls. For each: radius source, state model, key tokens.
 *
 * Values are derived from tokens when present; component names are
 * confirmed against public/hds-manifest.json.
 */
export function buildComponents(raw, manifest) {
  const inventory = new Set(manifest?.componentInventory ?? []);
  const present   = name => inventory.has(name);
  const actionRad = resolveRef(raw.semantic?.radius?.action?.$value ?? '{primitive.radius.4}', raw);
  const cardRad   = resolveRef(raw.primitive?.radius?.[8]?.$value ?? '8px', raw);

  const specs = [
    {
      name: 'Buttons',
      component: 'Button',
      radius: `\`${actionRad}\` (\`semantic.radius.action\`)`,
      states: 'default · hover · focus · active · disabled · loading',
      notes: 'Three variants: primary (accent-filled), secondary (outline), tertiary (ghost). Primary uses `semantic.accent.*` ramp per state. Icon buttons (`IconButton`) follow the same token surface.',
    },
    {
      name: 'Inputs',
      component: 'Input',
      radius: `\`${actionRad}\` (\`semantic.radius.action\`)`,
      states: 'default · focus · filled · error · disabled · loading',
      notes: 'Border-driven treatment; no filled background by default. Focus uses `semantic.color.border.accent` plus a 2px outline offset. Error swaps to `component.input.borderError`.',
    },
    {
      name: 'Cards',
      component: 'Card',
      radius: `\`${cardRad}\` (\`primitive.radius.8\`)`,
      states: 'default · hover (optional parallax) · pressed (when interactive)',
      notes: 'Cards default to `elevation.flat` (1px border `border.subtle`, no shadow). Interactive cards lift to `elevation.raised` (shadow.subtle, no border) on hover. Bind via `semantic.elevation.{role}` — never raw box-shadow values. Radius: `var(--primitive-radius-8)` (8 px) — never 12/16/20 px. Padding: `var(--semantic-space-component-padding)`. Title: `heading3`. Meta: `caption` + `var(--semantic-color-content-secondary)`. Hover (interactive): `scale(1.02)` transform + lift to raised. Never: gradients, glow, frosted glass, tinted surfaces, decorative overlays, or inner shadows.',
    },
    {
      name: 'Badges',
      component: 'Badge',
      radius: `\`${actionRad}\` (\`primitive.radius.4\`)`,
      states: 'neutral · accent · feedback (error/success/warning/info)',
      notes: 'Single-line status markers. Feedback colors come from `semantic.color.feedback.*`. Never used as decorative chrome.',
    },
    {
      name: 'Alerts',
      component: 'Alert',
      radius: `\`${actionRad}\` (via \`hds.borderRadius.4\`)`,
      states: 'info · success · warning · error',
      notes: 'Inline banner pattern with icon + message + optional action. Tone is carried by left-border color, not by tinted fills.',
    },
    {
      name: 'Disclosures',
      component: 'Disclosure',
      radius: `\`${actionRad}\` (\`hds.borderRadius.action\`)`,
      states: 'collapsed · expanded · hover · focus',
      notes: 'Accordion primitive. Expansion uses `semantic.motion.productive`; no spring bounce. Dividers follow `semantic.color.border.subtle`.',
    },
    {
      name: 'Toggles',
      component: 'HdsToggle',
      radius: '`full` (pill track + circular thumb)',
      states: 'off · on · focus · disabled',
      notes: 'Accent-filled track in the on state; neutral track otherwise. Track + thumb transitions share `semantic.motion.productive`.',
    },
    {
      name: 'Segmented Control',
      component: 'SegmentedControl',
      radius: `Outer \`${cardRad}\` · inner segments \`${actionRad}\``,
      states: 'rest · hover · selected · disabled',
      notes: 'Selected segment fills with the accent; unselected segments are transparent. Use for 2–5 mutually exclusive options; beyond that, prefer `HdsSelect`.',
    },
  ];

  const lines = [header('Component', 'Radius', 'States', 'Guidance')];
  for (const spec of specs) {
    const name = present(spec.component)
      ? `**${spec.name}** (\`${spec.component}\`)`
      : `**${spec.name}**`;
    lines.push(row(name, spec.radius, spec.states, spec.notes));
  }
  lines.push('');
  lines.push('See `public/hds-manifest.json` and `src/app/data/component-api.json` for the full inventory and prop tables.');
  return lines.join('\n');
}

/**
 * Build metadata — stamps source files and generation date so consumers
 * know whether the doc is fresh.
 */
export function buildMeta(raw) {
  const tokenCount = [...walk(raw)].length;
  const stamp = new Date().toISOString().slice(0, 10);
  return [
    '---',
    '',
    `> Generated ${stamp} from \`hirobius.tokens.json\` (${tokenCount} tokens) and \`public/hds-manifest.json\` by \`scripts/build-design-md.mjs\`.`,
    '> Hand-edit \`DESIGN.source.md\`; this file (\`DESIGN.md\`) is overwritten by \`pnpm tokens\`.',
  ].join('\n');
}

/**
 * Strips the leading source-only HTML comment block from the template
 * and replaces it with a short "this file is generated" notice. The
 * template comment is scoped to editors of DESIGN.source.md; keeping it
 * in DESIGN.md would mislead someone into editing the generated file.
 */
export function stripSourceHeader(doc) {
  const notice = '<!-- GENERATED FILE — DO NOT EDIT. Source: DESIGN.source.md. Regenerate with `pnpm tokens`. -->\n\n';
  return doc.replace(/^<!--[\s\S]*?-->\s*/, notice);
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raw      = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
  const manifest = JSON.parse(readFileSync(join(ROOT, 'public', 'hds-manifest.json'), 'utf8'));
  let   doc      = readFileSync(join(ROOT, 'DESIGN.source.md'), 'utf8');

  doc = replaceSection(doc, 'colors',     buildColors(raw));
  doc = replaceSection(doc, 'typography', buildTypography(raw));
  doc = replaceSection(doc, 'spacing',    buildSpacing(raw));
  doc = replaceSection(doc, 'radius',     buildRadius(raw));
  doc = replaceSection(doc, 'motion',     buildMotion(raw));
  doc = replaceSection(doc, 'components', buildComponents(raw, manifest));
  doc = replaceSection(doc, 'build-meta', buildMeta(raw));
  doc = stripSourceHeader(doc);

  writeFileSync(join(ROOT, 'DESIGN.md'), doc);
  console.log('✓ DESIGN.md generated from DESIGN.source.md + tokens + manifest.');
}
