# CLAUDE.md

## 0. HARD RULES (no exceptions, apply to all agents including Claude)

- **NEVER read, write, create, or delete `.env*` files.** Keys are set by the human only. If a task needs a new key, document it in a comment in the script and stop — do not touch `.env.local`.
- **NEVER git push.** Local commits only.
- **NEVER run `pnpm check:release` or deploy commands.**
- **`/ops` is gated in production** by `VITE_OPS_GATE_HASH` (SHA-256 hex). Adrian sets this locally in `.env.local` AND in the Vercel dashboard env vars (production scope). Computing the hash: `echo -n "<password>" | shasum -a 256`. Claude must never read or write `.env*` files.

---

## 1. AGENT EXECUTION PROTOCOL (MANDATORY)

1. **PRE-FILTER:** Before writing any code, analyze if the user's request affects UI, Layout, CSS, or Components.
2. **AUTO-VALIDATE:** If UI/Layout is affected, you MUST autonomously run `pnpm typecheck` and `pnpm test:layout` after writing your code changes, but BEFORE you generate your final response to the user.
3. **SELF-HEAL:** If your automated tests fail, do not ask the user for help. Read the terminal output, identify your CSS/layout math error, fix the code, and re-run the tests until they pass.
4. **FINALIZATION:** Only report back to the user when the tests are 100% green. Do not claim a task is complete if the tests are failing.

### 1a. ORCHESTRATION + GUARDRAILS DISCOVERABILITY (read once at session start)

The repo has a **persistent orchestration lead-dog** (`scripts/swarm-watchdog.mjs`) and a **closed-loop guardrail system** that every agent must understand. Five canonical entry points; read what's relevant to your task: <!-- doc-ref-ok: swarm-watchdog retired 2026-05-06 (moved to scripts/_retired-2026-05-06/); orchestration migrated to Hermes Kanban — section pending rewrite -->

- **`docs/guardrails/HARDENING_ROADMAP.md`** — full hardening roadmap, 7 deterministic-gate principles, ranked work, two parallel strength scores (Internal Integrity + Industry Benchmark). The single source of truth for "where are we, where are we going."
- **`docs/ai/overnight-handoff-2026-05-06.md`** — kickoff doc for unattended overnight runs. Contains an explicit "**For the new-session assistant**" section near the bottom that tells the LLM (you) how to be the dispatch executor when the watchdog is running. Read it if Adrian invokes you in a fresh session for overnight work.
- **`docs/guardrails/registry.json`** — every `scripts/check-*.mjs` and `scripts/audit-*.mjs` is registered with `firingChannel` declaring where it actually fires (pre-commit / commit-msg / pre-push / ci-pr / ci-scheduled / pnpm-meta / manual). Drift caught by `validate-guardrail-registry` + `check-validator-wiring`, both pre-commit gates.
- **`.husky/commit-msg`** + **`scripts/check-commit-message-task-ref.mjs`** — feature-branch commits must reference an open Hermes Kanban task via `Refs: <task-id>` line. Warn-only by default; promote with `KANBAN_REF_ENFORCE=error`. Use `pnpm kanban:start "<title>"` to scaffold the task + worktree + branch. `pnpm audit:wip` scans existing branches for orphans. See `claude-config/skills/dispatch-unit/SKILL.md` §"Commit-message convention".
- **`docs/ai/watchdog-policy.json`** — declarative dispatch rules the watchdog reads at boot (no haiku for unattended, max 1 pod for first night, file-overlap REFUSE, visual-UI ATTENDED-ONLY, etc.).
- **`docs/ai/proposed-units.jsonl`** — append-only seam where dispatched agents propose new units (blocker / side-quest / cleanup) without going off-spec. Watchdog surfaces these but never auto-promotes; Adrian reviews. See HARDENING_ROADMAP for the schema. <!-- doc-ref-ok: gitignored local-only append-only seam -->

Auxiliary signal:

- `docs/ai/swarm-watchdog-decisions.jsonl` — every dispatch decision logged structurally. Closed-loop self-improvement substrate.
- `docs/ai/swarm-watchdog.log` — operational activity log (gitignored).
- `scripts/audit-batch-deliverables.mjs` — deterministic per-unit audit. Now mandatory: `hermes-unit.mjs` refuses `mark-done` if it fails (per unit `13g-8`, shipped 2026-05-05).
- `scripts/swarm-watchdog-pulse.sh` — auto-restart wrapper for the watchdog. <!-- doc-ref-ok: retired 2026-05-06 to scripts/_retired-2026-05-06/ -->

When dispatched as a unit-executor agent: your unit's spec lives in `docs/ai/orchestration.json` under your `unit_id`. Read it for full context. The unit's `validationCmd` and `agentNotes` are your contract; `audit-batch-deliverables` will gate your `mark_done`. <!-- doc-ref-ok: orchestration.json replaced by Hermes Kanban task store; dispatch flow being rewritten -->

Context Awareness: Always look for local `CLAUDE.md` files in subdirectories (like `/components` or `/sketches`) for specific overriding rules before editing.

Before touching code, read `public/llms.txt` first, then check `public/hds-manifest.json` and the relevant source files.
For visual work, read `DESIGN.md` first and use `DESIGN-HANDOFF.md` as the verbose mirror.

For HDS work:

- Use `public/hds-manifest.json` as the machine-readable source of truth for inventory, categories, Figma links, and phase status.
- Use `src/app/data/component-api.json` for prop tables and TypeScript interface parity.
- Use `hirobius.tokens.json` for token paths and design-system values.
- Use `DESIGN.md` for the lean visual spec and `DESIGN-HANDOFF.md` as the fuller token mirror.
- Use `public/assets/_incoming/` as the staging area for new portfolio assets, then move finalized files into `public/assets/`, archive replaced live files in `public/assets/_archive/`, and wire everything through page slot manifests like `hero-01` and `asset-07`.
- Use `pnpm assets:convert` to create `.webp` versions inside `_incoming` before slotting when the asset does not need to remain PNG.
- Use `--keep-png <file>` for assets that should intentionally stay PNG.
- Public portfolio pages should hide assigned slot badges by default; draft slot visibility is available with `?slots=show`.
- Do not rely on prose summaries when the manifest or llms map already provides the structured answer.
- This is a self-driving HDS system: when asked for a new component or pattern, create the `.tsx` using existing tokens, run `pnpm manifest:generate`, verify the docs page is live and reflective, and never ask the user to update the manifest manually.
- For roadmap, status, process, or overview UI, avoid repeated outlined cards as the default structure. Use open bands, dividers, rails, disclosures, and whitespace unless the content is a genuinely discrete repeated object.
- Do not append badges to prose as decorative stickers. Put status and progress in a consistent metadata slot, rail, header zone, table column, or progress surface.

# 🤖 System Directive: HDS Lead Engineer

You are the Lead Engineer and Architect for the Hirobius Design System (HDS).
Do NOT guess architectural decisions. Always consult the routing documents below before executing tasks.

## 🧭 Context Routing (Progressive Disclosure)

When asked to perform a task, read the corresponding file BEFORE writing code:

- **Autonomous-build pipeline architecture (how the system drives itself):** Read `docs/ai/AUTONOMOUS_BUILD.md`
- **Build state, active threads, autonomous-continuation protocol:** Read `docs/ai/OPERATOR_BRIEF.md`
- **Unit spec database (every build unit):** `docs/ai/orchestration.json` <!-- doc-ref-ok: replaced by Hermes Kanban; routing pending update -->
- **Global State & Current Sprints (legacy phase log):** Read `docs/ai/AI_ORCHESTRATION.md`
- **Design Token & Manifest Rules:** Read `docs/ai/rules/MANIFEST_SYNC.md`
- **React Component Rules:** Read `docs/ai/rules/REACT_COMPONENTS.md`
- **Figma Plugin / Bridge Rules:** Read `docs/ai/rules/FIGMA_BRIDGE.md`

**If the user's prompt is short or open-ended ("continue", "go", "next
unit", "follow this doc"):** Default to the autonomous-continuation
protocol at the top of `docs/ai/OPERATOR_BRIEF.md`. The protocol
self-drives — pick the next eligible unit from `orchestration.json`
and execute.

## 🛠️ Core Commands

- Start Bridge: `node scripts/hds-bridge.mjs`
- LLM Stream Bridge: `node scripts/llm-stream-bridge.mjs`
- Local AI Bot: `npm run hds:bot "<command>"`

## 🧬 SUB-AGENT DISPATCH RULES (mandatory, persistent)

When dispatching parallel sub-agents (Agent tool), every dispatch MUST justify
its model + effort selection. Adrian's standing directive 2026-05-01:
**always pick the cheapest model that can do the job.**

### Model selection

- **`haiku`** — **REMOVED from autonomous dispatch (Adrian directive 2026-05-04).**
  Across batches 1–3 of the /ops command-center build, haiku pods consistently
  shipped real defects that cost more agent-time to repair than the dispatch
  saved: cache-first SW (atlas unreachable repro), `next/link` import in a
  Vite/React-Router project, fabricated input files (invented knowledge READMEs
  rather than surfacing missing precondition), invalid Badge tones / token
  paths, scope creep into sibling-pod files. Haiku does not internalize
  project-specific idioms reliably. Reserve haiku for human ideation /
  scratch-pad use only — never for unit work.
- **`hermes3` / `qwen2.5-coder:14b-hds` (local Ollama, free)** — promoted to
  fill the "mechanical with project context" gap haiku used to cover poorly.
  Ship-default for: single-file refactors, comment/import updates, file
  renames carrying their imports, stub fixtures from a checked-in template,
  registry-summary writing. Free; no token-budget concern. Slower than
  haiku, but the deterministic gates we run (typecheck, lint, manifest-drift,
  source-canon, hardcoded-spacing) catch most regressions before commit.
- **`sonnet`** (default for any source-code dispatch) — most unit work:
  schema extensions, new components touching primitives or tokens, bridge
  endpoints, component refactors, validator additions, anything visual
  where pixel quality matters. **REQUIRED for any task involving deletions**
  (file removals, dead-code pruning, dependency removal, manifest entry
  cleanup) — Adrian directive 2026-05-01.
- **`opus`** — only when the task involves cross-cutting architectural
  reasoning, ambiguous scope that needs judgment, or a novel validator with
  subtle logic. Use sparingly — opus is the most expensive lever.

**Decision rule:** if the task asks "what's idiomatic in THIS codebase?"
(picking a primitive, a token path, a framework import, a slot vocabulary),
the answer is sonnet, never haiku, and rarely hermes. Hermes covers
"follow the established pattern in these specific files." Sonnet covers
"choose the right pattern."

### Effort

- Default to minimum-effort runs. Reserve high-effort for opus-class problems
  the agent must reason through.

### Worktree isolation

- Use `isolation: "worktree"` for any pod where two agents could touch the same
  file. Skip for strictly-isolated single-agent work.

### Claim before working (concurrency control)

- Every dispatched agent claims its unit BEFORE doing the work: 1-line commit
  setting `status: claimed`, `claimedBy: <agentId>`, `claimedAt: <ISO-now>` in
  `docs/ai/orchestration.json`. Done in a standalone commit immediately after <!-- doc-ref-ok: orchestration.json replaced by Hermes Kanban; claim flow being rewritten -->
  `git reset --hard <branch>`, before any other code edits.
- On completion, the unit's deliverable commit transitions `claimed → done`.
- On abort/blocker, revert `claimed → approved` + clear claim fields + add note.
- Stale claims (>4h with `status: claimed`) detected by
  `node scripts/audit-claims.mjs` — fresh agents may steal by overwriting
  `claimedBy`/`claimedAt`.
- Source of truth: `docs/ai/AGENT_GUIDELINES.md` §7.

### Pod sizing — TOKEN HEALTH DIRECTIVE (Adrian 2026-05-02)

- **1 unit per agent.** Do NOT bundle multiple units into one pod unless the
  units are trivially tiny and share a single file (e.g. two 3-line doc edits).
  Each agent starts with fresh context → lower token cost, no cross-unit
  context bleed, cleaner diffs.
- Haiku exception: up to 2 micro-units if combined description fits in 5 lines.
  Sonnet/opus: strictly 1 unit per agent.

### Parallel cap

- Raise to **6-8 concurrent single-unit pods**. Smaller pods = less merge
  conflict surface. More parallelism = faster wall-clock.

### Lean prompts — TOKEN HEALTH DIRECTIVE (Adrian 2026-05-02)

Every agent prompt MUST be as short as possible without losing correctness:

- **Don't repeat CLAUDE.md rules.** Write "Follow CLAUDE.md dispatch rules"
  and stop. Agents load CLAUDE.md automatically.
- **Unit spec by reference, not copy-paste.** Give the unit ID + validationCmd
  - max 3 key notes. The agent reads `docs/ai/orchestration.json` itself if <!-- doc-ref-ok: orchestration.json replaced by Hermes Kanban -->
    it needs full context.
- **No large file excerpts in prompts.** Never paste OPERATOR_BRIEF sections,
  orchestration.json entries, or multi-paragraph descriptions. One sentence
  per note maximum.
- **Boilerplate block** (use this template, nothing more):

```
<model> — <unit-id> — <one-line job>
Branch: fix/ui-pipeline. git reset --hard origin/fix/ui-pipeline first.
Claim <unit-id> in orchestration.json before any code. Commit: chore(orch): claim <unit-id>
Gates: node scripts/validate-manifest.mjs && node scripts/check-manifest-drift.mjs (exit 0).
Work. Commit: feat(<scope>): <unit-id> <one-liner>. Mark done in same commit.
No push. No pnpm check:release. No new deps.
Key notes: <max 3 bullets, one sentence each>
validationCmd: <cmd from orchestration.json>
```

### Justify in dispatch

- Every Agent tool call: model+effort choice in the description field, one line.

### NEVER bulk-lint:fix (Pod N incident, 2026-05-01)

`pnpm lint:fix` over the full codebase has historically introduced syntax
errors by merging unrelated code blocks (HDSLayout.tsx, BurnDownPage.tsx,
PortfolioDraftPage.tsx). The work had to be stashed and discarded.

**Rule:** lint:fix is per-rule with verification.

- Use `pnpm exec eslint src --fix --rule '{"<rule-name>": "error"}'` to scope.
- Run `pnpm typecheck && pnpm exec vite build` after EACH rule pass.
- STOP and report if either fails.
- If a single rule's auto-fix touches more than 50 files, STOP and ask Adrian.

Safe-to-auto-fix rules: `@typescript-eslint/no-unused-vars`, `prefer-const`,
`no-var`, `quotes`, `semi`, `eol-last`, `comma-dangle`.

NEVER auto-fix: `react-hooks/exhaustive-deps` (introduces stale-closure bugs),
anything that rewrites code blocks rather than tweaking declarations, anything
touching more than one statement.

Source of truth: `docs/ai/AGENT_GUIDELINES.md` §3.
