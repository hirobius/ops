# Gate Replaceability Plan

**Generated:** 2026-05-06  
**Script:** `node scripts/audit-gate-replaceability.mjs --summary`  
**Source:** `docs/guardrails/registry.json` (75 gates total)

---

## Summary

| Verdict | Count | % of Total |
|---------|-------|------------|
| **Fully replaceable** — drop the custom script | 19 | 25% |
| **Partially replaceable** — hybrid (industry tool + residual custom) | 20 | 27% |
| **Genuinely custom** — no industry equivalent | 36 | 48% |

**Target after migration: ≤ 20 gates** (down from 75). The 36 "genuinely custom" count is the floor — most of the partial bucket can collapse further once the HDS-specific residual rules are folded into existing custom gates (e.g. token-paths-ratchet absorbs several spacing/color token checks).

---

## Fully Replaceable — Drop These

Sorted by migration cost ascending. Every row includes the `pnpm add -D` command.

| Gate ID | Current LOC | Replace With | Install | Migration Cost |
|---------|-------------|--------------|---------|----------------|
| `audit-bundle` | 48 | rollup-plugin-visualizer (via vite config) | *(move to vite.config.mjs plugin)* | trivial |
| `audit-deps` | 65 | `pnpm audit` native | *(remove wrapper, call directly in CI)* | trivial |
| `audit-sbom` | 53 | @cyclonedx/cyclonedx-npm | *(already installed — call directly)* | trivial |
| `check-aria-labels` | 174 | eslint-plugin-jsx-a11y | `pnpm add -D eslint-plugin-jsx-a11y` | trivial |
| `check-dimensions` | 125 | stylelint | `pnpm add -D stylelint` | trivial |
| `check-format-staged` | 96 | lint-staged + prettier | `pnpm add -D lint-staged` | trivial |
| `check-hardcoded-breakpoints` | 123 | eslint (no-magic-numbers) | *(eslint already installed)* | trivial |
| `check-image-loading` | 119 | eslint-plugin-jsx-a11y | `pnpm add -D eslint-plugin-jsx-a11y` | trivial |
| `check-knip-ratchet` | 122 | knip --max-issues | *(knip already installed)* | trivial |
| `check-licenses` | 88 | license-checker-rseidelsohn | `pnpm add -D license-checker-rseidelsohn` | trivial |
| `check-lockfile-integrity` | 83 | pnpm install --frozen-lockfile | *(one-liner in CI/hook)* | trivial |
| `check-mojibake` | 167 | editorconfig-checker | `pnpm add -D editorconfig-checker` | trivial |
| `check-og-meta` | 122 | html-validate | `pnpm add -D html-validate` | trivial |
| `check-secrets` | 95 | gitleaks direct hook | *(already using gitleaks binary)* | trivial |
| `check-semantic-html` | 321 | eslint-plugin-jsx-a11y | `pnpm add -D eslint-plugin-jsx-a11y` | trivial |
| `check-tailwind-arbitrary` | 116 | eslint-plugin-tailwindcss | `pnpm add -D eslint-plugin-tailwindcss` | trivial |
| `check-tailwind-colors` | 120 | eslint-plugin-tailwindcss | `pnpm add -D eslint-plugin-tailwindcss` | trivial |
| `check-type-coverage-ratchet` | 100 | type-coverage | `pnpm add -D type-coverage` | trivial |
| `check-perf-budget` | 240 | size-limit | `pnpm add -D size-limit @size-limit/vite` | small |

**Total LOC eliminated: ~2,071 lines** across 19 scripts.

### High-leverage quick wins (trivial cost, highest LOC savings)

1. **`check-semantic-html`** → `eslint-plugin-jsx-a11y` — 321 LOC for rules that are in the plugin's `recommended` preset. One config line.
2. **`check-format-staged`** → `lint-staged` — 96 LOC re-implementing industry standard. lint-staged also handles partial staging correctly.
3. **`check-aria-labels` + `check-image-loading`** — both map to the same `eslint-plugin-jsx-a11y` install. One dep, two gates eliminated.
4. **`check-tailwind-arbitrary` + `check-tailwind-colors`** — both map to `eslint-plugin-tailwindcss`. One dep, two gates.
5. **`check-mojibake`** → `editorconfig-checker` — 167 LOC replaced by `.editorconfig: charset = utf-8` + one CLI command.

---

## Partially Replaceable — Hybrid

Industry tool covers the bulk; a small residual rule must stay custom.

| Current Gate | LOC | Industry Tool Covering Most | Residual Custom Rule | Recommended Config Snippet |
|---|---|---|---|---|
| `audit-pages` | 144 | stylelint per-dir overrides | Page vs. component directory scoping | `stylelint "src/**/*.css" --config stylelint.pages.cjs` |
| `check-typography-discipline` | 346 | stylelint font-family rules | HDS single-weight + casing-via-eyebrow policy | `{ "font-weight": ["/^var\\(--hds-/"] }` |
| `check-code-connect` | 64 | `@figma/code-connect` CLI | Bidirectional parity check (React ↔ Figma) | `npx figma connect publish --dry-run` |
| `check-doc-structure` | 307 | markdownlint-cli2 | TSX DocPageHeader structural invariant | `markdownlint-cli2 "docs/**/*.md"` |
| `check-link-integrity` | 444 | lychee | React Router route-string validation | `lychee --config .lychee.toml "docs/**/*.md"` |
| `check-focus-states` | 179 | eslint-plugin-jsx-a11y + axe-core | `var(--hds-focus-ring)` token enforcement | `{ "rules": { "jsx-a11y/interactive-supports-focus": "error" } }` |
| `check-hardcoded-colors` | 241 | stylelint declaration-property-value | JSX `style={{ color: "#fff" }}` scanning | `{ "color": ["/^var\\(--/"] }` |
| `check-hardcoded-spacing` | 164 | stylelint declaration-property-value | HDS token namespace existence check | Fold token-existence into `check-token-paths-ratchet` |
| `check-style-discipline` | 362 | stylelint + eslint react/forbid-component-props | 6-inline-props threshold + suspicious style refs | `{ "react/forbid-component-props": ["error", {"forbid": ["style"]}] }` |
| `check-manifest-schema-semver` | 159 | json-schema-diff | Semver breaking/non-breaking classification | `npx json-schema-diff schema.lock.json manifest/schema.json` |
| `check-reduced-motion` | 142 | stylelint-a11y | Framer Motion `useReducedMotion()` hook check | `stylelint-a11y/media-prefers-reduced-motion` |
| `check-security-baseline` | 199 | gitleaks + snyk | CDN import + innerHTML injection scanning | Reduce to ~30-line regex after snyk covers deps |
| `check-unresponsive-grids` | 148 | stylelint | JSX `isMobile` guard check | Custom stylelint rule for CSS; keep JSX check inline |
| `audit-component-integrity` | 373 | @microsoft/api-extractor | --completeness + --docs manifest checks | `api-extractor run --local` for --api sub-mode |
| `audit-tokens` | 1,131 | Style Dictionary | HDS component-level token compliance | Adopt SD for build; keep ~200-line surface compliance check |
| `check-contrast` | 222 | axe-core / @axe-core/react | Design-time token-level contrast pairs | Keep design-time check; add `vitest-axe` for runtime |
| `check-css-integrity` | 121 | Style Dictionary | Until SD is adopted, sync check stays | `sd build --config style-dictionary.config.cjs` |
| `check-route-smoke` | 111 | Playwright | n/a (Playwright is a full replacement) | `playwright test --config playwright.smoke.config.ts` |
| `check-token-structure` | 178 | Style Dictionary W3C DTCG mode | HDS tier-hierarchy enforcement | SD validates W3C DTCG; keep ~50-line tier check |
| `check-frozen-demos` | 62 | Chromatic / Percy | Code-structure "no bespoke previews" rule | Chromatic for visual regression; keep 1-rule custom check |

---

## Genuinely Custom — Keep

These 36 gates have no industry equivalent. They are the meaningful surface of the guardrail system.

| Gate ID | LOC | Keep Reason |
|---------|-----|-------------|
| `audit-soft-gates` | 448 | HDS registry self-governance; classifies gates for promotion |
| `audit-batch-deliverables` | 280 | AI agent deliverable validation against orchestration.json |
| `audit-claims` | 100 | Stale AI agent claim detection |
| `audit-exceptions` | 269 | HDS-specific suppression marker audit (spacing-ok, binding-ok, etc.) |
| `audit-figma-system` | 466 | Repo ↔ Figma variable export comparison |
| `audit-gate-purity` | 487 | Gate non-determinism detection (fs writes, Date.now, network) |
| `audit-gates-supportjson` | 205 | --json compliance ratchet across gate inventory |
| `audit-strengths` | 387 | Documented differentiators integrity check |
| `audit-tiers` | 403 | HDS component tier classification (primitive/pattern/utility) |
| `check-asset-manifest` | 199 | Asset slot system manifest integrity |
| `check-attributions` | 69 | ATTRIBUTIONS.md machine-checkable registry |
| `check-binding-drift` | 173 | Component-tier CSS var → masters pipeline binding coverage |
| `check-brand` | 130 | Living docs ↔ hirobius.tokens.json brand values sync |
| `check-exemptions` | 136 | HDS-specific inline suppression marker well-formedness |
| `check-fixture-stubs-ratchet` | 180 | Monotonic-decrement ratchet on stub fixtures |
| `check-legacy-hds-vars` | 89 | Deprecated --hds-text/dim/subtle CSS var migration guard |
| `check-manifest-drift` | 47 | hds-manifest.json drift vs. component source |
| `check-mono-roles` | 63 | Raw monospace in prose → enforces InlineCode component |
| `check-motion` | 187 | HDS motion feedback mandate (token-timed response) |
| `check-page-shell` | 61 | Forbids Container in pages; enforces Page wrapper |
| `check-ref-forwarding` | 106 | forwardRef enforcement on HDS form controls |
| `check-registry` | 108 | hds-registry.json completeness and page file coverage |
| `check-route-coverage` | 170 | Every routable page in layout-integrity test set |
| `check-source-canon` | 477 | HDS Swiss-canon rules on hand-authored TSX |
| `check-template-source-of-truth` | 174 | Generator + output co-modification enforcement |
| `check-tenant-tokens` | 138 | Per-tenant token override structural validation |
| `check-tier-bypass` | 94 | primitive → semantic → component CSS var hierarchy |
| `check-token-descriptions` | 217 | Token description quality for LLM output quality |
| `check-token-paths-ratchet` | 417 | HDS design token path resolution + monotonic ratchet |
| `check-token-rebake-needed` | 159 | Guards that build-tokens.mjs was re-run after token changes |
| `check-token-renames` | 120 | Token path rename/deletion migration contract |
| `check-unit-overlap` | 324 | AI agent file-overlap pre-dispatch detector |
| `check-validator-wiring` | 533 | registry.json firingChannel ↔ actual invocation audit |
| `generate-strength-report` | 1,084 | Internal Integrity + Industry Benchmark scoring |
| `validate-fixture-proof-of-firing` | 443 | Every gate has proven passing + violating fixtures |
| `validate-orchestration` | 321 | orchestration.json schema for AI agent coordination |

---

## Adjacent Reinvention Findings

The following scripts are **not gates** but reinvent industry tools at significant scale:

### `scripts/build-tokens.mjs` (1,494 LOC) — reinvents Style Dictionary

This is the most significant adjacent reinvention in the repo. `build-tokens.mjs` compiles `hirobius.tokens.json` into:
- `src/styles/tokens.css` — CSS custom properties
- `src/app/design-system/generated-tokens.ts` — TypeScript constants

**[Style Dictionary](https://amzn.github.io/style-dictionary)** (and its W3C DTCG-compliant companion `@tokens-studio/sd-transforms`) does exactly this. Style Dictionary:
- Reads W3C DTCG token JSON (which `hirobius.tokens.json` already follows)
- Outputs CSS custom properties, TypeScript, Sass, and more via configurable transforms
- Has native alias resolution, multi-theme support, and incremental builds
- Is maintained by Amazon and Tokens Studio with active community

**Downstream effects of adopting Style Dictionary:**
- `check-css-integrity` dissolves (drift impossible when CSS is generated)
- `check-token-rebake-needed` dissolves (SD build is the source of truth)
- `audit-tokens` shrinks from ~1,130 to ~200 LOC (SD handles structural validation; only HDS-specific surface compliance remains)
- `check-token-structure` shrinks (SD validates W3C DTCG format natively)

**Estimated net reduction from SD adoption alone: ~3,000 LOC across gates + build scripts.**

### `scripts/check-validator-wiring.mjs` (533 LOC) — partially reinvents existing CI wiring tools

The wiring validation logic could be a simple grep over `.husky/` and `.github/workflows/` rather than a 533-line parser. The complexity is in the HDS-specific channel vocabulary — worth reviewing for simplification.

---

## Migration Impact on Strength Scores

### Gate count reduction: 75 → ~20 (target)

Eliminating the 19 fully replaceable gates immediately drops the count to **56**. Collapsing partial gates reduces further toward the ~20 target.

### Strength score effects:

**A3 (Breadth of Coverage):** The numerator currently counts all 75 gates. After migration, the remaining ~20 genuinely custom gates represent *higher-quality, higher-specificity* coverage. The A3 score will decrease in raw gate count but improve in coverage quality (industry tools cover more surface for less custom LOC).

**A4 (Gate Density per KLOC):** The 75-gate denominator drops. The density metric improves because the remaining gates are all genuinely custom. The "bloat" of reimplementing eslint rules inflated A4 artificially.

**B-series (Industry Benchmark):** Adopting eslint-plugin-jsx-a11y, size-limit, Playwright, and Style Dictionary directly improves the Industry Benchmark score — these are recognized standard tools that auditors recognize. A bespoke check-semantic-html.mjs is invisible to an external auditor; `eslint-plugin-jsx-a11y` in package.json is not.

**Net assessment:** The strength scores get *better* after migration, despite fewer gates. The target of <20 custom gates is achievable and represents a stronger system — fewer maintenance burdens, better industry coverage, and a clearer "genuinely custom" surface that is defensible to external reviewers.

---

## Recommended Migration Order

1. **Week 1 (trivial batch):** Add `eslint-plugin-jsx-a11y` + `eslint-plugin-tailwindcss` + `lint-staged` → eliminate 7 gates in one PR
2. **Week 2 (stylelint batch):** Add stylelint with per-directory config → absorb 5–6 partial gates, eliminate 3 full gates
3. **Week 3 (Style Dictionary):** Migrate `build-tokens.mjs` to SD → dissolves `check-css-integrity`, `check-token-rebake-needed`, shrinks `audit-tokens`
4. **Week 4 (tools batch):** Add `type-coverage`, `license-checker-rseidelsohn`, `editorconfig-checker`, `size-limit` → 5 more gates gone
5. **Ongoing:** Playwright smoke tests, Chromatic for visual regression (attended-only, larger effort)
