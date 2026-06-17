# Fresh Session — 3 Batched Prompts for Parallel Claude Windows

> Copy-paste each batch into a separate Claude chat. Each batch dispatches 4-5 sub-agents in parallel; batches are designed so all 5 end within ~5-10 minutes of each other so you can reconvene to dispatch the next wave.
>
> **Before pasting any batch:** ensure `fix/ui-pipeline` is clean (`git status --short` empty) and you've read `docs/ai/AGENT_GUIDELINES.md` for the operational doctrine.

---

## Window 1 — Docs / policy hardening (all parallel-safe, ~5-15 min each)

```
Read docs/ai/AGENT_GUIDELINES.md and docs/ai/orchestration.json before dispatching.

Dispatch these 5 sonnet sub-agents in PARALLEL via the Agent tool. Each gets its own worktree (isolation: "worktree"). Each agent runs `git reset --hard fix/ui-pipeline` first thing. Each marks its unit done in orchestration.json IN THE SAME COMMIT as the unit work. Each commit ends with the Co-Authored-By trailer.

AGENT 1A: Execute `12s-infra-tag-baseline-pre-merge`. Create tag v0.2.0-pre-merge with message documenting the session's net delta (multi-tenant decided, CI hardened, Phase 5+6 flags ON, bundle 80% reduced). Write docs/operations/release-tagging.md with the recurring protocol. Mark unit done.

AGENT 1B: Execute `12i-quality-pr-issue-templates`. Create .github/PULL_REQUEST_TEMPLATE.md (sections: linked unit, validator output, breaking-change checkbox, screenshots-if-visual). Create .github/ISSUE_TEMPLATE/{bug_report,feature_request}.md. Reference docs/operations/required-checks.md from the PR template. Mark unit done.

AGENT 1C: Execute `12n-api-contributing-and-coc`. Write CONTRIBUTING.md (dev setup, validator gates explained, unit-driven workflow, commit format, PR template link, link to docs/ai/AGENT_GUIDELINES.md for AI-augmented workflows). Write CODE_OF_CONDUCT.md using Contributor Covenant 2.1 boilerplate. Mark unit done.

AGENT 1D: Execute `12s-infra-no-bulk-lint-fix-policy`. Add the no-bulk-lint:fix discipline to CLAUDE.md SUB-AGENT DISPATCH RULES (reference Pod N's failure as the concrete incident). Update memory file feedback_eco_efficient_subagents.md with the same rule. Reference docs/ai/AGENT_GUIDELINES.md section 3 as the source of truth. Mark unit done.

AGENT 1E: Execute `12s-infra-sub-agent-prompt-templates`. Create docs/ai/PROMPT_TEMPLATES.md with 5 reusable templates: research-and-report (read-only audits), deletion-class (sonnet + verification), additive (haiku for mechanical), architectural-opus (full reasoning + decision doc), plan-only-report (writes ADR, no code edits). Each template: when-to-use, required preamble, verification checklist, reporting format. Encode the no-bulk-lint:fix rule in every template's preamble. Mark unit done.

ALL 5 agents must satisfy these gates before commit:
- pnpm typecheck (exit 0)
- node scripts/check-manifest-drift.mjs (exit 0)
- node scripts/check-binding-drift.mjs (exit 0)
- node scripts/check-source-canon.mjs (exit 0)
- node scripts/validate-manifest.mjs (exit 0)
- node scripts/validate-orchestration.mjs (exit 0)

Wait for all 5 to complete. Report back: 5 commit hashes + any agent that hit a blocker.
```

---

## Window 2 — Validator wiring + automation (all parallel-safe, ~10-25 min each)

```
Read docs/ai/AGENT_GUIDELINES.md and docs/ai/orchestration.json before dispatching.

Dispatch these 5 sonnet sub-agents in PARALLEL. Each gets its own worktree. Each agent runs `git reset --hard fix/ui-pipeline` first thing. Each marks its unit done in orchestration.json IN THE SAME COMMIT.

AGENT 2A: Execute `12i-quality-knip-promote-hard-fail`. Run `pnpm knip` to see current orphan count. Add genuine keep-paths to knip.config.ts if needed (portfolioData.tsx, etc.). Edit package.json#pretest: replace `knip --no-exit-code` with `knip`. Run `pnpm pretest` to confirm pass. If new orphans surface, drain them in this same commit OR add to ignore-list with a // TODO comment. Mark unit done.

AGENT 2B: Execute `12s-infra-strengths-audit-script`. Create scripts/audit-strengths.mjs implementing per-strength checks from docs/architecture/strengths-and-differentiators.md: validator count >= 40; fixture count >= 269; no Style Dictionary in deps; manifest single-source-of-truth (cross-file dup detection); ADR naming convention (post-RFC); eco-model rule referenced in CLAUDE.md + memory. Output human-readable + JSON. Wire into a new .github/workflows/strengths-audit.yml on weekly cron schedule. On failure: gh issue create with drift summary. Mark unit done.

AGENT 2C: Execute `12i-quality-template-source-of-truth`. Create scripts/check-template-source-of-truth.mjs that walks PR diff: if any auto-gen output file changed (public/llms.txt, DESIGN.md, public/hds-manifest.json, src/styles/tokens.css, generated-*.ts, tailwind.config.tokens.cjs), require corresponding template file (scripts/generate-llms-txt.mjs, scripts/build-design-md.mjs, etc.) to also be in diff OR commit message includes `regen-only`. Wire into pretest as warn-only first. Mark unit done.

AGENT 2D: Execute `12i-quality-tsconfig-typecheck-realign`. Read tsconfig.typecheck.json files/include list. Compare against routes.tsx + lazy() imports + every src/**/*.tsx file. Realign so typecheck covers everything pnpm build covers. Use include: ['src/**/*'] with strategic exclude. Verify by deliberately introducing a syntax error in a previously-uncovered file, run pnpm typecheck, confirm it catches. Pod N's failure mode (typecheck pass + build fail) MUST become impossible. Mark unit done.

AGENT 2E: Execute `12i-quality-component-completeness-burndown`. Run `node scripts/check-component-completeness.mjs` to enumerate ~35 violations (mostly descriptions <80 chars). For each: extend with substantive content (intent + use case + on-grid constraint per Swiss-canon style from 8p-2). For components that should never have customer-facing docs (test ghosts, internal helpers), add @doc-exempt to JSDoc. After zero violations, edit .husky/pre-commit to add check-component-completeness.mjs to hard-fail cascade. Mark unit done.

ALL 5 must pass the standard 6 pre-commit gates. Report 5 commit hashes + any blockers.
```

---

## Window 3 — HDSLayout prereq #1 + small features (file-scoped, ~10-25 min each)

```
Read docs/ai/AGENT_GUIDELINES.md and docs/ai/orchestration.json before dispatching.

Dispatch these 5 sonnet sub-agents in PARALLEL. Each gets its own worktree. Each agent runs `git reset --hard fix/ui-pipeline` first thing. Each marks its unit done in orchestration.json IN THE SAME COMMIT.

CRITICAL: Agent 3A is the only one touching HDSLayout.tsx. The others touch different files. No cross-agent file conflicts.

AGENT 3A: Execute `12i-bloat-hdslayout-health-rail-extract`. Move TokensRail + RailSignalCard + RailDisclosureMetric + RailStaticMetric + their data-builder helpers (formatTimestamp, formatTrend, getTopViolators, getSparklineValues, formatHealthCheckLabel, buildRailIntegrityDetails, buildRailFidelityDetails) + ManifestHealth type + healthHistory imports from src/app/pages/hds/HDSLayout.tsx (~300+ LoC) to NEW file src/app/components/HealthRail.tsx. HDSLayout imports TokensRail from the new file. ~300 LoC reduction. Visual regression must be byte-identical (run pnpm test:visual). Mark unit done. The HDSLayout split plan in docs/architecture/ADR-0002-hdslayout-split.md identifies this as the first prereq for the architectural split — execute exactly per that plan.

AGENT 3B: Execute `12v-token-line-height-none-alias`. Edit hirobius.tokens.json: add semantic.typography.lineHeight.none → {primitive.typography.lineHeight.none}. Run pnpm tokens:build to regenerate. Update src/app/components/lab/TokenCollectionList.tsx:106 to use semantic alias; remove the hds-bypass comment. Verify pnpm typecheck + node scripts/audit-tokens.mjs (no flags) exits 0. Mark unit done.

AGENT 3C: Execute `12j-doc-theme-prefers-color-scheme-listener`. Find src/app/context/ThemeContext.tsx. If `mode === 'system'`, subscribe to window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...). Update resolved-effective-theme state on change. Cleanup listener on unmount or mode change. Test: in browser devtools, toggle Emulate CSS prefers-color-scheme — page should re-theme without reload. Mark unit done.

AGENT 3D: Execute `12j-doc-toc-scrollspy-dynamic-content`. Read src/app/pages/hds/HdsTocContext.tsx. Add a MutationObserver on the content root that re-runs heading registration when childList changes. Test by adding a collapsible Disclosure on a doc page and verifying TOC catches the new heading after expand. Edge case: rapidly-opening collapsibles — debounce. Mark unit done.

AGENT 3E: Execute `12k-llm-daily-synthetic-cron`. Create .github/workflows/llm-daily-synthetic.yml. Trigger: schedule cron daily at 8 UTC. Run: scripts/test-prompt-regression.mjs against the 8 captured goldens (Pod A3 created these). On failure (any prompt regresses), open a GitHub issue via gh CLI with the diff summary. Mark unit done.

ALL 5 must pass the standard 6 pre-commit gates + Agent 3A also pnpm test:visual + pnpm test:layout. Report 5 commit hashes + any blockers.
```

---

## Reconvene checklist (after all 3 windows return)

When all 15 agents have committed, in this conversation:

1. Confirm `git log --oneline -20` shows 15 new commits since `8b1595b`.
2. Run `node scripts/audit-strengths.mjs` (just landed by 2B) to baseline strengths.
3. Run all 6 pre-commit gates manually to confirm green tip.
4. Update `docs/architecture/scorecard.md` with the new % per surface.
5. Reconcile `docs/ai/OPERATOR_BRIEF.md` with the 15 newly-done units + any blocked surfaces.
6. Decide the next 3 windows of work. Likely candidates:
   - Window 4: HDSLayout prereqs 2-5 (scroll-hook, inline-css, hds-nav-dedup, isDark-prop, then the architectural split itself)
   - Window 5: Multi-tenant build pipeline + tenant runtime provider + JSON Schema + source-canon scope guard
   - Window 6: Mobius opus units (selector consolidation + useFrame split + slice pattern + GLSL extract + perf budget)

---

## Recovery instructions if a batch goes sideways

If any agent in any batch fails / produces broken state:

1. The other 4 in that batch are unaffected — they each work in their own worktree.
2. Inspect the failing agent's worktree branch (`git log worktree-agent-XXX`) for partial commits.
3. If the unit's progress is salvageable, cherry-pick what's good and re-dispatch the rest.
4. If the unit is wedged, stash any leaked changes in main (`git stash push -u -m 'investigate-X'`), reset main to clean, and document in the unit's agentNotes what blocked it.
5. Open a follow-up unit if the failure represents a class of bug other agents will hit (Pod N's lint:fix incident → 12s-infra-no-bulk-lint-fix-policy is the canonical example).

The `docs/ai/AGENT_GUIDELINES.md` doctrine is durable — it should reduce these recoveries over time as patterns are codified.
