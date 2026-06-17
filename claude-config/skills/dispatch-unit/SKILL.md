---
name: dispatch-unit
description: "Dispatch a Hirobius orchestration unit through the full claim→work→audit→mark-done lifecycle with the correct model tier, worktree isolation, and gate compliance. Use this skill ANY time the user says 'dispatch <unit-id>', 'pick up <unit-id>', 'run <unit-id>', 'work on <unit-id>', references a unit by its `13X-Y-name` ID, or asks to advance the orchestration queue. Always use this skill when running units from docs/ai/orchestration.json — never improvise the dispatch flow, since the audit-batch-deliverables gate (per 13g-8) will refuse mark-done if the schema or deliverables drift."
---

# Dispatch Unit — Hirobius Orchestration Lifecycle

> **Single source of truth for running orchestration units.** Codifies the pattern proven across the 13s-strength chain (5 units, 5/5 audit pass, 0 stranded claims).

## When to use

Use whenever the user wants to run a unit from `docs/ai/orchestration.json` — typical phrasings:

- "dispatch `<unit-id>`"
- "pick up `<unit-id>`"
- "let's work on `<unit-id>`"
- "knock out `<unit-id>`"
- "run the next safeForUnattended unit"
- "what's the highest-leverage unit available?"

Also use when:

- Resuming a session and the user wants to advance the orchestration queue
- The watchdog announced a `would-dispatch` decision and the user says "go" / "yes" / "proceed"
- Multiple units could run in parallel and the user wants the right ones picked

## When NOT to use

- Pure visual UI work where the user is observing in real time — do that attended; don't wrap in this skill's machinery.
- One-off scripts not tracked in `docs/ai/orchestration.json` — use the regular Agent dispatch flow.
- Anything `safeForUnattended: false` AND the user is not present — those need the user's eyeballs.
- Simple doc edits that don't have a unit — just edit them directly.

## Prerequisites the skill assumes

Read these files before dispatching anything (the skill assumes they exist):

- `docs/ai/orchestration.json` — unit database; `id`, `status`, `dependsOn`, `safeForUnattended`, `validationCmd`, `agentNotes`, `tier`, `model`, `effort`
- `CLAUDE.md` — §"SUB-AGENT DISPATCH RULES" (model tier rules: no haiku for unattended; sonnet default; opus only for cross-cutting reasoning; hermes for mechanical-with-context)
- `docs/guardrails/HARDENING_ROADMAP.md` — current cluster state
- `docs/ai/watchdog-policy.json` — declarative dispatch rules
- `scripts/audit-batch-deliverables.mjs` — the post-work audit (mandatory pre-`mark_done` per `13g-8`)
- `scripts/swarm-watchdog.mjs` — the orchestration lead-dog (may be running in background; respect its claims)

## Commit-message convention (since 2026-05-07)

Every commit on a feature branch must reference an open Hermes Kanban task via a `Refs: <task-id>` line in the commit body. The Phase 1 commit-msg hook (`scripts/check-commit-message-task-ref.mjs`, wired in `.husky/commit-msg`) warns when this is missing; promotes to error with `KANBAN_REF_ENFORCE=error`.

**Accepted formats** (regex `(t_[a-z0-9]+|1[0-9][a-z]-[0-9]+)`):
- `t_<8-hex>` — Hermes Kanban tasks (forward-going)
- `1[0-9][a-z]-<n>` — legacy orchestration.json unit IDs (frozen archive — accepted for historical branches)

**Skip mechanism:**
- `[skip-kanban]` anywhere in the commit message
- Auto-skip on `main` / `release/*` / `hotfix/*` branches
- Auto-skip on merge / revert commits

**Helper:** `pnpm kanban:start "<title>"` creates a triage task + worktree + branch + writes `HERMES_TASK_ID` for reverse lookup, and echoes the `Refs:` line for paste. See `scripts/kanban-start.mjs`.

**Audit existing branches:** `pnpm audit:wip` scans every branch ahead of main and reports orphan commits / archived-target refs / partial-coverage branches. Output: `docs/guardrails/orphan-wip-report.json`.

**Why it exists:** the Kimi-removal commit `c30eba6f` was a 27-file, real-work cleanup that landed without any kanban link. Sessions resuming from `git log` had no resume handle. The convention closes that gap — every distinct work intent gets a kanban task before commits land, and the audit catches the existing backlog.

When dispatching this skill's lifecycle (orchestration.json units), still use the unit ID in the `Refs:` line — it satisfies the legacy-format match.

## The Six-Phase Lifecycle

### Phase 1 — Select & validate the candidate

Given a unit ID (or "next eligible"), check ALL of:

1. `unit.status === 'approved'` (NOT `claimed`, `done`, `parked`, `denied`)
2. All `unit.dependsOn` IDs are status `done`
3. If unattended dispatch: `unit.safeForUnattended === true`
4. No file-path overlap with any `status === 'claimed'` units (extract paths from `agentNotes` + `description`)
5. No file-path overlap with uncommitted changes in `git status`
6. `unit.attempts < 2` (after 2 aborts, parking is correct)

If the watchdog is running, prefer announcing through it (`docs/ai/swarm-watchdog-decisions.jsonl`) so the watchdog's view stays consistent. If you dispatch directly via Agent tool, the watchdog will see the claim land and skip.

### Phase 2 — Pick the model tier (cheapest that can do the job)

Per `CLAUDE.md` §"Sub-agent dispatch rules":

| Task type | Model |
|---|---|
| Single-file refactor / rename / comment update / stub generation | **hermes3** (local Ollama, free) — slow but project-aware |
| New script following established pattern, doc-only research, light component additions | **sonnet** (closed-frontier) — quality default |
| Schema extension, validator addition, bridge endpoint, anything visual where pixel quality matters, ANY task involving DELETIONS | **sonnet** — default |
| Cross-cutting architectural reasoning, ambiguous scope, novel validators with subtle logic | **opus** — sparingly |
| **NEVER haiku** for autonomous dispatch | n/a — Adrian directive 2026-05-04 |

Default: **sonnet, default effort, isolation: worktree**. Override only with a one-line reason in the dispatch description.

### Phase 3 — Claim the unit (commit BEFORE any code)

Edit `docs/ai/orchestration.json` (Python with `ensure_ascii=False` to avoid unicode escapes — see `feedback_no_aspirational_guardrails.md` for the unicode-drift incident). Set:

```json
{
  "status": "claimed",
  "claimedBy": "<agent-id-or-in-window-opus>",
  "claimedAt": "<ISO-now>"
}
```

Atomic write: tmp-file + rename. Commit with message:

```
chore(orch): claim <unit-id>
```

This standalone claim commit is **mandatory** — it's the line of defense against parallel-pod overlap.

### Phase 4 — Dispatch (or do the work attended)

If sub-agent: launch via Agent tool with `subagent_type: general-purpose`, model from Phase 2, `isolation: "worktree"`. Pass a **lean prompt**:

```
<model> — <unit-id> — <one-line job>
Branch: fix/ui-pipeline. git reset --hard origin/fix/ui-pipeline first.
Claim already held by parent; you do the work.
Gates: <validationCmd from unit>. Audit before mark-done: node scripts/audit-batch-deliverables.mjs --units <unit-id>
Commit: feat(<scope>): <unit-id> <one-liner>. Mark done in same commit.
No push. No pnpm check:release. No new deps.
Key notes: <max 3 bullets, one sentence each from agentNotes>
```

Do NOT paste full unit descriptions, OPERATOR_BRIEF sections, or CLAUDE.md content into prompts — agents auto-load CLAUDE.md and read orchestration.json themselves.

If attended (in-window): just do the work; same audit gate applies.

### Phase 5 — Audit before mark-done (MANDATORY)

Per unit `13g-8` (shipped 2026-05-05): `hermes-unit.mjs` already refuses `mark_done` if `audit-batch-deliverables` fails. The Agent tool path doesn't have this guard automatically — **you (the dispatch executor) must run it**:

```bash
node scripts/audit-batch-deliverables.mjs --units <unit-id>
```

Must exit `0` and show `✓ <unit-id>` / `Batch summary: 1/1 pass`.

If the audit fails, read the error reasons:
- `claimedBy still set after done` → clear the field
- `claimedAt still set after done` → clear the field
- `validation cmd failed` → fix the deliverable, don't bypass
- `expected file not found` → fix the path or the agentNotes; don't shrug

### Phase 6 — Mark done & commit

Edit `docs/ai/orchestration.json`:

```json
{
  "status": "done",
  "completedAt": "<ISO-now>"
  // claimedBy and claimedAt are REMOVED, not nulled
}
```

Atomic write again. Append to `unit.history`:

```json
{
  "ts": "<ISO-now>",
  "event": "mark-done",
  "by": "<agent-id>",
  "note": "<one-line summary>"
}
```

Commit with the deliverable in the same commit:

```
feat(<scope>): <unit-id> <one-liner>

<short body — what shipped, validation result>

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
```

Pre-commit cascade will run all gates (gitleaks, typecheck, lint, design-system invariants, manifest validation, fixture proof, validate-guardrail-registry, check-validator-wiring). If any fail, fix the underlying issue — never `--no-verify`.

## Worktree Cleanup

If the agent ran in `isolation: "worktree"`, the commit may land on `worktree-agent-<id>` rather than `fix/ui-pipeline`. Check:

```bash
git branch --contains <commit-sha>
```

If only on the worktree branch, integrate:

```bash
cd /home/adrian/projects/adrian-milsap
git checkout -- docs/guardrails/strength-report.json docs/guardrails/strength-report.md  # if pre-commit regenerated
git merge --no-ff worktree-agent-<id> -m "merge: <unit-id> from worktree"
```

Locked worktrees (`git worktree list`) are typically the agent's intentional lock; leave them alone unless cleanup is explicitly requested.

## Common failure modes & recovery

| Symptom | Cause | Recovery |
|---|---|---|
| Audit fails with "claimedBy still set" | Marked done without clearing claim fields | `pop('claimedBy', None)` + `pop('claimedAt', None)` in the same write |
| Agent ran longer than watchdog cap (sonnet 30m, opus 60m, hermes 15m) | Watchdog auto-reverted claim mid-run | Re-mark `done` in the deliverable commit; commit-time gates pass cleanly |
| Massive orchestration.json diff after edit | Python `json.dump` without `ensure_ascii=False` escaped unicode | `git restore --staged orchestration.json && git checkout -- orchestration.json`, redo with `ensure_ascii=False` |
| Pre-commit fails with `wiringTodo` drift | New gate added without registry entry | Add to `docs/guardrails/registry.json` with appropriate `firingChannel` |

## Watchdog interplay

If `scripts/swarm-watchdog.mjs --watch` is running:

- It announces `would-dispatch` decisions to `docs/ai/swarm-watchdog-decisions.jsonl` every 60s
- It auto-reverts stale claims past the model-tier cap
- It fires `onSessionEnd` (regenerates strength report on graceful exit)
- It will NOT auto-dispatch via Agent tool — that's the in-window assistant's job

To avoid race conditions: claim the unit BEFORE dispatching the agent, so the watchdog sees `status: claimed` and skips it on its next cycle.

## Telemetry (manual close-loop)

After each `Agent.complete`, append to `telemetry/events.jsonl`:

```jsonl
{"ts":"<ISO>","event":"agent.dispatch.complete","data":{"unitId":"<id>","model":"sonnet-4-6","totalTokens":<n>,"costUsd":<n*3/1e6>,"durationMs":<n>,"toolUses":<n>,"ok":<bool>,"commitShas":["..."]}}
```

The watchdog reads cumulative `costUsd` to bind its `--max-cost-usd` cap. Sonnet = $3/M tokens per `docs/ai/watchdog-policy.json`.

## Quick reference: the lean prompt template

```
<model> — <unit-id> — <one-line job>
Branch: fix/ui-pipeline. git reset --hard origin/fix/ui-pipeline first.
Claim <unit-id> in orchestration.json before any code (Python ensure_ascii=False).
Commit: chore(orch): claim <unit-id>

Gates: <validationCmd>. Audit before mark-done: node scripts/audit-batch-deliverables.mjs --units <unit-id>

Work the unit. Commit deliverable + mark-done in same commit:
feat(<scope>): <unit-id> <one-liner>

No push. No pnpm check:release. No new deps if avoidable.
Key notes (max 3 bullets, one sentence each):
- <bullet 1>
- <bullet 2>
- <bullet 3>
```

## Examples

### Example 1 — Single safeForUnattended unit, sonnet

> User: "dispatch 13g-9"

1. Read `13g-9-precommit-structure-hash` from orchestration.json. Status `approved`. `safeForUnattended: true`. dependsOn: `13g-7` (done). ✓
2. Model: sonnet (validator code, default).
3. Claim → commit.
4. Agent dispatch with lean prompt + worktree isolation.
5. Wait for completion notification.
6. Audit → pass.
7. Mark done → commit.

### Example 2 — Two units in parallel, different files

> User: "kick off 13s-strength-3 and 13s-strength-6 together"

1. Verify dependsOn satisfied for both. Verify file-path non-overlap: 3 → `scripts/generate-strength-report.mjs`; 6 → `scripts/swarm-watchdog.mjs`. ✓
2. Claim both (two separate commits).
3. Two parallel Agent dispatches in a single message (multiple tool calls, single response).
4. Wait for both completion notifications.
5. Merge worktree branches (3 may land on its own; 6 may land on parent).
6. Audit each, mark done each.

### Example 3 — Sequential, same file

> User: "now do 13s-strength-5"

1. Read unit. dependsOn: `13s-strength-2` (done). ✓ But touches `scripts/generate-strength-report.mjs` — same file `13s-strength-3` just modified. Sequential, not parallel.
2. Verify `13s-strength-3` is fully merged before starting 5.
3. Claim → dispatch → audit → mark-done as usual.

## Boundaries (do NOT do)

- Do NOT auto-dispatch `safeForUnattended: false` units without confirming with the user
- Do NOT dispatch units whose `dependsOn` aren't all done
- Do NOT run multiple units in parallel that touch the same file
- Do NOT use `--no-verify` to bypass pre-commit gates — fix the underlying issue
- Do NOT mark `done` without running `audit-batch-deliverables` first
- Do NOT push to the remote (CLAUDE.md hard rule)
- Do NOT run `pnpm check:release` or any deploy command (CLAUDE.md hard rule)
- Do NOT touch `.env*` files (CLAUDE.md hard rule)
