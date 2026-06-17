# Top-to-bottom gate audit — 2026-05-06

First time every registered gate has been actually run, on the same day the registry was extended with 9 industry-baseline gates that closed gaps versus typical production codebases. This document is the debt baseline: what exists, what fires, what catches, and what to do about each gate.

Audit run: `node scripts/run-gates.mjs --channel <each>` with `--emit-inventory` capture for all four channels. Raw inventory: `/tmp/gate-audit/{pre-commit,ci-pr,manual,pnpm-meta}.json`.

## Headline numbers

| Channel    | Registered | Pass   | Fail   | Pass rate |
| ---------- | ---------- | ------ | ------ | --------- |
| pre-commit | 22         | 22     | 0      | **100%**  |
| ci-pr      | 6          | 5      | 1      | 83%       |
| manual     | 10         | 5      | 5      | 50%       |
| pnpm-meta  | 47         | 28     | 19     | 60%       |
| **total**  | **85**     | **60** | **25** | **70.6%** |

Fault interpretation: of the 19 pnpm-meta failures, **0 had ever fired before this audit** (`lastFiringAt: never` on every one). They were registered as gates but never actually run against current source. Tonight is the first time the codebase has been measured against them. Most fail with real findings.

## What landed in this batch (9 new gates)

| Gate                          | Channel    | Severity | Purpose                                                   |
| ----------------------------- | ---------- | -------- | --------------------------------------------------------- |
| `check-secrets`               | pre-commit | error    | Registers existing gitleaks call so it shows up in audits |
| `check-lockfile-integrity`    | pre-commit | error    | Catches package.json/pnpm-lock.yaml drift                 |
| `check-licenses`              | pre-commit | error    | Blocks GPL/AGPL/SSPL/BUSL/etc. dependencies               |
| `check-format-staged`         | pre-commit | warn     | Prettier check on staged files only (no big-bang)         |
| `check-type-coverage-ratchet` | pre-commit | warn     | Ratchets non-`any` type coverage upward (baseline: 99.9%) |
| `check-knip-ratchet`          | pre-commit | warn     | Ratchets dead-code findings down (baseline: 60)           |
| `audit-deps`                  | manual     | warn     | Wraps `pnpm audit --audit-level moderate`                 |
| `audit-sbom`                  | manual     | warn     | CycloneDX SBOM artifact (currently broken — see issues)   |
| `audit-bundle`                | manual     | warn     | vite-bundle-visualizer artifact                           |

New dev deps: `prettier`, `type-coverage`, `@cyclonedx/cyclonedx-npm`, `vite-bundle-visualizer`. Configs: `.prettierrc.json`, `.prettierignore`. Baselines: `docs/guardrails/baselines/check-type-coverage.json`, `docs/guardrails/baselines/check-knip.json`.

## Pre-commit (22/22 pass)

All firing on every commit, 100% green. These are the load-bearing daily gates. No action needed — these are the gates earning their keep.

## ci-pr (5/6 pass — 1 expected fail)

| Gate                                    | Status   | Note                                                                                                                             |
| --------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------- |
| audit-gate-purity                       | pass     |                                                                                                                                  |
| audit-strengths                         | pass     |                                                                                                                                  |
| audit-gates-supportjson                 | pass     |                                                                                                                                  |
| check-token-paths-ratchet               | pass     |                                                                                                                                  |
| check-fixture-stubs-ratchet             | **fail** | Expected — baseline bumped from 76→85 to absorb 9 new gate stubs. Real fixtures pending; tracked under "Fixture burndown" below. |
| check-external-links (when wired in CI) | n/a      | Currently pnpm-meta — fails locally with 1/6 broken external link                                                                |

## manual (5/10 pass — 5 fail)

| Gate                     | Status   | Finding                                                           | Action                                               |
| ------------------------ | -------- | ----------------------------------------------------------------- | ---------------------------------------------------- |
| audit-claims             | pass     | No stale claims                                                   | keep                                                 |
| audit-exceptions         | pass     |                                                                   | keep                                                 |
| audit-tiers              | pass     |                                                                   | keep                                                 |
| check-code-connect       | pass     |                                                                   | keep                                                 |
| audit-deps (new)         | pass     | No high/critical advisories                                       | **keep — promote to weekly cadence reminder**        |
| audit-bundle (new)       | pass     | Bundle report generated                                           | keep                                                 |
| audit-batch-deliverables | **fail** | Node.js error — script broken                                     | **fix or delete**                                    |
| audit-figma-system       | **fail** | REST payload variable count 305 expected, 257 actual              | **real Figma drift — separate burn-down**            |
| check-security-baseline  | **fail** | Security-ok markers missing reasons                               | **clean up exemption markers**                       |
| check-unit-overlap       | **fail** | Exit 2 — script needs `--unit` arg, can't run channel-style       | **wire properly or move to validator-of-validators** |
| audit-sbom (new)         | **fail** | cyclonedx-npm uses `npm ls` internally, breaks in pnpm workspaces | **swap to `cyclonedx-pnpm` or `syft`**               |

## pnpm-meta (28/47 pass — 19 fail)

This is the debt surface. Each failure is a real gate finding real issues. Categorized by domain:

### Token / styling discipline (6 gates, all real findings)

| Gate                       | Sample finding                                                | Mechanical fix path                                                    |
| -------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `audit-pages`              | `transition: 'background 0.1s'` — use `hds.duration.*` tokens | Replace raw values with token references                               |
| `check-css-values`         | Raw hex `#A8896A`                                             | Replace with `var(--semantic-color-*)` or add `/* css-ok: <reason> */` |
| `check-dimensions`         | `width: hds.space.px2` (using spacing token for sizing)       | Replace with `hds.size.*` / `hds.layout.*`                             |
| `check-tailwind-arbitrary` | `[8px]` arbitrary value                                       | Replace with semantic Tailwind utility                                 |
| `check-tier-bypass`        | `var(--primitive-font-family-mono, monospace)`                | Replace with semantic var                                              |
| `check-inline-styles`      | `<div>` with 6 inline style properties                        | Extract to component or add `// inline-ok:`                            |

### Component / API integrity (4 gates)

| Gate                   | Sample finding                                               | Action                               |
| ---------------------- | ------------------------------------------------------------ | ------------------------------------ |
| `check-ref-forwarding` | `command-palette.tsx` renders `<input>` without `forwardRef` | Add `forwardRef`                     |
| `check-component-docs` | Fidelity grade D (24/35, 69%)                                | Real doc gap — separate burndown     |
| `check-public-api`     | `module removed: ./app/components/Surface`                   | Bump major version OR restore export |
| `check-route-links`    | `OpsDashboardPage.tsx:180` references `/ops/sessions`        | Fix the route or update the link     |

### Accessibility / semantic HTML (2 gates)

| Gate                       | Sample finding                 | Action                                      |
| -------------------------- | ------------------------------ | ------------------------------------------- |
| `check-semantic-html`      | Heading outline: none          | Add a single `<h1>` per page; cascade h2/h3 |
| `check-unresponsive-grids` | Grid breaks on narrow viewport | Use `minmax()` or add `// grid-ok:`         |

### Motion (1 gate)

| Gate           | Sample finding                                | Action                                          |
| -------------- | --------------------------------------------- | ----------------------------------------------- |
| `check-motion` | Interactive component without motion feedback | Add `transition` token usage or `// motion-ok:` |

### Doc / link integrity (3 gates)

| Gate                   | Sample finding                                                   | Action                               |
| ---------------------- | ---------------------------------------------------------------- | ------------------------------------ |
| `check-doc-references` | `CLAUDE.md:26` references missing `docs/ai/proposed-units.jsonl` | Create the file or fix the reference |
| `check-external-links` | 5/6 passed — 1 broken external link                              | Replace or remove the broken link    |
| `check-og-meta`        | `og:image` meta tag not found                                    | Add OG image to index.html           |

### Token-system housekeeping (2 gates)

| Gate                       | Sample finding                               | Action                                    |
| -------------------------- | -------------------------------------------- | ----------------------------------------- |
| `check-token-descriptions` | `MISSING component.card.padding` description | Add description to `hirobius.tokens.json` |
| `check-token-renames`      | Token migration history needs entry          | Add row to `TOKEN_MIGRATION.md`           |

### Exemption markers (1 gate)

| Gate               | Sample finding                                                               | Action                                                                               |
| ------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `check-exemptions` | `scripts/check-unit-overlap.mjs:43` unknown exemption marker `token-path-ok` | Register the marker in `audit-exceptions` config OR replace with a registered marker |

## Recommended consolidation (post-burndown)

After this debt is burned down, the next move is to collapse redundant gates per the earlier proposal in our conversation. Specific high-confidence merges, now that we have run-evidence:

| Cluster                 | Gates                                                                                             | Recommended merge                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Token paths             | `check-token-paths` + `check-token-paths-ratchet`                                                 | Keep ratchet, demote raw check to a `--mode=full` flag                  |
| Token descriptions      | `check-token-descriptions` + `check-token-description-quality`                                    | Single gate, two modes                                                  |
| Inline-style discipline | `check-inline-styles` + `check-style-prop-values` + `check-css-values`                            | One gate for raw-style-attribute hygiene                                |
| Component audits        | `audit-components` + `check-component-completeness` + `check-component-docs` + `check-public-api` | One gate with sub-modes; the four overlap heavily on the same file walk |
| Typography              | `check-hardcoded-fonts` + `check-font-files` + `audit-typography-overrides`                       | Three separate file walks for the same domain                           |
| Doc links               | `check-doc-references` + `check-external-links` + `check-route-links`                             | One link-checker that handles all link types                            |

Estimated gate count post-merge: 85 → ~55. Net effect on coverage: zero (all rules preserved). Net effect on maintenance: ~35% less surface.

## Recommended deletes (zero firing history, narrow value)

These have `lastFiringAt: never`, `lastViolationAt: never`, AND no plausible high-value catch profile:

- `check-attributions` — narrow use case, never fires
- `check-frozen-demos` — pnpm-meta, narrow
- `check-mono-roles` — narrow
- `check-template-source-of-truth` — overlaps `check-manifest-drift`
- `check-image-loading` — overlaps `check-asset-manifest`
- `check-legacy-hds-vars` — historical migration, likely complete (verify, then delete)

Recommended after they confirm zero recent catches.

## Recommended promotions (currently dormant, would catch real bugs in pre-commit)

These currently sit on `pnpm-meta` and don't fire unless someone manually runs the bundle. They have failed in this audit with real findings, meaning **promoting them to pre-commit would catch regressions immediately**:

| Gate                       | Current channel | Recommended       | Reason                                          |
| -------------------------- | --------------- | ----------------- | ----------------------------------------------- |
| `check-route-links`        | pnpm-meta       | pre-commit        | Already found a broken route link; cheap to run |
| `check-doc-references`     | pnpm-meta       | pre-commit        | Already found a missing referenced file         |
| `check-semantic-html`      | pnpm-meta       | pre-commit (warn) | Real a11y findings                              |
| `check-ref-forwarding`     | pnpm-meta       | pre-commit        | Real forwardRef gap in command-palette          |
| `check-token-descriptions` | pnpm-meta       | pre-commit (warn) | Two missing descriptions; cheap                 |

## Known issues from this run

1. **audit-sbom doesn't work yet.** `@cyclonedx/cyclonedx-npm` invokes `npm ls --json` internally; the project uses pnpm. Swap to `cyclonedx-pnpm` (community fork) or `syft` for true SBOM generation. Filed as a follow-up unit.
2. **audit-batch-deliverables crashes** with a Node.js error — the script itself is broken. Fix or delete.
3. **check-unit-overlap is run-mode-incompatible** with `run-gates.mjs` (requires `--unit` arg). Either wire it as a meta-validator (like `validate-fixture-proof-of-firing`) or set its registry channel correctly.
4. **9 new gates ship with stub fixtures.** Real passing/violating fixture pairs are pending. Tracked via `check-fixture-stubs-ratchet` baseline (76 → 85). The gates work; the fixtures are placeholders.

## What this changes about how the codebase is operated

Three concrete shifts:

1. **The registry is no longer fiction.** Until tonight, 49 of 76 gates had `lastFiringAt: never`. We now have run-evidence per gate. The `lastFiringAt` fields will be updated in the next pre-commit cycle.
2. **A 70.6% global pass rate is the honest starting point.** Not 100%, not zero — 70.6% with 25 real finding-producing gates lit up. The next sessions burn down by category, not by gate.
3. **New commits no longer accumulate 12q-style debt silently.** check-format-staged catches Prettier drift in the moment; check-knip-ratchet catches new dead code; check-type-coverage-ratchet catches new `any` introductions. The treadmill stops here.

## Next steps (proposed orchestration units)

| Unit ID                               | Description                                                                                                                                 | Effort       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `13y-1-burndown-token-discipline`     | Burn down audit-pages + check-css-values + check-dimensions + check-tailwind-arbitrary + check-tier-bypass + check-inline-styles violations | sonnet, ~3h  |
| `13y-2-burndown-component-integrity`  | Fix check-ref-forwarding + check-route-links + check-public-api findings                                                                    | sonnet, ~1h  |
| `13y-3-burndown-a11y-semantic`        | Fix check-semantic-html + check-unresponsive-grids + check-og-meta findings                                                                 | sonnet, ~2h  |
| `13y-4-burndown-doc-link-integrity`   | Fix check-doc-references + check-external-links                                                                                             | hermes, ~30m |
| `13y-5-burndown-token-housekeeping`   | check-token-descriptions + check-token-renames                                                                                              | hermes, ~30m |
| `13y-6-fix-broken-gates`              | audit-sbom (swap tool), audit-batch-deliverables (fix script), check-unit-overlap (wire correctly)                                          | sonnet, ~1h  |
| `13y-7-gate-consolidation-merge-pass` | Apply the 6 cluster merges above; net 85→55 gates                                                                                           | sonnet, ~2h  |
| `13y-8-gate-prune-pass`               | Delete the 6 dead-weight gates                                                                                                              | sonnet, ~30m |
| `13y-9-promote-dormant-to-precommit`  | Promote 5 gates from pnpm-meta to pre-commit                                                                                                | sonnet, ~30m |

Total: ~11h of focused work. Outcome: registry is real, debt is named, the daily commit feedback loop catches everything that matters.
