# Hirobius Design System V2

Hirobius is a portfolio-grade design-system product surface: a React and TypeScript site, a governed component library, a token pipeline, and an autonomous verification loop living in one repository.

## Quick start

```bash
pnpm install
pnpm dev
```

Core verification commands:

```bash
pnpm typecheck
pnpm run heal
pnpm test:layout
pnpm check:size
```

## HDS V2 architecture

HDS V2 is built around three structural rules:

- Strict semantics: public surfaces prefer system primitives such as `HdsStack`, `HdsGrid`, `HdsSurface`, `HdsTextLockup`, `DocLayout`, and `CaseStudyLayout` instead of raw layout divs or ad hoc CSS.
- Polymorphism: primitives are expected to preserve semantic HTML while staying composable through governed APIs such as `forwardRef`, `as`, and layout slots.
- 12-column grid: page structure is organized around a consistent editorial grid, with readable center columns, intentional breakout zones, and explicit `gap` ownership rather than one-off spacing math.

This repo treats the following files as source of truth:

- `hirobius.tokens.json`: token values and alias chain.
- `public/hds-manifest.json`: machine-readable system inventory, metadata, and docs linkage.
- `src/app/data/component-api.json`: generated prop tables and reflected component API.
- `DESIGN.md`: lean visual spec for agents and engineers.
- `DESIGN-HANDOFF.md`: verbose visual mirror for handoff and review.

## Editorial Enterprise philosophy

The governing visual direction is "Editorial Enterprise": enterprise-grade rigor with editorial pacing and restraint. The system favors sharp hierarchy, open whitespace, disciplined monochrome neutrals, and a single electric-blue accent. Layouts should feel authored rather than templated.

In practice that means:

- documentation reads like a designed publication, not a component dump
- cards are used sparingly; whitespace, rails, dividers, and bands carry structure first
- motion teaches or clarifies instead of decorating
- surfaces, spacing, and type are token-governed so the visual language stays coherent across portfolio pages and HDS docs

## Autonomous agentic workflow

Regression prevention is intentionally layered.

`docs/ai/AI_ORCHESTRATION.md` is the operating contract. It defines the phase queue, permanent UI guardrails, required validation steps, and the self-heal requirement before a task can be marked complete.

`scripts/self-heal.mjs` is the automated repair loop. It runs the local static and smoke checks, captures failures, and gives the agent a consistent path to diagnose and fix type, layout, and runtime drift before reporting completion.

The Playwright guardrails enforce the visual constitution at runtime. The current suite covers accessibility, layout integrity, collision detection, responsiveness, and visual regression so changes that violate containment, overlap, or responsive behavior fail automatically.

Together the workflow is:

1. Change code inside the token and component constraints.
2. Run `pnpm typecheck` and `pnpm run heal`.
3. Let Playwright catch runtime and visual regressions.
4. If a regression is fixed through self-healing, log the root cause and resolution in `docs/logs/AI_DECISION_LEDGER.md`.
5. Only then update the orchestration checklist and ship the change.

## Bundle and release hygiene

This repo tracks both runtime quality and size drift:

- `pnpm check:size` builds the library bundle and runs `size-limit`.
- `pnpm perf:budget` runs Lighthouse CI assertions for page performance budgets.
- `pnpm check:release` runs the full release gate, including accessibility, responsive, collision, visual, and bundle-size checks.

## Repository shape

```text
src/
  app/
    components/
    layouts/
    pages/
  styles/
scripts/
docs/
public/
```

## Primary docs

- `CLAUDE.md`
- `DESIGN.md`
- `DESIGN-HANDOFF.md`
- `TASKS.md`
- `TOKEN_GOVERNANCE.md`
- `SYSTEMS_REGISTRY.md`
- `docs/ai/AI_ORCHESTRATION.md`
- `docs/logs/AI_DECISION_LEDGER.md`
