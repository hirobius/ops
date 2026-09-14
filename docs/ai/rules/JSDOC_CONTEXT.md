# 🗂️ AI-Optimized Context — JSDoc Convention

A convention for module-header and function-level JSDoc that makes a
module's _why_ legible to an agent (or a human) reading it cold — without
re-deriving intent from git blame or a stale HANDOFF entry. The codebase
already converged on this pattern organically across most of `lib/*.mjs`
and `api/*.ts`; this file writes down the shape so new modules match it on
purpose instead of by accident.

## When it's required

- New `lib/*.mjs` modules — shared logic reused by more than one caller
  (a "port" or "seam", per `docs/adr` conventions). Always.
- `api/*.ts` handlers — these are the production entrypoints; the header
  is often the only place the request/response contract is written down.
  Always.
- Existing modules you are editing substantially. Don't do a drive-by
  JSDoc pass on unrelated code while you're in a file for something else.
- Skip: throwaway `scripts/*.mjs` CLIs that are already self-describing
  via their own `--help` output, and trivial re-export files.

## The pattern

**Module header** — a `/** ... */` block at the very top of the file,
before imports:

1. One line: `<path> — <what this module is>`.
2. Why it exists — what it replaces or extracts from, if anything (cite
   the issue/epic only if it explains a real constraint, not as a label).
3. Non-obvious invariants a reader can't get from the code alone: network
   calls, injected ports/DI seams, silent-catch behavior, ordering
   requirements, env-only availability.
4. If the module exports more than one thing, a one-line map of the
   public surface.

**Function-level JSDoc** — only where behavior isn't already obvious from
the name and types. Worth documenting: parameters that aren't
self-descriptive, side effects, and purity/determinism guarantees that
tests rely on. Skip functions where a doc comment would just restate the
signature.

## Anti-patterns

- Restating the type signature in prose ("takes a string, returns a
  number") — the types already say that.
- Narrating the implementation line-by-line.
- Referencing "this PR" / "the current fix" / a specific caller by name —
  that context belongs in the commit message and PR description, and rots
  as the codebase moves on. Cite an issue number only when it explains a
  real, durable constraint (a decision, a regression class), not as
  provenance decoration.
- A doc comment where the WHY is already obvious from the code. Per
  CLAUDE.md's comment policy: if removing the comment wouldn't confuse a
  future reader, don't write it.

## Worked examples (already in the codebase)

- `lib/tasks/tier.mjs` — module header states the extraction lineage
  (what script it was pulled out of, why) and the model-routing directive
  behind the constants; `@typedef`s stand in for types the module doesn't
  import.
- `lib/ops/notify.mjs` — module header documents the on-disk row shape,
  the three-function public surface in one table, and the DI seam
  (`{ path, webhookUrl, fetch }` overrides) that keeps tests off the real
  file and network.
- `lib/tasks/actions.mjs` — module header explains the shared-logic
  rationale (one implementation for prod + dev), plus per-constant
  one-liners for magic label strings with their originating issue.
- `src/app/pages/ops/useServicesStatus.ts` — the `.ts`/React-hook
  reference case: documents that the endpoint it polls exists only in the
  Vite dev middleware (not production), which is why the hook's
  silent-catch-and-keep-stale-state behavior is deliberate rather than an
  oversight.
