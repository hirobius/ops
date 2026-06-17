/**
 * Property-based tests for src/app/utils/colorUtils.ts
 *
 * Uses fast-check (fc) to verify mathematical invariants over colorUtils
 * functions. 1000 iterations per property.
 *
 * Functions actually exported from colorUtils.ts (inspected 2026-05-02):
 *   - parseOklch(value: string): { l, c, h } | null
 *   - hexToLuminance(hex: string): number
 *   - contrastRatio(hex1: string, hex2: string): number
 *   - convertCssColorToHex(value: string): string | null
 *   - buildWebAimContrastHref(fg: string, bg: string): string
 *
 * NOT exported (skipped tests): formatOklch, oklchToRgb, luminance, hexToRgb, rgbToHex
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  parseOklch,
  hexToLuminance,
  contrastRatio,
} from '@/app/utils/colorUtils';

const NUM_RUNS = 1000;

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

/** Valid OKLCH values: L ∈ [0, 1], C ∈ [0, 0.4], H ∈ [0, 360]
 *
 * fc.float() in fast-check ≥ 3 requires 32-bit float (Math.fround) boundaries.
 * We use fc.double() instead, which accepts full double-precision boundaries.
 */
const oklchArb = fc.record({
  l: fc.double({ min: 0, max: 1, noNaN: true }),
  c: fc.double({ min: 0, max: 0.4, noNaN: true }),
  h: fc.double({ min: 0, max: 360, noNaN: true }),
});

/**
 * Format { l, c, h } as an oklch(...) CSS string.
 *
 * Uses toFixed(10) rather than default toString() to avoid JavaScript emitting
 * scientific notation (e.g. "5e-324") for subnormal doubles — the parseOklch
 * regex only accepts decimal notation.
 */
function toOklchCss(l: number, c: number, h: number): string {
  return `oklch(${l.toFixed(10)} ${c.toFixed(10)} ${h.toFixed(10)})`;
}

/** Arbitrary for a 6-digit lowercase hex color string (e.g. "#a3b4c5") */
const hexColorArb = fc.tuple(
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
  fc.integer({ min: 0, max: 255 }),
).map(([r, g, b]) =>
  `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
);

// ---------------------------------------------------------------------------
// 1. Round-trip: parseOklch(toOklchCss(l, c, h)) === { l, c, h }
//    (formatOklch is not exported, so we inline the format step here)
// ---------------------------------------------------------------------------
describe('parseOklch round-trip', () => {
  it('round-trips valid OKLCH values within 1e-9 tolerance', () => {
    fc.assert(
      fc.property(oklchArb, ({ l, c, h }) => {
        const css = toOklchCss(l, c, h);
        const parsed = parseOklch(css);
        expect(parsed).not.toBeNull();
        if (!parsed) return; // type narrowing
        expect(Math.abs(parsed.l - l)).toBeLessThan(1e-9);
        expect(Math.abs(parsed.c - c)).toBeLessThan(1e-9);
        expect(Math.abs(parsed.h - h)).toBeLessThan(1e-9);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// 2. Contrast symmetry: contrastRatio(a, b) === contrastRatio(b, a)
// ---------------------------------------------------------------------------
describe('contrastRatio symmetry', () => {
  it('is symmetric: contrastRatio(a, b) === contrastRatio(b, a)', () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (a, b) => {
        const ab = contrastRatio(a, b);
        const ba = contrastRatio(b, a);
        expect(Math.abs(ab - ba)).toBeLessThan(1e-12);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// 3. Luminance bounds: hexToLuminance(c) ∈ [0, 1] for any sRGB hex color
// ---------------------------------------------------------------------------
describe('hexToLuminance bounds', () => {
  it('returns a value in [0, 1] for any sRGB hex color', () => {
    fc.assert(
      fc.property(hexColorArb, (hex) => {
        const lum = hexToLuminance(hex);
        expect(lum).toBeGreaterThanOrEqual(0);
        expect(lum).toBeLessThanOrEqual(1);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Luminance monotonicity: hexToLuminance(white) > hexToLuminance(black)
// ---------------------------------------------------------------------------
describe('hexToLuminance monotonicity', () => {
  it('white (#ffffff) has higher luminance than black (#000000)', () => {
    const white = hexToLuminance('#ffffff');
    const black = hexToLuminance('#000000');
    expect(white).toBeGreaterThan(black);
  });
});

// ---------------------------------------------------------------------------
// 5. Contrast bounds: contrastRatio(a, b) ∈ [1, 21]
// ---------------------------------------------------------------------------
describe('contrastRatio bounds', () => {
  it('returns a value in [1, 21] for any pair of sRGB hex colors', () => {
    fc.assert(
      fc.property(hexColorArb, hexColorArb, (a, b) => {
        const ratio = contrastRatio(a, b);
        expect(ratio).toBeGreaterThanOrEqual(1);
        expect(ratio).toBeLessThanOrEqual(21);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Skipped — formatOklch not exported from colorUtils.ts
// ---------------------------------------------------------------------------
it.skip('formatOklch: skipped — formatOklch is not exported from colorUtils.ts', () => {});

// ---------------------------------------------------------------------------
// Skipped — oklchToRgb not exported from colorUtils.ts
// ---------------------------------------------------------------------------
it.skip('oklchToRgb: skipped — oklchToRgb is not exported from colorUtils.ts', () => {});

// ---------------------------------------------------------------------------
// Skipped — luminance (standalone) not exported from colorUtils.ts
//           (hexToLuminance is the equivalent; covered above)
// ---------------------------------------------------------------------------
it.skip('luminance: skipped — standalone luminance() not exported; hexToLuminance used instead', () => {});

// ---------------------------------------------------------------------------
// Skipped — hexToRgb not exported from colorUtils.ts
// ---------------------------------------------------------------------------
it.skip('hexToRgb: skipped — hexToRgb is not exported from colorUtils.ts', () => {});

// ---------------------------------------------------------------------------
// Skipped — rgbToHex not exported from colorUtils.ts
// ---------------------------------------------------------------------------
it.skip('rgbToHex: skipped — rgbToHex is not exported from colorUtils.ts', () => {});
