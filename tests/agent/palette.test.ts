/**
 * tests/agent/palette.test.ts — ops#188.
 *
 * Two pre-render checks on a generated palette, both ops-side at generation:
 *   1. lazy palette — the agent emitted a stock preset instead of deriving one
 *   2. contrast    — a pair below WCAG AA 4.5:1 would be dead on arrival at the
 *                    site-engine build gate
 *
 * Contrast math mirrors site-engine `packages/template/src/lib/contrast.ts`
 * (WCAG 2.x relative luminance). The reference values below are the published
 * WCAG figures, not values copied from our own implementation.
 */
import { describe, it, expect } from 'vitest';
import {
  contrastRatio,
  checkContrast,
  isLazyPalette,
  PALETTE_KEYS,
  toCssVarOverrides,
} from '../../lib/agent/palette.mjs';
import { PALETTE_PRESETS } from '../../lib/schema/presets.mjs';

const distinct = {
  primary: '#7b2d8e',
  accent: '#e0a800',
  bg: '#fdfcff',
  fg: '#1a121d',
  muted: '#efe7f2',
  onPrimary: '#ffffff',
};

describe('contrastRatio', () => {
  it('returns 21:1 for black on white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });
  it('returns 1:1 for identical colours', () => {
    expect(contrastRatio('#7b2d8e', '#7b2d8e')).toBeCloseTo(1, 5);
  });
  it('is symmetric', () => {
    expect(contrastRatio('#123456', '#fedcba')).toBeCloseTo(
      contrastRatio('#fedcba', '#123456'),
      10,
    );
  });
  it('matches the published ratio for #777777 on white (4.48:1)', () => {
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });
  it('accepts hex with or without the leading #', () => {
    expect(contrastRatio('000000', 'ffffff')).toBeCloseTo(21, 1);
  });
  it('throws on a malformed hex rather than scoring it', () => {
    expect(() => contrastRatio('#xyzxyz', '#ffffff')).toThrow(/hex/i);
    expect(() => contrastRatio('#fff', '#ffffff')).toThrow(/hex/i);
  });
});

describe('checkContrast', () => {
  it('passes a palette whose three AA pairs all clear 4.5:1', () => {
    const r = checkContrast(distinct);
    expect(r.ok).toBe(true);
    expect(r.failures).toEqual([]);
  });

  it('flags primary/onPrimary below 4.5:1', () => {
    const r = checkContrast({ ...distinct, primary: '#ffe600', onPrimary: '#ffffff' });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.pair)).toContain('primary/onPrimary');
  });

  it('flags fg/bg below 4.5:1', () => {
    const r = checkContrast({ ...distinct, fg: '#cccccc', bg: '#ffffff' });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.pair)).toContain('fg/bg');
  });

  it('flags fg/muted below 4.5:1', () => {
    const r = checkContrast({ ...distinct, fg: '#888888', muted: '#909090' });
    expect(r.ok).toBe(false);
    expect(r.failures.map((f) => f.pair)).toContain('fg/muted');
  });

  it('reports the measured ratio so the regeneration note can be specific', () => {
    const r = checkContrast({ ...distinct, fg: '#cccccc', bg: '#ffffff' });
    const f = r.failures.find((x) => x.pair === 'fg/bg');
    expect(f?.ratio).toBeGreaterThan(1);
    expect(f?.ratio).toBeLessThan(4.5);
  });

  it('reports every failing pair, not just the first', () => {
    const r = checkContrast({
      primary: '#ffffff', onPrimary: '#fefefe',
      fg: '#eeeeee', bg: '#ffffff',
      muted: '#efefef', accent: '#000000',
    });
    expect(r.failures.length).toBeGreaterThanOrEqual(2);
  });
});

describe('isLazyPalette', () => {
  it.each(Object.keys(PALETTE_PRESETS))('flags a palette identical to the %s preset', (id) => {
    const preset = PALETTE_PRESETS[id as keyof typeof PALETTE_PRESETS];
    const lazy = {
      primary: preset['--brand-primary'],
      accent: preset['--brand-accent'],
      bg: preset['--brand-bg'],
      fg: preset['--brand-fg'],
      muted: preset['--brand-muted'],
      onPrimary: preset['--brand-on-primary'],
    };
    expect(isLazyPalette(lazy)).toBe(id);
  });

  it('returns null for a genuinely derived palette', () => {
    expect(isLazyPalette(distinct)).toBeNull();
  });

  it('is case-insensitive — #FFFFFF and #ffffff are the same colour', () => {
    const p = PALETTE_PRESETS.landscaping;
    const lazy = {
      primary: p['--brand-primary'].toUpperCase(),
      accent: p['--brand-accent'].toUpperCase(),
      bg: p['--brand-bg'].toUpperCase(),
      fg: p['--brand-fg'].toUpperCase(),
      muted: p['--brand-muted'].toUpperCase(),
      onPrimary: p['--brand-on-primary'].toUpperCase(),
    };
    expect(isLazyPalette(lazy)).toBe('landscaping');
  });

  it('does NOT flag a palette that merely shares one colour with a preset', () => {
    const p = PALETTE_PRESETS.landscaping;
    expect(isLazyPalette({ ...distinct, primary: p['--brand-primary'] })).toBeNull();
  });
});

describe('toCssVarOverrides', () => {
  it('maps the six keys to their --brand-* custom properties', () => {
    expect(toCssVarOverrides(distinct)).toEqual({
      '--brand-primary': '#7b2d8e',
      '--brand-accent': '#e0a800',
      '--brand-bg': '#fdfcff',
      '--brand-fg': '#1a121d',
      '--brand-muted': '#efe7f2',
      '--brand-on-primary': '#ffffff',
    });
  });

  it('emits only keys the schema regex accepts', () => {
    for (const k of Object.keys(toCssVarOverrides(distinct))) {
      expect(k).toMatch(/^--brand-[a-z-]+$/);
    }
  });

  it('covers exactly the declared palette keys', () => {
    expect(Object.keys(toCssVarOverrides(distinct))).toHaveLength(PALETTE_KEYS.length);
  });
});
