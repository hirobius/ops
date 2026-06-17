/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/contrast.mjs
 *
 * p6-3: WCAG 2.1 contrast checker for a serialized Figma selection (the
 * manifest-aware shape emitted by p6-1's extractNodeTree —
 * `{id, name, type, componentName?, tokenPaths?, a11y?, fills?,
 * boundVariables?, children: [...]}`).
 *
 * Strategy: walk the serialized tree, track the nearest resolvable
 * background fill per ancestor frame, and when a TEXT node (or any node
 * exposing a `color` token / text fill) is encountered, emit a
 * `{ fg, bg, ratio, AA, AAA }` pair. The relative-luminance formula is
 * the same one defined by WCAG 2.1 §1.4.3 — ten lines of math, no
 * external deps.
 *
 * Pair extraction priority (per node):
 *   1. tokenPaths.fills[0]   → background candidate (resolved via tokens)
 *   2. tokenPaths.color      → foreground candidate (TEXT node)
 *   3. Otherwise the literal Figma `fills[0].color` (rgb floats 0..1) is
 *      converted to hex and used as the unresolved-but-still-checkable
 *      value. tokenPath stays `null` in that case.
 *
 * Input shapes accepted (mirrors validators/lint.mjs):
 *   - a single serialized node:    { id, name, type, ..., children? }
 *   - an array of serialized nodes
 *   - a wrapped envelope:          { tree: [...] } or { selection: [...] }
 *
 * Output: { ok, pairs: [{fg, bg, ratio, AA, AAA}], errors: [] }
 *   - `ok` is `false` when any pair fails AA (4.5:1 normal text).
 *   - `errors` follows the standard validator shape so the bridge can
 *     bubble malformed-token failures to the caller without crashing.
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = resolve(__dirname, '../hirobius.tokens.json');

// Lazy/cached token tree so repeated validator calls (test runner does
// dozens) only read disk once.
let _tokenCache = null;
function loadTokens() {
  if (_tokenCache) return _tokenCache;
  _tokenCache = JSON.parse(readFileSync(TOKEN_PATH, 'utf8'));
  return _tokenCache;
}

// ── Token resolution ──────────────────────────────────────────
// Same algorithm as scripts/check-contrast.mjs — kept inline rather
// than imported to keep the validator independent of CLI plumbing.

function getByPath(obj, path) {
  return path.split('.').reduce((node, key) => {
    if (node == null) return undefined;
    return node[key];
  }, obj);
}

function resolveAlias(tokens, ref, maxDepth = 10) {
  let current = ref;
  for (let i = 0; i < maxDepth; i++) {
    const match = typeof current === 'string' && current.match(/^\{(.+)\}$/);
    if (!match) break;
    const node = getByPath(tokens, match[1]);
    if (node == null) return null;
    current = node.$value ?? node;
  }
  return current;
}

/**
 * Resolve a dot-notation token path to a #rrggbb hex string.
 * Returns null if the path is missing or doesn't terminate at a hex
 * value (oklch and similar non-RGB colors stay unresolved here — the
 * caller should treat them as unknown rather than fabricate a ratio).
 */
export function resolveTokenToHex(tokenPath) {
  const tokens = loadTokens();
  const node = getByPath(tokens, tokenPath);
  if (!node) return null;
  const raw = node.$value ?? node;
  const resolved = resolveAlias(tokens, raw);
  if (typeof resolved !== 'string') return null;
  if (/^#[0-9a-fA-F]{6}$/.test(resolved)) return resolved.toLowerCase();
  // 3-digit hex shorthand → expand to 6.
  if (/^#[0-9a-fA-F]{3}$/.test(resolved)) {
    const c = resolved.slice(1);
    return ('#' + c[0] + c[0] + c[1] + c[1] + c[2] + c[2]).toLowerCase();
  }
  return null;
}

// Convert Figma SOLID rgb floats (0..1) to a #rrggbb string.
function rgbFloatToHex(rgb) {
  if (!rgb || typeof rgb !== 'object') return null;
  const r = Math.round((rgb.r || 0) * 255);
  const g = Math.round((rgb.g || 0) * 255);
  const b = Math.round((rgb.b || 0) * 255);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const hex = (v) => clamp(v).toString(16).padStart(2, '0');
  return ('#' + hex(r) + hex(g) + hex(b)).toLowerCase();
}

// ── WCAG 2.1 luminance + contrast ─────────────────────────────
// §1.4.3, exact formula. Linearization branch at 0.04045, weights
// 0.2126 / 0.7152 / 0.0722.

function hexToLuminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(hexA, hexB) {
  const L1 = hexToLuminance(hexA);
  const L2 = hexToLuminance(hexB);
  return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
}

const AA_NORMAL = 4.5;
const AAA_NORMAL = 7.0;

// ── Pair extraction ───────────────────────────────────────────
// Walk the tree depth-first carrying the nearest known background fill.
// A pair is emitted when a TEXT-ish node exposes a foreground color and
// some ancestor has supplied a resolvable background. We deliberately
// don't fabricate `bg = surface.page` when the selection root has no
// fill — the caller asked us to lint *what was selected*, not what the
// page would render against.

// In Figma's serialized output, the same `fills` field carries the text
// color on TEXT nodes and the background paint on container nodes
// (FRAME/RECT/INSTANCE). We disambiguate purely by node.type — TEXT
// nodes contribute foregrounds, everything else contributes backgrounds.
// `tokenPaths.color` (when present) is always treated as a foreground;
// it's the explicit text-color binding emitted by some plugin paths.
function extractFg(node) {
  if (!node || typeof node !== 'object') return null;
  const tp = node.tokenPaths;
  if (tp && typeof tp === 'object') {
    let candidate = null;
    if (typeof tp.color === 'string') candidate = tp.color;
    else if (node.type === 'TEXT' && Array.isArray(tp.fills) && typeof tp.fills[0] === 'string') {
      candidate = tp.fills[0];
    }
    if (candidate) {
      const hex = resolveTokenToHex(candidate);
      if (hex) return { hex, tokenPath: candidate };
    }
  }
  if (node.type === 'TEXT' && Array.isArray(node.fills)) {
    const solid = node.fills.find((f) => f && f.type === 'SOLID' && f.color);
    if (solid) {
      const hex = rgbFloatToHex(solid.color);
      if (hex) return { hex, tokenPath: null };
    }
  }
  return null;
}

function extractBg(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'TEXT') return null;
  const tp = node.tokenPaths;
  if (tp && Array.isArray(tp.fills) && typeof tp.fills[0] === 'string') {
    const hex = resolveTokenToHex(tp.fills[0]);
    if (hex) return { hex, tokenPath: tp.fills[0] };
  }
  if (Array.isArray(node.fills)) {
    const solid = node.fills.find((f) => f && f.type === 'SOLID' && f.color);
    if (solid) {
      const hex = rgbFloatToHex(solid.color);
      if (hex) return { hex, tokenPath: null };
    }
  }
  return null;
}

function walk(node, currentBg, pairs) {
  if (!node || typeof node !== 'object') return;
  // Update the inherited background BEFORE checking foregrounds — this
  // way a frame that has both its own bg and a TEXT child reads against
  // the frame's bg, which is the visually correct pairing.
  const ownBg = extractBg(node);
  const inheritedBg = ownBg || currentBg;

  const fg = extractFg(node);
  if (fg && inheritedBg && fg.hex !== inheritedBg.hex) {
    const ratio = contrastRatio(fg.hex, inheritedBg.hex);
    pairs.push({
      fg: { hex: fg.hex, tokenPath: fg.tokenPath },
      bg: { hex: inheritedBg.hex, tokenPath: inheritedBg.tokenPath },
      ratio: Math.round(ratio * 100) / 100,
      AA: ratio >= AA_NORMAL,
      AAA: ratio >= AAA_NORMAL,
    });
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) walk(child, inheritedBg, pairs);
  }
}

function normalizeInput(input) {
  if (input == null) return [];
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.tree)) return input.tree;
  if (Array.isArray(input.selection)) return input.selection;
  if (typeof input === 'object') return [input];
  return [];
}

/**
 * @param {object|Array} input  serialized selection or wrapped envelope
 * @returns {{ ok: boolean, pairs: Array, errors: Array }}
 */
export default function validate(input) {
  const nodes = normalizeInput(input);
  const pairs = [];
  for (const root of nodes) walk(root, null, pairs);
  const failing = pairs.filter((p) => !p.AA);
  return { ok: failing.length === 0, pairs, errors: [] };
}
