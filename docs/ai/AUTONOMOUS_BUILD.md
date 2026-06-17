# 🔧 How the Autonomous Build Pipeline Works

This document explains the architecture of the autonomous-build pipeline
that drives the HDS DesignOps Engine. Read this when you need to
understand **how** the build self-drives, **why** it works the way it
does, or **how to extend it** with new phases or units.

For the **state** of the build (what's done, what's next, latest
commits), read `docs/ai/OPERATOR_BRIEF.md`.
For the **rules of the system** (manifest, components, Figma bridge),
read the docs under `docs/ai/rules/`.

---

## 1. Three durable artifacts

The pipeline has exactly three places where state lives across sessions:

- **`docs/ai/OPERATOR_BRIEF.md`** — the runbook. Top of file is the
  autonomous-continuation protocol; §3–§8 are the active threads, the
  decision rules, the 7-phase roadmap, and the recovery guide. This
  file is the only one an agent needs to read to resume cold.

- **`docs/ai/orchestration.json`** — the unit spec database. Every
  build unit (`p3-4-hermes-orchestration-agent`, `8p-1-swiss-canon-validator`,
  `8p-8-table-composition`, etc.) has an entry with:
    - `id`, `phase`, `name`
    - `status` (`pending` | `draft` | `done`)
    - `dependsOn` (other unit IDs that must be `done` first)
    - `description` (what the unit does and why)
    - `validationCmd` (the gate the unit must pass on green)
    - `agentNotes` (caveats, gotchas, edge cases for the executing agent)
    - **inline drafts** — `draftBlock`, `draftDescriptions`, `draftTemplate`,
      `draftSourceCanonRules`, etc. — concrete starting points so the
      next agent iterates from a draft instead of designing from zero
    - on completion: `completedAt: <YYYY-MM-DD>`

- **Auto-memory** at
  `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/`.
  Per-user, persists across all sessions. Four memory types:
    - `user_*` — Adrian's role, expertise, knowledge
    - `feedback_*` — how Adrian wants work executed (corrections,
      validations, taste decisions)
    - `project_*` — ongoing initiatives, deadlines, motivations
    - `reference_*` — pointers to external systems and docs

  `MEMORY.md` is the always-loaded index; individual files are read on
  relevance. Memory captures *what's not derivable from the code or
  git history* — taste, intent, motivation, lived experience.

---

## 2. Two execution surfaces

- **`pnpm hds:run`** → `node scripts/ai-orchestrator.mjs --orchestrate`
  Reads `orchestration.json`, runs the next eligible unit's
  `validationCmd`, marks `done` on green, repeats. Honors
  `stopConditions`. Logs every run + fail to `telemetry/events.jsonl`.

- **`node scripts/ai-orchestrator.mjs --orchestrate --dry-run`**
  Lists every unit whose `dependsOn` are all `done`. The first thing
  an agent runs at session start under the autonomous-continuation
  protocol.

---

## 3. The pre-commit gate cascade

**Canonical source: `docs/ai/AGENT_GUIDELINES.md` §5** — that section has
the current gate list with baseline numbers, CI additions, and the
promotion path for each soft gate.

Summary: `.husky/pre-commit` runs `pnpm typecheck`, lint (warn-mode), then
seven hard-fail scripts: `check-manifest-drift`, `check-binding-drift`,
`check-source-canon`, `validate-manifest`, and `validate-orchestration`.
`pnpm test` adds the broader pretest cascade (completeness, figma-masters
snapshot, doc-pages snapshot, registry, knip).

Run in order; stop on first failure. Never bypass with `--no-verify`.

---

## 4. The unit lifecycle

```
pending → draft → done
```

- **pending**: unit exists in `orchestration.json` with description +
  agentNotes. No starter code. Use when the unit's design is settled
  but no draft has been written yet.
- **draft**: same as `pending` but with concrete inline drafts
  (validator rules, prose, prompt blocks, templates, regex lists). The
  agent iterates on the draft instead of designing from zero.
- **done**: unit's `validationCmd` exits 0; `completedAt: <YYYY-MM-DD>`
  set; one commit landed with message `feat(<scope>): <unit-id> <one-line>`
  ending with `Co-Authored-By: Claude` line.

**Inline drafts** are the high-leverage idea. Phase 8-pre's units
shipped with concrete drafts (10 validator rules, 15 component
descriptions, a 13-line system-prompt block, a Swiss-compliant
component template, 9 source-canon rules). The next agent didn't have
to design — only adjust to repo reality (e.g., 8p-2 substituted
HdsField → HdsLabel because HdsField doesn't exist; 8p-7 honored the
existing `@doc-exempt` JSDoc convention rather than fabricating a new
skip-list). Drafts are starting points, not requirements.

---

## 5. The autonomous-continuation protocol

Top of `docs/ai/OPERATOR_BRIEF.md` carries the full protocol. Summary:

1. **Find the next unit** — `--orchestrate --dry-run`. Precedence:
   active thread (`*-followup` or §4 active threads) → phase number
   ascending → lowest unit ID within phase. Skip Phase 5 unless the
   bridge needs to leave localhost. Skip `backlog` phase entirely
   unless explicitly requested.
2. **Read the unit + memory** — pull description, agentNotes, drafts,
   plus any memory files the unit references.
3. **Execute** — drafts are starting points; adjust to repo reality.
4. **Gate** — all four pre-commit gates exit 0.
5. **Commit + mark done** — one unit = one commit; status updated in
   `orchestration.json` in the same commit.
6. **Loop** — repeat from step 1. When the eligible list is empty, the
   thread is done — write a reconcile commit and ask Adrian which
   thread to open next.

**Stop conditions** that return control to Adrian:
- `validationCmd` fails twice with different error messages
- A change would modify a schema already consumed by a `done` unit
- The user's intent is genuinely ambiguous after re-reading twice
- An unauthorized destructive or remote-visible action would be required

---

## 6. How threads close

A "thread" is a coherent set of units (Phase 8-pre, Phase 8-pre-followup,
etc.). When all units in a thread land:

1. The agent runs a final **reconcile commit** updating the brief:
   - §3 / §4 / §6 / §8 — move units from "drafted" / "active" to "done"
   - Latest-commits list at top — add the new commit hashes
   - "Last reconciled" date — current
2. Adrian decides which thread to open next.
3. Drafting new units in `orchestration.json` for the next thread is
   either done by Adrian (he hands the agent a prompt with unit drafts)
   OR by the agent (it drafts the units, lands them with
   `status: pending`, then executes).

The Phase 8-pre handoff in this repo is the canonical example:
`75347aa..5df5a67` for the four units, `d69a57a` for the reconcile.

---

## 7. The 7-phase roadmap

Phases run in dependency order, but units within a phase can land in
any topological order their `dependsOn` arrays allow.

**Current completion status is tracked in `docs/ai/OPERATOR_BRIEF.md` §6.**
Summary as of 2026-05-02:

```
0 ✅ Foundation
1 ✅ Manifest schema
2 ✅ Validator suite
3 ✅ Retry loop + p3-4
A ✅ Path-A figma masters
4 ✅ Compiler upgrades
5 ✅ Auth + envelope (feature-flagged off — bridge still on localhost)
6 ✅ Read path (all 5 units, feature-flagged)
7 ✅ Productionization (manifest CI + telemetry report + flag policy)
8-pre ✅ LLM output quality (8p-1..8p-8)
shadcn-pivot ✅ 28/28 units (8-V, 8-X, 8-E, 8-S, 8-T clusters)
9-D ✅ Docs-aesthetic cluster (10/10 units)
Phase 10 / 12 — active burndown (see OPERATOR_BRIEF.md §4 + §8)
```

---

## 8. Hard rules

**Canonical source: `docs/ai/OPERATOR_BRIEF.md` §7** (non-negotiable
safety rules) and **`docs/ai/AGENT_GUIDELINES.md` §10** (commit +
branch hygiene). Those are the authoritative lists; do not duplicate
them here.

Quick reference: never `check:release`, never push without instruction,
never `--no-verify`, never new npm deps, never break an existing schema
(additive extensions only).

---

## 9. Where to put new things

| Type of change                               | Where to put it                                                  |
| -------------------------------------------- | ---------------------------------------------------------------- |
| Build state / what's next                    | `docs/ai/OPERATOR_BRIEF.md` (§3, §4, §8, latest-commits header) |
| New build unit                               | `docs/ai/orchestration.json` (with description + draft)          |
| Hard rules / guardrails / dispatch doctrine  | `docs/ai/AGENT_GUIDELINES.md` (canonical; other docs reference)  |
| User taste / preferences (durable)           | Auto-memory `feedback_*.md`                                      |
| Project context / motivation                 | Auto-memory `project_*.md`                                       |
| External system pointer                      | Auto-memory `reference_*.md`                                     |
| Pipeline architecture / "how it works"       | This file (`docs/ai/AUTONOMOUS_BUILD.md`)                        |
| Manifest / component / token rules           | `docs/ai/rules/MANIFEST_SYNC.md` etc.                            |
| Source-code structural map                   | `docs/SYSTEM_ATLAS.md` (auto-generated; `node scripts/generate-system-atlas.mjs`) |
| Decision ledger entry (deviation rationale)  | `docs/logs/AI_DECISION_LEDGER.md`                                |

---

## 10. Worked example: "go" → 8p-8 lands

Adrian types `go` (or any short prompt) at session start. The agent:

1. Opens `docs/ai/OPERATOR_BRIEF.md`. Hits the **⚡ Autonomous Continuation
   Protocol** at the top.
2. Runs `node scripts/ai-orchestrator.mjs --orchestrate --dry-run`.
   Sees `8p-8-table-composition` and `p5-1-message-envelope` listed.
   Precedence rule picks `8p-8` (active thread).
3. Opens `orchestration.json`, finds `8p-8`. Reads `description`,
   `agentNotes`, and the inline `draftBlock` (a 3-row settings table
   composed of flat HdsFrame + Text with semantic.color.border.default
   dividers).
4. Opens `scripts/generate-to-figma.mjs`, finds the `COMPLETE EXAMPLE — nav header:`
   block, inserts the new `COMPLETE EXAMPLE — settings table:` block
   right after it.
5. Runs the unit's `validationCmd` (`grep -q 'COMPLETE EXAMPLE — settings table'
   scripts/generate-to-figma.mjs && echo OK`). Green.
6. Runs the four pre-commit gates. All green.
7. Runs `pnpm ui:gen "a settings table with three rows"` as the
   empirical smoke. Captures retry counts in telemetry.
8. Marks `8p-8` `status: done` + `completedAt: 2026-04-30` in
   `orchestration.json`.
9. Commits with message `feat(prompt): 8p-8 tabular composition example
   in LLM system prompt`.
10. Reruns dry-run. Eligible list empty (Phase 8-pre-followup is
    drained). Writes reconcile commit. Returns to Adrian: "Phase
    8-pre-followup closed. Open the broader Phase 8 cluster, or pick
    Phase 6 (read path)?"

End-to-end: ~15 minutes of agent time, two commits, zero round-trips
to Adrian for clarification.
