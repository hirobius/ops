# AI-optimized context JSDoc convention

> Captured from the tasks board 2026-07-13 (ops#72) to write down a pattern
> the codebase had already converged on organically — most of `lib/*.mjs`
> and `api/*.ts` already do this. This doc makes it explicit so it keeps
> happening on new modules instead of eroding.

## Why this exists

An agent (or a human) opening a module has no session memory of the design
decisions behind it. Two things are cheap to re-derive by reading the code:
*what* it does, *how* it's implemented. One thing is expensive or impossible
to re-derive: *why it's shaped this way* — the constraint, the rejected
alternative, the incident that produced a guard clause, the sibling file it
must never drift from. Without that "why", an agent either re-asks (burns a
round trip) or guesses (sometimes wrong, silently).

The convention below is scoped narrowly to capture exactly that gap. It is
not "add more comments" — CLAUDE.md's comment rule (WHY only, never WHAT)
still governs inline comments. This is specifically about the **module
header**, which is the one place a deliberately "external" comment belongs.

## When to apply

**Required** on:
- Pure business-logic modules (`lib/**/*.mjs`, `lib/**/*.ts`) — routing,
  parsing, classification, validation.
- Ports/adapters (anything injected so a caller can be tested with a stub —
  see ADR-0004).
- Any module whose current shape is the result of a non-obvious decision
  (an incident, an Adrian directive, a rejected simpler approach, a
  must-stay-in-sync-with-X constraint).

**Optional / skip** on:
- Pure type re-exports or trivial pass-through files.
- Auto-generated files (never hand-edit these — see `AGENT_GUIDELINES.md`
  §9; document the *generator*, not the output).
- One-line leaf components with no state, no branching, no external contract.

## The pattern

Two parts: a **module header** (once, top of file) and **function-level
JSDoc** (per exported function, non-trivial internals only).

### Module header

```js
/**
 * <path> — <one-line identity: what this module is, in domain terms>
 * (<issue/epic ref if one exists, e.g. ops#72>).
 *
 * <One or more paragraphs of WHY, not what. Cover what a reader can't get
 * from the code: the design decision and its rationale, who/when decided
 * it, what alternative was rejected and why, what this must stay in sync
 * with (a sibling file, a migration, a bash script it ports verbatim).>
 *
 * <Optional: invariants / gotchas a caller must not violate.>
 *
 * <Optional: shape reference for non-obvious data (row schema, event
 * shape) when the module owns that shape.>
 */
```

Real examples already in the repo, worth reading as reference:
- `lib/tasks/tier.mjs` — the canonical minimal example: one-line identity,
  one paragraph of why (Adrian's 2026-05-04 haiku-removal directive, with
  the specific tradeoff — "defect-rate cost … outweighed the dispatch
  savings" — that a reader could never infer from `pickTier`'s code alone).
- `lib/ops/notify.mjs` — a header carrying a data-shape reference (the
  JSONL row schema) alongside the why, because the module owns that shape
  and every future caller needs it without opening the implementation.
- `lib/tasks/actions.mjs` — a header documenting a cross-file invariant
  (dispatch/queue status must stay consistent across three call sites) that
  no single function's docstring could capture on its own.

### Function-level JSDoc

- One line describing *behavior*, not a restatement of the name
  (`parseParkedReason` → "Extracts the human-written reason out of a
  `park_issue()` comment body", not "Parses the parked reason").
- Add a second line only when behavior has a non-obvious edge (what it
  returns on bad input, why a branch exists) — see
  `lib/tasks/ralph-parked.mjs`'s `parseParkedReason` for the pattern.
- `@param`/`@returns` with real types. `.mjs` files (no TypeScript) use
  `@typedef` blocks for shared shapes, as `lib/tasks/tier.mjs` does for
  `Tier`/`Model`/`TierableTask` — this is the only type information those
  files get, so it's load-bearing, not decorative.

## Anti-patterns

- Restating the code in prose ("this function adds one to the count").
  CLAUDE.md's rule stands: if removing the comment wouldn't confuse a
  reader, don't write it. The module header is the deliberate exception
  because it carries WHY/history the code physically cannot.
- Letting the header go stale. When the design decision it describes
  changes, the header changes in the same commit — a stale "why" is worse
  than no "why" because it actively misleads.
- Copy-pasting a sibling module's header structure without updating the
  substance. An empty-calorie header (present but content-free) fails the
  same way a missing one does, just less visibly.

## Reference application

`src/app/pages/ops/useServicesStatus.ts` was brought up to this convention
as the worked example for a `.ts` React-hook module (as opposed to the
`lib/*.mjs` examples above, which are all plain Node). It captures the one
fact the code can't say for itself: `/api/services/status` only exists in
the Vite dev server (`scripts/service-manager-middleware.mjs`), so in
production every poll 404s and the hook silently keeps stale state — by
design, not by omission.
