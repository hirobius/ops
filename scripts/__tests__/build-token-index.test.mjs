/** @internal — not part of @hirobius/design-system public API surface. */
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  pathToCSSVar,
  buildExpectedValues,
  parseCSSVarDefinitions,
  findDeadTokens,
  parseHandoffHexes,
  diffHandoffHexes,
  findAuditOkComments,
} from '../build-token-index.mjs';

// ── pathToCSSVar ──────────────────────────────────────────────────────────────

describe('pathToCSSVar', () => {
  it('converts dot-path to CSS var name', () => {
    expect(pathToCSSVar('primitive.color.blue.500')).toBe('--primitive-color-blue-500');
  });

  it('handles two-segment paths', () => {
    expect(pathToCSSVar('semantic.bg')).toBe('--semantic-bg');
  });

  it('handles single-segment path', () => {
    expect(pathToCSSVar('brand')).toBe('--brand');
  });
});

// ── buildExpectedValues ───────────────────────────────────────────────────────

describe('buildExpectedValues', () => {
  it('extracts leaf tokens with resolved hex values', () => {
    const tokenTree = {
      primitive: {
        color: {
          $type: 'color',
          blue: {
            '500': { $value: '#1e2fff' },
          },
        },
      },
    };
    const result = buildExpectedValues(tokenTree);
    expect(result['--primitive-color-blue-500']).toBe('#1e2fff');
  });

  it('resolves alias references', () => {
    const tokenTree = {
      primitive: {
        color: {
          $type: 'color',
          blue: {
            '500': { $value: '#1e2fff' },
          },
        },
      },
      semantic: {
        color: {
          $type: 'color',
          accent: {
            $value: '{primitive.color.blue.500}',
          },
        },
      },
    };
    const result = buildExpectedValues(tokenTree);
    expect(result['--semantic-color-accent']).toBe('#1e2fff');
  });

  it('skips and warns on unresolvable aliases', () => {
    const tokenTree = {
      primitive: {
        color: {
          $type: 'color',
          blue: {
            '500': { $value: '#1e2fff' },
          },
        },
      },
      semantic: {
        color: {
          $type: 'color',
          broken: {
            $value: '{primitive.color.does.not.exist}',
          },
        },
      },
    };
    const result = buildExpectedValues(tokenTree);
    expect(result['--primitive-color-blue-500']).toBe('#1e2fff');
    expect(result['--semantic-color-broken']).toBeUndefined();
  });

  it('skips $-prefixed keys when walking the tree', () => {
    const tokenTree = {
      $schema: 'https://example.com',
      $description: 'top-level description',
      primitive: {
        color: {
          $type: 'color',
          $description: 'group description',
          white: { $value: '#ffffff' },
        },
      },
    };
    const result = buildExpectedValues(tokenTree);
    expect(Object.keys(result)).toEqual(['--primitive-color-white']);
  });

  it('returns an empty object for an empty token tree', () => {
    expect(buildExpectedValues({})).toEqual({});
  });
});

// ── parseHandoffHexes ─────────────────────────────────────────────────────────

describe('parseHandoffHexes', () => {
  it('extracts hex values wrapped in backticks', () => {
    const md = 'Brand blue is `#1e2fff` and white is `#ffffff`.';
    expect(parseHandoffHexes(md)).toEqual(['#1e2fff', '#ffffff']);
  });

  it('ignores hex not in backticks', () => {
    const md = 'The color #1e2fff is the brand accent.';
    expect(parseHandoffHexes(md)).toEqual([]);
  });

  it('ignores 3-digit hex values', () => {
    const md = 'Short hex `#fff` should be ignored, but `#ffffff` should not.';
    expect(parseHandoffHexes(md)).toEqual(['#ffffff']);
  });

  it('is case-insensitive in extraction', () => {
    const md = 'Uppercase `#1E2FFF` and lowercase `#1e2fff`.';
    expect(parseHandoffHexes(md)).toEqual(['#1E2FFF', '#1e2fff']);
  });

  it('returns empty array for markdown with no hex codes', () => {
    expect(parseHandoffHexes('No hex codes here.')).toEqual([]);
  });
});

// ── diffHandoffHexes ──────────────────────────────────────────────────────────

describe('diffHandoffHexes', () => {
  it('returns empty array when all handoff hexes are in expectedValues', () => {
    const handoffHexes = ['#1e2fff', '#ffffff'];
    const expectedValues = {
      '--primitive-color-blue-500': '#1e2fff',
      '--primitive-color-neutral-white': '#ffffff',
    };
    expect(diffHandoffHexes(handoffHexes, expectedValues)).toEqual([]);
  });

  it('returns drift entries for hexes not in any token value', () => {
    const handoffHexes = ['#deadbe'];
    const expectedValues = {
      '--primitive-color-blue-500': '#1e2fff',
    };
    const result = diffHandoffHexes(handoffHexes, expectedValues);
    expect(result).toHaveLength(1);
    expect(result[0].handoffValue).toBe('#deadbe');
    expect(result[0].tokenValue).toBeNull();
    expect(result[0].file).toBe('DESIGN-HANDOFF.md');
  });

  it('compares case-insensitively', () => {
    const handoffHexes = ['#1E2FFF'];
    const expectedValues = {
      '--primitive-color-blue-500': '#1e2fff',
    };
    expect(diffHandoffHexes(handoffHexes, expectedValues)).toEqual([]);
  });

  it('returns empty array when expectedValues is empty and handoffHexes is empty', () => {
    expect(diffHandoffHexes([], {})).toEqual([]);
  });
});

// ── parseCSSVarDefinitions ────────────────────────────────────────────────────

describe('parseCSSVarDefinitions', () => {
  it('returns a Set of var names defined in the CSS', () => {
    const css = ':root {\n  --hds-font-sans: Atkinson Hyperlegible Next;\n  --hds-space-4: 16px;\n}';
    const defs = parseCSSVarDefinitions(css);
    expect(defs.has('--hds-font-sans')).toBe(true);
    expect(defs.has('--hds-space-4')).toBe(true);
    expect(defs.size).toBe(2);
  });

  it('collects vars from multiple selectors', () => {
    const css = ':root {\n  --a: 1;\n}\n[data-theme="dark"] {\n  --b: 2;\n}';
    const defs = parseCSSVarDefinitions(css);
    expect(defs.has('--a')).toBe(true);
    expect(defs.has('--b')).toBe(true);
  });

  it('does not include non-var declarations', () => {
    const css = ':root {\n  color: red;\n  --ok: blue;\n}';
    const defs = parseCSSVarDefinitions(css);
    expect(defs.size).toBe(1);
    expect(defs.has('--ok')).toBe(true);
  });

  it('returns empty Set for empty CSS', () => {
    expect(parseCSSVarDefinitions('').size).toBe(0);
  });
});

// ── findDeadTokens ────────────────────────────────────────────────────────────

describe('findDeadTokens', () => {
  it('flags CSS var refs that are not in expectedValues', () => {
    const sourceRefs = new Set(['--stale-token', '--valid-token']);
    const expectedValues = { '--valid-token': '#ffffff' };
    const dead = findDeadTokens(sourceRefs, expectedValues);
    expect(dead).toContain('--stale-token');
    expect(dead).not.toContain('--valid-token');
  });

  it('skips JS-style refs (hds.*) — v1 only checks CSS vars', () => {
    const sourceRefs = new Set(['hds.typeStyles.heading1', '--some-var']);
    const expectedValues = { '--some-var': '#000' };
    const dead = findDeadTokens(sourceRefs, expectedValues);
    expect(dead).not.toContain('hds.typeStyles.heading1');
  });

  it('returns empty array when all CSS var refs are in expectedValues', () => {
    const sourceRefs = new Set(['--token-a', '--token-b']);
    const expectedValues = { '--token-a': 'val', '--token-b': 'val' };
    expect(findDeadTokens(sourceRefs, expectedValues)).toEqual([]);
  });

  it('returns empty array when sourceRefs is empty', () => {
    expect(findDeadTokens(new Set(), { '--some': 'val' })).toEqual([]);
  });

  it('excludes vars present in knownVars allowlist', () => {
    const sourceRefs = new Set(['--hds-font-sans', '--stale-token']);
    const expectedValues = {};
    const knownVars = new Set(['--hds-font-sans']);
    const dead = findDeadTokens(sourceRefs, expectedValues, knownVars);
    expect(dead).not.toContain('--hds-font-sans');
    expect(dead).toContain('--stale-token');
  });

  it('defaults to empty knownVars when third arg is omitted', () => {
    const sourceRefs = new Set(['--hds-font-sans']);
    const expectedValues = {};
    // Without knownVars, --hds-font-sans is dead
    expect(findDeadTokens(sourceRefs, expectedValues)).toContain('--hds-font-sans');
  });
});

// ── findAuditOkComments ───────────────────────────────────────────────────────

describe('findAuditOkComments', () => {
  it('extracts file, line, and reason from audit-ok comments', () => {
    const content = `
const x = 1;
// audit-ok: hardcoded because WebGL shader constants
const y = 2;
`;
    const result = findAuditOkComments('src/app/components/Foo.tsx', content);
    expect(result).toHaveLength(1);
    expect(result[0].file).toBe('src/app/components/Foo.tsx');
    expect(result[0].line).toBe(3);
    expect(result[0].reason).toBe('hardcoded because WebGL shader constants');
  });

  it('extracts multiple audit-ok comments', () => {
    const content = `// audit-ok: first reason\nconst a = 1;\n// audit-ok: second reason\n`;
    const result = findAuditOkComments('src/file.ts', content);
    expect(result).toHaveLength(2);
    expect(result[0].line).toBe(1);
    expect(result[1].line).toBe(3);
  });

  it('returns empty array when no audit-ok comments exist', () => {
    const content = 'const x = 1;\nconst y = 2;\n';
    expect(findAuditOkComments('src/file.ts', content)).toEqual([]);
  });

  it('trims whitespace from the reason', () => {
    const content = '// audit-ok:   reason with leading space  \n';
    const result = findAuditOkComments('src/file.ts', content);
    expect(result[0].reason).toBe('reason with leading space');
  });
});
