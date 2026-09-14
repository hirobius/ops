/**
 * lib/agent/palette.mjs — pre-render palette checks for generated configs (ops#188).
 *
 * Every generated site currently draws its colours from 1 of 4 stock presets
 * (lib/schema/presets.mjs), so every site looks alike. The schema already
 * supports a free palette with no schema change: `brand.cssVarOverrides` accepts
 * hexes for keys matching `^--brand-[a-z-]+$`, `resolvePalette()` merges them
 * over the preset, and the site-engine WCAG AA gate checks the RESOLVED palette
 * at build. The agent simply never emitted overrides.
 *
 * This module is the ops-side half of closing that gap — two checks that run at
 * generation, before a config is ever rendered:
 *
 *   1. LAZY PALETTE — the agent echoed a stock preset instead of deriving one.
 *      Treated like a placeholder phone number: a generation failure that feeds
 *      the judge/regeneration note.
 *   2. CONTRAST — any AA pair below 4.5:1 would be dead on arrival at the
 *      site-engine build gate. Catching it here costs a regeneration; catching
 *      it there costs a failed client build.
 *
 * Both deliberately live ops-side at generation rather than in the site-engine
 * acceptance gate, which would fail legitimately preset-coloured hand-built
 * sites (Adrian, 2026-07-12).
 *
 * Contrast math mirrors site-engine `packages/template/src/lib/contrast.ts`
 * (WCAG 2.x relative luminance). Node built-ins only.
 *
 * @module agent/palette
 */

import { PALETTE_PRESETS } from '../schema/presets.mjs';

/** The six semantic colours a generated palette must carry, in `PaletteTokens` order. */
export const PALETTE_KEYS = ['primary', 'accent', 'bg', 'fg', 'muted', 'onPrimary'];

/** Palette key → the `--brand-*` custom property the schema expects. */
const CSS_VAR = {
  primary: '--brand-primary',
  accent: '--brand-accent',
  bg: '--brand-bg',
  fg: '--brand-fg',
  muted: '--brand-muted',
  onPrimary: '--brand-on-primary',
};

/** The pairs the site-engine WCAG AA gate will check on the resolved palette. */
const AA_PAIRS = [
  ['primary/onPrimary', 'primary', 'onPrimary'],
  ['fg/bg', 'fg', 'bg'],
  ['fg/muted', 'fg', 'muted'],
];

/** WCAG AA minimum for normal-size text. */
export const AA_MIN_RATIO = 4.5;

const SIX_HEX = /^#?[0-9a-fA-F]{6}$/;

/**
 * Parse a 6-digit hex into 0–255 channels.
 *
 * Throws rather than coercing: a malformed hex that silently scored as black
 * would let a broken palette pass the contrast check, which is the one outcome
 * this module exists to prevent.
 *
 * @param {string} hex `#rrggbb` or `rrggbb`
 * @returns {[number, number, number]}
 */
function channels(hex) {
  if (typeof hex !== 'string' || !SIX_HEX.test(hex)) {
    throw new Error(`palette: expected a 6-digit hex colour, got ${JSON.stringify(hex)}`);
  }
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** WCAG 2.x relative luminance. @param {string} hex */
function luminance(hex) {
  const [r, g, b] = channels(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG contrast ratio between two colours, 1:1 … 21:1. Symmetric.
 *
 * @param {string} a hex colour
 * @param {string} b hex colour
 * @returns {number}
 */
export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Check the three AA pairs the site-engine build gate will check.
 *
 * Reports EVERY failing pair with its measured ratio, not just the first — the
 * regeneration note is only useful if it names all of what to fix.
 *
 * @param {Record<string, string>} palette the six-key palette
 * @returns {{ ok: boolean, failures: Array<{ pair: string, ratio: number, min: number }> }}
 */
export function checkContrast(palette) {
  const failures = [];
  for (const [pair, a, b] of AA_PAIRS) {
    const ratio = contrastRatio(palette[a], palette[b]);
    if (ratio < AA_MIN_RATIO) failures.push({ pair, ratio, min: AA_MIN_RATIO });
  }
  return { ok: failures.length === 0, failures };
}

/**
 * Did the agent echo a stock preset instead of deriving a palette?
 *
 * Only an exact match on ALL six colours counts. Sharing one colour with a
 * preset is legitimate — a green landscaper really may want that green — so a
 * looser test would flag honest work.
 *
 * @param {Record<string, string>} palette the six-key palette
 * @returns {string|null} the preset id it matched, or null
 */
export function isLazyPalette(palette) {
  const norm = (v) => String(v).toLowerCase();
  for (const [id, preset] of Object.entries(PALETTE_PRESETS)) {
    const same = PALETTE_KEYS.every((k) => norm(palette[k]) === norm(preset[CSS_VAR[k]]));
    if (same) return id;
  }
  return null;
}

/**
 * Map the six-key palette onto the `brand.cssVarOverrides` shape.
 *
 * Emits only `--brand-*` keys, which is exactly the surface the schema's
 * `^--brand-[a-z-]+$` regex sanctions — no new namespace, no site-engine schema
 * change, no ops↔site-engine re-sync.
 *
 * @param {Record<string, string>} palette
 * @returns {Record<string, string>}
 */
export function toCssVarOverrides(palette) {
  return Object.fromEntries(PALETTE_KEYS.map((k) => [CSS_VAR[k], palette[k]]));
}
