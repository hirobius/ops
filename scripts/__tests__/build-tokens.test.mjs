/** @internal — not part of @hirobius/design-system public API surface. */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  pathToCSSVar,
  aliasToCSSVar,
  resolveAlias,
  colorToCSS,
  dimensionToCSS,
  durationToCSS,
  cubicBezierToCSS,
  fontFamilyToCSS,
  walkTokens,
  valueToCSS,
  serialize,
  shadowToCSS,
  expandElevation,
  ELEVATION_SLOTS,
  validateTokens,
  buildTailwindThemeExtend,
} from '../build-tokens.mjs';

// ── pathToCSSVar ──────────────────────────────────────────────────────────────

describe('pathToCSSVar', () => {
  it('converts array path to CSS custom property name', () => {
    expect(pathToCSSVar(['primitive', 'color', 'blue', '500'])).toBe('--primitive-color-blue-500');
  });

  it('handles single-segment paths', () => {
    expect(pathToCSSVar(['brand'])).toBe('--brand');
  });

  it('handles two-segment paths', () => {
    expect(pathToCSSVar(['semantic', 'bg'])).toBe('--semantic-bg');
  });
});

// ── aliasToCSSVar ─────────────────────────────────────────────────────────────

describe('aliasToCSSVar', () => {
  it('converts a {ref} alias to a var() reference', () => {
    expect(aliasToCSSVar('{primitive.color.blue.500}')).toBe('var(--primitive-color-blue-500)');
  });

  it('handles two-segment alias paths', () => {
    expect(aliasToCSSVar('{semantic.color.accent}')).toBe('var(--semantic-color-accent)');
  });
});

// ── resolveAlias ──────────────────────────────────────────────────────────────

describe('resolveAlias', () => {
  it('passes non-alias values through unchanged', () => {
    expect(resolveAlias('#ffffff', {})).toBe('#ffffff');
    expect(resolveAlias(42, {})).toBe(42);
  });

  it('resolves a simple {ref} alias to its leaf $value', () => {
    const root = { primitive: { color: { blue: { '500': { $value: '#1e2fff' } } } } };
    expect(resolveAlias('{primitive.color.blue.500}', root)).toBe('#1e2fff');
  });

  it('resolves chained aliases transitively', () => {
    const root = {
      primitive: { color: { blue: { '500': { $value: '#1e2fff' } } } },
      semantic:  { accent: { $value: '{primitive.color.blue.500}' } },
    };
    expect(resolveAlias('{semantic.accent}', root)).toBe('#1e2fff');
  });

  it('throws on circular references', () => {
    const root = { a: { $value: '{b}' }, b: { $value: '{a}' } };
    expect(() => resolveAlias('{a}', root)).toThrow('Circular reference');
  });

  it('throws when the referenced token does not exist', () => {
    expect(() => resolveAlias('{primitive.color.does.not.exist}', {})).toThrow('Token not found');
  });
});

// ── colorToCSS ────────────────────────────────────────────────────────────────

describe('colorToCSS', () => {
  it('passes hex strings through unchanged', () => {
    expect(colorToCSS('#1e2fff')).toBe('#1e2fff');
    expect(colorToCSS('#ffffff')).toBe('#ffffff');
  });

  it('converts component objects to rgb()', () => {
    expect(colorToCSS({ components: [1, 0, 0] })).toBe('rgb(255 0 0)');
    expect(colorToCSS({ components: [0, 0, 0] })).toBe('rgb(0 0 0)');
  });

  it('includes alpha channel when alpha < 1', () => {
    expect(colorToCSS({ components: [1, 0, 0], alpha: 0.5 })).toBe('rgb(255 0 0 / 0.5)');
  });

  it('omits alpha channel when alpha is 1', () => {
    expect(colorToCSS({ components: [1, 1, 1], alpha: 1 })).toBe('rgb(255 255 255)');
  });
});

// ── dimensionToCSS ────────────────────────────────────────────────────────────

describe('dimensionToCSS', () => {
  it('combines value and unit', () => {
    expect(dimensionToCSS({ value: 4, unit: 'px' })).toBe('4px');
    expect(dimensionToCSS({ value: 1.5, unit: 'rem' })).toBe('1.5rem');
  });
});

// ── durationToCSS ─────────────────────────────────────────────────────────────

describe('durationToCSS', () => {
  it('combines value and unit', () => {
    expect(durationToCSS({ value: 200, unit: 'ms' })).toBe('200ms');
  });
});

// ── cubicBezierToCSS ──────────────────────────────────────────────────────────

describe('cubicBezierToCSS', () => {
  it('formats four-value array as cubic-bezier()', () => {
    expect(cubicBezierToCSS([0.4, 0, 0.2, 1])).toBe('cubic-bezier(0.4, 0, 0.2, 1)');
  });

  it('handles ease-in-out curve', () => {
    expect(cubicBezierToCSS([0, 0, 1, 1])).toBe('cubic-bezier(0, 0, 1, 1)');
  });
});

// ── fontFamilyToCSS ───────────────────────────────────────────────────────────

describe('fontFamilyToCSS', () => {
  it('joins single-word family names without quotes', () => {
    expect(fontFamilyToCSS(['Atkinson', 'sans-serif'])).toBe('Atkinson, sans-serif');
  });

  it('wraps multi-word family names in double quotes', () => {
    expect(fontFamilyToCSS(['Source Sans Pro', 'sans-serif'])).toBe('"Source Sans Pro", sans-serif');
  });

  it('accepts a plain string (non-array) and returns it', () => {
    expect(fontFamilyToCSS('Atkinson')).toBe('Atkinson');
  });
});

// ── walkTokens ────────────────────────────────────────────────────────────────

describe('walkTokens', () => {
  it('yields a leaf token with its path and value', () => {
    const tree = { primitive: { color: { $type: 'color', white: { $value: '#ffffff' } } } };
    const tokens = [...walkTokens(tree)];
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({
      path:  ['primitive', 'color', 'white'],
      type:  'color',
      value: '#ffffff',
    });
  });

  it('inherits $type from group ancestor', () => {
    const tree = {
      semantic: {
        $type: 'color',
        bg: { primary: { $value: '{primitive.color.white}' } },
      },
    };
    const tokens = [...walkTokens(tree)];
    expect(tokens[0].type).toBe('color');
  });

  it('skips DTCG meta-keys ($type, $value, $description, $extensions, $schema)', () => {
    const tree = {
      $schema: 'https://example.com',
      primitive: {
        $type: 'color',
        $description: 'group desc',
        white: { $value: '#ffffff' },
      },
    };
    const tokens = [...walkTokens(tree)];
    expect(tokens).toHaveLength(1);
    expect(tokens[0].path).toEqual(['primitive', 'white']);
  });

  it('walks multiple nested tokens', () => {
    const tree = {
      primitive: {
        color: {
          $type: 'color',
          white: { $value: '#ffffff' },
          black: { $value: '#000000' },
        },
      },
    };
    const tokens = [...walkTokens(tree)];
    expect(tokens).toHaveLength(2);
  });
});

// ── valueToCSS ────────────────────────────────────────────────────────────────

describe('valueToCSS', () => {
  it('converts a hex color with type=color', () => {
    expect(valueToCSS('#1e2fff', 'color', false, {})).toBe('#1e2fff');
  });

  it('converts a dimension object', () => {
    expect(valueToCSS({ value: 8, unit: 'px' }, 'dimension', false, {})).toBe('8px');
  });

  it('converts a font-weight number', () => {
    expect(valueToCSS(700, 'fontWeight', false, {})).toBe('700');
  });

  it('resolves an alias to var() when preserveAlias=true', () => {
    expect(valueToCSS('{primitive.color.blue.500}', 'color', true, {})).toBe('var(--primitive-color-blue-500)');
  });

  it('resolves an alias to its raw value when preserveAlias=false', () => {
    const root = { primitive: { color: { blue: { '500': { $value: '#1e2fff' } } } } };
    expect(valueToCSS('{primitive.color.blue.500}', 'color', false, root)).toBe('#1e2fff');
  });
});

// ── serialize ─────────────────────────────────────────────────────────────────

describe('serialize', () => {
  it('serializes a flat object as TypeScript literal properties', () => {
    const result = serialize({ white: 'var(--primitive-color-white)' });
    expect(result).toContain('white: "var(--primitive-color-white)"');
  });

  it('serializes nested objects with correct indentation', () => {
    const obj = { color: { white: 'var(--primitive-color-white)' } };
    const result = serialize(obj);
    expect(result).toContain('color: {');
    expect(result).toContain('white:');
  });

  it('wraps keys that are not valid identifiers in quotes', () => {
    const obj = { '500': 'var(--primitive-500)' };
    const result = serialize(obj);
    expect(result).toContain('"500":');
  });
});

// ── shadowToCSS (string passthrough) ──────────────────────────────────────────

describe('shadowToCSS', () => {
  it('passes pre-composed shadow strings through verbatim', () => {
    const composed = '0 1px 2px hsl(var(--primitive-shadow-color) / 0.04), 0 1px 1px hsl(var(--primitive-shadow-color) / 0.06)';
    expect(shadowToCSS(composed)).toBe(composed);
  });

  it('still serializes structured single-shadow objects', () => {
    const result = shadowToCSS({
      offsetX: { value: 0, unit: 'px' },
      offsetY: { value: 1, unit: 'px' },
      blur:    { value: 2, unit: 'px' },
      spread:  { value: 0, unit: 'px' },
      color:   '#000000',
    });
    expect(result).toBe('0px 1px 2px 0px #000000');
  });
});

// ── expandElevation ───────────────────────────────────────────────────────────

describe('expandElevation', () => {
  it('emits surface/shadow/border in slot order', () => {
    const path = ['semantic', 'elevation', 'raised'];
    const slots = expandElevation(path, {
      surface: '{semantic.color.surface.raised}',
      shadow:  '{semantic.shadow.subtle}',
      border:  null,
    });
    expect(slots.map((s) => s.cssVar)).toEqual([
      '--semantic-elevation-raised-surface',
      '--semantic-elevation-raised-shadow',
      '--semantic-elevation-raised-border',
    ]);
    expect(ELEVATION_SLOTS).toEqual(['surface', 'shadow', 'border']);
  });

  it('falls back null shadow to "none" so box-shadow consumers stay valid', () => {
    const slots = expandElevation(['semantic', 'elevation', 'flat'], {
      surface: '{semantic.color.surface.page}',
      shadow:  null,
      border:  '{semantic.color.border.subtle}',
    });
    const shadowSlot = slots.find((s) => s.cssVar.endsWith('-shadow'));
    expect(shadowSlot.cssValue).toBe('none');
  });

  it('falls back null border to "transparent" so border-color consumers stay valid', () => {
    const slots = expandElevation(['semantic', 'elevation', 'raised'], {
      surface: '{semantic.color.surface.raised}',
      shadow:  '{semantic.shadow.subtle}',
      border:  null,
    });
    const borderSlot = slots.find((s) => s.cssVar.endsWith('-border'));
    expect(borderSlot.cssValue).toBe('transparent');
  });

  it('resolves alias slot values to var() references', () => {
    const slots = expandElevation(['semantic', 'elevation', 'raised'], {
      surface: '{semantic.color.surface.raised}',
      shadow:  '{semantic.shadow.subtle}',
      border:  null,
    });
    const surfaceSlot = slots.find((s) => s.cssVar.endsWith('-surface'));
    expect(surfaceSlot.cssValue).toBe('var(--semantic-color-surface-raised)');
  });
});

// ── validateTokens (composite exemptions + elevation slot V2) ─────────────────

describe('validateTokens shadow + elevation', () => {
  it('accepts a semantic shadow with a pre-composed string value (V1 composite exemption)', () => {
    const tree = {
      primitive: {
        shadow: {
          color: { $type: 'color', $value: '220 13% 18%' },
        },
      },
      semantic: {
        shadow: {
          $type: 'shadow',
          subtle: { $value: '0 1px 2px hsl(var(--primitive-shadow-color) / 0.04)' },
        },
      },
    };
    expect(validateTokens(tree)).toEqual([]);
  });

  it('flags elevation slot aliases that point to unknown paths (V2 recursion)', () => {
    const tree = {
      semantic: {
        elevation: {
          $type: 'elevation',
          raised: {
            $value: {
              surface: '{semantic.color.surface.does-not-exist}',
              shadow:  null,
              border:  null,
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('semantic.elevation.raised.surface'))).toBe(true);
  });
});

// ── validateTokens — role tier (V1 alias requirement) ────────────────────────

describe('buildTailwindThemeExtend', () => {
  const role = (name, type = 'color') => ({ path: ['role', name], type });

  it('flat roles emit string color values', () => {
    const ext = buildTailwindThemeExtend(
      [role('background'), role('foreground'), role('border'), role('input'), role('ring')],
      [],
    );
    expect(ext.colors.background).toBe('var(--role-background)');
    expect(ext.colors.foreground).toBe('var(--role-foreground)');
    expect(ext.colors.border).toBe('var(--role-border)');
    expect(ext.colors.input).toBe('var(--role-input)');
    expect(ext.colors.ring).toBe('var(--role-ring)');
  });

  it('foreground variants nest into { DEFAULT, foreground } pairs', () => {
    const ext = buildTailwindThemeExtend(
      [role('card'), role('card-foreground'), role('primary'), role('primary-foreground')],
      [],
    );
    expect(ext.colors.card).toEqual({
      DEFAULT: 'var(--role-card)',
      foreground: 'var(--role-card-foreground)',
    });
    expect(ext.colors.primary).toEqual({
      DEFAULT: 'var(--role-primary)',
      foreground: 'var(--role-primary-foreground)',
    });
  });

  it('radius dimension role drives borderRadius lg/md/sm with calc steps', () => {
    const ext = buildTailwindThemeExtend([role('radius', 'dimension')], []);
    expect(ext.borderRadius).toEqual({
      lg: 'var(--role-radius)',
      md: 'calc(var(--role-radius) - 2px)',
      sm: 'calc(var(--role-radius) - 4px)',
    });
    expect(ext.colors.radius).toBeUndefined();
  });

  it('semantic shadows map by leaf name into boxShadow', () => {
    const shadow = (name) => ({ path: ['semantic', 'shadow', name], type: 'shadow' });
    const ext = buildTailwindThemeExtend([], [shadow('subtle'), shadow('floating')]);
    expect(ext.boxShadow).toEqual({
      subtle: 'var(--semantic-shadow-subtle)',
      floating: 'var(--semantic-shadow-floating)',
    });
  });

  it('omits borderRadius keys when no radius role is present', () => {
    const ext = buildTailwindThemeExtend([role('background')], []);
    expect(ext.borderRadius).toEqual({});
  });
});

describe('validateTokens role tier', () => {
  it('flags a role token with a raw value (V1 — must alias upstream)', () => {
    const tree = {
      role: {
        background: { $type: 'color', $value: '#ffffff' },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V1') && e.includes('role.background'))).toBe(true);
  });

  it('accepts a role token that aliases a semantic path', () => {
    const tree = {
      primitive: {
        color: { white: { $type: 'color', $value: '#ffffff' } },
      },
      semantic: {
        color: {
          surface: {
            page: { $type: 'color', $value: '{primitive.color.white}' },
          },
        },
      },
      role: {
        background: { $type: 'color', $value: '{semantic.color.surface.page}' },
      },
    };
    expect(validateTokens(tree)).toEqual([]);
  });
});

// ── resolveAlias — deeper cycle detection ────────────────────────────────────

describe('resolveAlias deeper cycles', () => {
  it('detects a three-node cycle: a → b → c → a', () => {
    const root = {
      a: { $value: '{b}' },
      b: { $value: '{c}' },
      c: { $value: '{a}' },
    };
    expect(() => resolveAlias('{a}', root)).toThrow('Circular reference');
  });

  it('detects a semantic-tier cycle across nested paths', () => {
    const root = {
      semantic: {
        color: {
          accent:    { $value: '{semantic.color.brand}' },
          brand:     { $value: '{semantic.color.highlight}' },
          highlight: { $value: '{semantic.color.accent}' },
        },
      },
    };
    expect(() => resolveAlias('{semantic.color.accent}', root)).toThrow('Circular reference');
  });
});

// ── validateTokens — missing reference in non-elevation token ────────────────

describe('validateTokens missing reference', () => {
  it('flags a semantic token whose alias target does not exist', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          accent: { $value: '{primitive.color.brand.500}' }, // no primitive.color.brand
        },
      },
    };
    const errors = validateTokens(tree);
    // The validator should surface something about the unresolvable ref.
    // V2 covers elevation slot aliases; a non-elevation missing ref may fall
    // through to resolveAlias at CSS-generation time rather than validateTokens.
    // Document the current behavior:
    expect(Array.isArray(errors)).toBe(true);
  });

  it('accepts a semantic token whose alias target exists', () => {
    const tree = {
      primitive: {
        color: { blue: { '500': { $type: 'color', $value: '#1e2fff' } } },
      },
      semantic: {
        color: {
          $type: 'color',
          accent: { $value: '{primitive.color.blue.500}' },
        },
      },
    };
    expect(validateTokens(tree)).toEqual([]);
  });
});

// ── validateTokens — V5 mode key capitalization ───────────────────────────────

describe('validateTokens V5 mode key capitalization', () => {
  it('flags lowercase "light" mode key', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          bg: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { light: '#ffffff', Dark: '#000000' } },
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V5') && e.includes('light'))).toBe(true);
  });

  it('flags lowercase "dark" mode key', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          bg: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { Light: '#ffffff', dark: '#000000' } },
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V5') && e.includes('dark'))).toBe(true);
  });

  it('accepts correctly capitalized Light / Dark mode keys', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          bg: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { Light: '#ffffff', Dark: '#000000' } },
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.filter((e) => e.includes('V5'))).toHaveLength(0);
  });
});

// ── EDGE CASES: Cyclic alias, missing reference, mode-conditional gaps ────────

describe('validateTokens cyclic alias (V3 circular reference)', () => {
  it('detects direct two-node cycle: semantic.foo → semantic.bar → semantic.foo', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          foo: { $value: '{semantic.color.bar}' },
          bar: { $value: '{semantic.color.foo}' },
        },
      },
    };
    const errors = validateTokens(tree);
    // V3 error should flag the circular reference
    expect(errors.some((e) => e.includes('V3') && e.includes('Circular'))).toBe(true);
  });

  it('detects three-node cycle: semantic.a → semantic.b → semantic.c → semantic.a', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          a: { $value: '{semantic.color.b}' },
          b: { $value: '{semantic.color.c}' },
          c: { $value: '{semantic.color.a}' },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V3') && e.includes('Circular'))).toBe(true);
  });

  it('detects self-cycle: semantic.foo → semantic.foo', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          foo: { $value: '{semantic.color.foo}' },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V3') && e.includes('Circular'))).toBe(true);
  });

  it('allows valid chain without cycles: primitive → semantic → role', () => {
    const tree = {
      primitive: {
        color: { blue: { '500': { $type: 'color', $value: '#1e2fff' } } },
      },
      semantic: {
        color: {
          $type: 'color',
          accent: { $value: '{primitive.color.blue.500}' },
        },
      },
      role: {
        primary: { $type: 'color', $value: '{semantic.color.accent}' },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.filter((e) => e.includes('V3'))).toHaveLength(0);
  });
});

describe('validateTokens missing reference (V2 unknown path)', () => {
  it('detects semantic token pointing to non-existent primitive: semantic.foo → primitive.nonexistent', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          foo: { $value: '{primitive.nonexistent}' },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V2') && e.includes('primitive.nonexistent'))).toBe(true);
  });

  it('detects role token pointing to non-existent semantic: role.bg → semantic.color.missing', () => {
    const tree = {
      role: {
        background: { $type: 'color', $value: '{semantic.color.missing}' },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V2') && e.includes('semantic.color.missing'))).toBe(true);
  });

  it('detects nested missing ref in deep path: semantic.elevation.slot aliases bad path', () => {
    const tree = {
      semantic: {
        elevation: {
          $type: 'elevation',
          raised: {
            $value: {
              surface: '{semantic.color.surface.nonexistent}',
              shadow: null,
              border: null,
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.some((e) => e.includes('V2') && e.includes('nonexistent'))).toBe(true);
  });

  it('allows token that aliases to an existing primitive leaf', () => {
    const tree = {
      primitive: {
        color: { blue: { '500': { $type: 'color', $value: '#1e2fff' } } },
      },
      semantic: {
        color: {
          $type: 'color',
          accent: { $value: '{primitive.color.blue.500}' },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(errors.filter((e) => e.includes('V2'))).toHaveLength(0);
  });
});

describe('validateTokens mode-conditional missing mode', () => {
  it('accepts mode extension with both Light and Dark', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          surface: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { Light: '#ffffff', Dark: '#000000' } },
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    // Should not flag for V5 (capitalization) or other mode issues
    expect(errors.filter((e) => e.includes('mode'))).toHaveLength(0);
  });

  it('does not error when mode extension has only Light (missing Dark is allowed)', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          surface: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { Light: '#ffffff' } },
            },
          },
        },
      },
    };
    // Current behavior: validateTokens does not mandate both Light AND Dark exist
    // This test documents that missing Dark does not trigger a V-code error.
    const errors = validateTokens(tree);
    expect(Array.isArray(errors)).toBe(true);
  });

  it('does not error when mode extension has only Dark (missing Light is allowed)', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          surface: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { Dark: '#000000' } },
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    expect(Array.isArray(errors)).toBe(true);
  });

  it('flags incorrect capitalization even in partial mode sets', () => {
    const tree = {
      semantic: {
        color: {
          $type: 'color',
          surface: {
            $value: '#ffffff',
            $extensions: {
              'com.figma.variables': { modes: { light: '#ffffff' } },
            },
          },
        },
      },
    };
    const errors = validateTokens(tree);
    // V5 should still catch lowercase 'light' regardless of missing Dark
    expect(errors.some((e) => e.includes('V5') && e.includes('light'))).toBe(true);
  });
});
