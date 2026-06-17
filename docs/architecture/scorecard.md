# HDS Maturity Scorecard

> Tracks percentage completion per surface area against an "agency-platform-ready" bar. Honest grading — solo-functional ≠ ready-for-clients.
>
> **How to update:** when a unit lands that materially moves a row, edit the row + bump the date. Composite is a weighted rollup, not a simple average.

---

## Composite — agency-platform readiness

| Date | Composite | Note |
|---|---|---|
| 2026-05-01 (post self-grill) | **30%** | Strong foundation, weak operationalization, multi-tenant unbuilt |
| 2026-05-01 (post Wave 3 dispatches) | **45%** | Bundle -80%, multi-tenant decided, 9 of 11 flags ON, validate-manifest + validate-orchestration hard-fail |

Weighting (sums to 100):

| Surface | Weight |
|---|---|
| Foundation (tokens / components / docs) | 25% |
| Production hardening (CI / perf / a11y / tests) | 20% |
| LLM pipeline | 10% |
| Figma plugin | 10% |
| Multi-tenant agency platform | 25% |
| Pilot client (Concrete Creations) | 10% |

---

## Per-surface scorecard

### Token system — **60%** (was 55%)

- ✅ DTCG source + 3-tier (primitive/semantic/component) live
- ✅ build-tokens compiler emits CSS, TS, Tailwind, manifest
- ✅ Multi-tenant scope decided (Option A `[data-tenant=X]`)
- ✅ Tenant overlay format + JSON Schema spec'd
- ✅ Concrete Creations tenant scaffolded (placeholder hexes)
- ⏳ Build pipeline tenant emit (`12m-mt-build-pipeline`)
- ⏳ Tenant runtime provider (`12m-mt-tenant-runtime-provider`)
- ⏳ Token rebake in pre-commit (`12v-token-rebake-in-pre-commit`)
- ⏳ Token rename detection (`12v-token-rename-detection-test`)
- ⏳ Typed variant keys (`12v-token-typed-variant-keys`)

To 80%: build pipeline + runtime provider + rebake-in-pre-commit.

### Component library — **55%** (was 50%)

- ✅ 29 primitives + 9 patterns + 5 templates manifested
- ✅ Slot-based binding for 13 GENERATIVE_SUBSET components
- ✅ Lucide unified (Phosphor dropped)
- ✅ Pod 3 dropped 870 LoC dead code; manifest scanner correctly excludes 10 demo helpers
- ⏳ Storybook / Histoire / Ladle (`12n-api-storybook-setup`)
- ⏳ API extractor (`12n-api-extractor-wired`)
- ⏳ Manifest schema semver (`12n-api-manifest-schema-semver`)
- ⏳ HDSLayout architectural split (5-module, plan ratified)

To 75%: Storybook + API extractor + HDSLayout split.

### Doc site — **65%** (was 55%)

- ✅ Three-column shell, cmd-k, theme toggle, TOC scrollspy
- ✅ Manifest-driven projection
- ✅ Elevation reconciled to 4-role across all surfaces
- ✅ Typography hot-fix (Clash Display 500 + 3-family system documented correctly)
- ✅ 6 verified 12j-doc-coherence units shipped
- ✅ 10 false-positive 12j units denied (clean signal)
- ⏳ Snapshot baseline rebake post-elevation+typography
- ⏳ 17 → 50+ route layout coverage (`12i-quality-test-route-coverage-50`)
- ⏳ Theme `prefers-color-scheme` listener (`12j-doc-theme-prefers-color-scheme-listener`)
- ⏳ TOC scrollspy dynamic content (`12j-doc-toc-scrollspy-dynamic-content`)

To 80%: route coverage + snapshot rebake + theme listener.

### LLM pipeline — **50% built / 35% activated** (was 40/25)

- ✅ Hermes3 → bridge → plugin live
- ✅ Retry-loop + 5 validators (manifest, token, a11y, swiss-canon, parse-jsx)
- ✅ Phase 5 + 6 flag flips (9 of 11 flags ON)
- ✅ STYLE CANON + table-composition COMPLETE EXAMPLE in system prompt
- ⏳ Prompt regression suite scaffold (Pod A3 in flight)
- ⏳ Daily synthetic generation cron
- ⏳ gatekeeperEnabled flag flip (depends on prompt regression)
- ⏳ Telemetry alerting on retry-exhaust > 10%

To 75/65: prompt regression goldens captured + gatekeeper flipped + daily cron.

### Figma plugin — **55% built / 35% activated** (was 45/25)

- ✅ SSE stream + canvas writes + selection extraction + token sync
- ✅ Phase 5 auth envelope flag flipped
- ✅ Phase 6 read path flag flipped (selection serializer + lint + contrast + reverse token sync + snapshot + xpath)
- ⏳ Auth-secret UI handler (`12l-figma-plugin-auth-secret-wiring`)
- ⏳ Bridge URL config extraction (`12l-figma-plugin-bridge-url-config`)
- ⏳ Endpoint health monitor (`12l-figma-plugin-endpoint-health-monitor`)
- ⏳ §7 auth envelope (`12h-2`)
- ⏳ Template injection (`12h-3`)
- ⏳ Build status sync (`12h-4`)

To 75/55: auth-secret wiring + bridge URL config + 12h-2/3/4.

### Validator suite — **65% built / 45% gated** (was 55/30)

- ✅ 45 `check:*` scripts + 5 LLM validators + manifest gates
- ✅ validate-manifest hard-fail in pre-commit (was muted)
- ✅ validate-orchestration hard-fail in pre-commit (was --soft)
- ✅ Pre-commit cascade: typecheck + lint warn + 5 hard-fail validators
- ⏳ 25 dormant `check:*` scripts triage (`12i-quality-dormant-validators-triage`)
- ⏳ knip promote to hard-fail (`12i-quality-knip-promote-hard-fail`)
- ⏳ component-completeness burndown (`12i-quality-component-completeness-burndown`)
- ⏳ ESLint import-x migration (`12i-quality-eslint-import-x-migration`)

To 80/65: dormant triage + knip + completeness + import-x.

### Mobius scene — **40%** (was 35%)

- ✅ MobiusShellLayer lazy-loaded (Pod B1 — 900 KB drop from main entry)
- ✅ MobiusConstants extracted (zero three.js deps)
- ⏳ 38 Zustand selectors → ~13 (`12i-bloat-mobius-selector-consolidation`)
- ⏳ 503-line useFrame split (`12i-bloat-mobius-useframe-split`)
- ⏳ Mobius store slice pattern (`12i-bloat-mobius-store-slice-pattern`)
- ⏳ GLSL extract to named constants (`12i-bloat-mobius-glsl-extract`)
- ⏳ Mobius FPS budget per device tier (`12i-bloat-mobius-perf-instrumentation`)

To 70%: selector consolidation + useFrame split + slice pattern. **Opus-class architectural work.**

### HDSLayout shell — **55%** (was 45%)

- ✅ 1530 LoC (was 2326 — Pod 3 + lazy-load extraction)
- ✅ Architectural split plan ratified
- ✅ Mobius lazy-loaded
- ⏳ Health rail extract (`12i-bloat-hdslayout-health-rail-extract`)
- ⏳ Scroll hook extract (`12i-bloat-hdslayout-scroll-hook`)
- ⏳ Inline CSS extract (`12i-bloat-hdslayout-inline-css`)
- ⏳ HDS_NAV dedup (`12i-bloat-hdslayout-hds-nav-dedup`)
- ⏳ isDark prop drilling cleanup (`12i-bloat-isdark-prop-drilling`)
- ⏳ 5-module architectural split (`12i-bloat-hdslayout-architectural-split`)

To 85%: 5 prereq extracts + the split.

### Agent / orchestration infrastructure — **70%** (was 55%)

- ✅ 320+ units across 14 clusters
- ✅ validate-orchestration hard-fail (33 → 0 violations)
- ✅ Eco model rule (haiku/sonnet/opus) documented
- ✅ Autonomous-build protocol active
- ✅ Worktree isolation captured as known unreliability
- ⏳ Worktree isolation verification mechanism (`12s-infra-worktree-isolation-verification`)
- ⏳ Agent grounding refs schema (`12s-infra-agent-grounding-refs`)
- ⏳ Done-status validator (`12s-infra-done-status-validator`)
- ⏳ Pod cost tracking (`12s-infra-pod-cost-tracking`)

To 85%: worktree verification + grounding refs + done-status validator.

### CI / deploy — **80%** (was 45%) ⬆⬆⬆

- ✅ quality.yml on PR + push:main + pnpm build step
- ✅ visual.yml + a11y.yml created (Pod X)
- ✅ size-limit step in quality.yml (Pod B1, warn-mode)
- ⏳ responsive.yml + collision.yml (Pod A1 in flight)
- ⏳ Promote visual + a11y + responsive + collision to required-merge-checks
- ⏳ token-scan.yml — already has correct `deployment_status` trigger
- ⏳ Lighthouse CI startup-server-command (post-baseline)

To 95%: required-check promotions after baseline runs.

### Multi-tenant agency platform — **25%** (was 10%)

- ✅ CSS scope architecture decided (Option A `[data-tenant=X]`)
- ✅ Tenant overlay file format spec'd
- ✅ Concrete Creations tenant scaffolded (placeholder hexes)
- ✅ 6 follow-up units captured + 3 from opus pod
- ⏳ Build pipeline tenant emit (`12m-mt-build-pipeline`)
- ⏳ Tenant runtime provider (`12m-mt-tenant-runtime-provider`)
- ⏳ Source-canon scope guard (`12m-mt-source-canon-tenant-scope`)
- ⏳ Onboarding workflow (`12m-mt-onboarding-workflow`)
- ⏳ Per-tenant Figma master generation (`12m-mt-figma-master-per-tenant`)
- ⏳ Typography licensing strategy (`12m-mt-typography-licensing`)
- ⏳ JSON Schema for overlays (`12m-mt-overlay-jsonschema`)

To 70%: build pipeline + runtime provider + onboarding workflow.

### Pilot client (Concrete Creations) — **5%** (was 0%)

- ✅ Tenant scaffold exists (placeholder hexes)
- ✅ 4 units captured (repo, catalog, Stripe, WA legal)
- ⏳ Repo bootstrap (`12u-cc-repo-bootstrap`)
- ⏳ Product catalog data model (`12u-cc-product-catalog-data-model`)
- ⏳ Stripe Checkout integration (`12u-cc-stripe-checkout-integration`)
- ⏳ WA-compliant legal pages (`12u-cc-wa-legal-pages`)

To revenue: all 4 units done + Stripe live mode flipped.

### Public API surface — **35%** (was 30%)

- ✅ package.json#exports defined
- ✅ Lucide unified (no more dual-icon-lib confusion)
- ✅ Bundle vendor splits emerging
- ⏳ Storybook (`12n-api-storybook-setup`)
- ⏳ API extractor (`12n-api-extractor-wired`)
- ⏳ Manifest schema semver (`12n-api-manifest-schema-semver`)
- ⏳ React 19 migration plan (`12n-api-react-19-migration-path`)
- ⏳ Changelog automation (`12n-api-changelog-automation`)
- ⏳ Internal vs public JSDoc (`12n-api-internal-vs-public-jsdoc`)

To 70%: Storybook + api-extractor + semver + changelog.

---

## Next milestone target: **55% composite** by end of next session

Achievable via:
- HDSLayout split (5 prereqs + main split) → +5% composite
- Mobius selector consolidation + useFrame split → +3%
- Multi-tenant build pipeline → +5%
- Storybook + api-extractor → +3%
- ESLint burndown to 0 → +1%
- Snapshot rebake + theme listener + TOC scrollspy → +2%
- Prompt regression goldens captured → +2%

That's +21% across the surfaces, weighted to ~+10 composite.
