<!-- Hand-maintained. Last updated: 2026-05-01. Mirror of hirobius.tokens.json; update this file in the same commit as any token source change. -->

# Hirobius Design System - Design Handoff

> Human- and agent-readable mirror of `hirobius.tokens.json`.
> **Any change to the token source of truth must propagate here in the same commit.**
> Last updated: 2026-05-01

---

## Brand Identity

<!-- auto:start:brand-identity -->
| Attribute | Value |
| --- | --- |
| Brand blue | `#1E2EFD` (`primitive.color.blue.500`) |
| Font | Satoshi (self-hosted) + Geist Mono (monospace) |
| Neutral scale | True monochromatic — equal RGB channels, no warm/cool tint |
| Spacing base | 4px |
| Action radius | `12px` (`semantic.radius.action`) for interactive controls |
| Card corners | `8px` (`primitive.radius.8`) |
| Motion philosophy | Depth via interaction (BulgeCard parallax), not drop shadows |
<!-- auto:end:brand-identity -->

---

## Token Pipeline Architecture

### Three-tier system

```
hirobius.tokens.json
+-- primitive.*     Raw values - never apply to UI directly
+-- semantic.*      Purpose aliases - bg, text, border, icon, shadow (with light/dark modes)
+-- component.*     Scoped - nav, card, button, badge, tag, container, grid
```

### Compile flow

```
hirobius.tokens.json -> pnpm tokens -> tokens.css + generated-tokens.ts
```

### Verify after every token change

```bash
pnpm tokens:verify
```

<!-- auto:start:token-count -->
Checks all 361 tokens, aliases, and TS refs in one shot.
<!-- auto:end:token-count -->

### Key pipeline rules

| Rule | Detail |
|---|---|
| Semantic/component tokens must alias upstream | No inline raw values except derived `oklch()` color tints |
| Color tokens must alias or use `oklch()` tints | Primitive colors stay hex; semantic/component tints may be computed |
| Responsive clamp() lives in `theme.css` | Not in tokens.json - Figma can't parse CSS functions |
| Token JSON stores static desktop-max values | e.g. `display-xl` = `80px` (the max of `clamp(48px, 6vw, 80px)`) |
| Source of truth is the JSON, not Figma | Code-first. Figma is synced from code, not upstream. |

### W3C / Figma compatibility

- **Color format:** Hex strings (`"#1e2fff"`) for primitives; derived semantic/component tints may use raw `oklch()`
- **Extensions namespace:** `com.figma.variables.modes.Light/Dark` - Figma native import reads this
- **Typography fontSize:** Static primitive refs in JSON, clamp() overrides in `theme.css`
- **Shadow type:** Supported as array for multi-layer - primitives defined in `primitive.shadow.*`
- **Line-height:** Unitless numbers (CSS-optimal). Figma may need px - known limitation.

---

## Color System

### Primitives

<!-- auto:start:primitives-color -->
| Token | Value | Notes |
| --- | --- | --- |
| `primitive.color.neutral.50` | `#fafafa` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.100` | `#f5f5f5` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.200` | `#e5e5e5` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.300` | `#d4d4d4` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.400` | `#a3a3a3` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.500` | `#737373` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.600` | `#525252` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.700` | `#404040` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.800` | `#262626` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.850` | `#1a1a1a` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.900` | `#111111` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.950` | `#0a0a0a` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.white` | `#ffffff` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.neutral.black` | `#000000` | Specific value within the neutral range at a defined lightness step. |
| `primitive.color.blue.50` | `oklch(0.96 0.03 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.100` | `oklch(0.92 0.04 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.200` | `oklch(0.88 0.07 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.300` | `oklch(0.70 0.2903 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.400` | `oklch(0.65 0.2903 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.450` | `oklch(0.56 0.29 266.60)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.500` | `#1E2EFD` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.600` | `oklch(0.45 0.2903 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.700` | `oklch(0.44 0.2903 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.800` | `oklch(0.30 0.07 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.blue.900` | `oklch(0.22 0.05 266.54)` | Specific value within the blue range at a defined lightness step. |
| `primitive.color.red.50` | `#fef2f2` | Specific value within the red range at a defined lightness step. |
| `primitive.color.red.400` | `#f87171` | Specific value within the red range at a defined lightness step. |
| `primitive.color.red.700` | `#b91c1c` | Specific value within the red range at a defined lightness step. |
| `primitive.color.red.950` | `#450a0a` | Specific value within the red range at a defined lightness step. |
| `primitive.color.green.50` | `#ecfdf5` | Specific value within the green range at a defined lightness step. |
| `primitive.color.green.400` | `#34d399` | Specific value within the green range at a defined lightness step. |
| `primitive.color.green.700` | `#047857` | Specific value within the green range at a defined lightness step. |
| `primitive.color.green.950` | `#022c22` | Specific value within the green range at a defined lightness step. |
| `primitive.color.amber.50` | `#fffbeb` | Specific value within the amber range at a defined lightness step. |
| `primitive.color.amber.400` | `#fbbf24` | Specific value within the amber range at a defined lightness step. |
| `primitive.color.amber.800` | `#92400e` | Specific value within the amber range at a defined lightness step. |
| `primitive.color.amber.950` | `#451a03` | Specific value within the amber range at a defined lightness step. |
| `primitive.color.projectBrand.microsoftGameDev.100` | `#E5E5FC` | Light support tone for the Microsoft Game Dev project brand. |
| `primitive.color.projectBrand.microsoftGameDev.500` | `#6d31fb` | Primary accent tone for the Microsoft Game Dev project brand. |
| `primitive.color.projectBrand.microsoftGameDev.900` | `oklch(0.22 0.16 304)` | Dark support tone for the Microsoft Game Dev project brand. |
<!-- auto:end:primitives-color -->

### Semantic accent family (OKLCH)

<!-- auto:start:semantic-accent -->
| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `semantic.accent.rest` | `{primitive.color.blue.500}` | `{primitive.color.blue.500}` |  |
| `semantic.accent.hover` | `{primitive.color.blue.600}` | `{primitive.color.blue.450}` |  |
| `semantic.accent.pressed` | `{primitive.color.blue.700}` | `{primitive.color.blue.400}` |  |
| `semantic.accent.inactive` | `{primitive.color.blue.200}` | `{primitive.color.blue.200}` |  |
| `semantic.accent.disabled` | `{primitive.color.blue.100}` | `{primitive.color.blue.100}` |  |
| `semantic.accent.content` | `{primitive.color.blue.500}` | `{primitive.color.blue.300}` |  |
| `semantic.accent.contentHover` | `{primitive.color.blue.600}` | `{primitive.color.blue.200}` |  |
| `semantic.accent.subtle` | `{primitive.color.blue.50}` | `{primitive.color.blue.900}` |  |
<!-- auto:end:semantic-accent -->

These semantic states alias the original `primitive.color.blue.*` tones in OKLCH. The separate `primitive.color.accent.*` branch was removed, and the legacy `--hds-accent-*` helpers remain only as backward-compat bridges to the semantic layer above. <!-- token-path-ok: prose documents a historical removal -->


### Semantic colors (light -> dark)

<!-- auto:start:semantic-color -->
| Token | Light | Dark | Notes |
| --- | --- | --- | --- |
| `semantic.color.surface.page` | {primitive.color.neutral.white} | {primitive.color.neutral.black} | Main page background |
| `semantic.color.surface.raised` | {primitive.color.neutral.50} | {primitive.color.neutral.950} | Subtle elevated surface (cards, sections) |
| `semantic.color.surface.overlay` | {primitive.color.neutral.100} | {primitive.color.neutral.850} | Deeper surface layer |
| `semantic.color.surface.inverse` | {primitive.color.neutral.black} | {primitive.color.neutral.white} | Inverted background for contrast sections |
| `semantic.color.surface.accent` | {primitive.color.blue.500} | {primitive.color.blue.500} | Accent-colored background |
| `semantic.color.surface.accentSubtle` | {primitive.color.blue.50} | {primitive.color.blue.900} | Faint accent tint for hover states or highlights |
| `semantic.color.content.primary` | {primitive.color.neutral.900} | {primitive.color.neutral.100} |  |
| `semantic.color.content.secondary` | {primitive.color.neutral.600} | {primitive.color.neutral.400} |  |
| `semantic.color.content.disabled` | {primitive.color.neutral.300} | {primitive.color.neutral.600} |  |
| `semantic.color.content.inverse` | {primitive.color.neutral.100} | {primitive.color.neutral.900} |  |
| `semantic.color.content.accent` | {primitive.color.blue.500} | {primitive.color.blue.300} |  |
| `semantic.color.content.onAccent` | {primitive.color.neutral.white} | {primitive.color.neutral.white} |  |
| `semantic.color.border.default` | {primitive.color.neutral.200} | {primitive.color.neutral.700} |  |
| `semantic.color.border.subdued` | {primitive.color.neutral.200} | {primitive.color.neutral.800} |  |
| `semantic.color.border.subtle` | {primitive.color.neutral.100} | {primitive.color.neutral.850} | Lowest-contrast border for resting hairline edges on flat surfaces. |
| `semantic.color.border.strong` | {primitive.color.neutral.300} | {primitive.color.neutral.600} |  |
| `semantic.color.border.accent` | {primitive.color.blue.500} | {primitive.color.blue.500} |  |
| `semantic.color.feedback.error` | {primitive.color.red.700} | {primitive.color.red.400} |  |
| `semantic.color.feedback.success` | {primitive.color.green.700} | {primitive.color.green.400} |  |
| `semantic.color.feedback.warning` | {primitive.color.amber.800} | {primitive.color.amber.400} |  |
| `semantic.color.feedback.info` | {primitive.color.blue.500} | {primitive.color.blue.300} |  |
| `semantic.color.feedback.bg.error` | {primitive.color.red.50} | {primitive.color.red.950} |  |
| `semantic.color.feedback.bg.success` | {primitive.color.green.50} | {primitive.color.green.950} |  |
| `semantic.color.feedback.bg.warning` | {primitive.color.amber.50} | {primitive.color.amber.950} |  |
| `semantic.color.feedback.bg.info` | {primitive.color.blue.50} | {primitive.color.blue.900} |  |
<!-- auto:end:semantic-color -->

---
## Tertiary Fill Helpers

CSS helper vars such as hds.hover and hds.fill are implementation-only aliases for solid surface colors. They are not peer semantic tokens. Use solid semantic content, border, and background roles first; reach for the helpers only when a component needs a reusable surface alias.

---

## Typography

### Type ramp

<!-- auto:start:typography -->
| Style | Size (max) | Weight | Line Height | Letter Spacing | Description |
| --- | --- | --- | --- | --- | --- |
| `display` | 72px | 500 | 1 | -0.01em | Display headline. 72px / Clash Display 500 / leading-none. |
| `h1` | 48px | 500 | 1.25 | -0.01em | Primary section headings (h1). 48px / Clash Display medium 500 / leading-tight. |
| `h2` | 30px | 500 | 42px | -0.01em | Secondary section headings (h2). 30px / Clash Display medium 500 / line-height 42px (integer-pixel snap; was snug 1.375 ratio = 41.25px fractional, the source of upstream sub-pixel drift in main content). |
| `h3` | 20px | 500 | 28px | 0em | Component and card headers (h3). 20px / Clash Display medium 500 / leading-snug. |
| `body` | 17px | 500 | 28px | 0em | Body prose. 17px / Satoshi medium 500 / line-height 28px (was 1.625 ratio = 27.625px fractional → caused sub-pixel rendering at heavier weights) / measure capped at 60ch. |
| `ui` | 15px | 500 | 24px | 0em | never uppercase |
| `eyebrow` | 13px | 500 | 20px | 0.06em | never sentences, never inline within prose |
| `mono` | 13px | 400 | 20px | 0em | Monospace: code, token names, keyboard shortcuts. 13px / Geist Mono regular 400 / line-height 20px (integer-pixel snap; was 1.625 ratio = 21.125px fractional). Sits one ramp step below body to compensate for mono's optical heaviness. Stays at 400, exempt from the 500-only Satoshi/Clash rule. |
| `lineHeight.none` |  |  |  |  | Semantic alias for leading-none (1). Display text and badge spans. |

> Token JSON stores static max sizes. Responsive `clamp()` overrides live in `theme.css`.

### Primitive font sizes

- `primitive.typography.size.2xs` = **10px**
- `primitive.typography.size.xs` = **13px**
- `primitive.typography.size.sm` = **15px**
- `primitive.typography.size.base` = **17px**
- `primitive.typography.size.lg` = **20px**
- `primitive.typography.size.xl` = **24px**
- `primitive.typography.size.2xl` = **30px**
- `primitive.typography.size.3xl` = **36px**
- `primitive.typography.size.4xl` = **48px**
- `primitive.typography.size.5xl` = **80px**
- `primitive.typography.size.7xl` = **72px**
<!-- auto:end:typography -->

---

## Iconography

<!-- auto:start:iconography -->
| Attribute | Value | Notes |
| --- | --- | --- |
| Icon set | Lucide React | System standard for HDS interactive and editorial icons |
| Stroke width | Default 2 (override via `strokeWidth` prop) | Lucide icons use stroke-width instead of fill-weight variants |
| Small size | 16px | Paired with 14px label text |
| Medium size | 20px | Paired with 16px body or control text |
| Large size | 24px | Paired with 20px+ display or emphasis text |
| Optical alignment | Centered flex placement | Slight vertical nudge only when needed for cap-height balance |
| Label pairing | `semantic.typography.small`, `semantic.typography.mono`, and `semantic.typography.caption` | Descriptive labels, technical labels, and compact supporting text each keep a distinct visual lane |
<!-- auto:end:iconography -->

---

## Spacing

4px base unit scale. All tokens in `primitive.space.*`.

<!-- auto:start:spacing -->
| Token | Value | Notes |
| --- | --- | --- |
| `primitive.space.0` | `0px` |  |
| `primitive.space.1` | `4px` |  |
| `primitive.space.2` | `8px` |  |
| `primitive.space.3` | `12px` |  |
| `primitive.space.4` | `16px` |  |
| `primitive.space.5` | `20px` |  |
| `primitive.space.6` | `24px` |  |
| `primitive.space.7` | `28px` |  |
| `primitive.space.8` | `32px` |  |
| `primitive.space.10` | `40px` |  |
| `primitive.space.12` | `48px` |  |
| `primitive.space.16` | `64px` |  |
| `primitive.space.20` | `80px` |  |
| `primitive.space.24` | `96px` |  |
| `primitive.space.32` | `128px` |  |
| `primitive.space.px1` | `1px` |  |
| `primitive.space.px2` | `2px` |  |
| `primitive.space.px6` | `6px` |  |
| `primitive.space.px10` | `10px` |  |
<!-- auto:end:spacing -->

## Semantic Space

Semantic spacing aliases group primitive increments by usage context. The audit checks component and docs surfaces against these tiers first.

<!-- auto:start:semantic-space -->
| Token | Value | Notes |
| --- | --- | --- |
| `semantic.space.subgrid.hairline` | `1px` | 1px border offset and hairline spacing. |
| `semantic.space.subgrid.xs` | `2px` | 2px vertical rhythm nudge and baseline adjustment. |
| `semantic.space.subgrid.gap` | `4px` | 4px cap-height and inline cluster spacing. |
| `semantic.space.component.gap` | `8px` | 8px label↔input rhythm and closely coupled control spacing. |
| `semantic.space.component.medium` | `12px` | 12px adjacent form fields and medium intra-component gaps. |
| `semantic.space.component.padding` | `24px` | 24px default inset for cards, forms, panels, and grouped surfaces. |
| `semantic.space.layout.tight` | `16px` | 16px default HdsStack gap and inter-component spacing. |
| `semantic.space.layout.normal` | `24px` | 24px column gutters and sidebar gutter spacing. |
| `semantic.space.layout.gutter` | `24px` | 24px column and region gutters (alias for layout.normal). |
| `semantic.space.layout.inset` | `32px` | 32px major block separation and inset inter-component gaps. |
| `semantic.space.layout.spacious` | `48px` | 48px section break and whitespace separator between major content blocks. |
| `semantic.space.section.stack` | `80px` | 80px vertical rhythm between page sections and major editorial blocks. |
| `semantic.space.section.inset` | `96px` | 96px hero and landing-page inset padding. |
| `semantic.space.section.heroMax` | `128px` | 128px maximum hero region padding for extra-large displays. |
| `semantic.space.sidebar.indent` | `12px` | 12px indent level for nested sidebar and TOC groups. |
| `semantic.space.sidebar.gap` | `16px` | 16px vertical spacing between items in sidebar and TOC stacks. |
| `semantic.space.sidebar.sectionGap` | `12px` | 12px spacing between sidebar sections and grouped rail blocks. |
| `semantic.space.sidebar.railPadding` | `20px` | 20px outer padding for sidebar and TOC rails. |
<!-- auto:end:semantic-space -->

## Filter

| Token | Value | Use |
| --- | --- | --- |
| `primitive.blur.8` | `8px` | Compact frosted blur for slot badges and small overlay labels. |
| `primitive.blur.16` | `16px` | Fullscreen backdrop blur for portfolio lightboxes. |
| `component.lightbox.backdrop.blur` | `16px` | Shared blur strength for fullscreen portfolio image overlays. |

<!-- auto:start:size -->
| Token | Value | Notes |
| --- | --- | --- |
| `primitive.size.8` | `8px` | 8px size step. |
| `primitive.size.10` | `10px` | 10px size step. |
| `primitive.size.12` | `12px` | 12px size step. |
| `primitive.size.16` | `16px` | 16px size step. |
| `primitive.size.20` | `20px` | 20px size step. |
| `primitive.size.24` | `24px` | 24px size step. |
| `primitive.size.32` | `32px` | 32px size step. |
| `primitive.size.40` | `40px` | 40px size step. |
| `primitive.size.48` | `48px` | 48px size step. |
| `primitive.size.64` | `64px` | 64px size step. |
| `primitive.size.80` | `80px` | 80px size step. |
| `primitive.size.96` | `96px` | 96px size step. |
| `primitive.size.interactive.min` | `44px` | Compact touch target / hit-area width |

Use `primitive.size.*` for explicit widths and heights. Keep `primitive.space.*` for layout rhythm, padding, and gaps.

### Primitive width measures

| Token | Value | Notes |
| --- | --- | --- |
| `primitive.size.width.96` | `96px` | 96px width step. |
| `primitive.size.width.760` | `760px` |  |
| `primitive.size.width.1200` | `1200px` |  |
| `primitive.size.width.50ch` | `50ch` |  |
<!-- auto:end:size -->

### Density scale

Comfortable (default) vs compact - toggled via `data-density` attribute or `useTheme().setDensity()`.

<!-- auto:start:density -->
| CSS var | Comfortable | Compact | Use |
| --- | --- | --- | --- |
| `--hds-space-xs` | 4px | 2px | Icon padding, micro nudges |
| `--hds-space-sm` | 8px | 6px | Row gaps, label spacing |
| `--hds-space-md` | 16px | 12px | Standard component padding |
| `--hds-space-lg` | 24px | 20px | Card padding, form gaps |
| `--hds-space-xl` | 32px | 24px | Between card groups |
| `--hds-space-2xl` | 48px | 40px | Between page sections |
| `--hds-space-3xl` | 64px | 48px | Major layout divisions |
| `--hds-space-4xl` | 80px | 64px | Hero / page breathing |

Toggle: `document.documentElement.dataset.density = 'compact'`
Or via `useTheme().setDensity('compact')`
<!-- auto:end:density -->

---

## Border Radius

<!-- auto:start:radius -->
| Token | Value | Rule |
| --- | --- | --- |
| `primitive.radius.0` | `0px` |  |
| `primitive.radius.2` | `2px` |  |
| `primitive.radius.4` | `4px` |  |
| `primitive.radius.8` | `8px` |  |
| `primitive.radius.12` | `12px` |  |
| `primitive.radius.full` | `9999px` | Pills only |
<!-- auto:end:radius -->

---

## Motion

<!-- auto:start:motion -->
### Primitive motion base

| Token | Value | Use |
| --- | --- | --- |
| `primitive.duration.instant` | `100ms` | Immediate state changes and rapid dismissals |
| `primitive.duration.short` | `150ms` | Productive micro-interactions |
| `primitive.duration.medium` | `250ms` | Expressive entrances and teaching moments |
| `primitive.duration.long` | `400ms` | Spatial movement and page travel |
| `primitive.easing.emphasized` | `cubic-bezier(0.4, 0, 0.2, 1)` | Cubic bezier with balanced input and output tangents. |
| `primitive.easing.decelerate` | `cubic-bezier(0, 0, 0.2, 1)` | Cubic bezier with steep initial gain and constrained tail velocity. |
| `primitive.easing.accelerate` | `cubic-bezier(0.4, 0, 1, 1)` | Cubic bezier with restrained initial gain and steep terminal velocity. |
| `primitive.easing.elastic` | `spring(300, 20, 1)` | Spring response defined by stiffness, damping, and mass parameters. |

### Semantic motion intents

| Token | Duration | Easing | Purpose |
| --- | --- | --- | --- |
| `semantic.motion.productive` | `150ms` | `{primitive.easing.decelerate}` | For micro-interactions and status changes. No deformation. |
| `semantic.motion.expressive` | `250ms` | `{primitive.easing.elastic}` | For teaching moments and significant UI entries. Includes physics-based squish. |
| `semantic.motion.spatial` | `400ms` | `{primitive.easing.emphasized}` | For elements traveling long distances across the viewport. |
| `semantic.motion.exit` | `100ms` | `{primitive.easing.accelerate}` | For elements being removed from the DOM. |
<!-- auto:end:motion -->

---

## Layer

<!-- auto:start:layer -->
| Token | Value | Use |
| --- | --- | --- |
| `primitive.zIndex.0` | `0` | Base stacking layer for in-flow content |
| `primitive.zIndex.10` | `10` | Focused controls and active lifted surfaces |
| `primitive.zIndex.100` | `100` | Dropdowns, popovers, and floating panels |
| `primitive.zIndex.1000` | `1000` | Global modals and blocking overlays |
<!-- auto:end:layer -->

---

## Component Tokens (Quick Reference)

| Component | Key tokens |
|---|---|
| Button | `component.button.*` surface tokens, action radius for interactive corners, `min-width` 80, `padding-x/y` 16x12, `font-size` 14, `font-weight` 500, centered short labels, disabled primary text via `component.button.primary.textDisabled` -> Light `{semantic.color.content.onAccent}` / Dark `{semantic.color.content.disabled}` |
| Badge | `component.badge.bg` -> brand, `component.badge.radius` -> `4px` rounded corner, `height/min-width` 20 |
| Tag | `component.tag.*` pill tokens, `padding-x/y` 12x8, `min-width` 48, `min-height` 24, transparent `primitive.size.interactive.min` hit target |
| Nav | `component.nav.paddingX` / `component.nav.paddingY` (24px / 12px), `color.brand` active indicator |
| Lightbox | `component.lightbox.backdrop.blur` -> `primitive.blur.16` for fullscreen media overlays |
| Container | `semantic.layout.container.maxWidth` -> `primitive.size.width.1200` (1200px) |

### Definition of Done

For every new component or token surface:

- [ ] Primitives defined in JSON
- [ ] Semantic aliases mapped in JSON
- [ ] Component tokens exported to JSON, with no bridge-only variables
- [ ] Forbidden overrides audited to zero, or explicitly justified with `audit-ok`

### Forbidden Overrides

Hardcoded visual overrides are a build-time failure when a token exists for the same decision.

Audit these properties first:

- Typography: `text-transform`, `letter-spacing`, `line-height`, `font-weight`, `font-family`, `font-size`
- Color: raw hex / rgb / hsl / OKLCH literals on color, border, fill, stroke, and related paint properties
- Spacing / measure: `margin`, `padding`, `gap`, `inset`, `width`, `height`, `max-width`, `min-width`, `max-height`, `min-height`
- Structure: `box-shadow`, `border-radius`, `z-index`
- Motion: `transition-duration`, `transition-timing-function`, `animation-duration`, `animation-timing-function`

Use tokenized values when a suitable primitive, semantic, or component token exists. Allow explicit exceptions only when documented with `audit-ok`.

### Layout aliases

Primitive layout dimensions live in `primitive.breakpoint.*`, `primitive.size.*`, `primitive.size.width.*`, and `primitive.grid.columns.*`.
Semantic layout tokens exist for layout decisions only: readable content widths, section rhythm, gutters, and grid spacing.

| Token | Resolves to | Use |
|---|---|---|
| `semantic.layout.content.maxWidth` | `primitive.size.width.760` (760px) | Broader readable content width for long-form docs and case studies |
| `semantic.layout.prose.maxWidth` | `primitive.size.width.50ch` (50ch) | Canonical prose measure for body copy and narrative text |
| `semantic.layout.section.paddingY` | `primitive.space.20` (80px) | Airier top-level page section spacing |
| `semantic.layout.grid.gap` | `primitive.space.8` (32px) | Two-up and three-up editorial grid spacing |
| `semantic.space.layout.tight` | `primitive.space.4` (16px) | Compact rhythm for dense lists and tight pairings |
| `semantic.space.layout.normal` | `primitive.space.6` (24px) | Default vertical rhythm between layout blocks and grids |
| `semantic.space.layout.gutter` | `primitive.space.6` (24px) | Horizontal gutter for full-width page sections; density-aware `--hds-space-*` vars handle responsive scaling |
| `semantic.space.layout.inset` | `primitive.space.8` (32px) | Block inset padding inside layout containers |
| `semantic.space.layout.spacious` | `primitive.space.12` (48px) | Generous rhythm for hero sections and split layouts |
| `semantic.space.section.stack` | `primitive.space.20` (80px) | Vertical stack between top-level page sections |
| `semantic.space.section.inset` | `primitive.space.24` (96px) | Outer section padding for overview headers and chrome blocks |
| `semantic.space.section.heroMax` | `primitive.space.32` (128px) | Maximum hero section padding |

---

## Agent Creative Boundaries (Hard Constraints)

<!-- auto:start:agent-constraints -->
- **One accent color:** `#1E2EFD` only — no other hues
- **Body / UI typeface:** Satoshi — pair with Clash Display for headings only and Geist Mono for code; no other faces
- **Action radius:** `4px` for interactive controls; `8px` cards
- **4px spacing grid:** All spacing snaps to `primitive.space.*` scale
- **True monochromatic neutrals:** No warm/cool tint in neutral scale
- **No drop shadows as primary depth mechanism:** Use motion (parallax, scale)
- **Generous whitespace:** The system breathes
<!-- auto:end:agent-constraints -->

---

## Figma Sync Protocol

- Source of truth: `hirobius.tokens.json` (code-first)
- Figma import: Variables panel -> Import -> `hirobius.tokens.json`
- Mode detection: `com.figma.variables.modes.Light/Dark` in `$extensions`
- Known Figma limitations: typography composite and shadow types not fully supported in native import
- Pending: round-trip import test to validate mode mapping

---

*Mirror of `hirobius.tokens.json`. Update this file in the same commit as any token change.*
