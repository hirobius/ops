# HDS Token Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing ad-hoc HDS token system with a W3C DTCG 2025.10-compliant three-tier pipeline that compiles `hirobius.tokens.json` → `tokens.css` + `tokens.ts`, removes all shadcn/Radix components, and migrates every `hds.*`/`ct()` reference to the new system.

**Architecture:** `hirobius.tokens.json` is the single source of truth. `scripts/build-tokens.ts` compiles it to `src/styles/tokens.css` (CSS custom properties + Tailwind v4 `@theme inline` bridge) and `src/tokens.ts` (typed `hds.*` constants). Dark mode is pure CSS via `[data-theme="dark"]` — no JS re-renders. All Radix/shadcn components are deleted; only the custom component set remains.

**Tech Stack:** Vite + React 18 + TypeScript + Tailwind CSS v4 (`@tailwindcss/vite`) + Motion (Framer) + pnpm + tsx (script runner)

**Spec:** `docs/superpowers/specs/2026-03-11-hds-token-pipeline-design.md`

---

## Migration reference tables

### Space mapping (old → new)
| Old | New JS | CSS var | px |
|---|---|---|---|
| `hds.space.px1` | `hds.primitive.space.px` | `--hds-primitive-space-px` | 1 |
| `hds.space.px2` | `hds.primitive.space['0-5']` | `--hds-primitive-space-0-5` | 2 |
| `hds.space.px4` | `hds.primitive.space[1]` | `--hds-primitive-space-1` | 4 |
| `hds.space.px6` | `hds.primitive.space['1-5']` | `--hds-primitive-space-1-5` | 6 |
| `hds.space.px8` | `hds.primitive.space[2]` | `--hds-primitive-space-2` | 8 |
| `hds.space.px10` | `hds.primitive.space['2-5']` | `--hds-primitive-space-2-5` | 10 |
| `hds.space.px12` | `hds.primitive.space[3]` | `--hds-primitive-space-3` | 12 |
| `hds.space.px16` | `hds.primitive.space[4]` | `--hds-primitive-space-4` | 16 |
| `hds.space.px20` | `hds.primitive.space[5]` | `--hds-primitive-space-5` | 20 |
| `hds.space.px24` | `hds.primitive.space[6]` | `--hds-primitive-space-6` | 24 |
| `hds.space.px32` | `hds.primitive.space[8]` | `--hds-primitive-space-8` | 32 |
| `hds.space.px40` | `hds.primitive.space[10]` | `--hds-primitive-space-10` | 40 |
| `hds.space.px48` | `hds.primitive.space[12]` | `--hds-primitive-space-12` | 48 |

> **Note:** Space tokens in `src/tokens.ts` are CSS var strings (e.g. `'var(--hds-primitive-space-4)'`). These work directly in React `style` props.

### Color mapping (old → new)
| Old | New (CSS var or JS path) |
|---|---|
| `hds.color.brand` | `hds.primitive.color.blue[500]` |
| `hds.color.brandPressed` | `hds.primitive.color.blue[600]` |
| `hds.color.white` | `hds.primitive.color.neutral.white` |
| `hds.color.surface.page[th]` | `var(--hds-semantic-color-bg-primary)` |
| `hds.color.surface.raised[th]` | `var(--hds-semantic-color-bg-secondary)` |
| `hds.color.surface.overlay[th]` | `var(--hds-semantic-color-bg-tertiary)` |
| `hds.color.surface.raised[th]` | `var(--semantic-color-surface-raised)` |
| `hds.accent.hover` | `var(--semantic-accent-hover)` |
| `hds.color.surface.thumbnail[th]` | `hds.primitive.color.neutral[400]` (light) / `neutral[600]` (dark) |
| `ct(isDark).bg` | `var(--hds-semantic-color-bg-primary)` |
| `ct(isDark).text` | `var(--hds-semantic-color-content-primary)` |
| `ct(isDark).dim` | `var(--hds-semantic-color-content-secondary)` |
| `ct(isDark).subtle` | `var(--hds-semantic-color-content-tertiary)` |
| `ct(isDark).fill` | `var(--hds-semantic-color-bg-tertiary)` |
| `ct(isDark).border` | `var(--hds-semantic-color-border-default)` |
| `ct(isDark).rule` | `var(--hds-semantic-color-border-default)` |
| `ct(isDark).accent` | `var(--hds-primitive-color-blue-500)` |
| `ct(isDark).success` | `var(--hds-semantic-color-feedback-success)` |
| `ct(isDark).warning` | `var(--hds-semantic-color-feedback-warning)` |
| `ct(isDark).danger` | `var(--hds-semantic-color-feedback-error)` |

> **Note:** When a color is used in a React `style` prop or Framer Motion `animate` prop, CSS var strings work directly in modern browsers. Use `var(--hds-semantic-color-*)` strings rather than the JS path for colors that are theme-dependent.

### Typography mapping (old → new)
| Old `hds.typeStyles.*` | New `hds.semantic.typography.*` |
|---|---|
| `display` | `displayLarge` |
| `displaySm` | `displaySmall` |
| `body` | `bodyLarge` |
| `caption` | `labelSmall` |
| `label` | `labelMedium` |
| `sectionLabel` | `labelMedium` (+ `textTransform: 'uppercase'` inline) |
| `navLabel` | `labelSmall` (+ `textTransform: 'uppercase'` inline) |
| `projectTitle` | `titleMedium` |
| `prose` | `bodyLarge` |
| `metricValue` | `displaySmall` |

> **Note:** `hds.semantic.typography.*` values are objects with CSS var strings for all 5 properties. They spread directly into `style` props: `style={{ ...hds.semantic.typography.labelSmall }}`. The `textTransform: 'uppercase'` on old `sectionLabel`/`navLabel` must be added inline when spreading — it is not part of the typescale.

### Duration + easing (old → new)
| Old | New (for CSS) | New (for Motion) |
|---|---|---|
| `hds.duration.fast` (0.12s) | `hds.primitive.duration.fast` = CSS var | `hds.motion.duration.fast` = 0.15 |
| `hds.duration.standard` (0.2s) | `hds.primitive.duration.normal` | `hds.motion.duration.normal` = 0.3 |
| `hds.duration.moderate` (0.3s) | `hds.primitive.duration.slow` | `hds.motion.duration.slow` = 0.5 |
| `hds.duration.elaborate` (0.5s) | `hds.primitive.duration.elaborate` | `hds.motion.duration.elaborate` = 0.6 |
| `hds.duration.spin` (3s) | `hds.primitive.duration.spin` | `hds.motion.duration.spin` = 0.8 |
| `hds.easing.expressive` (array) | `hds.primitive.easing.expressive` = CSS string | `hds.motion.easing.expressive` = [0.34,1.56,0.64,1] |
| `hds.easing.standard` (array) | `hds.primitive.easing['ease-in-out']` | `hds.motion.easing.standard` = [0.4,0,0.2,1] |

> **The `hds.motion` namespace** exists only in `src/tokens.ts` — it holds raw numbers/arrays specifically for Framer Motion `transition` props.

### Layout mapping (old → new)
| Old | New |
|---|---|
| `hds.layout.pageGutterH` | `hds.semantic.layout['page-gutter-h']` |
| `hds.layout.mobileGutterH` | `hds.semantic.layout['mobile-gutter-h']` |
| `hds.layout.sectionPad` | `hds.semantic.layout['section-pad']` |
| `hds.layout.sectionPadSm` | `hds.semantic.layout['section-pad-sm']` |
| `hds.layout.stripPadTop` | `hds.semantic.layout['strip-pad-top']` |
| `hds.layout.toolbarPadV` | `hds.semantic.layout['toolbar-pad-v']` |
| `hds.layout.mobilePageBot` | `hds.semantic.layout['mobile-page-bot']` |
| `hds.layout.mobileSectTop` | `hds.semantic.layout['mobile-sect-top']` |
| `hds.layout.panelGap` | `hds.semantic.layout['panel-gap']` |
| `hds.layout.panelGapMob` | `hds.semantic.layout['panel-gap-mob']` |

### Icon sizes (old → new)
| Old | New | Raw px |
|---|---|---|
| `hds.iconSize.sm` | `hds.iconSize.sm` | 12 |
| `hds.iconSize.base` | `hds.iconSize.base` | 14 |
| `hds.iconSize.md` | `hds.iconSize.md` | 16 |
| `hds.iconSize.lg` | `hds.iconSize.lg` | 20 |
| `hds.iconSize.xl` | `hds.iconSize.xl` | 24 |

> **Note:** Icon sizes are raw pixel **numbers** in `src/tokens.ts` (not CSS var strings) because Lucide React's `size` prop takes a number. The `hds.iconSize.*` namespace is a top-level shortcut in the generated `tokens.ts` — it is NOT nested under `hds.primitive`. The path does not change from the old system.

---

## Chunk 1: Token source + build pipeline

### Task 1: Create `hirobius.tokens.json`

**Files:**
- Create: `hirobius.tokens.json`

- [ ] **Step 1: Create the token file**

Create `hirobius.tokens.json` at the repo root. Start from the full token file in `C:\Users\Adrian\Desktop\hirobius_W3C_tokens_breakdown_text_markdown_03112026_1.md` (the JSON block under "Complete token file: hirobius.tokens.json"), then apply these changes:

1. Change `primitive.font.family.primary.$value` from `["General Sans", ...]` to `["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]`

2. Add `primitive.space['2-5']` for 10px (needed for spacing migration). Include explicit `$type` in case the group-level type is not inherited:
```json
"2-5": { "$type": "dimension", "$value": { "value": 10, "unit": "px" } }
```

3. Add `primitive.color.feedback` **nested inside** `primitive.color` (not as a peer of it) — place it after `primitive.color.blue`:

```json
"feedback": {
  "$type": "color",
  "green": {
    "400": { "$value": { "colorSpace": "srgb", "components": [0.29, 0.87, 0.5],  "hex": "#4ade80" } },
    "600": { "$value": { "colorSpace": "srgb", "components": [0.09, 0.64, 0.29], "hex": "#16a34a" } }
  },
  "amber": {
    "400": { "$value": { "colorSpace": "srgb", "components": [0.98, 0.75, 0.14], "hex": "#fbbf24" } },
    "600": { "$value": { "colorSpace": "srgb", "components": [0.85, 0.47, 0.04], "hex": "#d97706" } }
  },
  "red": {
    "400": { "$value": { "colorSpace": "srgb", "components": [0.97, 0.44, 0.44], "hex": "#f87171" } },
    "600": { "$value": { "colorSpace": "srgb", "components": [0.86, 0.15, 0.15], "hex": "#dc2626" } }
  },
  "info": {
    "400": { "$value": { "colorSpace": "srgb", "components": [0.38, 0.65, 0.98], "hex": "#60a5fa" } },
    "600": { "$value": { "colorSpace": "srgb", "components": [0.15, 0.39, 0.92], "hex": "#2563eb" } }
  }
}
```

4. Add these token groups after `primitive.easing`:

```json
"border-width": {
  "$type": "dimension",
  "hairline": { "$value": { "value": 0.5, "unit": "px" }, "$description": "Thinnest physical line on high-density displays" },
  "default":   { "$value": { "value": 1,   "unit": "px" } },
  "thick":     { "$value": { "value": 2,   "unit": "px" } },
  "heavy":     { "$value": { "value": 4,   "unit": "px" } }
},

"icon-size": {
  "$type": "dimension",
  "sm":   { "$value": { "value": 12, "unit": "px" } },
  "base": { "$value": { "value": 14, "unit": "px" } },
  "md":   { "$value": { "value": 16, "unit": "px" } },
  "lg":   { "$value": { "value": 20, "unit": "px" } },
  "xl":   { "$value": { "value": 24, "unit": "px" } }
},

"z": {
  "$type": "number",
  "base":     { "$value": 0   },
  "raised":   { "$value": 10  },
  "dropdown": { "$value": 100 },
  "sticky":   { "$value": 200 },
  "overlay":  { "$value": 300 },
  "modal":    { "$value": 400 },
  "popover":  { "$value": 500 },
  "toast":    { "$value": 600 },
  "tooltip":  { "$value": 700 }
}
```

> Each of these groups is an additive insertion as a sibling of `primitive.easing` (i.e. inside `primitive` but not nested under `color`, `space`, etc.). Add them one at a time, verifying valid JSON after each.

5. Add `primitive.duration.elaborate` and `primitive.duration.spin` after `primitive.duration.slower`:
```json
"elaborate": { "$value": { "value": 600, "unit": "ms" } },
"spin":      { "$value": { "value": 800, "unit": "ms" } }
```

6. Add `primitive.easing.expressive` after `primitive.easing.ease-in-out`:
```json
"expressive": { "$value": [0.34, 1.56, 0.64, 1], "$description": "Spring/overshoot curve — used by BulgeCard and entrance animations" }
```

7. Update `semantic.typography` — replace the 8 styles in the desktop doc with the full 14-style MD3 typescale. Each style follows the same composite structure as in the spec:

```json
"display-large":   { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 60, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": -0.25, "unit": "px" }, "lineHeight": 64 } },
"display-medium":  { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 48, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0,     "unit": "px" }, "lineHeight": 56 } },
"display-small":   { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 36, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0,     "unit": "px" }, "lineHeight": 44 } },
"headline-large":  { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 32, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0,     "unit": "px" }, "lineHeight": 40 } },
"headline-medium": { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 28, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0,     "unit": "px" }, "lineHeight": 36 } },
"headline-small":  { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 24, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0,     "unit": "px" }, "lineHeight": 32 } },
"title-large":     { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 22, "unit": "px" }, "fontWeight": 500, "letterSpacing": { "value": 0,     "unit": "px" }, "lineHeight": 28 } },
"title-medium":    { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 16, "unit": "px" }, "fontWeight": 500, "letterSpacing": { "value": 0.15,  "unit": "px" }, "lineHeight": 24 } },
"title-small":     { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 14, "unit": "px" }, "fontWeight": 500, "letterSpacing": { "value": 0.1,   "unit": "px" }, "lineHeight": 20 } },
"body-large":      { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 16, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0.5,   "unit": "px" }, "lineHeight": 24 } },
"body-medium":     { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 14, "unit": "px" }, "fontWeight": 400, "letterSpacing": { "value": 0.25,  "unit": "px" }, "lineHeight": 20 } },
"label-large":     { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 14, "unit": "px" }, "fontWeight": 500, "letterSpacing": { "value": 0.1,   "unit": "px" }, "lineHeight": 20 } },
"label-medium":    { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 12, "unit": "px" }, "fontWeight": 500, "letterSpacing": { "value": 0.5,   "unit": "px" }, "lineHeight": 16 } },
"label-small":     { "$value": { "fontFamily": "{primitive.font.family.primary}", "fontSize": { "value": 11, "unit": "px" }, "fontWeight": 500, "letterSpacing": { "value": 0.5,   "unit": "px" }, "lineHeight": 16 } }
```

8. Add `semantic.color.feedback` (after `semantic.color.icon`).
```json
"feedback": {
  "success": {
    "$type": "color",
    "$value": "{primitive.color.feedback.green.600}",
    "$extensions": { "com.hirobius.modes": { "light": "{primitive.color.feedback.green.600}", "dark": "{primitive.color.feedback.green.400}" } }
  },
  "warning": {
    "$type": "color",
    "$value": "{primitive.color.feedback.amber.600}",
    "$extensions": { "com.hirobius.modes": { "light": "{primitive.color.feedback.amber.600}", "dark": "{primitive.color.feedback.amber.400}" } }
  },
  "error": {
    "$type": "color",
    "$value": "{primitive.color.feedback.red.600}",
    "$extensions": { "com.hirobius.modes": { "light": "{primitive.color.feedback.red.600}", "dark": "{primitive.color.feedback.red.400}" } }
  },
  "info": {
    "$type": "color",
    "$value": "{primitive.color.feedback.info.600}",
    "$extensions": { "com.hirobius.modes": { "light": "{primitive.color.feedback.info.600}", "dark": "{primitive.color.feedback.info.400}" } }
  }
}
```

9. Add `semantic.shadow.card` after `semantic.shadow.lg`:
```json
"card": {
  "$value": [
    { "color": { "colorSpace": "srgb", "components": [0,0,0], "alpha": 0.08 }, "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 1, "unit": "px" }, "blur": { "value": 3, "unit": "px" }, "spread": { "value": 0, "unit": "px" } },
    { "color": { "colorSpace": "srgb", "components": [0,0,0], "alpha": 0.04 }, "offsetX": { "value": 0, "unit": "px" }, "offsetY": { "value": 2, "unit": "px" }, "blur": { "value": 6, "unit": "px" }, "spread": { "value": 0, "unit": "px" } }
  ]
}
```

10. Add `semantic.layout` (after `semantic.transition`):
```json
"layout": {
  "page-gutter-h":    { "$type": "dimension", "$value": "clamp(1rem, 4vw, 4rem)" },
  "mobile-gutter-h":  { "$type": "dimension", "$value": "clamp(1rem, 4vw, 1.5rem)" },
  "section-pad":      { "$type": "dimension", "$value": "clamp(1rem, 2vh, 1.5rem)" },
  "section-pad-sm":   { "$type": "dimension", "$value": "clamp(0.75rem, 1.5vh, 1rem)" },
  "strip-pad-top":    { "$type": "dimension", "$value": "clamp(1rem, 3vh, 2.5rem)" },
  "toolbar-pad-v":    { "$type": "dimension", "$value": "clamp(1.25rem, 2.5vh, 2rem)" },
  "mobile-page-bot":  { "$type": "dimension", "$value": "clamp(2rem, 4vh, 3rem)" },
  "mobile-sect-top":  { "$type": "dimension", "$value": "clamp(1.5rem, 3vh, 2rem)" },
  "panel-gap":        { "$type": "dimension", "$value": "clamp(1.5rem, 2.5vw, 3rem)" },
  "panel-gap-mob":    { "$type": "dimension", "$value": "clamp(1.5rem, 4vw, 2.5rem)" },
  "subview-pad-h":    { "$type": "dimension", "$value": "clamp(2rem, 6vw, 8rem)" },
  "lb-strip-pad-top": { "$type": "dimension", "$value": "clamp(0.5rem, 1vh, 0.875rem)" }
}
```

11. Add `semantic.animation` (after `semantic.layout`):
```json
"animation": {
  "appear":   { "$type": "transition", "$value": { "duration": "{primitive.duration.fast}",      "delay": "{primitive.duration.instant}", "timingFunction": "{primitive.easing.expressive}" } },
  "enter":    { "$type": "transition", "$value": { "duration": "{primitive.duration.normal}",    "delay": "{primitive.duration.instant}", "timingFunction": "{primitive.easing.ease-in-out}" } },
  "entrance": { "$type": "transition", "$value": { "duration": "{primitive.duration.slow}",      "delay": "{primitive.duration.instant}", "timingFunction": "{primitive.easing.expressive}" } },
  "skeleton": { "$type": "transition", "$value": { "duration": "{primitive.duration.elaborate}", "delay": "{primitive.duration.instant}", "timingFunction": "ease-in-out" } },
  "spin":     { "$type": "transition", "$value": { "duration": "{primitive.duration.spin}",      "delay": "{primitive.duration.instant}", "timingFunction": "{primitive.easing.expressive}" } }
}
```

- [ ] **Step 2: Validate JSON**

```bash
cd /c/Users/Adrian/Desktop/adrian-milsap
node -e "JSON.parse(require('fs').readFileSync('hirobius.tokens.json','utf8')); console.log('valid')"
```
Expected: `valid`

- [ ] **Step 3: Commit**

```bash
git add hirobius.tokens.json
git commit -m "feat: add W3C DTCG 2025.10 token source file"
```

---

### Task 2: Create `scripts/build-tokens.ts`

**Files:**
- Create: `scripts/build-tokens.ts`

- [ ] **Step 1: Install tsx if not present**

```bash
cd /c/Users/Adrian/Desktop/adrian-milsap
cat package.json | grep tsx
```
If `tsx` is not listed as a devDependency, run:
```bash
pnpm add -D tsx
```

- [ ] **Step 2: Create the build script**

Create `scripts/build-tokens.ts`:

```typescript
/**
 * scripts/build-tokens.ts
 * W3C DTCG 2025.10 token compiler.
 * Reads hirobius.tokens.json → emits src/styles/tokens.css + src/tokens.ts
 *
 * Run: pnpm tokens  (calls tsx scripts/build-tokens.ts)
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TokenNode {
  $type?:       string;
  $value?:      unknown;
  $description?: string;
  $extensions?: { 'com.hirobius.modes'?: { light?: unknown; dark?: unknown } };
  [key: string]: unknown;
}

interface FlatToken {
  path:  string[];   // e.g. ['primitive','color','blue','500']
  type:  string;
  value: unknown;
  dark?: unknown;    // resolved dark-mode value (from $extensions.modes.dark)
}

// ── Token walker ──────────────────────────────────────────────────────────────

function walkTokens(
  node: TokenNode,
  path: string[],
  inheritedType: string,
  out: FlatToken[]
): void {
  const type = (node.$type as string) ?? inheritedType;

  if ('$value' in node) {
    const modes = node.$extensions?.['com.hirobius.modes'];
    out.push({
      path,
      type,
      value: modes?.light ?? node.$value,
      dark:  modes?.dark,
    });
    return;
  }

  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    walkTokens(child as TokenNode, [...path, key], type, out);
  }
}

// ── Reference resolver ────────────────────────────────────────────────────────

function getByPath(root: TokenNode, pathStr: string): unknown {
  const parts = pathStr.split('.');
  let node: unknown = root;
  for (const part of parts) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  if (node !== null && typeof node === 'object' && '$value' in (node as object)) {
    const modes = (node as TokenNode).$extensions?.['com.hirobius.modes'];
    return modes?.light ?? (node as TokenNode).$value;
  }
  return node;
}

const REF_RE = /^\{([^}]+)\}$/;

function resolveValue(val: unknown, root: TokenNode, seen = new Set<string>()): unknown {
  if (typeof val === 'string') {
    const m = REF_RE.exec(val);
    if (m) {
      if (seen.has(m[1])) throw new Error(`Circular reference: ${m[1]}`);
      seen.add(m[1]);
      return resolveValue(getByPath(root, m[1]), root, seen);
    }
    return val;
  }
  if (Array.isArray(val)) return val.map(v => resolveValue(v, root, new Set(seen)));
  if (val !== null && typeof val === 'object') {
    // Use a fresh Set copy per property so sibling references to the same token
    // don't trigger false circular-reference errors.
    return Object.fromEntries(
      Object.entries(val as object).map(([k, v]) => [k, resolveValue(v, root, new Set(seen))])
    );
  }
  return val;
}

// ── CSS value serialisers ─────────────────────────────────────────────────────

function colorToCss(v: unknown): string {
  if (typeof v === 'string') return v;
  const c = v as { colorSpace: string; components: number[]; alpha?: number; hex?: string };
  const [r, g, b] = c.components.map(x => Math.round(x * 255));
  return c.alpha !== undefined && c.alpha < 1
    ? `rgb(${r} ${g} ${b} / ${c.alpha})`
    : `rgb(${r} ${g} ${b})`;
}

function dimensionToCss(v: unknown): string {
  if (typeof v === 'string') return v; // clamp() and other raw strings pass through
  const d = v as { value: number; unit: string };
  return `${d.value}${d.unit}`;
}

function shadowToCss(v: unknown): string {
  const layers = Array.isArray(v) ? v : [v];
  return layers.map((l: unknown) => {
    const s = l as {
      color: unknown; offsetX: unknown; offsetY: unknown;
      blur: unknown; spread: unknown; inset?: boolean;
    };
    const col = colorToCss(s.color);
    const x   = dimensionToCss(s.offsetX);
    const y   = dimensionToCss(s.offsetY);
    const b   = dimensionToCss(s.blur);
    const sp  = dimensionToCss(s.spread);
    return `${s.inset ? 'inset ' : ''}${x} ${y} ${b} ${sp} ${col}`;
  }).join(', ');
}

function fontFamilyToCss(v: unknown): string {
  const arr = v as string[];
  return arr.map(f => f.includes(' ') ? `"${f}"` : f).join(', ');
}

function cubicBezierToCss(v: unknown): string {
  const [x1, y1, x2, y2] = v as number[];
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

function transitionToCss(v: unknown): string {
  const t = v as { duration: unknown; delay: unknown; timingFunction: unknown };
  return `${dimensionToCss(t.duration)} ${dimensionToCss(t.delay)} ${
    typeof t.timingFunction === 'string' &&
    (t.timingFunction.startsWith('cubic') || t.timingFunction.startsWith('ease'))
      ? t.timingFunction
      : Array.isArray(t.timingFunction)
        ? cubicBezierToCss(t.timingFunction)
        : String(t.timingFunction)
  }`;
}

function toCssValue(type: string, val: unknown): string {
  switch (type) {
    case 'color':       return colorToCss(val);
    case 'dimension':   return dimensionToCss(val);
    case 'fontFamily':  return fontFamilyToCss(val);
    case 'fontWeight':  return String(val);
    case 'number':      return String(val);
    case 'duration':    return dimensionToCss(val);
    case 'cubicBezier': return cubicBezierToCss(val);
    case 'shadow':      return shadowToCss(val);
    case 'transition':  return transitionToCss(val);
    case 'typography':  return ''; // composites expanded separately via expandTypography — never reaches toCssValue
    default:            return String(val);
  }
}

// ── CSS var name from path ────────────────────────────────────────────────────

function toVarName(path: string[]): string {
  return '--hds-' + path
    .map(s => s.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase())
    .join('-');
}

// ── Typography composite expander ─────────────────────────────────────────────

type TypographyValue = {
  fontFamily?: unknown;
  fontSize?:   unknown;
  fontWeight?: unknown;
  letterSpacing?: unknown;
  lineHeight?: unknown;
};

// lineHeight in DTCG typography composites may be a bare number (unitless)
// or a { value, unit } object. Handle both.
function toLineHeightCss(v: unknown): string {
  if (typeof v === 'number') return String(v); // unitless — valid CSS line-height
  return dimensionToCss(v);
}

function expandTypography(path: string[], val: TypographyValue): Array<{ name: string; value: string }> {
  const base = toVarName(path);
  return [
    { name: `${base}-font-family`,    value: toCssValue('fontFamily', val.fontFamily) },
    { name: `${base}-font-size`,      value: dimensionToCss(val.fontSize) },
    { name: `${base}-font-weight`,    value: String(val.fontWeight) },
    { name: `${base}-letter-spacing`, value: dimensionToCss(val.letterSpacing) },
    { name: `${base}-line-height`,    value: toLineHeightCss(val.lineHeight) },
  ];
}

// ── Reference-preserving CSS value ───────────────────────────────────────────
// For semantic/component tokens whose $value is a reference, emit var() instead
// of the resolved raw value so dark-mode overrides cascade correctly.

function toCssValuePreservingRef(type: string, raw: unknown, root: TokenNode): string {
  if (typeof raw === 'string' && REF_RE.test(raw)) {
    const refPath = raw.slice(1, -1).split('.');
    return `var(${toVarName(refPath)})`;
  }
  // Composite values whose sub-properties may be references
  if (type === 'typography' && raw !== null && typeof raw === 'object') {
    // handled separately via expandTypography — this branch shouldn't be reached
    return '';
  }
  // NOTE: For non-string, non-typography composite values (e.g. shadow objects with
  // embedded color references), sub-properties are resolved to raw values here rather
  // than emitting var() references. This is acceptable because: (a) the current token
  // file uses only simple string references for all semantic/component tokens, and
  // (b) shadow tokens in the dark-mode override block always reference the dark value
  // from $extensions, which resolves to the correct raw CSS value. If future tokens
  // introduce semantic shadow references, extend this function to walk sub-properties.
  return toCssValue(type, resolveValue(raw, root));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const root = JSON.parse(
  readFileSync(resolve(process.cwd(), 'hirobius.tokens.json'), 'utf-8')
) as TokenNode;

const tokens: FlatToken[] = [];
walkTokens(root, [], '', tokens);

// Resolve all values
const resolved = tokens.map(t => ({
  ...t,
  resolvedValue: resolveValue(t.value, root),
  resolvedDark:  t.dark !== undefined ? resolveValue(t.dark, root) : undefined,
}));

// ── CSS generation ────────────────────────────────────────────────────────────

const primitiveVars:  string[] = [];
const semanticVars:   string[] = [];
const componentVars:  string[] = [];
const darkOverrides:  string[] = [];

for (const t of resolved) {
  const tier = t.path[0];
  const varName = toVarName(t.path);

  if (t.type === 'typography') {
    const tv = t.resolvedValue as TypographyValue;
    const props = expandTypography(t.path, tv);
    const lines = props.map(p => `  ${p.name}: ${p.value};`).join('\n');
    if (tier === 'primitive') primitiveVars.push(lines);
    else if (tier === 'semantic') semanticVars.push(lines);
    continue;
  }

  // Primitive tokens — emit resolved raw values
  if (tier === 'primitive') {
    primitiveVars.push(`  ${varName}: ${toCssValue(t.type, t.resolvedValue)};`);
    continue;
  }

  // Semantic/component — preserve var() reference chain
  const cssVal = toCssValuePreservingRef(t.type, t.value, root);
  if (tier === 'semantic')   semanticVars.push(`  ${varName}: ${cssVal};`);
  if (tier === 'component')  componentVars.push(`  ${varName}: ${cssVal};`);

  // Dark mode override
  if (t.resolvedDark !== undefined) {
    const darkCssVal = toCssValuePreservingRef(t.type, t.dark, root);
    darkOverrides.push(`  ${varName}: ${darkCssVal};`);
  }
}

// ── Tailwind @theme inline bridge ────────────────────────────────────────────

const themeBridge = `
@theme inline {
  /* Colors — semantic tier */
  --color-bg-primary:          var(--hds-semantic-color-bg-primary);
  --color-bg-secondary:        var(--hds-semantic-color-bg-secondary);
  --color-bg-tertiary:         var(--hds-semantic-color-bg-tertiary);
  --color-bg-inverse:          var(--hds-semantic-color-bg-inverse);
  --color-bg-brand:            var(--hds-semantic-color-bg-brand);
  --color-bg-brand-subtle:     var(--hds-semantic-color-bg-brand-subtle);
  --color-text-primary:        var(--hds-semantic-color-content-primary);
  --color-text-secondary:      var(--hds-semantic-color-content-secondary);
  --color-text-tertiary:       var(--hds-semantic-color-content-tertiary);
  --color-text-inverse:        var(--hds-semantic-color-content-inverse);
  --color-text-accent:          var(--hds-semantic-color-content-brand);
  --color-text-on-brand:       var(--hds-semantic-color-content-on-brand);
  --color-border-default:      var(--hds-semantic-color-border-default);
  --color-border-strong:       var(--hds-semantic-color-border-strong);
  --color-border-brand:        var(--hds-semantic-color-border-brand);
  --color-icon-primary:        var(--hds-semantic-color-content-primary);
  --color-icon-secondary:      var(--hds-semantic-color-content-secondary);
  --color-icon-brand:          var(--hds-semantic-color-content-brand);
  --color-feedback-success:    var(--hds-semantic-color-feedback-success);
  --color-feedback-warning:    var(--hds-semantic-color-feedback-warning);
  --color-feedback-error:      var(--hds-semantic-color-feedback-error);
  --color-feedback-info:       var(--hds-semantic-color-feedback-info);
  --color-brand:               var(--hds-semantic-color-bg-brand);

  /* Colors — primitive ramps (for one-offs) */
  --color-blue-50:    var(--hds-primitive-color-blue-50);
  --color-blue-100:   var(--hds-primitive-color-blue-100);
  --color-blue-200:   var(--hds-primitive-color-blue-200);
  --color-blue-300:   var(--hds-primitive-color-blue-300);
  --color-blue-400:   var(--hds-primitive-color-blue-400);
  --color-blue-500:   var(--hds-primitive-color-blue-500);
  --color-blue-600:   var(--hds-primitive-color-blue-600);
  --color-blue-700:   var(--hds-primitive-color-blue-700);
  --color-blue-800:   var(--hds-primitive-color-blue-800);
  --color-blue-900:   var(--hds-primitive-color-blue-900);
  --color-neutral-white:  var(--hds-primitive-color-neutral-white);
  --color-neutral-50:     var(--hds-primitive-color-neutral-50);
  --color-neutral-100:    var(--hds-primitive-color-neutral-100);
  --color-neutral-200:    var(--hds-primitive-color-neutral-200);
  --color-neutral-300:    var(--hds-primitive-color-neutral-300);
  --color-neutral-400:    var(--hds-primitive-color-neutral-400);
  --color-neutral-500:    var(--hds-primitive-color-neutral-500);
  --color-neutral-600:    var(--hds-primitive-color-neutral-600);
  --color-neutral-700:    var(--hds-primitive-color-neutral-700);
  --color-neutral-800:    var(--hds-primitive-color-neutral-800);
  --color-neutral-900:    var(--hds-primitive-color-neutral-900);
  --color-neutral-950:    var(--hds-primitive-color-neutral-950);
  --color-neutral-black:  var(--hds-primitive-color-neutral-black);

  /* Font */
  --font-sans: var(--hds-primitive-font-family-primary);

  /* Font sizes */
  --text-2xs:  var(--hds-primitive-font-size-2xs);
  --text-xs:   var(--hds-primitive-font-size-xs);
  --text-sm:   var(--hds-primitive-font-size-sm);
  --text-base: var(--hds-primitive-font-size-base);
  --text-lg:   var(--hds-primitive-font-size-lg);
  --text-xl:   var(--hds-primitive-font-size-xl);
  --text-2xl:  var(--hds-primitive-font-size-2xl);
  --text-3xl:  var(--hds-primitive-font-size-3xl);
  --text-4xl:  var(--hds-primitive-font-size-4xl);
  --text-5xl:  var(--hds-primitive-font-size-5xl);

  /* Border radius */
  --radius-none:    var(--hds-primitive-radius-none);
  --radius-xs:      var(--hds-primitive-radius-xs);
  --radius-sm:      var(--hds-primitive-radius-sm);
  --radius:         var(--hds-primitive-radius-md);
  --radius-md:      var(--hds-primitive-radius-md);
  --radius-lg:      var(--hds-primitive-radius-lg);
  --radius-xl:      var(--hds-primitive-radius-xl);
  --radius-2xl:     var(--hds-primitive-radius-2xl);
  --radius-full:    var(--hds-primitive-radius-full);

  /* Shadows */
  --shadow-sm:   var(--hds-semantic-shadow-sm);
  --shadow:      var(--hds-semantic-shadow-md);
  --shadow-md:   var(--hds-semantic-shadow-md);
  --shadow-lg:   var(--hds-semantic-shadow-lg);
  --shadow-card: var(--hds-semantic-shadow-card);

  /* Transitions */
  --transition-fast:   var(--hds-semantic-transition-fast);
  --transition-color:  var(--hds-semantic-transition-color);
  --transition-slow:   var(--hds-semantic-transition-slow);
}`.trim();

// ── CSS output ────────────────────────────────────────────────────────────────

const css = `/**
 * tokens.css — generated by scripts/build-tokens.ts
 * DO NOT EDIT BY HAND. Run: pnpm tokens
 * Source: hirobius.tokens.json (W3C DTCG 2025.10)
 */

/* Note: @custom-variant dark is declared in tailwind.css (not here) so Tailwind
   v4's @tailwindcss/vite plugin registers it before processing @theme inline. */

/* ── Primitive tokens ────────────────────────────────────────────────────── */
:root {
${primitiveVars.join('\n')}
}

/* ── Semantic tokens (light mode defaults) ───────────────────────────────── */
:root {
${semanticVars.join('\n')}
}

/* ── Component tokens ────────────────────────────────────────────────────── */
:root {
${componentVars.join('\n')}
}

/* ── Dark mode overrides ─────────────────────────────────────────────────── */
[data-theme="dark"] {
${darkOverrides.join('\n')}
}

/* ── Tailwind v4 bridge ──────────────────────────────────────────────────── */
${themeBridge}

/* ── Skeleton animation ──────────────────────────────────────────────────── */
/* Note: duration hardcoded here because CSS animation: expects a bare duration,
   not the three-part transition composite that --hds-semantic-animation-skeleton emits. */
@keyframes hds-skeleton-shimmer {
  0%   { opacity: 0.5; }
  50%  { opacity: 1.0; }
  100% { opacity: 0.5; }
}

.hds-skeleton {
  animation: hds-skeleton-shimmer var(--hds-primitive-duration-elaborate) ease-in-out infinite;
  background: var(--hds-semantic-color-bg-tertiary);
}

/* ── Focus ring ──────────────────────────────────────────────────────────── */
.hds-focus:focus-visible {
  outline: var(--hds-primitive-border-width-thick) solid var(--hds-primitive-color-blue-500);
  outline-offset: 2px;
}

/* ── Base layer ──────────────────────────────────────────────────────────── */
@layer base {
  html {
    font-family: var(--hds-primitive-font-family-primary);
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  body {
    background: var(--hds-semantic-color-bg-primary);
    color: var(--hds-semantic-color-content-primary);
  }

  *:focus:not(:focus-visible) { outline: none; }

  h1 {
    font-size: var(--hds-semantic-typography-display-small-font-size);
    font-weight: var(--hds-semantic-typography-display-small-font-weight);
    line-height: var(--hds-semantic-typography-display-small-line-height);
    letter-spacing: var(--hds-semantic-typography-display-small-letter-spacing);
  }
  h2 {
    font-size: var(--hds-semantic-typography-headline-large-font-size);
    font-weight: var(--hds-semantic-typography-headline-large-font-weight);
    line-height: var(--hds-semantic-typography-headline-large-line-height);
    letter-spacing: var(--hds-semantic-typography-headline-large-letter-spacing);
  }
  h3 {
    font-size: var(--hds-semantic-typography-headline-medium-font-size);
    font-weight: var(--hds-semantic-typography-headline-medium-font-weight);
    line-height: var(--hds-semantic-typography-headline-medium-line-height);
    letter-spacing: var(--hds-semantic-typography-headline-medium-letter-spacing);
  }
  h4 {
    font-size: var(--hds-semantic-typography-title-large-font-size);
    font-weight: var(--hds-semantic-typography-title-large-font-weight);
    line-height: var(--hds-semantic-typography-title-large-line-height);
    letter-spacing: var(--hds-semantic-typography-title-large-letter-spacing);
  }
}
`;

// ── TypeScript generation ─────────────────────────────────────────────────────

type TsNode = { [k: string]: TsNode | string };

function buildTsTree(tokens: typeof resolved): TsNode {
  const obj: TsNode = {};
  for (const t of tokens) {
    if (t.type === 'typography') {
      const suffixes = ['font-family', 'font-size', 'font-weight', 'letter-spacing', 'line-height'];
      let cur: TsNode = obj;
      for (const seg of t.path) {
        if (!(seg in cur)) cur[seg] = {};
        cur = cur[seg] as TsNode;
      }
      for (const suffix of suffixes) {
        const varName = toVarName(t.path) + '-' + suffix;
        const camelSuffix = suffix.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
        (cur as Record<string, string>)[camelSuffix] = `var(${varName})`;
      }
      continue;
    }
    let cur: TsNode = obj;
    for (let i = 0; i < t.path.length - 1; i++) {
      const seg = t.path[i];
      if (!(seg in cur)) cur[seg] = {};
      cur = cur[seg] as TsNode;
    }
    const last = t.path[t.path.length - 1];
    (cur as Record<string, string>)[last] = `var(${toVarName(t.path)})`;
  }
  return obj;
}

// Serialize the nested tree to TypeScript source without regex-patching JSON.
// Uses safe recursive emission that correctly quotes non-identifier keys.
function serializeTsNode(node: TsNode | string, indent: number): string {
  if (typeof node === 'string') return `'${node}'`;
  const pad = '  '.repeat(indent);
  const inner = '  '.repeat(indent + 1);
  const entries = Object.entries(node).map(([k, v]) => {
    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(k) ? k : `'${k}'`;
    return `${inner}${key}: ${serializeTsNode(v as TsNode | string, indent + 1)}`;
  });
  return `{\n${entries.join(',\n')}\n${pad}}`;
}

function buildTsObject(tokens: typeof resolved, tier: string): string {
  const tree = buildTsTree(tokens.filter(t => t.path[0] === tier));
  const tierNode = (tree[tier] ?? {}) as TsNode;
  return serializeTsNode(tierNode, 1);
}

// Icon sizes as raw numbers (for Lucide size prop)
const iconSizeTs = `
  // Raw numbers for Lucide React size prop
  iconSize: {
    sm:   12,
    base: 14,
    md:   16,
    lg:   20,
    xl:   24,
  },`;

// Motion convenience namespace (raw values for Framer Motion)
const motionTs = `
  // Raw values for Framer Motion transition props
  motion: {
    duration: {
      fast:      0.15,
      normal:    0.3,
      slow:      0.5,
      elaborate: 0.6,
      spin:      0.8,
    },
    easing: {
      default:    [0.25, 0.1, 0.25, 1]     as [number,number,number,number],
      easeIn:     [0.42, 0, 1, 1]          as [number,number,number,number],
      easeOut:    [0, 0, 0.58, 1]          as [number,number,number,number],
      easeInOut:  [0.42, 0, 0.58, 1]       as [number,number,number,number],
      expressive: [0.34, 1.56, 0.64, 1]   as [number,number,number,number],
    },
  },`;

const tsContent = `/**
 * src/tokens.ts — generated by scripts/build-tokens.ts
 * DO NOT EDIT BY HAND. Run: pnpm tokens
 */

/* eslint-disable */
// @ts-nocheck

export const hds = {
  primitive: ${buildTsObject(resolved, 'primitive')},

  semantic: ${buildTsObject(resolved, 'semantic')},

  component: ${buildTsObject(resolved, 'component')},
${iconSizeTs}
${motionTs}
} as const;

export type HdsTokens = typeof hds;
`;

// ── Write files ───────────────────────────────────────────────────────────────

mkdirSync(resolve(process.cwd(), 'src/styles'), { recursive: true });
writeFileSync(resolve(process.cwd(), 'src/styles/tokens.css'), css);
console.log('✓ src/styles/tokens.css');

writeFileSync(resolve(process.cwd(), 'src/tokens.ts'), tsContent);
console.log('✓ src/tokens.ts');

console.log(`\nTokens compiled: ${resolved.length} tokens`);
```

- [ ] **Step 3: Commit**

```bash
git add scripts/build-tokens.ts package.json
git commit -m "feat: add W3C DTCG token build script"
```

---

### Task 3: Run build, verify output, wire CSS

**Files:**
- Modify: `package.json`
- Modify: `src/styles/index.css`
- Creates (generated): `src/styles/tokens.css`, `src/tokens.ts`

- [ ] **Step 1: Update `package.json` scripts**

In `package.json`, update the `scripts` block. Find the existing `"dev"` and `"build"` entries and prepend the token build:

```json
"tokens": "tsx scripts/build-tokens.ts",
"dev":    "pnpm tokens && vite",
"build":  "pnpm tokens && tsc && vite build"
```

- [ ] **Step 2: Run the token build**

```bash
cd /c/Users/Adrian/Desktop/adrian-milsap
pnpm tokens
```

Expected output:
```
✓ src/styles/tokens.css
✓ src/tokens.ts

Tokens compiled: [N] tokens
```

If the script errors, fix the JSON/TypeScript issue before continuing.

- [ ] **Step 3: Spot-check generated CSS**

```bash
grep "hds-primitive-color-blue-500\|hds-semantic-color-bg-primary\|data-theme" src/styles/tokens.css | head -20
```

Expected: lines like `--hds-primitive-color-blue-500: rgb(30 46 253);` and `--hds-semantic-color-bg-primary: var(--hds-primitive-color-neutral-white);` and a `[data-theme="dark"]` block.

- [ ] **Step 4: Spot-check generated TS**

```bash
grep "primitive\|semantic\|motion" src/tokens.ts | head -20
```

Expected: nested object structure with `var(--hds-*)` strings and raw motion values.

- [ ] **Step 5: Add `@custom-variant dark` to `tailwind.css`**

Open `src/styles/tailwind.css` and append the custom variant declaration so Tailwind v4 registers it before processing `@theme inline`:

```css
@import 'tailwindcss' source(none);
@source '../**/*.{js,ts,jsx,tsx}';
@import 'tw-animate-css';

/* Dark variant — must be in the file Tailwind processes first */
@custom-variant dark (&:where([data-theme="dark"], [data-theme="dark"] *));
```

- [ ] **Step 6: Update `src/styles/index.css`**

```css
@import './fonts.css';
@import './tailwind.css';
@import './tokens.css';
```

(Replace `@import './theme.css';` with `@import './tokens.css';`)

- [ ] **Step 7: Add flash-prevention script to `index.html`**

Open `index.html` and add an inline script in `<head>` **before** the React bundle to set `data-theme` before paint, preventing a flash of the default (light) theme for users who prefer dark:

```html
<script>
  (function() {
    try {
      var t = localStorage.getItem('theme') || localStorage.getItem('hds-theme');
      if (!t) t = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', t);
    } catch(e) {}
  })();
</script>
```

- [ ] **Step 8: Note on committing generated files**

`src/styles/tokens.css` and `src/tokens.ts` are generated outputs committed to the repo intentionally. Vercel's build command (`pnpm build`) runs `pnpm tokens` first, so they will always be regenerated on deploy. Committing them means the repo is self-contained and the site works from a fresh clone without a build step for local preview. They are **not** added to `.gitignore`.

- [ ] **Step 9: Commit**

```bash
git add src/styles/tokens.css src/tokens.ts src/styles/index.css src/styles/tailwind.css index.html package.json
git commit -m "feat: wire generated token CSS into app, add dark variant, flash prevention, update scripts"
```

---

## Chunk 2: ThemeContext + deletions

### Task 4: Simplify `ThemeContext.tsx`

**Files:**
- Modify: `src/app/context/ThemeContext.tsx`

- [ ] **Step 1: Replace ThemeContext**

Replace the entire file with:

```tsx
import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface ThemeCtx {
  isDark:     boolean;
  toggleDark: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ isDark: false, toggleDark: () => {} });

function getInitialDark(): boolean {
  try {
    // Migrate from old key — read hds-theme if theme not yet set
    const v = localStorage.getItem('theme') ?? localStorage.getItem('hds-theme');
    if (v) return v === 'dark';
  } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(getInitialDark);

  useEffect(() => {
    try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch {}
    // data-theme only — .dark class removed (no longer needed without shadcn)
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleDark = useCallback(() => setIsDark(d => !d), []);

  return (
    <ThemeContext.Provider value={{ isDark, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 2: Verify build still compiles**

```bash
pnpm build 2>&1 | tail -20
```

Expected: no TypeScript errors on ThemeContext.

- [ ] **Step 3: Commit**

```bash
git add src/app/context/ThemeContext.tsx
git commit -m "refactor: simplify ThemeContext to data-theme only, migrate localStorage key"
```

---

### Task 5: Delete old files + shadcn UI components

**Files:**
- Delete: `src/app/design-system/tokens.ts`
- Delete: `src/app/design-system/theme.ts`
- Delete: `src/styles/theme.css`
- Delete: `src/app/components/ui/` (entire directory)

- [ ] **Step 1: Delete files**

```bash
cd /c/Users/Adrian/Desktop/adrian-milsap
rm src/app/design-system/tokens.ts
rm src/app/design-system/theme.ts
rm src/styles/theme.css
rm -rf src/app/components/ui/
```

- [ ] **Step 2: Verify nothing imports from ui/**

```bash
grep -r "from.*components/ui/" src/ --include="*.tsx" --include="*.ts"
```

Expected: no output (confirmed clean in the pre-implementation scan).

- [ ] **Step 3: Check what now fails to compile**

```bash
pnpm build 2>&1 | grep "error TS" | head -30
```

Expected: errors only from `hds.*` and `ct()` references in components — all of which will be fixed in Tasks 6–9. No errors should mention `components/ui`.

- [ ] **Step 4: Commit the deletions**

```bash
git add -A
git commit -m "chore: delete old HDS tokens, theme.ts (ct()), shadcn UI components, theme.css"
```

---

## Chunk 3: Core component migration

> **Migration pattern for every file:**
> 1. Replace `import hds from '../design-system/tokens'` → `import { hds } from '../../tokens'` (adjust relative path)
> 2. Replace `import { ct } from '../design-system/theme'` → remove entirely
> 3. Replace `ct(isDark).*` → CSS var strings (see color mapping table above)
> 4. Replace `hds.*` → new paths (see mapping tables above)
> 5. For inline style spreads: `style={{ ...hds.typeStyles.X }}` → `style={{ ...hds.semantic.typography.X }}`
> 6. For Motion `transition` props: use `hds.motion.duration.*` and `hds.motion.easing.*`

### Task 6: Migrate `BulgeCard.tsx`, `NavBar.tsx`, `Root.tsx`

**Files:**
- Modify: `src/app/components/BulgeCard.tsx`
- Modify: `src/app/components/NavBar.tsx`
- Modify: `src/app/pages/Root.tsx`

- [ ] **Step 1: Migrate `BulgeCard.tsx`**

`BulgeCard.tsx` uses only `hds.color.brand` (line 21). Apply:
- Import: `import { hds } from '../../tokens';`
- `const BRAND_BLUE = hds.primitive.color.blue[500];`
  Note: this is a CSS var string `'var(--hds-primitive-color-blue-500)'`. For canvas drawing (WebGL/SVG fill), you need the resolved hex. Add a comment and use the raw hex directly for the canvas context, or resolve via `getComputedStyle`:
  ```ts
  // Brand blue for canvas — use raw hex since canvas can't resolve CSS vars
  const BRAND_BLUE = '#1e2fff';
  ```

- [ ] **Step 2: Migrate `NavBar.tsx`**

Key changes (all surface/layout/space values):
```tsx
import { hds } from '../../tokens';
// Remove: import hds from '../design-system/tokens';

// style={{ background: hds.color.surface.page[th] }}
style={{ background: 'var(--hds-semantic-color-bg-primary)' }}

// paddingLeft: hds.layout.pageGutterH  →
paddingLeft: hds.semantic.layout['page-gutter-h']

// hds.space.px16  →  hds.primitive.space[4]
// hds.space.px32  →  hds.primitive.space[8]
```

Remove the `th` variable (`const th = isDark ? 'dark' : 'light'`) if NavBar uses it — it's no longer needed since theming is CSS-only.

- [ ] **Step 3: Migrate `Root.tsx`**

```tsx
import { hds } from '../tokens';

// hds.color.surface.page[th]  →  use CSS class instead of inline style
// Replace the injected <style> with a className approach, or use:
background: 'var(--hds-semantic-color-bg-primary)'

// hds.fontFamily  →  remove (now set by @layer base in tokens.css)
```

- [ ] **Step 4: Verify no TS errors on these three files**

```bash
pnpm build 2>&1 | grep -E "BulgeCard|NavBar|Root" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/app/components/BulgeCard.tsx src/app/components/NavBar.tsx src/app/pages/Root.tsx
git commit -m "refactor: migrate BulgeCard, NavBar, Root to new HDS token system"
```

---

### Task 7: Migrate `WorkGallery.tsx` + `WorkGalleryGrid.tsx`

**Files:**
- Modify: `src/app/components/WorkGallery.tsx`
- Modify: `src/app/components/WorkGalleryGrid.tsx`

These are the most token-heavy components. Apply the full mapping tables.

- [ ] **Step 1: Migrate `WorkGalleryGrid.tsx`**

Key changes:
```tsx
import { hds } from '../../tokens';

// hds.color.surface.thumbnail[isDark ? 'dark' : 'light']  →
const thumbnailColor = isDark
  ? hds.primitive.color.neutral[600]
  : hds.primitive.color.neutral[400];

// hds.layout.pageGutterH  →  hds.semantic.layout['page-gutter-h']
// hds.space.px16           →  hds.primitive.space[4]
// hds.space.px8            →  hds.primitive.space[2]

// hds.typeStyles.caption  →  hds.semantic.typography.labelSmall
// hds.typeStyles.projectTitle  →  hds.semantic.typography.titleMedium

// Motion transition:
// duration: hds.duration.elaborate  →  hds.motion.duration.elaborate
// ease: hds.easing.expressive       →  hds.motion.easing.expressive
```

- [ ] **Step 2: Migrate `WorkGallery.tsx`**

High-volume migration. Apply same patterns:
- All `hds.space.*` → new space tokens
- All `hds.layout.*` → `hds.semantic.layout[...]`
- All `hds.typeStyles.*` → `hds.semantic.typography.*` (see typography mapping table)
- `hds.color.surface.page[isDark ? 'dark' : 'light']` → `'var(--hds-semantic-color-bg-primary)'`
- Motion props: `hds.duration.*` → `hds.motion.duration.*`, `hds.easing.*` → `hds.motion.easing.*`
- `hds.iconSize.md` → `hds.iconSize.md` (unchanged path, still a raw number)

- [ ] **Step 3: Verify**

```bash
pnpm build 2>&1 | grep -E "WorkGallery" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/components/WorkGallery.tsx src/app/components/WorkGalleryGrid.tsx
git commit -m "refactor: migrate WorkGallery, WorkGalleryGrid to new HDS token system"
```

---

### Task 8: Migrate remaining components

**Files:**
- Modify: `src/app/components/HdsButton.tsx`
- Modify: `src/app/components/ExpandTooltip.tsx`
- Modify: `src/app/components/InfoPage.tsx`
- Modify: `src/app/components/AssetImg.tsx`
- Modify: `src/app/components/Lightbox.tsx`

- [ ] **Step 1: Migrate `HdsButton.tsx`**

Key changes:
```tsx
import { hds } from '../../tokens';
// Remove ct() — colors via CSS vars

// hds.color.opacity.text[th], hds.color.opacity.dim[th] — opacity system gone
// Replace rgba()-with-opacity patterns:
//   text color on tertiary  →  'var(--hds-semantic-color-content-primary)'
//   dim text             →  'var(--hds-semantic-color-content-secondary)'
//   disabled opacity     →  CSS: opacity: 0.35 (hardcode acceptable here)
//   hds.color.surface.raised[th]       →  'var(--semantic-color-surface-raised)'
//   hds.accent.hover                   →  'var(--semantic-accent-hover)'
//   hds.color.brand      →  'var(--hds-primitive-color-blue-500)'
//   hds.color.brandPressed  →  'var(--hds-primitive-color-blue-600)'
//   hds.color.white      →  'var(--hds-primitive-color-neutral-white)'

// hds.typeStyles.navLabel → hds.semantic.typography.labelSmall
// (add textTransform: 'uppercase' inline)

// hds.borderRadius.none → hds.primitive.radius.none (CSS var string)
// hds.duration.fast → hds.motion.duration.fast (for transition string)
// hds.space.*       → new space tokens
```

- [ ] **Step 2: Migrate `ExpandTooltip.tsx`**

```tsx
import { hds } from '../../tokens';
// hds.color.brand      →  'var(--hds-primitive-color-blue-500)'
// hds.color.white      →  'var(--hds-primitive-color-neutral-white)'
// hds.borderRadius.pill  →  hds.primitive.radius.full
// hds.space.*          →  new space tokens
// hds.typeStyles.caption  →  hds.semantic.typography.labelSmall
// hds.letterSpacing.wide  →  hds.primitive.font['letter-spacing'].wide
```

- [ ] **Step 3: Migrate `InfoPage.tsx`**

```tsx
import { hds } from '../../tokens';
// Remove ct() import — replace all ct(isDark).* with CSS vars
// hds.typeStyles.sectionLabel  →  hds.semantic.typography.labelMedium (+ uppercase)
// hds.typeStyles.prose         →  hds.semantic.typography.bodyLarge
// hds.typeStyles.body          →  hds.semantic.typography.bodyLarge
// ct(isDark).subtle            →  'var(--hds-semantic-color-content-tertiary)'
// ct(isDark).dim               →  'var(--hds-semantic-color-content-secondary)'
// hds.iconSize.base            →  hds.iconSize.base (raw number, unchanged path)
```

- [ ] **Step 4: Migrate `AssetImg.tsx`**

```tsx
import { hds } from '../../tokens';
// hds.color.surface.raised[th]       →  'var(--semantic-color-surface-raised)'
// hds.fontSize.xs                     →  hds.primitive.font.size['2xs'] (CSS var)
// hds.color.opacity.dim[th] rgba pattern  →  'var(--hds-semantic-color-content-secondary)'
// hds.space.px4                       →  hds.primitive.space[1]
```

- [ ] **Step 5: Migrate `Lightbox.tsx`**

```tsx
import { hds } from '../../tokens';
// hds.color.surface.raised[th]       →  'var(--semantic-color-surface-raised)'
// hds.fontSize.xs                     →  hds.primitive.font.size['2xs']
// hds.color.opacity.dim[th] rgba      →  'var(--hds-semantic-color-content-secondary)'
// hds.space.*                         →  new space tokens
// hds.layout.pageGutterH              →  hds.semantic.layout['page-gutter-h']
```

- [ ] **Step 6: Verify**

```bash
pnpm build 2>&1 | grep "error TS" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/app/components/HdsButton.tsx src/app/components/ExpandTooltip.tsx \
        src/app/components/InfoPage.tsx src/app/components/AssetImg.tsx \
        src/app/components/Lightbox.tsx
git commit -m "refactor: migrate HdsButton, ExpandTooltip, InfoPage, AssetImg, Lightbox to new HDS tokens"
```

---

## Chunk 4: HDS doc pages migration

### Task 9: Migrate `DocSections.tsx` + `HDSDocPanels.tsx`

These files are documentation components for the old token system. They must be updated to document the new system.

**Files:**
- Modify: `src/app/components/DocSections.tsx`
- Modify: `src/app/components/HDSDocPanels.tsx`

- [ ] **Step 1: Migrate `HDSDocPanels.tsx`**

```tsx
import { hds } from '../../tokens';
// Remove ct() — use CSS vars for all colors
// hds.color.surface.raised[th]  →  'var(--hds-semantic-color-bg-secondary)'
// hds.color.brand               →  'var(--hds-primitive-color-blue-500)'
// hds.color.brandRGB opacity    →  remove opacity system, use solid semantic color
// All hds.space.*               →  new space tokens
// All hds.typeStyles.*          →  hds.semantic.typography.*
// hds.duration.* (label values) →  update to new ms-based labels (150ms, 300ms, etc.)
```

Update the `MOTION_DEMOS` array to use `hds.motion.duration.*` values (raw seconds for Motion).

Update the typography specimen array to use new typescale names:
```tsx
const TYPE_SPECIMENS = [
  { name: 'label-small',  specimen: 'ACCESSIBILITY',            style: hds.semantic.typography.labelSmall },
  { name: 'label-medium', specimen: 'Motion · React · meta',    style: hds.semantic.typography.labelMedium },
  { name: 'title-medium', specimen: 'HIROBIUS DESIGN',          style: hds.semantic.typography.titleMedium },
  { name: 'body-large',   specimen: 'Project description copy', style: hds.semantic.typography.bodyLarge },
  { name: 'display-small',specimen: '12M+',                     style: hds.semantic.typography.displaySmall },
  { name: 'label-small',  specimen: 'WORK',                     style: { ...hds.semantic.typography.labelSmall, textTransform: 'uppercase' as const } },
];
```

Update `ACCENT_STEPS`, `SURFACE_TIERS`, `FEEDBACK_COLORS` exports to pull from the new token system:
```tsx
// Old: Object.entries(hds.color.accent)
// New: pull directly from semantic token CSS vars (display as table, not computed from JS)
export const ACCENT_STEPS = [50,100,200,300,400,500,600,700,800,900].map(n => ({
  step: n,
  cssVar: `--hds-primitive-color-blue-${n}`,
  value: `var(--hds-primitive-color-blue-${n})`,
}));

export const FEEDBACK_COLORS = ['success','warning','error','info'].map(name => ({
  name,
  cssVar: `--hds-semantic-color-feedback-${name}`,
  value: `var(--hds-semantic-color-feedback-${name})`,
}));
```

Remove `SURFACE_TIERS` and `OPACITY_SCALE` exports — the old surface/opacity system is gone.

- [ ] **Step 2: Migrate `DocSections.tsx`**

```tsx
import { hds } from '../../tokens';
// Remove ct() — replace all ct(isDark).* with CSS vars
// Update TYPE_PRESETS to use new typescale names and hds.semantic.typography paths
// Update FONT_SIZES to read from new primitive font size tokens
// Update LETTER_SPACING to use new hds.primitive.font['letter-spacing'] entries
// Update token reference paths in doc tables (hds.fontSize.xs → hds.primitive.font.size['2xs'], etc.)
// Update CSS var names in doc tables (--hds-font-size-xs → --hds-primitive-font-size-2xs, etc.)
// Update SPACE_ENTRIES to use new space token paths
// Update LAYOUT_NOTES to reference new semantic layout token names
```

- [ ] **Step 3: Verify**

```bash
pnpm build 2>&1 | grep -E "HDSDoc" | head -20
```

- [ ] **Step 4: Commit**

```bash
git add src/app/components/DocSections.tsx src/app/components/HDSDocPanels.tsx
git commit -m "refactor: update HDSDoc components to document new W3C token system"
```

---

### Task 10: Migrate `hds/*` page components

**Files:**
- Modify: `src/app/pages/hds/HDSLayout.tsx`
- Modify: `src/app/pages/hds/OverviewPage.tsx`
- Modify: `src/app/pages/hds/ArchitecturePage.tsx`
- Modify: `src/app/pages/hds/ColorPage.tsx`
- Modify: `src/app/pages/hds/TypographyPage.tsx`
- Modify: `src/app/pages/hds/SpacingPage.tsx`
- Modify: `src/app/pages/hds/MotionPage.tsx`
- Modify: `src/app/pages/hds/GuidancePage.tsx`

For all files: replace `import hds from` and `import { ct }` with `import { hds } from`, remove `ct()` usage, apply the full mapping tables.

- [ ] **Step 1: Migrate `HDSLayout.tsx`**

```tsx
import { hds } from '../../../tokens';
// Remove ct() — replace t.text, t.dim, t.subtle with CSS vars
// hds.space.*        →  new space tokens
// hds.typeStyles.*   →  hds.semantic.typography.*
// hds.letterSpacing.wider  →  hds.primitive.font['letter-spacing'].widest
```

- [ ] **Step 2: Migrate `ArchitecturePage.tsx`**

Update the architecture description text to reference the new system:
- Old: "Three-tier token hierarchy: primitives in tokens.ts, runtime theme in ct(isDark), and CSS custom properties in theme.css"
- New: "Three-tier token hierarchy: primitives → semantics → components, all defined in hirobius.tokens.json, compiled to tokens.css and tokens.ts by scripts/build-tokens.ts"

Apply all mapping tables for `hds.*` and `ct()` usage.

- [ ] **Step 3: Migrate `ColorPage.tsx`**

Update the color documentation to show the new neutral scale and blue ramp. Replace the old surface tier and opacity scale displays with semantic color tokens. Use `ACCENT_STEPS` and `FEEDBACK_COLORS` from the updated `HDSDocPanels.tsx` (where they are defined in Task 9 Step 1).

- [ ] **Step 4: Migrate `TypographyPage.tsx`**

Update to display the 14-style MD3 typescale. Replace `TYPE_PRESETS` with the new typescale specimen list. Update all `hds.typeStyles.*` spreads.

- [ ] **Step 5: Migrate `SpacingPage.tsx`, `MotionPage.tsx`, `GuidancePage.tsx`, `OverviewPage.tsx`**

Apply mapping tables. Update any hardcoded doc strings that reference old token paths or CSS var names.

For `MotionPage.tsx`, update easing references:
```tsx
const EASING_PRESETS = {
  expressive: hds.motion.easing.expressive,
  standard:   hds.motion.easing.easeInOut,
};
const maxDur = hds.motion.duration.spin;
```

For `GuidancePage.tsx`, update the do/don't rules to reference new token paths:
- Old: "Import ct() from design-system/theme..."
- New: "Use CSS vars directly — `var(--hds-semantic-color-*)` — or import `{ hds }` from `src/tokens.ts` for typed constants"

- [ ] **Step 6: Full build verify**

```bash
pnpm build 2>&1 | grep "error TS"
```

Expected: no TypeScript errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/hds/
git commit -m "refactor: migrate all HDS doc pages to new W3C token system"
```

---

## Chunk 5: Docs + final verification

### Task 11: Write `DEVELOPMENT.md`

**Files:**
- Create: `DEVELOPMENT.md`

- [ ] **Step 1: Create the file**

Create `DEVELOPMENT.md` at the repo root:

```markdown
# Development Guide

## Prerequisites

- **Node.js** 18+ ([nodejs.org](https://nodejs.org))
- **pnpm** 9+ — install with `npm install -g pnpm`
- **Git**

## Local setup

```bash
# 1. Clone
git clone https://github.com/hirobius/adrian-milsap.git
cd adrian-milsap

# 2. Install dependencies
pnpm install

# 3. Run dev server (compiles tokens first, then starts Vite)
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173).

## Scripts

| Command | What it does |
|---|---|
| `pnpm dev` | Compile tokens → start Vite dev server |
| `pnpm build` | Compile tokens → TypeScript check → Vite production build |
| `pnpm tokens` | Compile tokens only (run after editing `hirobius.tokens.json`) |
| `pnpm preview` | Preview the production build locally |

## Token pipeline

The design system uses a **W3C DTCG 2025.10-compliant** three-tier token architecture.

### Source of truth

`hirobius.tokens.json` at the repo root. **Never edit the generated files** (`src/styles/tokens.css`, `src/tokens.ts`) directly — they are overwritten on every build.

### Tiers

| Tier | JSON key | CSS prefix | JS path | Purpose |
|---|---|---|---|---|
| Primitive | `primitive` | `--hds-primitive-*` | `hds.primitive.*` | Raw values — never apply to UI directly |
| Semantic | `semantic` | `--hds-semantic-*` | `hds.semantic.*` | Purpose-driven aliases — this is where theming happens |
| Component | `component` | `--hds-component-*` | `hds.component.*` | Scoped to specific UI elements |

### Adding a token

1. Open `hirobius.tokens.json`
2. Add the token under the appropriate tier, following the DTCG format:
   ```json
   // Color (W3C DTCG 2025.10 format)
   "my-token": {
     "$type": "color",
     "$value": { "colorSpace": "srgb", "components": [0.118, 0.18, 0.992], "hex": "#1e2fff" }
   }

   // Dimension
   "my-spacing": {
     "$type": "dimension",
     "$value": { "value": 20, "unit": "px" }
   }

   // Reference to another token
   "my-alias": {
     "$type": "color",
     "$value": "{primitive.color.blue.500}"
   }
   ```
3. For tokens with dark mode variants, add `$extensions`:
   ```json
   "$extensions": {
     "com.hirobius.modes": {
       "light": "{primitive.color.neutral.white}",
       "dark":  "{primitive.color.neutral.black}"
     }
   }
   ```
4. Run `pnpm tokens` to regenerate `tokens.css` and `tokens.ts`

### Using tokens in components

**Tailwind utilities (preferred for layout/color):**
```tsx
<div className="bg-bg-primary text-text-primary border-border-default">
```

**CSS vars in inline styles (for dynamic values):**
```tsx
<div style={{ background: 'var(--hds-semantic-color-bg-secondary)' }}>
```

**TypeScript constants (for programmatic access):**
```tsx
import { hds } from '@/tokens';

// In a Motion transition:
<motion.div transition={{ duration: hds.motion.duration.normal, ease: hds.motion.easing.expressive }}>

// Typography spread:
<span style={{ ...hds.semantic.typography.labelSmall }}>LABEL</span>

// Icon size (raw number for Lucide):
<ChevronRight size={hds.iconSize.md} />
```

## Theme system

Theme switching is **pure CSS** — no React re-renders on toggle. The `ThemeProvider` sets `data-theme="dark"` on `<html>`, which activates the `[data-theme="dark"]` CSS overrides in `tokens.css`. All semantic tokens update automatically through the `var()` reference chain.

```tsx
import { useTheme } from '@/app/context/ThemeContext';

function MyComponent() {
  const { isDark, toggleDark } = useTheme();
  return <button onClick={toggleDark}>{isDark ? 'Light' : 'Dark'}</button>;
}
```

User preference is persisted to `localStorage` under the key `theme`. On first visit, `prefers-color-scheme` is respected.

## Project structure

```
src/
├── tokens.ts                     ← Generated — hds.* typed constants
├── app/
│   ├── App.tsx
│   ├── routes.tsx
│   ├── components/               ← Custom components only (no third-party UI libs)
│   ├── context/
│   │   └── ThemeContext.tsx
│   ├── pages/
│   │   └── hds/                  ← Design system documentation pages
│   └── data/
├── styles/
│   ├── index.css                 ← Entry point: imports fonts, tailwind, tokens
│   ├── tokens.css                ← Generated — CSS custom properties
│   ├── fonts.css
│   └── tailwind.css
├── main.tsx
hirobius.tokens.json              ← Token source of truth (W3C DTCG 2025.10)
scripts/
└── build-tokens.ts               ← Token compiler
```

## Typography

14-style MD3-structured typescale, all values on the 4px grid. Use `hds.semantic.typography.*` for inline styles or the Tailwind text utilities.

| Style | Size | Weight | Use case |
|---|---|---|---|
| `displayLarge` | 60px | 400 | Hero text |
| `displayMedium` | 48px | 400 | Large feature sections |
| `displaySmall` | 36px | 400 | Section openers, metrics |
| `headlineLarge` | 32px | 400 | Page headers |
| `headlineMedium` | 28px | 400 | Section headers |
| `headlineSmall` | 24px | 400 | Sub-section headers |
| `titleLarge` | 22px | 500 | Card titles |
| `titleMedium` | 16px | 500 | Panel headers, nav |
| `titleSmall` | 14px | 500 | Compact titles |
| `bodyLarge` | 16px | 400 | Prose, descriptions |
| `bodyMedium` | 14px | 400 | Secondary copy |
| `labelLarge` | 14px | 500 | UI labels |
| `labelMedium` | 12px | 500 | Captions, metadata |
| `labelSmall` | 11px | 500 | Tags, nav items |
```

- [ ] **Step 2: Update `README.md` to point to DEVELOPMENT.md**

Add to the top of `README.md`:
```markdown
> **Getting started?** See [DEVELOPMENT.md](./DEVELOPMENT.md) for local setup, the token pipeline, and component conventions.
```

- [ ] **Step 3: Commit**

```bash
git add DEVELOPMENT.md README.md
git commit -m "docs: add DEVELOPMENT.md with local setup, token pipeline, and theme system guide"
```

---

### Task 12: Final verification + push

- [ ] **Step 1: Full clean build**

```bash
cd /c/Users/Adrian/Desktop/adrian-milsap
pnpm build
```

Expected: zero TypeScript errors, Vite completes successfully.

- [ ] **Step 2: Dev server smoke test**

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173). Verify:
- Site loads without blank screen or console errors
- Dark mode toggle works (data-theme attribute switches on `<html>`)
- Colors update correctly on theme switch (no hardcoded values remaining)
- Typography renders correctly
- BulgeCard hover effect still works
- WorkGallery scroll and navigation works

- [ ] **Step 3: Verify no old token references remain**

```bash
grep -r "design-system/tokens\|design-system/theme\|ct(isDark\|--hds-font-size\|--hds-color\|--hds-space\|hds\.color\.\|hds\.space\.\|hds\.layout\.\|hds\.typeStyles\.\|hds\.duration\.\|hds\.easing\.\|hds\.borderRadius\.\|hds\.fontSize\.\|hds\.fontFamily" src/ --include="*.tsx" --include="*.ts" | grep -v "tokens.ts\|tokens.css"
```

Expected: no output (all old references migrated).

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

Expected: Vercel auto-deploy triggers.

- [ ] **Step 5: Verify Vercel deploy**

Check the Vercel dashboard or wait for the deploy URL. Confirm the live site loads correctly with the new token system.

---

## Summary of all files changed

| Action | Files |
|---|---|
| **Created** | `hirobius.tokens.json`, `scripts/build-tokens.ts`, `src/styles/tokens.css` (generated), `src/tokens.ts` (generated), `DEVELOPMENT.md` |
| **Modified** | `package.json`, `src/styles/index.css`, `src/app/context/ThemeContext.tsx`, `README.md` |
| **Migrated** | `BulgeCard.tsx`, `NavBar.tsx`, `Root.tsx`, `WorkGallery.tsx`, `WorkGalleryGrid.tsx`, `HdsButton.tsx`, `ExpandTooltip.tsx`, `InfoPage.tsx`, `AssetImg.tsx`, `Lightbox.tsx`, `DocSections.tsx`, `HDSDocPanels.tsx`, 8× `hds/*.tsx` pages |
| **Deleted** | `src/app/design-system/tokens.ts`, `src/app/design-system/theme.ts`, `src/styles/theme.css`, `src/app/components/ui/` (48 files) |

