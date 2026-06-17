# AI Decision Ledger

Timestamped records of successful self-heals. Append a new entry for each resolved test failure or layout bug with:

- `Timestamp`
- `Root Cause`
- `Resolution`

## 2026-04-24T00:00:00Z — Phase 9: Figma Token Alignment & Fluid Spec Synchronization (Task 24)

### Figma Typography Sync Unblocked (`scripts/build-figma-variables.mjs`)

- `Root Cause`: `SKIP_TYPES` included `'typography'`, silently dropping all W3C DTCG composite typography tokens before they reached Figma. The Semantic collection had 0 typography variables, making the entire 9-style type ramp invisible to designers.
- `Resolution`: Added `SUB_PROP` map and `expandTypography()` function that walks each composite token's `$value` object and yields 5 individual scalar tokens (`font-family` STRING, `font-size` / `letter-spacing` FLOAT via dimension, `font-weight` FLOAT, `line-height` FLOAT via number). These 45 expanded vars (9 styles × 5 sub-props) are merged into the semantic collection. The alias chain is preserved — Figma variables point to Primitive collection values. Build output confirmed +45 vars, 302 total.

### camelCase CSS Debt Eradicated (`src/styles/theme.css`)

- `Root Cause`: Three separate sites in `theme.css` referenced non-existent camelCase typography CSS vars (`--semantic-typography-body-fontFamily`, `--semantic-typography-display-fontSize`, etc.) while the generated token CSS uses kebab-case (`--semantic-typography-body-font-family`, `--semantic-typography-display-font-size`). The `body` element baseline and all 4 fluid heading overrides were silently resolving to `undefined`. Two deprecated `monoXs`/`monoSm` shorthand vars also remained, pointing to removed token names.
- `Resolution`: (1) Deleted the two broken `--typography-mono-xs` / `--typography-mono-sm` shorthand aliases. (2) Renamed all 4 fluid `clamp()` overrides from `-fontSize` to `-font-size`. (3) Fixed all 5 `body {}` baseline properties to kebab-case. All 17 layout-integrity tests pass post-fix.

### Fluid Spec Documented in Token Source (`hirobius.tokens.json`)

- `Root Cause`: The 4 fluid heading styles had no machine-readable record of their `clamp()` browser overrides. Figma stores static desktop-max values; designers and future agents had no way to know the browser applied responsive scaling on top.
- `Resolution`: Added `$extensions["com.hirobius.fluid"]` blocks to `display`, `heading1`, `heading2`, and `heading3` tokens. Each block records the exact `clamp()` expression and a note explaining the Figma/browser divergence.

## 2026-04-24T16:42:08Z

- `Root Cause`: The commit hook's static semantic audit only recognized raw heading tags and a narrow set of shell components, so pages using `FoundationDocPage`, `ComponentDocPageShell`, and polymorphic `TextLockup` headings were falsely reported as having no heading structure. `PrimaryCaseStudyPage.tsx` also lacked a source-level page `h1`.
- `Resolution`: Extended `scripts/check-semantic-html.mjs` to understand the semantic shells and polymorphic text lockups that now own heading hierarchy, and added a visually hidden `h1` to `PrimaryCaseStudyPage.tsx` so both the source audit and runtime accessibility tree agree.

## 2026-04-24T17:56:45Z

- `Root Cause`: The desktop collision audit for `/hds/spacing` flagged the `128px` specimen label as touching the edge of its swatch preview because the `SpacingBar` specimen did not reserve any internal inline inset for long technical labels.
- `Resolution`: Added explicit width, box-sizing, inline padding, and max-width constraints to `SpacingBar` in `src/app/pages/hds/SpacingPage.tsx` so large spacing labels stay contained inside the specimen surface at desktop widths.

## 2026-04-24T19:15:00Z — Pre-Scale Hardening & Autonomous Guardrail Tune-Up (Task 36.5)

### CSS Variables Purged (`src/styles/theme.css`)

- `Root Cause`: `.hds-token-chip` padding used `var(--hds-space-px3)` which does not exist in the primitive scale (scale jumps from `px2` to `px4`), causing a silent no-op on that rule. Dark-mode hover color used the raw primitive alias `var(--hds-accent-200)` instead of the semantic hover token. Duplicate `--hds-surface-page`, `--hds-surface-raised`, `--hds-surface-overlay` definitions lived in both `:root` and `[data-theme="dark"]` alongside the generated semantic token equivalents. E-commerce and badge variables (`--hds-price-sale`, `--hds-badge-new`, `--hds-badge-sale`, `--hds-badge-sold-out`, `--hds-badge-featured`, `--hds-feedback-neutral`) were hardcoded hex values outside the W3C DTCG token graph. Deprecated `displayXl` and `display2` font-size clamp overrides remained after those token tiers were removed.
- `Resolution`: Replaced `--hds-space-px3` with `--hds-space-px2`. Replaced `--hds-accent-200` dark hover with `--semantic-accent-hover`. Deleted all `--hds-surface-*` duplicate vars from `:root` and `[data-theme="dark"]`; updated `src/styles/utilities.css` `.bg-page` and `.bg-raised` to consume `--semantic-color-surface-page` and `--semantic-color-surface-raised` directly. Mapped all e-commerce/badge hex vars to their closest W3C DTCG semantic tokens (error, warning, accent-rest, content-secondary). Removed the deprecated `displayXl` and `display2` clamp overrides.

### Components Patched with `React.forwardRef`

- `Root Cause`: `Tag`, `Card`, `Alert`, `Disclosure`, and `Badge` did not implement `React.forwardRef`, preventing parent components from accessing the underlying DOM node for animation, focus management, or measurement. Phase 12 / Task 37 requires all primitives to expose typed refs.
- `Resolution`: Wrapped each component in `React.forwardRef` with the correct HTML element type: `Tag` → `HTMLButtonElement`, `Card` → `HTMLDivElement`, `Alert` → `HTMLDivElement` (forwarded through `motion.div` which proxies to the underlying div), `Disclosure` → `HTMLDivElement` (ref passed to the nav-variant `div` and to `HdsSurface` for panel/card variants — `HdsSurface` already implements `forwardRef`), `Badge` → `HTMLSpanElement`. Self-heal detected a Unicode curly-quote encoding artefact introduced in `Tag.tsx` JSX attributes during the edit; corrected with `sed` before the second heal run.

### Smoke Routes Expanded (`scripts/self-heal.mjs`)

- `Root Cause`: `DEFAULT_SMOKE_PATHS` only covered four foundation pages, leaving the component registry (`/hds/components`) and the incubator lab (`/lab/incubator`) unmonitored for runtime rendering failures.
- `Resolution`: Added `/hds/components` and `/lab/incubator` to `DEFAULT_SMOKE_PATHS`. Existing `pageError` detection, console-error capture, and white-screen detection already apply to every route in the array; both new paths were verified green by `pnpm run heal:smoke`.

### Validation Engine Hardened (`tests/layout-integrity.spec.ts`, `scripts/visual-ingest.mjs`)

- `Root Cause`: `FOUNDATION_ROUTES` in the layout integrity spec did not include `/hds/components` (the component registry index) or `/lab/incubator`. `visual-ingest.mjs` used `process.exitCode = 1` (deferred exit code) rather than an explicit `process.exit(1)`, which could leave CI pipelines unaware of the failure if the pipeline only captured stdout before process teardown. The `layout-audit.ts` helper was confirmed to use `getBoundingClientRect()` — the browser bounding box API — for all three triggers (Gap Mandate, Containment Rule, Stretch Rule), enforcing physical pixel-level collision and overflow detection.
- `Resolution`: Added `/hds/components` and `/lab/incubator` to `FOUNDATION_ROUTES` so layout bounding-box audits now run on these surfaces. Patched `visual-ingest.mjs` to call `browser.close()` then `process.exit(1)` explicitly on threshold breach or capture failure, removing the deferred `process.exitCode` pattern. Both `pnpm run heal` and `pnpm run heal:smoke` exit 0.

## 2026-04-24T20:29:43Z

- `Root Cause`: HDS V2 did not have a standalone component-promotion CLI or a Husky-powered pre-commit parity gate, so drafted lab components were being promoted manually and commits could bypass the live-vs-local visual drift check for the Typography and Color foundation pages.
- `Resolution`: Added `scripts/promote.mjs` plus the `pnpm promote` package script to move standalone lab component files into `src/app/components/` only after verifying the source already uses `React.forwardRef`, with an explicit abort message instructing the developer to add polymorphism before promotion. Installed and initialized Husky, created `.husky/pre-commit` to run `pnpm run heal` followed by `node scripts/visual-ingest.mjs --foundation-parity`, and extended `scripts/visual-ingest.mjs` so the hook launches a local Vite server and fails with exit code `1` if `/hds/typography` or `/hds/color` drifts more than 5% from `https://hirobius.io`.

## 2026-04-24T20:54:20Z

- `Root Cause`: The heal lane reported `/hds/process` and `/hds/elevation` as crashing, but the failures came from two distinct regressions. First, `hirobius.tokens.json` still carried the stale `$extensions["com.hirobius.fluid"]` namespace on four semantic typography tokens, so `scripts/build-tokens.mjs` aborted before the Playwright web server could boot, which made `/hds/elevation` fail as collateral rather than from page code. Second, `/hds/process` no longer had a live route in `src/app/routes.tsx`; after restoring it as a legacy alias to `/hds/case-studies/hirobius`, the smoke lane exposed a React `validateDOMNesting` error because `HirobiusCaseStudyPage.tsx` embedded block-level `Token` nodes inside paragraph copy.
- `Resolution`: Renamed the stale typography extension namespace to `com.figma.variables` so the token compiler and test server start cleanly again. Restored `/hds/process` as an explicit redirect route to the Hirobius case study, then replaced the inline `Token` usages in prose with `InlineCode compact` so the redirected page renders without console errors. Verified the repaired routes with focused `pnpm run heal:smoke`, a clean `pnpm check:ghost-tokens`, and a full passing `pnpm test:layout` run against a stable local server on port `5200`.

## Feature flag lifecycle policy (p7-3, 2026-05-01)

Every flag in `bridge.config.json` is a temporary scaffold around new bridge / pipeline behavior. To prevent the file from accreting permanent dead branches, every flag follows a three-stage lifecycle:

1. **Introduce (default `false`)** — the flag is added to `bridge.config.json` in the same commit that lands the guarded code path. Default MUST be `false`. The flag's owner unit, introduction date, and consumer file are recorded in `bridge.config.json#flagAudit`.
2. **Flip to `true`** — only after BOTH of the following are satisfied:
   - The owner unit's `validationCmd` exits 0 in CI.
   - At least 24 hours of production telemetry (`pnpm telemetry:report`) shows zero retry-exhaustion incidents attributable to the new code path.
   The flip lands in its own commit with a ledger entry documenting the telemetry snapshot used for the decision. p7-3 itself does NOT flip flags — that is a per-flag decision deferred to whoever owns each unit.
3. **Delete** — once a flag has been at default `true` for ≥ 7 days AND telemetry remains clean (zero retry-exhaustion incidents in `pnpm telemetry:report` over that window), delete BOTH the entry in `bridge.config.json` AND the runtime `if (config.<flag>Enabled)` guard in the consumer (e.g., `scripts/hds-bridge.mjs`). The behavior becomes unconditional. Document each deletion in this ledger with a `## Flag deletion: <flagName> (YYYY-MM-DD)` heading covering: owner unit, dates of introduce/flip/delete, telemetry summary at deletion time, and the consumer file(s) edited.

**Deletion checklist (when a flag is eligible):**

- [ ] Confirm flag has been default `true` for ≥ 7 days (compare `flagAudit.<flag>.flippedAt` to today).
- [ ] Confirm `pnpm telemetry:report` exits 0 with zero retry-exhaustion incidents over the last 7 days.
- [ ] Remove the key from `bridge.config.json`.
- [ ] Remove the `flagAudit.<flag>` entry from `bridge.config.json`.
- [ ] Remove the runtime guard in the consumer file; the guarded code becomes the only branch.
- [ ] Run all four pre-commit gates (`run-validator-tests`, `test-retry-loop`, `validate-manifest`, `check-manifest-drift`) plus `telemetry-report`.
- [ ] Append a ledger entry under `## Flag deletion: <flagName>`.

### Flag audit (as of 2026-05-01)

| Flag | Owner unit | Default | Introduced | Age | Eligible to delete? |
|---|---|---|---|---|---|
| `gatekeeperEnabled` | p0 foundation | `false` | 2026-04-28 | 3d | No — default still `false`, never flipped |
| `retryLoopEnabled` | p3-2 retry-loop (flipped 2026-04-29 in `de29b1e6`) | `true` | 2026-04-28 (flipped 2026-04-29) | 2d since flip | No — < 7d at `true` |
| `selectionSerializerEnabled` | p0 foundation | `false` | 2026-04-28 | 3d | No — default still `false` |
| `authEnabled` | p5-3 auth-hmac | `false` | 2026-04-28 (consumer landed 2026-05-01) | 0d since consumer | No — default still `false` |
| `lintEnabled` | p0 foundation | `false` | 2026-04-28 | 3d | No — default still `false` |
| `contrastEnabled` | p0 foundation | `false` | 2026-04-28 | 3d | No — default still `false` |
| `correlationEnabled` | p5-2 correlation | `false` | 2026-05-01 | 0d | No — landed today |

**Eligible-for-deletion this pass: 0.** No flag in `bridge.config.json` satisfies the "≥ 7 days at default `true` with zero retry-exhaustion incidents" gate. `retryLoopEnabled` is closest (2 days at `true`); revisit on 2026-05-06 at the earliest, contingent on telemetry. All other flags remain at default `false` and cannot enter the deletion track until they are flipped.

- `Root Cause`: No written policy governed how feature flags introduced by Phase 5 / 7 units exit the codebase, so every `*Enabled` toggle in `bridge.config.json` was on track to become permanent dead branching.
- `Resolution`: Documented the introduce → flip → delete lifecycle above, codified the 24h telemetry gate for flips and the 7-day stability gate for deletions, added a `flagAudit` block to `bridge.config.json` recording each flag's introduction date and owner unit, and audited all 7 current flags. Zero flags were eligible for deletion this pass; the audit table is the baseline future cleanup commits compare against.

## 2026-05-02T05:17:00Z — Multi-agent overnight burndown infrastructure (T3)

**Session:** session:fresh-2026-05-01-w5-a1 (Adrian-driven)
**Decision:** Stand up a pull-based, tier-aware coordination layer so 5×5 parallel agent windows can drain the orchestration queue overnight without humans in the loop. Three artifacts: `scripts/orchestration-watcher.mjs` (daemon → `docs/ai/ready-queue.json`), `docs/ai/MULTI_AGENT_OVERNIGHT.md` (operator + agent protocol), `docs/ai/PROMPT_TEMPLATES.md` Template 6 (autonomous-burndown loop prompt).
**Alternatives considered:**
  - Push-based inter-window messaging (rejected: Claude Code windows can't receive interrupts from peers; only file-system polling is viable).
  - Single window, sequential drain (rejected: throughput math says 25 units/night vs. 125 with 5 windows).
  - Free-for-all without tiers (rejected: T4 strategic units would either silently default-pick brand/multi-tenant decisions or block the queue waiting for Adrian; tier system + mandatory ledger + unblock-then-punt threads the needle).
**Downstream ramifications:**
  - All future overnight dispatch reads `ready-queue.json` instead of `orchestration.json` directly. If the watcher dies, agents will stall on stale queue data — `scripts/audit-claims.mjs --strict` is the morning canary.
  - T3 + T4 units now produce mandatory ledger entries → this file will grow ~5-15 entries/night. Periodic compression into ARCHITECTURE_DECISIONS.md may be needed once it crosses ~500 lines.
  - T4 punt protocol (`status: in-progress` + `agentNotes: "PUNT TO ADRIAN — ..."`) introduces a new orchestration state agents must respect. Existing validators already accept `in-progress`; no schema change required.
  - Window-to-cluster affinity (w5 manifest serializer, w6 validators, w7 docs, w8 components, w9 mixed) reduces but does not eliminate file conflicts. `fileGroups` in queue exposes residual conflicts for agent self-serialization.
**Reversibility:** reversible. Watcher is a single ~280-line script; protocol doc is additive; Template 6 is appended to PROMPT_TEMPLATES.md. Removal is a 3-file revert.
**Ledger context:** Optimized for (1) zero Adrian intervention overnight, (2) clean worktree by morning (no `git push`), (3) empowered agents that make best-practice architectural calls in his stead with traceability via this ledger, (4) cheapest model per tier (Adrian directive 2026-05-01: cost discipline). T4 carve-out for `opus` + max effort is justified because strategic decisions touching brand/multi-tenant/business-model genuinely need the strongest reasoning lever — but only there.

## 2026-05-02T07:22:00Z — Overnight backlog approval pass + 2 idea-kills (T3)

**Session:** session:fresh-2026-05-01-w5-a1 (Adrian-driven grilling)
**Decision:** Triaged 22 hidden-from-watcher units (19 T4-proposed-approval + 3 needs-grilling). Approved 14 with locked-in defaults, denied 2 (idea kills), left 6 gated on real-world business state.
**Alternatives considered:**
  - Wait for Adrian to grill every T4 individually (rejected: kills overnight throughput).
  - Auto-approve all 22 without locked-in defaults (rejected: T4 strategic units would punt en masse with no agent guidance, defeating the unblock-then-punt protocol).
**Decisions in detail:**
  - **Killed:** `backlog-3-component-prefix-rename` (Hydra rebrand — direction abandoned). `10p-1-rtl-ltr-language-switcher-qa` (RTL/i18n — direction abandoned). Status: denied. Agents will skip.
  - **Approved with locked-in defaults (no further input needed):**
    - `8h-1-token-rigor-swiss-mapping` — produce gap report against Swiss canon, no remediation in same unit.
    - `8h-2-a11y-baseline-schema` — minimal rule set per component type (interactive/media/text), WCAG 2.1 AA only.
    - `8h-3-quality-gates-lighthouse-axe` — ≥90 Lighthouse a11y + 0 critical axe; verify CI is actually gating PRs.
    - `12c-1-hirobius-case-study-homepage` — Swiss-canon scaffold with placeholder copy; Adrian populates later.
    - `12f-4-video-motion-graphics-tool` — sonnet, capability requirement: handle wild/unusual video.
    - `12m-mt-build-pipeline` — straightforward; deps decided.
    - `12m-mt-figma-master-per-tenant` — straightforward; deps decided.
    - `12m-mt-onboarding-workflow` — agent's best judgment for 30-min target with MANDATORY ledger entry on workflow steps + tradeoffs.
    - Plus the 6 from category A (12j hex fixes, api-extractor, internal/public JSDoc, mobius slice pattern, 12v sys modes).
  - **Left gated (real-world business or legal weight):**
    - `12m-mt-typography-licensing` — Fontshare licensing has legal weight; awaiting Adrian.
    - `12u-cc-*` cluster (6 units, Concrete Creations) — gated on WA LLC + Stripe verification + photographer + legal review. Status remains proposed-approval.
**Schema cleanup:** Dropped non-existent dep `12i-bloat-mobius-selector-consolidation` from `12i-bloat-mobius-store-slice-pattern`.
**Downstream ramifications:**
  - Watcher view jumped from 57 → 66 eligible + 22 blocked = ~88 in active overnight flow. 25 agents × 5 = 125 still aspirational, but punt rate on T4 units fills the gap.
  - 2 stale claims surfaced (>4h) — fresh agents may steal overnight per claim protocol.
  - Future archaeology: the 6 Concrete Creations units stay in queue as a forcing function for Adrian's real-world business setup; not deleted.
**Reversibility:** approvals reversible (flip approval back to proposed). Denies reversible (un-deny). Idea-kills are soft — units stay in JSON for traceability.
**Ledger context:** Adrian explicitly said "stop building scared." Locked-in defaults convert his trust into agent autonomy without losing the audit trail.

## 2026-05-02T07:38:00Z — Full backlog autonomy pass: 30 more approved (T3)

**Session:** session:fresh-2026-05-01-w5-a1 (Adrian: "let's get all task groups exposed and built out autonomously")
**Decision:** Grilled the remaining 31 gated units. Approved 30 with locked-in defaults captured in each unit's agentNotes. Left 1 (12f-3-vibe-sketchbook-tools-section, status=parked + "decision pending") on the shelf.
**Alternatives considered:**
  - Leave Concrete Creations + typography-licensing gated (rejected: deps + PUNT protocol naturally gate the truly-strategic parts; approving exposes everything for cascading flow).
  - Approve without locked-in defaults (rejected: T4 units would punt en masse with no agent guidance).
**Approval cohorts:**
  - **Doc-coherence T1 (4):** 12j-zindex/-token-count/-caption-size/-registry-kebab. Pure data fixes against source-of-truth.
  - **Bloat refactor T3+T4 (3):** 12i-bloat-hdslayout-architectural-split (T4 opus), 12i-bloat-mobius-glsl-extract (T3), 12i-bloat-mobius-perf-instrumentation (T3).
  - **Public-API T3+T4 (8):** storybook-setup (Storybook 8 picked over Histoire/Ladle, justified in ledger), manifest-schema-semver, react-19-migration-path (PLAN-DOC-ONLY scope locked), changelog-automation (changesets), monorepo-workspace-split, per-component-changelog, codesandbox-embed, internal/public JSDoc.
  - **Perf T2+T3 (3):** 10o-17-perf-budget-enforce (LCP<2.5/CLS<0.1/INP<200), three-js-budget-per-tier, prefetch-preload-strategy.
  - **Test T2 (3):** contract-tests-primitives, keyboard-trap-detection, focus-flow-analysis.
  - **Infra T3 (1):** pod-cost-tracking telemetry.
  - **Composite tokens T3 (1):** 12v-token-composite-class-system.
  - **Component pages T2 (1):** 12a-2-component-page-refactor.
  - **Concrete Creations cluster T3+T4 (6):** all approved; deps gate downstream until 12m-mt-onboarding-workflow + 12n-api-build-lib-in-ci land. wa-legal-pages + launch-checklist will produce DRAFTS and PUNT to Adrian by design (legal review + WA business setup).
  - **Multi-tenant typography-licensing T4 (1):** approved as DOC-PRODUCTION; legal review locked behind PUNT.
**Locked-in decisions captured in agentNotes (so agents don't re-grill):**
  - Storybook 8 over Histoire/Ladle (largest ecosystem).
  - changesets over release-please (semver integration).
  - LCP<2.5s / CLS<0.1 / INP<200ms / TBT<200ms (industry-standard budgets).
  - JSON-in-repo for product catalog (simplest; CMS migration later).
  - Stripe Checkout test-mode in this unit; live-mode flip is separate.
  - SIL-OFL fonts only in tenant template; Fontshare requires per-tenant legal review.
  - React 19 migration: produce PLAN ONLY, do not execute.
**Downstream ramifications:**
  - Watcher view jumped from 54 → 61 eligible + 40 blocked (was 19) = ~121 in active flow with deps cascading. Matches the 25-agent × 5-unit/night = 125 capacity.
  - 6 Concrete Creations units + typography-licensing will produce DOCS / DRAFTS / SCAFFOLDS overnight, not commercial commits. Legal + business work stays Adrian's gate.
  - Expected morning PUNT entries: wa-legal-pages, launch-checklist, typography-licensing — review queue for Adrian.
  - 12i-bloat-hdslayout-architectural-split has 6 deps — won't drain tonight, but will cascade as those land.
**Reversibility:** All approvals reversible. Locked-in agentNote defaults are advisory — agent can override with ledger entry justification.
**Ledger context:** Adrian explicit directive "build out autonomously, keep going." Converting his trust into agent autonomy with full audit trail. The 30 locked-in defaults represent ~30 architectural decisions made on his behalf — each one queryable in the morning via grep on agentNotes for "DEFAULT (Adrian 2026-05-02)".

## 2026-05-02T00:00:00.000Z — 12i-bloat-mobius-store-slice-pattern (T3)

**Session:** session:fresh-2026-05-02-w3-a5
**Decision:** Introduce five named slice namespaces (geometry, material, motion, layout, interaction) as nested objects inside MobiusState, composing slice types from existing field categorizations, while retaining all 38+ flat top-level fields as getter shims via Object.defineProperty on the Zustand state; Phase 2 (shim removal + call-site migration) deferred.
**Alternatives considered:**
  - Flat shim via re-export barrel: simpler but doesn't add slice namespaces to devtools; call sites never learn the new API.
  - Direct slice (no shim): cleanest outcome but breaks ~100+ existing subscribers in one shot; too risky without full call-site audit.
  - Namespaced top-level only (no nested object): `s.geometryTubeRadius` etc — improves readability slightly but doesn't give devtools a grouped tree and doesn't match Zustand slice pattern idiom.
  - Chosen: nested slice objects + shim — Phase 1 gives devtools the grouped tree immediately, call sites keep working without changes, Phase 2 can migrate each subscriber independently.
**Downstream ramifications:**
  - 6 files import useMobiusStore: MobiusScene.tsx (~40 selectors), LogoLabSketch.tsx (~12 selectors), MobiusLogo.tsx (~6 selectors), MobiusShellLayer.tsx (~5 selectors), HDSLayout.tsx (~7 selectors), PortfolioHomePage.tsx (~1 selector). All continue working via flat shim in Phase 1.
  - MobiusState type widens to include slice sub-objects; existing `Partial<MobiusState>` spreads in setPreset/syncRoute still work because flat fields remain.
  - MOBIUS_DEFAULTS and PRESETS types remain unchanged — they reference MobiusUniforms, not MobiusState slices.
**Reversibility:** Partially reversible — Phase 1 shim maintains backwards compat; removing slice objects from the type requires only deleting the slice type extensions and Object.defineProperty block.
**Ledger context:** mobiusStore has 38 flat fields across MobiusUniforms (47 fields), MobiusLayoutState (9 fields), MobiusRouteSplashState (6 fields), and 6 scalar state fields; slicing improves devtools readability and component subscription granularity without breaking existing call sites.
