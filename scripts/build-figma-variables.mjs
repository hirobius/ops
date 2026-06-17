#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Figma Variables Build Script
 *
 * Converts hirobius.tokens.json (W3C DTCG 2025.10) into:
 *   hirobius.figma-variables.json   — plugin-compatible import file (Variables Import/Export)
 *   hirobius.figma-variables-api.json — Figma REST API POST payload (for GitHub Action sync)
 *
 * Three collections in Figma:
 *   Hirobius/Primitives   — single "Default" mode, raw values
 *   Hirobius/Semantic     — "Light" / "Dark" modes, aliases to Primitives
 *   Hirobius/Component    — "Light" / "Dark" modes, aliases to Semantic (or Primitives)
 *
 * Run: node scripts/build-figma-variables.mjs
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const raw = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));

// ── Shared with build-tokens.mjs ─────────────────────────────────────────────
const DTCG_KEYS = new Set(['$type', '$value', '$description', '$extensions', '$schema']);

function* walkTokens(node, path = [], inheritedType = null) {
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

function resolveAlias(ref, root, visited = new Set()) {
  if (typeof ref !== 'string' || !ref.startsWith('{')) return ref;
  if (visited.has(ref)) throw new Error(`Circular reference: ${ref}`);
  visited.add(ref);
  const parts = ref.replace(/^\{|\}$/g, '').split('.');
  let node = root;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) throw new Error(`Token not found: ${ref}`);
  }
  return '$value' in node ? resolveAlias(node.$value, root, visited) : null;
}

// ── Figma type mapping ────────────────────────────────────────────────────────
const SKIP_TYPES = new Set(['shadow', 'typography', 'transition']);

function figmaType(type) {
  switch (type) {
    case 'color':
      return 'COLOR';
    case 'dimension':
    case 'duration':
    case 'fontWeight':
    case 'number':
      return 'FLOAT';
    case 'cubicBezier':
    case 'fontFamily':
      return 'STRING';
    default:
      return null;
  }
}

function clamp01(v) {
  return Math.min(1, Math.max(0, v));
}

function hexToRgb(hex) {
  const clean = hex.replace(/^#/, '');
  const expand = (ch) => ch + ch;
  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;

  if (clean.length === 3 || clean.length === 4) {
    r = parseInt(expand(clean[0]), 16);
    g = parseInt(expand(clean[1]), 16);
    b = parseInt(expand(clean[2]), 16);
    if (clean.length === 4) a = parseInt(expand(clean[3]), 16) / 255;
  } else if (clean.length === 6 || clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16);
    g = parseInt(clean.slice(2, 4), 16);
    b = parseInt(clean.slice(4, 6), 16);
    if (clean.length === 8) a = parseInt(clean.slice(6, 8), 16) / 255;
  } else {
    throw new Error(`Unsupported hex color: ${hex}`);
  }

  return { r: r / 255, g: g / 255, b: b / 255, a };
}

function oklchToRgb(oklch) {
  const match = String(oklch)
    .trim()
    .match(/^oklch\(\s*([0-9.]+)%?\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\s*\)$/i);
  if (!match) throw new Error(`Unsupported OKLCH color: ${oklch}`);

  const lightness = match[1].endsWith('%') ? parseFloat(match[1]) / 100 : parseFloat(match[1]);
  const chroma = parseFloat(match[2]);
  const hue = (parseFloat(match[3]) * Math.PI) / 180;
  const alpha = parseFloat(match[4] ?? '1');

  const aLab = chroma * Math.cos(hue);
  const bLab = chroma * Math.sin(hue);

  const l_ = lightness + 0.3963377774 * aLab + 0.2158037573 * bLab;
  const m_ = lightness - 0.1055613458 * aLab - 0.0638541728 * bLab;
  const s_ = lightness - 0.0894841775 * aLab - 1.291485548 * bLab;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  const linear = {
    r: 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    g: -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    b: -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3,
  };

  const encode = (channel) => {
    const c = clamp01(channel);
    return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  };

  return {
    r: clamp01(encode(linear.r)),
    g: clamp01(encode(linear.g)),
    b: clamp01(encode(linear.b)),
    a: clamp01(alpha),
  };
}

function hslChannelsToRgb(str) {
  // Tailwind/CSS-vars-friendly "H S% L%" or "H S% L% / A" channel triplet.
  const match = String(str)
    .trim()
    .match(/^(-?[0-9.]+)\s+(-?[0-9.]+)%\s+(-?[0-9.]+)%(?:\s*\/\s*([0-9.]+))?$/);
  if (!match) throw new Error(`Unsupported HSL channel string: ${str}`);
  const h = parseFloat(match[1]);
  const s = parseFloat(match[2]) / 100;
  const l = parseFloat(match[3]) / 100;
  const a = parseFloat(match[4] ?? '1');

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r1 = 0,
    g1 = 0,
    b1 = 0;
  if (hp >= 0 && hp < 1) {
    r1 = c;
    g1 = x;
    b1 = 0;
  } else if (hp >= 1 && hp < 2) {
    r1 = x;
    g1 = c;
    b1 = 0;
  } else if (hp >= 2 && hp < 3) {
    r1 = 0;
    g1 = c;
    b1 = x;
  } else if (hp >= 3 && hp < 4) {
    r1 = 0;
    g1 = x;
    b1 = c;
  } else if (hp >= 4 && hp < 5) {
    r1 = x;
    g1 = 0;
    b1 = c;
  } else {
    r1 = c;
    g1 = 0;
    b1 = x;
  }
  const m = l - c / 2;
  return { r: clamp01(r1 + m), g: clamp01(g1 + m), b: clamp01(b1 + m), a: clamp01(a) };
}

function colorToFigma(val) {
  if (typeof val === 'string') {
    if (val.startsWith('#')) return hexToRgb(val);
    if (val.startsWith('oklch(')) return oklchToRgb(val);
    // Tailwind raw HSL channels (e.g. "220 13% 18%") used for shadow/color.
    if (/^-?[0-9.]+\s+-?[0-9.]+%\s+-?[0-9.]+%(?:\s*\/\s*[0-9.]+)?$/.test(val.trim())) {
      return hslChannelsToRgb(val);
    }
  }
  if (val && typeof val === 'object') {
    if (Array.isArray(val.components)) {
      const [r, g, b] = val.components;
      return {
        r: clamp01(r),
        g: clamp01(g),
        b: clamp01(b),
        a: clamp01(val.alpha ?? 1),
      };
    }
    if ('r' in val && 'g' in val && 'b' in val) {
      return {
        r: clamp01(val.r),
        g: clamp01(val.g),
        b: clamp01(val.b),
        a: clamp01(val.a ?? 1),
      };
    }
  }
  throw new Error(`Unsupported color token value: ${JSON.stringify(val)}`);
}

// ── Raw value → Figma value ──────────────────────────────────────────────────
function toRawFigmaValue(value, type) {
  if (typeof value === 'string' && value.startsWith('{')) {
    const resolved = resolveAlias(value, raw);
    return toRawFigmaValue(resolved, type);
  }
  switch (type) {
    case 'color': {
      return colorToFigma(value);
    }
    case 'dimension':
      return value.value; // number (px or ms)
    case 'duration':
      return value.value; // number (ms)
    case 'fontWeight':
      return value; // number
    case 'number':
      return value; // number
    case 'cubicBezier':
      return `cubic-bezier(${value.join(', ')})`;
    case 'fontFamily':
      return Array.isArray(value) ? value[0] : String(value);
    default:
      return null;
  }
}

// ── Variable name: drop tier prefix, use / separator ─────────────────────────
const toFigmaName = (path) => path.slice(1).join('/');

// ── CSS var for codeSyntax.WEB ────────────────────────────────────────────────
const toCSSVar = (path) => `var(--${path.join('-')})`;

// ── Scopes ────────────────────────────────────────────────────────────────────
function getScopes(path, type) {
  if (type === 'color') return ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'];
  const p = path.join('.');
  if (type === 'dimension') {
    if (p.includes('radius')) return ['CORNER_RADIUS'];
    if (p.includes('font') && p.includes('size')) return ['FONT_SIZE'];
    if (p.includes('letter-spacing')) return ['LETTER_SPACING'];
    if (p.includes('space'))
      return ['GAP', 'WIDTH_HEIGHT', 'HORIZONTAL_PADDING', 'VERTICAL_PADDING'];
    return ['ALL_SCOPES'];
  }
  if (type === 'fontWeight') return ['FONT_WEIGHT'];
  if (type === 'fontFamily') return ['FONT_FAMILY'];
  if (type === 'number' && p.includes('line-height')) return ['LINE_HEIGHT'];
  return ['ALL_SCOPES'];
}

// ── Collection name helpers ───────────────────────────────────────────────────
const COLLECTION = {
  primitive: 'Hirobius/Primitives',
  semantic: 'Hirobius/Semantic',
  component: 'Hirobius/Component',
};

function refToCollection(refPath) {
  const tier = refPath[0];
  return COLLECTION[tier] ?? COLLECTION.primitive;
}

// ── Resolve a token value to a Figma alias or raw value ───────────────────────
function toFigmaValueOrAlias(ref, type) {
  if (typeof ref === 'string' && ref.startsWith('{')) {
    const refPath = ref.replace(/^\{|\}$/g, '').split('.');
    return {
      type: 'VARIABLE_ALIAS',
      collection: refToCollection(refPath),
      name: refPath.slice(1).join('/'),
    };
  }
  return { type: 'RAW', value: toRawFigmaValue(ref, type) };
}

// ── Typography composite flattening ──────────────────────────────────────────
// W3C DTCG composite typography tokens are not directly representable in Figma
// Variables (which only support scalar types). This map expands each 5-key
// composite into individual scalar variables that Figma can consume, preserving
// the alias chain so Figma knows these point to Primitive values.
const SUB_PROP = {
  fontFamily: { key: 'font-family', type: 'fontFamily' },
  fontSize: { key: 'font-size', type: 'dimension' },
  fontWeight: { key: 'font-weight', type: 'fontWeight' },
  letterSpacing: { key: 'letter-spacing', type: 'dimension' },
  lineHeight: { key: 'line-height', type: 'number' },
};

function expandTypography(tokens) {
  const result = [];
  for (const { path, type, value, description } of tokens) {
    if (type !== 'typography' || typeof value !== 'object' || Array.isArray(value)) continue;
    for (const [camel, { key, type: subType }] of Object.entries(SUB_PROP)) {
      const ref = value[camel];
      if (ref === undefined) continue;
      result.push({
        path: [...path, key],
        type: subType,
        value: ref,
        description: description ?? '',
      });
    }
  }
  return result;
}

// ── Collect and bucket tokens ─────────────────────────────────────────────────
const allWalked = [...walkTokens(raw)].filter((t) => t.type);
const allTokens = allWalked.filter((t) => !SKIP_TYPES.has(t.type) && figmaType(t.type));
const primitives = allTokens.filter((t) => t.path[0] === 'primitive');
const components = allTokens.filter((t) => t.path[0] === 'component');

// Merge flattened 9-style typography ramp (45 vars) into the semantic collection
const typographyExpanded = expandTypography(allWalked.filter((t) => t.type === 'typography'));
const semantics = [...allTokens.filter((t) => t.path[0] === 'semantic'), ...typographyExpanded];

// ── Build plugin-compatible JSON ─────────────────────────────────────────────
/**
 * Plugin format (Variables Import/Export — figma.com/community/plugin/1254848311/)
 * Aliases use { aliasCollection, aliasVariable } — resolved by the plugin.
 * Raw values use Figma's native types: COLOR → {r,g,b,a}, FLOAT → number, STRING → string.
 */
function buildPluginFormat() {
  function pluginValue(ref, type) {
    const resolved = toFigmaValueOrAlias(ref, type);
    if (resolved.type === 'VARIABLE_ALIAS') {
      return { aliasCollection: resolved.collection, aliasVariable: resolved.name };
    }
    return resolved.value;
  }

  return {
    version: '1.0',
    collections: [
      {
        name: COLLECTION.primitive,
        modes: ['Default'],
        variables: primitives.map(({ path, type, value, description }) => ({
          name: toFigmaName(path),
          resolvedType: figmaType(type),
          description: description ?? '',
          scopes: getScopes(path, type),
          codeSyntax: { WEB: toCSSVar(path) },
          valuesByMode: {
            Default: toRawFigmaValue(value, type),
          },
        })),
      },
      {
        name: COLLECTION.semantic,
        modes: ['Light', 'Dark'],
        variables: semantics.map(({ path, type, value, extensions, description }) => {
          const modes = extensions?.['com.hirobius.modes'];
          const lightRef = modes?.light ?? value;
          const darkRef = modes?.dark ?? value;
          return {
            name: toFigmaName(path),
            resolvedType: figmaType(type),
            description: description ?? '',
            scopes: getScopes(path, type),
            codeSyntax: { WEB: toCSSVar(path) },
            valuesByMode: {
              Light: pluginValue(lightRef, type),
              Dark: pluginValue(darkRef, type),
            },
          };
        }),
      },
      {
        name: COLLECTION.component,
        modes: ['Light', 'Dark'],
        variables: components.map(({ path, type, value, extensions, description }) => {
          const modes = extensions?.['com.hirobius.modes'];
          const lightRef = modes?.light ?? value;
          const darkRef = modes?.dark ?? value;
          return {
            name: toFigmaName(path),
            resolvedType: figmaType(type),
            description: description ?? '',
            scopes: getScopes(path, type),
            codeSyntax: { WEB: toCSSVar(path) },
            valuesByMode: {
              Light: pluginValue(lightRef, type),
              Dark: pluginValue(darkRef, type),
            },
          };
        }),
      },
    ],
  };
}

// ── Build Figma REST API payload ──────────────────────────────────────────────
/**
 * REST API format for POST /v1/files/{file_key}/variables
 * Uses temporary IDs (strings) that Figma resolves within the same request.
 * All variables use action: "CREATE" — suitable for initial setup.
 * For updates, the GitHub Action's sync script fetches existing IDs first.
 */
function buildAPIFormat() {
  const tempId = (prefix, path) => `${prefix}:${path.join('.')}`;
  const modeId = (collection, mode) => `mode:${collection}:${mode}`;
  const collId = (name) => `col:${name}`;

  const variableCollections = [
    {
      action: 'CREATE',
      id: collId('primitive'),
      name: COLLECTION.primitive,
      initialModeId: modeId('primitive', 'default'),
    },
    {
      action: 'CREATE',
      id: collId('semantic'),
      name: COLLECTION.semantic,
      initialModeId: modeId('semantic', 'light'),
    },
    {
      action: 'CREATE',
      id: collId('component'),
      name: COLLECTION.component,
      initialModeId: modeId('component', 'light'),
    },
  ];

  const variableModes = [
    {
      action: 'CREATE',
      id: modeId('primitive', 'default'),
      name: 'Default',
      variableCollectionId: collId('primitive'),
    },
    {
      action: 'CREATE',
      id: modeId('semantic', 'light'),
      name: 'Light',
      variableCollectionId: collId('semantic'),
    },
    {
      action: 'CREATE',
      id: modeId('semantic', 'dark'),
      name: 'Dark',
      variableCollectionId: collId('semantic'),
    },
    {
      action: 'CREATE',
      id: modeId('component', 'light'),
      name: 'Light',
      variableCollectionId: collId('component'),
    },
    {
      action: 'CREATE',
      id: modeId('component', 'dark'),
      name: 'Dark',
      variableCollectionId: collId('component'),
    },
  ];

  const variables = [];
  const variableModeValues = [];

  function apiValue(ref, type, _fallbackRaw) {
    const resolved = toFigmaValueOrAlias(ref, type);
    if (resolved.type === 'VARIABLE_ALIAS') {
      const tier = ref.replace(/^\{|\}$/g, '').split('.')[0];
      const refPath = ref.replace(/^\{|\}$/g, '').split('.');
      return {
        type: 'VARIABLE_ALIAS',
        id: tempId(tier === 'primitive' ? 'prim' : tier === 'semantic' ? 'sem' : 'comp', refPath),
      };
    }
    return resolved.value;
  }

  // Primitives
  for (const { path, type, value, description } of primitives) {
    const id = tempId('prim', path);
    variables.push({
      action: 'CREATE',
      id,
      name: toFigmaName(path),
      variableCollectionId: collId('primitive'),
      resolvedType: figmaType(type),
      description: description ?? '',
      scopes: getScopes(path, type),
      codeSyntax: { WEB: toCSSVar(path) },
    });
    variableModeValues.push({
      variableId: id,
      modeId: modeId('primitive', 'default'),
      value: toRawFigmaValue(value, type),
    });
  }

  // Semantics
  for (const { path, type, value, extensions, description } of semantics) {
    const id = tempId('sem', path);
    const modes = extensions?.['com.hirobius.modes'];
    variables.push({
      action: 'CREATE',
      id,
      name: toFigmaName(path),
      variableCollectionId: collId('semantic'),
      resolvedType: figmaType(type),
      description: description ?? '',
      scopes: getScopes(path, type),
      codeSyntax: { WEB: toCSSVar(path) },
    });
    variableModeValues.push(
      {
        variableId: id,
        modeId: modeId('semantic', 'light'),
        value: apiValue(modes?.light ?? value, type),
      },
      {
        variableId: id,
        modeId: modeId('semantic', 'dark'),
        value: apiValue(modes?.dark ?? value, type),
      },
    );
  }

  // Components
  for (const { path, type, value, extensions, description } of components) {
    const id = tempId('comp', path);
    const modes = extensions?.['com.hirobius.modes'];
    variables.push({
      action: 'CREATE',
      id,
      name: toFigmaName(path),
      variableCollectionId: collId('component'),
      resolvedType: figmaType(type),
      description: description ?? '',
      scopes: getScopes(path, type),
      codeSyntax: { WEB: toCSSVar(path) },
    });
    variableModeValues.push(
      {
        variableId: id,
        modeId: modeId('component', 'light'),
        value: apiValue(modes?.light ?? value, type),
      },
      {
        variableId: id,
        modeId: modeId('component', 'dark'),
        value: apiValue(modes?.dark ?? value, type),
      },
    );
  }

  return { variableCollections, variableModes, variables, variableModeValues };
}

// ── Write output files ────────────────────────────────────────────────────────
const pluginJson = buildPluginFormat();
const apiJson = buildAPIFormat();

writeFileSync(join(ROOT, 'hirobius.figma-variables.json'), JSON.stringify(pluginJson, null, 2));
writeFileSync(join(ROOT, 'hirobius.figma-variables-api.json'), JSON.stringify(apiJson, null, 2));

console.log('✓ hirobius.figma-variables.json      (plugin import)');
console.log('✓ hirobius.figma-variables-api.json  (REST API / GitHub Action)');
console.log(
  `  ${pluginJson.collections.reduce((n, c) => n + c.variables.length, 0)} variables across ${pluginJson.collections.length} collections`,
);
