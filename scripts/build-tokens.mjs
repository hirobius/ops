#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Token Build Script
 *
 * Compiles hirobius.tokens.json (W3C DTCG 2025.10) into:
 *   src/styles/tokens.css                       — CSS custom properties
 *   src/app/design-system/generated-tokens.ts   — TypeScript constants
 *
 * Run: node scripts/build-tokens.mjs
 * No dependencies required — pure Node.js ESM.
 *
 * Pure functions are exported so they can be unit-tested with Vitest.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SYSTEM_MANIFEST = JSON.parse(readFileSync(join(ROOT, 'public', 'hds-manifest.json'), 'utf8'));

// ── Path → CSS var ───────────────────────────────────────────────────────────
/** ['primitive','color','neutral','white'] → '--primitive-color-neutral-white' */
export const pathToCSSVar = (parts) => '--' + parts.join('-');

/** '{primitive.color.neutral.white}' → 'var(--primitive-color-neutral-white)' */
export const aliasToCSSVar = (alias) =>
  `var(${pathToCSSVar(alias.replace(/^\{|\}$/g, '').split('.'))})`;

// ── Alias resolver ───────────────────────────────────────────────────────────
/** Recursively resolves a {ref} alias to its raw $value. */
export function resolveAlias(ref, root, visited = new Set()) {
  if (typeof ref !== 'string' || !ref.startsWith('{')) return ref;
  if (visited.has(ref)) throw new Error(`Circular reference: ${ref}`);
  visited.add(ref);
  const parts = ref.replace(/^\{|\}$/g, '').split('.');
  let node = root;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) throw new Error(`Token not found: ${ref}`);
  }
  if (!('$value' in node)) throw new Error(`Not a leaf token: ${ref}`);
  return resolveAlias(node.$value, root, visited);
}

// ── Value → CSS string ───────────────────────────────────────────────────────
export function colorToCSS(val) {
  if (typeof val === 'string') return val;
  const { components, alpha } = val;
  const [r, g, b] = components.map((c) => Math.round(c * 255));
  return alpha !== undefined && alpha < 1
    ? `rgb(${r} ${g} ${b} / ${alpha})`
    : `rgb(${r} ${g} ${b})`;
}

export function dimensionToCSS({ value, unit }) {
  return `${value}${unit}`;
}

export function durationToCSS({ value, unit }) {
  return `${value}${unit}`;
}

export function cubicBezierToCSS(val) {
  return `cubic-bezier(${val.join(', ')})`;
}

export function fontFamilyToCSS(val) {
  if (!Array.isArray(val)) return String(val);
  return val.map((f) => (f.includes(' ') ? `"${f}"` : f)).join(', ');
}

export function shadowPartToCSS(v) {
  const color = colorToCSS(v.color);
  const ox = dimensionToCSS(v.offsetX);
  const oy = dimensionToCSS(v.offsetY);
  const blur = dimensionToCSS(v.blur);
  const spread = dimensionToCSS(v.spread);
  return `${v.inset ? 'inset ' : ''}${ox} ${oy} ${blur} ${spread} ${color}`;
}

export function shadowToCSS(val) {
  // Pre-composed CSS strings (multi-layer shadows, hsl(var(--shadow-color) / α)
  // tints) bypass the structured-shadow expansion and pass through verbatim.
  if (typeof val === 'string') return val;
  return Array.isArray(val) ? val.map(shadowPartToCSS).join(', ') : shadowPartToCSS(val);
}

// Slot order is the contract: Tailwind/component CSS reads
// var(--semantic-elevation-{level}-{slot}). Surface is required; shadow and
// border may be null and fall back to CSS no-ops so the var is always usable.
export const ELEVATION_SLOTS = ['surface', 'shadow', 'border'];
export const ELEVATION_NULL_FALLBACK = {
  surface: 'transparent',
  shadow: 'none',
  border: 'transparent',
};

export function expandElevation(pathParts, val) {
  const base = pathToCSSVar(pathParts);
  return ELEVATION_SLOTS.map((slot) => {
    const slotVal = val?.[slot];
    let cssValue;
    if (slotVal == null) {
      cssValue = ELEVATION_NULL_FALLBACK[slot];
    } else if (typeof slotVal === 'string' && slotVal.startsWith('{')) {
      cssValue = aliasToCSSVar(slotVal);
    } else {
      cssValue = String(slotVal);
    }
    return { cssVar: `${base}-${slot}`, cssValue };
  });
}

/**
 * Convert a token value to a CSS string.
 * preserveAlias = true  → {ref} becomes var(--...)   [semantic / component tier]
 * preserveAlias = false → {ref} is resolved raw       [primitive tier]
 * root is required when preserveAlias = false and the value is an alias.
 */
export function valueToCSS(val, type, preserveAlias, root = null) {
  if (typeof val === 'string' && val.startsWith('{')) {
    return preserveAlias
      ? aliasToCSSVar(val)
      : valueToCSS(resolveAlias(val, root), type, false, root);
  }
  switch (type) {
    case 'color':
      return colorToCSS(val);
    case 'dimension':
      return dimensionToCSS(val);
    case 'duration':
      return durationToCSS(val);
    case 'cubicBezier':
      return cubicBezierToCSS(val);
    case 'motionEasing':
      if (val && typeof val === 'object' && val.type === 'spring') {
        return `spring(${val.stiffness}, ${val.damping}, ${val.mass})`;
      }
      return cubicBezierToCSS(val);
    case 'spring':
      return `spring(${val.stiffness}, ${val.damping}, ${val.mass})`;
    case 'fontFamily':
      return fontFamilyToCSS(val);
    case 'fontWeight':
      return String(val);
    case 'number':
      return String(val);
    case 'shadow':
      return shadowToCSS(val);
    default:
      return String(val);
  }
}

// ── Tree walker ──────────────────────────────────────────────────────────────
export const DTCG_KEYS = new Set(['$type', '$value', '$description', '$extensions', '$schema']);

/**
 * Generator: walks the token tree yielding leaf token descriptors.
 * Handles group-level $type inheritance (nearest ancestor wins).
 */
export function* walkTokens(node, path = [], inheritedType = null) {
  if (!node || typeof node !== 'object') return;
  const type = node.$type || inheritedType;
  if ('$value' in node) {
    yield {
      path,
      type,
      value: node.$value,
      extensions: node.$extensions,
      description: node.$description,
    };
    return;
  }
  for (const key of Object.keys(node)) {
    if (DTCG_KEYS.has(key)) continue;
    yield* walkTokens(node[key], [...path, key], type);
  }
}

// ── Composite expansion ──────────────────────────────────────────────────────
export const TYPO_PROPS = [
  // CSS var suffixes are kebab-case (more idiomatic in CSS), while the token value
  // keys remain camelCase as defined by the W3C DTCG typography schema.
  ['font-family', 'fontFamily', 'fontFamily'],
  ['font-size', 'fontSize', 'dimension'],
  ['font-weight', 'fontWeight', 'fontWeight'],
  ['letter-spacing', 'letterSpacing', 'dimension'],
  ['line-height', 'lineHeight', 'number'],
  // 10t-5: maxWidth extends the W3C DTCG typography schema with an optional
  // measure constraint (Swiss canon caps body/small/mono at 60ch). Composites
  // that omit maxWidth emit no var line — the suffix is filtered downstream.
  ['max-width', 'maxWidth', 'dimension'],
  // textTransform extends the DTCG schema for the eyebrow composite — bakes
  // uppercase casing into the token so consumers can't apply text-transform
  // ad-hoc. Optional; composites without textTransform emit no var line.
  ['text-transform', 'textTransform', 'string'],
];

// Typography composite keys that are optional. Composites may omit these; the
// emitter skips them silently (no CSS var line, no ref leaf, no var name). All
// other TYPO_PROPS entries are required.
export const TYPO_OPTIONAL_KEYS = new Set(['maxWidth', 'textTransform']);

export const MOTION_PROPS = [
  ['duration', 'duration', 'duration'],
  ['easing', 'easing', 'motionEasing'],
];

export function expandTypography(pathParts, val) {
  const base = pathToCSSVar(pathParts);
  return TYPO_PROPS.filter(([, key]) => !TYPO_OPTIONAL_KEYS.has(key) || val[key] != null).map(
    ([suffix, key, type]) => ({
      cssVar: `${base}-${suffix}`,
      cssValue: valueToCSS(val[key], type, true),
    }),
  );
}

export function expandMotion(pathParts, val) {
  const base = `--hds-motion-${pathParts[2]}`;
  return MOTION_PROPS.map(([suffix, key, type]) => ({
    cssVar: `${base}-${suffix}`,
    cssValue: valueToCSS(val[key], type, true),
  }));
}

export function expandTransition(pathParts, val) {
  const base = pathToCSSVar(pathParts);
  return [
    { cssVar: `${base}-duration`, cssValue: valueToCSS(val.duration, 'duration', true) },
    { cssVar: `${base}-delay`, cssValue: valueToCSS(val.delay, 'duration', true) },
    {
      cssVar: `${base}-timing-function`,
      cssValue: valueToCSS(val.timingFunction, 'cubicBezier', true),
    },
  ];
}

// ── CSS section builder ──────────────────────────────────────────────────────
export function buildCSSSection(tokens, label, root = null) {
  const rootLines = [`\n  /* ── ${label} ${'─'.repeat(Math.max(0, 68 - label.length))} */`];
  const darkLines = [];

  for (const { path, type, value, extensions } of tokens) {
    const cssVar = pathToCSSVar(path);
    const preserveAlias = path[0] !== 'primitive';

    if (type === 'typography') {
      rootLines.push(`  /* ${path.join('.')} */`);
      for (const { cssVar: v, cssValue } of expandTypography(path, value)) {
        if (cssValue != null) rootLines.push(`  ${v}: ${cssValue};`);
      }
    } else if (type === 'motion') {
      rootLines.push(`  /* ${path.join('.')} */`);
      for (const { cssVar: v, cssValue } of expandMotion(path, value)) {
        if (cssValue != null) rootLines.push(`  ${v}: ${cssValue};`);
      }
    } else if (type === 'transition') {
      rootLines.push(`  /* ${path.join('.')} */`);
      for (const { cssVar: v, cssValue } of expandTransition(path, value)) {
        if (cssValue != null) rootLines.push(`  ${v}: ${cssValue};`);
      }
    } else if (type === 'elevation') {
      rootLines.push(`  /* ${path.join('.')} */`);
      for (const { cssVar: v, cssValue } of expandElevation(path, value)) {
        if (cssValue != null) rootLines.push(`  ${v}: ${cssValue};`);
      }
    } else {
      const cssValue = valueToCSS(value, type, preserveAlias, root);
      if (cssValue != null) rootLines.push(`  ${cssVar}: ${cssValue};`);

      const dark = extensions?.['com.figma.variables']?.modes?.Dark;
      if (dark) {
        const dv = valueToCSS(dark, type, true, root);
        if (dv) darkLines.push(`  ${cssVar}: ${dv};`);
      }
    }
  }

  return { rootLines, darkLines };
}

// ── TypeScript tree builder ───────────────────────────────────────────────────
export function buildTSTree(tokens) {
  const root = {};
  for (const { path, type } of tokens) {
    if (type === 'typography' || type === 'transition' || type === 'motion' || type === 'elevation')
      continue;
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (!node[k]) node[k] = {};
      node = node[k];
    }
    node[path.at(-1)] = `var(${pathToCSSVar(path)})`;
  }
  return root;
}

// ── Token refs tree ───────────────────────────────────────────────────────────
/**
 * Builds a nested tree of CSS var reference strings for ALL token types,
 * including typography composites which buildTSTree skips.
 *
 * - Simple tokens → 'var(--css-var)' string leaf
 * - Typography tokens → { fontFamily: 'var(...)', fontSize: 'var(...)', ... } object
 *
 * Used to generate generated-token-refs.ts so tokens.ts never hardcodes var strings.
 */
export function buildTokenRefsTree(tokens) {
  const root = {};
  for (const { path, type, value } of tokens) {
    if (type === 'transition') continue;
    let node = root;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (!node[k]) node[k] = {};
      node = node[k];
    }
    if (type === 'typography') {
      const base = pathToCSSVar(path);
      const obj = {};
      for (const [suffix, key] of TYPO_PROPS) {
        // Optional keys (e.g. maxWidth) only appear in the ref tree when the
        // composite actually defines them. Composites without the key are not
        // expected to read it at runtime.
        if (TYPO_OPTIONAL_KEYS.has(key) && (!value || value[key] == null)) continue;
        obj[key] = `var(${base}-${suffix})`;
      }
      node[path.at(-1)] = obj;
    } else if (type === 'motion') {
      const base = `--hds-motion-${path[2]}`;
      node[path.at(-1)] = {
        duration: `var(${base}-duration)`,
        easing: `var(${base}-easing)`,
      };
    } else if (type === 'elevation') {
      const base = pathToCSSVar(path);
      const obj = {};
      for (const slot of ELEVATION_SLOTS) {
        obj[slot] = `var(${base}-${slot})`;
      }
      node[path.at(-1)] = obj;
    } else {
      node[path.at(-1)] = `var(${pathToCSSVar(path)})`;
    }
  }
  return root;
}

export function serialize(obj, depth = 1) {
  const pad = '  '.repeat(depth);
  const lines = Object.entries(obj).map(([k, v]) => {
    const key = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
    if (typeof v === 'string') return `${pad}${key}: ${JSON.stringify(v)}`;
    return `${pad}${key}: {\n${serialize(v, depth + 1)}\n${pad}}`;
  });
  return lines.join(',\n');
}

// ── Raw values tree ───────────────────────────────────────────────────────────
/**
 * Builds a nested object of raw primitive values suitable for doc-page imports.
 * - fontFamily arrays are kept as arrays so callers can pick [0] for attribution text.
 * - All other types are formatted as their CSS string (same as what ends up in the var).
 * - Alias values ({ref}) are skipped — primitives should have none; if found, they're omitted.
 */
export function buildRawValuesTree(primitiveTokens, root = null) {
  const tree = {};
  for (const { path, type, value } of primitiveTokens) {
    if (type === 'typography' || type === 'transition') continue;
    if (typeof value === 'string' && value.startsWith('{')) continue;
    let node = tree;
    for (let i = 0; i < path.length - 1; i++) {
      const k = path[i];
      if (!node[k]) node[k] = {};
      node = node[k];
    }
    const cssVal = type === 'fontFamily' ? value : valueToCSS(value, type, false, root);
    if (cssVal != null) node[path.at(-1)] = cssVal;
  }
  return tree;
}

export function serializeRaw(obj, depth = 1) {
  const pad = '  '.repeat(depth);
  const lines = Object.entries(obj)
    .map(([k, v]) => {
      const key = /^[a-zA-Z_$][\w$]*$/.test(k) ? k : JSON.stringify(k);
      if (Array.isArray(v)) {
        const items = v.map((i) => JSON.stringify(i)).join(', ');
        return `${pad}${key}: [${items}] as const`;
      }
      if (typeof v === 'string') return `${pad}${key}: ${JSON.stringify(v)}`;
      if (typeof v === 'number') return `${pad}${key}: ${v}`;
      if (typeof v === 'object' && v !== null) {
        return `${pad}${key}: {\n${serializeRaw(v, depth + 1)}\n${pad}}`;
      }
      return null;
    })
    .filter(Boolean);
  return lines.join(',\n');
}

// ── Descriptions map ──────────────────────────────────────────────────────────
/** Flat Record<dotPath, description> for all tokens that have a $description. */
function cleanText(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function lowerWords(value) {
  return cleanText(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function deriveFallbackDescription(path) {
  const normalized = lowerWords(path.join('.'));
  const surface = path[2] ?? path[path.length - 1] ?? 'component';

  if (normalized.startsWith('primitive.color.neutral'))
    return 'Neutral ramp step for surfaces and text.';
  if (normalized.startsWith('primitive.color.blue'))
    return 'Brand blue ramp step for accents and interactive states.';
  if (normalized.startsWith('primitive.color.red'))
    return 'Feedback red ramp step for error states.';
  if (normalized.startsWith('primitive.color.green'))
    return 'Feedback green ramp step for success states.';
  if (normalized.startsWith('primitive.color.amber'))
    return 'Feedback amber ramp step for warning states.';
  if (normalized.startsWith('primitive.space')) return 'Spacing step on the 4px grid.';
  if (normalized.startsWith('primitive.radius'))
    return 'Corner radius step for controls and surfaces.';
  if (normalized.startsWith('primitive.typography.family'))
    return 'Primary font family stack for interface text.';
  if (normalized.startsWith('primitive.typography.size'))
    return 'Type size step for the text scale.';
  if (normalized.startsWith('primitive.typography.weight'))
    return 'Font weight step for the type ramp.';
  if (normalized.startsWith('primitive.typography.lineheight'))
    return 'Line rhythm step for readable text.';
  if (normalized.startsWith('primitive.typography.letterspacing'))
    return 'Tracking step for the type ramp.';

  if (normalized.startsWith('semantic.color.surface'))
    return `Surface color role for the ${surface}.`;
  if (normalized.startsWith('semantic.color.content'))
    return `Content color role for the ${surface}.`;
  if (normalized.startsWith('semantic.color.border'))
    return `Border color role for the ${surface}.`;
  if (normalized.startsWith('semantic.typography')) return `Typography role for the ${surface}.`;
  if (normalized.startsWith('semantic.radius'))
    return `Interactive radius role for the ${surface}.`;

  if (normalized.includes('bghover') || normalized.includes('hover fill'))
    return `Hover-state fill for the ${surface}.`;
  if (normalized.includes('bg') || normalized.includes('fill'))
    return `Default fill for the ${surface}.`;
  if (normalized.includes('text')) return `Text color for the ${surface}.`;
  if (normalized.includes('paddingx') || normalized.includes('horizontal padding'))
    return `Horizontal inset for the ${surface}.`;
  if (normalized.includes('paddingy') || normalized.includes('vertical padding'))
    return `Vertical inset for the ${surface}.`;
  if (normalized.includes('radius')) return `Corner radius for the ${surface}.`;
  if (normalized.includes('fontsize') || normalized.includes('font size'))
    return `Type size for the ${surface}.`;
  if (normalized.includes('fontweight') || normalized.includes('font weight'))
    return `Type weight for the ${surface}.`;
  if (normalized.includes('gap')) return `Spacing between items in the ${surface}.`;
  if (normalized.includes('border')) return `Border / stroke for the ${surface}.`;
  if (normalized.includes('icon')) return `Icon slot for the ${surface}.`;
  if (normalized.includes('label')) return `Label text for the ${surface}.`;
  if (normalized.includes('size')) return `Control size for the ${surface}.`;

  return 'Design token source value.';
}

const themeRelativeDescriptionPattern =
  /\b(darken(?:s|ed)?|lighten(?:s|ed)?|brighten(?:s|ed)?|dim(?:s|med)?|darkens?|lightens?)\b/i;
const themePairPattern = /\blight\b[\s\S]*\bdark\b|\bdark\b[\s\S]*\blight\b/i;
const genericDescriptionPattern =
  /^(No token description available\.?|Primitive source value\.|Semantic role token\.|Design token source value\.|Specific value within the .* range at a defined lightness step\.|Discrete values within the .* range at defined lightness steps\.)$/i;

function normalizeDescription(path, description) {
  const cleaned = cleanText(description ?? '');
  if (!cleaned) return deriveFallbackDescription(path);
  if (genericDescriptionPattern.test(cleaned)) return deriveFallbackDescription(path);
  if (themeRelativeDescriptionPattern.test(cleaned) && !themePairPattern.test(cleaned)) {
    return deriveFallbackDescription(path);
  }
  return cleaned;
}

export function buildDescriptionsMap(tokens) {
  const map = {};
  for (const { path, description } of tokens) {
    if (description) map[path.join('.')] = normalizeDescription(path, description);
  }
  return map;
}

// ── CSS var name collector ────────────────────────────────────────────────────
/**
 * Returns every CSS custom property name the build script would emit,
 * including the expanded sub-vars for typography and transition composites.
 */
export function buildCSSVarNames(tokens) {
  const vars = [];
  for (const { path, type, value } of tokens) {
    if (type === 'typography') {
      const base = pathToCSSVar(path);
      for (const [suffix, key] of TYPO_PROPS) {
        if (TYPO_OPTIONAL_KEYS.has(key) && (!value || value[key] == null)) continue;
        vars.push(`${base}-${suffix}`);
      }
    } else if (type === 'motion') {
      const base = `--hds-motion-${path[2]}`;
      for (const [suffix] of MOTION_PROPS) vars.push(`${base}-${suffix}`);
    } else if (type === 'transition') {
      const base = pathToCSSVar(path);
      vars.push(`${base}-duration`, `${base}-delay`, `${base}-timing-function`);
    } else if (type === 'elevation') {
      const base = pathToCSSVar(path);
      for (const slot of ELEVATION_SLOTS) vars.push(`${base}-${slot}`);
    } else {
      vars.push(pathToCSSVar(path));
    }
  }
  return vars;
}

// ── Token validator ───────────────────────────────────────────────────────────
/**
 * EXEMPT CONSUMERS
 *
 * Components that use CSS vars from theme.css directly should be explicitly
 * justified in their source and migrated toward semantic/component tokens.
 */

/**
 * Validates hirobius.tokens.json against HDS structural rules.
 * Returns an array of error strings. Empty array = pass.
 *
 * Rules enforced:
 *   V1 — Semantic/component tokens must alias a primitive, except
 *        computed color values expressed as oklch()
 *   V2 — All alias {refs} must resolve to an existing token path
 *   V3 — No circular alias chains
 *   V4 — $extensions namespace must be "com.figma.variables" (not com.hirobius.*)
 *   V5 — Mode keys must be "Light" / "Dark" (capitalized)
 */
export function validateTokens(raw) {
  const errors = [];

  // Build a flat path → node index for ref resolution
  const pathIndex = new Map();
  for (const { path } of walkTokens(raw)) {
    pathIndex.set(path.join('.'), true);
  }

  for (const { path, type, value, extensions } of walkTokens(raw)) {
    const dotPath = path.join('.');
    const tier = path[0];
    const isAlias = typeof value === 'string' && value.startsWith('{');

    // V1 — semantic/component tokens must be aliases unless they are
    // computed color values expressed as oklch().
    // Composite types (typography, transition, motion, shadow, elevation) are exempt:
    // DTCG spec requires their $value to be a composite object or a pre-composed
    // CSS string (shadows can layer multiple parts with hsl(var(--shadow-color) / α)
    // tints that no single primitive can express). Color tokens may also use oklch()
    // directly when the semantic layer needs a derived tint.
    const isComposite =
      type === 'typography' ||
      type === 'transition' ||
      type === 'motion' ||
      type === 'shadow' ||
      type === 'elevation';
    const isOklch = type === 'color' && typeof value === 'string' && value.startsWith('oklch(');
    if (
      (tier === 'semantic' || tier === 'component' || tier === 'role') &&
      !isAlias &&
      !isComposite &&
      !isOklch
    ) {
      errors.push(
        `V1 [${dotPath}] ${tier} token has raw value — must alias an upstream token (raw: "${String(value).slice(0, 60)}")`,
      );
    }

    // V2 — alias must resolve to a known path
    if (isAlias) {
      const ref = value.replace(/^\{|\}$/g, '');
      if (!pathIndex.has(ref)) {
        errors.push(`V2 [${dotPath}] alias "${value}" points to unknown path "${ref}"`);
      }
    }

    // V2b — elevation composite slots may carry aliases; verify each one resolves.
    if (type === 'elevation' && value && typeof value === 'object') {
      for (const [slot, slotVal] of Object.entries(value)) {
        if (typeof slotVal === 'string' && slotVal.startsWith('{')) {
          const slotRef = slotVal.replace(/^\{|\}$/g, '');
          if (!pathIndex.has(slotRef)) {
            errors.push(
              `V2 [${dotPath}.${slot}] alias "${slotVal}" points to unknown path "${slotRef}"`,
            );
          }
        }
      }
    }

    // V3 — circular references (build-time check via resolveAlias throws)
    if (isAlias) {
      try {
        resolveAlias(value, raw);
      } catch (e) {
        if (e.message.startsWith('Circular')) errors.push(`V3 [${dotPath}] ${e.message}`);
      }
    }

    // V4 — $extensions namespace check
    if (extensions) {
      for (const ns of Object.keys(extensions)) {
        if (ns.startsWith('com.hirobius')) {
          errors.push(`V4 [${dotPath}] stale namespace "${ns}" — use "com.figma.variables"`);
        }
      }
    }

    // V5 — mode key capitalization
    const modes = extensions?.['com.figma.variables']?.modes;
    if (modes) {
      for (const key of Object.keys(modes)) {
        if (key === 'light' || key === 'dark') {
          errors.push(`V5 [${dotPath}] mode key "${key}" must be capitalized: "Light" / "Dark"`);
        }
      }
    }
  }

  return errors;
}

// ── Manifest builder ─────────────────────────────────────────────────────────
/**
 * Builds public/hds-manifest.json — a machine-readable snapshot of the full
 * token system for AI agents and LLMs building with or on top of HDS.
 * Auto-generated on every `pnpm tokens` run alongside tokens.css.
 */
export function buildManifest(allTokens, raw) {
  const resolveValue = (val, type) => {
    if (typeof val === 'string' && val.startsWith('{')) {
      try {
        return valueToCSS(resolveAlias(val, raw), type, false, raw);
      } catch {
        return null;
      }
    }
    return valueToCSS(val, type, false, raw);
  };

  // Brand values — derived from token file so manifest stays in sync automatically.
  // 12t-typography-truth-up: corrected path (was raw.primitive.font.family.primary —
  // a non-existent path, which silently fell back to the literal "Atkinson Hyperlegible
  // Next" while real tokens carried Clash Grotesk).
  const fontFamRaw = raw.primitive?.typography?.family?.primary?.$value;
  const fontName = Array.isArray(fontFamRaw) ? fontFamRaw[0] : String(fontFamRaw ?? 'Satoshi');
  const componentSpecs = {
    ...(SYSTEM_MANIFEST.componentSpecs ?? {}),
    Button: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Button ?? {}),
      sourcePath: 'src/app/components/button.tsx',
      sourceExport: 'Button',
      props: {
        variant: {
          type: 'enum',
          values: ['primary', 'secondary', 'tertiary'],
          default: 'secondary',
        },
        size: { type: 'enum', values: ['sm', 'md', 'lg'], default: 'md' },
        disabled: { type: 'boolean', default: false },
        loading: { type: 'boolean', default: false },
        label: { type: 'string', optional: true },
        iconLeft: { type: 'ReactNode', optional: true },
        iconRight: { type: 'ReactNode', optional: true },
        iconOnly: { type: 'boolean', default: false },
      },
      tokens: {
        background: 'role.primary',
        text: 'role.primary-foreground',
        border: 'role.input',
        hoverSurface: 'role.accent',
        hoverText: 'role.accent-foreground',
        focusRing: 'role.ring',
        radius: 'role.radius',
      },
      figmaPropertyMapping: {
        variant: 'Variant',
        size: 'Size',
        disabled: 'Disabled',
        loading: 'Loading',
        label: 'Label',
        iconLeft: 'Leading icon',
        iconRight: 'Trailing icon',
        iconOnly: 'Icon only',
      },
      variantAxes: ['variant', 'size', 'state'],
      componentProperties: [
        {
          name: 'Label',
          type: 'TEXT',
          defaultValue: 'Button',
          sourceProp: 'label',
          boundTo: 'characters',
          targetSelector: 'Label',
        },
        {
          name: 'Leading icon',
          type: 'BOOLEAN',
          defaultValue: false,
          sourceProp: 'iconLeft',
          boundTo: 'visibility',
          targetSelector: 'IconLeft',
        },
        {
          name: 'Trailing icon',
          type: 'BOOLEAN',
          defaultValue: false,
          sourceProp: 'iconRight',
          boundTo: 'visibility',
          targetSelector: 'IconRight',
        },
        {
          name: 'Show label',
          type: 'BOOLEAN',
          defaultValue: true,
          sourceProp: 'iconOnly',
          boundTo: 'visibility',
          targetSelector: 'Label',
          invert: true,
        },
      ],
      states: ['default', 'hover', 'focus', 'active', 'disabled', 'loading'],
    },
    Card: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Card ?? {}),
      sourcePath: 'src/app/components/Card.tsx',
      sourceExport: 'Card',
      props: {
        as: { type: 'string', optional: true },
        padding: {
          type: 'enum',
          values: ['component', 'item', 'none', 'px24', 'px16'],
          default: 'component',
        },
        gap: { type: 'enum', values: ['tight', 'normal', 'inset', 'spacious'], default: 'tight' },
        noPadding: { type: 'boolean', default: false },
        className: { type: 'string', optional: true },
        children: { type: 'ReactNode' },
      },
      tokens: {
        background: 'role.card',
        text: 'role.card-foreground',
        border: 'role.border',
        radius: 'role.radius',
        description: 'role.muted-foreground',
      },
      figmaPropertyMapping: {
        padding: 'Padding',
        gap: 'Gap',
      },
      variantAxes: ['padding'],
      componentProperties: [],
      states: ['default'],
    },
    Input: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Input ?? {}),
      sourcePath: 'src/app/components/Input.tsx',
      sourceExport: 'Input',
      props: {
        type: {
          type: 'enum',
          values: ['text', 'email', 'password', 'search', 'tel', 'url', 'number'],
          default: 'text',
        },
        size: { type: 'enum', values: ['sm', 'md', 'lg'], default: 'md' },
        textStyle: { type: 'enum', values: ['body', 'mono'], default: 'body' },
        label: { type: 'string', optional: true },
        placeholder: { type: 'string', optional: true },
        helperText: { type: 'string', optional: true },
        error: { type: 'boolean', default: false },
        errorMessage: { type: 'string', optional: true },
        disabled: { type: 'boolean', default: false },
        loading: { type: 'boolean', default: false },
      },
      tokens: {
        background: 'role.background',
        text: 'role.foreground',
        border: 'role.input',
        borderError: 'role.destructive',
        radius: 'role.radius',
        focusRing: 'role.ring',
        placeholder: 'role.muted-foreground',
        helperText: 'role.muted-foreground',
        errorText: 'role.destructive',
        disabledBg: 'role.muted',
        disabledText: 'role.muted-foreground',
      },
      figmaPropertyMapping: {
        type: 'Type',
        size: 'Size',
        label: 'Label',
        placeholder: 'Placeholder',
        helperText: 'Helper text',
        error: 'Error',
        errorMessage: 'Error message',
        disabled: 'Disabled',
        loading: 'Loading',
      },
      variantAxes: ['size', 'state'],
      componentProperties: [
        {
          name: 'Label',
          type: 'TEXT',
          defaultValue: 'Label',
          sourceProp: 'label',
          boundTo: 'characters',
          targetSelector: 'Label',
        },
        {
          name: 'Placeholder',
          type: 'TEXT',
          defaultValue: 'Placeholder',
          sourceProp: 'placeholder',
          boundTo: 'characters',
          targetSelector: 'Placeholder',
        },
        {
          name: 'Helper text',
          type: 'TEXT',
          defaultValue: 'Helper text',
          sourceProp: 'helperText',
          boundTo: 'characters',
          targetSelector: 'Helper',
        },
        {
          name: 'Error',
          type: 'BOOLEAN',
          defaultValue: false,
          sourceProp: 'error',
          boundTo: 'visibility',
          targetSelector: 'Error',
        },
        {
          name: 'Error message',
          type: 'TEXT',
          defaultValue: 'Error message',
          sourceProp: 'errorMessage',
          boundTo: 'characters',
          targetSelector: 'Error',
        },
      ],
      states: ['default', 'focus', 'filled', 'error', 'disabled', 'loading'],
    },
    Dialog: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Dialog ?? {}),
      sourcePath: 'src/app/components/Dialog.tsx',
      sourceExport: 'Dialog',
      props: {
        open: { type: 'boolean', optional: true },
        defaultOpen: { type: 'boolean', optional: true },
        modal: { type: 'boolean', default: true },
        title: { type: 'string', optional: true },
        description: { type: 'string', optional: true },
        hideClose: { type: 'boolean', default: false },
        children: { type: 'ReactNode' },
      },
      tokens: {
        background: 'role.popover',
        text: 'role.popover-foreground',
        border: 'role.border',
        radius: 'role.radius',
        shadow: 'semantic.shadow.overlay',
        scrim: 'role.foreground',
        descriptionText: 'role.muted-foreground',
        closeHover: 'role.accent',
        closeHoverText: 'role.accent-foreground',
        focusRing: 'role.ring',
      },
      figmaPropertyMapping: {
        title: 'Title',
        description: 'Description',
        hideClose: 'Hide close',
        modal: 'Modal',
      },
      variantAxes: ['state'],
      componentProperties: [
        {
          name: 'Title',
          type: 'TEXT',
          defaultValue: 'Dialog title',
          sourceProp: 'title',
          boundTo: 'characters',
          targetSelector: 'Title',
        },
        {
          name: 'Description',
          type: 'TEXT',
          defaultValue: 'Dialog description',
          sourceProp: 'description',
          boundTo: 'characters',
          targetSelector: 'Description',
        },
        {
          name: 'Hide close',
          type: 'BOOLEAN',
          defaultValue: false,
          sourceProp: 'hideClose',
          boundTo: 'visibility',
          targetSelector: 'Close',
          invert: true,
        },
      ],
      states: ['closed', 'open'],
      slots: [
        {
          name: 'overlay',
          figmaSlotName: 'Overlay',
          tokenBinding: {
            fill: 'role.foreground',
          },
        },
        {
          name: 'surface',
          figmaSlotName: 'Surface',
          tokenBinding: {
            fill: 'role.popover',
            stroke: 'role.border',
            cornerRadius: 'role.radius',
          },
        },
        {
          name: 'header',
          figmaSlotName: 'Header',
          tokenBinding: {
            fill: 'role.popover-foreground',
          },
        },
        {
          name: 'title',
          figmaSlotName: 'Title',
          tokenBinding: {
            fill: 'role.popover-foreground',
            typography: 'semantic.typography.h3',
          },
        },
        {
          name: 'description',
          figmaSlotName: 'Description',
          tokenBinding: {
            fill: 'role.muted-foreground',
            typography: 'semantic.typography.body',
          },
        },
        {
          name: 'footer',
          figmaSlotName: 'Footer',
          tokenBinding: {
            fill: 'role.popover-foreground',
          },
        },
        {
          name: 'close',
          figmaSlotName: 'Close',
          tokenBinding: {
            fill: 'role.muted-foreground',
          },
        },
      ],
    },
    // ── Generative-subset components without bespoke seed data ──────────────
    // These get full props/tokens via auto-discovery + tokenMapping preservation.
    // We only seed the Figma master shape: variantAxes, componentProperties, states.
    Alert: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Alert ?? {}),
      variantAxes: ['variant'],
      componentProperties: [
        {
          name: 'Title',
          type: 'TEXT',
          defaultValue: 'Alert title',
          sourceProp: 'title',
          boundTo: 'characters',
          targetSelector: 'Title',
        },
        {
          name: 'Body',
          type: 'TEXT',
          defaultValue: 'Alert message',
          sourceProp: 'children',
          boundTo: 'characters',
          targetSelector: 'Body',
        },
      ],
      states: ['default'],
    },
    Stack: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Stack ?? {}),
      variantAxes: ['direction'],
      componentProperties: [],
      states: ['default'],
    },
    Badge: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Badge ?? {}),
      variantAxes: ['tone'],
      componentProperties: [
        {
          name: 'Label',
          type: 'TEXT',
          defaultValue: 'Badge',
          sourceProp: 'children',
          boundTo: 'characters',
          targetSelector: 'Label',
        },
      ],
      states: ['default'],
    },
    Surface: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Surface ?? {}),
      variantAxes: [],
      componentProperties: [],
      states: ['default'],
    },
    Grid: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Grid ?? {}),
      variantAxes: [],
      componentProperties: [],
      states: ['default'],
    },
    Icon: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Icon ?? {}),
      variantAxes: ['size'],
      componentProperties: [],
      states: ['default'],
    },
    Tag: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Tag ?? {}),
      variantAxes: ['active'],
      componentProperties: [
        {
          name: 'Label',
          type: 'TEXT',
          defaultValue: 'Tag',
          sourceProp: 'children',
          boundTo: 'characters',
          targetSelector: 'Label',
        },
      ],
      states: ['default', 'hover', 'disabled'],
    },
    Divider: {
      ...(SYSTEM_MANIFEST.componentSpecs?.Divider ?? {}),
      variantAxes: ['orientation'],
      componentProperties: [],
      states: ['default'],
    },
    HeadingStack: {
      ...(SYSTEM_MANIFEST.componentSpecs?.HeadingStack ?? {}),
      variantAxes: [],
      componentProperties: [
        {
          name: 'Heading',
          type: 'TEXT',
          defaultValue: 'Heading',
          sourceProp: 'heading',
          boundTo: 'characters',
          targetSelector: 'Heading',
        },
        {
          name: 'Subtext',
          type: 'TEXT',
          defaultValue: 'Supporting subtext',
          sourceProp: 'subtext',
          boundTo: 'characters',
          targetSelector: 'Subtext',
        },
      ],
      states: ['default'],
    },
    TextLockup: {
      ...(SYSTEM_MANIFEST.componentSpecs?.TextLockup ?? {}),
      variantAxes: [],
      componentProperties: [
        {
          name: 'Eyebrow',
          type: 'TEXT',
          defaultValue: 'EYEBROW',
          sourceProp: 'eyebrow',
          boundTo: 'characters',
          targetSelector: 'Eyebrow',
        },
        {
          name: 'Title',
          type: 'TEXT',
          defaultValue: 'Title text',
          sourceProp: 'title',
          boundTo: 'characters',
          targetSelector: 'Title',
        },
        {
          name: 'Description',
          type: 'TEXT',
          defaultValue: 'Description',
          sourceProp: 'description',
          boundTo: 'characters',
          targetSelector: 'Description',
        },
      ],
      states: ['default'],
    },
  };

  const formatToken = (t) => {
    const entry = {
      path: t.path.join('.'),
      cssVar: t.type === 'motion' ? `--hds-motion-${t.path[2]}` : `--${t.path.join('-')}`,
    };
    if (t.type) entry.type = t.type;
    if (t.description) entry.description = t.description;

    if (t.type === 'typography') {
      const composite = {};
      for (const [, key, type] of TYPO_PROPS) {
        if (t.value[key] != null) composite[key] = resolveValue(t.value[key], type);
      }
      // Optional typography keys (e.g. maxWidth) are simply omitted when the
      // composite did not define them — no null marker, no schema noise.
      entry.composite = composite;
    } else if (t.type === 'motion') {
      entry.composite = {
        duration: resolveValue(t.value.duration, 'duration'),
        easing: resolveValue(t.value.easing, 'motionEasing'),
      };
    } else if (t.type === 'transition') {
      entry.composite = {
        duration: resolveValue(t.value.duration, 'duration'),
        delay: resolveValue(t.value.delay, 'duration'),
        timingFunction: resolveValue(t.value.timingFunction, 'cubicBezier'),
      };
    } else if (t.type === 'elevation') {
      const composite = {};
      for (const slot of ELEVATION_SLOTS) {
        const slotVal = t.value?.[slot];
        if (slotVal == null) {
          composite[slot] = null;
        } else if (typeof slotVal === 'string' && slotVal.startsWith('{')) {
          composite[slot] = {
            alias: slotVal,
            resolvedValue: resolveValue(slotVal, slot === 'shadow' ? 'shadow' : 'color'),
          };
        } else {
          composite[slot] = String(slotVal);
        }
      }
      entry.composite = composite;
    } else if (typeof t.value === 'string' && t.value.startsWith('{')) {
      entry.alias = t.value;
      entry.resolvedValue = resolveValue(t.value, t.type);
      const dark = t.extensions?.['com.figma.variables']?.modes?.Dark;
      if (dark) entry.dark = { alias: dark, resolvedValue: resolveValue(dark, t.type) };
    } else {
      entry.value = valueToCSS(t.value, t.type, false, raw);
      const dark = t.extensions?.['com.figma.variables']?.modes?.Dark;
      if (dark) entry.dark = { alias: dark, resolvedValue: resolveValue(dark, t.type) };
    }

    return entry;
  };

  return {
    name: 'Hirobius Design System',
    description:
      "Three-tier design token system for Adrian Milsap's portfolio site. Tokens flow primitive → semantic → component. All visual decisions trace back to hirobius.tokens.json.",
    version: '1',
    generated: new Date().toISOString(),
    source: 'hirobius.tokens.json',
    format: 'W3C DTCG 2025.10',
    docs: 'https://adrianmilsap.com/hds',
    llmsTxt: 'https://adrianmilsap.com/llms.txt',
    systemSpecs: SYSTEM_MANIFEST.systemSpecs ?? {
      engine: 'React + TypeScript',
      icons: 'Phosphor (Bold)',
      tokens: 'W3C DTCG',
      styling: 'CSS Variables',
    },
    architecture: {
      tiers: ['primitive', 'semantic', 'component', 'role'],
      aliasRule:
        'Semantic, component, and role tokens must alias an upstream token, except computed oklch() color values for derived tints.',
      darkMode:
        '[data-theme="dark"] on <html>. Semantic tokens auto-switch via CSS var chain — no JS re-renders.',
      cssVarFormat: '--{tier}-{...path-segments}',
      consumeInCSS: 'var(--semantic-color-surface-page)',
      consumeInJS: 'hds.space.px16  |  ct(isDark).content.primary from theme.ts',
      consumeTypography: 'hds.typeStyles.h1 (inline style object) — never Tailwind font classes',
    },
    brand: {
      primaryColor: resolveValue(raw.primitive?.color?.blue?.['500']?.$value, 'color') ?? '',
      primaryColorToken: 'primitive.color.blue.500',
      font: fontName + ' variable 100–900, self-hosted',
      spacingBase: resolveValue(raw.primitive?.space?.['1']?.$value, 'dimension') ?? '',
      buttonBorderRadius: resolveValue(raw.primitive?.radius?.[0]?.$value, 'dimension') ?? '',
      cardBorderRadius: resolveValue(raw.primitive?.radius?.[8]?.$value, 'dimension') ?? '',
      neutralScale: 'true monochromatic (equal RGB channels)',
      accentCount: 1,
    },
    componentInventory: SYSTEM_MANIFEST.componentInventory ?? [
      'Button',
      'Card',
      'Input',
      'Nav',
      'Alert',
      'Tag',
      'Stack',
      'Divider',
      'Icon',
      'IconButton',
      'SegmentedControl',
      'InlineCode',
      'InlineLink',
      'CodeBlock',
      'DocLinkCard',
    ],
    typographyRamp: SYSTEM_MANIFEST.typographyRamp ?? null,
    patternInventory: SYSTEM_MANIFEST.patternInventory ?? [],
    phases: SYSTEM_MANIFEST.phases ?? [],
    health: SYSTEM_MANIFEST.health ?? null,
    inventory: SYSTEM_MANIFEST.inventory ?? {},
    agentEntrypoint: 'CLAUDE.md',
    breakingChangePolicy:
      'Version increments on any prop rename, token path rename, or removed component. Additions are non-breaking.',
    componentSpecs,
    // utilities is produced by generate-manifest's tier-based section split
    // (8x-5). build-tokens runs after generate-manifest in `pnpm tokens`, so
    // we forward it through verbatim — losing it here would empty the peer
    // on every tokens rebuild.
    utilities: SYSTEM_MANIFEST.utilities ?? {},
    tokens: {
      primitive: allTokens.filter((t) => t.path[0] === 'primitive').map(formatToken),
      semantic: allTokens.filter((t) => t.path[0] === 'semantic').map(formatToken),
      component: allTokens.filter((t) => t.path[0] === 'component').map(formatToken),
      role: allTokens.filter((t) => t.path[0] === 'role').map(formatToken),
    },
  };
}

// ── Tailwind config emitter ────────────────────────────────────────────
/**
 * Maps role tokens + semantic.shadow.* into a Tailwind theme.extend object.
 * Foreground role tokens (e.g. card-foreground) nest under their base as
 * { DEFAULT, foreground } so utilities like bg-card / text-card-foreground
 * resolve. Flat roles (background, foreground, border, input, ring) emit as
 * top-level color strings. The radius role drives borderRadius.lg/md/sm via
 * calc() steps (shadcn convention). Shadow tokens map by name into boxShadow.
 *
 * @param {Array} roles  - tokens whose path[0] === 'role'
 * @param {Array} shadows - tokens with path[0]==='semantic' && path[1]==='shadow' && type==='shadow'
 * @returns {{ colors: object, borderRadius: object, boxShadow: object }}
 */
export function buildTailwindThemeExtend(roles, shadows) {
  const FOREGROUND_SUFFIX = '-foreground';
  const foregroundBases = new Set();
  for (const t of roles) {
    const name = t.path[1];
    if (typeof name === 'string' && name.endsWith(FOREGROUND_SUFFIX)) {
      foregroundBases.add(name.slice(0, -FOREGROUND_SUFFIX.length));
    }
  }

  const colors = {};
  let radiusVar = null;
  for (const t of roles) {
    const name = t.path[1];
    const cssVar = `var(${pathToCSSVar(t.path)})`;

    if (t.type === 'dimension' && name === 'radius') {
      radiusVar = cssVar;
      continue;
    }

    if (name.endsWith(FOREGROUND_SUFFIX)) {
      const base = name.slice(0, -FOREGROUND_SUFFIX.length);
      colors[base] = colors[base] || {};
      colors[base].foreground = cssVar;
    } else if (foregroundBases.has(name)) {
      colors[name] = colors[name] || {};
      colors[name].DEFAULT = cssVar;
    } else {
      colors[name] = cssVar;
    }
  }

  const borderRadius = radiusVar
    ? {
        lg: radiusVar,
        md: `calc(${radiusVar} - 2px)`,
        sm: `calc(${radiusVar} - 4px)`,
      }
    : {};

  const boxShadow = {};
  for (const t of shadows) {
    const name = t.path[t.path.length - 1];
    boxShadow[name] = `var(${pathToCSSVar(t.path)})`;
  }

  return { colors, borderRadius, boxShadow };
}

// ── Tenant overlay validator ────────────────────────────────────────────────
/**
 * Validates a tenant tokens.json overlay against HDS structural rules.
 *
 * Rules (per docs/architecture/tenant-token-overlay-format.md):
 *   R1 — No primitive-tier overrides (path[0] must not be "primitive")
 *   R5 — Every override path must exist in the base token graph
 *   R8 — All alias {ref} values must resolve against the base graph
 *
 * @param {object} overlay   - Parsed tenant tokens.json (partial DTCG)
 * @param {object} baseRaw   - Parsed hirobius.tokens.json (full DTCG)
 * @param {string} slug      - Tenant slug (for error context)
 * @returns {string[]}       - Array of error strings; empty = pass
 */
export function validateTenantOverlay(overlay, baseRaw, slug) {
  const errors = [];

  // Build flat path set from base for R5 checks
  const basePathIndex = new Set();
  for (const { path } of walkTokens(baseRaw)) {
    basePathIndex.add(path.join('.'));
  }

  for (const { path, value } of walkTokens(overlay)) {
    const dotPath = path.join('.');
    const tier = path[0];

    // R1 — no primitive overrides
    if (tier === 'primitive') {
      errors.push(
        `R1 [${slug}:${dotPath}] primitive-tier override is forbidden — override semantic-tier tokens instead`,
      );
    }

    // R5 — path must exist in base
    if (!basePathIndex.has(dotPath)) {
      errors.push(
        `R5 [${slug}:${dotPath}] path does not exist in hirobius.tokens.json — tenants override only; they do not extend`,
      );
    }

    // R8 — alias must resolve against base
    const isAlias = typeof value === 'string' && value.startsWith('{');
    if (isAlias) {
      try {
        resolveAlias(value, baseRaw);
      } catch (e) {
        errors.push(`R8 [${slug}:${dotPath}] alias "${value}" — ${e.message}`);
      }
    }
  }

  return errors;
}

// ── Per-tenant CSS emitter ─────────────────────────────────────────────────────
/**
 * Walks tenants/* (skipping _template and any dir without tokens.json),
 * validates each overlay, and returns CSS text for tenants.css.
 *
 * Scope strategy: [data-tenant="<slug>"] attribute selectors (ADR-0001).
 * Dark overrides emit under [data-tenant="<slug>"][data-theme="dark"].
 *
 * @param {string}   tenantsDir  - Absolute path to the tenants/ directory
 * @param {object}   baseRaw     - Parsed hirobius.tokens.json
 * @param {object}   [options]
 * @param {boolean}  [options.strict=true]  - Skip emitting tenants with validation errors
 * @returns {{ css: string, tenants: string[], errors: string[] }}
 */
export function buildTenantCSS(tenantsDir, baseRaw, { strict = true } = {}) {
  const allErrors = [];
  const processedSlugs = [];
  const blocks = [];

  let slugDirs;
  try {
    slugDirs = readdirSync(tenantsDir, { withFileTypes: true });
  } catch {
    // tenants/ directory doesn't exist — nothing to emit
    return { css: '', tenants: [], errors: [] };
  }

  for (const entry of slugDirs) {
    if (!entry.isDirectory()) continue;
    const slug = entry.name;
    // Skip reserved directories (e.g. _template)
    if (slug.startsWith('_')) continue;
    // Validate slug format: lowercase, kebab-case, ASCII
    if (!/^[a-z0-9-]+$/.test(slug)) {
      allErrors.push(`[${slug}] invalid slug format — must match [a-z0-9-]+`);
      continue;
    }

    const overlayPath = join(tenantsDir, slug, 'tokens.json');
    if (!existsSync(overlayPath)) continue;

    let overlay;
    try {
      overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
    } catch (e) {
      allErrors.push(`[${slug}] JSON parse error in tokens.json: ${e.message}`);
      continue;
    }

    // Validate overlay against base token graph
    const errs = validateTenantOverlay(overlay, baseRaw, slug);
    if (errs.length > 0) {
      allErrors.push(...errs);
      if (strict) continue; // skip emitting this tenant when validation fails
    }

    // Collect light and dark CSS vars for each overridden leaf
    const lightVars = [];
    const darkVars = [];

    for (const { path, type, value, extensions } of walkTokens(overlay)) {
      const cssVar = pathToCSSVar(path);

      // Composite types (typography, transition, motion, elevation) require
      // the full base context for expansion. Skip atomic-string passthrough
      // for now; simple scalar overrides (color, dimension, fontFamily, etc.)
      // cover the common case and match the documented overlay format.
      if (
        type === 'typography' ||
        type === 'transition' ||
        type === 'motion' ||
        type === 'elevation'
      ) {
        if (typeof value === 'string') {
          lightVars.push(
            `  ${cssVar}: ${value}; /* css-ok: tenant palette primitive */ /* tier-ok: tenant primitive override is the override mechanism — semantic alias */`,
          );
        }
        continue;
      }

      // Prefer explicit Light mode value if present, fall back to $value
      const lightMode = extensions?.['com.figma.variables']?.modes?.Light;
      const darkMode = extensions?.['com.figma.variables']?.modes?.Dark;

      const lightVal = lightMode ?? value;
      const darkVal = darkMode;

      // Emit light value. /* css-ok */ marker tells check-css-values that
      // raw hex/dimension values at the tenant primitive layer are intentional —
      // every other layer references vars, but the tenant overlay IS where the
      // primitive concrete value lives (see ADR-0001 multi-tenant scope).
      if (lightVal != null) {
        const cssValue = valueToCSS(lightVal, type, /* preserveAlias */ true, baseRaw);
        if (cssValue != null)
          lightVars.push(
            `  ${cssVar}: ${cssValue}; /* css-ok: tenant palette primitive */ /* tier-ok: tenant primitive override is the override mechanism — semantic alias */`,
          );
      }

      // Emit dark value only when it differs from light
      if (darkVal != null && darkVal !== lightVal) {
        const cssValue = valueToCSS(darkVal, type, /* preserveAlias */ true, baseRaw);
        if (cssValue != null)
          darkVars.push(
            `  ${cssVar}: ${cssValue}; /* css-ok: tenant palette primitive */ /* tier-ok: tenant primitive override is the override mechanism — semantic alias */`,
          );
      }
    }

    if (lightVars.length === 0 && darkVars.length === 0) continue;

    processedSlugs.push(slug);

    const bar = '─'.repeat(Math.max(0, 68 - slug.length));
    let block = `\n/* ── ${slug} ${bar} */\n`;
    block += `[data-tenant="${slug}"] {\n${lightVars.join('\n')}\n}\n`;

    if (darkVars.length > 0) {
      block += `[data-tenant="${slug}"][data-theme="dark"] {\n${darkVars.join('\n')}\n}\n`;
    }

    blocks.push(block);
  }

  const header = [
    '/**',
    ' * Generated by scripts/build-tokens.mjs — do not edit manually.',
    ' * Source: tenants/*/tokens.json (W3C DTCG overlay format)',
    ' * Regenerate: node scripts/build-tokens.mjs',
    ' *',
    ' * Per-tenant token overrides using [data-tenant="slug"] attribute selectors.',
    ' * Strategy: ADR-0001 (docs/architecture/ADR-0001-multi-tenant-scope.md)',
    ' * Set <html data-tenant="slug"> at the app root to activate a tenant theme.',
    ' * Dark overrides: [data-tenant="slug"][data-theme="dark"] (specificity 0,2,0).',
    ' */',
  ].join('\n');

  const css = blocks.length > 0 ? header + blocks.join('') : '';

  return { css, tenants: processedSlugs, errors: allErrors };
}

// ── CLI entry (runs only when invoked directly) ───────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raw = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));

  // Run structural validation before compiling
  const validationErrors = validateTokens(raw);
  if (validationErrors.length > 0) {
    console.error('\nâœ— Token validation failed:\n');
    validationErrors.forEach((e) => console.error(`  ${e}`));
    console.error('\nFix the above errors in hirobius.tokens.json before compiling.\n');
    process.exit(1);
  }

  const allTokens = [...walkTokens(raw)];
  const primitives = allTokens.filter((t) => t.path[0] === 'primitive');
  const semantics = allTokens.filter((t) => t.path[0] === 'semantic');
  const components = allTokens.filter((t) => t.path[0] === 'component');
  const roles = allTokens.filter((t) => t.path[0] === 'role');

  const prim = buildCSSSection(primitives, 'Primitives', raw);
  const sem = buildCSSSection(semantics, 'Semantic (light mode defaults)', raw);
  const comp = buildCSSSection(components, 'Component', raw);
  const role = buildCSSSection(roles, 'Role aliases (shadcn vocabulary)', raw);

  // Primitives historically had no dark overrides (theme switching happened via
  // semantic aliases), but tokens like primitive.shadow.color carry HSL channel
  // strings whose dark variant cannot be expressed by aliasing another primitive.
  // Including prim.darkLines unlocks per-primitive theme overrides without
  // changing semantics for existing primitives that have no Dark mode set.
  const allDarkLines = [...prim.darkLines, ...sem.darkLines, ...comp.darkLines, ...role.darkLines];

  const css = `/**
 * Generated by scripts/build-tokens.mjs — do not edit manually.
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 * Regenerate: node scripts/build-tokens.mjs
 *
 * Three-tier architecture: primitive → semantic → component
 * Dark mode via [data-theme="dark"] selector (Figma SDS convention).
 * The var() reference chain is preserved so dark-mode overrides cascade
 * automatically — no JavaScript re-renders needed for theme switching.
 */

:root {
${prim.rootLines.join('\n')}
${sem.rootLines.join('\n')}
${comp.rootLines.join('\n')}
${role.rootLines.join('\n')}
}

/* ── Dark mode overrides ────────────────────────────────────────────────────── */
[data-theme="dark"] {
${allDarkLines.join('\n')}
}
`;

  const tsTree = buildTSTree(allTokens);
  const ts = `/**
 * Generated by scripts/build-tokens.mjs — do not edit manually.
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 * Regenerate: node scripts/build-tokens.mjs
 */
export const tokens = {
${serialize(tsTree)}
} as const;
`;

  // ── Raw primitive values ──────────────────────────────────────────────────
  const rawTree = buildRawValuesTree(primitives, raw);
  const tokenValuesTs = `/**
 * Generated by scripts/build-tokens.mjs — do not edit manually.
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 * Regenerate: node scripts/build-tokens.mjs
 *
 * Raw primitive values as typed constants.
 * Import in doc pages instead of hardcoding hex strings, font names, or OKLCH values.
 *
 * Usage:
 *   import { tokenValues } from './generated-token-values';
 *   tokenValues.primitive.color.blue['500']        // '#1e2fff'
 *   tokenValues.primitive.typography.family.primary[0]   // 'Clash Grotesk'
 *   tokenValues.primitive.color.blue['500']        // 'oklch(0.49 0.2903 266.54)'
 */
export const tokenValues = {
  primitive: {
${serializeRaw(rawTree.primitive ?? rawTree, 2)}
  },
} as const;
`;

  // ── Token descriptions ────────────────────────────────────────────────────
  const descMap = buildDescriptionsMap(allTokens);
  const descRows = Object.entries(descMap)
    .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
    .join(',\n');
  const tokenDescriptionsTs = `/**
 * Generated by scripts/build-tokens.mjs — do not edit manually.
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 * Regenerate: node scripts/build-tokens.mjs
 *
 * Token \\$description fields indexed by dot-path.
 * Import in doc pages to avoid duplicating annotation text.
 *
 * Usage:
 *   import { tokenDescriptions } from './generated-token-descriptions';
 *   tokenDescriptions['semantic.accent.rest']  // 'Default fill — primary buttons...'
 */
export const tokenDescriptions: Record<string, string> = {
${descRows},
};
`;

  // ── CSS var type declarations ─────────────────────────────────────────────
  const cssVarNames = buildCSSVarNames(allTokens);
  const dtsProps = cssVarNames.map((v) => `    '${v}'?: string | undefined;`).join('\n');
  const tokenVarsDts = `/**
 * Generated by scripts/build-tokens.mjs — do not edit manually.
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 * Regenerate: node scripts/build-tokens.mjs
 *
 * Augments React.CSSProperties with all HDS CSS custom property names.
 * Provides autocomplete for var() references in inline style objects.
 * Unknown CSS var names will surface as TypeScript suggestions.
 */
import 'react';

declare module 'react' {
  interface CSSProperties {
${dtsProps}
    // Permit any other CSS custom property (third-party libs, local scoping)
    [key: \`--\${string}\`]: string | number | undefined;
  }
}
`;

  // ── Token refs (CSS var strings for all tokens including typography) ──────
  const refsTree = buildTokenRefsTree(allTokens);
  const tokenRefsTs = `/**
 * Generated by scripts/build-tokens.mjs — do not edit manually.
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 * Regenerate: node scripts/build-tokens.mjs
 *
 * CSS var reference strings for every token, including typography composites.
 * Import in tokens.ts or any component that needs a CSS var string without hardcoding.
 *
 * Usage:
 *   import { tokenRefs } from './generated-token-refs';
 *   tokenRefs.semantic.typography.mono          // { fontFamily: 'var(...)', ... }
 *   tokenRefs.semantic.color.surface.page       // 'var(--semantic-color-surface-page)'
 */
export const tokenRefs = {
${serialize(refsTree)}
} as const;
`;

  mkdirSync(join(ROOT, 'src', 'styles'), { recursive: true });
  mkdirSync(join(ROOT, 'src', 'app', 'design-system'), { recursive: true });
  mkdirSync(join(ROOT, 'public'), { recursive: true });

  writeFileSync(join(ROOT, 'src', 'styles', 'tokens.css'), css);
  writeFileSync(join(ROOT, 'src', 'styles', 'tokens.generated.css'), css);
  writeFileSync(join(ROOT, 'src', 'app', 'design-system', 'generated-tokens.ts'), ts);
  writeFileSync(
    join(ROOT, 'src', 'app', 'design-system', 'generated-token-values.ts'),
    tokenValuesTs,
  );
  writeFileSync(
    join(ROOT, 'src', 'app', 'design-system', 'generated-token-descriptions.ts'),
    tokenDescriptionsTs,
  );
  writeFileSync(
    join(ROOT, 'src', 'app', 'design-system', 'generated-token-vars.d.ts'),
    tokenVarsDts,
  );
  writeFileSync(join(ROOT, 'src', 'app', 'design-system', 'generated-token-refs.ts'), tokenRefsTs);
  const manifest = buildManifest(allTokens, raw);
  writeFileSync(join(ROOT, 'public', 'hds-manifest.json'), JSON.stringify(manifest, null, 2));

  // ── Tailwind theme bridge (CommonJS) ────────────────────────────────────
  // tailwind.config.ts spreads this into its own theme.extend so utility
  // classes like bg-background / text-foreground / shadow-floating resolve to
  // the role/shadow CSS vars. Generated as CJS for compatibility with both
  // Tailwind v3 (CommonJS config) and v4 (loadable from ESM via require()).
  const semanticShadows = allTokens.filter(
    (t) => t.path[0] === 'semantic' && t.path[1] === 'shadow' && t.type === 'shadow',
  );
  const tailwindExtend = buildTailwindThemeExtend(roles, semanticShadows);
  const tailwindConfigCjs = `// GENERATED FILE — do not edit; mutate hirobius.tokens.json instead.
// Emitted by scripts/build-tokens.mjs.
//
// Tailwind theme extension bridging HDS role + semantic.shadow tokens to
// utility classes. tailwind.config.* imports this and spreads theme.extend.

/** @type {{ theme: { extend: import('tailwindcss').Config['theme']['extend'] } }} */
const config = {
  theme: {
    extend: ${JSON.stringify(tailwindExtend, null, 6).replace(/\n/g, '\n    ')},
  },
};

module.exports = config;
`;
  writeFileSync(join(ROOT, 'tailwind.config.tokens.cjs'), tailwindConfigCjs);

  // ── Per-tenant CSS (ADR-0001: [data-tenant="slug"] selectors) ─────────────
  const tenantsDir = join(ROOT, 'tenants');
  const tenantResult = buildTenantCSS(tenantsDir, raw, { strict: false });

  if (tenantResult.errors.length > 0) {
    console.warn('\n⚠ Tenant overlay validation warnings:');
    tenantResult.errors.forEach((e) => console.warn('  ' + e));
    console.warn('');
  }

  // Write the generated tenant CSS (overwrites the hand-authored tenants.css).
  // tenants.css is imported in theme.css after tokens.generated.css so the
  // [data-tenant] selectors (specificity 0,1,0) beat :root (specificity 0,0,1).
  const tenantsCssPath = join(ROOT, 'src', 'styles', 'tenants.css');
  if (tenantResult.css) {
    writeFileSync(tenantsCssPath, tenantResult.css);
  } else {
    // Write a minimal placeholder so the import in theme.css doesn't break
    writeFileSync(
      tenantsCssPath,
      '/* Generated by scripts/build-tokens.mjs — no tenant overlays found */\n',
    );
  }

  console.log('âœ“ src/styles/tokens.css');
  console.log('âœ“ src/styles/tokens.generated.css');
  console.log('âœ“ src/app/design-system/generated-tokens.ts');
  console.log('âœ“ src/app/design-system/generated-token-values.ts');
  console.log('âœ“ src/app/design-system/generated-token-descriptions.ts');
  console.log('âœ“ src/app/design-system/generated-token-vars.d.ts');
  console.log('âœ“ src/app/design-system/generated-token-refs.ts');
  console.log('âœ“ public/hds-manifest.json');
  console.log('âœ“ tailwind.config.tokens.cjs');
  console.log(
    `âœ“ src/styles/tenants.css (${tenantResult.tenants.length} tenant(s): ${tenantResult.tenants.join(', ') || 'none'})`,
  );
}
