# Validator wiring audit

Source-of-truth report for which guardrail gates are actually firing in
which channel. Generated 2026-05-04 after we caught
`audit-typography-overrides` registered but dormant — 17 violations
shipped past the gate before we noticed.

## Channel taxonomy

| Channel        | Where it fires                                          | Gating? |
|----------------|---------------------------------------------------------|---------|
| `pre-commit`   | `.husky/pre-commit` — every commit                      | YES     |
| `pre-push`     | `.husky/pre-push` — every push (could add)              | YES     |
| `ci-pr`        | `.github/workflows/*.yml` triggered on PR               | YES     |
| `ci-scheduled` | scheduled CI (nightly / weekly)                         | partial |
| `pnpm-meta`    | invoked by `pnpm tokens` / `pnpm pretest` / `pnpm check:*` | NO   |
| `manual`       | operator-only CLI tool, never auto-fires                | NO      |

The honest cut: only `pre-commit`, `pre-push`, and `ci-pr` actually
gate any code change. `pnpm-meta` and `manual` are advisory unless
someone runs the meta-script.

## Self-enforcing wiring

`scripts/check-validator-wiring.mjs` runs in `.husky/pre-commit` and
asserts every registry entry's declared `firingChannel` matches where
the gate is actually invoked. Drift fails the commit. Future
"aspirational" gates can't survive — declaration without invocation
is rejected.

## Distribution (as of 2026-05-04)

```
pnpm-meta        47   ← largest bucket; advisory only
pre-commit       13   ← gating
manual            4   ← intentional operator tools
ci-pr             3   ← gating
ci-scheduled      0   ← claimed-then-reconciled; was aspirational
```

## Open wiring debt

Five gates carry a `wiringTodo` field — they're declared `pnpm-meta`
but the original intent was CI-gated. Reflected honestly in the
registry, listed here so the debt stays visible:

- `check-external-links` — should be `ci-scheduled` (network)
- `check-og-meta` — should be `ci-pr` (needs build output)
- `check-perf-budget` — should be `ci-scheduled` (Lighthouse)
- `check-route-smoke` — should be `ci-pr` (needs running app)

When these are wired into a real CI workflow, drop the `wiringTodo`
field; the wiring validator will then verify the new channel matches.

## High-leverage static gates not yet in pre-commit

The bulk of the `pnpm-meta` bucket is static source-code scans that
COULD be in pre-commit but currently only run via `pnpm tokens`,
`pnpm pretest`, `pnpm check:fast`, etc. Highest-leverage to promote
(roughly in order of bang-per-buck):

1. `check-inline-styles` — inline-style discipline
2. `check-public-api` — API surface stability
3. `check-tier-bypass` — tier-policy enforcement
4. `check-page-shell` — Page-primitive use
5. `check-tailwind-arbitrary` — no-arbitrary-Tailwind discipline
6. `check-tailwind-colors` — Tailwind color discipline
7. `check-mono-roles` — typography role discipline
8. `check-tenant-tokens` — multi-tenant integrity
9. `check-route-coverage` — every route in tests (already runs in `test:layout`)
10. `check-style-prop-values` — token discipline on inline styles
11. `check-image-loading` — `loading="lazy"` default
12. `check-hardcoded-breakpoints` — token discipline on breakpoints
13. `check-token-structure` — token integrity
14. `check-aria-labels` — a11y
15. `check-focus-states` — a11y
16. `check-semantic-html` — a11y
17. `check-reduced-motion` — a11y
18. `check-contrast` — WCAG (note: outputs report; wire as warn until exit-code is hardened)
19. `check-component-docs` — docs sync
20. `check-doc-references` — cross-doc link integrity

Promotion is a per-gate decision: each may surface pre-existing
violations that need a one-time cleanup pass before the gate goes
hard-fail. Track that work as a follow-up sprint cluster
(`13g-6-precommit-gate-promotion` candidate).

## How to run the audit

```bash
# Verify wiring matches reality (gates pre-commit)
node scripts/check-validator-wiring.mjs

# Full table report
node scripts/check-validator-wiring.mjs --report

# Warn-only (don't fail the commit)
node scripts/check-validator-wiring.mjs --warn
```

## How to add a new gate

1. Author `scripts/check-<name>.mjs` or `scripts/audit-<name>.mjs`.
2. The next pre-commit run fails: `validate-guardrail-registry` flags
   the new script as unregistered.
3. Run `node scripts/validate-guardrail-registry.mjs --update` to
   stub a registry entry. Edit the description to match the JSDoc.
4. Set `firingChannel` to where you actually invoke the gate.
5. Wire the invocation (e.g. add a line in `.husky/pre-commit` for
   `pre-commit` channel).
6. Commit. The wiring validator confirms the declaration matches.


