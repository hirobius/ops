# Multi-Agent Overnight Burndown — operator + agent protocol

This is the canonical, copy-paste-ready protocol for draining the
`orchestration.json` queue overnight using parallel Claude windows. Read this
once, then dispatch.

Pairs with: `docs/ai/AGENT_GUIDELINES.md` §7 (claim protocol), `docs/ai/PROMPT_TEMPLATES.md`
(Template 6: autonomous-burndown), `docs/logs/AI_DECISION_LEDGER.md` (running
decision log).

---

## 0. TL;DR — fastest path to dispatch

```bash
# 1. Operator: start the watcher daemon (one terminal, leave running).
node scripts/orchestration-watcher.mjs &

# 2. Operator: bump lint baseline if pre-commit is blocking
#    (current baseline is in .husky/pre-commit; bump only when stuck).

# 3. For each new Claude window: paste PROMPT_TEMPLATES.md Template 6 with a
#    unique session-id (e.g. session:fresh-2026-05-02-w5-a1).
#
#    Recommended geometry tonight (2026-05-01):
#      5 windows × 5 agents = 25 agents
#      Drains ~125 units per overnight.
```

Each agent reads `docs/ai/ready-queue.json` (produced by the watcher), claims
the top eligible unit, executes it, commits `claimed → done`, and loops.

---

## 1. Why this exists

Window 2 of the 2026-05-01 fresh dispatch produced collision commits when two
parallel agents fought over the same `orchestration.json` lines. The fixes
landed across the night:

- **`status: claimed`** + `claimedBy` + `claimedAt` (commit `3dd9cf7`) — schema
  invariant: agents lock units before working.
- **`scripts/dispatch-pod.mjs verify`** (commit `032dbcd`) — pre-commit guard:
  agent confirms it is on an isolated worktree before any commit.
- **`scripts/audit-claims.mjs`** — runtime check for stale claims (>4h) so a
  crashed agent doesn't lock a unit forever.
- **This document + `scripts/orchestration-watcher.mjs`** — coordinate work
  across many windows by pull-polling a single `ready-queue.json`.

The architecture is **pull-based**, not push-based. Claude windows can't
receive interrupts from each other. The watcher writes `ready-queue.json`;
agents read it at every loop iteration. Effective ping latency:

```
unit-lands-in-git → watcher detects (≤30s)
                  → ready-queue.json updated
                  → next agent's loop reads it (≤120s)
                  → ~150s worst-case from "done" to "next picked up"
```

That is fast enough to keep the queue draining without humans in the loop.

---

## 2. The complexity tier system

Every eligible unit gets a tier when the watcher computes the queue. Tier
controls **model**, **effort**, and **autonomy**.

| Tier | Match heuristic | Model | Effort | Autonomy |
|------|-----------------|-------|--------|----------|
| **T1 mechanical** | scrub / regen / baseline / fixture / emoji / comment / rename file / alias / tag / cron / burndown | `haiku` | default | execute, no ledger |
| **T2 standard** | everything else | `sonnet` | default | execute, ledger only if a non-obvious decision was made |
| **T3 architectural** | schema / protocol / validator / projection / batch / cross-cutting / refactor / new gate / new check / new envelope / manifest projection | `sonnet` | default | execute, **mandatory ledger entry** before commit |
| **T4 strategic** | brand / Hydra rename / multi-tenant / deploy / public-API break / business / monetization / pricing / Stripe — OR `status === 'needs-grilling'` | `opus` | **max** | execute with **mandatory ledger entry**, work the unit to the point where it **unblocks the next downstream unit**, then PUNT remaining scope to Adrian only if absolutely necessary |

### What "punt" means for T4

T4 work does not stop velocity. The agent:

1. Writes a ledger entry **first** (decision, alternatives, downstream
   ramifications, reversibility).
2. Executes the unit far enough to land at a coherent unblocking commit —
   downstream units that depend on it become eligible.
3. If remaining scope is genuinely strategic (touches business model, brand,
   or public-API breakage) and the agent cannot justify a default, marks the
   unit `status: in-progress` (NOT done), adds an `agentNotes` entry titled
   `PUNT TO ADRIAN — <one-line>`, and moves on. The next agent skips
   in-progress units.

T4 punts surface in the morning review surface (Section 7 below). They are
the rare exception, not the default. Most T4 units finish T4 → done overnight
without punting.

### Heuristic overrides

The watcher classifies by description text. To override, add an explicit
`complexityTier: "T1" | "T2" | "T3" | "T4"` field to the unit in
`orchestration.json`. Watcher reads it before applying the regex heuristic.

---

## 3. Agent operating loop

Every window runs this loop. The full version is `Template 6` in
`docs/ai/PROMPT_TEMPLATES.md`. Outline:

```
LOOP:
  1. git fetch && git reset --hard fix/ui-pipeline
  2. Read docs/ai/ready-queue.json
     → if empty, sleep 120s, goto 1.
     → else pick top eligible whose blockedFiles don't conflict with another
       agent's *recently active* claim (heuristic: any claim < 5min old).
  3. CLAIM: 1-line commit setting status=claimed, claimedBy=<session-id>,
     claimedAt=<ISO-now>. Commit message:
       chore(orch): claim <unit-id> for <session-id>
  4. EXECUTE per the unit's tier:
     - T1: do the mechanical work.
     - T2: do the work; if you made a non-obvious call, append a ledger entry.
     - T3: write a ledger entry (decision + alternatives + downstream + reversible?), THEN do the work.
     - T4: write a ledger entry, dispatch with opus + max effort, work to the
           point that unblocks the next downstream unit, PUNT only if you cannot
           default it. PUNT format: status=in-progress, agentNotes prepend
           "PUNT TO ADRIAN — <reason>".
  5. PRE-COMMIT GATES (see §5).
  6. CLAIMED → DONE: commit the deliverable. Same commit transitions
     status=done, completedAt=<YYYY-MM-DD>. Message:
       <type>(<scope>): <unit-id> <one-line>
       (body explains the why)
       Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
  7. CLEAN UP (see §6).
  8. goto 1.

STOP CONDITIONS (return to the operator log, do not pick more):
  - 3 consecutive units fail their pre-commit gates with different errors.
  - The repo enters mid-cherry-pick / mid-rebase / mid-merge state.
  - The lint baseline jumps > 50 violations from the start of your session.
  - Nothing eligible for 3 consecutive 120s polls AND no claimed units have
    moved in 10 minutes (queue is genuinely drained — write a final reconcile
    commit and stop).
```

---

## 4. Adjacent dirty-tree handling (Adrian directive 2026-05-01)

Sub-agents now commonly land in a shared worktree where another session has
WIP. Rules:

- **WIP that matches a current claim (`claimedBy === <some other session>`)**:
  do NOT touch. The owning agent will commit. Work around it (stage your own
  files explicitly with `git add <path>` instead of `git add -A`).
- **Untracked test artifacts** (`test-results/`, `playwright-report/`):
  always safe to leave. They are gitignored or sweepable.
- **Orphan WIP** (modified files, no matching active claim, no commit in last
  4h):
  - If the diff matches a unit's clear scope and the unit was `done` recently,
    the WIP is probably leftover from that unit's commit — clean it (`git
    checkout -- <path>` or `git stash drop`).
  - Otherwise add an `[ORPHAN-WIP] <files>` line to your run-log and leave it
    for morning review.
- **End-of-night invariant**: by morning the worktree should be clean
  (`git status` shows only untracked test artifacts). The last agent in each
  window writes a reconcile commit if needed:
  ```
  chore(orch): reconcile orchestration.json after window <N> drain
  ```

**Never `git push`** — Adrian directive. Cleanup is local-only.

---

## 5. Pre-commit gate cascade

Run in order. Stop and report on first failure.

```bash
pnpm typecheck
node scripts/check-token-rebake-needed.mjs   # if fail: pnpm tokens:build && git add public/hds-manifest.json
pnpm lint --max-warnings=$(grep max-warnings .husky/pre-commit | grep -oE '[0-9]+' | head -1) || true
node scripts/check-manifest-drift.mjs
node scripts/check-binding-drift.mjs
node scripts/check-source-canon.mjs
node scripts/validate-manifest.mjs
node scripts/validate-orchestration.mjs
```

The `.husky/pre-commit` hook runs the same cascade. If you bypass with
`--no-verify`, you'll bounce off CI later — don't.

**Lint baseline policy**: it is OK to bump `--max-warnings` upward (in
`.husky/pre-commit`) when an unrelated WIP pushed past the cap and it would
block your commit. Standalone bump-only commit:
```
chore(lint): bump baseline to <N> — wave-1 still in burndown
```
Never bump for code YOU added without justification in the commit body.

---

## 6. Decision ledger format

Append to `docs/logs/AI_DECISION_LEDGER.md` for every T3 + every T4 unit (and
optionally for surprising T2 calls).

```markdown
## <ISO-timestamp> — <unit-id> (T3 | T4)

**Session:** <claimedBy>
**Decision:** <one-line summary of the call you made>
**Alternatives considered:** <bullet of what you rejected and why>
**Downstream ramifications:** <files/units/contracts that change as a result>
**Reversibility:** <reversible | partially-reversible | one-way-door>
**Ledger context:** <brief — surrounding goals you optimized for>
```

Entries are append-only and committed in the same commit as the deliverable.

---

## 7. Morning review surface

When you (Adrian) wake up, run:

```bash
node scripts/orchestration-watcher.mjs --once  # fresh ready-queue.json
git log --since="12 hours ago" --oneline       # what landed
grep -c "## 2026-" docs/logs/AI_DECISION_LEDGER.md  # decision count

# Any T4 punts?
grep -B1 "PUNT TO ADRIAN" docs/ai/orchestration.json | head -50

# Stale claims (crashed agents)?
node scripts/audit-claims.mjs --strict
```

Read in this order:

1. The new ledger entries (decisions made on your behalf).
2. Any `PUNT TO ADRIAN` notes (rare — these need your input).
3. The git log + `ready-queue.json` counts to see what's drained.
4. `git status` should be clean (only test-results untracked). If not, the
   last agent skipped its cleanup — investigate.

---

## 8. Dispatch geometry guidance (current scale)

| Window count | Agents per window | Wall-clock | Drains roughly | When to use |
|--------------|-------------------|------------|----------------|-------------|
| 1 | 5 | ~3 hrs | 25 units (P1 sprint-2 only) | quick top-up |
| 3 | 5 | ~6 hrs | 75 units | half-overnight |
| **5** | **5** | **~8 hrs (overnight)** | **125 units** | **default overnight** |
| 7 | 5 | ~10 hrs | 175 units | full backlog flush |

Per-agent throughput assumption: 5 units/agent-night (mix of T1+T2+T3 with
~10% T4). Tune downward if you see a lot of pre-commit retries or merge churn.

**Window-to-cluster affinity (recommended pinning to reduce file conflicts):**

| Window | Affinity (suggested by file blast radius) |
|--------|-------------------------------------------|
| w5 | Manifest writes (8-V slots / componentSpecs / token wiring) — serialize here |
| w6 | Validators + scripts + governance gates (no manifest writes) |
| w7 | Doc pages + `docs/ai/` updates + ledger entries |
| w8 | Component + pattern source (`src/app/components/`) |
| w9 | Mixed P1 / cleanup / debugging |

Within a window, the 5 agents pull independent units from the affinity slice.
Watcher's `fileGroups` field tells you which units share blockedFiles.

---

## 9. Hard rules summary

- `git push` requires explicit Adrian instruction. NEVER push overnight.
- `pnpm check:release` is forbidden in the loop (10 min runtime).
- Claim before working. ALWAYS.
- One unit = one deliverable commit (plus the standalone claim commit).
- T3 + T4 require ledger entries.
- T4 punt only if absolutely necessary; default to executing.
- Leave the worktree clean by morning. Never push, but DO clean.
