# Sub-Agent Prompt Templates

## Purpose

These are reusable preambles for Agent-tool dispatches. Copy a template, fill
the `{{placeholders}}`, dispatch. Each template encodes the universal preamble
plus class-specific rules.

Reference the template ID from your dispatch prompt so the audit trail is clear:
`Using template: research-and-report`.

---

## Universal Preamble

Every template below embeds this block verbatim. It MUST NOT be trimmed.

```
UNIVERSAL PREAMBLE — mandatory, do not omit

FIRST ACTION (before any other command):
  git reset --hard fix/ui-pipeline
  # or substitute the active source branch if different.
  # This ensures the worktree starts from a known-good base regardless of
  # whether isolation: "worktree" took effect (it has been unreliable).

ISOLATION CHECK (mandatory before EVERY commit):
  node scripts/dispatch-pod.mjs verify --base fix/ui-pipeline
  # Exit 0 = isolated, safe to commit.
  # Exit 1 = isolation did not take. ABORT — do NOT commit. Report back to
  # the parent agent so the dispatch can be re-tried or rescued. Letting a
  # commit through without isolation has caused empty / cross-pollinated
  # commits in past dispatches (see AGENT_GUIDELINES.md §2).

6 PRE-COMMIT GATES — all must pass before committing:
  1. pnpm typecheck
  2. pnpm lint
  3. node scripts/check-manifest-drift.mjs
  4. node scripts/check-binding-drift.mjs
  5. node scripts/check-source-canon.mjs
  6. node scripts/validate-manifest.mjs
  7. node scripts/validate-orchestration.mjs
  (Run in order; stop and report on first failure.)

NO BULK LINT FIX — Adrian directive, cross-ref AGENT_GUIDELINES.md §3:
  NEVER run `pnpm lint:fix` over the full codebase.
  Per-rule only: `pnpm exec eslint src --fix --rule '{"<rule>": "error"}'`
  Run `pnpm typecheck && pnpm exec vite build` after EACH rule pass.
  If a single rule touches > 50 files in one run, STOP and report to Adrian.

COMMIT FORMAT:
  <scope>(<area>): <unit-id> <one-line summary>

  <body — explain the why, not just the what>

  Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

DO NOT PUSH: Never push to remote without explicit Adrian instruction.
```

---

## Template 1: research-and-report

**Read-only audit — no code changes, no commits.**

### When to use

- Questions that span the codebase (surface-area scoring, cross-file drift).
- Drift detection that does not yet have a validator.
- Pre-implementation reconnaissance: surface the facts before writing code.
- Any time you want agent output that is a structured report, not a diff.

### Model

Sonnet (default) for broad codebase questions; haiku for narrow single-file
lookups where pattern matching is sufficient.

---

```
{{unit-id}} — research-and-report

Using template: research-and-report

{{PASTE UNIVERSAL PREAMBLE HERE}}

READ-ONLY: do not use Edit, Write, or commit. Output a report only.

TASK:
{{describe the audit question, files to scan, or drift surface to score}}

GROUNDING REQUIREMENT — per AGENT_GUIDELINES.md §4:
Every claim in your report MUST include one of:
  - Source of truth: <file:line>
  - Validator output: <command that was run>
  - Commit ref: <hash>
Do not assert facts about the codebase without a grounding ref.

REPORTING FORMAT:
- Bulleted findings, each with a grounding ref.
- Flag any claim you cannot ground as UNVERIFIED.
- Under 300 words unless explicitly asked for more.
- No prose summaries without grounding; no claims from memory.
```

### Verification checklist (for the dispatcher)

- [ ] Agent grounded each claim against a file:line / validator command / commit hash.
- [ ] No `UNVERIFIED` items remain in the report (or are explicitly accepted).
- [ ] No files were modified (git diff should be empty).

---

## Template 2: deletion-class

**Requires sonnet. Never dispatch with haiku.**

### When to use

- Removing files, directories, or assets.
- Dead-code pruning (removing exports, functions, types with no consumers).
- Dependency removal (`package.json` + lockfile surgery).
- Manifest entry cleanup (removing stale unit IDs from orchestration.json).
- Any task where the primary action is removal, not addition.

### Model

**Sonnet REQUIRED.** Adrian directive 2026-05-01: deletions need sonnet's
judgment to catch live consumers. The Pod 2 token-explorer near-miss validated
this rule — haiku removed an export that had 3 live consumers.

---

```
{{unit-id}} — deletion-class (sonnet required)

Using template: deletion-class

{{PASTE UNIVERSAL PREAMBLE HERE}}

DELETION PROTOCOL — mandatory steps before any removal:
  1. grep for live consumers FIRST:
       grep -rn "{{target-symbol-or-filename}}" src/ --include="*.ts" --include="*.tsx"
     Do not proceed with deletion if consumers are found; report them instead.
  2. After confirming zero live consumers, perform the deletion.
  3. Run `pnpm exec vite build` after the deletion in addition to the 6 gates.
     (pnpm typecheck alone does NOT catch Vite-only import errors — Pod N incident.)
  4. Run all 6 pre-commit gates; confirm clean.
  5. Commit with the deletion-class commit format.

TASK:
{{describe what to delete, why it is safe to delete, and any known dependencies}}

DO NOT delete speculatively. If a consumer grep returns hits, stop and report.
```

### Verification checklist (for the dispatcher)

- [ ] Live-consumer grep was run and returned zero hits before deletion.
- [ ] `pnpm exec vite build` passed after deletion.
- [ ] All 6 pre-commit gates passed.
- [ ] Commit message lists every file deleted.

### Reporting format

Commit hash + list of deleted files + consumers grepped (confirm zero) + gate
summary.

---

## Template 3: additive

**Haiku for mechanical "follow the pattern" work.**

### When to use

- Registry-summary writing (adding entries, not restructuring).
- Baseline regen (running a generator script, committing the output).
- Simple fixture additions (adding a new test case to an existing fixture).
- Single-pattern scrubs: emoji removal, comment normalization, quote style on
  a single file.
- File moves with no edits to file content.

### Model

Haiku. If the task turns out to require semantic judgment (not just pattern
following), stop and re-dispatch as sonnet.

---

```
{{unit-id}} — additive (haiku, mechanical)

Using template: additive

{{PASTE UNIVERSAL PREAMBLE HERE}}

SCOPE RULE:
Limit yourself to the single file or pattern described below.
Do NOT generalize the change to other files unless explicitly asked.
If you notice a similar pattern elsewhere that "should also be fixed",
note it in your report but do NOT fix it — that is a separate unit.

TASK:
{{describe the exact single file or pattern to add/scrub/move, with
  expected before/after state}}

VERIFICATION:
After the change, run all 6 pre-commit gates and confirm the diff is
mechanical — no semantic drift, no restructured logic, no added imports
beyond what the pattern strictly requires.
```

### Verification checklist (for the dispatcher)

- [ ] All 6 pre-commit gates passed.
- [ ] Diff is mechanical (no logic changes, no new imports beyond the pattern).
- [ ] Scope did not drift to unrelated files.

### Reporting format

Commit hash + files-changed count. Under 50 words.

---

## Template 4: architectural-opus

**Full reasoning + decision doc. Use sparingly — opus is the most expensive lever.**

### When to use

- Cross-cutting architectural decisions that touch more than 2 clusters.
- Ambiguous scope where the right approach is genuinely unclear and requires
  judgment (not just "follow the pattern").
- Novel validators with subtle logic (e.g. a new AST-walk rule, a new
  cross-manifest constraint).
- Units explicitly tagged `opus` in orchestration.json.

Do NOT use opus for ordinary unit work. If you are tempted to use opus for a
well-scoped component refactor, use sonnet instead.

### Model

Opus, minimum effort for most tasks. High effort only when the agent must
reason through novel architectural trade-offs.

---

```
{{unit-id}} — architectural-opus

Using template: architectural-opus

{{PASTE UNIVERSAL PREAMBLE HERE}}

DECISION DOC FIRST — before writing any code:
Write docs/architecture/{{unit-id}}-decision.md capturing:
  - Context: what problem is being solved and why now.
  - Decision: the chosen approach.
  - Alternatives considered: at least 2 alternatives with why-rejected.
  - Consequences: what gets easier, what gets harder, what is accepted risk.
  - Status: "accepted" (architectural-opus units are ratified at dispatch time
    unless the prompt says otherwise).
  - References: file:line, validator commands, commit refs.

Do not write code until the decision doc is committed.

TASK:
{{describe the architectural problem, scope, and constraints}}

VALIDATION (in addition to 6 gates):
- Decision doc exists at docs/architecture/{{unit-id}}-decision.md.
- Code matches the decision recorded in the doc.
- All 6 pre-commit gates pass.
```

### Verification checklist (for the dispatcher)

- [ ] Decision doc exists at `docs/architecture/{{unit-id}}-decision.md`.
- [ ] Decision doc's chosen approach matches the code that was written.
- [ ] All 6 pre-commit gates passed.
- [ ] The why-rejected section lists at least 2 alternatives.

### Reporting format

Decision doc path + commit hash + 2-sentence summary of the trade-off made.

---

## Template 5: plan-only-report

**Writes an ADR, no code edits. Sonnet default; opus for cross-cutting architecture.**

### When to use

- Pre-implementation planning for opus units (ratify the plan before dispatching
  the build agent).
- Converting Adrian's verbal direction into a structured, ratifiable plan.
- Recording an architectural decision without yet shipping code (captures intent
  for future agents to execute).
- Any case where the output is a decision document, not a diff.

### Model

Sonnet (default) for scoped architectural decisions. Opus when the decision
spans multiple clusters or requires genuine cross-cutting reasoning.

---

```
{{unit-id}} — plan-only-report

Using template: plan-only-report

{{PASTE UNIVERSAL PREAMBLE HERE}}

DO NOT edit code or run validators (there is nothing to validate — output is
documentation only).

OUTPUT: a single new file at docs/architecture/{{topic}}-decision.md
following the ADR template below:

---
# {{title}}

## Context
{{why this decision needs to be made, background}}

## Decision
{{the chosen approach}}

## Consequences
{{what gets easier, what gets harder, accepted risks}}

## Status
proposed

## Alternatives considered
{{list each alternative + why rejected}}

## References
{{file:line refs, validator commands, commit hashes}}
---

IMPORTANT: Status MUST be "proposed". Do not set it to "accepted" — that
requires explicit Adrian ratification. The plan-only-report template is for
capturing intent, not for ratifying decisions unilaterally.

TASK:
{{describe the decision or plan to document}}
```

### Verification checklist (for the dispatcher)

- [ ] ADR file exists at the declared path.
- [ ] Status field is `proposed` (not `accepted`).
- [ ] Every reference is grounded (file:line / command / commit hash).
- [ ] No code files were modified (git diff touches only the new ADR).

### Reporting format

ADR path + commit hash (for the ADR file addition) + 2-sentence summary of the
proposed decision.

---

## Template 6: autonomous-burndown

**Self-pacing loop that drains the orchestration queue. Use this for overnight
multi-window dispatch.** Pairs with `docs/ai/MULTI_AGENT_OVERNIGHT.md` (full
protocol) and `scripts/orchestration-watcher.mjs` (must be running before
agents dispatch).

### When to use

- Overnight burndown across 3+ parallel Claude windows.
- Filling spare capacity between operator-driven sprints.
- Any time you want an agent to keep grabbing work without re-prompting.

### Model

Auto-selected per-unit by the watcher. Each window's prompt should accept
whatever model the unit needs (`haiku` / `sonnet` / `opus`); the agent
dispatching child sub-agents reads the recommended model from
`ready-queue.json#eligible[i].model`.

### Required prerequisite

`scripts/orchestration-watcher.mjs` must be running on the host machine
before any window dispatches. Without it, `ready-queue.json` is stale and
agents will collide.

```bash
# Operator runs once before opening any windows:
node scripts/orchestration-watcher.mjs &
```

---

```
{{session-id}} — autonomous-burndown

Using template: autonomous-burndown
Session id: {{session-id}}   # e.g. session:fresh-2026-05-02-w5-a3
                             # convention: session:fresh-<YYYY-MM-DD>-w<window>-a<agent>

{{PASTE UNIVERSAL PREAMBLE HERE}}

CONTEXT:
You are one of N parallel Claude agents draining the orchestration queue
overnight. The full protocol lives in docs/ai/MULTI_AGENT_OVERNIGHT.md —
read it once if you have not. Coordination is via docs/ai/ready-queue.json,
maintained by scripts/orchestration-watcher.mjs (assume it is running).

YOUR LOOP — execute until a stop condition fires:

1. RESYNC
   git fetch origin
   git reset --hard fix/ui-pipeline   # or current source branch
   node scripts/dispatch-pod.mjs verify --base fix/ui-pipeline
       (skip the verify if running in the main worktree, not a sub-agent worktree)

2. SCAN
   Read docs/ai/ready-queue.json. If it does not exist or is stale (>5min
   old), the watcher is down — STOP and report to the operator.

   Pick the top entry from `eligible[]` whose `blockedFiles` do not appear
   in any other claim from `claimed[]` that is < 5 min old. If none qualify,
   sleep 120s and re-scan. After 3 empty scans (6 min total) AND no claimed
   units have moved in 10 min → queue is drained → write a final reconcile
   commit (chore(orch): reconcile after window {{N}} drain) and STOP.

3. CLAIM (mandatory before any other work)
   - Read orchestration.json, set the chosen unit's status=claimed,
     claimedBy={{session-id}}, claimedAt=<ISO-now>.
   - Run pre-commit gates (see §5 of MULTI_AGENT_OVERNIGHT.md).
   - Commit:
       chore(orch): claim <unit-id> for {{session-id}}
   - If pre-commit fails on schema violation in your edit, fix and retry.
     If it fails on unrelated baseline drift (lint, manifest), see ADJACENT
     DIRTY-TREE HANDLING below.

4. EXECUTE PER TIER
   The unit's tier is in ready-queue.json#eligible[i].tier (T1..T4).

   T1 mechanical (haiku):
     - Execute the work. No ledger entry needed.

   T2 standard (sonnet):
     - Execute. If you made a non-obvious call, append a ledger entry
       (docs/logs/AI_DECISION_LEDGER.md) before the deliverable commit.

   T3 architectural (sonnet):
     - WRITE A LEDGER ENTRY FIRST (decision + alternatives considered +
       downstream ramifications + reversibility). Then execute. Ledger
       entry lands in the same commit as the deliverable.

   T4 strategic (opus + max effort):
     - Dispatch with model: 'opus' and the highest reasoning effort
       available. Adrian directive 2026-05-01: T4 work justifies the
       max-thinking lever; do not skimp here.
     - WRITE A LEDGER ENTRY FIRST.
     - Execute the unit at least far enough to UNBLOCK the next downstream
       unit (i.e. produce a coherent commit that flips dependent units to
       eligible). This is the critical T4 invariant: don't stop velocity.
     - If remaining scope is genuinely strategic (touches business model,
       brand, public-API breakage, multi-tenant data model) AND you cannot
       justify a sane default → set status=in-progress, prepend an
       agentNotes line "PUNT TO ADRIAN — <one-sentence reason>", commit
       what you have, and move on. The next agent skips in-progress units.
     - Punting is the EXCEPTION, not the default. Most T4 units finish
       T4 → done overnight.

5. PRE-COMMIT GATES (run in order, stop on first failure)
   pnpm typecheck
   node scripts/check-token-rebake-needed.mjs
       (if fail: pnpm tokens:build && stage public/hds-manifest.json)
   pnpm lint --max-warnings=$(grep max-warnings .husky/pre-commit | grep -oE '[0-9]+' | head -1) || true
   node scripts/check-manifest-drift.mjs
   node scripts/check-binding-drift.mjs
   node scripts/check-source-canon.mjs
   node scripts/validate-manifest.mjs
   node scripts/validate-orchestration.mjs

6. COMMIT (claimed → done in one deliverable commit)
   - In orchestration.json: status=done, completedAt=<YYYY-MM-DD>.
   - Stage your deliverable files explicitly (NOT `git add -A`).
   - Commit message:
       <type>(<scope>): <unit-id> <one-line>

       <body — explain the why>

       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>

7. CLEAN UP
   - `git status` should show only test-results/* untracked. If you see
     adjacent WIP that is not yours, leave it (per ADJACENT DIRTY-TREE
     HANDLING).
   - Loop back to step 1.

ADJACENT DIRTY-TREE HANDLING (Adrian directive 2026-05-01):

- WIP that matches another agent's active claim (claimedBy on a unit < 4h
  old) → DO NOT TOUCH. Stage your own files explicitly with `git add <path>`.
- Untracked test artifacts (test-results/, playwright-report/) → leave.
- Orphan WIP (no matching claim, no commit in 4h) → if obviously left over
  from a recently-done unit, `git checkout -- <path>`. Otherwise, log
  "[ORPHAN-WIP] <files>" in your run-log and leave for morning review.
- End-of-night invariant: morning git status shows only test-results.

STOP CONDITIONS (return control to operator):
- 3 consecutive units fail pre-commit with different errors.
- Repo enters mid-cherry-pick / mid-rebase / mid-merge state.
- Lint baseline jumps > 50 violations from session start.
- Queue empty + no claim activity for 10 min → write reconcile, stop.

NEVER:
- `git push` (Adrian directive — overnight is local only).
- Skip claim step (collides with peers).
- Bypass pre-commit hooks (--no-verify).
- Pre-claim more than 1 unit at a time (denies peers eligible work).
- Touch units with status=claimed by another session.

Begin.
```

---

## Quick reference

| Template | Model | Commits? | Primary output |
|---|---|---|---|
| `research-and-report` | sonnet / haiku | No | Bulleted report |
| `deletion-class` | sonnet (required) | Yes | Deleted files |
| `additive` | haiku | Yes | Added/scrubbed files |
| `architectural-opus` | opus | Yes | Code + decision doc |
| `plan-only-report` | sonnet / opus | Yes (ADR file only) | ADR at `docs/architecture/` |
| `autonomous-burndown` | per-unit (auto) | Yes (loop) | Drained queue + ledger entries |

All 6 templates embed: universal preamble · pre-commit gates · `git reset --hard fix/ui-pipeline` first action · no-bulk-lint:fix rule (AGENT_GUIDELINES.md §3) · commit format · no-push rule.
