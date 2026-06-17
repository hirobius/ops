# Resume Prompt — paste verbatim into a fresh session

> Use this when starting a new Claude Code session to continue Hirobius hardening work. Last refreshed: 2026-05-05 PM session.

---

You are resuming Hirobius DesignOps work mid-stream. **Read these files FIRST in order, before anything else:**

1. `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/MEMORY.md` — index of all prior memory
2. `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/project_hardening_overnight.md` — current operational state (most recent updates at top)
3. `docs/guardrails/SYSTEM_OVERVIEW.md` — auto-generated 30-second system snapshot (Score A/B, top weakest dims, active sprint)
4. `docs/guardrails/HARDENING_ROADMAP.md` — full hardening roadmap, 7 deterministic-gate principles, two parallel strength scores
5. `claude-config/skills/dispatch-unit/SKILL.md` — Hirobius-native orchestration lifecycle skill (use this for any unit dispatch)
6. `CLAUDE.md` — repo-level rules (esp. §1a discoverability + §"SUB-AGENT DISPATCH RULES")

## Where things stand

**Score A: 59/100 (5/6 wired)** · **Score B: 78/100 (3/8 wired)** as of last commit.

**Phase 2 trigger UNBLOCKED 2026-05-05.** All hardening dependencies done: 13g-3 ✓, 13g-7 ✓, 13g-8 ✓, 13g-10 ✓, 13g-11 ✓, 13g-15 ✓.

**Working tree state expected at session start:** auto-regen artifacts modified (strength-report.{json,md}, SYSTEM_OVERVIEW.md, hds-manifest.json, llms.txt, etc.). These regenerate on every commit — do NOT manually commit them; they ride along with the next real commit.

**Watchdog state:** `bash scripts/swarm-watchdog-pulse.sh --max-pods 1 --max-hours 6 --max-cost-usd 10 --max-attempts 2 --watch` likely still running from a prior session. Check with `ps -ef | grep swarm-watchdog | grep -v grep`. If alive, leave it. If dead, restart with the same command.

## Reasonable next moves (pick ONE)

### Option A — Phase 2 inventory pass (highest leverage)

Run the full strict gate set against the entire codebase to surface latent debt:

```bash
# Verify or add the --emit-inventory flag to run-gates.mjs first
node scripts/run-gates.mjs --channel ci-pr --emit-inventory > docs/guardrails/full-strictness-inventory.json
```

Then build `docs/guardrails/full-strictness-closure-plan.md` per the protocol in HARDENING_ROADMAP §Phase 2. Each debt class gets classified A/B/C/D (fix-all / baseline-and-burndown / bypass-with-reason / re-classify-the-gate).

This is the highest-leverage move on Score A — A6 (debt closure ratio) is currently `needs-wiring` because Phase 2 hasn't run.

### Option B — Hardening remnants (cluster cleanup)

Approved-not-done in 13g cluster:
- `13g-2-validator-self-register` — medium refactor of all check-*.mjs to auto-register
- `13g-12-postcommit-verifier` — catches `--no-verify` bypasses
- `13g-14-gate-firing-telemetry` — wires firing logs to /ops surface

`13g-13-learned-rules-promotion` is HITL by design — Adrian-attended only.

### Option C — Skills layer build-out

Install (Adrian runs in fresh prompt — `/plugin` is Claude Code slash command, NOT bash):
```
/plugin marketplace add obra/superpowers-marketplace
/plugin install superpowers@superpowers-marketplace
/plugin marketplace add anthropics/skills
/plugin install creative-skills@anthropic-agent-skills
```

Then build the next 2-3 Hirobius-native skills (Path B from prior session): `morning-brief`, `strength-snapshot`, `score-this-pr`, `client-status`, `ingest-call`. Use `skill-creator` to draft + iterate.

### Option D — Visual atlas remnants

`13w-ops-12-build-page`, `13w-ops-13a-live-pod-tail` — visual UI, attended-only.

## Standing rules (do NOT violate)

- NEVER `git push`
- NEVER touch `.env*` files
- NEVER run `pnpm check:release` or any deploy command
- NEVER use `--no-verify` to bypass pre-commit gates — fix the underlying issue
- ALWAYS run `audit-batch-deliverables --units <id>` before mark-done (per 13g-8)
- ALWAYS use `dispatch-unit` skill for orchestration units (claim → audit → mark-done lifecycle)
- ALWAYS use Python with `ensure_ascii=False` when writing orchestration.json (avoids unicode-escape diff explosion)
- NEVER haiku for autonomous dispatch (Adrian directive 2026-05-04)

## Cost telemetry (manual close-loop)

After each Agent.complete, append to `telemetry/events.jsonl`:
```jsonl
{"ts":"<ISO>","event":"agent.dispatch.complete","data":{"unitId":"<id>","model":"sonnet-4-6","totalTokens":<n>,"costUsd":<n*3/1e6>,"durationMs":<n>,"toolUses":<n>,"ok":<bool>,"commitShas":["..."]}}
```

Watchdog reads cumulative `costUsd` to bind its `--max-cost-usd` cap.

## Last session one-liner

PM 2026-05-05: shipped strength chain (1/2/3/4/5/6) + 13g-3 + 13g-11 + dispatch-unit skill. 8 commits, 8/8 audit pass. Phase 2 trigger now satisfied. Score A 56 → 59. Watchdog still alive. **Next: Phase 2 inventory pass OR Hirobius-native skill expansion.**
