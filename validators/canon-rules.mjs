/** @internal — not part of @hirobius/design-system public API surface. */
/**
 * validators/canon-rules.mjs
 *
 * Shared Swiss-canon rule definitions used by both the LLM-output validator
 * (validators/swiss-canon.mjs, runs against generated JSX) and the source-side
 * scan (scripts/check-source-canon.mjs, runs against authored .tsx files).
 *
 * Two source-of-truth surfaces — one LLM-output, one hand-authored — share
 * one rule list so that a Swiss antipattern caught on one side is caught on
 * the other. If the prefix rename (HDS → Hydra) lands, only STRUCTURAL_
 * COMPONENTS and TEXT_BEARING_COMPONENTS need updating.
 */

export const ON_GRID_SPACING = new Set([
  0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128, 160, 192, 256,
]);

export const ON_GRID_TAILWIND = new Set([
  0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64,
]);

export const STRUCTURAL_COMPONENTS = new Set([
  'HdsCard', 'HdsInput', 'HdsFrame', 'HdsContainer', 'HdsField',
  'HdsTextInput', 'HdsTextarea', 'HdsSelect',
]);

export const TEXT_BEARING_COMPONENTS = new Set([
  'HdsText', 'HdsHeading', 'HdsButton', 'HdsBadge', 'HdsLabel',
]);

export const TOKEN_PATH_PREFIXES = ['semantic.', 'tokens.', 'theme.'];

export function isTokenPath(value) {
  if (typeof value !== 'string') return false;
  return TOKEN_PATH_PREFIXES.some((p) => value.startsWith(p));
}

// ── Regex rules (shared between JSX validator and source scan) ──
export const BG_BLACK_WHITE_VALUE_RE = /^(bg-white|bg-black|#fff|#fff(?:fff)?|#000|#000(?:000)?)$/i;
export const PURPLE_RE = /\b(purple|indigo|violet|fuchsia)\b/i;
export const GRADIENT_VALUE_RE = /(?:bg-)?(linear|radial|conic)-gradient\(|bg-gradient-/i;
export const LOREM_RE = /\b(lorem ipsum|dolor sit amet|consectetur adipiscing|sed do eiusmod)\b/i;
export const TRIPLE_DOT_RE = /(?<!\.)\.{3}(?!\.)/;
export const BOLD_VALUE_RE = /^(bold|bolder|7\d\d|[89]\d\d)$/i;
export const STRAIGHT_DOUBLE_QUOTE_RE = /"/;
export const STRAIGHT_SINGLE_QUOTE_RE = /(?:^|[^A-Za-z])'(?=[A-Za-z])|(?<=[A-Za-z])'(?:$|[^A-Za-z])/;

// ── Source-only regex rules (run against raw .tsx text, not JSX AST) ──
// className utility-class patterns. Matches the substring inside any
// className="..." or className={`...`} attribute.
export const FONT_BOLD_CLASS_RE = /\bfont-(bold|extrabold|black)\b/;
export const BG_BLACK_WHITE_CLASS_RE = /\bbg-(white|black)\b/;
export const OVERSIZED_RADIUS_CLASS_RE = /\brounded-(2xl|3xl|full)\b/;
export const PURPLE_CLASS_RE = /\b(?:text|bg|border|from|to|via|ring)-(purple|indigo|violet|fuchsia)-\d+/;
export const GRADIENT_CLASS_RE = /\bbg-gradient-to-(?:t|tr|r|br|b|bl|l|tl)\b/;

// fontWeight: 'bold' | 700 | etc — covers JSX-style and inline-style usage.
export const FONT_WEIGHT_BOLD_RE = /fontWeight\s*:\s*['"]?(bold|bolder|7\d\d|[89]\d\d)\b/;
export const RAW_HEX_BLACK_WHITE_RE = /#(fff|FFF|ffffff|FFFFFF|000|000000)\b/;

// [data-tenant=...] selector outside src/styles/tokens.css. Multi-tenant root
// selectors are permitted only in the token system; component-level CSS must
// use the token system, not tenant selectors.
export const DATA_TENANT_SELECTOR_RE = /\[data-tenant=/;

// 12d-card-anatomy: inline thin colored bar pattern (the "progress line
// crowding text" issue). Matches `height: '1-8px'` with a co-located
// `background: 'var(--*)'`. The use cases are: progress bars, dividers,
// status accents — all of which have proper primitives (HdsCard.Progress,
// section structure via separate HdsCard.Body blocks). Inline-styled bars
// in pages are the surface that crowds adjacent prose.
//
// The regex tolerates whitespace and the props in either order. Multiline
// inline styles are supported via the [\s\S] character class.
export const INLINE_THIN_BAR_RE = /style\s*=\s*\{\{[^}]*?(?:height\s*:\s*['"]?[1-8]px['"]?[^}]*?background\s*:\s*['"]?var\(--|background\s*:\s*['"]?var\(--[^}]*?height\s*:\s*['"]?[1-8]px)/;

// 12d-outline-rule (Adrian directive 2026-05-03): outlines are reserved for
// interactive containers (buttons, inputs, ghost slots, etc.) — display
// surfaces should not have structural borders. Matches inline border
// declarations using neutral border tokens (default/subdued/subtle/strong)
// in non-primitive files. Feedback tones (success/warning/error) and accent
// borders are signal-bearing and allowed.
//
// Annotate intentional exceptions with `// outline-ok: <reason>` (e.g.
// dashed call-to-action ghost slots, focus rings on interactive elements).
//
// Tracked-via-baseline initially: existing violations are frozen in
// .source-canon-baseline.txt; new violations fail the gate.
export const INLINE_STRUCTURAL_BORDER_RE = /border(?:Top|Right|Bottom|Left)?\s*:\s*['"](?:1px|2px)\s+(?:solid|dashed|dotted)\s+var\(--semantic-color-border-(?:default|subdued|subtle|strong)\)['"]/;

/**
 * Tailwind padding/margin/gap utility outside the on-grid set.
 *
 * Matches `p-13`, `gap-7`, `mt-9` etc. where the trailing number is not in
 * ON_GRID_TAILWIND. Captures the numeric value so the caller can sanity-check
 * before reporting (e.g. `text-xl` should not match).
 */
export const TAILWIND_SPACING_PROPS = ['p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'gap', 'gap-x', 'gap-y',
  'space-x', 'space-y'];

export function tailwindSpacingViolation(className) {
  if (typeof className !== 'string') return null;
  for (const prop of TAILWIND_SPACING_PROPS) {
    const re = new RegExp(`\\b${prop}-(\\d+(?:\\.\\d+)?)\\b`, 'g');
    let match;
    while ((match = re.exec(className)) !== null) {
      const value = Number(match[1]);
      if (!ON_GRID_TAILWIND.has(value)) {
        return { utility: `${prop}-${match[1]}`, value };
      }
    }
  }
  return null;
}
