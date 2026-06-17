# Concrete Creations — Tenant Overlay

First multi-tenant pilot consumer of the Hirobius Design System.

## Brand intent

Concrete Creations is a Washington State LLC selling handmade concrete and
stone home goods (planters, candle holders, coasters, lamps). The brand
voice is **grounded, tactile, warm**. The design system default brand-blue
(`#1E2EFD`) is wrong for the category — it reads tech, not artisanal.

The override here pivots the accent palette to a **warm stone / brown**
family that resonates with the material vocabulary of the products.

## What this overlay overrides

| Token path | Default (HDS base) | Concrete Creations | Why |
|---|---|---|---|
| `semantic.accent.rest` | `#1E2EFD` (brand blue) | `#8B6F47` (warm stone) | Primary accent — buttons, focus rings. |
| `semantic.accent.hover` | blue-600 | `#75593A` | Hover state, slightly darker. |
| `semantic.accent.pressed` | blue-700 | `#5C432A` | Pressed state, deepest tone. |
| `semantic.accent.subtle` | blue-50 | `#F5EFE7` | Faint accent surface — tint backgrounds. |
| `semantic.accent.content` | blue-500 | `#75593A` | Accent text + link color. |
| `semantic.color.surface.accent` | blue-500 | `#8B6F47` | Accent surface fill (CTA backgrounds). |
| `semantic.color.surface.accentSubtle` | blue-50 | `#F5EFE7` | Faint accent surface tint. |
| `semantic.color.border.accent` | blue-500 | `#8B6F47` | Accent border, focus ring. |

## Status

**`scaffold`** — values are PLACEHOLDER hexes. Adrian will land final brand
hexes once the brand identity work concludes. Until then, do not deploy
this tenant to a production domain.

## Deployment plan

- Separate repo (`concrete-creations` or similar; TBD).
- Imports `@hirobius/design-system` as a workspace dep or via `pnpm pack`
  tarball.
- Stripe Checkout (hosted) for payments — no custom payment UI.
- WA-compliant legal pages generated from tier-2 templates.
- Sets `<html data-tenant="concrete-creations">` at SSR root.
- Vercel project `concrete-creations`, separate from the HDS doc-site
  deploy.

## Reference

- Format spec: `docs/architecture/tenant-token-overlay-format.md`
- Scope decision: `docs/architecture/ADR-0001-multi-tenant-scope.md`
- Pilot orchestration unit: `docs/ai/orchestration.json` → `12n-cc-pilot` /
  `12h-6` (Concrete Creations pilot).
