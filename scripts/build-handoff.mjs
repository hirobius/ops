#!/usr/bin/env node
/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Hirobius Design System — Handoff Doc Builder
 *
 * Auto-regenerates token reference tables in DESIGN-HANDOFF.md from
 * hirobius.tokens.json. Sections between <!-- auto:start:SECTION -->
 * and <!-- auto:end:SECTION --> markers are replaced on every run.
 *
 * Sections managed:
 *   brand-identity      — brand blue, font, spacing base, radius rule
 *   primitives-color    — primitive color ramp tables
 *   semantic-accent     — semantic.accent.* state table
 *   semantic-color      — semantic.color bg/text/border/icon tables
 *   typography          — semantic.typography.* type ramp + primitive font sizes
 *   spacing             — primitive.space.* scale
 *   size                — primitive.size.* scale + width measures
 *   semantic-space      — semantic.space.* usage-tier aliases
 *   density             — --hds-space-* comfortable/compact table (hardcoded design decision)
 *   radius              — primitive.radius.* table
 *   motion              — primitive.duration.* + primitive.easing.* table
 *   agent-constraints   — hard design constraints with live brand values
 *
 * Run: node scripts/build-handoff.mjs
 * Or:  pnpm tokens  (runs as part of full token build)
 *
 * Manual sections of DESIGN-HANDOFF.md are preserved exactly.
 * Only content inside the auto markers is replaced.
 *
 * Pure functions are exported so they can be unit-tested with Vitest.
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname }               from 'path';
import { fileURLToPath }               from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = join(__dirname, '..');

// ── String helpers ────────────────────────────────────────────────────────────
/** Escapes a string for use inside a RegExp. */
export function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Builds a Markdown table row from cell values. */
export function row(...cells) {
  return `| ${cells.join(' | ')} |`;
}

/** Builds a Markdown table header row + separator from column labels. */
export function header(...cells) {
  return [row(...cells), row(...cells.map(() => '---'))].join('\n');
}

// ── Section replacement ───────────────────────────────────────────────────────
/**
 * Replaces content between <!-- auto:start:name --> and <!-- auto:end:name -->
 * markers in `doc`. Returns the updated string.
 * Logs a warning and returns `doc` unchanged if the marker is not found.
 */
export function replaceSection(doc, name, content) {
  const start = `<!-- auto:start:${name} -->`;
  const end   = `<!-- auto:end:${name} -->`;
  const re    = new RegExp(`${escRe(start)}[\\s\\S]*?${escRe(end)}`, 'g');
  const block = `${start}\n${content.trim()}\n${end}`;
  if (!doc.includes(start)) {
    console.warn(`  ⚠  Marker not found: ${name} — section skipped.`);
    return doc;
  }
  return doc.replace(re, block);
}

// ── Token tree walker ─────────────────────────────────────────────────────────
const DTCG = new Set(['$type', '$value', '$description', '$extensions', '$schema']);

/**
 * Walks a W3C DTCG token subtree, yielding leaf token entries.
 * Note: yields { path, value, desc, ext } — different from walkTokens in
 * build-tokens.mjs which yields { path, type, value, extensions }.
 */
export function* walk(node, path = []) {
  if (!node || typeof node !== 'object') return;
  if ('$value' in node) {
    yield { path, value: node.$value, desc: node.$description, ext: node.$extensions };
    return;
  }
  for (const k of Object.keys(node)) {
    if (DTCG.has(k)) continue;
    yield* walk(node[k], [...path, k]);
  }
}

// ── Extension helpers ─────────────────────────────────────────────────────────
/** Extracts the Dark mode value from a token's $extensions, or returns null. */
export function darkMode(ext) {
  return ext?.['com.figma.variables']?.modes?.Dark ?? null;
}

// ── Alias resolver ────────────────────────────────────────────────────────────
/**
 * Resolves a {dot.path} alias to its scalar value from the raw token tree.
 * Returns the fallback string if the path isn't found or isn't a leaf token.
 * Dimension objects are returned as "Npx" or "Nms".
 */
export function resolveRef(ref, raw) {
  if (typeof ref !== 'string' || !ref.startsWith('{')) {
    if (ref && typeof ref === 'object' && 'value' in ref && 'unit' in ref) {
      return `${ref.value}${ref.unit}`;
    }
    return String(ref ?? '');
  }
  const path = ref.slice(1, -1).split('.');
  let node = raw;
  for (const k of path) { node = node?.[k]; if (node === undefined) return ref; }
  const val = node?.$value ?? node;
  if (val && typeof val === 'object' && 'value' in val && 'unit' in val) return `${val.value}${val.unit}`;
  if (typeof val === 'number' || typeof val === 'string') return String(val);
  return ref;
}

// ── Section builders ──────────────────────────────────────────────────────────
/** Builds the primitive color ramp table. */
export function buildPrimitivesColor(raw) {
  const lines = [header('Token', 'Value', 'Notes')];
  for (const { path, value, desc } of walk(raw.primitive?.color ?? {})) {
    const tok  = 'primitive.color.' + path.join('.');
    const note = desc ?? '';
    lines.push(row(`\`${tok}\``, `\`${value}\``, note));
  }
  return lines.join('\n');
}

/** Builds the semantic accent state table. */
export function buildSemanticAccent(raw) {
  const acc   = raw.semantic?.accent ?? {};
  const lines = [header('Token', 'Light', 'Dark', 'Role')];
  for (const { path, value, desc, ext } of walk(acc)) {
    const tok  = 'semantic.accent.' + path.join('.');
    const dark = darkMode(ext) ?? value;
    const note = desc?.split('—')[0].trim() ?? '';
    lines.push(row(`\`${tok}\``, `\`${value}\``, `\`${dark}\``, note));
  }
  return lines.join('\n');
}

/** Builds the semantic color (bg/text/border/icon) table. */
export function buildSemanticColor(raw) {
  const col   = raw.semantic?.color ?? {};
  const lines = [header('Token', 'Light', 'Dark', 'Notes')];
  for (const { path, value, desc, ext } of walk(col)) {
    const tok      = 'semantic.color.' + path.join('.');
    const dark     = darkMode(ext) ?? '—';
    const note     = desc ?? '';
    const lightVal = typeof value === 'string' && value.startsWith('{')
      ? value : `\`${value}\``;
    const darkVal  = typeof dark === 'string' && dark.startsWith('{')
      ? dark : `\`${dark}\``;
    lines.push(row(`\`${tok}\``, lightVal, darkVal, note));
  }
  return lines.join('\n');
}

/** Builds the primitive spacing scale table. */
export function buildSpacing(raw) {
  const space = raw.primitive?.space ?? {};
  const lines = [header('Token', 'Value', 'Notes')];
  for (const { path, value, desc } of walk(space)) {
    const tok = 'primitive.space.' + path.join('.');
    const val = typeof value === 'object'
      ? `${value.value}${value.unit}`
      : String(value);
    lines.push(row(`\`${tok}\``, `\`${val}\``, desc ?? ''));
  }
  return lines.join('\n');
}

/** Builds the semantic space alias table. */
export function buildSemanticSpace(raw) {
  const space = raw.semantic?.space ?? {};
  const lines = [header('Token', 'Value', 'Notes')];
  for (const { path, value, desc } of walk(space)) {
    const tok = 'semantic.space.' + path.join('.');
    const val = resolveRef(value, raw);
    lines.push(row(`\`${tok}\``, `\`${val}\``, desc ?? ''));
  }
  return lines.join('\n');
}

/** Builds the primitive size scale table. */
export function buildSize(raw) {
  const size = raw.primitive?.size ?? {};
  const lines = [header('Token', 'Value', 'Notes')];

  for (const { path, value, desc } of walk(size)) {
    const head = path[0];
    if (head === 'interactive' || head === 'width') continue;
    const tok = 'primitive.size.' + path.join('.');
    const val = typeof value === 'object'
      ? `${value.value}${value.unit}`
      : String(value);
    lines.push(row(`\`${tok}\``, `\`${val}\``, desc ?? ''));
  }

  lines.push(row('`primitive.size.interactive.min`', `\`${resolveRef(size.interactive?.min?.$value ?? '', raw)}\``, 'Compact touch target / hit-area width'));
  lines.push('');
  lines.push('Use `primitive.size.*` for explicit widths and heights. Keep `primitive.space.*` for layout rhythm, padding, and gaps.');
  lines.push('');
  lines.push('### Primitive width measures');
  lines.push('');
  lines.push(header('Token', 'Value', 'Notes'));

  for (const { path, value, desc } of walk(size.width ?? {})) {
    const tok = 'primitive.size.width.' + path.join('.');
    const val = typeof value === 'object'
      ? `${value.value}${value.unit}`
      : String(value);
    lines.push(row(`\`${tok}\``, `\`${val}\``, desc ?? ''));
  }

  return lines.join('\n');
}

/** Builds the Brand Identity table from live token values. */
export function buildBrandIdentity(raw) {
  const blue    = raw.primitive?.color?.blue?.['500']?.$value ?? '?';
  const fontRaw = raw.primitive?.typography?.family?.primary?.$value;
  const font    = (Array.isArray(fontRaw) ? fontRaw[0] : fontRaw) ?? '?';
  const monoRaw = raw.primitive?.typography?.family?.mono?.$value;
  const mono    = (Array.isArray(monoRaw) ? monoRaw[0] : monoRaw) ?? '?';
  const spaceBase = resolveRef(raw.primitive?.space?.['1']?.$value ?? '4px', raw);
  const action    = resolveRef(raw.semantic?.radius?.action?.$value ?? '{primitive.radius.4}', raw);
  const radius8   = resolveRef(raw.primitive?.radius?.[8]?.$value ?? '8px', raw);
  const lines = [header('Attribute', 'Value')];
  lines.push(row('Brand blue',        `\`${blue.toUpperCase()}\` (\`primitive.color.blue.500\`)`));
  lines.push(row('Font',              `${font} (self-hosted) + ${mono} (monospace)`));
  lines.push(row('Neutral scale',     'True monochromatic — equal RGB channels, no warm/cool tint'));
  lines.push(row('Spacing base',      spaceBase));
  lines.push(row('Action radius',     `\`${action}\` (\`semantic.radius.action\`) for interactive controls`));
  lines.push(row('Card corners',      `\`${radius8}\` (\`primitive.radius.8\`)`));
  lines.push(row('Motion philosophy', 'Depth via interaction (BulgeCard parallax), not drop shadows'));
  return lines.join('\n');
}

/** Builds the type ramp table from semantic typography composite tokens. */
export function buildTypography(raw) {
  const semanticTypography = raw.semantic?.typography ?? {};
  const sizes   = raw.primitive?.typography?.size      ?? {};
  const weights = raw.primitive?.typography?.weight     ?? {};
  const lhs     = raw.primitive?.typography?.['line-height'] ?? {};
  const lss     = raw.primitive?.typography?.['letter-spacing'] ?? {};

  // Resolve a typography composite value field to a human-readable string
  const res = ref => resolveRef(ref, raw);

  // Map primitive key → resolved value
  const sizeMap   = Object.fromEntries(Object.keys(sizes)  .filter(k=>!k.startsWith('$')).map(k=>[k, resolveRef(sizes[k].$value,   raw)]));
  const weightMap = Object.fromEntries(Object.keys(weights).filter(k=>!k.startsWith('$')).map(k=>[k, resolveRef(weights[k].$value, raw)]));
  const lhMap     = Object.fromEntries(Object.keys(lhs)    .filter(k=>!k.startsWith('$')).map(k=>[k, resolveRef(lhs[k].$value,    raw)]));
  const lsMap     = Object.fromEntries(Object.keys(lss)    .filter(k=>!k.startsWith('$')).map(k=>[k, resolveRef(lss[k].$value,    raw)]));

  const resolveAliasPart = (val, map) => {
    if (typeof val !== 'string' || !val.startsWith('{')) return res(val);
    const key = val.slice(1,-1).split('.').at(-1);
    return map[key] ?? res(val);
  };

  const collectTypography = (node, path = []) => {
    if (!node || typeof node !== 'object') return [];
    if ('$value' in node) return [{ path, node }];
    return Object.entries(node)
      .filter(([k]) => !k.startsWith('$'))
      .flatMap(([key, value]) => collectTypography(value, [...path, key]));
  };

  const styleEntries = collectTypography(semanticTypography);
  const lines = [header('Style', 'Size (max)', 'Weight', 'Line Height', 'Letter Spacing', 'Description')];
  for (const { path, node: t } of styleEntries) {
    const v    = t?.$value ?? {};
    const desc = (t?.$description ?? '').split(' — ')[1]?.split('.')[0] ?? t?.$description ?? '';
    const size = resolveAliasPart(v.fontSize,     sizeMap);
    const wgt  = resolveAliasPart(v.fontWeight,   weightMap);
    const lh   = resolveAliasPart(v.lineHeight,   lhMap);
    const ls   = resolveAliasPart(v.letterSpacing, lsMap);
    lines.push(row(`\`${path.join('.')}\``, size, wgt, String(lh), ls, desc));
  }
  lines.push('');
  lines.push('> Token JSON stores static max sizes. Responsive `clamp()` overrides live in `theme.css`.');
  lines.push('');
  lines.push('### Primitive font sizes');
  lines.push('');
  const sizeKeys = Object.keys(sizes).filter(k => !k.startsWith('$'));
  for (const k of sizeKeys) {
    lines.push(`- \`primitive.typography.size.${k}\` = **${sizeMap[k]}**`);
  }
  return lines.join('\n');
}

/** Builds the border radius table from primitive.radius.*. */
export function buildRadius(raw) {
  const radius = raw.primitive?.radius ?? {};
  const rules  = { none: '**All buttons — no exceptions**', full: 'Pills only' };
  const lines  = [header('Token', 'Value', 'Rule')];
  for (const { path, value } of walk(radius)) {
    const tok = 'primitive.radius.' + path.join('.');
    const val = typeof value === 'object' && 'value' in value && 'unit' in value
      ? `${value.value}${value.unit}` : String(value);
    lines.push(row(`\`${tok}\``, `\`${val}\``, rules[path.at(-1)] ?? ''));
  }
  return lines.join('\n');
}

/** Builds the motion tables from primitive and semantic motion tokens. */
export function buildMotion(raw) {
  const durations = raw.primitive?.duration ?? {};
  const easings   = raw.primitive?.easing   ?? {};
  const motions   = raw.semantic?.motion    ?? {};

  const durationUse = {
    instant: 'Immediate state changes and rapid dismissals',
    short:   'Productive micro-interactions',
    medium:  'Expressive entrances and teaching moments',
    long:    'Spatial movement and page travel',
  };

  const primitiveLines = [header('Token', 'Value', 'Use')];
  for (const { path, value } of walk(durations)) {
    const tok = 'primitive.duration.' + path.join('.');
    const val = typeof value === 'object' && 'value' in value && 'unit' in value
      ? `${value.value}${value.unit}` : String(value);
    primitiveLines.push(row(`\`${tok}\``, `\`${val}\``, durationUse[path.at(-1)] ?? ''));
  }
  for (const { path, value, desc } of walk(easings)) {
    const tok = 'primitive.easing.' + path.join('.');
    const val = value && typeof value === 'object' && value.type === 'spring'
      ? `spring(${value.stiffness}, ${value.damping}, ${value.mass})`
      : Array.isArray(value)
        ? `cubic-bezier(${value.join(', ')})`
        : String(value);
    primitiveLines.push(row(`\`${tok}\``, `\`${val}\``, desc ?? ''));
  }

  const semanticLines = [header('Token', 'Duration', 'Easing', 'Purpose')];
  for (const { path, value, desc } of walk(motions)) {
    const tok = 'semantic.motion.' + path.join('.');
    const duration = value?.duration;
    const easing   = value?.easing;
    const durationText = `\`${resolveRef(duration, raw)}\``;
    const easingText = easing && typeof easing === 'object' && easing.type === 'spring'
      ? `\`spring(${easing.stiffness}, ${easing.damping}, ${easing.mass})\``
      : `\`${resolveRef(easing, raw)}\``;
    semanticLines.push(row(`\`${tok}\``, durationText, easingText, desc ?? ''));
  }

  return [
    '### Primitive motion base',
    '',
    primitiveLines.join('\n'),
    '',
    '### Semantic motion intents',
    '',
    semanticLines.join('\n'),
  ].join('\n');
}
/** Builds the Agent Creative Constraints list with live brand values. */
export function buildAgentConstraints(raw) {
  const blue    = (raw.primitive?.color?.blue?.['500']?.$value ?? '#1E2FFF').toUpperCase();
  const fontRaw = raw.primitive?.typography?.family?.primary?.$value;
  const font    = (Array.isArray(fontRaw) ? fontRaw[0] : fontRaw) ?? 'Satoshi';
  return [
    `- **One accent color:** \`${blue}\` only — no other hues`,
    `- **Body / UI typeface:** ${font} — pair with Clash Display for headings only and Geist Mono for code; no other faces`,
    '- **Action radius:** `4px` for interactive controls; `8px` cards',
    '- **4px spacing grid:** All spacing snaps to `primitive.space.*` scale',
    '- **True monochromatic neutrals:** No warm/cool tint in neutral scale',
    '- **No drop shadows as primary depth mechanism:** Use motion (parallax, scale)',
    '- **Generous whitespace:** The system breathes',
  ].join('\n');
}

/**
 * Counts CSS custom properties the build script will emit from the raw tree.
 * Typography composites expand to 5 vars (fontFamily/Size/Weight/LetterSpacing/LineHeight).
 * Transition composites expand to 3 vars (duration/delay/timingFunction).
 * All other leaf tokens emit 1 var each.
 * This matches the "Tokens checked" count in pnpm tokens:verify output.
 */
export function buildTokenCount(raw) {
  let count = 0;
  for (const { value } of walk(raw)) {
    if (value && typeof value === 'object' && 'fontFamily' in value && 'fontSize' in value) {
      count += 5; // typography composite ? 5 CSS vars
    } else if (value && typeof value === 'object' && 'duration' in value && 'easing' in value) {
      count += 2; // motion composite ? 2 CSS vars
    } else if (value && typeof value === 'object' && 'duration' in value && 'timingFunction' in value) {
      count += 3; // transition composite ? 3 CSS vars
    } else {
      count += 1;
    }
  }
  return `Checks all ${count} tokens, aliases, and TS refs in one shot.`;
}
/** Builds the density scale table (hardcoded comfortable/compact values).
 *  NOTE: These values are design decisions defined in theme.css CSS vars,
 *  not token primitives — they cannot be auto-sourced from tokens.json. */
export function buildDensity() {
  const scale = [
    ['xs',  '4px',  '2px',  'Icon padding, micro nudges'],
    ['sm',  '8px',  '6px',  'Row gaps, label spacing'],
    ['md',  '16px', '12px', 'Standard component padding'],
    ['lg',  '24px', '20px', 'Card padding, form gaps'],
    ['xl',  '32px', '24px', 'Between card groups'],
    ['2xl', '48px', '40px', 'Between page sections'],
    ['3xl', '64px', '48px', 'Major layout divisions'],
    ['4xl', '80px', '64px', 'Hero / page breathing'],
  ];
  const lines = [header('CSS var', 'Comfortable', 'Compact', 'Use')];
  for (const [name, comfortable, compact, use] of scale) {
    lines.push(row(`\`--hds-space-${name}\``, comfortable, compact, use));
  }
  lines.push('');
  lines.push('Toggle: `document.documentElement.dataset.density = \'compact\'`');
  lines.push('Or via `useTheme().setDensity(\'compact\')`');
  return lines.join('\n');
}

// ── CLI ───────────────────────────────────────────────────────────────────────
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raw     = JSON.parse(readFileSync(join(ROOT, 'hirobius.tokens.json'), 'utf8'));
  let   handoff = readFileSync(join(ROOT, 'DESIGN-HANDOFF.md'), 'utf8');

  handoff = replaceSection(handoff, 'brand-identity',   buildBrandIdentity(raw));
  handoff = replaceSection(handoff, 'primitives-color', buildPrimitivesColor(raw));
  handoff = replaceSection(handoff, 'semantic-accent',  buildSemanticAccent(raw));
  handoff = replaceSection(handoff, 'semantic-color',   buildSemanticColor(raw));
  handoff = replaceSection(handoff, 'typography',       buildTypography(raw));
  handoff = replaceSection(handoff, 'spacing',          buildSpacing(raw));
  handoff = replaceSection(handoff, 'semantic-space',   buildSemanticSpace(raw));
  handoff = replaceSection(handoff, 'size',             buildSize(raw));
  handoff = replaceSection(handoff, 'density',          buildDensity());
  handoff = replaceSection(handoff, 'radius',           buildRadius(raw));
  handoff = replaceSection(handoff, 'motion',           buildMotion(raw));
  handoff = replaceSection(handoff, 'agent-constraints', buildAgentConstraints(raw));
  handoff = replaceSection(handoff, 'token-count',       buildTokenCount(raw));

  writeFileSync(join(ROOT, 'DESIGN-HANDOFF.md'), handoff);
  console.log('✓ DESIGN-HANDOFF.md updated from token source.');
}
