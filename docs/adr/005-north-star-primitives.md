# ADR-005: Four North Star Primitives

**Status:** Accepted (2026-04-30)

## Context
HDS has 94+ component specs across primitives, patterns, templates, and utilities. To focus documentation and LLM generation quality, Adrian identified a narrow set of tier:primitive components that should receive heavy investment.

## Decision
Four North Star primitives, all tier:primitive, are the foundation:
1. HdsButton — state variants (primary/secondary/tertiary × default/hover/active/disabled)
2. Input — form field with label, placeholder, helper, error slots
3. Card — container primitive with elevation role bindings
4. Dialog — overlay primitive with focus management + portal

## Rationale
- **Breadth of use.** These four appear in 90%+ of generated UI
- **Foundation for composition.** All patterns and templates layer on these primitives
- **Radix upstream.** All four have proven Radix primitives (Button, Dialog, Input)
- **State complexity sweet spot.** Rich enough to test variant/state machinery; not over-engineered

## Implications
- Remaining tier:primitive components (Icon, Badge, Chip, etc.) are secondary; no public API pages yet
- These four get detailed prop interfaces, rich TypeScript types, extensive fixtures
- LLM generation prompt includes COMPLETE EXAMPLE featuring all four

## Consequences
- Documentation weight asymmetry (4 North Stars get 80% of doc weight)
- Faster iteration on the critical path (button state machine, form workflows, modals)
- Easier to ratify visual output (4 components to review vs. 94)
