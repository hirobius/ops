# ADR-001: shadcn Baseline Distribution Model

**Status:** Accepted (2026-04-30)

## Context
HDS previously explored parallel mirror implementations and hand-rolled component systems. Adrian evaluated the distribution model and authoring experience of multiple baseline options.

## Decision
Adopt shadcn-baseline distribution model: copy-the-code MIT license, built on Radix UI primitives, Tailwind-themed, with Material-style approachability + Swiss structural canon.

## Rationale
- **Copy-the-code model** enables fork-friendly customization without NPM dependency lock-in
- **Radix primitives** provide accessibility baseline (unstyled, composable WAI-ARIA)
- **Tailwind theming** integrates cleanly with our DTCG token system (different layer, not competing)
- **Swiss + Material lineage** maps to Adrian's visual canon (geometric, on-grid, weight discipline)

## Implications
- Lineage: Radix UI primitives + shadcn distribution + Material approachability + Swiss canon
- Documented in `docs/ai/rules/COMPONENT_API_STANDARD.md`
- 4 North Star primitives: HdsButton, Input, Card, Dialog
- Primitives get heavy API doc pages; patterns light usage, templates galleries

## Consequences
- No vendor lock-in on shadcn upstream; full source control
- Accessibility defaults from Radix (focus management, ARIA attributes)
- Component API surface grows to ~4 North Stars with rich prop interfaces
