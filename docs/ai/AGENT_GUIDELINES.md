# Agent Guidelines — HDS Sub-Agent Operating Doctrine

> Carry-forward of every guardrail, ruling, and best practice established across the autonomous-build sessions to date. Read this BEFORE dispatching agents or executing units.
>
> **Scope:** any sonnet/haiku/opus sub-agent dispatched via the Agent tool, plus the human-driven CLI sessions.
>
> **Last updated:** 2026-05-01 (Wave 3 dispatches).

---

## 1. Eco model rule (cost-aware dispatch)

Per Adrian's directive 2026-05-01: **always pick the cheapest model that can do the job.**

### Model selection matrix

| Model | When to use | When NOT to use |
|---|---|---|
| **haiku** | Additive mechanical edits, single-pattern scrubs, file moves, emoji/comment scrubs, registry-summary writing, baseline regen, simple fixture additions, "follow the pattern" work. | **NEVER for deletions.** Never for judgment calls. |
| **sonnet** (default) | Most unit work: schema extensions, new scripts, bridge endpoints, component refactors, validator additions. **REQUIRED for any task involving deletions** (file removals, dead-code pruning, dep removal, manifest cleanup). | When opus-class architectural reasoning is needed. |
| **opus** | Cross-cutting architectural reasoning, ambiguous scope needing judgment, novel validator with subtle logic, opus-class units explicitly tagged. | Ordinary unit work. **Use sparingly — most expensive lever.** |

### Effort

Default to minimum-effort runs. Reserve high-effort for opus-class problems the agent must reason through.

### Justify in dispatch

Every Agent dispatch should make the model+effort choice obvious in the description or first prompt line (e.g. "haiku — mechanical scrubs", "sonnet (deletion-class)", "opus (architectural decision)").

### Pod sizing

- Group small mechanical units (haiku) into multi-unit pods to amortize startup.
- Keep architectural pods (sonnet/opus) to 1–2 units max so the agent isn't context-juggling.
- Cap concurrent pods at **4–5**; more creates merge hell, fewer wastes wall-clock.

---

## 2. Worktree isolation discipline

### Known unreliability

The Agent tool's `isolation: "worktree"` flag has been unreliable across sessions. Multiple pods this session wrote to main directly despite the flag (Pod 1, Pod 4, Pod 5, B1 leaked). Pod 5's worktree was 258 commits behind main.

### Required pod-side procedure

**Every dispatched agent MUST run this as their first action:**

```bash
git reset --hard fix/ui-pipeline   # or whatever the source branch is
```

This ensures the worktree (or main, if isolation didn't take) starts from a known-good base.

### When parallel pods touch shared files

If two pods could touch the same file (orchestration.json is the most common — almost every pod writes it), expect merge collisions. Mitigate by:

1. Sequencing: dispatch pods in waves, not bulk.
2. File scoping: prompt explicitly forbids the second pod from touching the first's files.
3. Late-merge reconciliation: parent agent does the manual merge after all pods report.

### Pre-commit isolation check (landed 2026-05-01)

Every dispatched agent MUST run this **before every commit**:

```bash
node scripts/dispatch-pod.mjs verify --base fix/ui-pipeline
```

Exits 0 if cwd + branch + git-dir all confirm a linked worktree branched cleanly from the named base. Exits 1 with a diagnostic if isolation did not take — the agent must abort and report rather than commit broken state.

`scripts/dispatch-pod.mjs` is wired into the universal preamble of `docs/ai/PROMPT_TEMPLATES.md`, so any dispatch built from those templates will include it. The Window 1 / 2026-05-01 dispatch (which produced 3 of 5 broken commits requiring rescue) is the validating incident.

---

## 3. NEVER bulk-lint:fix

### The Pod N incident (2026-05-01)

Pod N ran `pnpm lint:fix` over the full codebase as a single bulk operation. ESLint's auto-fixer **introduced syntax errors** by merging unrelated code blocks across files (`HDSLayout.tsx`, `BurnDownPage.tsx`, `PortfolioDraftPage.tsx`). The work had to be stashed and discarded. `pnpm typecheck` did NOT catch the errors because tsconfig.typecheck.json's file-list didn't cover those files. `pnpm exec vite build` (esbuild) caught them. CI now runs `pnpm build` (Pod X) so future regressions are caught.

### The rule

**lint:fix is per-rule with verification.**

- Use `pnpm exec eslint src --fix --rule '{"<rule-name>": "error"}'` to scope.
- Run `pnpm typecheck && pnpm exec vite build` after EACH rule pass.
- STOP and report if either fails.
- If a single rule's auto-fix touches more than 50 files in one run, STOP and ask Adrian.

### Safe-to-auto-fix rules

`@typescript-eslint/no-unused-vars`, `prefer-const`, `no-var`, `quotes`, `semi`, `eol-last`, `comma-dangle`.

### NEVER auto-fix

`react-hooks/exhaustive-deps` (auto-fix introduces stale-closure bugs), anything that rewrites code blocks rather than tweaking declarations, anything touching more than one statement.

---

## 4. Validate before claiming

### The Pod 2 incident

Pod 2's autonomous doc-coherence audit produced **~55% false-positive rate at P0**. Examples:
- Claimed 9 typography tokens were "still live" — they weren't, all 9 truly removed.
- Claimed `HdsSurface`/`Grid`/`HeadingStack`/`Dialog`/`Text` didn't exist — all 5 exist.
- Claimed `component.padding` resolves to 12px — it's 24px.

The pattern: Pod 2 cross-referenced doc text without grounding each claim against actual source files / validator output / git state.

### The rule

Every claim in a unit's `description` or `agentNotes` MUST include a grounding ref:
- `Source of truth: <file:line>` — for code claims.
- `Validator output: <command>` — for test/build claims.
- `Commit ref: <hash>` — for historical claims.

The `12s-infra-agent-grounding-refs` unit captures the validator extension to enforce this at schema level.

---

## 5. Pre-commit gate cascade (current)

`.husky/pre-commit` runs (in order, all hard-fail except lint):

```
1. pnpm typecheck                          # TS strict (5 of 10 flags on)
2. pnpm lint                               # WARN-MODE; baseline ~446 (was 521 before Lucide migration)
3. node scripts/check-manifest-drift.mjs
4. node scripts/check-binding-drift.mjs
5. node scripts/check-source-canon.mjs
6. node scripts/validate-manifest.mjs      # PROMOTED hard-fail 2026-05-01 (Pod M)
7. node scripts/validate-orchestration.mjs # PROMOTED hard-fail 2026-05-01 (Pod Y, --soft dropped)
```

`pnpm test` adds (the broader pretest cascade):

```
+ check-component-completeness.mjs        # 35 violations soft-failing; 12i-quality-component-completeness-burndown
+ test-figma-masters-snapshot.mjs
+ test-doc-pages-snapshot.mjs
+ check-registry.mjs
+ knip --no-exit-code                     # 12i-quality-knip-promote-hard-fail will flip
```

CI (`.github/workflows/quality.yml`) runs:

```
+ pnpm install --frozen-lockfile
+ pnpm build                               # ADDED 2026-05-01 (Pod X) — catches Vite-only errors
+ all of the above pre-commit gates
+ pnpm test:layout
+ pnpm size-limit                          # ADDED 2026-05-01 (Pod B1, warn-mode)
```

### Promotion path

Each soft / warn-mode gate has a unit to promote it once burndown finishes:
- `lint --max-warnings=0`: `12i-quality-eslint-burndown` (and `12i-quality-eslint-import-x-migration` for plugin compatibility).
- `check-component-completeness` hard-fail: `12i-quality-component-completeness-burndown`.
- `knip` hard-fail: `12i-quality-knip-promote-hard-fail`.
- `size-limit` hard-fail: `12o-perf-bundle-budget-hard-fail-promote`.

### Pre-commit failure on a file you didn't touch

If a gate fails on a file outside your unit's scope, **fix the violation before committing** — do not re-claim and retry. Common culprits:

- `check-source-canon`: scans all `.tsx` files. A raw `#fff`/`#000` anywhere in the repo will block your commit. Replace with `var(--semantic-color-text-on-primary)` (or appropriate token). Never use `var(..., #fff)` — the `#fff` fallback still triggers the check.
- `check-binding-drift` / `check-manifest-drift`: a recently-merged unit may have left drift. Run the check, read its output, fix the specific file it names.

**Root cause of the `10f-5-code-connect-ci` 24-abort loop (2026-05-02):** `check-source-canon` was failing on `WetPaintPage.tsx:416` (`color: '#fff'`), blocking every claim commit. Hermes kept re-claiming instead of diagnosing the gate output. Rule: **read the full gate error before retrying**.

---

## 6. Status accuracy rules

### "Done" means BOTH

- `validationCmd` exits 0 NOW.
- The deliverable exists in HEAD.

NOT just one. `12e-1-visual-design-stacked-cards` was marked pending while the code shipped — caught in self-grill audit.

### Don't mark `done` speculatively

If your unit's executor is a future agent, leave it `proposed` / `approved`.

### Verify post-commit

`12s-infra-done-status-validator` captures a script that audits every `done` unit's validationCmd. Run periodically.

---

## 7. Status field allowed values

`validate-orchestration.mjs` enforces:

- `status`: `proposed | approved | claimed | done | parked | needs-grilling | denied`
- `approval`: `proposed | approved | denied | needs-grilling`
- `priority`: integer 1..5 (1 = highest)
- `sprint`: integer 0..6 (0 = current, 6 = far backlog)

**`pending` is NOT a valid `approval` value** — Pod 2 used it for 33 entries; Pod Y normalized to `proposed`. `pending` and `in-progress` are also invalid `status` values; the validator currently warns (non-blocking) and will promote to hard-fail once a burndown unit drains them.

### Claim protocol (concurrency control)

To prevent two parallel agents picking the same unit and producing collision commits, each agent **claims** a unit before doing the work.

**Schema additions:**

- `status: "claimed"` — slots between `approved` and `done`. Agents skip claimed units when scanning for eligible work.
- `claimedBy: <string>` — required when `status === "claimed"`. Identifies the agent or session, e.g. `"agent:aaa4aaa0007320ec5"` or `"session:fresh-2026-05-01-w2"`.
- `claimedAt: <ISO-8601>` — required when `status === "claimed"`. The validator parses with `Date.parse`.

When `status` is anything other than `"claimed"` or `"done"`, `claimedBy` and `claimedAt` MUST be absent (else `ORPHAN_CLAIM_FIELDS`). Done units MAY retain claim fields as an audit trail.

**Lifecycle:**

1. **Claim** (before any other work): the dispatching agent commits a tiny standalone change to `orchestration.json` setting `status: claimed`, `claimedBy`, `claimedAt`. Commit message: `chore(orch): claim <unit-id> for <agentId>`. This is the FIRST thing each agent does after `git reset --hard <branch>`.
2. **Execute** (the unit's actual work).
3. **Complete**: in the same commit that lands the deliverable, transition `status: claimed → done`. Keep `claimedBy`/`claimedAt` for audit, OR remove them — both pass validation.
4. **Abort / blocked**: revert `status: claimed → approved` and remove `claimedBy`/`claimedAt`. Add a note to `agentNotes` describing the blocker.

**Stale-claim recovery:**

A claim is "stale" when `claimedAt` is older than 4 hours and `status` is still `claimed` — usually the agent crashed. Detected by `node scripts/audit-claims.mjs` (separate from the validator on purpose: stale-claim is a runtime/timing condition, not a schema violation, and shouldn't lock the pre-commit hook).

To recover a stale claim:
- **Steal**: a fresh agent overwrites `claimedBy`/`claimedAt` with its own values. Commit message: `chore(orch): steal stale claim on <unit-id> from <prior-agent>`.
- **Release**: revert to `status: approved`, clear claim fields, document in `agentNotes`.

**Why this exists:**

Pre-claim, parallel pods routinely picked the same unit and produced collision commits — Window 2 of 2026-05-01's fresh-session dispatch surfaced exactly this when worktree isolation flaked and two cherry-picks fought over the same `orchestration.json` lines. The claim adds a cheap optimistic-lock: a 1-line commit at dispatch time that any peer agent can see before starting.

---

## 8. Token discipline (canon)

### Hard rules

- No raw values in component / page source. Every color / size / spacing / typography reference uses a token.
- Semantic tokens beat primitive tokens. Components reach for `semantic.color.surface.raised`, never `primitive.color.neutral.50`.
- Composite typography spreads inline OR consumed via `<Text variant="X">`. Never copy individual properties.

### Bypass markers

For files that genuinely can't conform (specimen pages, brand letterforms, error fallbacks, experimental sketches):

- `/* hds-bypass: <reason> */` in the first 15 lines — skips ALL canon rules.
- `// font-ok: <reason>` in the first 15 lines — skips just FONT_BOLD.

### Elevation roles (mandatory)

After Pod 1's reconciliation 2026-05-01 — system uses **4 roles**, not 5 (sticky dropped):

| Surface | Role | Background | Shadow | Border |
|---|---|---|---|---|
| Card / panel resting | `flat` | `surface.page` | none | `border.subtle` 1px |
| Card / panel lifted | `raised` | `surface.raised` | `shadow.subtle` | none |
| Popover / dropdown / tooltip | `floating` | `surface.raised` | `shadow.floating` | none |
| Dialog / sheet / modal | `overlay` | `surface.overlay` | `shadow.overlay` | none |

Cards default to `flat`. Bind via `semantic.elevation.{role}` — never raw `box-shadow` values.

### Typography (mandatory)

- Headings (display, h1, h2, h3) all use **Clash Display medium 500**.
- Body / UI / small / caption use Clash Grotesk regular 400.
- Mono / technical uses Geist Mono.
- Old "Atkinson Hyperlegible Next" references in docs are STALE; canonical is the 3-family system above.

### Card anatomy (mandatory)

- Background: `var(--semantic-color-surface-raised)` — never custom color, gradient, tinted fill.
- Border: `1px solid var(--semantic-color-border-default)` for resting cards.
- Border radius: `var(--primitive-radius-8)` (8px) — NEVER 12/16/20px.
- Padding: `var(--semantic-space-component-padding)` (24px) or `<HdsSurface padding="component">`.
- Shadow: bound via `semantic.elevation.{role}` only.
- NEVER on a card: gradient backgrounds, glow effects, frosted glass, decorative overlays, gradient borders, colored fills, patterned backgrounds, AI-aesthetic shimmer.

### Icons (mandatory post-Lucide migration)

- Use `lucide-react`. Wrap via `<Icon>` for size + color tokens.
- `@phosphor-icons/react` is REMOVED — never re-introduce.

---

## 9. Auto-gen output discipline

### The rule

Files generated by build scripts MUST never be edited directly. Edit the source / template, regenerate.

### Auto-gen outputs (do NOT edit)

- `public/llms.txt` — generated by `scripts/generate-llms-txt.mjs`
- `DESIGN.md` — generated by `scripts/build-design-md.mjs` from `DESIGN.source.md`
- `public/hds-manifest.json` — generated by `scripts/generate-manifest.mjs`
- `src/styles/tokens.css` + `tokens.generated.css` — generated by `scripts/build-tokens.mjs`
- `src/app/design-system/generated-*.ts` — generated by `scripts/build-tokens.mjs`
- `tailwind.config.tokens.cjs` — generated by `scripts/build-tokens.mjs`

### Future enforcement

`12i-quality-template-source-of-truth` captures the validator that fails PR if an auto-gen output changes without its corresponding template change.

---

## 10. Commit + branch hygiene

### Commit message format

```
<scope>(<area>): <unit-id> <one-line summary>

<body explaining the why>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

End every body with the Co-Authored-By trailer.

### Pre-merge protocol (squash discipline)

Before merging a `fix/*` branch to `main`:

1. **Tag baseline**: `git tag -a v0.X.Y-pre-merge -m "<branch tip summary>"` — captured by `12s-infra-tag-baseline-pre-merge`.
2. **Rebase squash auto-history**: `git rebase -i` to fold `chore(history): post-commit auto-update` commits into their parents.
3. **Squash-merge**: feature branch → main as a single coherent commit per logical landing.
4. **Tag main**: `git tag -a v0.X.Y` on main.
5. **Push tags**: `git push --tags`.
6. **Delete feature branch**: locally + remote.

Captured as `12s-infra-pre-merge-squash-protocol`.

### Hard rules

- **Never push to remote** without explicit Adrian instruction.
- **Never use `--no-verify`** to skip hooks.
- **Never `git reset --hard` on `main`** without explicit instruction.

---

## 11. Test strategy reference

### Frameworks (already implemented)

- **Vitest** — TS unit tests (`tests/*.test.ts`, `scripts/__tests__/*`)
- **Playwright** — browser surface (`tests/{layout-integrity, a11y, responsive, collision, visual}.spec.ts`)
- **node:test** — validators (`scripts/run-validator-tests.mjs`, `scripts/test-retry-loop.mjs`)

### Fixtures

A **fixture** is a frozen input + expected output that the test runs against.

Examples:
- `fixtures/compiler/<case>/input.jsx + expected.json` — LLM compiler regression
- `fixtures/llm-prompts/<slug>/input.txt + expected.jsx` — prompt regression suite (Pod A3)
- `tests/visual.spec.ts-snapshots/*.png` — Playwright visual baselines (also fixtures)
- `fixtures/figma-masters/snapshot-pre-8v3.json` — figma master generator output

The fixture **IS the contract**. Change behavior → change fixture → review diff → ratify or revert. NEVER change a fixture to make a test pass; change the implementation.

### Coverage philosophy

- Component contract tests for every primitive (`12p-test-contract-tests-primitives`).
- State store + context tests (`12p-test-state-store-context-tests`).
- Property-based tests on pure functions (`12p-test-property-based-token-math`).
- Type-tests for prop interface stability (`12p-test-type-tests-prop-stability`).
- Mutation testing scoped to primitives (`12p-test-mutation-testing-stryker`, parked).
- E2E user journeys (5 strategic flows, not bulk: `12p-test-e2e-user-journey`).

---

## 12. Operational runbooks

### When validators fail unexpectedly

1. Read the actual error — don't assume.
2. Check git status — uncommitted broken work from a previous pod is the most common cause.
3. `git stash push -u -m "investigate-<reason>"` to set aside.
4. Re-run validator on clean HEAD; if it passes, the broken work is in the stash.
5. Inspect stash; either fix or discard with `git stash drop`.

### When a pod produces broken state

If a sub-agent's commit breaks the build:

1. Don't `--amend` — that hides the breakage.
2. Make a fix-up commit referencing the broken pod's commit.
3. After the fix, document in the unit's agentNotes what went wrong so future agents avoid it.

### When orchestration drift surfaces

`validate-orchestration --soft` (or now hard-fail) reports:
- BAD_APPROVAL → fix to one of `proposed | approved | denied | needs-grilling`.
- BAD_PRIORITY → fix to integer 1..5.
- BAD_SPRINT → fix to integer 0..6.
- MISSING_* → fill in the field.

DO NOT mass-change `approval` to `approved` to bypass validation. Default for unratified work is `proposed`.

---

## 13. NEVER touch .env files (hard rule, no exceptions)

**Agents must never read, write, create, or delete any `.env*` file.**

Covered: `.env`, `.env.local`, `.env.production`, `.env.test`, `.env.*.local`, anything starting with `.env`.

**Why:** `.env.local` holds API keys, OAuth tokens, webhook URLs, service credentials. One accidental commit or log line leaks all of them. Blast radius = account-wide.

**What to do instead:**
- If a script needs a new env var: add a comment in the script header documenting it. Human fills it in.
- Never `cat`, `read`, or log `.env*` contents.
- Never interpolate env values into output files or committed code.
- If a unit says "add key to .env" — stop, mark needs-human-input, post a note. Do not proceed.

---

## 14. No aspirational guardrails (Adrian directive 2026-05-03)

A new design rule, validator, lint rule, agent guideline, orchestration policy, or workflow constraint **is not complete** until all of the following are true:

1. **Codified in source** — DESIGN.md, CLAUDE.md, this file, `docs/ai/rules/*`, or inline doc, depending on scope.
2. **Gate exists** — pre-commit hook, CI script, ESLint rule, source-canon validator, type-check, etc.
3. **Gate wired into the pipeline** — `.husky/pre-commit`, `package.json`, GitHub Actions, etc., so it runs automatically.
4. **Gate proven working** — run it locally against a known violation, observe it fire; run against compliant code, observe it pass.
5. **Pre-existing violations** are either fixed or **baselined explicitly** (ratchet pattern, e.g. `.token-path-baseline.txt`) so the gate fails on new regressions.

### Why

The repo had built up ~77 `scripts/check-*` and `validators/*.mjs` scripts but only 8 ran in pre-commit. "Swiss canon" rules existed in DESIGN.md but were not enforced — outlined-card overload, hardcoded fonts, dead token paths shipped repeatedly because the gates either didn't exist, weren't wired, or only soft-warned. Talking about a rule is not the same as enforcing it.

### Acceptance criteria

When an orchestration unit introduces a rule, its `validationCmd` MUST include the gate that enforces the rule. If the gate is a one-time setup (e.g. wiring a script into pre-commit), the unit's verification step explicitly runs the gate against a sample violation to confirm it fires. Reviewers should reject completed-marked units that introduce a rule without a corresponding gate.

### Existing wired gates (verified 2026-05-03)

- `node scripts/check-token-rebake-needed.mjs` — generated tokens in sync.
- `node scripts/check-manifest-drift.mjs` — manifest matches source.
- `node scripts/check-binding-drift.mjs` — token bindings match.
- `node scripts/check-source-canon.mjs` — Swiss-canon antipatterns (FONT_BOLD, BG_WHITE_BLACK, OVERSIZED_RADIUS, PURPLE_INDIGO, GRADIENT, LOREM, ELLIPSIS, OFF_GRID_SPACING, DATA_TENANT, INLINE_THIN_BAR, INLINE_STRUCTURAL_BORDER).
- `node scripts/validate-manifest.mjs` — manifest schema.
- `node scripts/validate-orchestration.mjs` — orchestration schema.
- `node scripts/check-component-completeness.mjs` — manifest completeness.
- `node scripts/check-token-paths.mjs` — referenced token paths resolve.
- `node scripts/check-hardcoded-colors.mjs` — raw hex/rgb in non-CSS contexts (hard, 12g-8).
- `node scripts/check-mojibake.mjs` — broken UTF-8 / encoding drift (hard, 12g-8).
- `node scripts/check-hardcoded-fonts.mjs` — raw `font-family` literals; all violations fixed, promoted to hard gate (12g-8 2026-05-03).
- `node scripts/check-hardcoded-spacing.mjs` — raw px in spacing props; all violations fixed, promoted to hard gate (12g-8 2026-05-03).

The other ~64 scripts in `scripts/check-*` and `validators/*.mjs` are not yet wired. See `docs/findings/2026-05-03-validator-coverage.md` for the inventory of which catch what they claim to catch.

---

## 15. Reference

- `docs/architecture/scorecard.md` — current % per surface area + composite.
- `docs/architecture/ADR-0001-multi-tenant-scope.md` — ADR for tenant CSS scope.
- `docs/architecture/tenant-token-overlay-format.md` — tenant overlay spec.
- `docs/architecture/ADR-0002-hdslayout-split.md` — 5-module split plan.
- `docs/architecture/ADR-0003-bundle-budget.md` — Pod B1's chunk budgets.
- `docs/ai/orchestration.json` — 339+ units, the autonomous queue.
- `docs/ai/OPERATOR_BRIEF.md` — durable handoff doc; reconcile per session.
- `docs/ai/AUTONOMOUS_BUILD.md` — pipeline architecture.
- `docs/ai/rules/REACT_COMPONENTS.md` — component recipes (post 12g-1 corrections).
- `docs/ai/rules/MANIFEST_SYNC.md` — manifest schema rules.
- `docs/ai/rules/FIGMA_BRIDGE.md` — bridge architecture.
- `public/llms.txt` — primary AI entry point.
- `CLAUDE.md` — project root agent instructions.

---

## Auto-Learned Rules

<!-- Rules below are appended automatically by scripts/hermes-unit.mjs runPostMortem() after unit aborts. Do not edit manually. -->
- [auto] Create the 'controls.md' file in the 'docs/security/' directory as part of the output for this HITL session. (unit: 13s-10-grc-career-planning, 2026-05-03) — The validation checks require a specific set of files to exist in order to pass. This rule ensures that the necessary output is generated by the agent.
- [auto] Create a markdown file named 'DESIGN_EXTRACT_GAP.md' in the '/docs/ai/' directory to document the gap analysis between the current visual ingestion stack and the design-extract project. (unit: backlog-13-design-extract-gap-analysis, 2026-05-03) — The validation command checks for the existence of this file to ensure the documentation is up-to-date.
