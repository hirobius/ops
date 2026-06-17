# ADR-006: Four-Tier Component Classification

**Status:** Accepted (2026-05-01)

## Context
HDS manifest had no formal tier field. A37 components spanned reusable primitives, design patterns, page templates, utilities, and experiments without clear distinction. Doc pages did not differentiate authoring intent or consumption pattern.

## Decision
Introduce mandatory `tier` field on every `componentSpecs[*]` entry with four values:
- **primitive** — unstyled Radix-like building block (HdsButton, Input, Card, Dialog)
- **pattern** — composed of primitives (HdsForm, HdsSidebar, HdsNav)
- **template** — full page layout (HdsLandingTemplate, HdsDashboardTemplate)
- **utility** — styling helpers, layout primitives (Stack, Grid, HdsSpacer)

## Rationale
- **Asymmetric doc weight.** Primitives get heavy API reference pages with fixture galleries. Patterns get light usage pages. Templates get galleries. Utilities hide.
- **LLM guidance.** Generation prompt can restrict hallucinated components ("only use tier:primitive for the core UI, then compose patterns")
- **Auditing clarity.** Easy to count completeness: how many tier:primitive have full prop sets? How many tier:pattern have examples?
- **Manifest drift detection.** When a spec is retired, its tier determines whether the deletion is major (primitive) or minor (utility).

## Implications
- Manifest schema extended with new field (8x-1)
- 94 specs audited and assigned tier (8x-2, 8x-3)
- Orphans (specs with no tier or unclear purpose) identified and resolved (8x-4, gated for Adrian ratification)
- Doc site filters by tier to show asymmetric page weight

## Consequences
- Clear authoring contract for new components ("this will be tier:pattern because it reuses primitives")
- Reduced spec bloat (utilities moved out of componentSpecs, experiments clearly marked)
- Easier onboarding (new engineers see the four tiers immediately)
