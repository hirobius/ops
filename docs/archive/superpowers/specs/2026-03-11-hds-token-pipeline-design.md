# HDS Token Pipeline — Design Spec
**Date:** 2026-03-11
**Status:** Approved

---

## Overview

Replace the existing ad-hoc HDS token system (`tokens.ts`, `theme.css`, `ct()`) with a fully W3C DTCG 2025.10-compliant token pipeline. The new system introduces a three-tier architecture (primitive → semantic → component), a build script that compiles tokens to CSS custom properties and TypeScript constants, and a clean dark mode strategy using `data-theme`. All Radix/shadcn UI components are removed in favour of a 100% original component set.

---

## Token File: `hirobius.tokens.json`

Single source of truth at the repo root. Fully W3C DTCG 2025.10 compliant.

### Naming convention

| Tier | Key | CSS prefix | JS path |
|---|---|---|---|
| Primitive | `primitive` | `--hds-primitive-*` | `hds.primitive.*` |
| Semantic | `semantic` | `--hds-semantic-*` | `hds.semantic.*` |
| Component | `component` | `--hds-component-*` | `hds.component.*` |

### Primitive tier

**`primitive.color.neutral`** — 13-step pure monochromatic scale:
`white`, `50`–`950`, `black`. Used as raw values only; never applied to UI directly.

**`primitive.color.blue`** — 10-step brand blue scale anchored at `#1E2FFF` (blue.500).

**`primitive.color.feedback`** — minimal 2-step (400 + 600) scales for green, amber, red, blue.
Used only as references by semantic feedback tokens.

**`primitive.space`** — 4px base-unit scale: `0`, `px`, `0-5` through `24`.

**`primitive.radius`** — `none`, `xs`(2px), `sm`(4px), `md`(8px), `lg`(12px), `xl`(16px), `2xl`(24px), `full`(9999px).

**`primitive.border-width`** — `hairline`(0.5px, renders as 1px on non-retina), `default`(1px), `thick`(2px), `heavy`(4px).
Note: `hairline` is the thinnest physical line on high-density displays; `default` is the standard 1px border used for most UI elements.

**`primitive.icon-size`** — `sm`(12px), `base`(14px), `md`(16px), `lg`(20px), `xl`(24px).

**`primitive.z`** — 9-step z-index: `base`(0), `raised`(10), `dropdown`(100), `sticky`(200), `overlay`(300), `modal`(400), `popover`(500), `toast`(600), `tooltip`(700).

**`primitive.font.family.primary`** — `['Atkinson Hyperlegible Next', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif']`

**`primitive.font.size`** — 11px–60px scale covering all 14 typescale steps.

**`primitive.font.weight`** — `regular`(400), `medium`(500), `semibold`(600), `bold`(700), `extrabold`(800).

**`primitive.font.line-height`** — `none`(1), `tight`(1.25), `snug`(1.375), `normal`(1.5), `relaxed`(1.625), plus absolute values for typescale (16px–64px).

**`primitive.font.letter-spacing`** — `tighter`(-0.25px), `tight`(-0.4px), `normal`(0), `wide`(0.1px), `wider`(0.25px), `widest`(0.5px).

**`primitive.duration`** — `instant`(0ms), `fast`(150ms), `normal`(300ms), `slow`(500ms), `elaborate`(600ms), `slower`(700ms), `spin`(800ms).

**`primitive.easing`** — `default`, `ease-in`, `ease-out`, `ease-in-out`, `expressive`(`cubic-bezier(0.34, 1.56, 0.64, 1)`).

### Semantic tier

**`semantic.color.bg`** — `primary`, `secondary`, `tertiary`, `inverse`, `brand`, `brand-subtle`.
Each carries `$extensions.com.hirobius.modes` with `light` and `dark` values.
Dark mode uses pure neutral scale (black / 900 / 800), not purple-tinted values.

**`semantic.color.text`** — `primary`, `secondary`, `tertiary`, `inverse`, `brand`, `on-brand`.

**`semantic.color.border`** — `default`, `strong`, `brand`.

**`semantic.color.icon`** — `primary`, `secondary`, `brand`.

**`semantic.color.feedback`** — `success`, `warning`, `error`, `info`. Each has light/dark variants
via `$extensions.com.hirobius.modes`, referencing primitive feedback color steps.

**`semantic.shadow`** — `sm`, `md`, `lg`, `card`. Light and dark values differ in alpha.

**`semantic.typography`** — 14-style MD3-structured typescale, all on 4px grid, Atkinson Hyperlegible Next throughout:

| Style | Size | Weight | Tracking | Line height |
|---|---|---|---|---|
| Display Large | 60px | 400 | -0.25px | 64px |
| Display Medium | 48px | 400 | 0 | 56px |
| Display Small | 36px | 400 | 0 | 44px |
| Headline Large | 32px | 400 | 0 | 40px |
| Headline Medium | 28px | 400 | 0 | 36px |
| Headline Small | 24px | 400 | 0 | 32px |
| Title Large | 22px | 500 | 0 | 28px |
| Title Medium | 16px | 500 | 0.15px | 24px |
| Title Small | 14px | 500 | 0.1px | 20px |
| Body Large | 16px | 400 | 0.5px | 24px |
| Body Medium | 14px | 400 | 0.25px | 20px |
| Label Large | 14px | 500 | 0.1px | 20px |
| Label Medium | 12px | 500 | 0.5px | 16px |
| Label Small | 11px | 500 | 0.5px | 16px |

**`semantic.transition`** — `color`(300ms), `fast`(150ms), `slow`(500ms).

**`semantic.animation`** — `appear`, `enter`, `entrance`, `skeleton`, `spin` presets.

**`semantic.layout`** — responsive clamp values: `page-gutter-h`, `mobile-gutter-h`, `section-pad`,
`section-pad-sm`, `strip-pad-top`, `toolbar-pad-v`, `mobile-page-bot`, `mobile-sect-top`,
`panel-gap`, `panel-gap-mob`, `subview-pad-h`, `lb-strip-pad-top`.

### Component tier

**`component.nav`** — bg, text, text-active, height, padding-x.

**`component.card`** — bg, border, radius, padding, gap.

**`component.button`** — bg, bg-hover, text, radius, padding-x, padding-y, font-size, font-weight.

**`component.tag`** — bg, text, border, radius, padding-x, padding-y, font-size.

**`component.container`** — max-width(1200px), padding-x.

**`component.grid`** — gap, columns-desktop(3), columns-tablet(2), columns-mobile(1).

---

## Build Pipeline

### `scripts/build-tokens.ts`

Node/TypeScript script (run via `tsx`). Steps:

1. Read `hirobius.tokens.json`
2. Recursively resolve `{path.to.token}` references — handle chained refs, error on circular
3. Convert resolved values to CSS strings using the type resolution rules below
3a. For tokens with `$extensions.com.hirobius.modes`: emit the `light` resolved value under
    `:root` and the `dark` resolved value under `[data-theme="dark"]`. For tokens without this
    extension, emit once under `:root`.
4. Emit `src/styles/tokens.css`
5. Emit `src/tokens.ts`

#### Type resolution rules

| DTCG `$type` | Raw `$value` shape | CSS output |
|---|---|---|
| `color` | `{ colorSpace, components: [r,g,b], alpha? }` | `rgb(R G B)` or `rgb(R G B / A)` — multiply components by 255, round |
| `dimension` | `{ value, unit }` | `"${value}${unit}"` e.g. `"4px"`, `"1rem"` |
| `fontFamily` | `string[]` | Comma-separated, multi-word names quoted: `"Atkinson Hyperlegible Next", sans-serif` |
| `fontWeight` | `number` | Numeric string: `"500"` |
| `number` | `number` | Numeric string: `"3"` |
| `duration` | `{ value, unit }` | `"${value}${unit}"` e.g. `"300ms"` |
| `cubicBezier` | `[x1, y1, x2, y2]` | `cubic-bezier(x1, y1, x2, y2)` |
| `shadow` | object or array of objects | `offsetX offsetY blur spread color` per layer, joined with `, ` |
| `typography` | composite object | Expand to individual CSS properties — never shorthand |
| `transition` | `{ duration, delay, timingFunction }` | `"duration delay timingFunction"` |

**Compound key naming:** Token key paths are camelCase in TypeScript but kebab-case in CSS.
The build script applies a camelCase-to-kebab transform at every path segment:
`displayLarge` → `display-large`, `bgPrimary` → `bg-primary`.
This rule applies uniformly to all tiers.

**CSS output structure (`src/styles/tokens.css`):**

```css
/* ── Primitives ─────────────────────────── */
:root {
  --hds-primitive-color-neutral-white: rgb(255 255 255);
  /* ... all primitives as raw resolved values ... */
}

/* ── Semantics: light mode defaults ──────── */
:root {
  --hds-semantic-color-bg-primary: var(--hds-primitive-color-neutral-white);
  /* ... semantic tokens as var() references to primitives ... */
}

/* ── Component tokens ────────────────────── */
:root {
  --hds-component-button-bg: var(--hds-semantic-color-bg-brand);
  /* ... component tokens as var() references to semantics ... */
}

/* ── Dark mode overrides ─────────────────── */
[data-theme="dark"] {
  --hds-semantic-color-bg-primary: var(--hds-primitive-color-neutral-black);
  /* ... only semantic tokens that change ... */
}

/* ── Tailwind v4 bridge ──────────────────── */
/* Matches [data-theme="dark"] itself AND all descendants */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));

@theme inline {
  --color-bg-primary:    var(--hds-semantic-color-bg-primary);
  --color-text-primary:  var(--hds-semantic-color-content-primary);
  --color-brand:         var(--hds-semantic-color-bg-brand);
  /* ... full semantic + primitive bridge ... */
  --font-sans: var(--hds-primitive-font-family-primary);
  /* ... radius, spacing, shadow, duration mappings ... */
}

/* ── Base layer ──────────────────────────── */
@layer base {
  html { font-family: var(--hds-primitive-font-family-primary); }
  body { background: var(--hds-semantic-color-bg-primary); color: var(--hds-semantic-color-content-primary); }
  /* h1, h2, h3, h4 each mapped to Display/Headline typescale vars — individual selectors required */
}

/* ── Utilities ───────────────────────────── */
@keyframes hds-skeleton-shimmer { ... }
.hds-skeleton { ... }
.hds-focus:focus-visible { ... }
```

**Key rule:** Semantic and component tokens always emit `var()` references in CSS — never inlined resolved values. This preserves the reference chain so dark mode overrides cascade automatically.

**TypeScript output structure (`src/tokens.ts`):**

```ts
export const hds = {
  primitive: {
    color: {
      neutral: { white: 'var(--hds-primitive-color-neutral-white)', ... },
      blue: { 500: 'var(--hds-primitive-color-blue-500)', ... },
    },
    space: { 4: 'var(--hds-primitive-space-4)', ... },
  },
  semantic: {
    color: {
      bg: { primary: 'var(--hds-semantic-color-bg-primary)', ... },
      text: { primary: 'var(--hds-semantic-color-content-primary)', ... },
      feedback: { success: 'var(--hds-semantic-color-feedback-success)', ... },
    },
    typography: {
      displayLarge: {
        fontFamily: 'var(--hds-primitive-font-family-primary)',
        fontSize: 'var(--hds-semantic-typography-display-large-font-size)',
        fontWeight: 'var(--hds-semantic-typography-display-large-font-weight)',
        letterSpacing: 'var(--hds-semantic-typography-display-large-letter-spacing)',
        lineHeight: 'var(--hds-semantic-typography-display-large-line-height)',
      },
    },
  },
  component: {
    button: { bg: 'var(--hds-component-button-bg)', ... },
  },
} as const;
```

### `package.json` scripts

```json
{
  "tokens": "tsx scripts/build-tokens.ts",
  "dev": "pnpm tokens && vite",
  "build": "pnpm tokens && tsc && vite build"
}
```

---

## Theme System

### `src/app/context/ThemeContext.tsx` (updated)

- Sets `data-theme` attribute on `<html>` only — `.dark` class removed
- `localStorage` key: `theme` (was `hds-theme`). On first load, fall back to reading `hds-theme`
  if `theme` is absent, then write the new key — preserves preference for returning visitors
- Reads `prefers-color-scheme` on first visit if neither key is present
- Exports `useTheme()` → `{ isDark, toggleDark }`

### Dark mode strategy

Theming is pure CSS — no React re-renders on theme switch. The cascade:
```
[data-theme="dark"] overrides --hds-semantic-* vars
  → component vars (--hds-component-*) reference semantics via var()
  → Tailwind utilities reference semantics via @theme inline
  → everything updates automatically
```

---

## Migration

### Deletions

| Path | Reason |
|---|---|
| `src/app/design-system/tokens.ts` | Replaced by generated `src/tokens.ts` (note: output path intentionally moves to `src/` root, not back into `design-system/`) |
| `src/app/design-system/theme.ts` | `ct()` made obsolete by CSS var theming |
| `src/app/components/ui/` (50+ files) | Full shadcn/Radix removal — clean slate |
| `src/styles/theme.css` | Replaced by generated `src/styles/tokens.css` |

### Updates

| File | Change |
|---|---|
| `src/styles/index.css` | Import `tokens.css` instead of `theme.css` |
| `src/app/context/ThemeContext.tsx` | Simplify — `data-theme` only |
| All components using `hds.*` | Migrate to `hds.*` from new `src/tokens.ts` |
| All components using `ct(isDark).*` | Replace with `var(--hds-semantic-color-*)` directly |
| `package.json` | Add `tokens` script, prepend to `dev` + `build` |

### Component migration pattern

```tsx
// Before
const colors = ct(isDark);
<div style={{ background: colors.bg, color: colors.text }}>

// After — no JS needed, CSS handles it
<div className="bg-bg-primary text-text-primary">
```

---

## New file: `DEVELOPMENT.md`

Documents: prerequisites, local setup steps, token pipeline usage, theme system overview,
component conventions, and how to add new tokens.

---

## File structure after implementation

```
project-root/
├── hirobius.tokens.json          ← Token source of truth (W3C DTCG 2025.10)
├── scripts/
│   └── build-tokens.ts           ← Token compiler
├── src/
│   ├── tokens.ts                 ← Generated — hds.* TS constants
│   ├── styles/
│   │   ├── index.css             ← Imports tokens.css (replaces theme.css import)
│   │   ├── tokens.css            ← Generated — CSS custom properties
│   │   ├── fonts.css             ← Unchanged
│   │   └── tailwind.css          ← Unchanged
│   └── app/
│       ├── context/
│       │   └── ThemeContext.tsx  ← Simplified
│       ├── design-system/        ← tokens.ts + theme.ts deleted
│       └── components/
│           └── ui/               ← Deleted entirely
├── docs/
│   └── superpowers/specs/
│       └── 2026-03-11-hds-token-pipeline-design.md
└── DEVELOPMENT.md
```
