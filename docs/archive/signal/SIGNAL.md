# SIGNAL — canonical learning ledger for the Hirobius autonomous build

> **One singular place** for every win, failure, pivot, decision, dependency change, manual correction, and meta-learning across the Hirobius Design System and its agentic build pipeline. Designed to be both human-scannable and LLM-digestible. Featured eventually in the `/ops` dashboard and the public Hirobius case study.

**Status**: bootstrapped 2026-05-03 from session reflection. Will grow throughout the day's audit pass. Treat each section as append-only; do not delete entries — strike them through if obsoleted, but keep history.

**Companion machine-readable payload**: `docs/signal/signal.json` (TBD — generate after first round of audits captures structured data).

---

## Table of contents

1. [Purpose & audience](#purpose--audience)
2. [How to use this doc](#how-to-use-this-doc)
3. [At a glance — current pulse](#at-a-glance--current-pulse)
4. [Capture inventory — what we already track](#capture-inventory--what-we-already-track)
5. [Capture gaps — high-leverage missing signal](#capture-gaps--high-leverage-missing-signal)
6. [Proposed improvements (ranked by leverage)](#proposed-improvements-ranked-by-leverage)
7. [Session reflection — 2026-05-02 → 2026-05-03 burndown](#session-reflection--2026-05-02--2026-05-03-burndown)
8. Categorized signal:
   - [Wins](#wins)
   - [Failures & pattern-level breakage](#failures--pattern-level-breakage)
   - [Pivots](#pivots)
   - [Rebuilds & teardowns](#rebuilds--teardowns)
   - [Simplifications & their impacts](#simplifications--their-impacts)
   - [Overcomplications & their impacts](#overcomplications--their-impacts)
   - [Performative displays vs truthful info](#performative-displays-vs-truthful-info)
   - [Learnings (cross-cutting principles)](#learnings-cross-cutting-principles)
   - [Growth curves & efficiency improvements](#growth-curves--efficiency-improvements)
   - [Best practice evolutions](#best-practice-evolutions)
   - [New tooling creations](#new-tooling-creations)
   - [Adaptability proofs](#adaptability-proofs)
   - [Closed loops](#closed-loops)
   - [Lossy / expensive pitfalls](#lossy--expensive-pitfalls)
   - [Healing & manual corrections](#healing--manual-corrections)
   - [Human mistakes & triumphs](#human-mistakes--triumphs)
   - [Visual prowess & visual failures](#visual-prowess--visual-failures)
   - [Dependency log](#dependency-log)
   - [Decision log](#decision-log)
   - [Inspirations — adopted, adapted, ignored](#inspirations--adopted-adapted-ignored)
   - [Growth plans & acknowledged shortcomings](#growth-plans--acknowledged-shortcomings)
   - [Self-scoring systems we've built](#self-scoring-systems-weve-built)
   - [Per-phase history](#per-phase-history)
   - [Denied units library (anti-knowledge)](#denied-units-library-anti-knowledge)
   - [Parked units library (in-flight blockers)](#parked-units-library-in-flight-blockers)
   - [Near-miss log](#near-miss-log)
   - [Business / agency signal](#business--agency-signal)
   - [Personal-sustainability signal](#personal-sustainability-signal)
   - [Technical-debt ledger](#technical-debt-ledger)
   - [Deliberate absences](#deliberate-absences)
   - [Bot-building growth curve](#bot-building-growth-curve)
   - [Automation truth table](#automation-truth-table)
   - [Cron opportunity backlog](#cron-opportunity-backlog)
   - [Future-fix registry (FIX-NNN)](#future-fix-registry-fix-nnn)
   - [SIGNAL.md proof-of-firing plan](#signalmd-proof-of-firing-plan)
   - [Industry-frame benchmarks](#industry-frame-benchmarks)
   - [Drift debt (stated vs actual gap)](#drift-debt-stated-vs-actual-gap)
   - [Debt close (debt actively eliminated)](#debt-close-debt-actively-eliminated)
   - [Current gaps based on industry standards](#current-gaps-based-on-industry-standards)
   - [Transferability tagging conventions](#transferability-tagging-conventions)
9. [Audit roadmap — sources to scrutinize](#audit-roadmap--sources-to-scrutinize)
10. [Action plan](#action-plan)
10. [Display ideas](#display-ideas)
11. [Next actions](#next-actions)

---

## Purpose & audience

This document exists to make the *meta-story* of the Hirobius build legible to two audiences simultaneously:

- **Internal (LLM + Adrian)**: a navigable knowledge base so future agent dispatches don't repeat already-solved problems, and so Adrian can audit the system's evolution without re-reading every commit.
- **External (case study readers)**: an honest record of how a self-driving design system gets built — including the failures, the wasted spend, the manual corrections, and the meta-improvements. The portfolio value comes from showing the work *and* the learning loop, not just polished wins.

The dual audience constrains the writing style: **dense, specific, no fluff, no sales language**. Honest counts and SHAs over adjectives.

---

## How to use this doc

- **For a status pulse**: read the [At a glance](#at-a-glance--current-pulse) section.
- **For "have we hit this problem before?"**: search [Failures](#failures--pattern-level-breakage), [Pitfalls](#lossy--expensive-pitfalls), or [Healing](#healing--manual-corrections).
- **For "why did we decide X?"**: search [Decision log](#decision-log) or [Pivots](#pivots).
- **For tooling overview**: see [New tooling creations](#new-tooling-creations) and [Closed loops](#closed-loops).
- **For meta-improvements pending**: see [Proposed improvements](#proposed-improvements-ranked-by-leverage) and [Audit roadmap](#audit-roadmap--sources-to-scrutinize).

Every entry should ideally include: ISO date, commit SHA where relevant, one-line factual summary, lesson (if any). Entries are **append-only** — strike through obsoleted items but never delete; the history *is* the signal.

---

## At a glance — current pulse

*(Snapshot at 2026-05-03 ~17:00 UTC / 10:00 PT, mid-burndown session.)*

| Metric | Value |
|---|---|
| Orchestration units total | 372 |
| Done | ~333 |
| Approved (eligible or dep-blocked) | ~16 |
| Parked | 9 |
| Denied | 15 |
| Needs-grilling (HITL) | 1 |
| Dispatchable right now | ~2 (rest are gated/HITL/dep-blocked) |
| Local hermes loop | dead (needs restart in non-Claude terminal) |
| Active claims | 0 |
| Worktrees provisioned (cumulative) | 17+ |
| Supervisor cron | self-removed at 15:00 UTC (post-cutoff) |
| Dev server (`:3000`) | live, HMR active |

---

## Capture inventory — what we already track

| Mechanism | Location | What it captures | Maintained by |
|---|---|---|---|
| Per-unit abort notes | `docs/ai/orchestration.json` → `agentNotes[]` | Free-form `[hermes abort: ...]` lines per unit; recently extended (commit `1adbae66`) to capture validationCmd stderr verbatim | Hermes loop, manual edits |
| Kimi-specific abort metadata | `docs/ai/orchestration.json` → `_kimiAttempts`, `_kimiLastAbort` | Structured: `{ reason, at, tokens, iters }` — only Kimi populates this | Kimi agent runner |
| Pod execution telemetry | `telemetry/pod-runs.jsonl` | Pod runs (incomplete schema; jq parse errors observed during this session — schema audit needed) | `telemetry/pod-runs.mjs` writer |
| Security/audit trail | `docs/security/agent-audit-log.jsonl` | Agent activity audit | `docs/security/audit-logger.mjs` |
| Hermes "post-mortem learned rule" | Hermes loop log output | One-line learned rules from aborts (e.g. `learned rule for backlog-13: Create a markdown file...`) — **destination unclear**; not yet aggregated anywhere persistent | Hermes loop |
| Manifest state | `public/hds-manifest.json` | Current component/utility inventory | `scripts/generate-manifest.mjs` |
| LLM-readable summary | `public/llms.txt` | Project overview for LLMs (auto-generated from template) | `scripts/generate-llms-txt.mjs` |
| Commit history | `src/app/data/commit-history.json` | Cached commit log for in-app display | `scripts/generate-changelog.mjs` (likely) |
| Health history | `src/app/data/health-history.json` | Component health metric trend | unknown writer — audit |
| Roadmap snapshot | `src/app/data/roadmap.json` | Roadmap state for display | unknown writer — audit |
| Token audit report | `src/app/data/token-audit-report.json` | Latest token-paths audit | `scripts/audit-tokens.mjs` |
| Visual regression artifacts | `tests/visual.spec.ts-snapshots/` + `test-results/` | Per-test baseline + diff PNGs | Playwright |
| Findings docs | `docs/findings/` | Ad-hoc audit reports (e.g. validator coverage audit committed `366f8693`) | Manual + agent |
| Systems log | `docs/SYSTEMS-LOG.md` | System-level changes — content/recency unaudited | Manual |
| Audit scripts | `scripts/audit-*.mjs` (8+ scripts: claims, components, exceptions, figma-system, guardrails, pages, strengths, tiers, tokens) | Per-domain audits — wiring & output destinations vary; needs full survey | Various |

---

## Capture gaps — high-leverage missing signal

1. **No cross-agent pattern recognition.** Each agent reads its own unit's abort history, but nothing aggregates *"5 units all aborted on missing tsd dep — there's a structural pattern."* This session, the dep-blocking issue would have been caught in one pass instead of unit-by-unit.

2. **No worktree-stranding detection.** This session: 5+ deliverables stranded in `worktree-agent-XXX` branches and recovered manually via cherry-pick or file copy. No daemon watches for "agent committed but didn't merge."

3. **No prompt-evolution loop.** `12i-eslint-burndown` was rewritten 4 times before landing — each iteration was a lesson (prompt too long → transport error; need explicit per-rule warning) that lives only in chat memory, not in a versioned dispatch template.

4. **No Adrian-rejection capture.** 4 dispatches rejected this session — 3 due to terminal visual bugs ("looked hung"), 1 intentional. No `[adrian-reject]: <reason>` field; re-dispatched blindly.

5. **Eligibility filter doesn't honor ratification gates.** Hermes loop picked `12n-api-monorepo-workspace-split` despite explicit "DO NOT execute without explicit Adrian ratification" agentNote. Watcher sorts by priority only; doesn't read agentNotes.

6. **No success-pattern capture.** Sonnet wins on units qwen-14b kept failing on (12v Math.random fix, 12i eslint, 12n JSDoc) — but the *why sonnet succeeded* signal isn't recorded. Would inform "use sonnet not haiku/qwen for X-class problems."

7. **`telemetry/pod-runs.jsonl` schema appears partially broken.** jq couldn't parse fields during this session. Either schema drift or writer bug — needs audit.

8. **No "WSL-suspended" detection.** Cron-based supervisor failed silently overnight because WSL2 starves its VM of clock when Windows sleeps. No mechanism to detect "I just woke up, here's what was missed."

9. **No central "active processes" dashboard.** This session required `pgrep` + `ps aux` inspection across multiple terminals to figure out what's running. No source of truth.

10. **No automated ratification escalation.** Units flagged HITL/ratification-gated sit in the queue; nothing surfaces them to Adrian as "these need decisions" except manual queue scans.

---

## Proposed improvements (ranked by leverage)

| # | Build | Effort | Payoff |
|---|---|---|---|
| 1 | **Worktree auto-merge daemon** — small script polling `.claude/worktrees/*/` for fresh deliverable commits matching unit-id pattern; auto-cherry-pick to fix/ui-pipeline | ~1 hour | Eliminates stranded-deliverable manual recovery (5+ times this session) |
| 2 | **Eligibility filter v2** — extend `orchestration-watcher.mjs` to skip units with `"DO NOT execute"`, `"HITL"`, `"needs ratification"` in agentNotes; also skip units with N+ aborts | ~30 min | Hermes stops claiming gated units; auto-skip reduces wasted runs |
| 3 | **Abort taxonomy + ops dashboard surface** — categorize aborts (transport, validation-flake, missing-dep, ambiguous-spec) and surface aggregates ("3 units waiting on a dep decision") | ~3 hours | Makes meta-pattern visible; would have spotted tsd-dep issue once instead of 5x |
| 4 | **Adrian-rejection capture** — when an Agent dispatch returns "user rejected," append `[adrian-reject]: <prompt for reason>` to the unit. Force a reason note before re-dispatch. | ~1 hour | Stops the "was that accidental or intentional?" guessing every round |
| 5 | **Dispatch prompt registry** — versioned prompts per (unit-tier × dispatch-pattern) in `docs/ai/dispatch-prompts/` with success metrics | ~2 hours | Captures hand-tuned prompts so future sessions don't reinvent |
| 6 | **WSL-wake detection + supervisor backfill** — first cron tick after wake should run all skipped supervisor passes in compressed form | ~2 hours | Fixes the silent overnight failure mode demonstrated 2026-05-03 morning |
| 7 | **Active-process unified dashboard** at `/ops` — show hermes loops, worktrees, claude sessions, dev server, supervisor cron in one view | ~3 hours | Eliminates the `pgrep + ps aux` archaeology required this session |
| 8 | **HITL escalation queue** — surface units with HITL/ratification flags as a TODO list for Adrian (Discord ping or `/ops` widget) | ~2 hours | Closes the "queue is drained but Adrian doesn't know" gap |

---

## Session reflection — 2026-05-02 → 2026-05-03 burndown

**Window**: 2026-05-02 ~22:00 PT → 2026-05-03 ~10:00 PT (with overnight gap from ~02:12 PT to ~08:00 PT due to WSL suspend).

**Quantitative**:
- Done units: ~304 → ~333 (**+29 units**)
- Active wall-clock: ~5 hours
- Overnight wall-clock: ~6 hours (zero throughput due to WSL suspend)
- Anthropic spend (this session, agent dispatches): ~$15–25 estimated
- Local hermes/Ollama spend: $0 (electricity)

**Qualitative wins**:
- Sonnet found the *real* root cause on `12v-token-tokens-drift-permanent-fix` — `Math.random()` in `LegacyTokenExplorerPanel` made initial token selection non-deterministic. Qwen-14b had failed 5x on this; sonnet's first successful pass produced a fundamentally better fix than the spec suggested.
- `12g-7-validator-fixtures` codified the "no aspirational guardrails" principle — every validator now provably fires on a contrived sample violation.
- Multi-tenant Figma pipeline closed: `10f-6-figma-library-from-tokens` (script) + `12m-mt-figma-master-per-tenant` (per-tenant overrides) + `10n-6-multi-brand-theming-demo` (visual proof) — three units that together prove the core multi-tenant thesis.
- Card slot system (`12d-card-anatomy-slot-system`) + outline rule (`feedback_outline_rule.md` memory) + INLINE_STRUCTURAL_BORDER ratchet gate (commit `05731462`) — a cohesive design-system hardening trio.

**Wasted spend (~20% of session cost)**:
- ~$2–3 on dispatches that landed in stranded worktree branches and required manual recovery
- ~$1 on accidental Adrian-rejections (terminal visual bug, not intent)
- ~$0.50 on `12i-eslint-burndown` retries before discovering the prompt-too-long → transport-error pattern
- ~$0 (but real time cost) on the overnight supervisor that fired exactly once and self-removed without doing useful work

**Win rate** (Claude pods only):
- Round 1: 3/6 done, 2 user-rejected (false), 1 transport error
- Round 2: 5/6 done, 1 transport error (12i-eslint round 1)
- Round 3: 5/6 done, 1 user-rejected (12i-eslint-import-x — eventually retried successfully)
- Round 4 (final): 2/2 done (12p-type-tests + 12i-import-x retry, both clean after spec fix)
- **Aggregate: ~75% first-attempt success on Claude sonnet pods, ~95% if including retries.**

**Win rate (Hermes/qwen-14b)**:
- Overnight pre-suspend window: ~10 unit deliverables before sleep
- Post-resume hermes runs: queue-drainer; aborted on most remaining units (T4 + previously-aborted units it correctly skips)
- **Aggregate: very high success on T1/T2 mechanical units; near-zero on units requiring real reasoning.**

---

## Wins

*(Append commit SHAs and one-line summaries.)*

- `feat(card): 12d-card-anatomy-slot-system codify + extend + migrate + enforce` — codified the card slot system (single Card + slots covers all archetypes; status/progress/metadata never inline next to prose; outline-by-tone)
- `feat(callout): HdsCallout primitive + WetPaintPage outline sweep` (commit `268381b0`) — new primitive, outline rule applied
- `feat(gate): INLINE_STRUCTURAL_BORDER rule + ratchet baseline` (commit `05731462`) — new lint rule that prevents inline structural borders from regressing
- `feat(card): borderless default + Header.metadata top placement` (commit `6640dd0c`) — borderless cards as default per outline rule
- `fix(color): replace raw rgba hex with semantic.color.border.subdued` (commit `01:40:32-07`) — token discipline applied
- `feat(test): 12p-test-focus-flow-analysis playwright tab-order spec` — 15 focus-order tests across 5 routes, all passing
- `feat(figma): 10f-6-figma-library-from-tokens dry-run library generator` — new write-path from tokens.json → Figma Variables payload
- `feat(figma): 12m-mt-figma-master-per-tenant per-tenant master generation` — closes multi-tenant Figma pipeline
- `feat(demo): 10n-6-multi-brand-theming-demo` — `/hds/brand-theming` page proves multi-brand visual swap
- `feat(api): 12n-api-internal-vs-public-jsdoc tag public/internal + barrel audit` — 43 @public, 12 @internal, api-extractor wired
- `feat(test): 12p-test-coverage-reporting-wired vitest v8 coverage + baseline` — 50.75% stmts / 24.05% branches / 54.38% lines baseline committed
- `feat(quality): 12g-8-promote-fast-checks-to-precommit` — 4 hard gates (colors, fonts, spacing, mojibake); fixed mojibake perf bug (12s → 0.1s)
- `feat(quality): 12i-quality-template-source-of-truth` — fixed 2 bugs in existing checker (staged-only default, COMMIT_EDITMSG bypass)
- `chore(quality): 12g-5-validator-wiring-audit` — 6 orphan validators all → WIRE, no deletions
- `feat(quality): 12g-7-validator-fixtures` — 11 proof-of-firing fixtures, all pass
- `feat(docs): 10n-5-token-relationship-diagram-interactive cascade visualization` — hover any token → highlight cascade
- `refactor(nav): backlog-19-data-driven-sidebar-nav sidebar from manifest` — 35 lines of hardcoded JSX → registry-driven
- `feat(test): 12p-test-type-tests-prop-stability tsc-based type-tests for primitive props` — 5 test-d.ts files, no new dep
- `chore(quality): 12i-quality-eslint-import-x-migration` — swapped to ESLint 10-native plugin
- `chore(quality): 12i-quality-eslint-burndown zero warnings` — final 1 warning fixed (Grid swap in TokenCascadeDiagram)
- `docs(findings): backlog-13-design-extract-gap-analysis` — 169-line gap analysis + 5 proposed backlog units (backlog-14 through 18)
- `feat(ops): 10o-11-github-actions-ci minimal PR gate workflow` — new `.github/workflows/ci.yml`
- `feat(starter): 10n-7-public-starter-kit minimal HDS consumer app` — proof of external consumability
- `feat(home): 12c-1-hirobius-case-study-homepage` — case study slot + Swiss reflow
- `fix(test): 10o-11-vrt-stability-late-blank-render four-pass VRT stabilization` (commit `8bbc88be`) — unblocked downstream VRT-dependent units

---

## Failures & pattern-level breakage

- **WSL2 suspend-during-sleep kills cron + hermes loops**. Demonstrated overnight 2026-05-02 → 2026-05-03. Supervisor fired exactly once at 15:00 UTC (immediately past its self-disable cutoff) and removed itself. Hermes died with the suspend. *Pattern: any "set and forget overnight" mechanism on a WSL2 machine must account for host sleep.*
- **Worktree isolation strands deliverables**. Multiple agents this session committed to `worktree-agent-XXX` branches without merging back to fix/ui-pipeline. Cherry-pick recovery required for 12g-7, 10n-5, backlog-19, 10f-6, 12i-import-x. *Pattern: Agent tool's `isolation: "worktree"` does not auto-merge — caller must.*
- **Long Agent prompts hit transport errors**. `12i-quality-eslint-burndown` failed 3x on internal Agent tool errors with the verbose CLAUDE.md-quoting prompt. Trimmed prompt landed it on attempt 4. *Pattern: Agent prompts >~1KB risk transport failure; keep lean.*
- **Hermes loop ignores ratification gates**. Picked `12n-api-monorepo-workspace-split` despite explicit "DO NOT execute" agentNote. *Pattern: orchestration-watcher's eligibility filter doesn't read agentNotes for blockers.*
- **Bulk `pnpm lint:fix` corrupts code**. Per CLAUDE.md "NEVER bulk-lint:fix" rule (codified after multi-pod incident — HDSLayout.tsx, BurnDownPage.tsx, PortfolioDraftPage.tsx broken). *Pattern: ESLint rule auto-fixes can merge unrelated code blocks; per-rule scope mandatory.*
- **Adrian-rejection cause ambiguous**. Multiple "user rejected this tool use" outcomes turned out to be terminal visual bugs (looked hung) not intent. *Pattern: rejections carry no metadata; we re-dispatched blindly.*
- **`12i-eslint-burndown` accumulated 5 hermes aborts before sonnet cleared it on a 1-line fix**. The actual residual issue was a single `no-restricted-syntax` warning on a raw `<div style={{ display: 'grid' }}>` in TokenCascadeDiagram. Qwen-14b couldn't navigate the per-rule protocol; sonnet found and fixed it in one pass. *Pattern: small models flail on multi-step linting protocols; route to bigger model after 2 aborts.*
- **`telemetry/pod-runs.jsonl` schema partial breakage**. jq couldn't parse expected fields during this session. *Pattern: writer drift from reader expectations — needs schema audit + version field.*
- **Cherry-pick conflicts on orchestration.json common**. Every cherry-pick this session hit orchestration.json conflicts because the file changes constantly. *Pattern: any recovery flow must handle orchestration.json merge specifically; consider splitting per-unit JSON files.*

---

## Pivots

- **2026-05-03 ~01:30 PT — supervisor strategy pivot**: planned remote Anthropic routine (cloud-based) → switched to local cron + Claude CLI after realizing remote routines can't see local-only state and would need git push (banned). Local cron then failed due to WSL suspend. *Net: planned twice, neither path worked overnight; need WSL-aware approach next.*
- **2026-05-03 ~16:40 — `12p-test-type-tests-prop-stability` validation gate**: flipped from `pnpm exec tsd` (would have required new dep) to `pnpm exec tsc --noEmit -p tests/types/tsconfig.json` (no new dep). Unit's own agentNotes already endorsed tsc-based approach. *Lesson: read the spec carefully — sometimes the gate contradicts the agentNotes.*
- **Phase 8 → shadcn pivot** (per memory `project_genui_pipeline.md`): ~10 of 28 units closed, paused at 8s-2 (Radix primitives + cva/clsx/cn helpers). Real driver per `project_phase8_motivation.md` was LLM output quality.
- **`12u-cc-repo-bootstrap`**: deferred from "dispatch tonight" to "needs opus PLAN session first." Recognized as too high-blast-radius for one-shot.

---

## Rebuilds & teardowns

- **HDSLayout.tsx + BurnDownPage.tsx + PortfolioDraftPage.tsx**: required teardown after Pod N's bulk lint:fix incident (CLAUDE.md "NEVER bulk-lint:fix" rule encodes this).
- **`12d-dashboard-token-cleanup`** (commit `01:12:14-07`): dead-var sweep + typography hierarchy refactor.
- **`12i-bloat-mobius-glsl-extract`** (commit `2026-05-02T23:14:24-07`): pulled GLSL passes into named module constants — reducing bloat in mobius file.
- **TokenCascadeDiagram.tsx**: rebuilt twice in same day — first to add hover interactivity, then to fix a missing CSS grid layout bug that made the static-vs-interactive comparison wrong.

---

## Simplifications & their impacts

- **Card outline rule** (memory `feedback_outline_rule.md` + `feedback_card_slot_system.md`): "outlines reserved for interactive containers; display surfaces use background contrast + side-rules + whitespace." Applied across the design system — produces visibly less "cardboard cutout" UI. Codified by INLINE_STRUCTURAL_BORDER lint gate (commit `05731462`).
- **`backlog-19-data-driven-sidebar-nav`**: removed 35 lines of hardcoded JSX for sidebar; now derives from `hds-registry.json` via `hds-nav-data.ts`. New pages added to sidebar by setting `navSection` + `navOrder` registry fields — no code changes required.
- **`12i-quality-eslint-burndown` final fix**: a single line — replaced raw `<div>` with `Grid columns={3}`. Simpler than alternative of suppressing the lint rule.
- **`12v-token-drift` Math.random() → pool[0]**: simplest possible deterministic fix. Kept random for the interactive Shuffle button. Replaced an entire baseline-refresh workaround with one assignment change.

---

## Overcomplications & their impacts

- **Overnight supervisor cron**: planned for cleanup + restart + ledger. Built for 30-min cadence with self-disable. Net result: 0 useful runs because of WSL suspend. *Impact: ~1 hour of design + ~$0 actual usage = pure overhead.* Lesson: solve the foundational issue (WSL sleep) before building scheduled automation.
- **Long Agent dispatch prompts** with full CLAUDE.md quotes inline. *Impact: 3 transport errors on `12i-eslint-burndown`. Trimming the prompt to essential bullets fixed it.*
- **`12u-cc-repo-bootstrap` historical attempts** (per orchestration.json `_kimiAttempts: 1, _kimiLastAbort.iters: 12, _kimiLastAbort.tokens: 70314`): 4+ hermes aborts + 1 kimi max-iter abort (12 turns, 70k tokens) before flagging as multi-day work requiring T4. *Impact: ~70k tokens wasted before the unit was correctly classified.*

---

## Performative displays vs truthful info

- **Hermes "post-mortem learned rule"** in log output. Looks like ML-style learning. Reality: just appends a one-liner to log; destination unclear; not aggregated; not consumed. *Honest read: an aspirational guardrail per CLAUDE.md memory — not yet a real loop.*
- **`docs/security/agent-audit-log.jsonl`**: file exists, format suggests structured audit trail. *Has it ever been queried for an actual security review? Audit pending.*
- **Multiple "audit" scripts** in `scripts/audit-*.mjs`. 8+ scripts. *Are they all wired to anything that runs them on a schedule? Are their outputs read by anyone? Audit pending — see [Audit roadmap](#audit-roadmap--sources-to-scrutinize).*

---

## Learnings (cross-cutting principles)

- **"Always pick the cheapest model that can do the job"** (Adrian directive 2026-05-01, codified in CLAUDE.md and memory `feedback_eco_efficient_subagents.md`). Validated this session: 75%+ win rate on sonnet without resorting to opus.
- **Deletions need sonnet's judgment** (CLAUDE.md, validated by Pod 2's token-explorer near-miss): qwen-14b cleared mechanical work but missed live consumers when deleting.
- **One unit per agent** (token-health directive 2026-05-02): keeps context small, fewer cross-unit collisions, cleaner diffs.
- **No aspirational guardrails** (memory `feedback_no_aspirational_guardrails.md`): a rule isn't done until it's codified, gated, wired, and proven firing on a sample violation. `12g-7-validator-fixtures` operationalized this principle.
- **Worktree isolation requires explicit merge-back**. Caller responsibility, not the Agent tool's.
- **Adrian's autonomous-execution preference** (memory `user_profile.md` + `feedback_approach.md`): minimal prompting, judgment calls expected. But: complex strategic units (12u repo bootstrap, 13s-10 GRC career planning) explicitly want ratification.
- **Visual snapshot scope must include behaviorally-significant content**. The `12v` fix decided to *include* Token Explorer Details panel descriptions in snapshots so future drift gets caught — choosing breadth over noise.

---

## Growth curves & efficiency improvements

- **Done units 2026-05-02 → 2026-05-03**: ~304 → ~333 (+29). Velocity ~6 units/active hour during this session.
- **Mojibake check perf** (commit `12g-8-...`): 12s → 0.1s (added `.claude` to SKIP_DIRS so it stops scanning peer worktrees).
- **Component count** (per latest manifest validation log): 45 components, 81 utilities, growing.
- **Agent win rate over the build**: subjective improvement as patterns crystallize (CLAUDE.md per-rule lint rule, worktree caveats, token-health prompt sizing). Not yet quantified — *audit roadmap item: extract per-pod success rate from `telemetry/pod-runs.jsonl` once schema is validated.*

---

## Best practice evolutions

- **Per-rule ESLint scope** (replacing bulk lint:fix). Codified in CLAUDE.md "NEVER bulk-lint:fix" section with safe-allowlist. Validated repeatedly this session.
- **Sonnet for deletions** (Adrian directive 2026-05-01). Pod 2 token-explorer near-miss as the trigger.
- **One unit per agent, lean prompts, claim-before-work** — token-health directive 2026-05-02. Validated with this session's win rates.
- **Worktree isolation for parallel pods, but caller must merge back**. New pattern — codify in CLAUDE.md.
- **Dispatch prompt template under ~30 lines**. Empirical finding from `12i-eslint-burndown` transport-error pattern. Codify in CLAUDE.md.
- **Outline rule + card slot system**: design-system rules per memories `feedback_outline_rule.md` + `feedback_card_slot_system.md`.
- **Validator fixtures mandatory**: every check-*.mjs needs a proof-of-firing fixture (`12g-7`).
- **`--no-verify` on agent commits**: pre-commit checks the whole repo and may fail on unrelated work. Standard for parallel pods.

---

## New tooling creations

*(Files born this session unless otherwise noted.)*

| Path | Purpose | Unit |
|---|---|---|
| `scripts/figma-library-generate.mjs` | Generates Figma Variables API payload from `hirobius.tokens.json` (dry-run / summary / live modes) | `10f-6-figma-library-from-tokens` |
| `pipeline/figma-masters-batch.mjs` (extended) | Per-tenant Figma master generation with token override propagation | `12m-mt-figma-master-per-tenant` |
| `scripts/__tests__/run-canon-fixtures.mjs` + `scripts/__tests__/fixtures/canon/*.tsx` | 11 proof-of-firing fixtures + runner — every canon rule asserts non-zero exit on its own contrived violation | `12g-7-validator-fixtures` |
| `tests/focus-flow.spec.ts` | Playwright tab-order spec, 15 tests across 5 routes | `12p-test-focus-flow-analysis` |
| `tests/types/*.test-d.ts` + `tests/types/tsconfig.json` | TypeScript prop-stability type-tests using tsc-only assertions | `12p-test-type-tests-prop-stability` |
| `scripts/check-template-source-of-truth.mjs` (bug fixes) | Staged-only default + `COMMIT_EDITMSG` bypass | `12i-quality-template-source-of-truth` |
| `src/app/data/hds-nav-data.ts` | Sidebar nav derived from `hds-registry.json` | `backlog-19-data-driven-sidebar-nav` |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | `/hds/brand-theming` demo (3 brands side-by-side) | `10n-6-multi-brand-theming-demo` |
| `.github/workflows/ci.yml` | Minimal PR gate (install → typecheck → check:full → build → playwright) | `10o-11-github-actions-ci` |
| `tests/coverage-summary.json` | Vitest v8 coverage baseline (50.75% / 24.05% / 54.38%) | `12p-test-coverage-reporting-wired` |
| `vitest.config.ts` (extended) | Coverage provider v8 + thresholds at measured floor | `12p-test-coverage-reporting-wired` |
| `docs/findings/...validator-coverage-audit.md` | Validator coverage audit (commit `366f8693`) | manual |
| `docs/ai/DESIGN_EXTRACT_GAP.md` | 169-line gap analysis vs github.com/Manavarya09/design-extract; 5 proposed backlog units | `backlog-13-design-extract-gap-analysis` |
| `scripts/overnight-supervisor.sh` (created, then self-disabled) | Cron-driven Opus supervisor for stale-claim cleanup + ledger appends | session prototype |
| `api-extractor.json` + `tsconfig.api-extractor.json` | api-extractor config for the public-API surface | `12n-api-internal-vs-public-jsdoc` |

---

## Adaptability proofs

- **Multi-tenant pipeline closed end-to-end**: `10f-6` (Figma library generator) + `12m` (per-tenant master generation) + `10n-6` (multi-brand demo) prove the multi-tenant thesis works — same components, three brands, token-only override. Pilot client `concrete-creations` token override (warm-stone `#8B6F47`) verified to patch button fill correctly.
- **Self-correcting validator gate**: `12p-test-type-tests-prop-stability` validation gate was wrong (called for `tsd` dep). We swapped it to `tsc --noEmit` and the unit shipped. Pattern: orchestration spec is editable when it conflicts with hard rules.
- **Multi-model dispatch routing**: hermes-qwen handles cheap T1/T2 mechanical work; sonnet handles reasoning-heavy or aborted units; opus reserved for architectural ambiguity (e.g. 12u). Validated this session by win-rate disparity.
- **Recovery from Adrian-rejection**: pattern of "user rejected → check intent → release claim → re-dispatch" handled smoothly across multiple rounds.

---

## Closed loops

| Loop | What closes it | Status |
|---|---|---|
| Token authoring → Figma sync | `10f-6-figma-library-from-tokens` | ✅ closed (write path live, dry-run) |
| Token override → tenant Figma master | `12m-mt-figma-master-per-tenant` | ✅ closed |
| Validator coverage → proof-of-firing | `12g-7-validator-fixtures` | ✅ closed |
| Validator → pre-commit gate | `12g-8-promote-fast-checks-to-precommit` | ✅ closed (4 hard gates) |
| Test coverage → regression gate | `12p-test-coverage-reporting-wired` | ✅ closed (baseline committed, thresholds set) |
| Public API → release tracking | `12n-api-internal-vs-public-jsdoc` + `12n-api-extractor-wired` | ✅ closed (api-extractor configured) |
| Focus order → accessibility regression gate | `12p-test-focus-flow-analysis` | ✅ closed |
| Type stability → release gate | `12p-test-type-tests-prop-stability` | ✅ closed (tsc-based) |
| Lint warnings → zero baseline | `12i-quality-eslint-burndown` | ✅ closed (--max-warnings=0 in pre-commit) |
| Sidebar items → registry data | `backlog-19-data-driven-sidebar-nav` | ✅ closed |
| Hermes abort → pattern learning | "post-mortem learned rule" log line | 🟡 partial (logged, not aggregated) |
| Worktree deliverable → fix/ui-pipeline merge | manual cherry-pick | ❌ open (proposed improvement #1) |
| Dispatch failure → prompt evolution | manual rewrites | ❌ open (proposed improvement #5) |
| Adrian rejection → reason capture | none | ❌ open (proposed improvement #4) |
| Hermes-loop liveness → restart | dead → manual restart | 🟡 partial (supervisor cron tried, defeated by WSL suspend) |
| WSL suspend → process restart on wake | none | ❌ open (proposed improvement #6) |

---

## Lossy / expensive pitfalls

- **Worktree stranding**: ~$2–3 of session spend recovered via manual cherry-pick. Without recovery, the work would have been re-dispatched at full cost.
- **Long prompt → transport error retries**: ~$0.50 lost on `12i-eslint` before recognizing the pattern.
- **Accidental Adrian-rejection**: ~$1 lost on dispatches that were claimed-then-abandoned because we couldn't tell intent vs visual bug.
- **Overnight supervisor doing nothing**: zero token cost (it self-disabled), but ~1 hour of design time + an empty 6-hour sleep window. Time cost real, dollar cost zero.
- **Hermes loop attempting `12u-cc-repo-bootstrap` 4+ times**: each abort cost a chunk of context + GPU time. Eligibility filter v2 (proposed improvement #2) closes this.
- **`12u-cc-repo-bootstrap` Kimi attempt**: 70,314 tokens, 12 iterations, max-iter abort. Pure waste — should have been classified T4 / human-only earlier.
- **Bespoke gate sprawl** (recognized 2026-05-06): authored ~75 custom guardrail gates over many sessions. The `audit-gate-replaceability` audit (commit `c1e4d996`) categorized them: 19 fully replaceable by industry tools (eslint-plugin-jsx-a11y, eslint-plugin-tailwindcss, lint-staged, knip-cli, type-coverage, editorconfig-checker, size-limit, etc), 20 partially replaceable, 37 genuinely custom. **Estimated bespoke-code loss: ~1,650 LOC across 9 immediately-replaceable gates + ~3,000 additional LOC if Style Dictionary swap proceeds (build-tokens.mjs reinvents SD). Total quick-win recoverable LOC: ~4,650.** Each bespoke gate also took fixture-authoring time (Wave 1 + Wave 2 = ~2 sonnet sessions of fixtures we'll throw away when those gates retire). Antipattern: needed → wrote a script → registered it → moved on. No "is there an off-the-shelf tool" check at the front of the lifecycle. Recovery in flight: dispatched migration unit (commit pending) replaces 9 gates with 5 npm packages. **Pattern lesson:** before authoring any new validator/audit/check, the first 5 minutes go to "what does industry do here?" rather than "what regex catches this?" Adding a `before-you-author` checklist to `docs/ai/AGENT_GUIDELINES.md` is FIX-032.

---

## Healing & manual corrections

- **Worktree cherry-picks** (5+ this session): `10f-6`, `12g-7`, `10n-5`, `backlog-19`, `12i-import-x`. Pattern: stash dirty tree → cherry-pick or copy file → flip orchestration.json status → commit with `--no-verify`.
- **Stale claim releases**: `10n-5-token-relationship-diagram-interactive`, `12i-quality-template-source-of-truth`, `12i-quality-eslint-burndown` (multiple times), `12v-token-tokens-drift-permanent-fix`, `backlog-13-design-extract-gap-analysis`. Pattern: `node -e` to flip status, append `[supervisor ISO]: claim cleared` agentNote, single commit.
- **Spec correction** (`12p-test-type-tests-prop-stability` validationCmd): flipped `pnpm exec tsd` → `pnpm exec tsc --noEmit -p tests/types/tsconfig.json` to avoid forbidden new dep.
- **Parking ratification-gated unit** (`12n-api-monorepo-workspace-split`): flipped to `parked` after 4 hermes aborts; explicit agentNote about needing opus plan-first session.
- **`fix(loop): unblock hermes pretest + better validation failure capture`** (commit `1adbae66`): hermes itself was patched to capture validationCmd stderr verbatim — meta-improvement.
- **Lint baseline fix in `TokenCascadeDiagram.tsx`**: replaced raw grid `<div>` with `Grid columns={3}` (sonnet's 1-line fix that closed `12i-eslint-burndown` after 5 prior aborts).

---

## Human mistakes & triumphs

**Mistakes (Adrian, this session)**:
- 3 accidental dispatch rejections due to terminal visual bugs (looked hung). *Lesson: needs `[adrian-reject]: reason` capture (proposed improvement #4).*
- Sleeping while expecting cron supervisor to maintain hermes — but WSL suspend defeated it. *Lesson: WSL-aware sleep handling (proposed improvement #6).*

**Triumphs (Adrian, this session)**:
- Stayed up late to keep hermes moving: ~10 deliverables landed in the 22:00 → 02:12 PT window before sleep.
- Caught the `12n-api-monorepo-workspace-split` ratification flag *before* I dispatched it (initial review of my list).
- Caught my "split worker recommendations" against context — pushed back on parking high-abort units, asked for them to be finished instead. Result: all the high-abort units (`12i-eslint`, `12v-token-drift`, `12p-coverage`, `10f-6-figma`, `backlog-13`, `12p-focus-flow`, `12p-type-tests`) eventually landed.
- Pivoted to "use Claude instead of hermes" prompt request when local hermes path got fragile — got a tested workflow from this session captured for future use.

**Mistakes (LLM/agent, this session)**:
- Built overnight supervisor without verifying WSL would stay awake. *Should have asked.*
- Wrote long Agent prompts that triggered transport errors on `12i-eslint`. *Should have started lean.*
- Did not flag the `12p-test-type-tests-prop-stability` `tsd`-vs-`tsc` validation-gate contradiction during initial queue scan. *Spec contradiction was visible in agentNotes if read carefully.*
- Multiple suggestion rounds on parking high-abort units that Adrian wanted finished. *Should have offered "fix" alongside "park" earlier.*

**Triumphs (agent dispatches)**:
- Sonnet's Math.random() root-cause find on `12v` (where qwen-14b had failed 5x) — fundamentally better fix than the spec called for.
- `12g-7-validator-fixtures` agent independently chose the right fixture taxonomy (one per canon rule code) without explicit instruction.
- `12n-api-internal-vs-public-jsdoc` agent correctly biased toward narrow public surface (43 @public, 12 @internal).
- `backlog-13-design-extract-gap-analysis` agent produced a structured, navigable gap analysis with 5 proposed backlog units (which became `backlog-14` through `backlog-18`).
- `12p-coverage` recovery agent: noticed the prior-attempt's worktree branch had everything, regenerated baseline, copied to fix/ui-pipeline.

---

## Visual prowess & visual failures

**Prowess**:
- Card slot system (12d) + outline rule: visibly less "cardboard cutout"; consistent metadata placement (Header.metadata top); HDS aesthetic per memory `feedback_ai_aesthetic_antipatterns.md`.
- Multi-brand theming demo (`/hds/brand-theming`): three brands side-by-side, same components, token-only override. Visual proof of multi-tenant thesis.
- Token cascade diagram with hover interactivity (10n-5): primitives → semantic → component highlight on hover; CSS grid layout fix made the bezier paths render correctly.
- Hirobius case study homepage (12c-1) with Swiss reflow.
- HdsCallout primitive (268381b0) — new reusable primitive, outline-by-tone consistency.

**Failures + corrections**:
- `LegacyTokenExplorerPanel` Math.random() initial selection caused VRT TV viewport non-determinism (12v). *Fixed with `pool[0]` deterministic default.*
- VRT late-blank-render flake (10o-11) caused intermittent test failures. *Fixed with four-pass stabilization (commit `8bbc88be`).*
- `WetPaintPage` outline sweep (268381b0): pre-fix had outlines on display surfaces in violation of outline rule. *Corrected as part of HdsCallout introduction.*
- `ComponentHealthPage` had 3 tight internal table gaps without viable token substitutes. *Annotated with `// spacing-ok:` exemptions per spacing-check protocol.*
- `ClientDashboardPage` had 11 raw px spacing values + 1 `3px` optical alignment. *Fixed with hds.space tokens; one annotation.*
- TokenCascadeDiagram missing CSS grid layout caused stacked-vertical column rendering. *Fixed in 10n-5 re-dispatch (one CSS grid declaration).*
- Visual baselines updated multiple times during this session (desktop, mobile, tv variants for /hds/tokens) — captures real visual changes from work.

---

## Dependency log

**Added**:
- `@vitest/coverage-v8@4.1.0` (2026-05-03, unit `12p-test-coverage-reporting-wired`) — official vitest v8 coverage provider, no alternative; explicitly authorized exception to no-deps rule.
- `eslint-plugin-import-x@4.16.2` (2026-05-03, unit `12i-quality-eslint-import-x-migration`) — ESLint 10 native, replaces eslint-plugin-import.

**Removed**:
- `eslint-plugin-import` (2026-05-03, unit `12i-quality-eslint-import-x-migration`) — broken on ESLint 10, called removed `getTokenOrCommentBefore` API.

**Considered but rejected**:
- `tsd` (~2026-05-03, would have been required by `12p-test-type-tests-prop-stability`'s original validationCmd) — instead, we flipped the gate to use `tsc --noEmit` (no new dep needed).

---

## Decision log

| Date | Decision | Rationale | Status |
|---|---|---|---|
| 2026-05-01 | "Always pick the cheapest model that can do the job" | Adrian directive; codified in CLAUDE.md and memory | active |
| 2026-05-01 | "Sonnet required for deletions" | Pod 2 token-explorer near-miss | active |
| 2026-05-02 | "1 unit per agent" (token-health directive) | Lower context cost, no cross-unit bleed | active |
| 2026-05-02 | "Lean prompts — no copying CLAUDE.md, max 3 bullets" | Token-health + transport-error risk | active |
| 2026-05-02 | "Raise parallel pod cap to 6-8" | Smaller pods = less merge conflict surface | active |
| 2026-05-02 | "Default conversion to pnpm workspace" for 12n monorepo split | Architectural decision recorded | parked (needs ratification) |
| 2026-05-02 | Caffeinate Windows / fix WSL suspend? | Not yet decided | open |
| 2026-05-03 | `12n-api-monorepo-workspace-split` parked | Multi-day architectural shift; needs opus plan-first session + ratification | parked |
| 2026-05-03 | `12p-test-type-tests-prop-stability` validationCmd flipped from `tsd` to `tsc --noEmit` | Avoid forbidden new dep; agentNotes already specified tsc as alternative | done |
| 2026-05-03 | `12v-token-drift` snapshot scope = include Details panel | Future drift gets caught (option a in spec) | done |
| 2026-05-03 | `12u-cc-repo-bootstrap` deferred | Needs opus PLAN session + ratification before execute | open |
| 2026-05-03 | Skip `13s-10-grc-career-planning` for autonomous dispatch | Explicit HITL flag in spec | open (Adrian to grill) |
| 2026-05-03 | Bundle session findings into canonical SIGNAL.md | This document | done |

---

## Inspirations — adopted, adapted, ignored

*(Where ideas came from; what we kept, modified, or rejected.)*

| Source | What we took | Verdict |
|---|---|---|
| **Swiss design** (Müller-Brockmann tradition) | Grid system; reflow discipline; outline-by-tone vs always-bordered surfaces; whitespace as structure | **adopted** — codified in CLAUDE.md ("repeated outlined cards as default" → forbidden); applied in 12c-1 case study homepage; memory `feedback_outline_rule.md` |
| **Addy Osmani frameworks** | Performance budget hard-fail; per-component bundle size budgets; ratchet baselines | **adopted** — `12o-perf-bundle-budget-hard-fail-promote` (commit `4422de22`); memory `reference_phase8_hardening_skills.md` |
| **shadcn/ui + Radix** | Headless primitive layer; cva/clsx/cn pattern; copy-paste-not-install model | **adopting** — Phase 8 shadcn-pivot in flight per memory `project_genui_pipeline.md` (~10/28 units done; resume at 8s-2 with Radix primitives + cva/clsx/cn helpers) |
| **Polaris (Shopify)** | Per-component changelog metadata pattern | **adopted** — orchestration unit `12n-api-per-component-changelog` (DONE) |
| **Polaris + Spectrum (Adobe)** | Type-tests for prop interface stability | **adopted** — `12p-test-type-tests-prop-stability` (DONE, using tsc-only assertions instead of their tsd preference) |
| **Mantine + Chakra** | CodeSandbox/StackBlitz embed per primitive on docs pages | **adopting** — orchestration unit `12n-api-codesandbox-embed-per-primitive` (DONE via worktree merge) |
| **github.com/Manavarya09/design-extract** | Playwright DOM/CSS crawler @ 4 breakpoints; DTCG token output; interaction-state capture; MCP server; VS Code/Chrome/Figma plugins | **partially adopted** — gap analysis `docs/ai/DESIGN_EXTRACT_GAP.md` documents what we already cover (source-aware token sync, autonomous build orchestration, multi-tenant token overrides, comprehensive VRT) and 5 gaps worth closing (proposed `backlog-14` through `backlog-18`); motion ingestion deferred (CSS declaration harvest = 90% of value, video recording for reports only, JS Web Animations API monkey-patch rejected as too brittle) |
| **NIST CSF 2.0** | Control framework for security narrative | **adopting** — `13s-10-grc-career-planning` requires `controls.md` mapped to NIST CSF 2.0 |
| **DTCG (Design Tokens Community Group)** | Token JSON format with `$type`, `$value`, `$description`; alias references via `{path.to.token}` | **adopted** — `hirobius.tokens.json` is W3C DTCG; `scripts/figma-library-generate.mjs` walks DTCG tree directly |
| **api-extractor (Microsoft)** | Public/internal API tagging via JSDoc `@public` / `@internal`; "is reachable through but not exported" reachability detection | **adopted** — wired in `12n-api-extractor-wired` and `12n-api-internal-vs-public-jsdoc` |
| **Husky** | Git pre-commit hooks | **adopted** — `.husky/pre-commit` with hard gates: validate-manifest, check-manifest-drift, color/font/spacing/mojibake/template-SOT checks |
| **Changesets (npm)** | Per-package version + changelog | **planned** — referenced in 12n monorepo split spec; not yet adopted (whole 12n is parked) |
| **Hermes / NousResearch local LLM agents** | Tool-use agent loop via local Ollama | **adopted** — `scripts/hermes-unit.mjs` is the workhorse; runs qwen2.5-coder:14b for free; memory `project_kimi_integration.md` notes Kimi-K2 as the parallel API runner |
| **Claude Code parallel sub-agents** | `Agent` tool with `isolation: "worktree"` for multi-pod dispatch | **adopted with caveat** — works but worktree merge-back is caller responsibility (this session: 5+ stranded deliverables manual-recovered); proposed improvement #1 closes this loop |
| **OpenAI Codex CLI** | Alternative coding agent | **evaluated, kept as fallback** — single-threaded vs Claude Code parallel; useful when Anthropic budget low; prompt translation captured in this session |
| **Vercel + Stripe + Clerk** (typical agency stack) | Deploy + payments + auth | **adopting selectively per tenant** — Concrete Creations gets separate Vercel deploy + Stripe per memory `project_concrete_ecommerce.md`; not unified across tenants |
| **Discord** | Async notification + rambling-input pipeline | **building** — Discord bot in flight (memory `project_workspace_hq.md`, `project_ramble_processor.md`) |
| **Obsidian / Notion / Google Docs** | External knowledge management | **rejected** — memory `feedback_knowledge_management.md`: keep all planning inside the repo; never recommend external KM tools |
| **Figma official MCP server** | Read designs from Figma; create FigJam diagrams | **adopted** — connected via claude.ai connector; primary tool for design-to-code workflow |
| **Reno Perry "5 leave-behinds"** (job search portfolio framework) | Portfolio doubles as interview asset | **adopted** — memory `project_job_search_ref.md`; HDS work intentionally portfolio-shaped |
| **GROQ + Whisper for transcription** | Call-recording pipeline | **adopting** — `scripts/process-call-recording.mjs` per memory `project_recording_pipeline.md` |

---

## Growth plans & acknowledged shortcomings

**Acknowledged systemic shortcomings** (where we know we're weak):

| Shortcoming | Where it bites | Plan |
|---|---|---|
| **WSL2 host-sleep starves cron + background processes** | Overnight automation silently dies; no backfill | Proposed improvement #6 (WSL-wake detection); alt: caffeinate Windows; alt: move scheduled work to a real server |
| **Worktree isolation strands deliverables** | ~$2–3/session wasted on cherry-pick recovery | Proposed improvement #1 (worktree auto-merge daemon) |
| **Hermes loop ignores ratification gates** | Wastes runs on parked-but-claimed-anyway units | Proposed improvement #2 (eligibility filter v2 honors agentNotes flags) |
| **No cross-agent pattern recognition** | Same root cause discovered N times | Proposed improvement #3 (abort taxonomy + ops dashboard) |
| **No prompt evolution loop** | Hand-tune each dispatch from scratch | Proposed improvement #5 (versioned prompt registry) |
| **No structured Adrian-rejection capture** | Re-dispatch blindly after rejection | Proposed improvement #4 (force reason note) |
| **`telemetry/pod-runs.jsonl` schema drift** | Reader (jq) failures during ops queries | Audit roadmap #1 — pending |
| **Local hermes (qwen-14b) flails on reasoning-heavy units** | Wasted context + GPU time | Established escalation: 2+ aborts → escalate to Claude/sonnet (already in hermes loop logic) |
| **Pre-commit hooks fail noisily on unrelated files** | Agents must use `--no-verify`; loses gate value | Acknowledge: `--no-verify` standard for parallel pods; pre-commit only for human commits |
| **No "active processes" unified view** | Manual `pgrep` + `ps aux` archaeology required | Proposed improvement #7 (`/ops` active-processes panel) |
| **HITL units don't surface for ratification** | Adrian sees them only on manual scan | Proposed improvement #8 (HITL escalation queue + Discord ping) |
| **Self-scoring depends on the scorer reading every commit** | Doesn't scale beyond solo dev | This SIGNAL.md + per-section structured signal.json (TBD) addresses |
| **Memory files duplicate content with this SIGNAL.md** | Risk of drift between two truths | Audit roadmap #21 — back-port memory entries into here as canonical, demote memories to indexes |
| **Phase 8 shadcn-pivot ~64% incomplete (10/28 units)** | Generative UI quality bottleneck | Resume at 8s-2 (Radix primitives + cva/clsx/cn helpers) per memory `project_genui_pipeline.md` |

**Active growth plans** (where we're investing):

| Plan | Source | Current state |
|---|---|---|
| **Multi-tenant agency platform** | Memory `project_business_vision.md` | Multi-tenant pipeline closed (10f-6 + 12m + 10n-6); first paying client onboarded (Lilac Insure); second client onboarded (The Ranch Foundation); first prospect Phil (Conrad referral) |
| **Concrete Creations e-commerce** | Memory `project_concrete_ecommerce.md` | Bootstrap unit (`12u-cc-repo-bootstrap`) gated pending opus PLAN session; WA State LLC formed; Stripe planned; separate Vercel deploy planned |
| **Figma plugin priority** | Memory `project_figma_plugin_priority.md` | Top focus post-Sprint-2: auth, status sync, template injection, brand token override; hermes3/Ollama already in use |
| **Workspace HQ architecture (BUILD/GROW/RUN pillars)** | Memory `project_workspace_hq.md` | `/ops` dashboard live; Discord bot + ingestion pipeline in flight (2026-05-02) |
| **Knowledge sources ingestion** | Memory `project_knowledge_sources.md` | YouTube/GPT/bookmarks/Gmail sources identified; contamination rule established (isolate client convos before ingesting) |
| **Ramble processor** | Memory `project_ramble_processor.md` | Discord/stdin classifier concept (Action Items / System Evolutions / Memory) — concept stage 2026-05-02 |
| **Client portal strategy** | Memory `project_client_portal.md` | Live-site-only (no Figma WIP); password-gate per client; lightweight feedback form |
| **Figma client template** | Memory `project_figma_template_structure.md` | Standard 8-page Figma per client; plugin auto-population button (Phase 3) |
| **Security & GRC initiative** | Memory `project_security_grc.md` | Two tracks: (1) real security guardrails in agency NOW, (2) optional GRC career positioning; AI governance niche identified |
| **Job-search portfolio leverage** | Memory `project_job_search_ref.md` | Reno Perry 5 leave-behinds framework; portfolio doubles as interview asset |
| **Call recording pipeline** | Memory `project_recording_pipeline.md` | `scripts/process-call-recording.mjs` exists; needs Google OAuth + GROQ_API_KEY (see `docs/operations/google-oauth-setup.md`) |
| **Phase 8 hardening (Swiss + Addy)** | Memory `reference_phase8_hardening_skills.md` | Distilled rubrics; applied in card slot system, outline rule, INLINE_STRUCTURAL_BORDER gate, performance budget |

---

## Self-scoring systems we've built

*(Rubrics, gates, and metrics that the system uses to evaluate its own outputs.)*

**Codified gates** (binary pass/fail, enforced):

| Gate | Rule | Where enforced |
|---|---|---|
| Manifest validity | `node scripts/validate-manifest.mjs` exits 0 | Pre-deliverable for every agent dispatch + pre-commit |
| Manifest drift | `node scripts/check-manifest-drift.mjs` exits 0 | Pre-deliverable for every agent dispatch + pre-commit |
| Hardcoded colors | No raw hex / rgba in source (must use semantic tokens) | `.husky/pre-commit` hard gate |
| Hardcoded fonts | No raw font-family strings (must use `hds.monoFamily` etc.) | `.husky/pre-commit` hard gate |
| Hardcoded spacing | No raw px values (must use `hds.space.*` tokens; `// spacing-ok:` annotation for exemptions) | `.husky/pre-commit` hard gate |
| Mojibake | No mojibake characters in source | `.husky/pre-commit` hard gate |
| Template source-of-truth | Auto-gen output files cannot be edited directly without also editing the template (or `regen-only` in commit message) | `.husky/pre-commit` hard gate (`scripts/check-template-source-of-truth.mjs`) |
| ESLint warnings | Zero warnings/errors | `pnpm lint --max-warnings=0` (validation gate for `12i-quality-eslint-burndown`) |
| TypeScript types | Zero errors | `pnpm typecheck` (universal precondition) |
| Test coverage | Don't regress below baseline (50.75% stmts / 24.05% branches / 54.38% lines) | `vitest.config.ts` thresholds at measured floor |
| Type stability | `tsc --noEmit -p tests/types/tsconfig.json` exits 0 | `12p-test-type-tests-prop-stability` validation gate |
| Visual regression | Playwright snapshots match baseline ± threshold | `tests/visual.spec.ts` + per-route baselines |
| Focus order | Tab sequence is monotonic subsequence of DOM document order | `tests/focus-flow.spec.ts` (15 tests across 5 routes) |
| Public API surface | Zero "is reachable through but not exported" warnings from api-extractor | `12n-api-internal-vs-public-jsdoc` validation gate |
| Validator proof-of-firing | Every canon rule must trigger non-zero exit on its own contrived fixture | `scripts/__tests__/run-canon-fixtures.mjs` |
| Performance budget | Bundle size hard-fail (size-limit) | `12o-perf-bundle-budget-hard-fail-promote` (commit `4422de22`) |
| Token-paths | Used token paths exist in tokens.json | `scripts/check-token-paths.mjs` (827 files, 532 paths, 281 baselined) |

**Tier classification rubric** (CLAUDE.md):
- **T1**: mechanical, single-pattern scrubs, file moves, simple fixture additions, registry-summary writing
- **T2**: most regular dev work — schema extensions, new scripts, bridge endpoints, component refactors, validator additions
- **T3**: light architectural reasoning — multi-component design choices, API shape decisions
- **T4**: cross-cutting architectural reasoning, ambiguous scope, novel validators with subtle logic; opus-only

**Model selection rubric** (CLAUDE.md + memory `feedback_eco_efficient_subagents.md`):
- **haiku**: T1 mechanical work; not for deletions
- **sonnet**: default for T2/T3; required for any deletions
- **opus**: T4 only — architectural ambiguity, novel reasoning

**Hermes-loop heuristics**:
- Skip units with 2+ prior aborts → escalate to Claude (T4 path)
- Skip units tier=T4 → Claude only
- Stale claim threshold: 4 hours (`scripts/audit-claims.mjs`)

**Effort selection** (CLAUDE.md):
- Default to minimum-effort runs
- Reserve high-effort for opus-class problems

**Pod sizing** (CLAUDE.md):
- 1 unit per agent (token-health directive 2026-05-02)
- Haiku exception: up to 2 micro-units if combined description fits in 5 lines
- Sonnet/opus: strictly 1 unit per agent
- Parallel cap: 6-8 concurrent single-unit pods

**Worktree isolation rule**:
- Use for any pod where two agents could touch the same file
- Skip for strictly-isolated single-agent work
- Caller must merge back (current gap; proposed improvement #1)

**Lean prompt rule** (token-health directive 2026-05-02):
- Don't repeat CLAUDE.md rules
- Unit spec by reference, not copy-paste
- No large file excerpts in prompts
- Empirical ceiling: ~1KB before transport-error risk (this session's finding from `12i-eslint-burndown`)

**Validator coverage scoring** (per `docs/findings/...validator-coverage-audit.md`):
- 11 canon rules with proof-of-firing fixtures
- 6 orphan validators triaged WIRE / DELETE / DOCUMENT (all WIRE)
- 4 fast checks promoted to pre-commit hard gates
- Full inventory of `scripts/check-*.mjs` and their wiring — see audit roadmap #4

**Win-rate metrics** (qualitative this session):
- Sonnet pods: ~75% first-attempt success, ~95% with retries
- Hermes/qwen-14b: very high on T1/T2 mechanical, near-zero on reasoning-heavy
- Opus: not exercised this session

---

## HDS UI Integrity Constitution (codified principles)

> Source: `docs/ai/AI_ORCHESTRATION.md` §1. Eight named architectural rules enforced autonomously during every task. Verbatim. **🌐 INDUSTRY-PATTERN** (Brad Frost / Mark Otto-style design principle codification).

1. **The Sticky Rail Law** — All foundation pages using `DocLayout` MUST have a sticky `navSlot` and `tocSlot`.
2. **The Hero Rule** — Primary page titles and hero text lockups must NEVER be wrapped inside an `<HdsSurface>`. They must sit flush on the background.
3. **The Reading Column Rule** — All `DocLayout` content slots and documentation pages, including Token Explorer and technical foundations, MUST default to `contentMaxWidth="content"`. Overflowing tables or wide datasets must scroll horizontally inside their own container (`overflow-x: auto`) instead of expanding the page width. Only use `maxWidth="max"` for intentional full-bleed tables or galleries.
4. **The Flush Rule** — Never wrap documentation content in an `<HdsSurface>` unless it is a standalone card. Content must sit flush on the background.
5. **The Gap Mandate** — Every `Grid` and `Stack` MUST declare an explicit `gap`. Never rely on an implicit default for production layout spacing.
6. **The Containment Rule** — Every text-holding surface or card MUST have internal padding so text never touches or bleeds over the border.
7. **The Stretch Rule** — Side-by-side containers must utilize `align-items: stretch` to ensure a consistent horizontal "Visual Horizon."
8. **The Motion Guardrail** — All new animations must respect `prefers-reduced-motion` via global CSS and `MotionConfig`.

**Audit gap (FIX-027)**: are any of these 8 rules NOT proven firing on a contrived violation? Per the "no aspirational guardrails" principle, each constitution rule needs a fixture in `scripts/__tests__/fixtures/constitution/` analogous to canon-rule fixtures (`12g-7`). Currently confirmed fixture-tested: `INLINE_STRUCTURAL_BORDER`, `INLINE_THIN_BAR` (per `docs/findings/2026-05-03-validator-coverage.md`). Gap mandate, Containment, Stretch, Hero, Flush, Reading Column, Sticky Rail, Motion — fixture coverage status: **unverified, likely none formal**.

---

## Industry-frame benchmarks

*Each metric/practice we have, mapped to its industry equivalent and standard baseline. Position-vs-baseline noted where measurable.*

> Why this section exists: avoid the echo-chamber failure of treating internal preferences as authoritative. Surface where we're following established practice, where we deviate, and whether the deviation is justified or accidental.

| Domain | Industry framework | Standard baseline | Hirobius position |
|---|---|---|---|
| Engineering velocity | **DORA Four Keys** (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR) | Elite: deploys multiple/day, LT < 1hr, CFR <15%, MTTR <1hr | **Not measured.** Deploy frequency is opaque (we don't ship to prod regularly yet); lead time per unit is in commit history but unaggregated. → FIX-001 |
| Engineering quality | **DORA SPACE framework** (Satisfaction, Performance, Activity, Communication, Efficiency) | Multi-dimensional; team-defined targets | **Activity tracked** (units/day in orchestration.json). Satisfaction = anecdotal Adrian feedback only. → FIX-002 |
| Code quality | **ISO/IEC 25010** software quality model (functional suitability, reliability, performance, usability, security, maintainability, compatibility, portability) | Per-domain rubrics | **Partial.** Maintainability tracked via lint/typecheck; security partial; portability untested (single browser/OS). |
| Test coverage | Vitest/Jest baseline | Industry consensus ~60-80% statements; >70% branches considered healthy | **At baseline floor**: stmts 50.75%, branches 24.05%, lines 54.38%, funcs 50%. **Below industry benchmark, especially branches (24% vs ~70%).** Coverage gate set to "no regression" not "ratchet up." → FIX-003 |
| Test maturity | **Mutation testing** (Stryker, Pitest) | Industry: <60% mutation score = poor; >75% good | **Adopted in spirit via `12g-7-validator-fixtures`** (proof-of-firing for canon rules). Not formal mutation testing — that's a possible upgrade. |
| Technical debt | **SonarQube Technical Debt Ratio** | Industry healthy: <5%; concerning: >10% | **Not measured.** No SQ/CodeClimate. Approximation possible from baselined-violation counts. → FIX-004 |
| Type safety | TypeScript strict + tsc --noEmit; type-test suites (tsd, expect-type) | Strict + zero `any` outside boundaries | **Strict on; type-tests just landed (`12p-test-type-tests-prop-stability`); `// @ts-ignore` count not tracked.** → FIX-005 (count + budget) |
| Lint discipline | ESLint with --max-warnings=0 in pre-commit | Zero-warning baselines + per-rule ratchet | **Achieved 2026-05-03** (`12i-quality-eslint-burndown`). Industry-pattern. |
| Security: OWASP Top 10 coverage | OWASP Top 10 (2021) | Independent assessment + threat model | **Partial.** `gitleaks` in pre-commit covers A07 (Identification & Auth Failures, partial). No SAST/DAST. No threat model documented. → FIX-006 |
| Security: NIST CSF 2.0 | Identify / Protect / Detect / Respond / Recover / Govern | Mapping → controls.md | **In flight.** `13s-10-grc-career-planning` will produce `docs/security/controls.md` mapped to NIST CSF 2.0. Not done yet. |
| Security: SLSA supply chain | SLSA Levels 1-4 | L3+ for production | **Effectively L1.** Reproducible builds untested; no SBOM; no signed releases. → FIX-007 |
| Security: secrets scanning | gitleaks / TruffleHog / GitHub secret scanning | Pre-commit + push-time scan | **Adopted (pre-commit).** Industry-pattern. |
| Accessibility | **WCAG 2.2 AA** (preferably AAA) | Quantitative pass rate per page | **`a11y.yml` workflow exists; conformance level not in SIGNAL.md.** → FIX-008 (publish current a11y conformance per route) |
| Accessibility: motion | `prefers-reduced-motion` support | Industry expectation: respect this preference | **Status unknown — needs audit of motion usage.** → FIX-009 |
| Performance | **Core Web Vitals**: LCP <2.5s, INP <200ms, CLS <0.1 | Pass on >75% of page loads | **`perf.yml` workflow exists; per-route CWV not in SIGNAL.md.** → FIX-010 (publish CWV per route) |
| Performance: bundle size | size-limit / bundlesize per package | Per-package budget; hard fail on regression | **Adopted (`12o-perf-bundle-budget-hard-fail-promote`, commit `4422de22`).** Industry-pattern. |
| Visual regression | Playwright snapshots / Chromatic / Percy | Per-route per-viewport baseline + threshold | **Adopted (`tests/visual.spec.ts` + `tests/visual.spec.ts-snapshots/`).** Industry-pattern. Single browser (Chromium); no Firefox/Safari coverage. → FIX-011 |
| Cross-browser coverage | Multi-browser via Playwright projects (chromium/firefox/webkit) | Test on >2 engines | **Chromium only.** Single-engine risk. → FIX-011 |
| Documentation | **Diataxis** four-quadrant model (Tutorials / How-to / Reference / Explanation) | Balanced coverage | **Heavy on Reference (manifest/component-api), light on Tutorials and Explanation.** No "getting started" tutorial path; few "why we built this way" explainers. → FIX-012 |
| API design | **OpenAPI** (REST) / **JSON Schema** (data) | Machine-readable contracts | **Partial.** `component-api.json` provides component contracts; no formal JSON Schema. api-extractor wired (`12n-api-extractor-wired`) for TS API surface. |
| Multi-tenancy | **AWS SaaS Lens**: silo / pool / bridge | Per-tenant or shared resource isolation per concern | **Bridge pattern** (shared HDS components + per-tenant token overrides + separate Vercel deploys). Industry-pattern. Reasonable for our scale. |
| AI agent architecture | **ReAct, Reflexion, Voyager** patterns; AutoGen/CrewAI conventions | Tool-use loops with self-reflection on aborts | **ReAct adopted** (hermes loop, sonnet pods). **Reflexion partial** ("post-mortem learned rule" log line — aspirational; nothing aggregates them yet). **Voyager-style skill library: not adopted.** → FIX-013 (closed-loop reflection capture) |
| AI agent observability | LangSmith, Helicone, Arize patterns | Per-run trace + token cost + outcome | **Partial.** `telemetry/pod-runs.jsonl` captures sessionId + tokens + duration + notes. No visualization. No cost-per-unit aggregation. → FIX-014 |
| AI agent reliability | Anthropic published evals; AgentBench | Task success rate per benchmark | **Internal win-rate metric** (~75% sonnet first-pass) — not benchmarked against published evals. → FIX-015 |
| Project management | **Kanban** (WIP limits, cycle-time tracking) | WIP <= team-size; cycle time visible | **Implicit Kanban** in orchestration.json (status field acts as column). No formal WIP limit; cycle time not aggregated. → FIX-016 |
| Project management | **OKRs** with measurable KRs | Quarterly with quantitative KRs | **Not adopted formally.** Sprints exist (sprint number on units) but no OKR document. Possibly inappropriate for solo founder; revisit if team grows. |
| User research | **SUS** (System Usability Scale), **NPS**, **HEART framework** | Quantitative + qualitative blend | **Not measured.** User = Adrian; satisfaction = anecdotal. For client-facing portal launches, HEART minimum. → FIX-017 (when client portal ships) |
| Architecture decisions | **ADRs** (Architecture Decision Records, Nygard format) | One markdown per significant decision | **Partial.** `docs/adr/` referenced in commits (e.g. `docs(adr): 12v-token-composite-class-system typography application strategy ADR`). Not enumerated in SIGNAL.md. → audit roadmap item. |
| Postmortems | **Blameless postmortem** template (Google SRE / Etsy) | Per-incident; root-cause + action items | **Effectively this SIGNAL.md** captures lessons but no dedicated incident postmortems. No production incidents yet (so no postmortems yet). |
| Design-system maturity | **Design System Maturity Model** (Diana Mounter / Brad Frost variants) | Levels: ad-hoc → defined → managed → measured → optimized | **Estimated Level 3 ("Managed"):** consistent process, automated checks, multi-tenant proof. Carbon/Polaris are Level 4-5 (measured + optimized). Gap: adoption metrics, contribution model, formal governance docs. |
| Design-system release cadence | Semantic versioning + changesets | Per-package independent versioning | **Aspirational** — `12n-api-monorepo-workspace-split` would enable this; currently parked. |
| Design tokens format | **W3C DTCG** (`$type`, `$value`, `$description`) | DTCG-compliant JSON | **Adopted.** `hirobius.tokens.json` is DTCG. Industry-pattern. |
| Continuous Delivery | **Trunk-based development** + feature flags | Mainline-first; flags for incomplete work | **Quasi-trunk-based** on `fix/ui-pipeline` (long-lived branch; no formal trunk yet). Hard Rule prohibits push, so CD is blocked. |
| Observability stack | DataDog / Honeycomb / OpenTelemetry / Sentry | Traces + metrics + errors | **None.** No Sentry, no DataDog, no OTel. Local logs only. Acceptable pre-launch; required pre-prod. → FIX-018 |
| Knowledge management | **Diataxis** + **Docs-as-Code** (markdown in repo) | Single source of truth in version control | **Adopted.** All planning in repo per memory `feedback_knowledge_management.md`. Industry-pattern aligned. |

---

## ⚠ Corrections — false-gap claims I made before reading

> **Methodological failure**: I claimed several "industry gaps" / "missing infrastructure" without first reading the relevant docs. Walked back below. Lesson for the next session: **read first, claim second**.
>
> Confirmed by audit pass 2026-05-03: the repo is at HDS Maturity ~45% composite (per `docs/architecture/scorecard.md`) — significantly more mature than my early-session framing implied.

| Original claim (wrong) | Reality | Correction |
|---|---|---|
| "No formal ADR enumeration in SIGNAL.md" + "Decisions exist (`docs/adr/`) but not indexed" | TWO ADR taxonomies exist: `docs/adr/001-008` (legacy) AND `docs/architecture/ADR-0001-0004` (current per `docs/architecture/README.md`). Plus thematic decision docs: `docs/architecture/font-licensing.md`, `docs/architecture/tenant-token-overlay-format.md`. | **Real gap is reconciliation between two ADR systems**, not absence. Demote FIX from "enumerate ADRs" to "consolidate two ADR taxonomies (12n-api-rfc-process-formalization unit covers this)". |
| "No quantitative user-satisfaction measurement" | True for Adrian-as-user. But not the gap I implied — `docs/security/INITIATIVE.md`, `docs/operations/security-audit-2026-05-02.md` exist and may inform some metrics. | Keep as gap when client portal ships, but acknowledge security-audit infrastructure exists. |
| "No Diataxis-balanced docs (heavy on reference, light on tutorials/explanation)" | Repo has `docs/process/`, `docs/operations/` (8 files), `docs/workflows/`, `docs/vision/`, `docs/knowledge/` (BUILD/GROW/RUN structured), `docs/migrations/` — extensive non-reference content. Plus `docs/CASE_STUDY_JOURNAL.md` (21KB, real auto-journaling per Task 30). | **My Diataxis claim was unverified**. Need to actually map current docs to Diataxis quadrants before declaring imbalance. Demote FIX-012. |
| "No incident-response runbook tested" | `docs/security/incident-response.md` exists at 10KB. Untested ≠ absent. | Re-frame: "Incident-response runbook exists; testedness unverified. Need a tabletop exercise to validate." |
| "No vendor risk re-assessment cadence" | `docs/security/vendor-risk.md` exists at 8KB. May be one-time vs living. | Re-frame: "Vendor-risk doc exists; re-assessment cadence unverified." |
| "No SBOM / supply chain attestation" | Confirmed truly missing — not in repo, not in workflows. Strengths doc doesn't list it as covered. | Keep FIX-007 (truly missing). |
| "Win-rate not benchmarked vs published evals" | Confirmed truly missing. Strengths doc doesn't claim eval benchmarking. | Keep FIX-015. |
| "No observability stack (Sentry/DataDog/OTel)" | Strengths doc lists "Live RUM monitoring → NOT YET — adding". Confirmed missing. | Keep FIX-018. |
| "No formal release cadence" | `docs/operations/release-tagging.md` exists. Need to read to confirm. | Re-frame: "Release-tagging doc exists; semver+changesets adoption status unverified." |
| "Missing `prefers-reduced-motion` audit" | Strengths doc lists `12r-a11y-prefers-reduced-motion-validator` as the unit covering this. Constitution rule 8 (The Motion Guardrail) requires it. `MotionConfig` referenced in AI_ORCHESTRATION.md. | Re-frame: covered by orchestration unit; status check vs unit. Demote FIX-009. |
| "Single-browser test coverage (Chromium only)" | Strengths doc lists `12p-test-browser-matrix-firefox-safari` as the unit covering this. | Re-frame: covered by orchestration unit; status check vs unit. Keep FIX-011 but link to existing unit. |
| "No mutation testing" | Strengths doc lists `12p-test-mutation-testing-stryker` as the unit covering this. | Demote — covered by orchestration unit. Implementation is the gap. |
| "Decisions log captures Hirobius decisions; no proper external decision ledger" | `docs/logs/AI_DECISION_LEDGER.md` exists with formal Root Cause/Resolution discipline since 2026-04-24. Includes a documented feature flag lifecycle policy (p7-3, 2026-05-01) with 3-stage Introduce → Flip → Delete process gated on telemetry. **Mature DevOps practice.** | **The decision ledger I was building duplicates this.** SIGNAL.md should reference AI_DECISION_LEDGER.md as the official source and not duplicate. |
| "No `inspirations` capture" | `docs/vision/inspirations.json` exists with placeholder content (`{"items":[{"title":"placeholder",...}]}`) — structure exists, content empty. | Re-frame: data structure exists, never populated. Worth back-filling from SIGNAL.md inspirations section. |

**The honest meta-finding**: I assumed gaps where I should have audited first. The system is at ~45% composite maturity per Adrian's own scorecard. SIGNAL.md should ANCHOR on scorecard.md / strengths-and-differentiators.md / AI_DECISION_LEDGER.md as authoritative — and CONTRIBUTE the cross-cutting analysis (drift debt, debt close, industry-frame benchmarks, FIX registry) those docs don't cover.

---

## Existing infrastructure docs — authoritative anchors

> **Use this section to find the source of truth before building anything.** SIGNAL.md is meta-analysis; these are the operational sources.

| Doc | What it is | When to read |
|---|---|---|
| `docs/architecture/scorecard.md` | **HDS Maturity Scorecard** — composite percentage, per-surface grades (Token system, Component library, Doc site, LLM pipeline, Figma plugin, Validator suite, Mobius scene, HDSLayout shell, Agent infrastructure, CI/deploy, Multi-tenant, Pilot client, Public API surface), weighted; "to X%" target deltas | Status questions ("how mature are we?"); roadmap planning |
| `docs/architecture/strengths-and-differentiators.md` | **14 strengths** with preservation rules + programmatic checks; "Things we DON'T do that peers DO" table mapping every gap to an orchestration unit | "What makes us unusual?"; preservation discipline; gap → unit lookup |
| `docs/logs/AI_DECISION_LEDGER.md` | **Decision ledger** — Root Cause/Resolution per self-heal since 2026-04-24; feature flag lifecycle policy | "Why did we do X?"; lessons from past fixes |
| `docs/CASE_STUDY_JOURNAL.md` | **Auto-journaling** of layout fixes per Task 30 (AI_ORCHESTRATION.md) — timestamped entries with page/route, layout drift observed, reconciliation applied | Visual regression history; case study source material |
| `docs/SYSTEMS-LOG.md` | **Append-only governance ledger** (304KB / 5063 lines) since 2026-04-02; per-change Architectural Snapshot + Intent & Execution + Health Snapshot (Direct Violations metric trend) | Long-form governance history; quantitative trend analysis |
| `docs/SYSTEM_ATLAS.md` | System map (99KB) | High-level system understanding |
| `docs/SYSTEM_CONTRACT.md` | Contract between system parts (5KB) | Interface boundaries |
| `docs/architecture/font-licensing.md` | Multi-tenant font licensing decision per `12m-mt-typography-licensing` | Tenant onboarding; legal questions |
| `docs/architecture/tenant-token-overlay-format.md` | Per-tenant overlay format spec | Multi-tenant work |
| `docs/operations/tenant-onboarding.md` | Tenant onboarding playbook | New client onboarding |
| `docs/operations/security-audit-2026-05-02.md` | Latest security audit | Security review |
| `docs/operations/required-checks.md` | Required-check policy | CI / merge gate config |
| `docs/operations/hooks-policy.md` | Husky / Git hooks policy | Pre-commit/pre-push changes |
| `docs/operations/release-tagging.md` | Release tagging convention | Release management |
| `docs/security/incident-response.md` | Incident response runbook | Production incident |
| `docs/security/vendor-risk.md` | Vendor risk assessment | Adding new dependencies / services |
| `docs/security/INITIATIVE.md` | Security initiative top-level | Security roadmap |
| `docs/vision/ROADMAP.md` + `docs/vision/roadmap.json` | Vision roadmap | Long-term direction |
| `docs/vision/inspirations.json` | **Inspirations data** — currently placeholder; back-fill from SIGNAL.md inspirations section | Inspiration tracking |
| `docs/vision/agents.json`, `prompts.json`, `references.json` | Vision-side agent config + prompt library + references | Agent configuration |
| `docs/visual-catalog/*.png` | Reference screenshots of foundation pages | Visual baseline reference |
| `docs/audits/exceptions-audit.md` | Formal exceptions audit | Exception enumeration |
| `docs/api/api-baseline.json` | API surface baseline | API stability tracking |
| `docs/operations/required-checks.md` | **Required-check promotion policy** — per-workflow inventory, promotion criteria (3 green + no blockers + Adrian approval), GitHub UI walkthrough, promotion roadmap | CI / merge gate config questions |
| `docs/operations/tenant-onboarding.md` | **Tenant onboarding runbook** — `pnpm scaffold:tenant` CLI, 30-min target contract→Vercel preview, 3-tier classification (Brand presence / E-commerce / Product) | New client onboarding |
| `docs/operations/release-tagging.md` | **Release tagging protocol** — semver + pre-merge rescue tags, tag message requirements, branch-cleanup discipline | Release management |
| `docs/operations/hooks-policy.md` | **Git hooks policy** — no auto-amend, no auto-stage, no auto-commit-noise; cherry-pick/rebase safety | Pre-commit/pre-push changes |
| `docs/operations/squash-merge-protocol.md` | Squash-merge protocol | Branch merging |
| `docs/operations/security-audit-2026-05-02.md` | **Most recent security audit**: pnpm audit clean (0 high), .gitignore PASS, bridge credentials PASS, external process spawning PASS, 1 LOW finding on workflow permissions | Security review |
| `docs/operations/google-oauth-setup.md` | Google OAuth setup (referenced in memory) | Call recording pipeline setup |
| `docs/operations/fresh-session-batches.md` | Fresh session batches | Session-start onboarding |
| `src/app/data/health-history.json` | **Quantitative health trend**: 158 timestamped snapshots since 2026-04-02; trend 701 → 0 violations; score + grade per snapshot | Trend analysis; case study charts |
| `clients/<slug>/` | **Per-tenant structured data** — meta.json, goals.json, retainer.json, stack.json, tasks.json, checklist.json, notes.md, brand-audit.json | Client-specific work |
| `docs/knowledge/{build,grow,run}/` | **BUILD / GROW / RUN pillar knowledge base** per memory `project_workspace_hq.md`. Client work isolated in `build/clients/<name>/` per contamination rule | Knowledge ingestion + agency operating model |
| `docs/security/INITIATIVE.md` | Security initiative scratchpad (issues are source of truth: GitHub Issues #12-21) | Security roadmap context |
| `docs/architecture/scorecard.md` | **HDS Maturity Scorecard** — 13 surfaces graded, weighted composite (45%), per-surface "to X% via" deltas | **Status anchoring**; compose with this section's Path to Maturity |
| `docs/architecture/strengths-and-differentiators.md` | **14 strengths with preservation rules** + "Things we DON'T do that peers DO" table mapping every gap to an orchestration unit | Anti-erosion discipline; gap → unit lookup; what to feature in case study |
| `docs/architecture/font-licensing.md` | Multi-tenant font licensing per `12m-mt-typography-licensing` (Clash Display ITF FFL, etc.) | Tenant onboarding; legal review |
| `docs/architecture/tenant-token-overlay-format.md` | Per-tenant overlay format spec | Multi-tenant tooling work |
| `docs/legal/tenant-font-licensing.md` | Legal — tenant font licensing | Legal review |
| `docs/migrations/react-19.md` | React 19 migration plan | Framework migration |

---

## Existing automation inventories (reference, not duplicate)

> **Important**: the automation-truth-table I was originally going to build is mostly already done. Defer to the source-of-truth docs below; SIGNAL.md links rather than duplicates.

| Inventory doc | What it covers | Last updated | Notes |
|---|---|---|---|
| `docs/ai/checks-hooks-triggers-inventory.md` | `.husky/pre-commit`, `.husky/pre-push`, `pnpm check:*` alias map (`check:fast` 19 scripts, `check:full` 33, `check:release` superset), pretest scripts (10), CI workflows table for all 12 `.github/workflows/*.yml`, orphan scripts census, dead-path findings | 2026-05-02 | **Authoritative for: pre-commit/pre-push gates, check tier hierarchy, CI workflow matrix.** SIGNAL.md should reference this rather than copy. |
| `docs/findings/2026-05-03-validator-coverage.md` | All 57 `scripts/check-*.mjs` + `scripts/validate-*.mjs`. 8 pre-commit (WIRED) + 43 NPM-only + 6 ORPHAN. Findings: pre-commit covers only 14% of validators; per-rule bypass needed; no proof-of-firing tests | 2026-05-03 | **Authoritative for: validator-by-validator inventory.** Recommended units 12g-5, 12g-6, 12g-7, 12g-8 ALL CLOSED in this session within hours of recommendation — **find-to-fix velocity is excellent**. |
| `docs/ai/AI_ORCHESTRATION.md` | Phase history (Phases 1-13), HDS UI Integrity Constitution (8 named rules), per-task completion checkboxes, recently-completed sprint summaries, generative UI pipeline architecture (Phases 1-3.5 of Figma plugin work), Phase A1-A5 Master Fan-Out (80 variants × 13 components) | 2026-05-01 | **Authoritative for: phase narrative + Constitution.** Some `[ ]` open-task drift vs orchestration.json; SIGNAL.md drift-debt section flags. |
| `docs/ai/AGENT_GUIDELINES.md` | Agent dispatch rules, claim protocol, abort handling, model selection rubric | 2026-05-03 | **Authoritative for: agent-dispatch rules.** SIGNAL.md self-scoring section references. |
| `docs/ai/OPERATOR_BRIEF.md` | Autonomous-continuation protocol, current sprint status | 2026-05-02 | **Authoritative for: "what's the next eligible unit"-style operational queries.** |
| `docs/ai/MULTI_AGENT_OVERNIGHT.md` | Multi-agent overnight burndown protocol | 2026-05-01 | **Authoritative for: parallel pod patterns.** |
| `docs/ai/PROMPT_TEMPLATES.md` | Prompt templates for common dispatch patterns | 2026-05-02 | **Authoritative for: prompt scaffolds.** Possibly stale — confirm during prompt-evolution-loop work (proposed improvement #5). |
| `docs/ai/TIER_AUDIT.md` | Tier classification audit | 2026-05-01 | **Authoritative for: T1-T4 tier definitions.** |
| `docs/SYSTEMS-LOG.md` | Append-only governance ledger (5063 lines) | 2026-05-XX (need to read) | **Authoritative for: governance changes over time.** Sample-read pending in audit pass. |

**SIGNAL.md's role in this constellation**: synthesis + meta-analysis + cross-cutting categories that don't fit any single inventory doc (drift debt, debt close, industry benchmarks, near-miss log, business signal, personal sustainability, future-fix registry).

---

## Drift debt (stated vs actual gap)

> Different from technical debt (which is shortcuts). This is *gap between what we said we'd do and what's actually happening.* Pure drift is a maintenance failure — the rule existed but the system drifted away from it.

| Drift | Stated rule / intent | Actual behavior | Severity |
|---|---|---|---|
| **Pre-commit gates often bypassed** | `.husky/pre-commit` has 15+ hard gates intended to enforce quality | Agents standardly use `--no-verify` because pre-commit checks the whole repo and may fail on unrelated work | **High** — gates lose value at the agent boundary |
| **Hermes loop ignores ratification flags** | agentNotes can flag "DO NOT execute without explicit Adrian ratification" | Hermes happily picks gated units (`12n-api-monorepo-workspace-split` claimed 5×) | **High** — defeats the gate's purpose |
| **Worktree work fails to merge back** | Implicit: worktree isolation should produce work that lands on `fix/ui-pipeline` | 5+ deliverables this session stranded in `worktree-agent-XXX` branches; manual cherry-pick required | **High** — silent work loss without manual recovery |
| **Cron supervisor silently failed overnight** | Designed to clean stale claims + restart hermes every 30 min | WSL2 host sleep starved cron; supervisor fired exactly once at the cutoff and self-disabled | **High** (when it matters; hasn't bitten production) |
| **"Self-driving" claim** | OPERATOR_BRIEF says system "self-drives — pick the next eligible unit and execute" | Real driving requires Adrian ~hourly: rejections, ratification calls, retries, restarts | **Medium** — works partially; full self-drive requires improvements #1-#8 |
| **Hermes "post-mortem learned rule"** | Log line implies the system is learning from failures | Nothing aggregates these rules anywhere persistent; no agent reads them | **Medium** — performative but harmless |
| **No new dependencies rule** | CLAUDE.md: "No new deps" except documented exceptions | Added `@vitest/coverage-v8`, `eslint-plugin-import-x` this session (both authorized exceptions, but the rule's clarity is eroding) | **Low** — exceptions ratified; rule still functional |
| **281 baselined token-path violations** | Implicit: all token paths should resolve | 281 are accepted as "burn down via 12g"; not yet burnt down | **Medium** — quantified, in progress |
| **`spacing-ok:` and `hds-bypass` exemptions** | Implicit: no raw spacing / structural borders | Counts of bypass markers exist (need audit) | **Low** — exemption mechanism is honest, but census needed |
| **Stale claims accumulate** | Claims are supposed to revert after 4h via `audit-claims.mjs` | This session: 2 stale claims survived 12+ hours before manual cleanup; audit-claims didn't appear to fire | **Medium** — likely audit-claims isn't on cron; needs verification |
| **Pre-commit pretend-blocking** | Pre-commit is presented as the quality gate | Reality: validationCmd per unit is the gate; pre-commit is for human commits | **Low** — accept and document, don't pretend otherwise |
| **`telemetry/pod-runs.jsonl` schema** | Implicit: structured telemetry for analysis | jq parse errors observed; schema appears to have drifted from any documented spec | **Medium** — fixable with audit (FIX-019) |
| **AI_ORCHESTRATION.md status header says "STABLE"** | "Bi-directional token sync (Figma <-> Manifest) is live; AI Documentation auto-generation is live" | Need to verify both still actually fire and aren't drifted | **Unknown** — verify, don't assume |
| **`watch:metrics` and `watch:guardrails` nodemon scripts** | Defined in package.json | Are they ever started? Do they actually fire on file change? | **Unknown** — likely manual-invoke only |
| **Multiple memory files duplicate ground truth** | Each memory file is supposed to be canonical for its concern | Some content (e.g. dispatch rules) lives in CLAUDE.md AND memory AND now SIGNAL.md — risk of drift between three copies | **Medium** — establish hierarchy: CLAUDE.md = active rule, memory = personal preference index, SIGNAL.md = canonical history & analysis |
| **`hds-migration-audit.yml` DEAD PATH** | CI workflow exists and triggers on `src/app/**` PRs | Calls `scripts/audit-component-source.js` which **does not exist** (verified absent). Workflow always fails when triggered. | **High** — silently failing CI step; flagged in `checks-hooks-triggers-inventory.md` 2026-05-02; not yet fixed. → FIX-022 |
| **`checks-hooks-triggers-inventory.md` says `pnpm lint --max-warnings=210`** | Pre-commit lint warning ceiling | Actual `.husky/pre-commit` is now `pnpm lint --max-warnings=0` (changed 2026-05-03 by `12i-quality-eslint-burndown`) | **Low** — doc-vs-code drift; update inventory doc → FIX-023 |
| **AI_ORCHESTRATION.md Task 30: Hirobius Case Study Refactor & Auto-Journaling** | Implement "Automated Case Study" engine: AI appends timestamped dev note to `docs/CASE_STUDY_JOURNAL.md` outlining every major layout refactor or self-heal | `docs/CASE_STUDY_JOURNAL.md` doesn't exist. SIGNAL.md may now be the realization (or the inspiration for it) | **Medium** — verify SIGNAL.md adequately substitutes; if not, add CASE_STUDY_JOURNAL.md as a derived doc → FIX-025 |
| **AI_ORCHESTRATION.md Phase 10 Task 25: "Run pnpm check:release...Confirm Vercel previews pass"** | Final validation step | Conflicts with Hard Rule "NEVER run pnpm check:release" in CLAUDE.md AND with no-deployments memory `feedback_no_deployments.md` | **Medium** — orphan task; either close (Vercel deploys are not the path) or update Hard Rule. Decision needed. |
| **AI_ORCHESTRATION.md Phase 12 Tasks 37/38/39 marked `[ ]`** | Strict Type & Polymorphism (37), Flush Code Review (38), AI-Optimized Context Manifest (39) | These overlap with backlog-4-strict-type-polymorphism (PARKED), backlog-5-flush-code-review (PARKED), backlog-6-ai-optimized-context-jsdoc (PARKED). Drift between AI_ORCHESTRATION's open-task list and orchestration.json's parked status | **Low** — three parallel sources of truth disagree. Reconcile by accepting orchestration.json as canonical; mark AI_ORCHESTRATION tasks as "see orchestration.json/parked". |
| **AI_ORCHESTRATION.md uses `[cite_start]` markers** | Inline citations from a planning doc | Citations don't render anywhere; appear as broken syntax in markdown | **Low** — cosmetic; either strip or convert to functional links → FIX-026 |
| **`a11y.yml` / `collision.yml` / `visual.yml` / `responsive.yml` workflows have `continue-on-error: true`** | Should fail PRs when broken | Marked "NOT YET — needs baseline run" — soft gates only | **Medium** — FOUR workflows that look like enforcement but aren't. Promote after baselines stabilize. → FIX-024 |
| **MEMORY.md index lists 22 memories, actual count is 31** | Index should match directory contents | 9 memory files added since last index update (visible in conversation history this session: outline-rule, card-slot-system, no-aspirational-guardrails) | **Low** — index drift; auto-regenerate with `scripts/update-memory-index.mjs` (doesn't exist yet → could be FIX or could be a one-line manual update) |
| **Phase numbering disagreement** | AI_ORCHESTRATION.md uses "Phase 10", "Phase 11", "Phase 12", "Phase 13"; orchestration.json uses `phase` IDs like `12-hds-refinement`, `10-O-ops-hygiene`, `8-S-shadcn` | Two different phase taxonomies overlay the same work | **Low** — historical drift; not fixing, just noting. Future agents should default to orchestration.json `phase` IDs as the active taxonomy. |

---

## Debt close (debt actively eliminated)

> Velocity at which we're paying down debt. Signal-rich because it shows what the system can clear under pressure.

| Debt | What was the debt | How it closed | Closed when |
|---|---|---|---|
| ESLint warning backlog | 521 problems (378 errors, 143 warnings) baseline 2026-05-01 | `12i-quality-eslint-burndown` over multiple waves; final landed via 1-line `Grid` swap | 2026-05-03 (`12e3dabe`) |
| ESLint plugin on broken-on-ESLint-10 dep | `eslint-plugin-import` called removed `getTokenOrCommentBefore` API; lint was crashing | `12i-quality-eslint-import-x-migration` swapped to `eslint-plugin-import-x@4.16.2` | 2026-05-03 |
| "Do validators actually catch?" debt | 11 canon rules existed; no proof they fired | `12g-7-validator-fixtures` — 11 fixtures + runner asserting non-zero exit | 2026-05-03 |
| Aspirational lint gates (4 soft) | `check-hardcoded-fonts` / `check-hardcoded-spacing` were soft (`\|\| true`) | `12g-8-promote-fast-checks-to-precommit` — fixed all violations + promoted to hard | 2026-05-03 |
| Snapshot-baseline-refresh workaround | "Just refresh the baseline" accepted runtime/snapshot mismatch as canon | `12v-token-tokens-drift-permanent-fix` — root-caused `Math.random()` in LegacyTokenExplorerPanel; deterministic `pool[0]` default | 2026-05-03 |
| Nondeterministic VRT failures | Late-blank-render flake | `10o-11-vrt-stability-late-blank-render` — four-pass stabilization | 2026-05-03 (`8bbc88be`) |
| Ambiguous public API surface | Every export from `src/index.ts` was potentially public | `12n-api-internal-vs-public-jsdoc` — 43 @public, 12 @internal, api-extractor wired | 2026-05-03 |
| No coverage signal | `pnpm test` didn't report coverage; we didn't know what % was tested | `12p-test-coverage-reporting-wired` — vitest v8 + thresholds + baseline | 2026-05-03 |
| 6 orphan validator scripts | Existed but unwired | `12g-5-validator-wiring-audit` — all 6 → WIRE | 2026-05-03 |
| Hardcoded sidebar JSX | 35 lines of nav JSX hardcoded | `backlog-19-data-driven-sidebar-nav` — registry-driven via `hds-nav-data.ts` | 2026-05-03 |
| `check-mojibake` perf bug | 12s scan time because it scanned peer worktrees | `12g-8` added `.claude` to SKIP_DIRS — now 0.1s | 2026-05-03 |
| Composite GLSL bloat | GLSL passes inline in mobius file | `12i-bloat-mobius-glsl-extract` pulled into named module constants | 2026-05-02 |
| `12d-dashboard-token-cleanup` | Dead vars + flat typography | Refactored with hierarchy + dead-var sweep | 2026-05-03 |
| No CI workflow visible at root level | I'd believed there was no CI; turns out there was substantial CI but no top-level `ci.yml` | `10o-11-github-actions-ci` added the consolidated `ci.yml` | 2026-05-02 |
| Static token cascade diagram | Diagram was non-interactive; no hover affordance | `10n-5-token-relationship-diagram-interactive` — full hover cascade highlight | 2026-05-03 |
| Multi-tenant claim untested | Theory of multi-tenant token override unproven | `10n-6-multi-brand-theming-demo` + `10f-6-figma-library-from-tokens` + `12m-mt-figma-master-per-tenant` — full pipeline closed | 2026-05-03 |
| Stranded worktree deliverables | 5+ this session in worktree branches | Manual cherry-pick or file-copy + status flip | 2026-05-03 (worked around, not closed; underlying issue still open per FIX-020) |

**Debt-close velocity 2026-05-02 → 2026-05-03**: 16 distinct debt classes closed in ~36 hours. *Industry context*: this is **unusually high** because the system is in active hardening sprint mode + has automated multi-agent dispatch. Sustainable rate would likely be 2-4 debt classes/week in steady state.

---

## Current gaps based on industry standards

> Negative space against the [Industry-frame benchmarks](#industry-frame-benchmarks). What standard practices we don't yet have. Each entry is implicitly a FIX-NNN candidate.

| Gap | Standard | Why it matters | Severity |
|---|---|---|---|
| **No DORA Four Keys measurement** | DORA | Industry de-facto for engineering effectiveness | High |
| **Branch coverage at 24%** vs ~70% industry | Vitest/Jest standards | Untested branches = silent regression risk | High |
| **No mutation testing** | Stryker / Pitest | Coverage % can be deceptive; mutation score reveals if tests actually catch bugs | Medium (we have proof-of-firing for canon rules; mutation testing extends this to all tests) |
| **No SAST/DAST** | OWASP, NIST | Pre-launch security validation | Medium (acceptable now; required pre-launch of any client portal) |
| **No threat model documented** | OWASP STRIDE / PASTA | Required for client-facing services | Medium |
| **No SBOM / supply chain attestation** | SLSA, NIST SSDF | Required for enterprise clients; reduces supply-chain risk | Medium |
| **No formal a11y conformance level published** | WCAG 2.2 AA | Even if a11y.yml passes, we haven't said "we conform to WCAG 2.2 AA at level X" | Medium |
| **No `prefers-reduced-motion` audit** | WCAG 2.3.3 | Vestibular-disorder accessibility | Medium |
| **No Core Web Vitals per-route publication** | Google PageSpeed / Lighthouse | SEO + UX baseline | Medium |
| **Single-browser test coverage (Chromium only)** | Cross-engine via Playwright | Real users span engines | Medium |
| **No Diataxis-balanced docs** (heavy on reference, light on tutorials/explanation) | Diataxis 4-quadrant | Adopters can't onboard without tutorials | Medium |
| **No formal API JSON Schema** | OpenAPI / JSON Schema | Machine-readable contracts for non-TS consumers | Low (component-api.json approximates) |
| **No observability stack** (Sentry/DataDog/OTel) | OpenTelemetry, RUM | Required before any production tenant | Medium-High pre-launch |
| **No formal ADR enumeration in SIGNAL.md** | Nygard ADR convention | Decisions exist (`docs/adr/`) but not indexed; future readers can't navigate | Low — fixable in audit pass |
| **No quantitative user-satisfaction measurement** | SUS / NPS / HEART | We optimize for Adrian's anecdotal feedback only | Low (until clients use the system); High when client portal ships |
| **No formal release cadence** (semantic versioning, changelogs per package) | Changesets / semver | Adopters can't depend on stable surface | Medium (blocked by 12n monorepo split) |
| **No public adoption metrics** (downloads, stars, forks if open-sourced) | npm, GitHub | If the system is meant to be a portfolio + adoptable design system, adoption is the metric | Low (depends on open-source intent) |
| **No design-system contribution model** | Carbon, Polaris contribution guides | If multi-tenant means multiple contributors, we need a model | Low (premature for solo) |
| **No formal governance docs** | OWASP DSOMM, ISO 27001 | Required for enterprise sales | Low (premature) |
| **No incident-response runbook tested** | Google SRE postmortem template + DR drills | We have `docs/security/incident-response.md` (10KB) but is it tested? | Medium |
| **No vendor risk re-assessment cadence** | NIST CSF Govern / SOC 2 | We have `docs/security/vendor-risk.md` (8KB) but is it living or one-time? | Low |
| **No documented data retention policy** | GDPR / CCPA basics | Required when handling client data | Medium pre-launch |

---

## Transferability tagging conventions

Every entry in SIGNAL.md should ideally carry one of these tags. Will be back-populated during audit pass and going forward.

- **🌐 INDUSTRY-PATTERN**: standard practice, well-executed. No novelty claim. Helpful as a reference point for adopters.
- **🔧 SITUATIONAL-ADAPTATION**: industry pattern + Hirobius-specific tweak. *Note the tweak.* Useful for adopters with similar constraints.
- **✨ POSSIBLY-NOVEL**: not seen elsewhere; verify before claiming novelty in case study. Most "novel" claims are actually rediscoveries — be honest.
- **🏠 HIROBIUS-SPECIFIC**: only relevant to this build. Not for adopter consumption. Internal context only.
- **🚧 MID-EVOLUTION**: emerging pattern; too early to classify; revisit later.

**Worked example** (would apply to existing entries during back-population):
- "1 unit per agent" rule → 🔧 **SITUATIONAL-ADAPTATION** (industry "small batch" + multi-agent context)
- Hermes loop with abort cap → 🌐 **INDUSTRY-PATTERN** (ReAct + retry budget; AutoGen/CrewAI style)
- "No aspirational guardrails" → 🌐 **INDUSTRY-PATTERN** (Definition of Done with extra emphasis)
- SIGNAL.md itself → 🔧 **SITUATIONAL-ADAPTATION** (ADR + Postmortem + Lessons Learned mashup with multi-tenant agency frame)
- `12g-7-validator-fixtures` proof-of-firing → 🌐 **INDUSTRY-PATTERN** (essentially mutation-testing-lite)
- Multi-tenant via token override + bridge architecture → 🌐 **INDUSTRY-PATTERN** (AWS SaaS Lens bridge pattern)
- Worktree-stranding recovery via cherry-pick → 🏠 **HIROBIUS-SPECIFIC** (Claude Code Agent tool quirk; not transferable)
- WSL-aware supervisor design → 🔧 **SITUATIONAL-ADAPTATION** (cron + WSL host-sleep is a real industry constraint, not unique to us, but our handling is bespoke)

---

## BUILD / GROW / RUN — agency operating framework

> Adrian's operational frame, codified in memory `project_workspace_hq.md` (2026-05-02). HDS lives in **RUN**; client deliverables live in **BUILD**; agency pipeline lives in **GROW**. SIGNAL.md is mostly a RUN artifact — but the maturity question is BUILD-first (revenue from clients = real proof).

| Pillar | What it is | Where it lives | Active threads |
|---|---|---|---|
| **BUILD** | What Adrian makes | `docs/knowledge/build/`, `clients/`, `src/` (HDS itself when used as production layer) | HDS, client deliverables (Lilac Insure automation, Ranch Foundation site, Phil prospect), Concrete Creations product |
| **GROW** | What makes the business bigger | `docs/knowledge/grow/`, `docs/process/` (Hirobius case study artifacts), `docs/vision/`, possibly LinkedIn / YouTube channels | Agency pipeline, clients pipeline (3 tracked), portfolio, brand, optional GRC career positioning (per memory `project_security_grc.md` Track 2) |
| **RUN** | What keeps it working | `docs/knowledge/run/`, `docs/ai/`, `docs/operations/`, `docs/security/`, this very SIGNAL.md, the autonomous build pipeline | AI infrastructure (hermes/kimi/swarm), tools (155 scripts), research ingestion (YouTube/Gmail/GPT exports — flight per memory `project_knowledge_sources.md`), automation (this repo), Discord bot + ramble processor (concept) |

**Knowledge base contamination rule** (memory `project_knowledge_sources.md`): client work must be **isolated** in separate namespace — never load client context alongside HDS context. Past GPT/Gemini convos mixed the two and tainted LLM memories.

**Why this matters for SIGNAL.md framing**: Maturity of HDS-as-RUN-asset is the easy half. The hard half is the BUILD pillar — actually shipping paid client work. That's why `12u-cc-repo-bootstrap` (Concrete Creations) and `12g-X-tier-pricing-implementation` matter more than another lint validator. *Run-pillar polish without build-pillar revenue is solo-functional, not agency-ready.*

---

## Inspirations — memory-derived enrichment

> Memory files contain richer inspiration / motivation context than the inspirations.json placeholder. Listed here for back-port and to inform the Hirobius case study narrative.

| Inspiration / influence | Source | What we took / how it shapes the build |
|---|---|---|
| **Reno Perry — "What Hiring Managers Actually Remember After Your Interview"** (5 leave-behinds: 30/60/90 plan, strategic initiative one-pager, stakeholder alignment map, process/framework diagram, executive summary deck) | memory `project_job_search_ref.md` | Portfolio doubles as interview asset. HDS itself is the "process/framework diagram" leave-behind. Case study + portfolio polish serves both agency and job-search paths. |
| **Tolulope Michael — "How to Make Yourself Untouchable While AI Takes Every Other Job"** | memory `project_security_grc.md` | GRC + AI governance is the high-growth gap. Adrian's autonomous-AI-pipeline governance is firsthand, hard-to-replicate experience. Sec+ → CRISC cert path. |
| **Brad Frost / Diana Mounter — Design System Maturity Models** | memory `reference_phase8_hardening_skills.md` | Composite scoring per surface. Adopted in `docs/architecture/scorecard.md` (45% composite, weighted 6 surfaces). |
| **Swiss Design (Müller-Brockmann tradition)** | memory `reference_phase8_hardening_skills.md`, `feedback_outline_rule.md`, `feedback_ai_aesthetic_antipatterns.md` | Grid system; rectilinear structural elements; outline-by-interactivity-only; whitespace as structure; opacity (not hue) for hierarchy; flat typography weight (font-light for display, font-medium for emphasis, never font-bold). Codified in CLAUDE.md + INLINE_STRUCTURAL_BORDER lint gate. |
| **Addy Osmani performance frameworks** | memory `reference_phase8_hardening_skills.md` | Performance budget hard-fail; per-component bundle size (size-limit). Adopted in `12o-perf-bundle-budget-hard-fail-promote`. |
| **shadcn / Radix copy-the-code distribution** | memory `project_genui_pipeline.md`, ADR-001 | Adopted as distribution model. cva/clsx/cn helpers. Phase 8-S-shadcn 8/8 done. |
| **Polaris / Carbon / Material 3 / Atlassian / Spectrum outline rules** | memory `feedback_outline_rule.md` | Codified the "outlines = interactivity affordance" rule (industry pattern). |
| **Polaris per-component changelog metadata** | covered by `12n-api-per-component-changelog` (DONE) | Industry-pattern adopted. |
| **Spectrum + Polaris type-tests for prop interface stability** | covered by `12p-test-type-tests-prop-stability` (DONE) | Industry-pattern; we used tsc-only (no tsd dep) to honor the no-deps rule. |
| **AVA / Mantine / Chakra CodeSandbox embed per primitive** | covered by `12n-api-codesandbox-embed-per-primitive` (DONE) | Industry-pattern adopted. |
| **github.com/Manavarya09/design-extract** | `docs/ai/DESIGN_EXTRACT_GAP.md` | Reference for visual ingestion — gap analysis identifies what we already cover + 5 proposed backlog units (`backlog-14` through `backlog-18`). |
| **Hermes (NousResearch) + Kimi-K2 (Moonshot) + qwen2.5-coder (Alibaba) — local LLM ecosystem** | memory `project_kimi_integration.md`, scripts/hermes-unit.mjs, scripts/kimi-agent.mjs | Multi-runner architecture. Hermes is workhorse for T1/T2 mechanical units (free, local). Kimi-K2 (SWE-bench 65.8%, 128K context, OpenAI-compatible) for autonomous mode 2. qwen2.5-coder:14b is the actual Ollama model. |
| **Vercel + Next.js + Stripe** (typical SaaS stack) | memory `project_concrete_ecommerce.md` | Concrete Creations target stack. Per-tenant Vercel deploy. |
| **Discord (async + ingestion pipeline)** | memory `project_workspace_hq.md`, `project_ramble_processor.md` | Bot + ingestion pipeline in flight. Ramble processor concept: classify pastes → Action Items / System Evolutions / Memory adds. |
| **Obsidian / Notion / Google Docs** | memory `feedback_knowledge_management.md` | **Explicitly rejected.** Keep all planning inside the repo (git-versioned, agent-readable). |
| **Carbon (IBM) tenant onboarding playbook** (industry-implicit) | `docs/operations/tenant-onboarding.md` | 30-min target from contract → Vercel preview. `pnpm scaffold:tenant` CLI. 3-tier classification. |
| **Google SRE / Etsy blameless postmortem** (industry-implicit) | `docs/logs/AI_DECISION_LEDGER.md` | Adopted as Root Cause / Resolution discipline since 2026-04-24. |
| **Husky + lint-staged** (industry-standard) | `.husky/pre-commit`, `.husky/pre-push`; `docs/operations/hooks-policy.md` | Adopted with explicit "no auto-amend" hardening. |
| **Brad Frost — Atomic Design** (implicit) | tier system (primitive/pattern/template/utility) | Adapted with explicit tier classification + asymmetric doc weight per tier. |
| **W3C Design Tokens Community Group (DTCG)** | `hirobius.tokens.json`, `scripts/build-tokens.mjs` | DTCG-spec-compliant; custom compiler emits CSS / TS / Tailwind / manifest from single source. |
| **`@microsoft/api-extractor`** | `docs/architecture/strengths-and-differentiators.md`; covered by `12n-api-extractor-wired` + `12n-api-internal-vs-public-jsdoc` | Industry-pattern adopted; @public/@internal JSDoc discipline. |
| **Changesets for monorepo versioning** | covered by `12n-api-changelog-automation` (planned, blocked by 12n-monorepo-split) | Industry-pattern, blocked. |
| **AWS SaaS Lens — silo / pool / bridge multi-tenancy** | `docs/architecture/tenant-token-overlay-format.md` | Bridge pattern adopted (shared HDS components + per-tenant token overrides + separate Vercel deploys). |
| **Stryker / Pitest mutation testing** | covered by `12p-test-mutation-testing-stryker` (NOT YET) | Aspirational; current proof-of-firing fixtures (12g-7) cover similar ground for canon rules. |
| **Anthropic Claude Code subagents** + **OpenAI Codex CLI** | memory `feedback_in_window_subagents.md` | Adopted Claude Code in-window subagents as primary parallel-execution model (validated 2026-05-03 vs API runner approach). Codex CLI evaluated as fallback (single-threaded, can do sequential pickup). |

---

## Path to a mature design system

> **The honest assessment** based on this audit: Hirobius is at **Design System Maturity Level ~3.5** (Managed, climbing to Measured), with composite **45%** per `docs/architecture/scorecard.md`. The path to Level 4 (Measured) is mostly already mapped to specific orchestration units — closing them in priority order is the work. Level 5 (Optimized) requires sustained adoption, which means real client work first.

### What we have that's already Level 4-grade

- 🌐 **DTCG W3C-compliant token graph** with 3-tier (primitive/semantic/component) + multi-tenant overlay format
- 🌐 **45 check scripts + 5 LLM validators + AST gatekeeper** (per `docs/architecture/strengths-and-differentiators.md` — "most peer systems rely on ESLint plugins + a handful of custom rules")
- 🌐 **269 fixtures + fixture-as-contract discipline**
- 🌐 **Manifest-driven Figma master generation** (13 components × 80 variants from manifest)
- 🌐 **Tenant onboarding runbook** with 30-min target from contract → Vercel preview (`docs/operations/tenant-onboarding.md`); `pnpm scaffold:tenant` CLI; 3-tier client classification
- 🌐 **Required-check promotion policy** with documented criteria (3 green merges + no blockers + Adrian approval)
- 🌐 **Release tagging policy** with semver + pre-merge rescue tags
- 🌐 **Hooks policy** preventing post-commit auto-amends (cherry-pick/rebase safety)
- 🌐 **Append-only governance ledger** (`docs/SYSTEMS-LOG.md` — 158 entries since 2026-04-02, ~5/day avg)
- 🌐 **Auto-journaling case study** (`docs/CASE_STUDY_JOURNAL.md` — timestamped layout-fix entries since 2026-04-24)
- 🌐 **AI Decision Ledger** with formal Root Cause/Resolution discipline + feature flag lifecycle policy (Introduce → Flip → Delete with telemetry gates)
- ✨ **Eco-aware sub-agent dispatch** (haiku/sonnet/opus rule per task class — saves 60-80% opus token spend)
- ✨ **Worktree-isolated parallel pod dispatch** with documented unreliability patterns
- 🌐 **Quantitative health trend**: 701 violations (2026-04-02) → 0 violations (latest), captured in `src/app/data/health-history.json` with 158 timestamped snapshots
- 🌐 **Real multi-tenant proof**: 2 active clients (Lilac Insurance Group + The Ranch Foundation) + 1 active prospect (Phil — land management); per-client structured data (meta/goals/retainer/stack/tasks/checklist/notes)
- 🌐 **Security audit clean** (`docs/operations/security-audit-2026-05-02.md`): 0 high-severity vulns, .gitignore coverage PASS, bridge credentials PASS, external process spawning PASS, 1 LOW finding (default workflow permissions — non-blocking)

### What blocks Level 4 (Measured) — ranked by leverage

| # | Gap | Closes via |
|---|---|---|
| 1 | **No semver releases yet** — public API surface defined but no published versioned packages | `12n-api-monorepo-workspace-split` (parked, needs ratification) → enables `12n-api-changelog-automation` |
| 2 | **No external contributor model** — only Adrian + agents | `12n-api-rfc-process-formalization`; CONTRIBUTING.md (NOT YET per strengths doc) |
| 3 | **WCAG 2.2 AA conformance not certified** — `a11y.yml` runs but no published conformance level | "WCAG 2.2 explicit conformance log → NOT YET — adding" per strengths doc |
| 4 | **Single-browser test coverage (chromium only)** | `12p-test-browser-matrix-firefox-safari` |
| 5 | **No mutation testing** — coverage % can be deceptive | `12p-test-mutation-testing-stryker` |
| 6 | **No usage analytics** — don't know which components consumers use | NOT YET per strengths doc; need client-portal launch first |
| 7 | **No live RUM monitoring** | NOT YET per strengths doc |
| 8 | **No PR/issue templates, CONTRIBUTING.md, CODE_OF_CONDUCT.md** | NOT YET per strengths doc |
| 9 | **No docs versioning per release** | NOT YET per strengths doc; blocked by semver releases (#1) |
| 10 | **No SBOM / supply-chain attestation** | FIX-007; not in current orchestration |
| 11 | **No service worker / offline mode** | NOT YET per strengths doc |
| 12 | **README bundle-size badge** | NOT YET per strengths doc |
| 13 | **`hds-migration-audit.yml` DEAD PATH** | FIX-022 — restore script or delete workflow |
| 14 | **4 a11y/visual/responsive/collision workflows soft-failing** | Promote to required after baseline (per `docs/operations/required-checks.md` policy) |
| 15 | **First paying-client revenue not yet collected** | Lilac Insure phase-1 ($1500 verbal); Phil prospect ($500-1000 starter) — closing → Level 4 social proof |

### What blocks Level 5 (Optimized) — strategic, not tactical

| Gap | Why it matters | Realistic horizon |
|---|---|---|
| External adoption (downloads, stars, blog posts, conf talks) | Level 5 design systems have communities, not just users | 6-12 months post-Concrete-Creations launch |
| Multi-platform tokens (web + mobile) | Token system currently web-only | 12-18 months |
| Plugin ecosystem (Figma + VS Code + Chrome) | Has Figma plugin; the rest aren't built | 6-12 months |
| Pattern recommendation ML / autonomous design-to-code | Hirobius is unusually ahead here (hermes loop, dispatch swarm) | already in flight |
| Predictive impact analysis (which next release breaks which downstream) | Requires real downstream consumers first | post-semver-releases |
| Conference circuit / open-source brand | The case-study site is the seed | 6-12 months |

### The recommended next-3-units to ratchet toward Level 4

If I had to pick three units that would move composite the most per dollar of effort:

1. **`12n-api-monorepo-workspace-split`** (parked — needs opus PLAN session + ratification). Unlocks #1 (semver), #9 (docs versioning), and externally-consumable packages. Highest leverage. Single biggest jump in composite score.
2. **`12u-cc-repo-bootstrap`** (gated — needs ratification). First paying-client launch closes #15 and provides Level 4 social proof. Concrete Creations is the proof case.
3. **WCAG 2.2 AA conformance log** (NOT YET as orchestration unit — needs creation). Closes #3. Enabled by existing `a11y.yml` workflow + Constitution Rule 8 (Motion Guardrail). Requires audit + publish, not new infrastructure.

Composite math (estimated): #1 +8-10 points, #2 +5 points, #3 +3 points. **Could push composite from 45% → 60-65% in one focused sprint.**

---

## Technical-debt ledger (baseline)

> Captured 2026-05-03 17:00 PT for trend tracking. Re-run periodically and append timestamped rows. Treat ratchets as targets — debt should trend down, not up, unless explicitly accepted.

| Metric | 2026-05-03 baseline | Target trend |
|---|---|---|
| `src/` TODO/FIXME/XXX/HACK | 13 | ↓ |
| `scripts/` TODO/FIXME/XXX/HACK | 15 | ↓ |
| `src/` `eslint-disable` directives | 27 | ↓ (audit each; some legitimate, some staleness) |
| `src/` `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` | 7 | ↓ to 0 ts-ignore (expect-error only for documented test cases) |
| `src/` HDS exemption markers (`hds-bypass`, `spacing-ok`, `outline-ok`, `font-ok`, `color-ok`) | **123** ⚠ | ↓ — high count suggests bypass overuse; per-rule scope (`12g-6-bypass-rule-scope` ✅ DONE) should help; periodic audit warranted |
| Test `.skip` / `.todo` / `.only` | 5 | ↓ to 0 `.only` (CI-leak risk); `.skip` and `.todo` audited periodically |
| Baselined token-path violations | 281 | ↓ to 0 (burning down via `12g` cluster) |
| Latest health-history snapshot | score 100 / grade F / 53 violations | grade mismatch suggests scoring bug → FIX-028 |
| `src/` total LoC | 58,462 | tracked, not targeted |
| `scripts/` total LoC | 41,652 | tracked, not targeted |
| Manifested components | 45 | growing intentionally |
| Validators (`scripts/check-*.mjs`) | 57 | growing; coverage of canon-rule fixtures @ 11/57 = 19% |
| GitHub Actions workflows | 12 (1 DEAD PATH per FIX-022) | trim DEAD; keep functional |

**Anomaly noted**: `health-history.json` latest entry shows `score: 100` AND `grade: F` AND `totalViolations: 53` — these don't reconcile. Either score formula or grade threshold is misconfigured. Logged as **FIX-028: health-history grade-vs-score mismatch**. File: `src/app/data/health-history.json`, scorer likely in `scripts/record-health.mjs` or `scripts/audit-tokens.mjs`.

---

## Bot-building growth curve

> When did each agent-infrastructure capability come online? Capability-by-date timeline, not per-tool.

| Date | Capability landed | Source |
|---|---|---|
| **2026-04-26** | Bi-directional Figma sync via `hds-bridge.mjs` (express endpoint, manifest read/write) | git first-commit |
| **2026-04-26** | Local LLM (`hds-coder` 14B → later hermes3 → later qwen2.5-coder:14b) for Figma documentation generation | AI_ORCHESTRATION.md |
| **2026-04-28** | Phase 0 orchestration foundation: `docs/ai/orchestration.json` unit DB | git first-commit |
| **2026-04-28** | Streaming JSONL renderer (LLM → bridge → plugin via SSE) | AI_ORCHESTRATION.md Phase 1 |
| **2026-04-28** | Variable binding + smart placement in Figma plugin (Phase 1) | AI_ORCHESTRATION.md |
| **2026-04-28** | JSX-to-Figma compiler (Phase 2) — zero-dep recursive HTML/JSX → ADD_NODE | AI_ORCHESTRATION.md |
| **2026-04-28** | hermes3 LLM upgrade with JSON mode + UPDATE_NODE support (Phase 3) | AI_ORCHESTRATION.md |
| **2026-04-29** | Master fan-out: 80 variants × 13 components from manifest (Phase A1-A5) | git: pipeline/figma-masters-batch.mjs |
| **2026-04-30** | `AUTONOMOUS_BUILD.md` — pipeline architecture documented | git first-commit |
| **2026-04-30** | shadcn-baseline distribution model adopted (ADR-001) | docs/adr/001 |
| **2026-05-01** | Multi-agent overnight burndown protocol (`MULTI_AGENT_OVERNIGHT.md`) | git first-commit |
| **2026-05-01** | `audit-claims.mjs` — stale claim detection | git first-commit |
| **2026-05-01** | `orchestration-watcher.mjs` daemon — keeps `ready-queue.json` fresh | git first-commit |
| **2026-05-01** | `AGENT_GUIDELINES.md` — formal agent-dispatch rules | git first-commit |
| **2026-05-01** | Multi-tenant CSS scope decision (ADR-0001) | docs/architecture/ADR-0001 |
| **2026-05-01** | HDSLayout split plan ratified (ADR-0002) | docs/architecture/ADR-0002 |
| **2026-05-01** | Bundle budget enforcement decision (ADR-0003) | docs/architecture/ADR-0003 |
| **2026-05-01** | Phase 8-T-patterns 4/4 closed (shadcn-pivot last sprint) | memory `project_genui_pipeline.md` |
| **2026-05-01** | Phase 9-D-docs-aesthetic 10/10 closed (Vercel/Geist-style doc shell) | same |
| **2026-05-02** | `hermes-unit.mjs` — Hermes v0.12.0 as primary autonomous executor | git first-commit |
| **2026-05-02** | `kimi-agent.mjs` — Kimi-K2 parallel runner (bridge backend + autonomous mode) | git first-commit |
| **2026-05-02** | `swarm.mjs` — tier-routed multi-model worker pool coordinator | git first-commit |
| **2026-05-02** | `pod-runs.mjs` telemetry writer | git first-commit |
| **2026-05-02** | Tenant onboarding playbook (`docs/operations/tenant-onboarding.md`) — 30-min target | docs/operations |
| **2026-05-02** | First paying client onboarded (Lilac Insure, Conrad Milsap, $1500 phase-1 verbal agreement) | clients/lilac-insure/retainer.json |
| **2026-05-02** | Security audit pass (`docs/operations/security-audit-2026-05-02.md`) — 0 high vulns | docs/operations |
| **2026-05-03** | Second client onboarded (The Ranch Foundation, board volunteer pro bono) | clients/the-ranch-foundation |
| **2026-05-03** | First prospect (Phil — land management, Conrad referral, Starter package hypothesis) | clients/prospect-001 |
| **2026-05-03** | Eco-aware sub-agent dispatch directive codified (haiku/sonnet/opus rule) | memory `feedback_eco_efficient_subagents.md` |
| **2026-05-03** | In-window subagents directive codified (prefer Claude Code Agent tool over standalone API runners during active sessions) | memory `feedback_in_window_subagents.md` |
| **2026-05-03** | "No aspirational guardrails" 5-step DoD codified | memory `feedback_no_aspirational_guardrails.md` |
| **2026-05-03** | Validator coverage audit (57 scripts inventoried, WIRED/NPM-only/ORPHAN classification) | docs/findings/2026-05-03-validator-coverage.md |
| **2026-05-03** | Card slot system codified (`12d-card-anatomy`); outline rule codified | memory `feedback_card_slot_system.md`, `feedback_outline_rule.md` |
| **2026-05-03** | INLINE_STRUCTURAL_BORDER lint gate + ratchet baseline | git commit `05731462` |
| **2026-05-03** | Validator proof-of-firing fixtures (`12g-7`) — 11 canon rules + runner | git: scripts/__tests__/run-canon-fixtures.mjs |
| **2026-05-03** | 4 hard-gate promotions to pre-commit (`12g-8` — colors, fonts, spacing, mojibake) | git commit |
| **2026-05-03** | Multi-tenant pipeline closed (10f-6 + 12m + 10n-6) — first end-to-end multi-brand demo | this session |
| **2026-05-03** | API-extractor + public/internal JSDoc (`12n-api-internal-vs-public-jsdoc`) — 43 @public, 12 @internal | this session |
| **2026-05-03** | Vitest v8 coverage + baseline (`12p-test-coverage-reporting-wired`) — 50.75% stmts / 24.05% branches | this session |
| **2026-05-03** | Type-tests via tsc --noEmit (`12p-test-type-tests-prop-stability`) — 5 .test-d.ts files | this session |
| **2026-05-03** | Focus-flow Playwright spec (`12p-test-focus-flow-analysis`) — 15 tests across 5 routes | this session |
| **2026-05-03** | Sidebar nav data-driven (`backlog-19`) — registry-derived | this session |
| **2026-05-03** | Multi-brand theming demo (`/hds/brand-theming`) — 3 brands side-by-side | this session |
| **2026-05-03** | Token cascade diagram interactive (`10n-5`) — hover highlights cascade | this session |
| **2026-05-03** | ESLint zero-warning baseline achieved (`12i-quality-eslint-burndown`) | this session |
| **2026-05-03** | eslint-plugin-import-x migration (ESLint 10 native) | this session |
| **2026-05-03** | Per-tenant Figma master generation (`12m-mt-figma-master-per-tenant`) | this session |
| **2026-05-03** | SIGNAL.md canonical learning ledger bootstrapped (this doc) | this session |

**Pattern**: ~2 weeks of agent-infrastructure development; ~1 week of multi-runner consolidation; ~1 day of intense burndown closing 30+ units. Velocity correlates strongly with infrastructure maturity — early days were 1-2 commits/day; recent days 50+ commits/day with parallel pods.

**Bot-building maturity assessment**: At industry-comparable Level 4 ("Measured") for autonomous-agent infrastructure. Few peer teams have: tier-routed multi-model dispatch, eco-aware cost discipline, worktree-isolated parallel pods, claim/done state machine with stale-claim audit, retry loop with AST gatekeeper validators. **This is unusually advanced — and is the primary differentiator for the GRC AI-governance career angle (memory `project_security_grc.md` Track 2).**

---

## Future-fix registry (FIX-NNN)

> Each entry: severity, files involved, repro/symptom, root cause hypothesis, proposed approach, blocked-by. Designed so an agent picking up FIX-NNN has full context. Append-only — strikethrough closed entries; never delete.

### FIX-001 — DORA Four Keys not measured
- **Severity**: High (operational visibility)
- **Files involved**: `telemetry/`, new `scripts/dora-metrics.mjs`, ops dashboard widget at `src/app/pages/ops/`
- **Symptom**: Industry-standard engineering velocity metrics (Deployment Frequency, Lead Time for Changes, Change Failure Rate, MTTR) not computed
- **Why it matters**: Standard for engineering-effectiveness benchmarking; required for any external technical credibility (case study, GRC portfolio)
- **Proposed approach**: Aggregate from git log + orchestration.json (claim → done timestamps) + `telemetry/pod-runs.jsonl`. Surface in `/ops`.
- **Blocked-by**: FIX-019 (pod-runs schema)

### FIX-002 — SPACE framework: satisfaction not tracked
- **Severity**: Low (Adrian-anecdotal sufficient for now)
- **Proposed approach**: Add per-session "morale tag" prompt in CLAUDE.md or skill; aggregate into SIGNAL.md personal-sustainability section
- **Defer until**: client portal launches → real users to satisfy

### FIX-003 — Branch coverage 24% (industry ~70%)
- **Severity**: High (silent regression risk in branches)
- **Files involved**: `vitest.config.ts`, `tests/coverage-summary.json`, individual `src/**/*.test.ts` files needing branches
- **Proposed approach**: Identify components with <40% branch coverage; add targeted branch tests. Ratchet threshold up gradually (24% → 35% → 50%).
- **Effort**: T2 sonnet, ongoing

### FIX-004 — Tech-debt ratio not formally measured
- **Severity**: Low (we have proxy metrics in tech-debt-ledger)
- **Proposed approach**: `scripts/audit-debt.mjs` aggregating TODO/FIXME/eslint-disable/ts-ignore/spacing-ok/baselined into single ratio. Compare to LoC. Trend over time.

### FIX-005 — `@ts-ignore` budget unset
- **Severity**: Medium
- **Files involved**: 7 instances in `src/**/*.{ts,tsx}` (per baseline audit)
- **Proposed approach**: Audit each; convert to `@ts-expect-error` with reason where legitimate; eliminate the rest. Set hard cap at 5 in pre-commit.

### FIX-006 — OWASP Top 10 partial coverage; no SAST/DAST
- **Severity**: Medium (acceptable today; required pre-launch of any client portal handling PII)
- **Files involved**: `.github/workflows/security.yml` (new), possibly `eslint-plugin-security`, optionally Snyk/SonarCloud integration
- **Proposed approach**: SAST via ESLint security plugin first (free); evaluate Snyk for SCA + DAST later
- **Defer until**: client portal handling PII

### FIX-007 — SLSA L1 only; no SBOM / supply-chain attestation
- **Severity**: Medium (required for enterprise clients eventually)
- **Files involved**: `.github/workflows/sbom.yml` (new); `package.json` (devDeps for SBOM generator)
- **Proposed approach**: GitHub Actions step generating CycloneDX SBOM on release tags; commit SBOM to `docs/security/sbom/`
- **Partial → covered by**: `13y-0-fix-broken-gates` (done 2026-05-06) — `audit-sbom.mjs` now runs cleanly in pnpm workspaces (`--ignore-npm-errors` flag). Remaining gap: release-tagged CI workflow that publishes SBOMs.

### FIX-008 — WCAG 2.2 AA conformance level not published
- **Severity**: Medium (Level-4-blocker per Path to Maturity)
- **Files involved**: `.github/workflows/a11y.yml` (read first), `tests/a11y.spec.ts`, new `docs/security/a11y-conformance.md`
- **Proposed approach**: Audit current a11y.yml results across all routes; document failures + waivers; publish "Hirobius design system conforms to WCAG 2.2 AA at routes X, Y, Z; routes A, B do not yet conform: <list>"

### ~~FIX-009~~ — `prefers-reduced-motion` audit
- **Status**: Demote — covered by orchestration unit `12r-a11y-prefers-reduced-motion-validator` per strengths-and-differentiators.md. Status check vs unit needed; not a new FIX.
- **→ covered by**: `12r-a11y-prefers-reduced-motion-validator` (done) — validator landed.

### FIX-010 — Core Web Vitals per route not published
- **Severity**: Medium
- **Files involved**: `.github/workflows/perf.yml` (read first), output to new `docs/signal/cwv-per-route.md`
- **Proposed approach**: Lighthouse CI per route; aggregate into trend doc + dashboard widget

### FIX-011 — Single-browser test coverage (chromium only)
- **Severity**: Medium
- **Files involved**: `playwright.config.ts`, add firefox + webkit projects
- **Existing unit**: `12p-test-browser-matrix-firefox-safari`
- **Proposed approach**: Add 2 projects to Playwright config; baseline snapshots may diverge per engine; gradual rollout with continue-on-error first

### FIX-012 — Diataxis-balanced docs (deferred to audit)
- **Status**: Demote — repo has `docs/process/`, `docs/operations/`, `docs/workflows/`, `docs/vision/`, `docs/knowledge/` covering non-reference quadrants. Need formal mapping before claiming imbalance.

### FIX-013 — Reflexion: no closed-loop reflection capture
- **Severity**: Medium
- **Files involved**: `scripts/hermes-unit.mjs` (the "post-mortem learned rule" log line — destination unclear), new `docs/signal/learned-rules.jsonl`
- **Proposed approach**: Hermes loop appends learned rules to JSONL with timestamp + rule text + source unit; agent dispatches optionally read recent learned rules
- **→ covered by**: `13g-13-learned-rules-promotion` (done) — learned-rules ledger lives in `docs/ai/learned-rules.jsonl`.

### FIX-014 — LangSmith-style observability (cost + latency aggregation)
- **Severity**: Medium
- **Files involved**: `telemetry/pod-runs.jsonl`, new `src/app/pages/ops/AgentObservabilityPage.tsx`
- **Proposed approach**: Aggregate pod-runs into per-model + per-unit cost + win-rate + retry distribution; surface in `/ops`
- **Partial → covered by**: `13w-ops-13a-live-pod-tail` (approved, HITL) for live tail + `backlog-14-agency-dashboard-codeburn` (needs-grilling) for cost/burn aggregation.

### FIX-015 — Win-rate not benchmarked vs published evals
- **Severity**: Low
- **Files involved**: New `docs/signal/agent-eval-results.md`
- **Proposed approach**: Run subset of SWE-bench / AgentBench against our setup; compare to published Anthropic / OpenAI numbers

### FIX-016 — Cycle time not aggregated
- **Severity**: Medium
- **Files involved**: New `scripts/aggregate-cycle-time.mjs`
- **Proposed approach**: Read orchestration.json claim/done timestamps; output aggregate distribution per tier

### FIX-017 — No SUS/NPS/HEART for users
- **Severity**: Low (today) → High (when client portal ships)
- **Files involved**: Per-client `clients/<slug>/feedback.md`; possibly Plausible analytics
- **Defer until**: client portal launches

### FIX-018 — No observability stack (Sentry/DataDog/OTel)
- **Severity**: Medium-High pre-launch
- **Files involved**: Sentry SDK install, OTel SDK install, env vars (Adrian sets)
- **Proposed approach**: Sentry first (cheapest entry), OTel later

### FIX-019 — `pod-runs.jsonl` schema drift (totalTokens always 0 for hermes3)
- **Severity**: Medium
- **Files involved**: `telemetry/pod-runs.mjs` (writer), `scripts/hermes-unit.mjs` (caller)
- **Symptom**: hermes3 entries show `totalTokens: 0`; jq parsing of full file fails on some entries
- **Proposed approach**: Audit writer schema; ensure version field; ensure hermes3/Ollama responses are parsed for token counts; add schema validation

### FIX-020 — Worktree-stranding manual recovery
- **Severity**: High (operational — this session: 5+ stranded recoveries)
- **Files involved**: New `scripts/worktree-auto-merge.mjs`; polls `.claude/worktrees/agent-*` for fresh deliverable commits matching unit-id pattern
- **Proposed approach**: Cron-driven polling OR filesystem watch; cherry-pick deliverable commits to fix/ui-pipeline; log to telemetry
- **Validation**: After dispatch, no manual cherry-pick required
- **Partial → covered by**: `12s-infra-worktree-isolation-verification` (done) — verifies isolation discipline; auto-merge daemon still aspirational.

### FIX-021 — Denied unit reasons not captured in agentNotes
- **Severity**: Low
- **Files involved**: `scripts/validate-orchestration.mjs`
- **Proposed approach**: Add validation: status="denied" requires agentNote starting with "[denied YYYY-MM-DD]:" + reason. Backfill 15 existing denied units from git log of triage commits.

### FIX-022 — `hds-migration-audit.yml` DEAD PATH
- **Severity**: High (CI step always fails when triggered; path filter on `src/app/**` means most PRs trigger it)
- **Files involved**: `.github/workflows/hds-migration-audit.yml:35`, missing `scripts/audit-component-source.js`
- **Proposed approach**: Either restore the script (recover from git history if it ever existed) OR delete the workflow with a documented rationale
- **Reference**: documented in `docs/ai/checks-hooks-triggers-inventory.md` since 2026-05-02

### FIX-023 — `checks-hooks-triggers-inventory.md` says `pnpm lint --max-warnings=210`, actual is 0
- **Severity**: Low (doc-vs-code drift)
- **Files involved**: `docs/ai/checks-hooks-triggers-inventory.md`
- **Proposed approach**: Update doc to reflect 2026-05-03 change (`12i-quality-eslint-burndown`)

### FIX-024 — 4 a11y/visual/responsive/collision workflows soft-failing (continue-on-error)
- **Severity**: Medium
- **Files involved**: `.github/workflows/{a11y,visual,responsive,collision}.yml`
- **Proposed approach**: Per `docs/operations/required-checks.md` policy: 3 green merges + no blockers + Adrian approval → promote each to required
- **Blocked-by**: snapshot baseline rebake for visual.yml (mentioned in policy)
- **→ covered by**: `12p-test-required-checks-promote` (done) — promotion policy + required-checks doc landed; flip is Adrian's call in GitHub UI.

### FIX-025 — AI_ORCHESTRATION.md Task 30 case study auto-journaling
- **Status**: Possibly closed — `docs/CASE_STUDY_JOURNAL.md` exists at 21KB with timestamped entries. Verify it's still being updated (last entry date check); if stale, restart auto-journaling.
- **Files involved**: `docs/CASE_STUDY_JOURNAL.md`, possibly `scripts/update-case-study-journal.mjs` (if exists)
- **Partial → covered by**: `12c-1-hirobius-case-study-homepage` (done) — published surface; auto-journaling tracked by `backlog-8-case-study-auto-journaling` (parked).

### FIX-026 — AI_ORCHESTRATION.md `[cite_start]` markers
- **Severity**: Cosmetic
- **Files involved**: `docs/ai/AI_ORCHESTRATION.md`
- **Proposed approach**: Strip `[cite_start]` markers OR convert to functional links if citations exist somewhere

### FIX-027 — Constitution rule fixture coverage gap
- **Severity**: Medium (per "no aspirational guardrails" memory)
- **Files involved**: New `scripts/__tests__/fixtures/constitution/` directory; runner extension
- **Proposed approach**: For each of 8 Constitution rules (Sticky Rail Law, Hero Rule, Reading Column Rule, Flush Rule, Gap Mandate, Containment Rule, Stretch Rule, Motion Guardrail) — create a contrived violation fixture and assert the corresponding validator catches it
- **Status**: 2 of 8 confirmed fixture-tested (INLINE_STRUCTURAL_BORDER, INLINE_THIN_BAR per validator-coverage finding)

### FIX-028 — health-history.json grade vs score mismatch
- **Severity**: Low (signal integrity)
- **Files involved**: `src/app/data/health-history.json`, scorer in `scripts/record-health.mjs` or `scripts/audit-tokens.mjs`
- **Symptom**: Latest entry has `score: 100, grade: F, totalViolations: 53` — these don't reconcile
- **Proposed approach**: Audit scoring formula + grade thresholds; fix or document the divergence

### FIX-029 — MEMORY.md index out of date (22 listed, 31 actual)
- **Severity**: Low
- **Files involved**: `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/MEMORY.md`
- **Proposed approach**: Either auto-regenerate (one-line script: `ls memory/*.md | grep -v MEMORY.md | xargs -I{} basename {}` → format as bullets) OR manual sync. Probably one-time manual fix is cheapest.

### FIX-030 — `docs/vision/inspirations.json` placeholder content
- **Severity**: Low
- **Files involved**: `docs/vision/inspirations.json`
- **Proposed approach**: Back-populate from SIGNAL.md `Inspirations — memory-derived enrichment` section (22 entries) into structured JSON

### FIX-031 — Two parallel ADR taxonomies
- **Severity**: Low
- **Files involved**: `docs/adr/001-008` (legacy 3-digit) AND `docs/architecture/ADR-0001-0004` (current 4-digit per `docs/architecture/README.md`)
- **Proposed approach**: Confirm current convention is `docs/architecture/ADR-NNNN`; archive `docs/adr/` with redirect notes; OR consolidate into one location
- **Existing unit**: `12n-api-rfc-process-formalization`
- **→ covered by**: `12n-api-rfc-process-formalization` (done) — ADR-NNNN convention codified; legacy `docs/adr/` consolidation/archive still open.

### FIX-032 — "Industry-tool first" checklist before authoring new validators
- **Severity**: High (prevents recurrence of the bespoke-gate-sprawl loss documented in §Lossy/expensive pitfalls)
- **Symptom**: Across many sessions we authored ~39 custom gates (~1,650 LOC + 3,000 LOC of build-tokens.mjs) that duplicate ESLint plugins, stylelint, lint-staged, type-coverage CLI, editorconfig-checker, size-limit, lychee, Style Dictionary, etc. Each gate then needed bespoke fixture authoring for the A3 dimension — compounding the loss.
- **Files involved**: `docs/ai/AGENT_GUIDELINES.md`, `CLAUDE.md` §1a (orchestration/discoverability), possibly a pre-commit gate `check-bespoke-validator-justification.mjs`.
- **Proposed approach**: Add a "before you author" checklist to AGENT_GUIDELINES that any unit spec creating a new `scripts/check-*.mjs` or `scripts/audit-*.mjs` must first complete. Example items:
  1. What's the closest ESLint rule / stylelint rule / npm package that does this?
  2. If one exists, write a 1-line justification in the unit spec for why bespoke is required (token-system specificity, agent-state semantics, etc).
  3. If no industry tool exists, search GitHub for `<topic> linter` — confirm.
  4. Default verdict: use the industry tool; bespoke requires the justification.
- **Validation**: a new gate `check-bespoke-justification` scans newly-added scripts/check-*.mjs files (compared to git HEAD~) and asserts the orchestrating unit spec contains a `bespokeJustification` field. Soft channel initially; promote after a few units validate the workflow.
- **References**: `docs/guardrails/gate-replaceability-plan.md` (the audit that surfaced this), commit `c1e4d996`.

---

## SIGNAL.md proof-of-firing plan

> Per the "no aspirational guardrails" memory: a rule isn't done until proven firing. SIGNAL.md isn't a rule, but it has the same risk of becoming aspirational. Plan for keeping it alive:

1. **Display widget consuming structured fields** — eventual `/ops` widget reads at minimum: composite maturity score, debt-ledger latest values, FIX-NNN open count. Divergence test: CI fails if widget data doesn't reconcile with SIGNAL.md.
2. **Append-only enforcement** — pre-commit gate refuses deletion of completed entries (must be strikethrough, not removed). Implementation: `scripts/check-signal-append-only.mjs`.
3. **Date-stamping discipline** — every new section / entry timestamped. CI gate flags entries without dates older than [TBD].
4. **FIX registry recurrence audit** — weekly cron checks: any FIX older than 30 days without status update? Surface in MORNING_LEDGER.
5. **Case study derivation** — at minimum quarterly, derive case-study-shaped narrative from SIGNAL.md sections. Confirms the doc has external utility, not just internal.

If after 30 days SIGNAL.md hasn't materially shaped any decision (no FIX picked up, no widget built, no case-study slice derived), it's drifted into aspirational territory and should be rebooted.

---

## Action plan — what to do, in order

> **Synthesis** of audit findings + Path to Maturity + FIX registry + strengths-and-differentiators.md "Things we DON'T do" table. Ranked by composite-impact + effort + dependencies. Each item has owner + dependencies + estimated impact on composite maturity score.

### Priority 1 — **THIS WEEK** (immediate composite-impact)

| # | Action | Owner | Depends on | Composite +pts (est) |
|---|---|---|---|---|
| 1 | **`12u-cc-repo-bootstrap` opus PLAN session first**, then ratification, then execute | Adrian (ratify) → opus session → execute pod | Adrian explicit OK | +5 (closes Pilot client surface from 5% → 60%; first revenue path) |
| 2 | **WCAG 2.2 AA conformance log** — audit current `a11y.yml` results, publish `docs/security/a11y-conformance.md` | sonnet pod | None | +3 (closes Level-4-blocker #3) |
| 3 | **FIX-022 `hds-migration-audit.yml` DEAD PATH** — restore script or delete workflow + commit rationale | sonnet pod | Adrian decision (restore vs delete) | +1 (CI hygiene) |
| 4 | **Worktree auto-merge daemon (FIX-020)** — `scripts/worktree-auto-merge.mjs` | sonnet pod | None | operational; saves ~$2-3/session |
| 5 | **Eligibility filter v2** — `orchestration-watcher.mjs` honors agentNotes ratification + abort-cap flags | sonnet pod | None | operational; eliminates "hermes claims gated unit" loop |
| 6 | **Adrian-rejection capture** (FIX-021 pattern extended) — Agent dispatch reject → prompt for reason → append to unit | sonnet pod | None | operational; eliminates re-dispatch guessing |

### Priority 2 — **NEXT SPRINT** (Level 4 unlocks)

| # | Action | Owner | Depends on | Composite +pts (est) |
|---|---|---|---|---|
| 7 | **`12n-api-monorepo-workspace-split` opus PLAN session** (do not execute autonomously — ratification gate) | opus session for plan; Adrian ratifies; then execute pod | Adrian explicit OK | +8-10 (unlocks semver releases, docs versioning, package isolation) |
| 8 | **First semver release post-monorepo split** | sonnet pod | #7 | +3 (closes Level-4-blocker #1) |
| 9 | **`12p-test-browser-matrix-firefox-safari`** — add Playwright firefox + webkit projects | sonnet pod | None | +2 (Level-4-blocker #4) |
| 10 | **`12p-test-mutation-testing-stryker`** — add Stryker; baseline mutation score | sonnet pod | None | +2 (Level-4-blocker #5) |
| 11 | **CONTRIBUTING.md + PR/issue templates + CODE_OF_CONDUCT.md** (Level-4-blocker #8) | sonnet pod | None | +1 (open-source readiness) |
| 12 | **Promote 4 soft workflows to required** (FIX-024) — after baseline runs | Adrian (GitHub UI) | Snapshot rebake for visual.yml | +1 (CI maturity) |
| 13 | **Lilac Insure phase-1 work execution** — EZLynx login → automation prototype → handoff | Adrian | Conrad EZLynx access | First revenue collected; Level-4 social proof |

### Priority 3 — **MEDIUM-TERM** (Level 4 polish)

| # | Action | Owner | Depends on | Composite +pts (est) |
|---|---|---|---|---|
| 14 | **SBOM generation (FIX-007)** — CycloneDX in CI | sonnet pod | #7 (per-package SBOMs need monorepo split) | +2 (security maturity) |
| 15 | **Sentry observability (FIX-018, partial)** | sonnet pod | Adrian sets SENTRY_DSN env | +2 (production readiness) |
| 16 | **DORA Four Keys widget at `/ops` (FIX-001)** | sonnet pod | FIX-019 first | +2 (eng visibility) |
| 17 | **Prompt-evolution registry (proposed improvement #5)** — `docs/ai/dispatch-prompts/` versioned | sonnet pod | None | operational; captures session hand-tuning |
| 18 | **Constitution rule fixture coverage (FIX-027)** — 6 missing fixtures | sonnet pod | None | +1 (closes "no aspirational guardrails" gap on 6 of 8 rules) |
| 19 | **Concrete Creations launch milestone** — Stripe live + WA legal pages + first product sale | Adrian (Stripe + legal) → sonnet pod (build) | #1, #7 | First e-commerce revenue; massive case study material |

### Priority 4 — **STRATEGIC** (Level 5 horizon)

- Multi-platform tokens (mobile)
- Public adoption push: open source the design system; npm publish; conference talks; blog series derived from SIGNAL.md
- Plugin ecosystem (VS Code, Chrome extensions complementing existing Figma plugin)
- Community / contribution model (after first external contributor)

### Composite math summary

If Priority 1 + Priority 2 land cleanly: **45% → ~70% composite** (Level 4 firmly).

Priority 3 + first Concrete Creations sale: **~80% composite** (top of Level 4, approaching Level 5).

Priority 4 horizon: **80% → 95%** over 12-18 months with sustained external adoption.

### What NOT to do

- Do not park 12u-cc-repo-bootstrap further — it's the single biggest revenue + maturity unlock
- Do not bulk lint:fix (per CLAUDE.md "NEVER bulk-lint:fix")
- Do not pursue Level-5 strategic items before Level-4 polish (premature optimization)
- Do not let SIGNAL.md become aspirational — see proof-of-firing plan above
- Do not duplicate existing infrastructure docs (scorecard, strengths, decision-ledger) — link to them
- Do not commit hopeful work without proof-of-firing (per "no aspirational guardrails" memory)
- Do not add new dependencies without explicit ratification (the @vitest/coverage-v8 + eslint-plugin-import-x exceptions were judgment calls, not norms)

---

## Per-phase history

> Synthesized from `docs/ai/AI_ORCHESTRATION.md` (337 lines) + `orchestration.json` phase IDs + git first-commit dates. Phase taxonomy has TWO overlays — AI_ORCHESTRATION uses sequential "Phase N" with named tasks (1-13); orchestration.json uses `phase` IDs like `12-hds-refinement`, `8-S-shadcn`, `10-O-ops-hygiene`. Both treated as authoritative for their respective domains; reconciliation is a known drift (per drift-debt section).

| Phase ID (orchestration.json) | Units | Done | Denied | Parked | What it built | When |
|---|---|---|---|---|---|---|
| `null` (untaxonomized) | 1 | 0 | 1 | 0 | n/a | sentinel |
| `0` | 5 | 5 | 0 | 0 | Foundation orchestration setup | 2026-04-28 onwards |
| `1` | 4 | 4 | 0 | 0 | Native variable binding + smart placement (Figma plugin Phase 1 per AI_ORCHESTRATION.md) | 2026-04-28 |
| `2` | 5 | 5 | 0 | 0 | JSX-to-Figma compiler (Phase 2) | 2026-04-28 |
| `3` | 5 | 5 | 0 | 0 | Bi-directional canvas reading + hermes3 LLM upgrade (Phase 3 + 3.5) | 2026-04-28 |
| `4` | 7 | 7 | 0 | 0 | Phase 4 work | 2026-04-29+ |
| `5` | 4 | 4 | 0 | 0 | Phase 5 flag flips | 2026-04-30 |
| `6` | 5 | 5 | 0 | 0 | Phase 6 read-path flags | 2026-05-01 |
| `7` | 3 | 3 | 0 | 0 | Phase 7 (incl p7-3 feature flag lifecycle policy 2026-05-01) | 2026-05-01 |
| `8-pre` | 4 | 4 | 0 | 0 | Pre-Phase-8 foundations | 2026-05-01 |
| `8-pre-followup` | 4 | 4 | 0 | 0 | Phase 8 follow-up | 2026-05-01 |
| `8-E-tokens` | 3 | 3 | 0 | 0 | Phase 8: Token reorganization | 2026-05-01 |
| `8-V-binding` | 6 | 6 | 0 | 0 | Phase 8: Slot-based binding (8-V cluster — manifest-driven Figma masters) | 2026-05-01 |
| `8-X-tier` | 6 | 6 | 0 | 0 | Phase 8: Tier classification (primitive/pattern/template/utility) | 2026-05-01 |
| `8-S-shadcn` | 8 | 8 | 0 | 0 | Phase 8 shadcn-pivot **8/8 done** (refuting earlier memory's "10/28 closed" — that snapshot was outdated) | 2026-05-01 |
| `8-T-patterns` | 7 | 7 | 0 | 0 | Phase 8: Heavy patterns + templates + orphan cleanup + public-api lockdown (44 components exported via `src/index.ts` barrel) | 2026-05-01 |
| `8-H-hardening` | 3 | 3 | 0 | 0 | Phase 8 hardening | 2026-05-01 |
| `9-D-docs-aesthetic` | 10 | 10 | 0 | 0 | Vercel/Geist-style doc-site overhaul (3-column shell, Cmd-K, theme toggle, doc-page header standardization, CodeBlock collapsed-by-default, scrollspy TOC, semantic.docs.* tokens, inline ApiReference, batch-refactored every doc page) | 2026-05-01 |
| `10-A-foundations-a11y` | 7 | 7 | 0 | 0 | Foundations a11y | 2026-05-01 |
| `10-C-redesigns` | 1 | 1 | 0 | 0 | Redesigns | 2026-05-01 |
| `10-D-doc-polish` | 15 | 15 | 0 | 0 | Doc polish | 2026-05-01 |
| `10-F-figma-sync` | 9 | 9 | 0 | 0 | Figma sync hardening | 2026-05-01 |
| `10-M-pipeline-maintenance` | 7 | 7 | 0 | 0 | Pipeline maintenance | 2026-05-01 |
| `10-N-narrative-adoption` | 8 | 8 | 0 | 0 | Narrative adoption | 2026-05-01 |
| `10-O-ops-hygiene` | 23 | 23 | 0 | 0 | Ops hygiene (incl `10o-11-github-actions-ci` 2026-05-02) | 2026-05-01 → 2026-05-03 |
| `10-P-portfolio-launch` | 5 | 4 | 1 | 0 | Portfolio launch (1 denied: `10p-1-rtl-ltr-language-switcher-qa`) | 2026-05-01 |
| `10-T-token-excellence` | 6 | 6 | 0 | 0 | Token excellence | 2026-05-01 |
| `10-U-pre-launch-unblockers` | 2 | 2 | 0 | 0 | Pre-launch unblockers | 2026-05-01 |
| `11-A-approval-app` | 4 | 4 | 0 | 0 | Approval app | 2026-05-01 |
| `12-hds-refinement` | **166** | 143 | 9 | 2 | The bulk of recent work — 12d card slot system, 12g validator hardening, 12i bloat cleanup, 12j doc coherence, 12m multi-tenant, 12n public API, 12o perf budgets, 12p test infrastructure, 12u Concrete Creations, 12v token system. **Highest-velocity phase.** | 2026-05-01 → ongoing |
| `13-security` | 10 | 9 | 0 | 0 | Security pillar (incl Track 1 + Track 2 GRC career framing) — 1 in flight (`13s-10-grc-career-planning` HITL) | 2026-05-02 |
| `backlog` | 19 | 7 | 4 | 7 | Speculative backlog — high parked rate is by design (waiting on architectural decisions) | 2026-04-28+ |

**Velocity insight**: Phases 0-11 closed in ~2 weeks (April 28 → May 1). Phase 12-hds-refinement opened May 1 and has been the active sprint since (143/166 done = **86%** through its scope). Phase 13-security is the newest opened (May 2) at 90% done.

---

## Audit scripts inventory (`scripts/audit-*.{mjs,js}`)

> 9 scripts, all marked `@internal` (not part of public API surface). Total ~3,420 lines of audit code.

| Script | Lines | Purpose |
|---|---|---|
| `audit-claims.mjs` | 99 | Stale claim detection in `orchestration.json` (default 4h threshold). Reverts stale → approved or surfaces for re-claim. **🌐 INDUSTRY-PATTERN** (job queue stale-claim handling). |
| `audit-components.mjs` | 201 | Token compliance for components — strict (no raw values; tokens only). Wired to `pnpm tokens:audit`. |
| `audit-exceptions.mjs` | 268 | Exception marker auditor — categorizes `// hds-bypass`, `// spacing-ok`, etc. |
| `audit-figma-system.mjs` | 465 | Read-only Figma sync audit — compares repo truth against generated Figma variable exports. Supports both Figma MCP + Figma Console MCP flows. |
| `audit-pages.mjs` | 143 | Token compliance for pages (looser than `audit-components.mjs` — pages can keep justified editorial layout). |
| `audit-strengths.mjs` | 386 | **Verifies that each documented differentiator in `docs/architecture/strengths-and-differentiators.md` is still real.** Programmatic anti-erosion check. **✨ POSSIBLY-NOVEL** — most teams don't have a "verify our claimed strengths still hold" auditor. Has `--json` mode. |
| `audit-tiers.mjs` | 402 | Heuristic tier classifier — proposes primitive/pattern/template/utility for every `Hds*.tsx`. Output: `docs/ai/TIER_AUDIT.md`. Honors `@tier <value>` JSDoc override. |
| `audit-tokens.mjs` | **1,110** | Heavyweight: audits CSS token bridges and visual overrides against the JSON token source of truth. Multiple modes: `--prebuild`, `--full`, `--forbidden`, `--report-only`. **Largest audit script by 3x.** |
| `audit-guardrails.js` | 308 | Scans the 4 pillars of self-healing systems: (1) AI guardrails (CLAUDE.md, .cursorrules), (2) linter rules (ESLint, stylelint), (3) gatekeepers (pre-commit, lint-staged), (4) CI/CD (GitHub Actions). |

**Wiring assessment** (cross-referenced with `package.json` + `.husky/`):
- `audit-tokens.mjs` → wired to multiple npm scripts (`check:ghost-tokens`, `check:forbidden-overrides`, `check:semantic-report`)
- `audit-tokens.mjs` → wired to `watch:metrics` nodemon
- `audit-claims.mjs` → wired to `pnpm hermes:start`
- `audit-strengths.mjs` → wired to `.github/workflows/strengths-audit.yml` (weekly cron Mondays 13:00 UTC)
- `audit-guardrails.js` → wired to `watch:guardrails` nodemon
- `audit-components.mjs` → wired to `pnpm tokens:audit`
- `audit-figma-system.mjs` → manual; used during Figma sync work
- `audit-tiers.mjs` → manual; output is the `TIER_AUDIT.md` doc; rerun on tier classification reviews
- `audit-pages.mjs` → manual; loose-mode page-level checking
- `audit-exceptions.mjs` → manual / part of exceptions audit work

**Drift-debt insight**: `audit-strengths.mjs` exists at 386 lines + has weekly cron — but the strengths it verifies live in `docs/architecture/strengths-and-differentiators.md` which lists 14 strengths. **If 14 strengths exist and the audit script verifies them, then drift between SIGNAL.md inspirations section + strengths doc + audit script must be reconciled.** SIGNAL.md should defer to strengths doc as the canonical strengths source.

---

## pod-runs.jsonl schema audit (FIX-019 expanded)

> 18 entries (small file — 4.6KB). All confirm the schema bug suspected earlier.

**Schema observed** (from samples):
```json
{
  "ts": "ISO-8601 timestamp",
  "sessionId": "hermes:<unit-id>",
  "model": "hermes3:latest" | "qwen2.5-coder:14b-hds",
  "totalTokens": 0,                  // ⚠ ALWAYS 0 across all 18 entries
  "durationMs": <number>,
  "unitsCompleted": 0 | 1,
  "notes": "validation failed: ..." | <success notes>
}
```

**Findings**:
- **Only hermes-prefixed sessionIds** captured. No claude/sonnet/opus pod telemetry. Non-hermes pod runs are NOT being captured.
- **`totalTokens: 0` across ALL 18 entries** for both hermes3 and qwen2.5-coder. Either (a) Ollama doesn't return token counts in the response shape `pod-runs.mjs` expects, or (b) writer is dropping the field.
- **14 of 18 are validation failures** (`notes` contains "validation failed"). High abort rate consistent with hermes attempting hard units before escalation.
- **Distinct models seen**: `hermes3:latest`, `qwen2.5-coder:14b-hds`. No record of Kimi/Claude pods despite session having extensive Claude pod activity.
- **No schema versioning**: no `schemaVersion` field; reader (jq aggregations) breaks silently if schema drifts.

**Confirmed FIX-019 scope**:
1. Investigate why hermes/Ollama responses give 0 tokens — possibly need `eval_count` + `prompt_eval_count` fields from Ollama response.
2. Add Claude/Kimi pod runs to capture (currently invisible).
3. Add `schemaVersion: 1` field for future-proofing.
4. Document the schema in `telemetry/README.md` (does not exist).

**Files involved**: `telemetry/pod-runs.mjs` (writer), `scripts/hermes-unit.mjs` (caller), `scripts/kimi-agent.mjs` (caller), Agent tool callers (no current capture path).

---

## Denied units library (anti-knowledge)

> 15 denied units. **Critical drift**: zero have `_denialReason` populated. Reasons must be reconstructed from git log of triage commits or memory. **FIX-021 escalated to High severity** — denial without reason is anti-knowledge that becomes pure noise within months.

| Unit ID | Best-guess denial reason (from context) |
|---|---|
| `backlog-3-component-prefix-rename` | Likely cosmetic / not worth churning all import sites |
| `10p-1-rtl-ltr-language-switcher-qa` | i18n / RTL deprioritized — solo-founder agency doesn't currently serve RTL markets |
| `backlog-20-public-api-boundary` | Possibly superseded by `12n-api-internal-vs-public-jsdoc` (DONE this session) |
| `backlog-21-hydra-branding-package` | Possibly speculative branding-engine; superseded by simpler multi-tenant token-overlay approach |
| `backlog-22-concrete-planters-flagship` | Speculative product line; possibly redirected to Concrete Creations cluster (12u) |
| `12f-3-vibe-sketchbook-tools-section` | Vibe sketchbook is internal-only; tools section deemed unnecessary |
| `12h-6-concrete-ecommerce-scaffold` | Superseded by `12u-cc-repo-bootstrap` (separate repo approach instead of in-monolith scaffold) |
| `12j-doc-design-md-weights-self-contradiction` | False positive in doc-coherence audit (per AI_ORCHESTRATION mention "10 false-positive 12j units denied (clean signal)") |
| `12j-doc-phantom-type-aliases` | False positive — same cluster as above |
| `12j-doc-deprecated-tokens-not-removed` | False positive — same |
| `12j-doc-component-padding-value` | False positive — same |
| `12j-doc-ghost-components-surface-grid` | False positive — same |
| `12j-doc-handoff-dead-space-tokens` | False positive — same |
| `12j-doc-react-stack-gap-keys` | False positive — same |
| `12p-test-llm-output-regression-suite` | Possibly superseded by daily synthetic in `.github/workflows/llm-daily-synthetic.yml` |

**Action**: FIX-021 should backfill `_denialReason` for each. **Most denials are 6 false-positive doc audits + 4 superseded-by-other-units + a few deliberately-deprioritized-features.** This is healthy denial rate (~4% of total) but the orphan reason fields are bad hygiene.

---

## Parked units library (in-flight blockers)

> 9 parked units. **Better hygiene than denials** — all 9 have detailed reasons in agentNotes.

| Unit ID | Parked reason | Unblocks when |
|---|---|---|
| `backlog-4-strict-type-polymorphism` | "Parked until after doc polish settles. Focus on component prop interfaces with union or generic polymorphism." | After doc polish phase closes |
| `backlog-5-flush-code-review` | "Parked. Intended as a pre-v1 sweep. Target: components added in phases 8s/8t/9d without a dedicated review pass." | Pre-v1 release window |
| `backlog-6-ai-optimized-context-jsdoc` | "Parked. Propose a standard @ai-hint tag format before rollout. Example: @ai-hint Use with Stack for vertical layout groups." | After @ai-hint format spec ratified |
| `backlog-7-incubator-visual-diff-gallery` | "Parked. Requires stable VRT baseline (10o-10). Renders stored diff PNGs from test-results/ as a gallery." | After VRT stability locks (10o-11 closed this session — possibly unblocked) |
| `backlog-8-case-study-auto-journaling` | "Parked. This is a pipeline-to-content bridge. Agent commits generate structured events; a post-processor builds the gallery blocks." | Possibly already realized by `docs/CASE_STUDY_JOURNAL.md` (verify) |
| `backlog-10-theme-css-legacy-cleanup` | "Parked. Run a diff between theme.css resolved values and tokens.ts. Flag any property not traceable to a token." | Anytime — sonnet pod work |
| `backlog-15-orphan-circular-dom-budgets` | "Parked. Three sub-tasks: (1) Knip sweep, (2) circular dep check via madge, (3) DOM budget in Playwright. Tackle as a single unit when ready." | Anytime — sonnet pod work, T2-T3 |
| `12v-token-system-modes-beyond-light-dark` | "Reduced-motion already has a separate validator path. Architectural decision needed: how high-contrast/sepia/reduced-motion modes compose with multi-tenant token overrides. Requires design+spec session." | After architectural decision session |
| `12n-api-monorepo-workspace-split` | "Multi-day architectural shift; needs Opus plan-first; 4 prior aborts." | After explicit Adrian ratification + opus plan-first session (per Action Plan Priority 2 #7) |

**Action**: Parked-with-reason is good hygiene. Two units potentially unblocked by recent work:
- `backlog-7` (VRT stability fix `10o-11` landed)
- `backlog-8` (CASE_STUDY_JOURNAL.md exists — confirm if active or stale, per FIX-025)

---

## SYSTEMS-LOG.md analysis (304KB / 158 entries / 2026-04-02 onwards)

> Append-only governance ledger. Each entry: Architectural Snapshot table + Intent & Execution narrative + Health Snapshot.

**Volume**:
- April 2026: **108 entries** (2026-04-02 to 2026-04-24 active)
- May 2026: **52 entries** so far (through 2026-05-03)
- Average: ~5 entries/day during active periods

**Top focus categories**:
- `pipeline, governance` — 60 entries (38%) — orchestration / agent infra changes
- `docs chrome` — 40 entries (25%) — doc-site shell + layout work
- `token explorer, interaction architecture` — 10 entries
- `layout` — 10 entries
- `tokens` — 6 entries
- `token governance, layout hierarchy` — 6 entries
- `typography` — 4 entries
- `documentation primitives, table grammar` — 4 entries
- `documentation primitives, preview grammar` — 4 entries
- `tables` — 3 entries
- Miscellaneous — 11 entries

**Health-violation trend** (visible in numbers, partial sample):
```
Initial:    701 (2026-04-02 first snapshot)
Day 1-5:    555 → 460 → 458 → 462 → 452 → 452 → 455 → 457 → 457 → 457 → 457 → 381
Mid-period: 0 (sustained ~25 snapshots)
Late:       5 5 5 5 0 0 2 0 2 2 4 9 0 1 0 1
```
**Trend interpretation**: Steady decline through April (701 → ~460 → 0). Sustained zero through mid-period. Recent uptick (5, 5, 9, etc.) suggests new work introducing minor violations being caught and cleaned. **Health metric is doing its job.**

**Recent activity (2026-05-03)**: System health synchronization snapshots are firing every few minutes — likely an automated cron writing on file changes. Orchestration claim/done events also captured.

**Insight**: SYSTEMS-LOG.md is genuinely append-only and actively maintained. **🌐 INDUSTRY-PATTERN with substantial discipline — most teams' "systems log" is a stale wiki page.** ~5 entries/day demonstrates real governance discipline.

---

## Polish considerations (properly weighted, not dismissed)

> Polish is a Level-4-→-Level-5 differentiator, not a Level-3-→-Level-4 unlock. Do polish AFTER higher-leverage work, but DO it — accumulating polish debt erodes the system's "agency-platform-ready" claim.

### Polish items currently tracked

| Item | Severity | Source | Action |
|---|---|---|---|
| 28 TODO/FIXME markers (13 src + 15 scripts) | Low | Tech-debt-ledger | Quarterly sweep: triage each, close or convert to issue |
| 27 `eslint-disable` directives in src | Low-Medium | Tech-debt-ledger | Audit each — distinguish legitimate from stale; document the legitimate ones inline |
| 7 `@ts-ignore` family directives | Medium | Tech-debt-ledger / FIX-005 | Convert to `@ts-expect-error` with reason where legitimate; eliminate the rest |
| 123 HDS exemption markers (`hds-bypass`, `spacing-ok`, etc.) | Medium ⚠ | Tech-debt-ledger | High count suggests bypass overuse. Per-rule scope landed (12g-6 ✅); audit growth rate |
| 5 test `.skip`/`.todo`/`.only` | Low | Tech-debt-ledger | Confirm zero `.only` (CI-leak risk); document `.skip`/`.todo` purpose |
| MEMORY.md index drift (22 listed, 31 actual) | Low | FIX-029 | Auto-regenerate or one-time manual sync |
| `[cite_start]` markers in AI_ORCHESTRATION.md | Cosmetic | FIX-026 | Strip or convert to functional links |
| Two parallel ADR taxonomies | Low | FIX-031 | Consolidate into `docs/architecture/ADR-NNNN` |
| `inspirations.json` placeholder content | Low | FIX-030 | Back-populate from SIGNAL.md inspirations section |
| AI_ORCHESTRATION.md Phase 12 Tasks 37/38/39 marked `[ ]` while orchestration.json parks them | Low | Drift-debt | Reconcile to single source of truth (orchestration.json wins) |
| `checks-hooks-triggers-inventory.md` says `--max-warnings=210`, actual 0 | Low | FIX-023 | Update doc |

### Polish items NOT yet tracked (proactive — surface for future)

- **Inconsistent commit message format**: scan recent commits — are conventional commits (`feat()`, `fix()`, `chore()`) consistently used? If yes, document; if no, gradually migrate or document acceptable variants.
- **Lockfile churn**: `pnpm-lock.yaml` size + churn rate. Massive lockfile diffs on small dep changes suggest pinning issues.
- **README.md polish**: is the top-level README inviting for someone who just landed on the GitHub page? (Even though it's currently solo + not public, ratchet for future.)
- **`.env.example` completeness**: all required env vars documented? (We have HDS_BRIDGE_SECRET, MOONSHOT_API_KEY, GROQ_API_KEY, FIGMA_PERSONAL_ACCESS_TOKEN, FIGMA_FILE_KEY, possibly OPENAI_API_KEY — verify each is in .env.example)
- **License clarity**: top-level LICENSE file present? Per-package licenses when monorepo split lands?
- **Fonts catalog vs licensing**: `docs/architecture/font-licensing.md` covers Clash Display etc. — is the actual font usage in the repo aligned? (Atkinson Hyperlegible Next mentioned in AI_ORCHESTRATION; verify reference vs use.)
- **Localization-readiness**: even if i18n is denied (`10p-1-rtl-ltr` denied), are any hard-coded English strings inappropriately load-bearing for future i18n? (Low priority but rising as multi-tenant grows.)
- **Browser-support statement**: do we have a documented browser support policy? (Currently chromium-only test coverage — but what's the *user-facing* support claim?)
- **Versioned docs**: blocks on monorepo split (P2 #7 in action plan), but the polish item is "for v1, archive snapshot of docs site"
- **Public API change-log discipline**: even pre-monorepo, `docs/api/api-baseline.json` exists — is it actually compared against on PRs? FIX item.
- **Naming consistency** in agent infrastructure: hermes-unit / kimi-agent / haiku-agent — should these converge to a common naming pattern (`agents/<runner>.mjs`)? Pre-monorepo, low priority.

### Polish principle

**The "no aspirational guardrails" memory applies to polish too**: don't write polish rules without enforcement. If there's a TODO budget, codify it (`scripts/audit-todos.mjs` warns at >30 src TODOs). If there's a bypass-marker cap, codify it. Polish without enforcement decays.

**Polish cadence recommendation**: Quarterly polish sweep — one focused day per quarter to triage TODOs, audit bypass-markers, refresh stale documentation, prune dead code. Schedule it; don't let it become aspirational.

---

## Audit roadmap — sources to scrutinize

*(Top-to-bottom plan. Each item gets a structured section appended below this doc once audited. Don't fix anything during audit — capture only.)*

| # | Source | Audit questions |
|---|---|---|
| 1 | `telemetry/pod-runs.jsonl` + `telemetry/pod-runs.mjs` writer | Schema (and version field?), recent record completeness, jq parse errors, who reads it, is it ever queried? |
| 2 | `docs/security/agent-audit-log.jsonl` + `docs/security/audit-logger.mjs` | Format, recent entries, security-review consumer, retention |
| 3 | `docs/SYSTEMS-LOG.md` | Last update, content depth, who maintains |
| 4 | `scripts/audit-*.mjs` (all 8+) | Per script: what it audits, output destination, wiring (cron? pre-commit? manual?), schedule |
| 5 | `src/app/data/*.json` (commit-history, health-history, roadmap, token-audit-report, component-api, used-icons) | Writer, freshness, consumer page in app, structure |
| 6 | `public/hds-manifest.json` + `public/llms.txt` | Schema vs reader, freshness, regen trigger |
| 7 | `docs/findings/` | All audit reports written to date; index needed |
| 8 | `docs/ai/orchestration.json` | Per-unit completeness; how many units have agentNotes vs no notes; abort distribution |
| 9 | `docs/ai/AI_ORCHESTRATION.md` (legacy phase log) | Still current? archive? |
| 10 | `test-results/` + `tests/visual.spec.ts-snapshots/` | Baseline coverage by route; flake rate by test |
| 11 | `.husky/pre-commit` | Full inventory of gates wired |
| 12 | `eslint.config.mjs` | Rules wired, baselines, suppressions |
| 13 | `hirobius.tokens.json` + tailwind config | Token coverage; descriptions present; orphan tokens |
| 14 | `/tmp/hermes-overnight-*.log` and `/tmp/supervisor.log` | Persistence beyond session; recent run history |
| 15 | `.claude/worktrees/` | Stranded branches with un-merged commits; cleanup needed |
| 16 | `docs/ai/AGENT_GUIDELINES.md` | Recent updates, completeness vs CLAUDE.md |
| 17 | `docs/ai/AUTONOMOUS_BUILD.md` | Architecture as documented vs reality (drift?) |
| 18 | `docs/ai/MULTI_AGENT_OVERNIGHT.md` + `PROMPT_TEMPLATES.md` | Prompt templates in use vs ones referenced |
| 19 | `clients/<tenant>/` directories (3 active: lilac-insure, the-ranch-foundation, prospect-001) | What's tracked per client; signal density |
| 20 | `docs/security/controls.md` | Exists? content if so |
| 21 | Memory files in `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/` | Index completeness; stale entries; coverage gaps |

---

## Display ideas

*(Captured in passing. Build later.)*

**For `/ops` dashboard**:
- **Burn-down velocity chart**: done units over time, with annotated drops/spikes (e.g. WSL suspend gap, sonnet-pod batch wins).
- **Active processes panel**: hermes loops, worktrees, claude sessions, dev server, supervisor cron — replaces `pgrep` + `ps aux` archaeology.
- **Abort taxonomy donut**: aborts per category (transport / validation-flake / missing-dep / ambiguous-spec / ratification-gate). Click-through to specific incidents.
- **HITL escalation panel**: units flagged "needs ratification" or "HITL" with one-click accept/defer/grill.
- **Worktree stranding count**: live count of `.claude/worktrees/agent-*` branches with un-merged commits matching unit-id pattern. Banner when > 0.
- **Spend-vs-throughput meter**: $/unit-done over last N units, by model.
- **Win-rate per pod type**: sonnet vs hermes-qwen vs opus over time.

**For Hirobius case study (homepage)**:
- **Honest scorecard**: "+29 units in 5 hours; ~20% budget waste from worktree stranding; recovered via manual cherry-pick" — the *honesty* is the differentiator from typical portfolio puffery.
- **Multi-tenant pipeline diagram**: tokens → figma library → per-tenant masters → multi-brand demo. Closed loop visualization.
- **Failure-to-fix vignette**: `12v` Math.random() story (5 qwen aborts → 1 sonnet root-cause → 1-line fix). Concrete, specific.
- **Tooling timeline**: every new script/spec/page born during the build, dated. Shows the system getting more capable.
- **"Read the source"** link: SIGNAL.md itself published as a static page. The rawness IS the artifact.

---

## Next actions

*(Ordered by leverage, but explicitly per Adrian's directive: capture-not-fix today.)*

1. **[capture]** Run audits #1–#10 in [audit roadmap](#audit-roadmap--sources-to-scrutinize), append findings as new sections to this doc. Don't fix anything; just enumerate.
2. **[capture]** Generate `docs/signal/signal.json` from this doc as a structured mirror once enough sections have stabilized. Schema: `{wins:[], failures:[], decisions:[], deps:[], tooling:[], loops:[]}` with refs to commit SHAs and unit IDs.
3. **[capture]** Walk the existing memory files (`~/.claude/projects/.../memory/*.md`) and back-port any signal that should live in this canonical doc instead.
4. **[plan]** Phase planning session later today: convert the [Proposed improvements](#proposed-improvements-ranked-by-leverage) into orchestration units; rank for next sprint.
5. **[display]** Once SIGNAL.md is reasonably populated, sketch the `/ops` widgets and the case study sections that consume it.

---

*This file is append-only. To strike out an obsolete claim, wrap it in `~~strikethrough~~` and add a follow-up entry citing what changed and why. Never delete history — the changes are part of the signal.*
