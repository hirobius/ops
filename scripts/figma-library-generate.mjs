#!/usr/bin/env node
/**
 * figma-library-generate.mjs
 *
 * Authoritative write-path: hirobius.tokens.json → Figma Variables REST API payload.
 *
 * Modes:
 *   --dry-run  (DEFAULT) Print the POST /v1/files/:file_key/variables JSON payload
 *              to stdout, then exit 0. No network calls. Safe to run any time.
 *   --live     POST the payload to Figma using FIGMA_TOKEN + FIGMA_FILE_KEY env vars.
 *              Requires Adrian's explicit authorization. Never called autonomously.
 *   --summary  Print a human-readable token-count summary instead of raw JSON.
 *
 * Env vars (live mode only — do NOT set these in .env* files without Adrian approval):
 *   FIGMA_TOKEN     — Personal access token or OAuth token with write scope
 *   FIGMA_FILE_KEY  — The Figma file key (from file URL: figma.com/design/<KEY>/...)
 *
 * Three Variable collections created/updated:
 *   Hirobius/Primitives  — "Default" mode, raw resolved values
 *   Hirobius/Semantic    — "Light" / "Dark" modes, aliases to Primitives
 *   Hirobius/Component   — "Light" / "Dark" modes, aliases to Semantic
 *
 * Built on top of build-figma-variables.mjs logic.
 * Run: node scripts/figma-library-generate.mjs [--dry-run] [--live] [--summary]
 */

import { readFileSync }  from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── Parse CLI flags ───────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = !args.includes('--live');   // dry-run is default
const SUMMARY  = args.includes('--summary');

// ── Load tokens ───────────────────────────────────────────────────────────────
let raw;
try {
  raw = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
} catch (err) {
  console.error(`ERROR: Could not read hirobius.tokens.json — ${err.message}`);
  process.exit(1);
}

// ── Token walker (W3C DTCG) ───────────────────────────────────────────────────
const DTCG_KEYS = new Set(['$type', '$value', '$description', '$extensions', '$schema']);

function* walkTokens(node, path = [], inheritedType = null) {
  if (!node || typeof node !== 'object') return;
  const type = node.$type ?? inheritedType;
  if ('$value' in node) {
    yield { path, type, value: node.$value, extensions: node.$extensions, description: node.$description };
    return;
  }
  for (const key of Object.keys(node)) {
    if (DTCG_KEYS.has(key)) continue;
    yield* walkTokens(node[key], [...path, key], type);
  }
}

// ── Alias resolution ──────────────────────────────────────────────────────────
function resolveAlias(ref, visited = new Set()) {
  if (typeof ref !== 'string' || !ref.startsWith('{')) return ref;
  if (visited.has(ref)) throw new Error(`Circular reference: ${ref}`);
  visited.add(ref);
  const parts = ref.replace(/^\{|\}$/g, '').split('.');
  let node = raw;
  for (const p of parts) {
    node = node?.[p];
    if (node === undefined) throw new Error(`Alias not found: ${ref}`);
  }
  return '$value' in node ? resolveAlias(node.$value, visited) : null;
}

// ── Figma type mapping ────────────────────────────────────────────────────────
/** Types that Figma Variables cannot represent; skip them. */
const SKIP_TYPES = new Set(['shadow', 'typography', 'transition', 'gradient', 'border']);

function figmaType(type) {
  switch (type) {
    case 'color':       return 'COLOR';
    case 'dimension':
    case 'duration':
    case 'fontWeight':
    case 'number':      return 'FLOAT';
    case 'cubicBezier':
    case 'fontFamily':
    case 'string':      return 'STRING';
    default:            return null;
  }
}

// ── Color conversion ──────────────────────────────────────────────────────────
function clamp01(v) { return Math.min(1, Math.max(0, v)); }

function hexToRgba(hex) {
  const h = hex.replace(/^#/, '');
  const x = h.length <= 4 ? [...h].map(c => c + c).join('') : h;
  return {
    r: parseInt(x.slice(0, 2), 16) / 255,
    g: parseInt(x.slice(2, 4), 16) / 255,
    b: parseInt(x.slice(4, 6), 16) / 255,
    a: x.length === 8 ? parseInt(x.slice(6, 8), 16) / 255 : 1,
  };
}

function oklchToRgba(str) {
  const m = String(str).trim()
    .match(/^oklch\(\s*([0-9.]+)%?\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\s*\)$/i);
  if (!m) throw new Error(`Unsupported OKLCH: ${str}`);
  const L  = m[1].includes('.') && parseFloat(m[1]) <= 1 ? parseFloat(m[1]) : parseFloat(m[1]) / 100;
  const C  = parseFloat(m[2]);
  const H  = parseFloat(m[3]) * Math.PI / 180;
  const a_ = parseFloat(m[4] ?? '1');
  const a  = C * Math.cos(H);
  const b  = C * Math.sin(H);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  const l3 = l_ ** 3, m3 = m_ ** 3, s3 = s_ ** 3;
  const lin = {
    r:  4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3,
    g: -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3,
    b: -0.0041960863 * l3 - 0.7034186147 * m3 + 1.7076147010 * s3,
  };
  const srgb = (c) => { const v = clamp01(c); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1/2.4) - 0.055; };
  return { r: clamp01(srgb(lin.r)), g: clamp01(srgb(lin.g)), b: clamp01(srgb(lin.b)), a: clamp01(a_) };
}

function colorToFigmaRgba(val) {
  if (typeof val === 'string') {
    if (val.startsWith('#'))      return hexToRgba(val);
    if (val.toLowerCase().startsWith('oklch(')) return oklchToRgba(val);
    // CSS rgb/rgba — best-effort passthrough
    const m = val.match(/rgba?\(\s*([0-9.]+)\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)(?:\s*,\s*([0-9.]+))?\s*\)/i);
    if (m) return { r: +m[1]/255, g: +m[2]/255, b: +m[3]/255, a: m[4] !== undefined ? +m[4] : 1 };
  }
  if (val && typeof val === 'object') {
    if ('r' in val && 'g' in val && 'b' in val) {
      return { r: clamp01(val.r), g: clamp01(val.g), b: clamp01(val.b), a: clamp01(val.a ?? 1) };
    }
  }
  throw new Error(`Unsupported color value: ${JSON.stringify(val)}`);
}

// ── Raw value → Figma native value ───────────────────────────────────────────
function toRawFigmaValue(value, type) {
  if (typeof value === 'string' && value.startsWith('{')) {
    return toRawFigmaValue(resolveAlias(value), type);
  }
  switch (type) {
    case 'color':      return colorToFigmaRgba(value);
    case 'dimension':
    case 'duration':
      // value may be { value: number, unit: 'px'|'ms' } or a bare number
      if (value && typeof value === 'object' && 'value' in value) return value.value;
      if (typeof value === 'string') {
        const n = parseFloat(value);
        return isNaN(n) ? 0 : n;
      }
      return typeof value === 'number' ? value : 0;
    case 'fontWeight': return typeof value === 'number' ? value : parseFloat(value) || 400;
    case 'number':     return typeof value === 'number' ? value : parseFloat(value) || 0;
    case 'cubicBezier':
      return Array.isArray(value) ? `cubic-bezier(${value.join(', ')})` : String(value);
    case 'fontFamily':
      return Array.isArray(value) ? value[0] : String(value);
    case 'string':
      return String(value);
    default:           return null;
  }
}

// ── Scopes ────────────────────────────────────────────────────────────────────
function getScopes(path, type) {
  if (type === 'color') return ['ALL_FILLS', 'STROKE_COLOR', 'EFFECT_COLOR'];
  const p = path.join('.');
  if (type === 'dimension') {
    if (p.includes('radius'))                                return ['CORNER_RADIUS'];
    if (p.includes('font') && p.includes('size'))            return ['FONT_SIZE'];
    if (p.includes('letter') && p.includes('spacing'))       return ['LETTER_SPACING'];
    if (p.includes('space') || p.includes('gap') || p.includes('padding') || p.includes('margin'))
      return ['GAP', 'WIDTH_HEIGHT', 'HORIZONTAL_PADDING', 'VERTICAL_PADDING'];
    return ['ALL_SCOPES'];
  }
  if (type === 'fontWeight') return ['FONT_WEIGHT'];
  if (type === 'fontFamily') return ['FONT_FAMILY'];
  if (type === 'number' && (p.includes('line') && p.includes('height'))) return ['LINE_HEIGHT'];
  return ['ALL_SCOPES'];
}

// ── Collection identifiers ────────────────────────────────────────────────────
const COLL = {
  primitive: { id: 'col:primitive', name: 'Hirobius/Primitives' },
  semantic:  { id: 'col:semantic',  name: 'Hirobius/Semantic'   },
  component: { id: 'col:component', name: 'Hirobius/Component'  },
};

const MODE_ID = {
  'primitive:default': 'mode:primitive:default',
  'semantic:light':    'mode:semantic:light',
  'semantic:dark':     'mode:semantic:dark',
  'component:light':   'mode:component:light',
  'component:dark':    'mode:component:dark',
};

function tierToPrefix(tier) {
  return tier === 'primitive' ? 'prim' : tier === 'semantic' ? 'sem' : 'comp';
}

function tempVarId(path) {
  const tier = path[0];
  return `${tierToPrefix(tier)}:${path.join('.')}`;
}

function figmaName(path) {
  // Figma variable name: drop tier, join with "/"
  return path.slice(1).join('/');
}

function cssVar(path) {
  return `var(--${path.join('-')})`;
}

// ── Resolve an alias ref to a Figma valuesByMode entry ───────────────────────
function resolveToFigmaValue(ref, type) {
  if (typeof ref === 'string' && ref.startsWith('{')) {
    const refPath = ref.replace(/^\{|\}$/g, '').split('.');
    return { type: 'VARIABLE_ALIAS', id: tempVarId(refPath) };
  }
  return toRawFigmaValue(ref, type);
}

// ── Bucket tokens by tier ─────────────────────────────────────────────────────
const allTokens  = [...walkTokens(raw)].filter(t => t.type && !SKIP_TYPES.has(t.type) && figmaType(t.type) !== null);
const primitives = allTokens.filter(t => t.path[0] === 'primitive');
const semantics  = allTokens.filter(t => t.path[0] === 'semantic');
const components = allTokens.filter(t => t.path[0] === 'component');

// ── Build Figma REST API payload ──────────────────────────────────────────────
/**
 * Produces a payload for POST /v1/files/{file_key}/variables
 * Ref: https://www.figma.com/developers/api#post-variables-endpoint
 *
 * Uses temporary IDs throughout — Figma resolves them within the same request.
 * All actions are "CREATE"; an upsert/sync script would compare existing IDs first.
 */
function buildPayload() {
  // ── Collections ──────────────────────────────────────────────────────────
  const variableCollections = [
    {
      action: 'CREATE',
      id:     COLL.primitive.id,
      name:   COLL.primitive.name,
      initialModeId: MODE_ID['primitive:default'],
    },
    {
      action: 'CREATE',
      id:     COLL.semantic.id,
      name:   COLL.semantic.name,
      initialModeId: MODE_ID['semantic:light'],
    },
    {
      action: 'CREATE',
      id:     COLL.component.id,
      name:   COLL.component.name,
      initialModeId: MODE_ID['component:light'],
    },
  ];

  // ── Modes ────────────────────────────────────────────────────────────────
  const variableModes = [
    { action: 'CREATE', id: MODE_ID['primitive:default'], name: 'Default', variableCollectionId: COLL.primitive.id },
    { action: 'CREATE', id: MODE_ID['semantic:light'],    name: 'Light',   variableCollectionId: COLL.semantic.id  },
    { action: 'CREATE', id: MODE_ID['semantic:dark'],     name: 'Dark',    variableCollectionId: COLL.semantic.id  },
    { action: 'CREATE', id: MODE_ID['component:light'],   name: 'Light',   variableCollectionId: COLL.component.id },
    { action: 'CREATE', id: MODE_ID['component:dark'],    name: 'Dark',    variableCollectionId: COLL.component.id },
  ];

  const variables         = [];
  const variableModeValues = [];

  // ── Primitives ───────────────────────────────────────────────────────────
  for (const { path, type, value, description } of primitives) {
    const id = tempVarId(path);
    variables.push({
      action:               'CREATE',
      id,
      name:                 figmaName(path),
      variableCollectionId: COLL.primitive.id,
      resolvedType:         figmaType(type),
      description:          description ?? '',
      scopes:               getScopes(path, type),
      codeSyntax:           { WEB: cssVar(path) },
    });
    let rawVal;
    try { rawVal = toRawFigmaValue(value, type); } catch { rawVal = null; }
    if (rawVal !== null) {
      variableModeValues.push({
        variableId: id,
        modeId:     MODE_ID['primitive:default'],
        value:      rawVal,
      });
    }
  }

  // ── Semantics ────────────────────────────────────────────────────────────
  for (const { path, type, value, extensions, description } of semantics) {
    const id    = tempVarId(path);
    const modes = extensions?.['com.hirobius.modes'];
    const light = modes?.light ?? value;
    const dark  = modes?.dark  ?? value;
    variables.push({
      action:               'CREATE',
      id,
      name:                 figmaName(path),
      variableCollectionId: COLL.semantic.id,
      resolvedType:         figmaType(type),
      description:          description ?? '',
      scopes:               getScopes(path, type),
      codeSyntax:           { WEB: cssVar(path) },
    });
    variableModeValues.push(
      { variableId: id, modeId: MODE_ID['semantic:light'], value: resolveToFigmaValue(light, type) },
      { variableId: id, modeId: MODE_ID['semantic:dark'],  value: resolveToFigmaValue(dark,  type) },
    );
  }

  // ── Components ───────────────────────────────────────────────────────────
  for (const { path, type, value, extensions, description } of components) {
    const id    = tempVarId(path);
    const modes = extensions?.['com.hirobius.modes'];
    const light = modes?.light ?? value;
    const dark  = modes?.dark  ?? value;
    variables.push({
      action:               'CREATE',
      id,
      name:                 figmaName(path),
      variableCollectionId: COLL.component.id,
      resolvedType:         figmaType(type),
      description:          description ?? '',
      scopes:               getScopes(path, type),
      codeSyntax:           { WEB: cssVar(path) },
    });
    variableModeValues.push(
      { variableId: id, modeId: MODE_ID['component:light'], value: resolveToFigmaValue(light, type) },
      { variableId: id, modeId: MODE_ID['component:dark'],  value: resolveToFigmaValue(dark,  type) },
    );
  }

  return { variableCollections, variableModes, variables, variableModeValues };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  let payload;
  try {
    payload = buildPayload();
  } catch (err) {
    console.error(`ERROR building payload: ${err.message}`);
    process.exit(1);
  }

  const totalVars = payload.variables.length;
  const totalVals = payload.variableModeValues.length;
  const colNames  = payload.variableCollections.map(c => c.name).join(', ');

  if (SUMMARY) {
    // Human-readable summary — does NOT print raw payload
    console.log('figma-library-generate summary');
    console.log('─────────────────────────────────────────────────');
    console.log(`Collections : ${payload.variableCollections.length}  (${colNames})`);
    console.log(`Modes       : ${payload.variableModes.length}`);
    console.log(`Variables   : ${totalVars}  (${primitives.length} primitives, ${semantics.length} semantics, ${components.length} components)`);
    console.log(`Mode values : ${totalVals}`);
    console.log('─────────────────────────────────────────────────');
    const byType = {};
    for (const v of payload.variables) {
      byType[v.resolvedType] = (byType[v.resolvedType] ?? 0) + 1;
    }
    for (const [t, n] of Object.entries(byType)) {
      console.log(`  ${t.padEnd(10)} ${n}`);
    }
    console.log('─────────────────────────────────────────────────');
    if (DRY_RUN) console.log('Mode: dry-run (no API call)');
    return;
  }

  if (DRY_RUN) {
    // Default safe mode: print the API payload JSON and exit
    process.stdout.write(JSON.stringify(payload, null, 2));
    process.stdout.write('\n');
    // Print summary to stderr so stdout stays clean JSON
    console.error(`\n[dry-run] ${totalVars} variables across ${payload.variableCollections.length} collections (${totalVals} mode values)`);
    console.error(`[dry-run] POST /v1/files/{FIGMA_FILE_KEY}/variables  — no call made`);
    return;
  }

  // ── Live mode (--live flag) ───────────────────────────────────────────────
  // REQUIRES: FIGMA_TOKEN and FIGMA_FILE_KEY env vars (set by Adrian only)
  const FIGMA_TOKEN    = process.env.FIGMA_TOKEN;
  const FIGMA_FILE_KEY = process.env.FIGMA_FILE_KEY;

  if (!FIGMA_TOKEN) {
    console.error('ERROR: FIGMA_TOKEN env var is not set. Set it before running --live.');
    console.error('       Never store this token in .env* files without Adrian approval.');
    process.exit(1);
  }
  if (!FIGMA_FILE_KEY) {
    console.error('ERROR: FIGMA_FILE_KEY env var is not set. Set it to the Figma file key.');
    process.exit(1);
  }

  const url = `https://api.figma.com/v1/files/${FIGMA_FILE_KEY}/variables`;
  console.log(`[live] POSTing ${totalVars} variables to ${url} …`);

  let resp;
  try {
    resp = await fetch(url, {
      method:  'POST',
      headers: {
        'X-Figma-Token': FIGMA_TOKEN,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error(`ERROR: Network request failed — ${err.message}`);
    process.exit(1);
  }

  const body = await resp.text();
  if (!resp.ok) {
    console.error(`ERROR: Figma API returned ${resp.status} ${resp.statusText}`);
    console.error(body);
    process.exit(1);
  }

  console.log(`OK  Figma API ${resp.status} — ${totalVars} variables synced`);
  try {
    const result = JSON.parse(body);
    if (result.meta) {
      const created = Object.keys(result.meta.variables ?? {}).length;
      console.log(`    Created/updated: ${created} variables`);
    }
  } catch { /* non-JSON response, already printed raw */ }
}

main().catch(err => {
  console.error(`FATAL: ${err.message}`);
  process.exit(1);
});
