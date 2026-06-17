# HDS Strengths & Differentiators

> Things this system does that are unusual / better-than-typical for design systems at this scale. Captured so we **don't accidentally erode them** during refactor sprints, and so we know what's worth advertising / preserving.
>
> Each strength has a **preservation rule** — a programmatic check or discipline that catches drift early. The closed loop is automation, not memory.

---

## 1. Validator suite depth (45 check scripts + 5 LLM validators)

**What's unusual:** Most peer design systems rely on ESLint plugins + a handful of custom rules. We have 45 named `check:*` scripts covering reduced-motion honoring, token tier cross-aliasing, CSS value injection, hardcoded spacing/colors/fonts/breakpoints, mojibake detection, ref-forwarding patterns, doc structure consistency, route link integrity, and more. Plus 5 LLM-output validators (manifest, token, a11y, swiss-canon, parse-jsx) running in the retry loop. Most are tuned to this codebase's exact architectural contracts in ways generic ESLint rules cannot match.

**Preservation rule:** Validator count should not drop below 40 without a documented retirement reason. The `12i-quality-dormant-validators-triage` unit will retire redundant ones; the survivors are load-bearing. Future audits should flag if any retirement happens without a corresponding test-case migration.

**Programmatic check (planned `12s-infra-strengths-audit-script`):**
```bash
ls scripts/check-*.mjs | wc -l   # expect >= 40
ls validators/*.mjs | wc -l      # expect >= 5
```

---

## 2. Three-framework test split with clear domain boundaries

**What's unusual:** Most projects pick one framework and stretch it. We use:
- **Vitest** for pure-TS units (transpiled).
- **Playwright** for browser surface (5 spec families: layout-integrity, a11y, responsive, collision, visual).
- **node:test** for validators + retry-loop (no transpile overhead, native, fastest startup).

The framework-per-domain split is intentional: validators run in CI thousands of times — vitest's transpile setup would add seconds; node:test is ~50ms cold start. Most teams don't bother with that level of optimization.

**Preservation rule:** Don't consolidate "for cleanliness." Each domain has a reason. New tests pick the framework that fits the domain.

**Programmatic check:** Pre-commit gate should catch attempts to migrate validators away from node:test (a regression in agent prompts often suggests "use vitest for everything" — reject).

---

## 3. 269 fixtures + fixture-as-contract discipline

**What's unusual:** Most peer systems have ~50–100 fixtures total. We have 269 across LLM compiler regression (50), validator fixtures, figma-master snapshot, prompt regression (8 just shipped). Fixtures are committed and treated as **the contract**: change behavior → change fixture → review diff → ratify. Never change a fixture to make a test pass.

**Preservation rule:** Fixture count should not drop without an explicit retirement rationale per fixture. Adding new fixtures > deleting old ones (except true duplicates).

**Programmatic check:**
```bash
find fixtures -type f | wc -l    # expect >= 269 unless retirement documented
```

---

## 4. AST gatekeeper on LLM output (the retry loop)

**What's unusual:** Most LLM-augmented design systems ship the LLM's output unchecked. Ours runs every JSX string through a 5-validator gate (manifest / token / a11y / swiss-canon / parse-jsx) and re-prompts up to 3 times on failure. Telemetry logs every retry. The pipeline catches what bypassed the prompt.

**Preservation rule:** Never disable the gatekeeper as a "speed up" measure. If a validator fires too often on legit patterns, fix the validator's exemption logic (existing convention: `// font-ok`, `/* hds-bypass */` per-file markers).

**Programmatic check:** `gatekeeperEnabled` flag in `bridge.config.json` should be `true` once `12k-llm-gatekeeper-flag-activation` lands. Dropping back to `false` should require a documented incident response.

---

## 5. DTCG-spec-compliant token graph with custom compiler

**What's unusual:** Most teams use Style Dictionary or Tokens Studio. We hand-rolled `scripts/build-tokens.mjs` (~1280 LoC) — emits CSS vars, TS bridge, Tailwind config, manifest, descriptions, refs, vars.d.ts, all from a single DTCG source. Lets us tune emission per-target (e.g., the `:root` CSS layer convention is custom). Style Dictionary's plugin model has been deliberately rejected to keep the pipeline transparent.

**Preservation rule:** Don't add Style Dictionary as a dependency "for industry compatibility." The custom compiler is the substrate for multi-tenant tenant-overlay emit (12m cluster). Replacing it would lose that.

**Programmatic check:** `package.json` deps should not contain `style-dictionary` or `@tokens-studio/*`. Test in `scripts/__tests__/no-token-substrate-leak.test.mjs` (planned).

---

## 6. Manifest as single source of truth for components

**What's unusual:** `public/hds-manifest.json` is the authoritative description of every component (props, allowedChildren, propConstraints, requiredProps, a11yRules, tier, slots[], tokenBindings). The compiler, validators, Figma plugin, doc site, LLM prompts all read from it. No duplication. Most peer systems split this across `propTypes`, `package.json#components`, Storybook stories, and ad-hoc docs.

**Preservation rule:** Never duplicate manifest data into another file. If something needs component metadata, it reads `public/hds-manifest.json` (or its TypeScript bridge `src/app/hooks/useHdsManifest.ts`).

**Programmatic check:** Validators already enforce this via `check-manifest-drift.mjs`. Score: keep this hard-fail.

---

## 7. Tier classification (primitive / pattern / template / utility)

**What's unusual:** Asymmetric doc weight per tier. Primitives get heavy API pages; patterns get usage pages; templates get galleries; utilities + experiments hide from public docs. Most systems doc all components equally and bury the user in noise.

**Preservation rule:** Every shipped component must declare a tier. The 10 tier-less demo helpers were quarantined via `@doc-exempt` (Pod M); never let new tier-less entries leak into the manifest.

**Programmatic check:** `validate-manifest.mjs` enforces required `tier` field. Hard-fail in pre-commit.

---

## 8. Slot-based binding architecture (8-V cluster shipped)

**What's unusual:** `componentSpecs[*].slots[]` declares the named layer in Figma → token binding mapping per component. The 41 inline `_hdsTokenBinding` calls across `pipeline/figma-masters-batch.mjs` were eliminated by moving rest-state bindings into the manifest. Figma masters auto-generate from this. Most peer systems hand-author Figma components OR generate them but never tie them back to source-of-truth.

**Preservation rule:** Adding a new component requires declaring its slots[] with proper figmaSlotName + tokenBinding. `check-binding-drift.mjs` enforces.

---

## 9. Eco-aware sub-agent dispatch (haiku/sonnet/opus rule)

**What's unusual:** Cost-aware AI orchestration is rare in dev tooling. Adrian's `feedback_eco_efficient_subagents.md` directive encodes which model fits which task class. Saves an estimated 60-80% in opus token spend vs naive "always use the best model" strategies.

**Preservation rule:** Every Agent dispatch should justify its model choice in the description. New patterns should land in `12s-infra-sub-agent-prompt-templates`.

---

## 10. Worktree-isolated parallel pod dispatch

**What's unusual:** Multiple teams dispatch concurrent agents but most overlap on shared files chaotically. Our pattern (worktree per pod, isolation flag, late-merge reconciliation) has been refined incrementally. Even with the known unreliability documented in `12s-infra-worktree-isolation-verification`, the throughput is high — this session shipped 10+ pods in parallel with manageable conflict resolution.

**Preservation rule:** Cap at 4-5 concurrent pods. Document file scope conflicts upfront. Late-merge reconciliation is the parent agent's job.

---

## 11. ADR + decision-log discipline

**What's unusual:** `docs/architecture/*.md` contains real architectural decision records (multi-tenant scope, HDSLayout split, bundle budget). Most projects of this size have zero ADRs.

**Preservation rule:** Any opus-class architectural unit ships a decision doc, not just code. Captured as `12n-api-rfc-process-formalization`.

---

## 12. Composite typography tokens with full DTCG spread

**What's unusual:** Most systems decompose typography to individual properties (`fontSize`, `fontWeight`, etc) and ask consumers to combine. We ship 8 composite typography tokens (display, h1, h2, h3, body, ui, small, caption) that bundle 5 properties each. Consumers spread inline. The cost is rename brittleness (captured as `12v-token-composite-class-system`); the win is single-decision per text role.

**Preservation rule:** Don't decompose composites unless the architectural decision in `12v-token-composite-class-system` rules against them.

---

## 13. Manifest-driven figma-masters batch generation

**What's unusual:** `pipeline/figma-masters-batch.mjs` generates 13 component sets × 80 variants from the manifest. This means Figma stays in sync with code automatically — no designer-manual master maintenance. Most teams have either Figma OR code as source of truth; not both reconciled.

**Preservation rule:** New components need to be added to GENERATIVE_SUBSET in figma-masters-batch.mjs. Test snapshot via `test-figma-masters-snapshot.mjs` is hard-fail.

---

## 14. Self-driving agent build pipeline

**What's unusual:** `node scripts/ai-orchestrator.mjs --orchestrate` walks orchestration.json's dependency graph and executes ready units autonomously. Most teams "use AI" via prompts; ours has a job queue + protocol + telemetry.

**Preservation rule:** Keep the protocol simple enough to debug. The `OPERATOR_BRIEF.md` autonomous-continuation protocol is the entry point.

---

## Closing-the-loop automation

A future unit `12s-infra-strengths-audit-script` will automate periodic checks:

```
node scripts/audit-strengths.mjs
  → validator count >= 40
  → fixture count >= 269
  → no Style Dictionary in deps
  → manifest single-source-of-truth (cross-file dup detection)
  → eco model rule referenced in CLAUDE.md + memory
  → ADRs follow ADR-NNNN naming (post-12n-api-rfc-process-formalization)
```

Run weekly via cron. Failure = drift detected = open issue. Closes the loop programmatically so we don't have to remember.

---

## Things we DON'T do that peers DO (capture as orchestration units)

These are the "missing-from-our-system" items I've called out and what units cover them:

| Peer pattern | Unit covering it |
|---|---|
| Storybook isolated component renders | `12n-api-storybook-setup` |
| `@microsoft/api-extractor` for API stability | `12n-api-extractor-wired` |
| Manifest schema semver | `12n-api-manifest-schema-semver` |
| Changesets / changelog automation | `12n-api-changelog-automation` |
| Per-component changelog metadata (Polaris) | `12n-api-per-component-changelog` |
| `@public` / `@internal` JSDoc discipline | `12n-api-internal-vs-public-jsdoc` |
| `pnpm build:lib` in CI | `12n-api-build-lib-in-ci` |
| Type tests (Spectrum / Polaris) | `12p-test-type-tests-prop-stability` |
| CodeSandbox / StackBlitz embed per primitive | `12n-api-codesandbox-embed-per-primitive` |
| ADR-NNNN numbering | `12n-api-rfc-process-formalization` |
| Monorepo packages/* + apps/* | `12n-api-monorepo-workspace-split` |
| Property-based testing (fast-check) | `12p-test-property-based-token-math` |
| Mutation testing (Stryker) | `12p-test-mutation-testing-stryker` |
| E2E user-journey flows | `12p-test-e2e-user-journey` |
| Browser matrix beyond chromium | `12p-test-browser-matrix-firefox-safari` |
| Coverage reporting + thresholds | `12p-test-coverage-reporting-wired` |
| State store / context tests | `12p-test-state-store-context-tests` |
| Custom-hook tests | `12p-test-hook-tests-custom-hooks` |
| Validator self-tests | `12p-test-orchestration-validator-self-test` |
| Snapshot rebake policy | `12p-test-snapshot-rebake-policy` |
| Snapshot staleness detector | `12p-test-snapshot-staleness-detector` |
| Required-check promotion | `12p-test-required-checks-promote` |
| Keyboard-trap detection | `12p-test-keyboard-trap-detection` |
| Focus-flow analysis | `12p-test-focus-flow-analysis` |
| `prefers-reduced-motion` enforcement | `12r-a11y-prefers-reduced-motion-validator` |
| TS strict full enable | `12i-quality-ts-strict-wave3` / `wave4` |
| Lighthouse CI / web vitals | `12i-quality-validator-web-vitals` (✅) + `12o-perf-web-vitals-budget` |
| Bundle budget enforcement | `12o-perf-per-route-bundle-budget` (✅ Pod B1) + `12o-perf-bundle-budget-hard-fail-promote` |
| Critical-path CSS extraction | `12o-perf-critical-path-css-extraction` |
| Image lazy-loading audit | `12o-perf-image-lazy-loading-audit` |
| Prefetch / preload strategy | `12o-perf-prefetch-preload-strategy` |
| Three.js per-tier perf budget | `12o-perf-three-js-budget-per-tier` |
| Theme studio / customizer | covered by `12m-multi-tenant-platform` cluster |
| Service worker offline mode | NOT YET — adding |
| PR / issue templates | NOT YET — adding |
| `CONTRIBUTING.md` / `CODE_OF_CONDUCT.md` | NOT YET — adding |
| Docs versioning per release | NOT YET — adding |
| Live RUM monitoring | NOT YET — adding |
| Component usage analytics | NOT YET — adding |
| README bundle-size badge | NOT YET — adding |
| Token Studio export | NOT YET — adding (optional) |
| WCAG 2.2 explicit conformance log | NOT YET — adding |

The "NOT YET" rows below get captured as orchestration units in the same commit.
