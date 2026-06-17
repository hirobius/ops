# ADR-002: Tailwind v4 Reintegration

**Status:** Accepted (2026-04-30)

## Context
HDS previously exited Tailwind (commit `9abc1901`). Adrian clarified post-exit that the original reasoning conflated Tailwind utility classes with DTCG design tokens—two separate abstraction layers.

## Decision
Reintroduce Tailwind v4 as the CSS generation layer, with DTCG tokens piped through a custom Tailwind config emitter.

## Rationale
- **Tailwind ≠ DTCG tokens.** Tailwind is a utility class compiler; DTCG is a semantic token format. They're complementary, not competing.
- **Custom emitter in build-tokens.mjs** already compiles DTCG → CSS variables. Extending to emit Tailwind config (`--semantic-color-*` etc.) is mechanical.
- **Classname composability** (via cva + clsx + tailwind-merge) accelerates component iteration without rebuilding the CSS layer.
- **Industry standard.** Radix + Tailwind is the de facto baseline for modern React UI (shadcn, Geist, Vercel stack).

## Implications
- `scripts/build-tokens.mjs` extended with third emitter for Tailwind config
- **No Style Dictionary dependency.** Our custom DTCG compiler stays the source; we skip the Style Dictionary abstraction.
- Tailwind config scoped to `theme.extend` to preserve reset + defaults
- Token paths remain authoritative; Tailwind is a consumer of the token graph

## Consequences
- Faster component development via utility-first composition
- Classname pollution risk mitigated by cva (variant factory) + careful token modeling
- Zero upstream dependency on Tailwind release cycle (config generated locally)
