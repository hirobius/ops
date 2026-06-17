# Validator Coverage Audit — 2026-05-03

Inventory of every `scripts/check-*.mjs` and `scripts/validate-*.mjs` script.

**Total scripts:** 57. **Pre-commit gates:** 8. **NPM-only:** 43. **Orphan:** 6.

Status legend:
- **WIRED**: runs in `.husky/pre-commit` automatically on every commit.
- **NPM-only**: wired to a `package.json` script (`check:full`, `check:fast`, `check:release`) — runs only when invoked explicitly.
- **ORPHAN**: not referenced anywhere; effectively dead unless invoked manually.

---

## Pre-commit gates (WIRED)

These run automatically on every commit. Adding a rule here means it blocks bad code at the source.

| Script | Description |
|---|---|
| `check-binding-drift.mjs` |  |
| `check-component-completeness.mjs` |  |
| `check-manifest-drift.mjs` |  |
| `check-source-canon.mjs` |  |
| `check-token-paths.mjs` |  |
| `check-token-rebake-needed.mjs` |  |
| `validate-manifest.mjs` |  |
| `validate-orchestration.mjs` |  |

## NPM-only (WIRED but not on pre-commit)

These run when an npm script invokes them. Useful for nightly / pre-release checks but does not block routine commits.

| Script | Description | npm scripts |
|---|---|---|
| `check-aria-labels.mjs` |  | check:aria, check:full |
| `check-asset-manifest.mjs` |  | check:assets, check:fast, check:full |
| `check-attributions.mjs` |  | check:attributions, check:full |
| `check-brand.mjs` |  | check:brand, check:fast, check:full |
| `check-code-connect.mjs` | CI check: every Figma component with a Code Connect mapping (.figma.tsx) | check:code-connect |
| `check-component-docs.mjs` |  | check:docs |
| `check-contrast.mjs` |  | check:contrast, check:full |
| `check-css-integrity.mjs` |  | check:css, check:fast, check:full |
| `check-css-values.mjs` |  | check:css-values, check:full |
| `check-dimensions.mjs` |  | check:dimensions, check:fast, check:full |
| `check-doc-references.mjs` |  | check:doc-refs, check:fast, check:full |
| `check-doc-structure.mjs` |  | check:doc-structure, check:full |
| `check-exemptions.mjs` |  | check:exemptions, check:full |
| `check-external-links.mjs` | check-external-links.mjs | check:full |
| `check-focus-states.mjs` |  | check:focus, check:full |
| `check-frozen-demos.mjs` |  | check:docs |
| `check-hardcoded-breakpoints.mjs` |  | check:breakpoints, check:fast, check:full |
| `check-hardcoded-colors.mjs` |  | check:tokens, check:colors, check:full |
| `check-hardcoded-fonts.mjs` |  | check:tokens, check:fonts, check:fast, check:full |
| `check-hardcoded-spacing.mjs` |  | check:tokens, check:spacing, check:fast, check:full |
| `check-inline-styles.mjs` |  | check:inline-styles, check:release |
| `check-legacy-hds-vars.mjs` |  | check:fast, check:full |
| `check-manifest-schema-semver.mjs` | check-manifest-schema-semver.mjs | pretest |
| `check-mojibake.mjs` |  | check:mojibake, check:fast, check:full |
| `check-mono-roles.mjs` |  | check:mono-roles, check:fast, check:full |
| `check-motion.mjs` |  | check:micromotion, check:full |
| `check-og-meta.mjs` | check-og-meta.mjs | check:full |
| `check-perf-budget.mjs` |  | perf:budget |
| `check-reduced-motion.mjs` |  | check:motion, check:full |
| `check-ref-forwarding.mjs` |  | check:refs, check:fast, check:full |
| `check-registry.mjs` |  | pretest, check:registry, check:fast, check:full |
| `check-route-links.mjs` |  | check:routes, check:fast, check:full |
| `check-route-smoke.mjs` |  | check:route-smoke, check:release |
| `check-security-baseline.mjs` |  | check:security, check:full |
| `check-semantic-html.mjs` |  | check:semantic, check:fast, check:full |
| `check-style-prop-values.mjs` |  | check:style-props, check:fast, check:full, check:release |
| `check-tailwind-arbitrary.mjs` |  | check:tailwind-arbitrary, check:full |
| `check-tailwind-colors.mjs` |  | check:tokens, check:tailwind, check:fast, check:full |
| `check-tenant-tokens.mjs` |  | pretest |
| `check-tier-bypass.mjs` |  | check:tokens, check:tier-bypass, check:fast, check:full |
| `check-token-description-quality.mjs` |  | check:docs |
| `check-token-structure.mjs` |  | check:token-structure, check:full |
| `check-unresponsive-grids.mjs` |  | check:grids, check:full |

## Orphan scripts

Not referenced in `.husky/pre-commit` or any `package.json` script. Either dead code or expected to be invoked manually. **High priority for triage**.

| Script | Description |
|---|---|
| `check-font-files.mjs` |  |
| `check-image-loading.mjs` | Audit script: check-image-loading.mjs |
| `check-public-api.mjs` |  |
| `check-template-source-of-truth.mjs` | Map of auto-generated output files → their generator script(s). |
| `check-token-descriptions.mjs` |  |
| `check-token-renames.mjs` |  |

---

## Findings & gaps

1. **Pre-commit coverage is small** (14% of validators). The bulk of the rules are reachable only via `pnpm check:full` / `pnpm check:release` which do not run on every commit — so regressions in the rules they enforce can ship.

2. **6 validators have no caller**. The orphan list is the most actionable triage. Each orphan was built with intent but never wired in. Decision tree: WIRE (add to pre-commit or check:fast), DELETE (rule no longer relevant), or DOCUMENT (intentional manual-only — note in a header comment).

3. **`hds-bypass` markers can be too broad**. The current source-canon validator skips ALL rules when a file carries `/* hds-bypass: ... */`. The outline rule (12d-outline-rule) and other strict rules probably should not be bypassable. Consider per-rule bypass markers (e.g. `outline-ok:`, `font-ok:`) instead of wholesale file skip.

4. **No proof-of-firing tests**. The no-aspirational-guardrails rule (AGENT_GUIDELINES §14) requires gates be proven firing on a contrived violation. Today only `INLINE_STRUCTURAL_BORDER` and `INLINE_THIN_BAR` have been tested this way (at introduction). The other ~75 scripts have no inline test fixture; behavior is assumed correct.

## Recommended follow-on units

- **12g-5-validator-wiring-audit**: take the orphan list, decide WIRE/DELETE/DOCUMENT for each, ship per-decision.
- **12g-6-bypass-rule-scope**: refactor `fileExemptions` in source-canon validator to support per-rule bypass (so `hds-bypass` does not silently disable the outline rule).
- **12g-7-validator-fixtures**: add `scripts/__tests__/fixtures/canon/` with one violation file per rule; CI runs each validator against its fixture and asserts it fires (proves the no-aspirational-guardrails rule).
- **12g-8-promote-fast-checks-to-precommit**: pull the most catch-rate-positive checks (e.g. check-hardcoded-colors, check-hardcoded-fonts, check-hardcoded-spacing, check-tailwind-arbitrary, check-tailwind-colors, check-mojibake) from `check:fast` into pre-commit so they fire on every commit.
