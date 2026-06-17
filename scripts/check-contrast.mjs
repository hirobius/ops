/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * check-contrast.mjs
 *
 * WCAG 2.1 contrast ratio checker for HDS semantic color pairs.
 * Reads hirobius.tokens.json, resolves primitive + semantic color aliases,
 * and reports contrast ratios for critical text/bg pairings in both
 * light and dark mode.
 *
 * Usage: node scripts/check-contrast.mjs
 * Exits 0 if all pairs pass WCAG AA. Exits 1 if any pair fails.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokenPath = resolve(__dirname, '../hirobius.tokens.json');

// ── Token loading ─────────────────────────────────────────────

const tokens = JSON.parse(readFileSync(tokenPath, 'utf8'));

// ── Path resolver ─────────────────────────────────────────────

/**
 * Traverse a dot-notation path through the token object.
 * Returns the node at that path, or undefined if not found.
 */
function getByPath(obj, path) {
  return path.split('.').reduce((node, key) => {
    if (node == null) return undefined;
    return node[key];
  }, obj);
}

/**
 * Resolve an alias string like "{primitive.color.neutral.white}"
 * to its hex $value, following chains up to 10 levels deep.
 */
function resolveAlias(ref, maxDepth = 10) {
  let current = ref;
  for (let i = 0; i < maxDepth; i++) {
    const match = typeof current === 'string' && current.match(/^\{(.+)\}$/);
    if (!match) break;
    const node = getByPath(tokens, match[1]);
    if (node == null) {
      throw new Error(`Token path not found: ${match[1]}`);
    }
    current = node.$value ?? node;
  }
  return current;
}

/**
 * Resolve a semantic color token to a concrete hex string for a given mode.
 * For light: uses $value (after alias resolution).
 * For dark:  uses $extensions['com.figma.variables'].modes.Dark, falls back to $value.
 */
function resolveSemanticHex(dotPath, mode) {
  const node = getByPath(tokens, dotPath);
  if (!node) throw new Error(`Semantic token not found: ${dotPath}`);

  let rawValue;

  if (mode === 'dark') {
    const darkAlias =
      node.$extensions?.['com.figma.variables']?.modes?.Dark;
    rawValue = darkAlias != null ? darkAlias : node.$value;
  } else {
    rawValue = node.$value;
  }

  const hex = resolveAlias(rawValue);
  if (typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
    throw new Error(
      `Could not resolve ${dotPath} (${mode}) to a 6-digit hex. Got: ${JSON.stringify(hex)}`
    );
  }
  return hex.toLowerCase();
}

// ── WCAG luminance + contrast ─────────────────────────────────

function hexToLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1, hex2) {
  const L1 = hexToLuminance(hex1);
  const L2 = hexToLuminance(hex2);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

// ── WCAG thresholds ───────────────────────────────────────────

const AA_NORMAL = 4.5;
const AAA_NORMAL = 7.0;

function passAA(ratio)  { return ratio >= AA_NORMAL; }
function passAAA(ratio) { return ratio >= AAA_NORMAL; }

// ── Pairs to check ────────────────────────────────────────────

const PAIRS = [
  {
    label: 'content.primary / surface.page',
    text: 'semantic.color.content.primary',
    bg:   'semantic.color.surface.page',
  },
  {
    label: 'content.primary / surface.raised',
    text: 'semantic.color.content.primary',
    bg:   'semantic.color.surface.raised',
  },
  {
    label: 'content.primary / surface.overlay',
    text: 'semantic.color.content.primary',
    bg:   'semantic.color.surface.overlay',
  },
  {
    label: 'content.secondary / surface.page',
    text: 'semantic.color.content.secondary',
    bg:   'semantic.color.surface.page',
  },
  {
    label: 'content.secondary / surface.raised',
    text: 'semantic.color.content.secondary',
    bg:   'semantic.color.surface.raised',
  },
  {
    label: 'content.secondary / surface.overlay',
    text: 'semantic.color.content.secondary',
    bg:   'semantic.color.surface.overlay',
  },
  {
    label: 'content.onAccent / surface.accent',
    text: 'semantic.color.content.onAccent',
    bg:   'semantic.color.surface.accent',
  },
];

// ── Main ──────────────────────────────────────────────────────

const COL_PAIR  = 34;
const COL_RATIO =  8;

function fmt(ratio) {
  return `${ratio.toFixed(1)}:1`.padEnd(COL_RATIO);
}

function _aaGlyph(ratio)  { return passAA(ratio)  ? '✓' : '✗'; }
function _aaaGlyph(ratio) { return passAAA(ratio)  ? '✓' : '✗'; }

const results = PAIRS.map(({ label, text, bg }) => {
  const textLight = resolveSemanticHex(text, 'light');
  const bgLight   = resolveSemanticHex(bg,   'light');
  const textDark  = resolveSemanticHex(text,  'dark');
  const bgDark    = resolveSemanticHex(bg,    'dark');

  const lightRatio = contrastRatio(textLight, bgLight);
  const darkRatio  = contrastRatio(textDark,  bgDark);

  return { label, lightRatio, darkRatio };
});

const failures = results.filter(
  ({ lightRatio, darkRatio }) => !passAA(lightRatio) || !passAA(darkRatio)
);

if (failures.length === 0) {
  console.log('\n✓ WCAG contrast check passed — all pairs meet AA.\n');
} else {
  console.log('\n✗ WCAG contrast check FAILED — the following pairs do not meet AA:\n');
  for (const { label, lightRatio, darkRatio } of failures) {
    const lightFail = !passAA(lightRatio) ? ` light ${lightRatio.toFixed(1)}:1 (needs ${AA_NORMAL}:1)` : '';
    const darkFail  = !passAA(darkRatio)  ? ` dark ${darkRatio.toFixed(1)}:1 (needs ${AA_NORMAL}:1)`   : '';
    console.log(`  ✗ ${label}:${lightFail}${darkFail}`);
  }
  console.log('');
}

// ── Table ─────────────────────────────────────────────────────

const header =
  'Pair'.padEnd(COL_PAIR) +
  'Light'.padEnd(COL_RATIO) +
  'Dark'.padEnd(COL_RATIO) +
  'AA (L/D)'.padEnd(12) +
  'AAA (L/D)';

console.log('  ' + header);
console.log('  ' + '─'.repeat(header.length));

for (const { label, lightRatio, darkRatio } of results) {
  const aaLight  = passAA(lightRatio)  ? '✓' : '✗';
  const aaDark   = passAA(darkRatio)   ? '✓' : '✗';
  const aaaLight = passAAA(lightRatio) ? '✓' : '✗';
  const aaaDark  = passAAA(darkRatio)  ? '✓' : '✗';

  const row =
    label.padEnd(COL_PAIR) +
    fmt(lightRatio) +
    fmt(darkRatio) +
    `${aaLight}/${aaDark}`.padEnd(12) +
    `${aaaLight}/${aaaDark}`;

  console.log('  ' + row);
}

console.log('');

process.exit(failures.length > 0 ? 1 : 0);


