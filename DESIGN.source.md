<!--
  DESIGN.source.md — hand-authored template for DESIGN.md.

  This is the human-maintained source. `scripts/build-design-md.mjs` reads
  this file, fills the auto-marker blocks below from `hirobius.tokens.json`
  and `public/hds-manifest.json`, and writes the assembled result to DESIGN.md
  at the repo root.

  Hand-edit narrative (Overview, Elevation, Corner-Radius Policy prose,
  Do's and Don'ts) directly in this file. Never edit DESIGN.md by hand —
  it is generated. Token tables are auto-derived; do not put values here.

  Scope: this file describes the shared Hirobius Design System core. It is
  intentionally product-agnostic so multiple surfaces (portfolio, personal
  brand, future products) can consume it. Product-specific personality
  belongs in a per-product overlay when those surfaces come online.
-->

# DESIGN.md

A machine- and human-readable specification of the Hirobius Design System for AI agents, design tools, and humans generating or reviewing UI. Values are sourced from `hirobius.tokens.json`; narrative rules are hand-authored. For the full tokens reference see `DESIGN-HANDOFF.md`.

## Overview

Hirobius is a clean, systems-first visual language that bridges digital precision and physical fabrication through a high-contrast monochromatic palette and a single electric-blue accent. Its personality is disciplined, tactile, and quietly technical: structure is explicit, motion is purposeful, and visual noise is stripped away. Whitespace is treated as material, not leftover space, so every screen should feel deliberate, breathable, and exact.

## Colors

<!-- auto:start:colors -->
<!-- auto:end:colors -->

## Typography

<!-- auto:start:typography -->
<!-- auto:end:typography -->

## Spacing

<!-- auto:start:spacing -->
<!-- auto:end:spacing -->

## Corner-Radius Policy

Interactive controls use a restrained `4px` radius via the action radius token, containers trend to `8px` as the current system default, and `full` radius is reserved for pills or circular forms; `0px` should only appear on intentional outer canvas or substrate boundaries, not on everyday UI controls.

<!-- auto:start:radius -->
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
<!-- auto:end:motion -->

## Components

<!-- auto:start:components -->
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
<!-- auto:end:build-meta -->
