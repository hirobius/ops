# Figma DesignOps Engine — Execution Strategy

> **Draft — populate from 2026-05-06 session notes.** The original
> Adrian-pasted block ("Execution Strategy — Autonomous Orchestration
> Plan") was not recovered from `~/.hermes/sessions/` archives. This
> file scaffolds the HOW layer using the Phase 0–7 unit dependency graph
> already encoded in `docs/ai/orchestration.json` plus the architectural
> rationale in [`./ROADMAP.md`](./ROADMAP.md). Replace the wrapper prose
> with the original paste block when it surfaces; the unit graph below
> is read directly from orchestration.json and is correct as of 2026-05-09.

The companion WHY document is [`./ROADMAP.md`](./ROADMAP.md). Read it
first; this file assumes you understand the four pillars (AST
Gatekeeper, retry loop, JSX compiler, two-way protocol).

---

## 1. Orchestration substrate

Phase 0–7 are encoded as units in `docs/ai/orchestration.json`. Every
unit has:

- `id` — stable identifier (e.g. `p2-3-token-validator`)
- `phase` — integer 0..7 for the gatekeeper pipeline
- `dependsOn` — predecessors that must be `done` before the unit is eligible
- `validationCmd` — exit-0 contract; must pass before `mark-done`
- `agentNotes` — drafts and decisions inline with the unit
- `status` — `approved` → `claimed` → `done` (one-way; revertible to `approved` on abort)

The orchestration watcher daemon (`scripts/orchestration-watcher.mjs`)
recomputes `docs/ai/ready-queue.json` continuously so the autonomous
loop in OPERATOR_BRIEF §⚡ can pick the next eligible unit without
re-reading the full graph.

The deterministic gates that must pass before any commit are
canonicalized in OPERATOR_BRIEF §5 + §9:

```
node scripts/run-validator-tests.mjs
node scripts/test-retry-loop.mjs
node scripts/validate-manifest.mjs
node scripts/check-manifest-drift.mjs
```

Phase 7's CI hardening (`p7-1-manifest-ci`) wires these into the GitHub
Actions surface so they run on every PR; the audit registry at
`docs/guardrails/registry.json` declares the firing channel for each
script (pre-commit / commit-msg / pre-push / ci-pr / ci-scheduled / pnpm-meta / manual).

---

## 2. Phase-by-phase dependency graph

Snapshot rendered from `docs/ai/orchestration.json` (2026-05-09). All
Phase 0–7 units are status `done`; the graph is recorded for archival
and to inform Phase 8+ proposals.

### Phase 0 — Foundation

```
p0-1-repo-structure (no deps)
  ├─ p0-2-rules-docs
  ├─ p0-3-test-harness
  ├─ p0-4-feature-flags
  └─ p0-5-telemetry
```

Establishes the substrate every later phase depends on: the repo
shape, the rule docs (`docs/ai/rules/*.md`), the test harness, the
feature-flag surface (`bridge.config.json`), and the telemetry logger
(`telemetry/logger.mjs` → `telemetry/events.jsonl`).

### Phase 1 — Manifest

```
p1-1-manifest-schema (deps: p0-2)
  ├─ p1-2-manifest-expansion
  ├─ p1-3-manifest-validator-script
  └─ (p1-2) → p1-4-manifest-drift-check
```

Locks the manifest contract that the gatekeeper, the JSX compiler, and
the plugin all read from. `p1-3` ships
`scripts/validate-manifest.mjs`; `p1-4` ships
`scripts/check-manifest-drift.mjs`. Both are pre-commit gates per the
audit registry.

### Phase 2 — AST Gatekeeper

```
p2-1-jsx-parser (deps: p0-3, p1-1)
  ├─ p2-2-manifest-validator (deps: p2-1, p1-2)
  ├─ p2-3-token-validator (deps: p2-1)
  └─ p2-4-a11y-validator (deps: p2-1, p1-2)
       └─ p2-5-validator-orchestrator (deps: p2-2, p2-3, p2-4)
```

Build order is parser-first (so every validator can consume the same
AST), then the three checkers in any order, then the orchestrator that
sequences them and aggregates findings. The orchestrator's output is
the contract the correction formatter consumes in Phase 3.

### Phase 3 — Self-healing retry loop

```
p3-1-correction-formatter (deps: p2-5)
  └─ p3-2-retry-controller (deps: p3-1, p0-4, p0-5)
       ├─ p3-3-pipeline-integration
       ├─ p3-3-streaming-refactor
       └─ p3-4-hermes-orchestration-agent (deps: p3-2, p0-5)
```

Note the duplicate id `p3-3` (`pipeline-integration` and
`streaming-refactor`); the orchestration loader treats them as siblings
both depending on the retry controller. Cleanup candidate: rename
`streaming-refactor` to `p3-5` for unambiguous addressing. (Logged as
proposed-unit material; do not retro-rename without an ADR because
existing commit messages reference the current id.)

### Phase 4 — JSX compiler upgrades

```
p4-1-compiler-fixtures (deps: p0-3)
  ├─ p4-2-expression-containers
  ├─ p4-3-variant-mapping (deps: p4-1, p1-2)
  ├─ p4-4-a11y-metadata
  └─ p4-5-fragments-conditionals

path-a-figma-masters (deps: p1-2)
  └─ path-a-visual-differentiation
```

Fixtures land first per OPERATOR_BRIEF §5.2 ("Fixtures before code");
each compiler-feature unit then implements against a fixture that pins
its output. Path-A (master batches) is grouped here because it depends
on the manifest expansion from Phase 1 rather than on the validator
suite.

### Phase 5 — Two-way protocol foundations

```
p5-1-message-envelope (deps: p0-1)
  └─ p5-2-request-response-correlation
       ├─ p5-3-auth-hmac (deps: p5-2, p0-4)
       └─ p5-4-runtime-error-channel
```

The envelope is the wire format; correlation is the in-memory pending-
request map; HMAC auth is the reject path; the runtime error channel
re-uses the same envelope to pump plugin-side draw failures back
through the retry loop.

### Phase 6 — Read-path + fix-mode

```
p6-1-selection-serializer (deps: p4-4, p5-2, p1-2)
  ├─ p6-2-lint-command (deps: p6-1, p2-5)
  ├─ p6-3-contrast-checker
  ├─ p6-4-token-sync
  └─ p6-5-fix-mode-diff (deps: p6-1, p3-3)
```

The selection serializer is the spine: every other Phase 6 unit
operates on the serialized selection. Lint reuses the Phase 2
orchestrator; fix-mode diff reuses the Phase 3 retry pipeline.

### Phase 7 — Hardening

```
p7-1-manifest-ci (deps: p1-4, p1-3)
p7-2-telemetry-dashboard (deps: p3-2, p0-5)
p7-3-flag-cleanup (deps: p3-3, p5-3)
```

CI wiring promotes the manifest validators to PR gates. The telemetry
dashboard surfaces retry-rate / validator-failure analytics on
`/ops/build/telemetry`. Flag cleanup retires Phase 3 + Phase 5 feature
flags after 24h clean telemetry per OPERATOR_BRIEF §5.3.

---

## 3. Execution policy

### 3.1 Dispatch rules

Per `CLAUDE.md` §1a + the agent execution protocol:

- **One unit per agent.** No bundling. Each agent claims, executes,
  validates, commits, marks done.
- **Cheapest model that can do the job.** Sonnet by default for any
  source-code dispatch. Hermes3 (local Ollama) for mechanical
  refactors. Opus only for architectural decisions. Haiku is removed
  from autonomous dispatch (2026-05-04).
- **Worktree isolation** (`isolation: "worktree"`) for any pod where
  two agents could touch the same file.
- **Claim before working.** Standalone commit setting `status:
  claimed`, `claimedBy`, `claimedAt` before any code edits. Stale claims
  (>4h) are detected by `node scripts/audit-claims.mjs`.

### 3.2 Pre-commit gate

All four MUST exit 0 (per OPERATOR_BRIEF §9):

```
node scripts/run-validator-tests.mjs
node scripts/test-retry-loop.mjs
node scripts/validate-manifest.mjs
node scripts/check-manifest-drift.mjs
```

The audit registry at `docs/guardrails/registry.json` declares each
script's firing channel; drift caught by
`validate-guardrail-registry` + `check-validator-wiring` (both
pre-commit gates).

### 3.3 Mark-done contract

`hermes-unit.mjs` refuses `mark-done` if
`scripts/audit-batch-deliverables.mjs` does not exit 0 for the unit
(shipped 2026-05-05 per CLAUDE.md). The audit is a deterministic
per-unit deliverable check that reads the unit's `validationCmd` and
inspects the working tree for the expected files.

### 3.4 Commit-message discipline

Feature-branch commits MUST reference an open kanban task via
`Refs: <task-id>` (per `.husky/commit-msg` and
`scripts/check-commit-message-task-ref.mjs`). Warn-only by default;
promote with `KANBAN_REF_ENFORCE=error`. Use `pnpm kanban:start "<title>"`
to scaffold the task + worktree + branch. `pnpm audit:wip` scans
existing branches for orphans.

Phase commits follow `feat(gatekeeper): complete Phase N — <name>`
(OPERATOR_BRIEF §5.5).

---

## 4. Closure verification (Phase 0–7)

All Phase 0–7 units status `done` as of 2026-05-09. To confirm the
pipeline is end-to-end green, run the full operator path from
`docs/operations/figma-plugin-runbook.md` §"Daily startup":

1. `pnpm bridge` — bridge boots on `:3005`, prints
   `🌉 HDS Bridge live at http://localhost:3005`.
2. Plugin loaded in Figma Desktop, paired to `HDS_BRIDGE_SECRET`.
3. `pnpm ui:gen "settings card with three rows"` — LLM emits valid
   JSX, gatekeeper accepts, bridge broadcasts, plugin renders.
4. Select the rendered frame → `pnpm ui:fix "make it dark mode"` —
   fix-mode diff emits `UPDATE_NODE` commands for changed props only.
5. `pnpm test:phase1` — JSONL pipeline green.
6. Visit `/ops/build/telemetry` — retry-rate < 10%, no validator-
   failure spikes.

A regression here means a Phase 0–7 unit's invariant has slipped;
re-open the unit, do not patch downstream.

---

## 5. Phase 8+ — proposed units (not yet approved)

These tee up the priorities listed in
`~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/project_figma_plugin_priority.md`.
File proposals through `docs/ai/proposed-units.jsonl` per
CLAUDE.md §1a; do not edit `orchestration.json` directly until promoted.

### P8.1 — Auth pairing UX

Verify the operator pairing flow in `figma-plugin-runbook.md`
§"Daily startup" works end-to-end after the Phase 5 HMAC ship. Acceptance:
fresh plugin install, fresh secret, no errors when the operator pastes
the secret into the inline form.

Suggested unit id: `p8-1-auth-pairing-verification`. Validator: a smoke
test that boots the bridge, simulates a plugin connection with the
pasted secret, and confirms the first `/generate` POST gets accepted.

### P8.2 — Orchestration status page in Figma

Inject a status page into the standard client file
(per `project_figma_template_structure.md`) that mirrors
`orchestration.json`'s unit graph. Keep it read-only on the plugin side;
edits round-trip through the bridge to `orchestration.json` only via
`/update-manifest`-style endpoints.

Suggested unit id: `p8-2-status-sync-figma-page`. Validator: render the
status page, change a unit's status in `orchestration.json`, confirm
the Figma page updates within 1 SSE heartbeat.

### P8.3 — Template injection

Implement the one-button "scaffold this client" plugin action that
populates the standard 8-page Figma file from the manifest. Plugin
calls a new bridge endpoint `/scaffold-client-file` with `{ clientId,
brand }`; bridge returns a `draw-component` batch the plugin paints.

Suggested unit id: `p8-3-template-injection`. Validator: scaffold a
client file from a known-good fixture, snapshot the resulting
component tree, diff against the fixture.

### P8.4 — Brand token override

Per-client theming applied at plugin render time. Plugin reads a
`brandTokens` map from the bridge (keyed by `clientId`) and remaps
manifest token references through it before drawing. Falls back to
manifest defaults when a brand override is absent.

Suggested unit id: `p8-4-brand-token-override`. Validator: same JSX
input rendered against two `brandTokens` maps produces visually-distinct
canvases with no token-resolution errors.

---

## 6. Stop conditions

The autonomous loop in OPERATOR_BRIEF §10 stops on:

- A unit's `validationCmd` fails twice with different error messages.
- A change would modify a schema already consumed by a `done` unit.
- Telemetry shows >10% retry-exhaustion rate.
- Any auth or HMAC check fails.
- The user's intent is genuinely ambiguous after re-reading the
  request twice.

For Phase 8+ proposals specifically: stop also if the proposed unit
would require modifying `figma-agent-plugin/manifest.json#networkAccess.allowedDomains`
without an `AI_DECISION_LEDGER.md` entry, or if it would touch the
`HDS_BRIDGE_SECRET` env var path (covered by HARD RULES at the top of
CLAUDE.md — never read/write `.env*`).
