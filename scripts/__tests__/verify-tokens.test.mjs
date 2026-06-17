/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Unit tests for scripts/verify-tokens.mjs
 *
 * All tests operate purely in memory — no filesystem reads.
 * Build a minimal token JSON + CSS/TS string for each scenario.
 */

import { describe, it, expect } from 'vitest';
import {
  expandedTypoVars,
  expandedTransitionVars,
  parseCSSVarMap,
  runChecks,
} from '../verify-tokens.mjs';

// ── expandedTypoVars ──────────────────────────────────────────────────────────
describe('expandedTypoVars', () => {
  it('returns 5 sub-vars when the composite has no optional keys', () => {
    const vars = expandedTypoVars(['semantic', 'typography', 'h1'], {
      fontFamily: '{primitive.typography.family.primary}',
      fontSize: '{primitive.typography.size.4xl}',
      fontWeight: '{primitive.typography.weight.light}',
      letterSpacing: '{primitive.typography.letterSpacing.tight}',
      lineHeight: '{primitive.typography.lineHeight.tight}',
    });
    expect(vars).toHaveLength(5);
  });

  it('produces the correct CSS var names without maxWidth', () => {
    const vars = expandedTypoVars(['semantic', 'typography', 'h1'], {
      fontFamily: '{primitive.typography.family.primary}',
      fontSize: '{primitive.typography.size.4xl}',
      fontWeight: '{primitive.typography.weight.light}',
      letterSpacing: '{primitive.typography.letterSpacing.tight}',
      lineHeight: '{primitive.typography.lineHeight.tight}',
    });
    expect(vars).toEqual([
      '--semantic-typography-h1-font-family',
      '--semantic-typography-h1-font-size',
      '--semantic-typography-h1-font-weight',
      '--semantic-typography-h1-letter-spacing',
      '--semantic-typography-h1-line-height',
    ]);
  });

  it('emits the max-width sub-var when the composite defines maxWidth', () => {
    const vars = expandedTypoVars(['semantic', 'typography', 'body'], {
      fontFamily: '{primitive.typography.family.primary}',
      fontSize: '{primitive.typography.size.base}',
      fontWeight: '{primitive.typography.weight.regular}',
      letterSpacing: '{primitive.typography.letterSpacing.normal}',
      lineHeight: '{primitive.typography.lineHeight.relaxed}',
      maxWidth: { value: 60, unit: 'ch' },
    });
    expect(vars).toEqual([
      '--semantic-typography-body-font-family',
      '--semantic-typography-body-font-size',
      '--semantic-typography-body-font-weight',
      '--semantic-typography-body-letter-spacing',
      '--semantic-typography-body-line-height',
      '--semantic-typography-body-max-width',
    ]);
  });
});

// ── expandedTransitionVars ────────────────────────────────────────────────────
describe('expandedTransitionVars', () => {
  it('returns 3 sub-vars from a path', () => {
    const vars = expandedTransitionVars(['primitive', 'motion', 'ease']);
    expect(vars).toHaveLength(3);
  });

  it('produces the correct CSS var names', () => {
    const vars = expandedTransitionVars(['primitive', 'motion', 'ease']);
    expect(vars).toEqual([
      '--primitive-motion-ease-duration',
      '--primitive-motion-ease-delay',
      '--primitive-motion-ease-timing-function',
    ]);
  });
});

// ── parseCSSVarMap ────────────────────────────────────────────────────────────
// Note: the regex matches lines starting with optional whitespace + '--'.
// Test CSS must use one-var-per-line format, matching real tokens.css output.
describe('parseCSSVarMap', () => {
  it('parses a simple CSS var', () => {
    const css = ':root {\n  --color-blue: #1e2fff;\n}';
    const map = parseCSSVarMap(css);
    expect(map.get('--color-blue')).toBe('#1e2fff');
  });

  it('parses multiple vars', () => {
    const css = ':root {\n  --a: #fff;\n  --b: #000;\n}';
    const map = parseCSSVarMap(css);
    expect(map.size).toBe(2);
    expect(map.get('--a')).toBe('#fff');
    expect(map.get('--b')).toBe('#000');
  });

  it('keeps the first occurrence (light-mode wins over dark override)', () => {
    const css = ':root {\n  --x: #fff;\n}\n[data-theme="dark"] {\n  --x: #000;\n}';
    const map = parseCSSVarMap(css);
    expect(map.get('--x')).toBe('#fff');
  });

  it('parses var() alias values', () => {
    const css = ':root {\n  --semantic-bg: var(--primitive-white);\n}';
    const map = parseCSSVarMap(css);
    expect(map.get('--semantic-bg')).toBe('var(--primitive-white)');
  });

  it('returns an empty map for empty CSS', () => {
    expect(parseCSSVarMap('').size).toBe(0);
  });

  it('ignores non-var declarations', () => {
    const css = ':root {\n  color: red;\n  font-size: 16px;\n  --ok: #fff;\n}';
    const map = parseCSSVarMap(css);
    expect(map.size).toBe(1);
    expect(map.has('--ok')).toBe(true);
  });
});

// ── runChecks helpers ─────────────────────────────────────────────────────────
/** Build minimal token JSON with one primitive color token. */
function makeTokens(overrides = {}) {
  return {
    primitive: {
      color: {
        $type: 'color',
        white: { $value: '#ffffff' },
        ...overrides,
      },
    },
  };
}

/** CSS declaring a single primitive var (one-per-line to match real tokens.css). */
const CLEAN_CSS = ':root {\n  --primitive-color-white: #ffffff;\n}';

/** TS file referencing the same var. */
const CLEAN_TS = 'export const tokens = { white: "var(--primitive-color-white)" };';

// ── runChecks — happy path ────────────────────────────────────────────────────
describe('runChecks — clean state', () => {
  it('returns no errors or warnings for a valid pipeline', () => {
    const raw = makeTokens();
    const cssVarMap = parseCSSVarMap(CLEAN_CSS);
    const { errors, warnings } = runChecks(raw, cssVarMap, CLEAN_TS);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('counts checked tokens correctly', () => {
    const raw = makeTokens();
    const cssVarMap = parseCSSVarMap(CLEAN_CSS);
    const { checked } = runChecks(raw, cssVarMap, CLEAN_TS);
    expect(checked).toBe(1);
  });
});

// ── Check 1: MISSING_CSS_VAR ──────────────────────────────────────────────────
describe('runChecks — MISSING_CSS_VAR', () => {
  it('reports an error when a token has no CSS var', () => {
    const raw = makeTokens();
    const cssVarMap = parseCSSVarMap(':root {}'); // empty CSS
    const { errors } = runChecks(raw, cssVarMap, CLEAN_TS);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/MISSING_CSS_VAR.*--primitive-color-white/);
  });
});

// ── Check 2: NOT_ALIASED ──────────────────────────────────────────────────────
describe('runChecks — NOT_ALIASED', () => {
  it('errors when a semantic token has a raw value instead of an alias', () => {
    const raw = {
      primitive: { color: { $type: 'color', white: { $value: '#fff' } } },
      semantic: { color: { $type: 'color', bg: { $value: '#fff' } } },
    };
    const css = ':root {\n  --primitive-color-white: #fff;\n  --semantic-color-bg: #fff;\n}';
    const ts  = '"var(--primitive-color-white)" "var(--semantic-color-bg)"';
    const cssVarMap = parseCSSVarMap(css);
    const { errors } = runChecks(raw, cssVarMap, ts);
    expect(errors.some(e => e.includes('NOT_ALIASED') && e.includes('--semantic-color-bg'))).toBe(true);
  });

  it('allows oklch() values at the semantic layer', () => {
    const raw = {
      primitive: { color: { $type: 'color', white: { $value: '#fff' } } },
      semantic: { color: { $type: 'color', bg: { $value: '#fff' } } },
    };
    const css = ':root {\n  --primitive-color-white: #fff;\n  --semantic-color-bg: oklch(100% 0 0);\n}';
    const ts  = '"var(--primitive-color-white)" "var(--semantic-color-bg)"';
    const cssVarMap = parseCSSVarMap(css);
    const { errors } = runChecks(raw, cssVarMap, ts);
    expect(errors.some(e => e.includes('NOT_ALIASED'))).toBe(false);
  });
});

// ── Check 3: BROKEN_ALIAS ─────────────────────────────────────────────────────
describe('runChecks — BROKEN_ALIAS', () => {
  it('errors when an alias points to a var that does not exist', () => {
    const raw = {
      primitive: { color: { $type: 'color', white: { $value: '#fff' } } },
      semantic: { color: { $type: 'color', bg: { $value: '{primitive.color.white}' } } },
    };
    const css = ':root {\n  --primitive-color-white: #fff;\n  --semantic-color-bg: var(--primitive-color-TYPO);\n}';
    const ts  = '"var(--primitive-color-white)" "var(--semantic-color-bg)"';
    const cssVarMap = parseCSSVarMap(css);
    const { errors } = runChecks(raw, cssVarMap, ts);
    expect(errors.some(e => e.includes('BROKEN_ALIAS') && e.includes('--semantic-color-bg'))).toBe(true);
  });
});

// ── Check 5: MISSING_TS_REF ───────────────────────────────────────────────────
describe('runChecks — MISSING_TS_REF', () => {
  it('warns when a CSS var is absent from generated-tokens.ts', () => {
    const raw = makeTokens();
    const cssVarMap = parseCSSVarMap(CLEAN_CSS);
    const ts = '// no vars here';
    const { warnings } = runChecks(raw, cssVarMap, ts);
    expect(warnings.some(w => w.includes('MISSING_TS_REF') && w.includes('--primitive-color-white'))).toBe(true);
  });
});

// ── Check 6: ORPHANED_CSS_VAR ─────────────────────────────────────────────────
describe('runChecks — ORPHANED_CSS_VAR', () => {
  it('warns when a CSS var has no matching JSON token', () => {
    const raw = makeTokens(); // only defines --primitive-color-white
    const css = ':root {\n  --primitive-color-white: #fff;\n  --orphan-var: red;\n}';
    const cssVarMap = parseCSSVarMap(css);
    const { warnings, orphans } = runChecks(raw, cssVarMap, CLEAN_TS);
    expect(orphans).toBe(1);
    expect(warnings.some(w => w.includes('ORPHANED_CSS_VAR') && w.includes('--orphan-var'))).toBe(true);
  });

  it('reports zero orphans when CSS exactly matches JSON', () => {
    const raw = makeTokens();
    const cssVarMap = parseCSSVarMap(CLEAN_CSS);
    const { orphans } = runChecks(raw, cssVarMap, CLEAN_TS);
    expect(orphans).toBe(0);
  });
});

// ── Typography composite expansion ───────────────────────────────────────────
describe('runChecks — typography composite', () => {
  it('counts skipped composites and checks sub-vars', () => {
    const value = {
      fontFamily: 'Atkinson Hyperlegible Next',
      fontSize: '16px',
      fontWeight: '400',
      letterSpacing: '0',
      lineHeight: '1.5',
    };
    const raw = {
      semantic: {
        typography: {
          body: { $type: 'typography', $value: value },
        },
      },
    };
    const subVars = expandedTypoVars(['semantic', 'typography', 'body'], value);
    const cssLines = subVars.map(v => `  ${v}: value;`).join('\n');
    const css = `:root {\n${cssLines}\n}`;
    const cssVarMap = parseCSSVarMap(css);
    const { skipped, checked, errors } = runChecks(raw, cssVarMap, '');
    expect(skipped).toBe(1);
    expect(checked).toBe(5);
    expect(errors).toHaveLength(0);
  });

  it('errors when a typography sub-var is missing from CSS', () => {
    const raw = {
      semantic: {
        typography: {
          body: {
            $type: 'typography',
            $value: { fontFamily: 'Atkinson Hyperlegible Next', fontSize: '16px', fontWeight: '400', letterSpacing: '0', lineHeight: '1.5' },
          },
        },
      },
    };
    const cssVarMap = parseCSSVarMap(':root {}');
    const { errors } = runChecks(raw, cssVarMap, '');
    expect(errors).toHaveLength(5);
    errors.forEach(e => expect(e).toMatch(/MISSING_CSS_VAR.*expanded from typography/));
  });
});

// ── Transition composite expansion ───────────────────────────────────────────
describe('runChecks — transition composite', () => {
  it('counts skipped composites and checks sub-vars', () => {
    const raw = {
      primitive: {
        motion: {
          ease: {
            $type: 'transition',
            $value: { duration: '200ms', delay: '0ms', timingFunction: [0.4, 0, 0.2, 1] },
          },
        },
      },
    };
    const subVars = expandedTransitionVars(['primitive', 'motion', 'ease']);
    const cssLines = subVars.map(v => `  ${v}: value;`).join('\n');
    const cssVarMap = parseCSSVarMap(`:root {\n${cssLines}\n}`);
    const { skipped, checked, errors } = runChecks(raw, cssVarMap, '');
    expect(skipped).toBe(1);
    expect(checked).toBe(3);
    expect(errors).toHaveLength(0);
  });
});
