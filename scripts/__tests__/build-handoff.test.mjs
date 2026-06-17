/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * Unit tests for scripts/build-handoff.mjs
 *
 * All tests operate purely in memory — no filesystem reads or writes.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  escRe,
  row,
  header,
  replaceSection,
  walk,
  darkMode,
  buildPrimitivesColor,
  buildSemanticAccent,
  buildSemanticColor,
  buildSpacing,
  buildDensity,
} from '../build-handoff.mjs';

// ── escRe ─────────────────────────────────────────────────────────────────────
describe('escRe', () => {
  it('escapes regex special characters', () => {
    expect(escRe('a.b*c')).toBe('a\\.b\\*c');
    expect(escRe('(foo)')).toBe('\\(foo\\)');
    expect(escRe('a+b?')).toBe('a\\+b\\?');
  });

  it('leaves plain text unchanged', () => {
    expect(escRe('hello world')).toBe('hello world');
  });

  it('escapes <!-- --> marker characters correctly', () => {
    const marker = '<!-- auto:start:foo -->';
    const escaped = escRe(marker);
    // Should be usable as a regex without throwing
    expect(() => new RegExp(escaped)).not.toThrow();
  });
});

// ── row ───────────────────────────────────────────────────────────────────────
describe('row', () => {
  it('wraps cells in pipe-separated Markdown row', () => {
    expect(row('A', 'B', 'C')).toBe('| A | B | C |');
  });

  it('handles a single cell', () => {
    expect(row('only')).toBe('| only |');
  });

  it('handles backtick-wrapped values', () => {
    expect(row('`token`', '`#fff`', '')).toBe('| `token` | `#fff` |  |');
  });
});

// ── header ────────────────────────────────────────────────────────────────────
describe('header', () => {
  it('produces a header row + separator', () => {
    const result = header('Token', 'Value');
    const lines  = result.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('| Token | Value |');
    expect(lines[1]).toBe('| --- | --- |');
  });

  it('produces one --- per column', () => {
    const result = header('A', 'B', 'C', 'D');
    expect(result.split('\n')[1]).toBe('| --- | --- | --- | --- |');
  });
});

// ── replaceSection ────────────────────────────────────────────────────────────
describe('replaceSection', () => {
  const DOC = [
    '# Doc',
    '<!-- auto:start:colors -->',
    'old content',
    '<!-- auto:end:colors -->',
    '# After',
  ].join('\n');

  it('replaces content between markers', () => {
    const result = replaceSection(DOC, 'colors', 'new content');
    expect(result).toContain('<!-- auto:start:colors -->\nnew content\n<!-- auto:end:colors -->');
    expect(result).not.toContain('old content');
  });

  it('preserves content outside the markers', () => {
    const result = replaceSection(DOC, 'colors', 'new content');
    expect(result).toContain('# Doc');
    expect(result).toContain('# After');
  });

  it('trims leading/trailing whitespace from content', () => {
    const result = replaceSection(DOC, 'colors', '  trimmed  ');
    expect(result).toContain('<!-- auto:start:colors -->\ntrimmed\n<!-- auto:end:colors -->');
  });

  it('returns doc unchanged and warns when marker is not found', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result  = replaceSection(DOC, 'missing-section', 'content');
    expect(result).toBe(DOC);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('missing-section'));
    warnSpy.mockRestore();
  });

  it('handles multi-line replacement content', () => {
    const content = 'line1\nline2\nline3';
    const result  = replaceSection(DOC, 'colors', content);
    expect(result).toContain('line1\nline2\nline3');
  });
});

// ── walk ──────────────────────────────────────────────────────────────────────
describe('walk', () => {
  it('yields leaf tokens with path and value', () => {
    const tokens = { blue: { $value: '#1e2fff' } };
    const result = [...walk(tokens)];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ path: ['blue'], value: '#1e2fff' });
  });

  it('yields nested tokens with full path', () => {
    const tokens = { color: { brand: { $value: '#1e2fff' } } };
    const result = [...walk(tokens)];
    expect(result[0].path).toEqual(['color', 'brand']);
  });

  it('skips DTCG meta keys ($type, $value, etc.)', () => {
    const tokens = { $type: 'color', $description: 'desc', blue: { $value: '#00f' } };
    const result = [...walk(tokens)];
    expect(result).toHaveLength(1);
  });

  it('yields desc and ext when present', () => {
    const ext = { 'com.figma.variables': { modes: { Dark: '#000' } } };
    const tokens = { white: { $value: '#fff', $description: 'Pure white', $extensions: ext } };
    const result = [...walk(tokens)];
    expect(result[0].desc).toBe('Pure white');
    expect(result[0].ext).toBe(ext);
  });

  it('returns nothing for an empty object', () => {
    expect([...walk({})]).toHaveLength(0);
  });

  it('returns nothing for null/undefined', () => {
    expect([...walk(null)]).toHaveLength(0);
    expect([...walk(undefined)]).toHaveLength(0);
  });
});

// ── darkMode ──────────────────────────────────────────────────────────────────
describe('darkMode', () => {
  it('extracts the Dark mode value from extensions', () => {
    const ext = { 'com.figma.variables': { modes: { Dark: '#000' } } };
    expect(darkMode(ext)).toBe('#000');
  });

  it('returns null when extensions are missing', () => {
    expect(darkMode(null)).toBeNull();
    expect(darkMode(undefined)).toBeNull();
    expect(darkMode({})).toBeNull();
  });

  it('returns null when Dark key is absent', () => {
    const ext = { 'com.figma.variables': { modes: { Light: '#fff' } } };
    expect(darkMode(ext)).toBeNull();
  });
});

// ── buildPrimitivesColor ──────────────────────────────────────────────────────
describe('buildPrimitivesColor', () => {
  const raw = {
    primitive: {
      color: {
        $type: 'color',
        blue: { $value: '#1e2fff', $description: 'Brand blue' },
        white: { $value: '#ffffff' },
      },
    },
  };

  it('includes a header row', () => {
    const result = buildPrimitivesColor(raw);
    expect(result).toContain('| Token | Value | Notes |');
  });

  it('includes token paths with primitive.color prefix', () => {
    const result = buildPrimitivesColor(raw);
    expect(result).toContain('`primitive.color.blue`');
    expect(result).toContain('`primitive.color.white`');
  });

  it('includes hex values', () => {
    const result = buildPrimitivesColor(raw);
    expect(result).toContain('`#1e2fff`');
    expect(result).toContain('`#ffffff`');
  });

  it('includes description as notes', () => {
    const result = buildPrimitivesColor(raw);
    expect(result).toContain('Brand blue');
  });

  it('returns only a header for empty color tokens', () => {
    const result = buildPrimitivesColor({ primitive: { color: {} } });
    expect(result.split('\n')).toHaveLength(2); // header + separator
  });
});

// ── buildSemanticAccent ───────────────────────────────────────────────────────
describe('buildSemanticAccent', () => {
  const ext = { 'com.figma.variables': { modes: { Dark: '#0d1bbd' } } };
  const raw = {
    semantic: {
      accent: {
        primary: { $value: '#1e2fff', $description: 'Main CTA — brand blue', $extensions: ext },
      },
    },
  };

  it('includes light and dark columns', () => {
    const result = buildSemanticAccent(raw);
    expect(result).toContain('`#1e2fff`');
    expect(result).toContain('`#0d1bbd`');
  });

  it('uses the light value as dark fallback when no dark extension', () => {
    const rawNoDark = {
      semantic: { accent: { primary: { $value: '#1e2fff' } } },
    };
    const result = buildSemanticAccent(rawNoDark);
    const rows   = result.split('\n').slice(2);
    expect(rows[0]).toContain('`#1e2fff` | `#1e2fff`');
  });

  it('trims description to the part before —', () => {
    const result = buildSemanticAccent(raw);
    expect(result).toContain('Main CTA');
    expect(result).not.toContain('brand blue');
  });
});

// ── buildSemanticColor ────────────────────────────────────────────────────────
describe('buildSemanticColor', () => {
  const raw = {
    semantic: {
      color: {
        bg: {
          primary: { $value: '{primitive.color.white}' },
        },
      },
    },
  };

  it('renders alias references without backticks', () => {
    const result = buildSemanticColor(raw);
    // Alias values like {primitive.color.white} should not be wrapped in backticks
    expect(result).toContain('{primitive.color.white}');
    expect(result).not.toContain('`{primitive.color.white}`');
  });

  it('uses — as dark fallback when no dark extension', () => {
    const result = buildSemanticColor(raw);
    expect(result).toContain('`—`');
  });

  it('includes token paths with semantic.color prefix', () => {
    const result = buildSemanticColor(raw);
    expect(result).toContain('`semantic.color.bg.primary`');
  });
});

// ── buildSpacing ──────────────────────────────────────────────────────────────
describe('buildSpacing', () => {
  const raw = {
    primitive: {
      space: {
        px4:  { $value: { value: 4,  unit: 'px' }, $description: 'Micro' },
        px16: { $value: { value: 16, unit: 'px' } },
      },
    },
  };

  it('renders object values as value+unit string', () => {
    const result = buildSpacing(raw);
    expect(result).toContain('`4px`');
    expect(result).toContain('`16px`');
  });

  it('includes token paths with primitive.space prefix', () => {
    const result = buildSpacing(raw);
    expect(result).toContain('`primitive.space.px4`');
  });

  it('includes description as notes', () => {
    const result = buildSpacing(raw);
    expect(result).toContain('Micro');
  });

  it('handles scalar (non-object) spacing values', () => {
    const rawScalar = { primitive: { space: { gap: { $value: '8px' } } } };
    const result    = buildSpacing(rawScalar);
    expect(result).toContain('`8px`');
  });
});

// ── buildDensity ──────────────────────────────────────────────────────────────
describe('buildDensity', () => {
  it('includes all 8 density scale entries', () => {
    const result = buildDensity();
    const dataRows = result.split('\n').filter(l => l.startsWith('|') && !l.includes('CSS var') && !l.includes('---'));
    expect(dataRows).toHaveLength(8);
  });

  it('includes comfortable and compact values for each size', () => {
    const result = buildDensity();
    expect(result).toContain('4px');
    expect(result).toContain('2px');
    expect(result).toContain('--hds-space-xs');
    expect(result).toContain('--hds-space-4xl');
  });

  it('includes the toggle usage hint', () => {
    const result = buildDensity();
    expect(result).toContain("dataset.density = 'compact'");
    expect(result).toContain('useTheme().setDensity');
  });
});
