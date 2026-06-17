<!-- GENERATED FILE — DO NOT EDIT. Source: DESIGN.source.md. Regenerate with `pnpm tokens`. -->

# DESIGN.md

A machine- and human-readable specification of the Hirobius Design System for AI agents, design tools, and humans generating or reviewing UI. Values are sourced from `hirobius.tokens.json`; narrative rules are hand-authored. For the full tokens reference see `DESIGN-HANDOFF.md`.

## Overview

Hirobius is a clean, systems-first visual language that bridges digital precision and physical fabrication through a high-contrast monochromatic palette and a single electric-blue accent. Its personality is disciplined, tactile, and quietly technical: structure is explicit, motion is purposeful, and visual noise is stripped away. Whitespace is treated as material, not leftover space, so every screen should feel deliberate, breathable, and exact.

## Colors

<!-- auto:start:colors -->
**One accent — one neutral system.**

- **Primary** (`#1E2EFD`): CTAs, active states, selected focus rings, and the single brand accent. `primitive.color.blue.500` / `semantic.accent.rest`.
- **Neutral**: backgrounds, surfaces, borders, text. True monochromatic — `primitive.color.neutral.50` through `950`. Use `semantic.color.surface.*`, `semantic.color.content.*`, `semantic.color.border.*`; never reach directly for primitives in components.
- **Feedback — Error** (`#B91C1C`): destructive confirms, error banners, validation failures. `semantic.color.feedback.error`.
- **Feedback — Success** (`#047857`): positive confirmations, completed states. `semantic.color.feedback.success`.
- **Feedback — Warning** (`#92400E`): cautions, recoverable issues. `semantic.color.feedback.warning`.
- **Feedback — Info** (`#1E2EFD`): neutral announcements and inline guidance. `semantic.color.feedback.info`.

Feedback hues are never decorative; do not use them as accents. Light and dark mode values are defined per-token in `hirobius.tokens.json`.
<!-- auto:end:colors -->

## Typography

<!-- auto:start:typography -->
HDS ships three typefaces — each with a distinct and exclusive role:

- **Display / Heading font**: Clash Display. Bound exclusively to `display`, `h1`, `h2`, and `h3` styles. Never used for body copy or UI labels.
- **Body / UI font**: Satoshi. All prose, labels, small text, captions, and UI copy.
- **Mono font**: Geist Mono. Reserved for tokens, code, technical callouts, and metric readouts.

Weights in use: `400` regular, `500` medium, `600` semibold, `700` bold. All heading styles (display · h1 · h2 · h3) use `500` medium. Body, small, and caption use `400` regular.

### Type ramp

| Role | Size (desktop max) | Weight | Use |
| --- | --- | --- | --- |
| `semantic.typography.display` | 72px | 500 | Display headline |
| `semantic.typography.h1` | 48px | 500 | Primary section headings (h1) |
| `semantic.typography.h2` | 30px | 500 | Secondary section headings (h2) |
| `semantic.typography.h3` | 20px | 500 | Component and card headers (h3) |
| `semantic.typography.body` | 17px | 500 | Body prose |
| `semantic.typography.ui` | 15px | 500 | UI text for nav, labels, captions |
| `semantic.typography.eyebrow` | 13px | 500 | Eyebrow / kicker label |
| `semantic.typography.mono` | 13px | 400 | Monospace for code, token names, shortcuts |
| `semantic.typography.lineHeight.none` |  |  | Semantic alias for leading-none (1) |

> Responsive `clamp()` overrides live in `src/styles/theme.css`; tokens store the desktop-max static value.
<!-- auto:end:typography -->

## Spacing

<!-- auto:start:spacing -->
**Base unit: 4px.** All spacing snaps to the primitive scale; never introduce half-steps or arbitrary px values.

Scale: `0px` (`primitive.space.0`) · `1px` (`primitive.space.px1`) · `2px` (`primitive.space.px2`) · `4px` (`primitive.space.1`) · `6px` (`primitive.space.px6`) · `8px` (`primitive.space.2`) · `10px` (`primitive.space.px10`) · `12px` (`primitive.space.3`) · `16px` (`primitive.space.4`) · `20px` (`primitive.space.5`) · `24px` (`primitive.space.6`) · `28px` (`primitive.space.7`) · `32px` (`primitive.space.8`) · `40px` (`primitive.space.10`) · `48px` (`primitive.space.12`) · `64px` (`primitive.space.16`) · `80px` (`primitive.space.20`) · `96px` (`primitive.space.24`) · `128px` (`primitive.space.32`)

Use `primitive.space.*` for layout rhythm, padding, and gaps. Use `semantic.space.*` aliases (e.g. `semantic.space.component-padding`) when the purpose is established. `--hds-space-{xs…4xl}` CSS vars provide comfortable/compact density scaling per `document.documentElement.dataset.density`.
<!-- auto:end:spacing -->

## Corner-Radius Policy

Interactive controls use a restrained `4px` radius via the action radius token, containers trend to `8px` as the current system default, and `full` radius is reserved for pills or circular forms; `0px` should only appear on intentional outer canvas or substrate boundaries, not on everyday UI controls.

<!-- auto:start:radius -->
| Tier | Value | Token | Applies to |
| --- | --- | --- | --- |
| Action | `12px` | `semantic.radius.action` | Buttons, inputs, badges, alerts, disclosures, segmented control items |
| Container | `8px` | `primitive.radius.8` | Cards, segmented control surface, modal/sheet containers |
| Full | `9999px` | `primitive.radius.full` | Pills, avatars, indicator dots, any intentionally circular form |
| Zero | `0px` | `primitive.radius.0` | Outer canvas / substrate boundaries only — never on everyday UI controls |
<!-- auto:end:radius -->

## Elevation

Depth is communicated through 4 elevation roles bundled by `semantic.elevation.*`. Each role bundles a surface, shadow, and border so primitives can't mismatch them.

### Elevation roles

| Surface | Role token | Background | Shadow | Border |
| --- | --- | --- | --- | --- |
| Card / panel resting | `semantic.elevation.flat` | `surface.page` | none | `border.subtle` 1px |
| Card / panel lifted (interactive only) | `semantic.elevation.raised` | `surface.raised` | `shadow.subtle` | none |
| Popover / dropdown / tooltip | `semantic.elevation.floating` | `surface.raised` | `shadow.floating` | none |
| Dialog / sheet / modal | `semantic.elevation.overlay` | `surface.overlay` | `shadow.overlay` | none |

Cards default to `flat`. They lift to `raised` only on interactive hover or when explicitly elevated above siblings. Never combine `raised` with a border — depth is one mechanism (border OR shadow), not both stacked.

## Motion

<!-- auto:start:motion -->
Motion (lift on hover, parallax) is the interaction-affordance layer; static depth comes from the `semantic.elevation.*` role-token bundles.

### Duration tiers

| Tier | Value | When to use |
| --- | --- | --- |
| `primitive.duration.instant` | `100ms` | Immediate dismissals, binary toggles |
| `primitive.duration.short` | `150ms` | Productive micro-interactions (default for hover/focus/press) |
| `primitive.duration.medium` | `250ms` | Expressive entrances, teaching moments |
| `primitive.duration.long` | `400ms` | Spatial movement, page travel, parallax |

### Semantic intents

| Intent | Duration | Purpose |
| --- | --- | --- |
| `semantic.motion.productive` | `150ms` | For micro-interactions and status changes. No deformation. |
| `semantic.motion.expressive` | `250ms` | For teaching moments and significant UI entries. Includes physics-based squish. |
| `semantic.motion.spatial` | `400ms` | For elements traveling long distances across the viewport. |
| `semantic.motion.exit` | `100ms` | For elements being removed from the DOM. |

Default most interactive feedback to `productive` (150ms, decelerate). Reserve `expressive` (250ms, spring) for teaching moments where the motion itself carries meaning. `spatial` (400ms) is for travel, not decoration.
<!-- auto:end:motion -->

## Components

<!-- auto:start:components -->
| Component | Radius | States | Guidance |
| --- | --- | --- | --- |
| **Buttons** | `12px` (`semantic.radius.action`) | default · hover · focus · active · disabled · loading | Three variants: primary (accent-filled), secondary (outline), tertiary (ghost). Primary uses `semantic.accent.*` ramp per state. Icon buttons (`IconButton`) follow the same token surface. |
| **Inputs** | `12px` (`semantic.radius.action`) | default · focus · filled · error · disabled · loading | Border-driven treatment; no filled background by default. Focus uses `semantic.color.border.accent` plus a 2px outline offset. Error swaps to `component.input.borderError`. |
| **Cards** (`Card`) | `8px` (`primitive.radius.8`) | default · hover (optional parallax) · pressed (when interactive) | Cards default to `elevation.flat` (1px border `border.subtle`, no shadow). Interactive cards lift to `elevation.raised` (shadow.subtle, no border) on hover. Bind via `semantic.elevation.{role}` — never raw box-shadow values. Radius: `var(--primitive-radius-8)` (8 px) — never 12/16/20 px. Padding: `var(--semantic-space-component-padding)`. Title: `heading3`. Meta: `caption` + `var(--semantic-color-content-secondary)`. Hover (interactive): `scale(1.02)` transform + lift to raised. Never: gradients, glow, frosted glass, tinted surfaces, decorative overlays, or inner shadows. |
| **Badges** (`Badge`) | `12px` (`primitive.radius.4`) | neutral · accent · feedback (error/success/warning/info) | Single-line status markers. Feedback colors come from `semantic.color.feedback.*`. Never used as decorative chrome. |
| **Alerts** (`Alert`) | `12px` (via `hds.borderRadius.4`) | info · success · warning · error | Inline banner pattern with icon + message + optional action. Tone is carried by left-border color, not by tinted fills. |
| **Disclosures** (`Disclosure`) | `12px` (`hds.borderRadius.action`) | collapsed · expanded · hover · focus | Accordion primitive. Expansion uses `semantic.motion.productive`; no spring bounce. Dividers follow `semantic.color.border.subtle`. |
| **Toggles** (`HdsToggle`) | `full` (pill track + circular thumb) | off · on · focus · disabled | Accent-filled track in the on state; neutral track otherwise. Track + thumb transitions share `semantic.motion.productive`. |
| **Segmented Control** (`SegmentedControl`) | Outer `8px` · inner segments `12px` | rest · hover · selected · disabled | Selected segment fills with the accent; unselected segments are transparent. Use for 2–5 mutually exclusive options; beyond that, prefer `HdsSelect`. |

See `public/hds-manifest.json` and `src/app/data/component-api.json` for the full inventory and prop tables.
<!-- auto:end:components -->

### Card Anatomy (mandatory — all properties non-negotiable)

Every HDS card surface must conform to this anatomy exactly. No creative interpretation is permitted on any of these properties.

| Property | Required value | Forbidden |
| --- | --- | --- |
| Background | `var(--semantic-color-surface-raised)` | Any gradient, tinted fill, or custom color |
| Border | `1px solid var(--semantic-color-border-default)` | `box-shadow` as an elevation substitute |
| Border radius | `var(--primitive-radius-8)` (8 px) | 12 px, 16 px, 20 px, `rounded-full`, or any other value |
| Padding | `var(--semantic-space-component-padding)` or `<HdsSurface padding="component">` | Raw pixel values or ad hoc insets |
| Shadow | Resting cards: none (`elevation.flat`). Interactive lifted state: `shadow.subtle` via `elevation.raised` | Raw `box-shadow` values, `drop-shadow`, glow, or any depth effect not bound to a role token |
| Title | `hds.typeStyles.heading3` / `<HdsText variant="heading3">` | Any other type style for the primary card heading |
| Subtitle / meta | `hds.typeStyles.caption` + `var(--semantic-color-content-secondary)` | Primary content color or body size for secondary text |
| Hover (interactive only) | `transform: scale(1.02)` | Background fill change, border color shift, or opacity fade on hover |

Never use on any card surface: gradient backgrounds, glow effects, frosted glass (`backdrop-filter: blur`), decorative overlays, gradient borders, colored or tinted backgrounds, inner shadows, patterned fills, shimmer or noise effects.

## Do's and Don'ts

- Don't invent new corner behavior for interactive controls; buttons, inputs, disclosures, and similar action surfaces should follow the shared 4px action radius.
- Don't introduce additional accent hues; Hirobius uses one electric blue accent and a true monochromatic neutral system.
- Don't tint neutrals warm or cool; greys should remain genuinely neutral and high-contrast.
- Don't reach for shadow values directly — bind to a `semantic.elevation.*` role so surface + shadow + border stay paired. Cards default to `flat` (border, no shadow). Popovers/tooltips/dropdowns use `floating`. Dialogs/sheets use `overlay`.
- Don't hardcode colors, spacing, radius, or typography values when governed tokens already exist.
- Don't crowd the canvas; if a layout feels compressed, remove complexity before removing breathing room.
- Don't default repeated roadmap, status, process, or overview groups to outlined cards; prefer open bands, section dividers, accent rails, tabs, disclosures, and whitespace. Cards are for genuinely discrete repeated objects, not the primary layout language.
- Don't sticker badges onto the ends of prose lines. Status and progress should live in a predictable metadata slot, rail, header zone, table column, or progress surface; badges are reserved for compact state markers where their placement is intentional.
- Don't add decorative illustration, ornamental icons, or trend-driven filler that lacks functional or structural purpose.
- Don't make motion playful or bouncy by default; movement should feel controlled, precise, and intentional, with expressive motion used sparingly and only when it teaches or clarifies.
- Don't add `whileTap` scale transforms for press feedback; use color, border, and state-contrast changes instead — transforms are reserved for spatial motion, not interaction acknowledgment.
- Don't define a global disabled-state rule (opacity multiplier, saturation ramp, etc.); disabled presentation is governed per-component through its dedicated disabled tokens.

## Open Questions

Unresolved rules that the live repo cannot yet answer confidently are tracked in [`OPEN_DS_QUESTIONS.md`](OPEN_DS_QUESTIONS.md). Do not invent rules here to fill those gaps.

<!-- auto:start:build-meta -->
---

> Generated 2026-06-17 from `hirobius.tokens.json` (333 tokens) and `public/hds-manifest.json` by `scripts/build-design-md.mjs`.
> Hand-edit `DESIGN.source.md`; this file (`DESIGN.md`) is overwritten by `pnpm tokens`.
<!-- auto:end:build-meta -->
