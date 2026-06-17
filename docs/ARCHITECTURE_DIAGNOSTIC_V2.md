# Architecture Diagnostic V2

**Generated:** 2026-04-24  
**Scope:** `src/app/components/`, `src/styles/theme.css`, `src/styles/tokens.generated.css`  
**Purpose:** Pre-scale audit before Figma two-way sync and HDS V2 production hardening.  
**Status: READ-ONLY — no fixes applied.**

---

## Section 1 — Hidden UI State Audit

Panels, modals, drawers, overlays, and sketch control surfaces scanned for legacy `div className="..."` wrappers.

### 1.1 Modal / Portal Surfaces

| Component | Type | Verdict |
|---|---|---|
| `ImageLightbox.tsx` | Full-page modal (portal to `document.body`) | **COMPLIANT** |
| `Tooltip.tsx` | Cursor-tracking overlay (portal) + centered overlay | **COMPLIANT** |

**ImageLightbox** uses `createPortal` → `AnimatePresence` → `motion.div[role="dialog"][aria-modal="true"][tabIndex=-1]`. Content wrapped in `HdsSurface`. No bare `div className` wrappers.

**Tooltip** uses `createPortal` for cursor mode with `position: fixed`. The inner `div` is a pure positioning shell (`pointerEvents: none`), not a content surface — correct pattern.

### 1.2 Dropdown / Flyout Panels

| Component | Type | Verdict |
|---|---|---|
| `HdsSelect` (in `Controls.tsx`) | Animated dropdown listbox | **MOSTLY COMPLIANT — minor debt** |
| `Disclosure.tsx` | Expandable accordion (3 variants) | **COMPLIANT** |

**HdsSelect dropdown** renders `background` using the JS path `hds.color.surface.raised.dark/light` instead of the CSS variable `var(--semantic-color-surface-raised)`. This bypasses the token CSS layer — if the semantic token value changes in a future token release, the JS path will not pick it up until the component re-renders. The backdrop uses inline token reference correctly everywhere else.

**Disclosure (nav variant)** renders a raw `div` wrapper with `display: grid; gap: containerGap`. This is appropriate minimal layout — not a surface concern.

### 1.3 Fixed / Shell Overlays

| Component | Type | Verdict |
|---|---|---|
| `MobiusShellLayer.tsx` | `position: fixed; inset: 0` shell host | **COMPLIANT** |
| `ControlsPanel.tsx` | Sidebar panel (tooling surface) | **COMPLIANT** |

**MobiusShellLayer** is a non-interactive (`pointerEvents: none`, `aria-hidden="true"`) host for the canvas. No content surface; raw `div` is correct.

**ControlsPanel** uses `HdsSurface` as its content wrapper. The outer `<aside>` carries positioning/sizing only — correct split of concerns.

### 1.4 SketchControls (Intentionally Exempt)

`SketchControls.tsx` contains `SketchButton`, `SketchTextarea`, `SketchPanelToggle`, and `SketchRange`. These are labeled `@doc-exempt` and `// ref-ok: internal sketchbook controls are not consumer-facing form primitives`. All use raw HTML elements internally. This is intentional — sketchbook lab surfaces are excluded from HDS component guardrails.

### 1.5 Summary

**No legacy `div className="..."` wrappers found in any consumer-facing panel, modal, or overlay.** The one remediation item is the JS color path in `HdsSelect`'s dropdown background.

---

## Section 2 — Polymorphism & Type Integrity

### 2.1 `React.forwardRef` Coverage

Components where external code may hold a ref to the DOM node (inputs, buttons, focusable containers) are audited.

#### ✅ forwardRef Present

| Component | Ref Type | Notes |
|---|---|---|
| `HdsButton.tsx` | `HTMLButtonElement \| HTMLAnchorElement` | Union ref via `asChild` path |
| `HdsSurface.tsx` | `HTMLDivElement` | Forwarded through `as` tag |
| `Stack.tsx` | `HTMLDivElement` | Forwarded through `as` tag |
| `Grid.tsx` (outer + item) | `HTMLDivElement` | Both `GridInner` and `GridItem` |
| `TextLockup.tsx` | `HTMLElement` | |
| `HeadingStack.tsx` | `HTMLElement` | `as` prop + `headingAs` override |
| `Input.tsx` | `HTMLInputElement` | Manual dual-ref assignment for clear button |
| `IconButton.tsx` | `HTMLButtonElement` | Delegates to `HdsButton` |
| `HdsButtonGroup.tsx` | `HTMLDivElement` | |
| `SegmentedControl.tsx` | `HTMLDivElement` | Rail wrapper |
| `HdsSlider` (Controls) | `HTMLInputElement` | |
| `HdsToggle` (Controls) | `HTMLInputElement` | |
| `HdsRadio` (Controls) | `HTMLInputElement` | |
| `HdsSelect` (Controls) | `HTMLButtonElement` | Ref to trigger button, not dropdown container |

#### ⚠️ forwardRef Missing — Action Required

| Component | Exposed Element | Priority | Reason |
|---|---|---|---|
| `Tag.tsx` | `<button>` | **HIGH** | Interactive filter chip. External focus management (e.g., roving tabindex in tag groups) requires a ref to the button node. |
| `Card.tsx` | `<div>` | **MEDIUM** | Generic surface container. Used as intersection observer targets in portfolio pages. |
| `Alert.tsx` | `motion.div[role="alert"]` | **MEDIUM** | Screen reader live region — assistive technology tooling may need to programmatically focus after mount. |
| `Disclosure.tsx` | `<button>` (trigger) | **MEDIUM** | Disclosure trigger is interactive. External accordions and keyboard navigation need to drive focus. |
| `Badge.tsx` | `<span>` | **LOW** | Display-only. Lower urgency but Radix composition patterns expect all primitives to be ref-capable. |
| `Divider.tsx` | (unknown) | **LOW** | Not yet audited; check before Figma sync. |
| `InlineLink.tsx` | (unknown) | **MEDIUM** | Link element; anchor refs are expected by router libraries for scroll restoration. |
| `CinematicLink.tsx` | (unknown) | **MEDIUM** | Animated link; likely wraps `<a>`. Should expose the anchor node. |

### 2.2 Polymorphism (`as` / `asChild`) Coverage

The HDS system uses two distinct polymorphism patterns:

**`as?: React.ElementType`** — swaps the root element type while preserving internal styles. Used on layout primitives.

**`asChild?: boolean`** — Radix-style clone pattern. Passes all button chrome to the single child element. Currently exclusive to `HdsButton`.

| Component | Has `as` | Has `asChild` | Notes |
|---|---|---|---|
| `HdsButton.tsx` | ✗ | ✅ | Fully correct — `asChild` is the right pattern for link/button slot polymorphism |
| `HdsSurface.tsx` | ✅ | ✗ | `as` prop, `forwardRef`, defaults to `'div'` |
| `Stack.tsx` | ✅ | ✗ | `as` prop |
| `Grid.tsx` (both) | ✅ | ✗ | `as` prop on both outer and item |
| `HeadingStack.tsx` | ✅ | ✗ | Has `as`, `headingAs`, and `subheadingAs` — most complete semantic override surface |
| `Disclosure.tsx` | ✗ | ✗ | Neither. Root is variant-conditional (`HdsSurface` or raw `div`). |
| `Alert.tsx` | ✗ | ✗ | Root is `motion.div`. Candidates: allow `as="section"` for landmark semantics. |
| `Badge.tsx` | ✗ | ✗ | Fixed `<span>`. Low urgency. |
| `Card.tsx` | ✗ | ✗ | Fixed `<div>`. Candidates: `as="article"`, `as="section"` for semantic parity. |
| `Tag.tsx` | ✗ | ✗ | Fixed `<button>`. No polymorphism needed — always a button. |

### 2.3 `any` / Loose Typing Flags

No raw `any` types were found in the component source files. However, three patterns warrant attention:

**Runtime type-cast chain** (low-risk but fragile):  
`Card.tsx:37` and `Stack.tsx:76` both use:  
```ts
(hds.space as Record<string, unknown>)[gap] as string
```
This silently returns `undefined` if `gap` is not in the space map, which then gets passed to CSS `gap`. The `as string` assertion hides the failure. A guard (`?? gap`) is already present in `Stack` but both should validate the key exists.

**Untyped gap in HdsButtonGroup**:  
`HdsButtonGroup.tsx:14` — `gap?: string` accepts any arbitrary string value rather than a token union. This is the only component where a layout property escapes the tokenized type system.

**`isDark` passed to `SelectOption` but immediately voided**:  
`Controls.tsx:623` — `void isDark;` inside `SelectOption` — the prop is passed, computed, and then explicitly discarded. The intended use (conditional background) was replaced by a semantic token but the prop signature was not cleaned up.

---

## Section 3 — Token Shadow Mapping

### 3.1 Orphaned CSS Variables in `theme.css`

Variables declared in `theme.css` that have **no corresponding definition** in `tokens.generated.css` (i.e., they resolve to `undefined` / browser fallback):

| Variable | Location | Problem |
|---|---|---|
| `--hds-space-px3` | `theme.css:374` (`.hds-token-chip`) | **UNDEFINED.** The primitive space scale skips from `px2` (2px) to `px6` (6px). No `--primitive-space-px3` exists. The token chip padding silently collapses to 0. |
| `--semantic-typography-displayXl-fontSize` | `theme.css:24` | **DEAD OVERRIDE.** `displayXl` is listed as deprecated in `system.manifest.json`. No `--semantic-typography-displayXl-*` vars exist in `tokens.generated.css`. |
| `--semantic-typography-display2-fontSize` | `theme.css:26` | **DEAD OVERRIDE.** `display2` is deprecated. Same issue. |
| `--typography-mono-xs` | `theme.css:56` | **DEAD COMPOSITE.** References `--semantic-typography-monoXs-*` which do not exist (deprecated). Renders as empty string. |
| `--typography-mono-sm` | `theme.css:57` | **DEAD COMPOSITE.** Same as above with `monoSm`. |

### 3.2 CSS Variables With Hardcoded Values (No Token Backing)

These variables are defined in `theme.css` with raw hex/pixel values rather than referencing the W3C DTCG token graph. They create a parallel value system that can drift from the canonical token source.

| Variable | Value | Location | Verdict |
|---|---|---|---|
| `--hds-surface-page` | `#F2F3F7` / `#111318` | theme.css:145, 226 | **DUPLICATE.** Shadows `--semantic-color-surface-page`. Two sources of truth. |
| `--hds-surface-raised` | `#E8E9F0` / `#17192A` | theme.css:146, 227 | **DUPLICATE.** Shadows `--semantic-color-surface-raised`. |
| `--hds-surface-overlay` | `#DCDEE7` / `#1D2030` | theme.css:147, 228 | **DUPLICATE.** Shadows `--semantic-color-surface-overlay`. |
| `--hds-feedback-neutral` | `#64748b` / `#94a3b8` | theme.css:185, 238 | **ORPHANED.** No semantic feedback-neutral token exists. Hardcoded Tailwind slate-500/400. |
| `--hds-price-default` | `rgba(0,0,0,0.88)` | theme.css:200 | **ORPHANED.** E-commerce local var, no token backing. |
| `--hds-price-sale` | `#dc2626` | theme.css:201 | **ORPHANED.** Hardcoded Tailwind red-600. |
| `--hds-price-original` | `#64748b` | theme.css:202 | **ORPHANED.** Hardcoded Tailwind slate-500. |
| `--hds-badge-new` | `#1C44FC` | theme.css:203 | **ORPHANED.** Near-brand blue, not a token alias. |
| `--hds-badge-sale` | `#dc2626` | theme.css:204 | **ORPHANED.** Same red-600 as price-sale — should share a token. |
| `--hds-badge-sold-out` | `#8A94AA` / `#3C4258` | theme.css:205, 248 | **ORPHANED.** Light/dark hardcoded pair. |
| `--hds-badge-featured` | `#d97706` | theme.css:206 | **ORPHANED.** Tailwind amber-600. |
| `--hds-radius-circle` | `50%` | theme.css:79 | **NO TOKEN BACKING.** A percentage value; the primitive radius scale uses `px` steps plus `--primitive-radius-full: 9999px`. This percentage is a valid layout value but has no token alias. |
| `--hds-font-size-xs` to `--hds-font-size-xl` | `11px – 28px` | theme.css:61-64 | **PARALLEL SCALE.** These values (11, 13, 16, 20, 28px) overlap but do not match the primitive typography scale (10, 13, 15, 17, 20, 24, 30, 36, 48, 80px). Shadow aliases with different values risk drift. |

### 3.3 Hardcoded Values in Component Source Files

Instances where components bypass CSS variables and write raw pixel or color values directly into `style` props:

| Location | Value | Pattern | Risk |
|---|---|---|---|
| `HdsSurface.tsx:32-34` | `'16px'`, `'24px'`, `'0px'` | `paddingMap` entries | **LOW.** These are named map entries that mirror primitive scale steps. Acceptable until semantic component padding tokens cover all tiers. |
| `Card.tsx:22-26` | `'16px'`, `'24px'` | Same `paddingMap` pattern | **LOW.** Same rationale as above. |
| `SegmentedControl.tsx:84` | `'4px'` | `railPadding ?? '4px'` | **MEDIUM.** Hardcoded subgrid value as fallback. Should be `hds.space.px4` or `hds.semantic.space.subgrid.xs`. |
| `Controls.tsx (HdsSelect):567-570` | `hds.color.surface.raised.dark/light` | JS color path, not CSS var | **HIGH.** Bypasses CSS variable cascade. Use `var(--semantic-color-surface-raised)` instead. |

### 3.4 `Surface.tsx` — Legacy Duplicate (Shadow Token Bug)

`src/app/components/Surface.tsx` is a narrowed duplicate of `HdsSurface.tsx` (no `as` prop, no `forwardRef`, limited padding union). It contains one critical error:

```ts
boxShadow: 'var(--semantic-shadow-card)'  // Line 47
```

**`--semantic-shadow-card` does not exist.** The correct var is `--hds-shadow-card`. This shadow is silently dropped. `Surface.tsx` should be retired and all callsites migrated to `HdsSurface`.

### 3.5 HeadingStack — Typography Variable Naming Inconsistency

`HeadingStack.tsx` references CSS vars with the pattern `--semantic-typography-{level}-font-size` (hyphenated). These **do exist** in `tokens.generated.css` with this naming convention. However, the component references `lineHeight: 1.25` as a raw number rather than a token reference — a minor hardcoded value that should be `var(--primitive-typography-lineHeight-tight)`.

---

## Severity Summary

| Priority | Issue | File |
|---|---|---|
| 🔴 HIGH | `--hds-space-px3` undefined — token chip padding silently broken | `theme.css:374` |
| 🔴 HIGH | `HdsSelect` dropdown uses JS color path, not CSS var | `Controls.tsx:567` |
| 🔴 HIGH | `Surface.tsx` shadow var `--semantic-shadow-card` does not exist | `Surface.tsx:47` |
| 🟠 MEDIUM | 5 dead/orphaned composite vars (`displayXl`, `display2`, `monoXs`, `monoSm`) | `theme.css:24-57` |
| 🟠 MEDIUM | `Tag`, `Disclosure`, `Alert`, `Card` missing `forwardRef` | Multiple |
| 🟠 MEDIUM | Hardcoded `'4px'` fallback in SegmentedControl rail | `SegmentedControl.tsx:84` |
| 🟠 MEDIUM | `InlineLink`, `CinematicLink` not audited for forwardRef | Not yet scanned |
| 🟡 LOW | E-commerce / badge vars with hardcoded hex — no token backing | `theme.css:200-206` |
| 🟡 LOW | `--hds-surface-*` vars duplicating `--semantic-color-surface-*` | `theme.css:145-147` |
| 🟡 LOW | `HdsButtonGroup` gap prop accepts `string` instead of token union | `HdsButtonGroup.tsx:14` |
| 🟡 LOW | Voided `isDark` prop in `SelectOption` (dead prop, not cleaned up) | `Controls.tsx:623` |
| 🟡 LOW | `Surface.tsx` not retired — API shadow of `HdsSurface` without forwardRef | `Surface.tsx` |
| 🟢 INFO | `Card`, `HdsSurface` padding maps use raw `'16px'`/`'24px'` strings | `Card.tsx`, `HdsSurface.tsx` |
| 🟢 INFO | `HeadingStack` lineHeight `1.25` hardcoded — should ref `lineHeight-tight` | `HeadingStack.tsx:47-56` |
