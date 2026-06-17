# 🛰️ HDS DesignOps Engine — Operator's Brief

## ⚡ Autonomous Continuation Protocol — agent: start here

If Adrian's prompt is short and open ("continue", "go", "next unit",
"keep building", "follow this doc"), execute the protocol below without
asking for confirmation. If the prompt is specific (a question, a bug
report, a targeted change), do that instead.

> **🌙 NIGHT-SHIFT MODE IS ACTIVE (Adrian directive 2026-05-02).**
> When you finish a unit, **DO NOT STOP — claim the next eligible unit
> and execute it.** Loop until a stop condition fires. The
> `scripts/orchestration-watcher.mjs` daemon is running and writes
> `docs/ai/ready-queue.json`; consult it each iteration for the top
> eligible unit. Canonical loop spec:
> `docs/ai/MULTI_AGENT_OVERNIGHT.md` §3 + `docs/ai/PROMPT_TEMPLATES.md`
> Template 6 (autonomous-burndown). Any agent or sub-agent dispatched in
> this window is expected to chain units autonomously — do not write a
> per-unit status report; only report on session end / stop-condition /
> queue drain. **Pre-claim AT MOST one unit at a time** to avoid denying
> peers eligible work.

**Loop:**

1. **Find the next unit.** Read `docs/ai/ready-queue.json` (regenerate
   with `node scripts/orchestration-watcher.mjs --once --quiet` if >10 min
   stale). Pick the top entry from the `eligible` array sorted by `priority`
   ascending. If the file is missing or `eligible` is empty, run:
   `node -e "const d=JSON.parse(require('fs').readFileSync('docs/ai/orchestration.json')); const done=new Set(d.units.filter(u=>u.status==='done'||u.status==='denied').map(u=>u.id)); console.log(JSON.stringify(d.units.filter(u=>u.status==='approved'&&(u.dependsOn||[]).every(x=>done.has(x))).map(u=>({id:u.id,priority:u.priority})).sort((a,b)=>a.priority-b.priority).slice(0,10),null,2))"`

   Pick priority by phase number ascending, then lowest unit ID first.
   Skip `backlog` phase entirely unless explicitly requested.
   If the eligible list is empty, ask Adrian which thread to open next.

2. **Read the unit + relevant memory.** Query the unit directly:
   `node -e "const d=JSON.parse(require('fs').readFileSync('docs/ai/orchestration.json')); console.log(JSON.stringify(d.units.find(u=>u.id==='<UNIT-ID>'),null,2))"`
   Read `description`, `agentNotes`, `validationCmd`, and inline drafts.

3. **Claim before work** (concurrency control — mandatory).
   Before any code edits, commit a 1-line standalone change to
   `orchestration.json` setting `status: "claimed"`, `claimedBy: "<agentId
   or session label>"`, `claimedAt: "<ISO-8601-now>"` for each unit you
   intend to execute. Commit message: `chore(orch): claim <unit-id> for
   <agentId>` (or `claim N units for <agentId>` for a batch). This is the
   FIRST commit after `git reset --hard <branch>` — it lets parallel peers
   skip the unit when they scan eligibility. Skipping this step is how
   parallel pods produce collision commits on the same orchestration lines.
   Canonical protocol: `docs/ai/AGENT_GUIDELINES.md` §7. Stale-claim audit:
   `node scripts/audit-claims.mjs` (>4h threshold; fresh agents may steal
   by overwriting `claimedBy`/`claimedAt`).

4. **Execute autonomously.** Follow Adrian's house style (validated across
   8p-1..8p-7):
   - Drafts are starting points, not requirements. If a draft contradicts
     repo reality, adjust it (8p-2 substituted HdsField → HdsLabel because
     HdsField doesn't exist).
   - Atomic manifest writes: read, mutate in memory, write once.
   - One unit = one commit. Message format: `feat(<scope>): <unit-id> <one-line>`.
     End every commit body with `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`.
   - Mark `"status": "done"` + `"completedAt": "<YYYY-MM-DD>"` in
     `orchestration.json` on green, in the same commit as the unit work
     (transitions `claimed → done`; `claimedBy`/`claimedAt` may stay as
     audit trail or be cleared, both pass validation).
   - On abort/blocker: revert `claimed → approved`, clear
     `claimedBy`/`claimedAt`, document the blocker in `agentNotes`.

5. **Pre-commit gate (all four MUST exit 0 before any commit):**
   ```
   node scripts/run-validator-tests.mjs
   node scripts/test-retry-loop.mjs
   node scripts/validate-manifest.mjs
   node scripts/check-manifest-drift.mjs
   ```

6. **CONTINUE — DO NOT STOP.** After each unit's commit, **immediately
   loop back to step 1 and grab the next eligible unit.** This is the
   night-shift expectation — chain until queue is drained or a stop
   condition fires. Do not wait for operator confirmation between units.
   Do not write a per-unit status report; only at session end /
   stop-condition / queue-drain.

   **Adjacent dirty-tree handling (Adrian directive 2026-05-01):**
   - WIP matching another agent's active claim (< 4h old) → DO NOT TOUCH;
     stage your own files explicitly with `git add <path>`.
   - Untracked test artifacts (`test-results/`, `playwright-report/`) →
     leave; gitignored or sweepable.
   - Orphan WIP (no matching claim, no commit in 4h, looks left over from
     a recently-done unit) → `git checkout -- <path>`. Otherwise log
     `[ORPHAN-WIP] <files>` in your run-log and leave for morning review.

   **None of the following are stop conditions** (keep looping after
   handling): a single unit failing once and then passing on retry;
   adjacent WIP from another agent's active claim (work around it);
   `orchestration.json` merge conflicts (resolve by keeping HEAD's
   structure and patching your unit's status, then continue).

**Stop conditions** (return to Adrian for a decision):
- A `validationCmd` fails twice with different error messages.
- A change would modify a schema already consumed by a `done` unit.
- The user's intent is genuinely ambiguous after re-reading the request twice.
- An unauthorized destructive or remote-visible action would be required
  (push, force-push, PR comment, schema delete, etc.).

**Hard rules:**
- **Never** run `pnpm check:release` (10+ minutes, not part of any unit gate).
- **Never** open units in the `backlog` phase without explicit instruction.
- **Never** push to remote without explicit instruction.
- **Never** promote a `--soft` gate to hard-fail with residual warnings.
- **Never** use `--no-verify` or skip hooks unless Adrian asks.
- **No new npm dependencies.** Native Node + Figma Plugin API only.

**Adrian's voice** (from `feedback_approach.md` memory): "Execute
autonomously. Read routing docs first, write the changes, verify,
then report. Self-heal failures silently before reporting back. When
a phase is confirmed working, move to the next one immediately. Don't
re-explain things that are already done."

The rest of this document is context — §1 system description, §2 start
checklist, §5 decision rules, §7 safety rules. Historical sprint logs
have been archived to `docs/ai/OPERATOR_BRIEF_ARCHIVE.md`.

---


## 1. What this build is

A proprietary, mostly-zero-dependency DesignOps engine that uses a
local LLM (Hermes3 via Ollama) to generate Figma UI from natural-
language prompts. Three processes:

  CLI (scripts/generate-to-figma.mjs)
    → LLM (hermes3 at localhost:11434)
    → Bridge (scripts/hds-bridge.mjs at localhost:3005)
    → Figma Plugin (figma-agent-plugin/code.js)

The plugin draws the result on canvas. A validator suite (the
"AST Gatekeeper") checks LLM output against the manifest before
the bridge accepts commands.

## 2. Where to start every session

1. Read this file.
2. Run `node scripts/orchestration-watcher.mjs --once --quiet` to refresh
   `docs/ai/ready-queue.json`, then read it — pre-computed eligible list,
   far cheaper than loading the full orchestration.json.
3. Read CLAUDE.md for the agent execution protocol.
4. For component work, read `public/hds-manifest-agent.json` (65KB lean
   projection) instead of the full `public/hds-manifest.json` (333KB).
   Full manifest only needed for slot/tokenMapping/Figma work.
5. Read the relevant rules doc for whatever you're touching:
   - docs/ai/rules/REACT_COMPONENTS.md
   - docs/ai/rules/FIGMA_BRIDGE.md
   - docs/ai/rules/MANIFEST_SYNC.md
6. Run `git log --oneline -5` to confirm build state.


## 5. Decision rules (the "house style")

These are the patterns that have produced a clean build. Don't
deviate without an explicit reason logged in
`docs/logs/AI_DECISION_LEDGER.md`.

1. **Manifest as source of truth.** The manifest at
   `public/hds-manifest.json` is the only authoritative description
   of components. The compiler, validators, and Figma plugin all
   read from it. Never duplicate manifest data into another file.
2. **Fixtures before code.** Every Phase 2+ unit has fixtures
   committed BEFORE its implementation. The fixture is the contract.
3. **Feature-flag everything.** New behavior lands behind a flag
   in `bridge.config.json`. Default false. Flip true only after
   tests + 24h clean telemetry.
4. **Telemetry through the logger.** All new pipeline stages log
   to `telemetry/events.jsonl` via `telemetry/logger.mjs`. Never
   `console.log` for command-flow events.
5. **One commit per phase.** A phase's commit message follows the
   pattern `feat(gatekeeper): complete Phase N — <name>`. Don't
   merge phases.
6. **Schemas are immutable.** Once a unit's output schema is
   committed (e.g. validator error format), it can only be
   extended additively. Breaking changes require a version bump.
7. **No "fixing" the fixture.** If a test fails, fix the
   implementation. The fixture defines correctness.
8. **Investigation before construction.** Before writing a new
   handler, run the 5-minute recon: `git log -S "<keyword>"`,
   `grep -rn "<keyword>"`. The codebase often already has what
   you'd otherwise build.


## 7. Non-negotiable safety rules

- **Never modify files in `/mnt/skills/`, `/mnt/transcripts/`, or
  any read-only mount** if running in a sandboxed environment.
- **Never delete files outside `node_modules/` and `dist/`** without
  explicit user confirmation.
- **Never commit secrets.** `.env.local` exists and is gitignored.
- **Never run `pnpm check:release`** without explicit user request —
  it does Lighthouse + visual regression + a11y + size limits and
  takes 10+ minutes.
- **Never enable a feature flag without running the unit's
  validationCmd first.**


## 9. Self-check before any commit

After writing code, before committing:

```bashnode scripts/run-validator-tests.mjs   # all validators still pass
node scripts/test-retry-loop.mjs       # retry loop still works
node scripts/validate-manifest.mjs     # manifest stays valid
node scripts/check-manifest-drift.mjs  # compiler/manifest agree

All four MUST exit 0. If any fail, fix before committing.

## 10. When to stop and ask

- A unit's `validationCmd` fails twice with different error messages.
- A change would modify a schema already consumed by a "done" unit.
- Telemetry shows >10% retry-exhaustion rate.
- Any auth or HMAC check fails.
- The user's intent is genuinely ambiguous after re-reading the
  request twice.

In all other cases, proceed autonomously and report what you did.
