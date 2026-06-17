# Overnight build status — 2026-05-05

Live. Dispatch executor: in-window Claude Code Sonnet/Opus assistant.

## Boot

- 2026-05-05T08:25Z — watchdog `--self-test` exit 0; identifies 3 eligible candidates (13g-4, 13g-7, 13g-15).
- 2026-05-05T08:26Z — pulse wrapper started: `--max-pods 1 --max-hours 6 --max-cost-usd 10 --max-attempts 2 --watch` (more generous than handoff defaults; per Adrian's launch command).

## Deviations from handoff

- **No `isolation: worktree`** on Agent dispatches. Rationale: the watchdog reads `docs/ai/orchestration.json` from the parent repo for claim/done transitions; a worktree-isolated agent would claim in its own copy and the parent watchdog would re-dispatch the same unit on the next cycle. With `max-pods 1` there is no parallel-pod overlap risk, so worktree isolation buys no safety here. Single pod, single branch, agent commits directly to `fix/ui-pipeline`.

## Dispatches

### 13g-7-wiring-tamper-resistance — DONE (2026-05-05T09:30Z)
- Model: sonnet, no isolation
- Tokens: 77,981 — est. cost $0.23
- Duration: 12m 46s, 56 tool uses
- Commits: c6821505 (main) + d6b8d978 (audit-gate fix)
- Self-test: 8/8 fixtures pass; audit 1/1 clean
- Notes: agent had to amend the unit description (removed fictional path ref) to satisfy audit-batch-deliverables. Worth flagging for future units — descriptions sometimes leak invented file names that the audit then refuses.

### 13g-9-precommit-structure-hash — DONE (~2026-05-05T08:51Z)
- Model: sonnet, no isolation
- Tokens: 58,704 — est. cost $0.18 (cumulative $0.41 / $10 cap)
- Duration: 8m 03s, 33 tool uses
- Commit: df238eb0
- Empirical proof: A baseline pass, B comment-insert still passes (canonicalization works), C real-gate-add fails with PRECOMMIT_HASH_DRIFT, D revert passes again. All 4 steps PASS.
- Audit: 1/1 clean.

### 13g-4-overlap-detector — DONE (~2026-05-05T09:05Z)
- Model: sonnet, no isolation
- Tokens: 73,104 — est. cost $0.22 (cumulative $0.63)
- Duration: 11m 28s, 50 tool uses
- Commit: dd1d09f6
- Self-test: 6/6 fixtures pass; kimi-agent.mjs claim-flow hooked; registry entry firingChannel=manual.
- Audit: 1/1 clean. Validate-guardrail-registry: 69/69, 70 gates wired total.

### 13g-15-locked-node-version — DONE (~2026-05-05T09:11Z)
- Model: sonnet, no isolation
- Tokens: 42,217 — est. cost $0.13 (cumulative $0.76)
- Duration: 4m 30s, 25 tool uses
- Commit: 0467c1da
- Changes: `.nvmrc` pins v25.9.0 exactly; `package.json` adds `engines: { node: ">=20", pnpm: ">=8" }` (compatibility floor, not Adrian-only lock); `.claude/settings.json` two `cd C:/Users/Adrian/...` calls replaced with `cd $(git rev-parse --show-toplevel)` (cross-platform, no `uname` conditional needed).
- Audit: 1/1 clean.

## Steady state (2026-05-05T09:11Z)

**Eligible safeForUnattended candidates: 0.** Cluster 13g-hardening Wave 1 closed for the night.

The remaining 4 safeForUnattended-approved units (13s-strength-2/3/5/6) are blocked by `13s-strength-1-score-spec`, which is intentionally `safeForUnattended: false` ("Adrian-attended decision doc — no agent dispatch"). Per overnight-handoff §"Boundaries", I will NOT dispatch attended-only units. The 13s cluster waits for Adrian's morning review of the strength-score-spec ADR.

Watchdog continues idling at 60s cycle (`no eligible candidates among 49 approved units`). Pulse wrapper alive; will auto-restart on transient failure. Caps remaining: ~5h 15m wall-clock, $9.24 cost budget, 0 of 2 attempts on any unit.

## Tonight's totals

| Metric | Value |
|---|---|
| Units shipped | 4 (13g-7, 13g-9, 13g-4, 13g-15) |
| Total tokens | 251,006 |
| Total est. cost | $0.76 |
| Total agent time | 36m 27s |
| Total commits | 9 (4 claims + 4 deliverables + 1 description fix) |
| Audit pass rate | 4/4 |
| Empirical-proof passes | 13g-7: 8/8 fixtures · 13g-9: 4/4 manual steps · 13g-4: 6/6 fixtures · 13g-15: validationCmd green |
| New deterministic gates added to registry | 2 (`validate-orchestration` strict-argv binding + `check-unit-overlap` runtime hook) |
| Self-improvements to existing gates | 2 (wiring validator now line-by-line + tamper-resistant; precommit structure hash drift detection) |

## What this unblocks for tomorrow

- `13g-7` + `13g-9` together close the wiring-honesty deterministic principle of the 7-principle hardening roadmap. Both registered, both fixture-proven, both firing on real bad-input.
- `13g-4` enforces the parallel-pod overlap rule deterministically — kimi-agent now refuses claims that overlap with in-flight work. The watchdog already has this logic; now the kimi runner has it too.
- `13g-15` removes the last cross-machine reproducibility blocker (windows-only paths in hooks) and locks the dev Node baseline.

## What's next, awaiting Adrian

1. **Review `13s-strength-1-score-spec`** (the ADR for the System Strength composite). Once authored, the 4-unit 13s-strength chain unblocks for autonomous dispatch.
2. **Consider raising caps** per the handoff doc's "After 1-2 successful nights" guidance: `--max-pods 2 --max-cost-usd 5 --max-hours 6`. The watchdog and overlap-detector now make 2-pod operation deterministically safe.
3. **Review `proposed-units.jsonl`** — empty tonight, no agent surfaced a blocker.

No anomalies. Nothing parked. No claims stranded. Watchdog alive.

## Session end (2026-05-05T09:14Z)

Dispatch executor (Claude Code session) wrapping up. Watchdog process **3102159** still alive in the background, will continue cycling at 60s intervals for the remaining ~5h 15m of its `--max-hours 6` budget (or until SIGINT / cap hit / Adrian's morning review).

Working tree state at session end:
- Untracked: `docs/ai/overnight-status.md` (this file), `docs/ai/overnight-resume-prompt.md` (resume kickoff prompt for the next session). Both are intentionally left untracked so Adrian sees them fresh.
- Modified: `docs/ai/swarm-watchdog-decisions.jsonl` (continuously appended by the watchdog — expected), `public/hds-manifest.json` (was modified before this session started — out-of-scope).

Memory updated: `~/.claude/projects/.../memory/project_hardening_overnight.md` reflects Wave 1 closure + the 13s-strength chain blocker + the manual cost-telemetry schema. Next agent will read this on session boot.

Resume prompt persisted at `docs/ai/overnight-resume-prompt.md` (paste verbatim into a new session).

**Minor data-quality note.** Three of the four agents wrote rounded `completedAt` timestamps in `orchestration.json` (e.g., `2026-05-05T09:30:00Z`, `2026-05-05T10:30:00Z`) instead of true wall-clock ISO timestamps. The truthful per-unit completion times are in `telemetry/events.jsonl` and the git commit timestamps. Not blocking but worth a future tightening — perhaps add an `audit-batch-deliverables` rule that the `completedAt` ISO must be within ±5 min of the deliverable commit's authored-time. Filed mentally as a candidate proposed-unit; not appended to `proposed-units.jsonl` because it's a polish item, not a blocker.
