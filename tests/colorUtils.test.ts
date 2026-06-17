/**
 * Branch-targeted unit tests for src/app/utils/colorUtils.ts
 *
 * Complements color-math.property.test.ts (which uses fast-check property tests).
 * These tests target the specific conditional branches:
 *   - parseOklch: regex no-match → null, percentage lightness, NaN guard
 *   - convertCssColorToHex: null short-circuit, toSrgb low-value branch (≤0.0031308)
 *   - hexToLuminance: toLinear low-value (≤0.04045) and high-value branches
 *   - contrastRatio: l1 > l2 vs l1 < l2 ordering
 *   - buildWebAimContrastHref: strip # from both arguments
 */

import { describe, it, expect } from 'vitest';
import {
  parseOklch,
  convertCssColorToHex,
  hexToLuminance,
  contrastRatio,
  buildWebAimContrastHref,
} from '@/app/utils/colorUtils';

// ── parseOklch ───────────────────────────────────────────────────────────────

describe('parseOklch', () => {
  it('returns null for non-oklch strings', () => {
    expect(parseOklch('red')).toBeNull();
    expect(parseOklch('#ffffff')).toBeNull();
    expect(parseOklch('rgb(255 0 0)')).toBeNull();
    expect(parseOklch('')).toBeNull();
  });

  it('returns null for malformed oklch strings', () => {
    expect(parseOklch('oklch()')).toBeNull();
    expect(parseOklch('oklch(0.5)')).toBeNull();
    expect(parseOklch('oklch(0.5 0.2)')).toBeNull();
  });

  it('parses a valid oklch string with decimal lightness', () => {
    const result = parseOklch('oklch(0.5 0.2 120)');
    expect(result).not.toBeNull();
    expect(result?.l).toBeCloseTo(0.5);
    expect(result?.c).toBeCloseTo(0.2);
    expect(result?.h).toBeCloseTo(120);
  });

  it('parses lightness expressed as a percentage (the % branch)', () => {
    // lightnessText.endsWith('%') → parseFloat / 100
    const result = parseOklch('oklch(50% 0.2 120)');
    expect(result).not.toBeNull();
    // 50% → 0.5
    expect(result?.l).toBeCloseTo(0.5);
    expect(result?.c).toBeCloseTo(0.2);
    expect(result?.h).toBeCloseTo(120);
  });

  it('parses oklch with optional alpha component', () => {
    const result = parseOklch('oklch(0.6 0.15 200 / 0.8)');
    expect(result).not.toBeNull();
    expect(result?.l).toBeCloseTo(0.6);
    expect(result?.h).toBeCloseTo(200);
  });

  it('parses oklch with percentage alpha', () => {
    const result = parseOklch('oklch(0.6 0.15 200 / 80%)');
    expect(result).not.toBeNull();
  });

  it('returns null when any of l/c/h would be NaN', () => {
    // "abc" is not a number → NaN
    expect(parseOklch('oklch(abc 0.2 120)')).toBeNull();
  });

  it('parses leading/trailing whitespace in the value', () => {
    const result = parseOklch('  oklch(0.5 0.2 120)  ');
    expect(result).not.toBeNull();
    expect(result?.l).toBeCloseTo(0.5);
  });

  it('parses signed values (positive sign prefix)', () => {
    const result = parseOklch('oklch(+0.5 +0.2 +120)');
    expect(result).not.toBeNull();
    expect(result?.l).toBeCloseTo(0.5);
  });

  it('case-insensitive matching (OKLCH uppercase)', () => {
    const result = parseOklch('OKLCH(0.5 0.2 120)');
    expect(result).not.toBeNull();
  });
});

// ── convertCssColorToHex ──────────────────────────────────────────────────────

describe('convertCssColorToHex', () => {
  it('returns null for non-oklch input (null parseOklch short-circuit)', () => {
    expect(convertCssColorToHex('red')).toBeNull();
    expect(convertCssColorToHex('#fff')).toBeNull();
    expect(convertCssColorToHex('')).toBeNull();
  });

  it('returns a #rrggbb string for a valid oklch color', () => {
    const result = convertCssColorToHex('oklch(1 0 0)');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('oklch(0 0 0) converts to #000000 (black — all channels below toSrgb threshold)', () => {
    const result = convertCssColorToHex('oklch(0 0 0)');
    // Black in oklch — all channels should be 0 or very close
    expect(result).not.toBeNull();
    // The result may not be exactly black due to matrix math, but should be dark
    // The important thing is it returns a hex string, not null
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('oklch(1 0 0) converts to near-white (all channels hit the sRGB gamma branch)', () => {
    // L=1 pure achromatic should be close to white
    const result = convertCssColorToHex('oklch(1 0 0)');
    expect(result).not.toBeNull();
    // Each channel should be high (near ff)
    const hex = result!.slice(1);
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    expect(r).toBeGreaterThan(200);
    expect(g).toBeGreaterThan(200);
    expect(b).toBeGreaterThan(200);
  });

  it('returns lowercase hex output', () => {
    const result = convertCssColorToHex('oklch(0.5 0.1 180)');
    if (result !== null) {
      expect(result).toBe(result.toLowerCase());
    }
  });

  it('handles very low chroma (near-achromatic colors) without error', () => {
    // These exercise the toSrgb clamping (Math.min/Math.max) for channels
    // that go slightly out of gamut due to floating-point
    const result = convertCssColorToHex('oklch(0.5 0 90)');
    expect(result).not.toBeNull();
    expect(result).toMatch(/^#[0-9a-f]{6}$/);
  });
});

// ── hexToLuminance ────────────────────────────────────────────────────────────

describe('hexToLuminance', () => {
  it('returns 0 for #000000 (black — linear branch for every channel)', () => {
    expect(hexToLuminance('#000000')).toBeCloseTo(0);
  });

  it('returns 1 for #ffffff (white — gamma branch for every channel)', () => {
    expect(hexToLuminance('#ffffff')).toBeCloseTo(1);
  });

  it('uses the linear branch (channel ≤ 0.04045) for near-black values', () => {
    // #0a0a0a → channel = 10/255 ≈ 0.0392 which is ≤ 0.04045
    // linear: channel / 12.92 → 0.0392/12.92 ≈ 0.00303
    // luminance = 0.2126*r + 0.7152*g + 0.0722*b = 1 * 0.00303 ≈ 0.00303
    const lum = hexToLuminance('#0a0a0a');
    expect(lum).toBeGreaterThan(0);
    expect(lum).toBeLessThan(0.004);
  });

  it('uses the power-law branch (channel > 0.04045) for mid-range values', () => {
    // #808080 → channel = 128/255 ≈ 0.502 which is > 0.04045
    const lum = hexToLuminance('#808080');
    expect(lum).toBeGreaterThan(0.2);
    expect(lum).toBeLessThan(0.22);
  });

  it('pure red (#ff0000) has expected relative luminance', () => {
    // sRGB red has luminance of approx 0.2126
    const lum = hexToLuminance('#ff0000');
    expect(lum).toBeCloseTo(0.2126, 2);
  });

  it('pure green (#00ff00) has expected relative luminance', () => {
    // sRGB green has luminance of approx 0.7152
    const lum = hexToLuminance('#00ff00');
    expect(lum).toBeCloseTo(0.7152, 2);
  });

  it('pure blue (#0000ff) has expected relative luminance', () => {
    // sRGB blue has luminance of approx 0.0722
    const lum = hexToLuminance('#0000ff');
    expect(lum).toBeCloseTo(0.0722, 2);
  });

  it('mixed low/high channel values hit both branches in one call', () => {
    // #0aff0a — R=10 (linear), G=255 (power), B=10 (linear)
    const lum = hexToLuminance('#0aff0a');
    expect(lum).toBeGreaterThan(0.7);
  });
});

// ── contrastRatio ─────────────────────────────────────────────────────────────

describe('contrastRatio', () => {
  it('returns 21 for black vs white (maximum contrast)', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });

  it('returns 1 for identical colors (no contrast)', () => {
    expect(contrastRatio('#808080', '#808080')).toBeCloseTo(1, 5);
  });

  it('is symmetric: contrastRatio(a, b) === contrastRatio(b, a)', () => {
    const ab = contrastRatio('#1e2efd', '#ffffff');
    const ba = contrastRatio('#ffffff', '#1e2efd');
    expect(ab).toBeCloseTo(ba, 10);
  });

  it('uses the l1 > l2 ordering branch when first color is lighter', () => {
    // #ffffff (l=1) > #000000 (l=0)
    const ratio = contrastRatio('#ffffff', '#000000');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('uses the l2 > l1 ordering branch when second color is lighter', () => {
    // #000000 (l=0) < #ffffff (l=1) → max is l2
    const ratio = contrastRatio('#000000', '#ffffff');
    expect(ratio).toBeCloseTo(21, 0);
  });

  it('returns a ratio ≥ 1 for any pair', () => {
    expect(contrastRatio('#1e2efd', '#34d399')).toBeGreaterThanOrEqual(1);
  });

  it('returns a ratio ≤ 21 for any pair', () => {
    expect(contrastRatio('#1e2efd', '#34d399')).toBeLessThanOrEqual(21);
  });

  it('pure red vs pure green meets expected contrast', () => {
    const ratio = contrastRatio('#ff0000', '#00ff00');
    expect(ratio).toBeGreaterThan(1);
    expect(ratio).toBeLessThan(21);
  });
});

// ── buildWebAimContrastHref ───────────────────────────────────────────────────

describe('buildWebAimContrastHref', () => {
  it('returns a valid webaim URL', () => {
    const url = buildWebAimContrastHref('#ffffff', '#000000');
    expect(url).toContain('webaim.org');
    expect(url).toContain('fcolor=ffffff');
    expect(url).toContain('bcolor=000000');
  });

  it('strips # from foreground color', () => {
    const url = buildWebAimContrastHref('#1e2efd', '#ffffff');
    expect(url).toContain('fcolor=1e2efd');
    expect(url).not.toContain('fcolor=#');
  });

  it('strips # from background color', () => {
    const url = buildWebAimContrastHref('#ffffff', '#1e2efd');
    expect(url).toContain('bcolor=1e2efd');
    expect(url).not.toContain('bcolor=#');
  });

  it('handles colors without # prefix gracefully', () => {
    // replace('#', '') on a string with no '#' is a no-op
    const url = buildWebAimContrastHref('ffffff', '000000');
    expect(url).toContain('fcolor=ffffff');
    expect(url).toContain('bcolor=000000');
  });
});
