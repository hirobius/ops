# Overnight orchestration kickoff — 2026-05-05

**For: Adrian, opening a new Claude Code session to start the overnight build.**

This is the entry-point doc. Everything you need to kick off + sleep on it lives here.

## TL;DR — three commands

```bash
# 1. Verify the watchdog still passes its self-test (defensive — confirms nothing
#    drifted between session-end and session-start).
node scripts/swarm-watchdog.mjs --self-test
# expect: exit 0

# 2. (Optional) Re-run the full robustness battery — 13/13 PASS expected.
node scripts/swarm-watchdog.mjs --robustness-test
# expect: exit 0; report regenerated at docs/ai/swarm-watchdog-robustness-2026-05-05.md

# 3. Start the watch loop via the auto-restart pulse wrapper. Conservative caps.
bash scripts/swarm-watchdog-pulse.sh
# (defaults to --max-pods 1 --max-hours 4 --max-cost-usd 3 --max-attempts 2 --watch)
```

The pulse wrapper restarts the watchdog automatically if it dies (transient
errors, OS hiccups, etc.) — Adrian's directive: "constantly build until I
interrupt in the morning." Ctrl-C in the wrapper's terminal stops everything.

If you'd rather run the watchdog directly without auto-restart:
```bash
node scripts/swarm-watchdog.mjs --watch \
  --max-pods 1 --max-hours 4 --max-cost-usd 3 --max-attempts 2
```

The watchdog logs every cycle to `docs/ai/swarm-watchdog.log` and writes
structured decisions to `docs/ai/swarm-watchdog-decisions.jsonl`. The pulse
wrapper logs its restart events to `docs/ai/swarm-watchdog-pulse.log`.

## What it will do

The watchdog polls `docs/ai/orchestration.json` every 60s. Per cycle:

1. Revert any stale claims (`claimed` for longer than the per-model wall-clock cap).
2. Check overall caps (concurrency, cost, wall-clock). Stop if any hit.
3. Find the highest-priority `safeForUnattended: true` unit whose dependsOn are all done AND whose intended file paths don't overlap with any in-flight claim or uncommitted human work.
4. If it finds one: log a `would-dispatch` decision. (The actual Agent dispatch happens in the parent session that consumes the decisions.jsonl line — this seam is where Tier 2 / Tier 3 reasoning will plug in later.)
5. Sleep, repeat.

## Expected dispatch order

Currently 4 units are flagged `safeForUnattended: true`:

```
1. 13g-7-wiring-tamper-resistance       ← FIRST P0
2. 13g-15-locked-node-version           backup if 13g-7 finishes early
3. 13g-9-precommit-structure-hash       depends on 13g-7 (will defer until 13g-7 done)
4. 13g-4-overlap-detector               Wave 1 closure remnant
```

`13g-9` won't dispatch until `13g-7` lands `done` because of `dependsOn`. Watchdog handles that automatically.

## Caps in effect

| Cap | Value | Effect |
|---|---|---|
| Max parallel pods | 1 | Watchdog refuses to dispatch a second when one is in-flight |
| Max wall-clock | 4 hours | Watchdog exits gracefully when the session has been running 4h |
| Max cost (24h cumulative) | $3 USD | Watchdog reads `telemetry/events.jsonl`; aborts when sum exceeds $3 |
| Max attempts per unit | 2 | Unit is auto-`parked` after 2 watchdog-driven aborts |
| Per-pod wall-clock | 30min sonnet / 60min opus / 15min hermes / 8min kimi | Stale-claim revert per claim |

Override any cap with the matching CLI flag.

## How to verify the watchdog is alive

```bash
# In a second terminal:
tail -f docs/ai/swarm-watchdog.log
# Or:
ps aux | grep swarm-watchdog
```

Expect a poll log line every ~60s (interval is configurable via `--poll-interval-ms`).

## Morning-after sanity check

```bash
# What did the watchdog do?
cat docs/ai/swarm-watchdog.log

# What dispatch decisions did it record?
tail -20 docs/ai/swarm-watchdog-decisions.jsonl

# What units changed status?
git log --oneline --since="last night"

# Are any units stuck "claimed" (shouldn't be)?
node scripts/swarm-watchdog.mjs --status
```

Any unit in `parked` status needs Adrian-attention review (read its `lastAbort.reason`). Otherwise the morning state is what the watchdog left.

## Recovery if something went wrong

**A claim is "claimed" but the agent is gone:**
The watchdog auto-reverts on next cycle (per-model cap). If you want to force it: `node scripts/swarm-watchdog.mjs --cycle-once`.

**The orchestration.json is corrupted:**
Restore from `docs/ai/snapshots/orchestration.YYYY-MM-DD.json` (when 13g-25 ships). Until then: `git checkout docs/ai/orchestration.json` reverts to the last commit.

**The watchdog itself crashed:**
Just restart with the same command. The boot context loads fresh; in-flight orphan claims will revert on first cycle.

**Cost cap hit prematurely:**
Tune `--max-cost-usd` higher OR investigate which unit burned the budget (read `telemetry/events.jsonl`).

## Robustness evidence

The watchdog passed all 13 robustness tests on 2026-05-05.
Full evidence: `docs/ai/swarm-watchdog-robustness-2026-05-05.md`.

## Why these caps are "conservative"

CLAUDE.md's standard parallel-pod cap is 6–8. We're using 1.
- First night under a brand-new watchdog = wide safety margin
- Single-pod runs eliminate cross-contamination as a class
- $3 cap is enough for ~2-3 sonnet pods worth of work; aborts if anything runs away

After 1-2 successful nights, raise to `--max-pods 2 --max-cost-usd 5 --max-hours 6` (CLAUDE.md "Standard").

## What's NOT happening tonight

- No `--no-verify` bypasses (CLAUDE.md hard rule)
- No `git push` (CLAUDE.md hard rule)
- No `pnpm check:release` (CLAUDE.md hard rule)
- No Vercel deploys
- No visual UI work (the `safeForUnattended: false` policy keeps these attended)
- No agent runner modifications (`13g-8` dispatched via Claude Code Agent, not via the runners themselves)

## When to come back to this doc

Every overnight session should start by reading this. Update it as the
hardening cluster progresses (more units gain `safeForUnattended`, caps
relax, etc.).

## References

- Roadmap: `docs/guardrails/HARDENING_ROADMAP.md`
- Memory pointer: `~/.claude/projects/.../memory/project_hardening_overnight.md`
- Policy file (Adrian-editable): `docs/ai/watchdog-policy.json`
- Decisions log (append-only): `docs/ai/swarm-watchdog-decisions.jsonl`
- Activity log (append-only): `docs/ai/swarm-watchdog.log`
- Robustness battery results: `docs/ai/swarm-watchdog-robustness-2026-05-05.md`

---

# For the new-session assistant (NOT Adrian — read this if you're an LLM)

You are the Claude Code assistant in the session Adrian opened to kick off the overnight build. The watchdog runs as a background process in a separate terminal; YOU are the dispatch executor. Your job:

## Boot sequence

1. **Read the canonical state files** before doing anything:
   - `docs/guardrails/HARDENING_ROADMAP.md` — full roadmap
   - `docs/ai/watchdog-policy.json` — declarative dispatch rules
   - `docs/ai/swarm-watchdog-decisions.jsonl` — what the watchdog has been observing/deciding (tail the last 50 lines)
   - `docs/ai/swarm-watchdog.log` — watchdog activity log
   - `docs/ai/orchestration.json` — current unit queue with `safeForUnattended` flags
2. Confirm the watchdog is alive: `pgrep -f swarm-watchdog` should return a PID. If not, ask Adrian to start it before you proceed.
3. Boot context will tell you the active sprint cluster (`13g-hardening`), the first eligible unit (`13g-7-wiring-tamper-resistance`), and any in-flight claims.

## Your role: dispatch executor

The watchdog logs `decision: 'would-dispatch'` lines but **does NOT actually invoke Agent tool** (it's a Node CLI; can't reach the in-window Agent tool). Your responsibility:

1. **Tail `docs/ai/swarm-watchdog-decisions.jsonl`** (read last 5–10 lines after each dispatch action).
2. **When you see a fresh `would-dispatch <id>` line:**
   - Read the unit spec from `docs/ai/orchestration.json` for that ID
   - Confirm it's still `status: approved` (the watchdog might have advanced state between writes)
   - Invoke the Claude Code Agent tool with `subagent_type: general-purpose`, `model: sonnet`, `isolation: worktree`, and a CLAUDE.md-aligned lean prompt referencing the unit ID
   - The agent claims, works, and marks done autonomously
3. **After the agent completes**, write a synthetic telemetry event to `telemetry/events.jsonl`:
   ```jsonl
   {"ts":"<ISO>","event":"agent.dispatch.complete","data":{"unitId":"<id>","model":"sonnet","costUsd":<estimated>,"durationMs":<ms>,"ok":<bool>}}
   ```
   This closes the cost-telemetry gap (the watchdog reads cumulative cost from this file; Anthropic in-session charges aren't auto-logged here, so we manually log estimates).
4. **Re-tail decisions.jsonl** to see the watchdog's next would-dispatch.

## Boundaries

- **NEVER bypass the watchdog's safety calls.** If the watchdog says no eligible candidates, do not freelance dispatch. Either wait for new units to become eligible (after dependsOn resolves) or wake Adrian.
- **NEVER dispatch a unit with `safeForUnattended: false`** even if it's approved. The watchdog won't surface it; if you somehow think to, you're going off-policy.
- **NEVER use `--no-verify`** under any circumstance (CLAUDE.md hard rule).
- **NEVER push to remote** (CLAUDE.md hard rule).
- **NEVER modify the watchdog or watchdog-policy.json mid-run** without Adrian's explicit ack.
- **NEVER mark a parked unit `done`.** If a unit is parked, that's a signal — leave it for Adrian.

## When to stop and surface

- The watchdog has hit a cap (cost / wall-clock / consecutive-park) and exited
- An agent dispatched by you returns an error you don't understand
- A unit you dispatched parks (attempts ≥ 2)
- `git status` shows something concerning (large unstaged set, conflict markers)
- The decisions.jsonl shows a sequence of refusals that suggests a stuck queue

In any of these: **write a short summary to `docs/ai/overnight-status.md`**, including timestamp, what was dispatched, what landed, what's outstanding, what looks wrong. Adrian reads this in the morning.

## Tier 2 / Tier 3 reasoning — current honest state

The watchdog plan describes three tiers (rule-based core / Hermes second-opinion / Sonnet reflection). **Today, only Tier 1 is implemented.** Tiers 2 and 3 are stub hooks; the watchdog operates on rules alone.

That means:
- A "this unit parked twice — re-dispatch or abandon?" decision is currently rule-based (auto-park at attempts ≥ 2). No LLM consultation.
- A "morning summary synthesis" or "policy improvement proposal" is not yet generated.

This is fine for the first overnight. But don't claim self-improvement; what we have today is closed-loop logging — the substrate for self-improvement.

## Cost-telemetry gap — manual workaround

`scripts/kimi-agent.mjs` and similar background runners write to `telemetry/events.jsonl` natively. **Claude Code Agent dispatches from within a session do NOT.** So the watchdog's cost cap might not trigger on Anthropic charges from your dispatches.

Workaround: after each Agent.complete, you (the assistant) manually append a `{event: 'agent.dispatch.complete', data: {costUsd: <est>}}` line. Estimate cost from the Agent's `total_tokens` × the price table in `docs/ai/watchdog-policy.json`.

Future fix: a follow-up unit wraps Agent invocation in a thin wrapper that auto-logs.

## Permission to act

Adrian has **set bypass permissions on** for this session, meaning you can run tools without asking each time. Use this responsibly:

- DO: invoke Agent on a watchdog-approved candidate, write telemetry, commit results
- DO NOT: invent new orchestration units, modify the watchdog, modify policy, push to remote, deploy

If in doubt — STOP. Append to `docs/ai/overnight-status.md`. Wait for Adrian.

---

## Agent-proposed unit additions (Mario's self-extension seam)

Per Mario Zechner's pi-agent argument: when a dispatched agent encounters a blocker that needs a new tool / unit / fix-it-first prerequisite, it should be able to PROPOSE that work without going off-spec. The mechanism:

**File:** `docs/ai/proposed-units.jsonl` (append-only, one JSON object per line).

**Line schema:**
```jsonl
{"ts":"<ISO>","fromUnitId":"13g-7-wiring-tamper-resistance","reason":"blocker"|"side-quest"|"cleanup","urgency":"now"|"next"|"eventually","proposedUnit":{"id":"13g-Xa-helper","name":"...","description":"...","dependsOn":[],"validationCmd":"...","agentNotes":[],"tier":"T1","model":"hermes3","effort":"min","safeForUnattended":false}}
```

**Behavior:**
- Watchdog SURFACES new proposals each cycle in its log + decisions.jsonl with `decision: 'proposal-surfaced'`.
- Watchdog does **NOT** auto-promote into orchestration.json — that's a conservative default. Adrian reviews proposals in the morning.
- Future Tier 2 hook (Hermes second-opinion) can be wired to auto-promote tightly-scoped proposals (additive, in-cluster, small estimate). Not enabled tonight.

**When to instruct a dispatched agent to propose:** if the agent reports "I cannot complete unit X because Y is missing/broken" — instead of marking abort, instruct it to:
1. Append the proposal line to `proposed-units.jsonl`
2. Mark its own unit `parked` with lastAbort.reason: "proposed prerequisite Y; see proposed-units.jsonl"
3. Watchdog picks up the next eligible candidate; Adrian reviews the proposal.

Closes the "self-extension" loop without ceding control to autonomous unit creation.

## Boris's verification-iteration pattern

Boris Cherny's claim: verification-feedback loops yield 2-3x quality. Currently each attempt of a unit starts cold without the previous failure's specifics. The pattern we want (deferred to `13g-8` when it lands):

When an agent's validationCmd fails post-mark-done:
1. Capture stdout/stderr into `lastAbort.validationOutput`
2. Decrement attempts to allow one re-try
3. Next agent's prompt includes the previous failure verbatim so it corrects the specific issue, not re-tries blindly

Today's behavior: attempts ≥ 2 → park, no inter-attempt feedback. Acceptable for the first night; tighten when `13g-8` ships.
