# Token System Integrity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate every hardcoded color, type, and spacing value from the app so that design changes flow from `hirobius.tokens.json` → the entire UI.

**Architecture:** The W3C token pipeline already exists (`hirobius.tokens.json` → `tokens.css` → `generated-tokens.ts`). The problem is selective bypass — components use hardcoded Tailwind color classes (`text-gray-400`, `bg-zinc-900`) instead of `ct(isDark)` computed theme values. Fix: replace every hardcoded style with `hds.*` or `ct(isDark)` calls. Add a `/hds/tokens` documentation page. Restructure HDS nav so Overview is a standalone entry.

**Tech Stack:** React 18, TypeScript, Tailwind v4, Motion (Framer Motion), `hds` design-system/tokens.ts, `ct()` from design-system/theme.ts, W3C CSS custom properties (`--primitive-*`, `--semantic-*`, `--component-*`)

**Rule:** If it's in the build, it must be built with tokens. No hardcoded color values, font sizes, font weights, or spacing numbers outside of layout constants that have no token equivalent.

---

## Chunk 1: Nav restructure + H1 typography enforcement

### Task 1: Move Overview out of Foundations, add Tokens to nav

**Files:**
- Modify: `src/app/pages/hds/HDSLayout.tsx` (nav groups)
- Modify: `src/app/routes.tsx` (add /hds/tokens route placeholder)
- Create: `src/app/pages/hds/TokensPage.tsx` (stub — fleshed out in Task 6)

**Problem:** Overview sits under FOUNDATIONS in the sidebar. It should be above all groups as a standalone entry (like a "home" for the DS docs). Also, `/hds/tokens` needs a nav entry.

**Current nav:**
```
FOUNDATIONS: Overview, Architecture, Typography, Color, Motion, Spacing
COMPONENTS: Components
USAGE: Guidance
```

**Target nav:**
```
[standalone] Overview
FOUNDATIONS: Architecture, Typography, Color, Motion, Spacing, Tokens
COMPONENTS: Components
USAGE: Guidance
```

- [ ] **Step 1: Create TokensPage stub**

`src/app/pages/hds/TokensPage.tsx`:
```tsx
import { useTheme } from '../../context/ThemeContext';
import { DocPageHeader } from './HDSLayout';

export default function TokensPage() {
  const { isDark } = useTheme();
  return (
    <div>
      <DocPageHeader group="Foundations" title="Tokens" isDark={isDark}
        intro="Full W3C DTCG token reference — primitive, semantic, and component tiers." />
      <p style={{ color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' }}>Coming in Task 6.</p>
    </div>
  );
}
```

- [ ] **Step 2: Add /hds/tokens route to routes.tsx**

In `src/app/routes.tsx`, add inside the `/hds` children array:
```tsx
import TokensPage from './pages/hds/TokensPage';
// ...
{ path: 'tokens', Component: TokensPage },
```

- [ ] **Step 3: Restructure HDSLayout.tsx nav**

In `src/app/pages/hds/HDSLayout.tsx`, replace the nav arrays:

```tsx
// Remove Overview from FOUNDATIONS:
const FOUNDATIONS = [
  { path: '/hds/architecture', label: 'Architecture' },
  { path: '/hds/typography',   label: 'Typography'   },
  { path: '/hds/color',        label: 'Color'        },
  { path: '/hds/motion',       label: 'Motion'       },
  { path: '/hds/spacing',      label: 'Spacing'      },
  { path: '/hds/tokens',       label: 'Tokens'       },
];
```

In the Sidebar JSX, add an Overview link above the first `<NavGroup>`:
```tsx
{/* Standalone overview link — no group label */}
<SideNavItem path="/hds" label="Overview" isDark={isDark} exact />
<div style={{ height: hds.space.px8 }} />
<NavGroup label="FOUNDATIONS" isDark={isDark} />
```

- [ ] **Step 4: Build and verify nav renders correctly**
```bash
cd C:\Users\Adrian\Desktop\adrian-milsap
node scripts/build-tokens.mjs && npx vite build 2>&1 | grep -E "error|✓ built"
```
Expected: `✓ built in X.XXs`

- [ ] **Step 5: Commit**
```bash
git add src/app/pages/hds/TokensPage.tsx src/app/routes.tsx src/app/pages/hds/HDSLayout.tsx
git commit -m "feat: restructure HDS nav — Overview standalone, add /hds/tokens route"
```

---

### Task 2: H1 typography — enforce semantic type scale across HDS pages

**Files:**
- Modify: `src/app/pages/hds/OverviewPage.tsx`
- Modify: `src/app/pages/hds/HDSLayout.tsx` (DocPageHeader component)

**Problem:** H1s use hardcoded `clamp(28px, 4vw, 44px)`, `fontWeight: 500`, `letterSpacing: '-0.03em'`. The W3C tokens define `--semantic-typography-display-*` and `--semantic-typography-heading-1-*` for exactly this.

**Mapping:**
- Page H1 (DocPageHeader `title`) → use `--semantic-typography-heading-1-*` (30px / bold / tight / 1.25)
- Section display text (OverviewPage hero) → use `--semantic-typography-display-*` (48px / bold / tighter / 1)
- For the clamp display, add a `display` semantic type token override for the hero — keep the var chain, wrap with `clamp()` in CSS or use `font-size: clamp(...)` pointing at the var.

**Rule:** Never write `fontSize: 28` or `fontWeight: 500` in a component. Write `fontSize: 'var(--semantic-typography-heading-1-font-size)'` etc.

- [ ] **Step 1: Fix DocPageHeader in HDSLayout.tsx**

Replace the hardcoded title style:
```tsx
// BEFORE:
fontSize: 'clamp(28px, 3vw, 40px)',
fontWeight: 500,
letterSpacing: '-0.02em',
lineHeight: 1.1,

// AFTER:
fontFamily:    'var(--semantic-typography-heading-1-font-family)',
fontSize:      'clamp(var(--semantic-typography-heading-2-font-size), 3vw, var(--semantic-typography-heading-1-font-size))',
fontWeight:    'var(--semantic-typography-heading-1-font-weight)' as React.CSSProperties['fontWeight'],
letterSpacing: 'var(--semantic-typography-heading-1-letter-spacing)',
lineHeight:    'var(--semantic-typography-heading-1-line-height)',
```

- [ ] **Step 2: Fix OverviewPage.tsx hero H1**

Replace:
```tsx
// BEFORE:
fontSize:      'clamp(28px, 4vw, 44px)',
fontWeight:    500,
letterSpacing: '-0.03em',
lineHeight:    1.1,
fontFamily:    hds.fontFamily,

// AFTER:
fontFamily:    'var(--semantic-typography-display-font-family)',
fontSize:      'clamp(var(--semantic-typography-heading-1-font-size), 4vw, var(--semantic-typography-display-font-size))',
fontWeight:    'var(--semantic-typography-display-font-weight)' as React.CSSProperties['fontWeight'],
letterSpacing: 'var(--semantic-typography-display-letter-spacing)',
lineHeight:    'var(--semantic-typography-display-line-height)',
```

Note: `clamp(token-min, fluid, token-max)` keeps the type responsive while anchoring both ends to the token system.

- [ ] **Step 3: Build check**
```bash
npx vite build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 4: Commit**
```bash
git add src/app/pages/hds/OverviewPage.tsx src/app/pages/hds/HDSLayout.tsx
git commit -m "fix: h1 and display headings use semantic typography CSS vars"
```

---

## Chunk 2: Gallery token migration (biggest impact)

### Task 3: WorkGalleryGrid.tsx — replace all hardcoded Tailwind

**Files:**
- Modify: `src/app/components/WorkGalleryGrid.tsx`

**Problem:** 8+ Tailwind color classes bypass the token system entirely. Changing `hds.color.brand` won't update the badge hover color. Changing surface colors won't update the grid background.

**Replacements:**
| Hardcoded class | Replace with |
|---|---|
| `bg-black` / `bg-white` | `style={{ background: hds.color.surface.page[th] }}` |
| `text-gray-400` / `text-gray-500` | `style={{ color: t.dim }}` |
| `text-gray-100` / `text-gray-900` | `style={{ color: t.text }}` |
| `bg-zinc-900` / `bg-gray-100` | `style={{ background: hds.color.surface.raised[th] }}` |
| `hover:bg-blue-500 hover:text-white` | Handled via `onMouseEnter`/`onMouseLeave` state (see below) |
| `bg-brand-blue` (active badge) | `style={{ background: hds.color.brand, color: hds.color.white }}` |
| `focus:ring-blue-500` | `style={{ outline: \`2px solid ${hds.color.brand}\`, outlineOffset: 2 }}` on focus |
| `px-2 py-0.5` | `style={{ paddingLeft: hds.space.px8, paddingTop: hds.space.px2, paddingBottom: hds.space.px2, paddingRight: hds.space.px8 }}` |
| `gap-4 lg:gap-5` | `style={{ gap: hds.space.px16 }}` (or px20 for lg) |
| `gap-1 mt-2` | `style={{ gap: hds.space.px4, marginTop: hds.space.px8 }}` |
| `mb-2` | `style={{ marginBottom: hds.space.px8 }}` |

**For badge hover state** — replace Tailwind hover classes with React hover state:
```tsx
const [hoveredBadge, setHoveredBadge] = useState<number | null>(null);
// In badge button:
onMouseEnter={() => setHoveredBadge(idx)}
onMouseLeave={() => setHoveredBadge(null)}
style={{
  background: isActive || hoveredBadge === idx ? hds.color.brand : hds.color.surface.raised[th],
  color:      isActive || hoveredBadge === idx ? hds.color.white : t.text,
  paddingLeft: hds.space.px8, paddingRight: hds.space.px8,
  paddingTop: hds.space.px2, paddingBottom: hds.space.px2,
  border: 'none', cursor: 'pointer',
  transition: `background ${hds.duration.fast}s, color ${hds.duration.fast}s`,
  outline: 'none',
  ...hds.typeStyles.caption,
}}
onFocus={e => { e.currentTarget.style.outline = `2px solid ${hds.color.brand}`; e.currentTarget.style.outlineOffset = '2px'; }}
onBlur={e => { e.currentTarget.style.outline = 'none'; }}
```

**For the outer container:**
```tsx
// BEFORE: className={`... ${isDark ? 'bg-black' : 'bg-white'}`}
// AFTER: remove className bg-*, add to style prop:
style={{ flex: 1, overflow: 'hidden', transition: `background ${hds.duration.standard}s`, background: hds.color.surface.page[th] }}
```

- [ ] **Step 1: Read the full WorkGalleryGrid.tsx for exact line content**
(Read lines 1-200 to get full context before editing)

- [ ] **Step 2: Add `th` variable and `hoveredBadge` state**
```tsx
const th = isDark ? 'dark' : 'light';
const [hoveredBadge, setHoveredBadge] = useState<string | null>(null);
```
(Use badge value as key, not index, to avoid collision across cards)

- [ ] **Step 3: Replace outer container className**
Remove all color-related Tailwind from the outer `<div>`, move to `style`.

- [ ] **Step 4: Replace filter row text color**
Line ~117: remove `isDark ? 'text-gray-400' : 'text-gray-500'` className, add `style={{ color: t.dim }}`.

- [ ] **Step 5: Replace project title text color**
Line ~148: remove `isDark ? 'text-gray-100' : 'text-gray-900'` className, add `style={{ color: t.text }}`.

- [ ] **Step 6: Replace badge buttons — full inline style migration**
Lines ~169-188: Replace all Tailwind `px-2 py-0.5 bg-* text-* hover:*` with inline styles + hover state.

- [ ] **Step 7: Build check**
```bash
npx vite build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 8: Commit**
```bash
git add src/app/components/WorkGalleryGrid.tsx
git commit -m "fix: WorkGalleryGrid — all colors and spacing now use hds tokens"
```

---

### Task 4: WorkGallery.tsx — replace hardcoded Tailwind + magic layout values

**Files:**
- Modify: `src/app/components/WorkGallery.tsx`

**Replacements:**
| Hardcoded value | Replace with |
|---|---|
| `text-gray-400` / `text-gray-500` | `style={{ color: t.dim }}` |
| `text-gray-100` / `text-gray-900` | `style={{ color: t.text }}` |
| `text-zinc-400` / `text-gray-600` | `style={{ color: t.dim }}` |
| `border-none p-0 bg-transparent` | `style={{ border: 'none', padding: 0, background: 'transparent' }}` |
| `focus-visible:ring-2 focus-visible:ring-accent` | Use `onFocus`/`onBlur` with `outline: 2px solid ${hds.color.brand}` |
| `height: '45vh', maxHeight: '500px'` | Keep as-is for now (layout viewport values, not style tokens — acceptable exception, document with comment) |
| `height: 'clamp(300px, 38vh, 360px)'` | Keep as-is (viewport-relative layout — not a token concern) |

**Note on viewport-relative heights:** `45vh`, `38vh`, `clamp(300px, 38vh, 360px)` are responsive layout values that depend on the viewport, not the design system. These are acceptable non-token values. Document them with `/* layout: viewport-relative */` comments.

- [ ] **Step 1: Read WorkGallery.tsx lines 220-370 for exact content**

- [ ] **Step 2: Add `th` and `t` variables if not present**
```tsx
const th = isDark ? 'dark' : 'light';
const t = ct(isDark); // import ct from '../design-system/theme'
```

- [ ] **Step 3: Fix item title text color (line ~229)**
```tsx
// BEFORE: className={`... ${isDark ? 'text-gray-400' : 'text-gray-500'}`}
// AFTER: remove className, add style={{ color: t.dim }}
```

- [ ] **Step 4: Fix video button (line ~250)**
```tsx
// BEFORE: className="cursor-zoom-in border-none p-0 bg-transparent focus:outline-none focus-visible:ring-2..."
// AFTER:
style={{ display: 'block', border: 'none', padding: 0, background: 'transparent', cursor: 'zoom-in' }}
onFocus={e => { e.currentTarget.style.outline = `2px solid ${hds.color.brand}`; e.currentTarget.style.outlineOffset = '2px'; }}
onBlur={e => { e.currentTarget.style.outline = 'none'; }}
```

- [ ] **Step 5: Fix all remaining Tailwind text color classes in lightbox/project info area**
Search for `text-gray-` and `text-zinc-` in WorkGallery.tsx, replace all with `style={{ color: t.text }}` or `style={{ color: t.dim }}` as appropriate.

- [ ] **Step 6: Add comments for acceptable viewport-relative values**
```tsx
style={{ height: '45vh', maxHeight: '500px' /* layout: viewport-relative, not a token */ }}
```

- [ ] **Step 7: Build check**
```bash
npx vite build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 8: Commit**
```bash
git add src/app/components/WorkGallery.tsx
git commit -m "fix: WorkGallery — all colors use ct(isDark) tokens, viewport layout values documented"
```

---

## Chunk 3: Tokens documentation page

### Task 5: Review token gaps before building docs page

**Files:**
- Read: `hirobius.tokens.json`
- Read: `src/styles/tokens.css`

**Goal:** Before building the tokens page, confirm there are no missing tokens we'd want to document that don't yet exist. This is the "review before adding" step the user requested.

**Check these gaps found in audit:**
1. `SIDEBAR_W = 220` in HDSLayout — should this be a layout token?
   - **Recommendation: No.** It's a single-file constant, not reused across components. Adding `component.sidebar.width` to the JSON would be premature. Document as a known layout constant.
2. Button heights (`h = size === 'sm' ? 32 : 40`) in HdsButton — should these be tokens?
   - **Recommendation: Yes.** Add `component.button.height-sm` and `component.button.height-md` to tokens.json. These affect the visual rhythm and should be tweakable from the token layer.
3. Video height `45vh / 500px` — layout token?
   - **Recommendation: No.** Viewport-relative values don't belong in the static token system.

**If button heights are approved — additions to `hirobius.tokens.json`:**
```json
"button": {
  ...existing tokens...,
  "height-sm": { "$type": "dimension", "$value": { "value": 32, "unit": "px" } },
  "height-md": { "$type": "dimension", "$value": { "value": 40, "unit": "px" } }
}
```

- [ ] **Step 1: Present token gap analysis to user for approval**
(Summarize the 3 gaps above and ask: "Should button heights become tokens?")

- [ ] **Step 2: If approved — add to hirobius.tokens.json and regenerate**
```bash
node scripts/build-tokens.mjs
```
Verify `--component-button-height-sm: 32px` and `--component-button-height-md: 40px` appear in `src/styles/tokens.css`.

- [ ] **Step 3: Update HdsButton.tsx to use the new token vars**
```tsx
// BEFORE:
const h = size === 'sm' ? 32 : 40;
// AFTER:
const h = `var(--component-button-height-${size})`;
// Update all uses of `h` in the style prop to use this string value.
```

- [ ] **Step 4: Commit (only if tokens were added)**
```bash
git add hirobius.tokens.json src/styles/tokens.css src/app/design-system/generated-tokens.ts src/app/components/HdsButton.tsx
git commit -m "feat: add component.button.height-sm/md tokens; HdsButton uses CSS vars"
```

---

### Task 6: Build /hds/tokens documentation page

**Files:**
- Modify: `src/app/pages/hds/TokensPage.tsx` (replace stub with full implementation)

**Goal:** A documentation page that shows the full three-tier token reference. Different from `/lab` (interactive chain tracer) — this is a clean reference table, like a Storybook token page or Zeroheight variable panel.

**Page structure:**
```
/hds/tokens
├── Intro: "W3C DTCG 2025.10 · Three tiers · 129 tokens"
├── Tier tabs: Primitive | Semantic | Component
├── For each tier:
│   ├── Grouped by category (color, space, font, radius, duration, easing)
│   ├── Each token row: CSS var name | live swatch (if color) | resolved value | type
│   └── Copy-to-clipboard on var name click
└── Footer: "Source: hirobius.tokens.json → tokens.css → generated-tokens.ts"
```

**Data source:** Import `allTokens` from `src/app/components/lab/tokenUtils.ts` (already built). The `/lab` and `/hds/tokens` pages share the same data — different presentation.

**Implementation notes:**
- Use `getComputedStyle(document.documentElement).getPropertyValue(cssVar)` to show resolved values for primitives
- Color tokens: show live swatch (`background: var(--css-var)`) + the computed hex
- Non-color tokens: show the var name and its value from the `allTokens` flat list
- Keep under 150 lines — extract a `TokenRow` sub-component if needed

```tsx
// TokensPage.tsx skeleton
import { useState } from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../../context/ThemeContext';
import hds from '../../design-system/tokens';
import { ct } from '../../design-system/theme';
import { DocPageHeader, DocSection } from './HDSLayout';
import { allTokens, Tier, groupByCategory, getTokensByTier } from '../../components/lab/tokenUtils';

const TIERS: Tier[] = ['primitive', 'semantic', 'component'];

export default function TokensPage() {
  const { isDark } = useTheme();
  const t = ct(isDark);
  const [tier, setTier] = useState<Tier>('primitive');
  const groups = groupByCategory(getTokensByTier(tier));
  // ... render
}
```

- [ ] **Step 1: Write TokensPage.tsx — tier tabs + grouped token table**

Each row shows:
- CSS var name (monospace, copyable)
- Live color swatch if `type === 'color'` (16×16 div with `background: var(--css-var)`)
- Type badge (color, dimension, fontWeight, etc.)
- For primitives: resolved value (read from `allTokens[n].rawValue`)
- For semantic/component: alias target (lightAlias)

- [ ] **Step 2: Build check**
```bash
npx vite build 2>&1 | grep -E "error|✓ built"
```

- [ ] **Step 3: Commit**
```bash
git add src/app/pages/hds/TokensPage.tsx
git commit -m "feat: /hds/tokens — full W3C token reference page with live swatches"
```

---

## Chunk 4: Final pass + push

### Task 7: Audit pass — catch anything missed

**Files:**
- Quick scan of all modified files + remaining HDS pages

- [ ] **Step 1: Search for remaining hardcoded color strings**
```bash
grep -rn "text-gray\|text-zinc\|bg-gray\|bg-zinc\|bg-black\|bg-white\|text-white\|text-black\|#[0-9a-fA-F]\{3,6\}" src/app/components src/app/pages --include="*.tsx" | grep -v "//.*#" | grep -v node_modules
```
Review output. Any hits in WorkGallery, WorkGalleryGrid, or component files = fix. Hits in documentation/demo contexts (ColorPage swatches) = acceptable.

- [ ] **Step 2: Search for hardcoded font sizes**
```bash
grep -rn "fontSize: [0-9]" src/app/components src/app/pages --include="*.tsx" | grep -v "hds\."
```
Any hit not using `hds.*` or `var(--` = fix.

- [ ] **Step 3: Fix any findings**

- [ ] **Step 4: Final build**
```bash
node scripts/build-tokens.mjs && npx vite build 2>&1 | grep -E "error|✓ built"
```
Expected: `✓ built in X.XXs`

- [ ] **Step 5: Push everything**
```bash
git push origin main
```

---

## Token gap decisions (requires user input before Task 5)

Before executing Task 5, confirm with user:

| Gap | Current | Proposed token | Add? |
|-----|---------|----------------|------|
| Button height sm | `h = 32` (hardcoded) | `component.button.height-sm: 32px` | ? |
| Button height md | `h = 40` (hardcoded) | `component.button.height-md: 40px` | ? |
| Sidebar width | `SIDEBAR_W = 220` (file-local constant) | No token needed | No |
| Video height | `45vh / 500px` | No token — viewport-relative | No |

---

## Execution order

Run chunks in sequence. Each chunk produces a working, committed state.

1. Chunk 1 → Nav restructure + H1 typography (Tasks 1–2)
2. Chunk 2 → Gallery token migration (Tasks 3–4) ← highest impact
3. Chunk 3 → Token gap review + Tokens page (Tasks 5–6)
4. Chunk 4 → Final audit pass + push (Task 7)

Estimated commits: 6–7

