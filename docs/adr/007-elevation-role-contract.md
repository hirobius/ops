# ADR-007: Elevation Roles and Multi-Layer Shadows

**Status:** Accepted (2026-05-01)

## Context
HDS previously used numeric z-index and ad-hoc shadow values scattered across components. No elevation model existed beyond CSS `box-shadow`. As component system matured, elevation needed to become semantic and predictable.

## Decision
Introduce elevation role-based contract: `flat / raised / floating / overlay / sticky`. Each role bundles surface color, border, shadow (multi-layer), and z-index as an atomic semantic unit.

## Rationale
- **Role semantics over magic numbers.** Designers and engineers agree on intent ("this is a card at floating elevation") not shadow pixel values.
- **Multi-layer shadows.** Depth is communicated via multiple shadow layers, not a single value (e.g., `0 1px 3px rgba(...), 0 4px 8px rgba(...)`)
- **Theme-aware colors.** Shadow color is a CSS variable (`--shadow-color`) that inverts in dark mode automatically; no hard-coded black/white
- **Z-index coordination.** Role bundling prevents z-index conflicts (overlay always > sticky always > floating, etc.)

## Implications
- New `elevation.*` + `shadow.*` semantic token branches in tokens.json
- New `role.*` alias layer (background/foreground/primary/secondary → existing semantic paths)
- Manifest `slots[]` bindings now reference elevation roles (e.g., `fill: 'elevation.raised'`)
- Component props use role strings ("raised", "floating") not numeric z-index

## Consequences
- Consistent shadow rendering across all surfaces
- Easier dark-mode adaptation (shadow color variable, not hard-coded)
- Visual auditing simplified (every elevated element uses a defined role)
- Documentation gains elevation page showing all five roles + examples
