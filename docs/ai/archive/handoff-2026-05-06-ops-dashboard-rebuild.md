# Handoff — `/ops` agentic OS dashboard rebuild

> Paste this verbatim into a fresh Claude Code session. Plan was scoped + approved with Adrian in the prior session; this doc is the resume point. The build is ~7 hrs of focused work, single foreground track.

---

## What you are doing

Build a real internal observability + control surface at `/ops`, replacing the current BriefingPage. Adrian's directive: **no theater, every metric reads truth, every button does a real thing, mobile-first**. This is the daily landing surface when Adrian sits down to direct agent traffic — and eventually the demo asset for selling agentic OS to clients.

**Authoritative plan:** `~/.claude/plans/scope-this-out-fluffy-naur.md` — read it FIRST. Has full architecture, file list, surface specs, implementation order, verification, risks. Don't improvise the design; the plan was iterated three times against Adrian's feedback to get to "real over theatrical."

## Read these in order before any code

1. `~/.claude/plans/scope-this-out-fluffy-naur.md` — the plan; THE source of truth for this build
2. `docs/ai/handoff-2026-05-05-pm-cluster-closeout.md` — what shipped this week (Phase 2 + `--json` rollout). Context for the data the dashboard reads.
3. `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/MEMORY.md` — index; especially `feedback_no_aspirational_guardrails.md`, `feedback_card_slot_system.md`, `feedback_outline_rule.md`, `feedback_ai_aesthetic_antipatterns.md`
4. `CLAUDE.md` §"Sub-agent dispatch rules" + `claude-config/skills/dispatch-unit/SKILL.md` — orchestration lifecycle if you spawn anything
5. `vite.config.mjs` lines 39–85 — the existing `ops-route-api` plugin pattern you'll mirror for the skill-runner
6. `src/app/pages/ops/BriefingPage.tsx` — the page being replaced; gives you imports + token usage patterns
7. `src/app/pages/ops/atlas/strength-tab.tsx` — has reusable Sparkline + DimensionBar logic if you want to lift it

## State at handoff

- **Score A: 67/100 · Score B: 78/100** (post-rebuild · was 68/78 before)
- **Closure plan:** 248 rows (no debt added by the rebuild)
- **Ratchets live:** `scripts/check-token-paths-ratchet.mjs` (158 baseline) + `scripts/check-fixture-stubs-ratchet.mjs` (76 baseline), both ci-pr severity:error
- **`--json` compliance:** 12/29 strict gates (41%)
- **Watchdog alive:** PID 3188467, `--max-pods 1 --max-hours 6 --max-cost-usd 10 --max-attempts 2`. Leave it.

### Shipped 2026-05-06

- **Commit:** `bcb631bc` — `feat(ops): rebuild /ops as agentic OS dashboard` (18 files, +2065 / −657)
- **New code:**
  - `scripts/skill-runner-middleware.mjs` — whitelisted dev-only POST `/api/skills/:id`
  - `scripts/snapshot-orchestration.mjs`, `scripts/list-eligible.mjs` — already tracked from `1644294e`; the dashboard wires them
  - `src/app/pages/ops/agentic-os/{AgenticOSPage,StatusBanner,KpiCards,SkillsBar,LanesGrid,TraceTable,StrengthFooter,data,lanes,skills}.tsx?` — all seven surfaces + pure data prep + skill catalog
- **Routing:** `/ops` → AgenticOSPage; `/ops/briefing` → original BriefingPage (archival access preserved)
- **Allowlist:** `scripts/audit-typography-overrides.mjs` lists every new agentic-os file
- **Verification:**
  - `pnpm typecheck` — clean
  - `pnpm lint --max-warnings=0` — clean
  - `pnpm test:layout` — 44/44 routes pass (incl. `/ops`, `/ops/briefing`)
  - `node scripts/run-gates.mjs --channel pre-commit` — all 14 gates green
  - 375px Chromium pass — 0 horizontal overflow, 0 console errors
  - Skill endpoint smoke: `POST /api/skills/strength` → 318ms, exit 0
  - Skill endpoint deny: `POST /api/skills/rm-rf-everything` → 403

## The 5 surfaces (top → bottom)

1. **Status banner** — one-sentence triage: "Healthy / N stale / N reverts last 24h". Logic in `data.ts`. Errors > stale > healthy precedence.
2. **KPI cards** — 3 cards: Active claims · Today's cost (sum routing-log projectedUsd, today UTC) · Errors+stale count (recentReverts + staleClaims)
3. **Skills bar** — 8 buttons calling `POST /api/skills/<id>` via the new vite plugin. Whitelist hard-coded server-side. JSON-output skills (`list-eligible`, `audit-claims`, `verify-head`) expand inline as result panels.
4. **Lanes** — Foundation / Ops Center / Quality / Generative UI / Clients / Backlog / Misc. Each card: count active · status pill · last-activity ts · top 2 unit IDs · click-through.
5. **Trace table** — unified stream from 5 JSONLs (`routing-log`, `swarm-watchdog-decisions`, `firing-log`, `agent-audit-log`, `events`). Last 50, ts desc. Filter chips. Mobile = stacked cards, desktop = table.

Demoted to **footer**: Score A/B + sparklines + `--json` compliance bar.

## Skill whitelist (all 8 → real wired commands)

```
closure-plan   → pnpm closure:plan                 (60s)
strength       → pnpm strength                     (30s)
firing-stats   → pnpm guardrail:firing-stats       (30s)
audit-claims   → node scripts/audit-claims.mjs     (15s)  -- check whether it has --json mode; extend if missing
verify-head    → node scripts/run-gates.mjs --channel pre-commit --emit-jsonl docs/guardrails/firing-log.jsonl  (90s)
snapshot-orch  → node scripts/snapshot-orchestration.mjs   (5s)
list-eligible  → node scripts/list-eligible.mjs --json     (5s)
audit-sidecar  → pnpm audit:sidecar                (30s)
```

Server-side whitelist is exhaustive; anything not in the table returns 403.

## Files you'll touch (full list)

**Create:**
- `scripts/skill-runner-middleware.mjs` — whitelist + spawn + JSON parse
- `src/app/pages/ops/agentic-os/AgenticOSPage.tsx` — page
- `src/app/pages/ops/agentic-os/StatusBanner.tsx`
- `src/app/pages/ops/agentic-os/KpiCards.tsx`
- `src/app/pages/ops/agentic-os/SkillsBar.tsx`
- `src/app/pages/ops/agentic-os/LanesGrid.tsx`
- `src/app/pages/ops/agentic-os/TraceTable.tsx`
- `src/app/pages/ops/agentic-os/StrengthFooter.tsx`
- `src/app/pages/ops/agentic-os/data.ts` — pure parsing/aggregation
- `src/app/pages/ops/agentic-os/skills.ts` — IDs + labels + runSkill()
- `src/app/pages/ops/agentic-os/lanes.ts` — lane definitions

**Modify:**
- `vite.config.mjs` — add `ops-skills-api` plugin alongside `ops-route-api` at line 39
- `src/app/routes.tsx` — at `path: 'ops'` index, swap BriefingPage → AgenticOSPage; add `/ops/briefing` archival route
- `scripts/audit-typography-overrides.mjs` — update allowlist entry from old path to new path

**Commit but don't author (already drafted):**
- `scripts/snapshot-orchestration.mjs` — verify it runs, commit
- `scripts/list-eligible.mjs` — verify it runs, commit

**Delete:**
- `src/app/pages/ops/AgenticOSPage.tsx` — replaced by new path under `agentic-os/`

## Implementation order (~7 hrs, single foreground)

1. ~45 min — skill-runner middleware + vite plugin. Verify with `curl -X POST http://localhost:3000/api/skills/strength` → real run + real stdout.
2. ~45 min — `data.ts` pure functions: parseOrchestration, parseJsonl, computeStaleClaims, computeTodayCost, unionTraceEvents.
3. ~20 min — `lanes.ts` + console-log lane bucket counts to verify totals match orchestration.json's 445 units.
4. ~30 min — `skills.ts` + `runSkill()` fetch wrapper.
5. ~30 min — `StatusBanner` + `KpiCards`.
6. ~45 min — `SkillsBar` with idle/running/success/error states + JSON result panels.
7. ~45 min — `LanesGrid`.
8. ~60 min — `TraceTable` with filter chips + drawer.
9. ~15 min — `StrengthFooter`.
10. ~20 min — wire in `AgenticOSPage` + route swap.
11. ~30 min — 375px mobile pass.
12. ~30 min — verification (see plan).

## Hard rules (do NOT violate)

- NEVER push to remote
- NEVER touch `.env*` files
- NEVER `pnpm check:release` or any deploy command
- NEVER `--no-verify`. If pre-commit blocks you, fix the underlying issue.
- Use existing components (Page, Stack, Badge, Stat) — don't author new primitives
- Use `hds` token imports — no hardcoded hex / spacing / fonts (token-paths + canon gates will catch it)
- Inline styles are allowed in this page only (the file lives in `audit-typography-overrides` allowlist; that exemption follows the file at its new path)
- Page must work cleanly at 375px viewport — Chrome DevTools mobile first, real touch targets ≥44px
- Every skill button must run a real script. No buttons without backends.
- Every metric must read real data. No placeholders. If data is missing show "no data" not "—".

## Verification (each must pass before claiming done)

1. `pnpm dev` running on `:3000`
2. `/ops` lands on the new dashboard; `/ops/briefing` archival access works
3. All 8 skill buttons → click triggers real script execution → toast shows real output
4. Status banner reflects real triage state (test by manually setting a unit to claimed-stale → banner flips to ⚠)
5. Lane counts sum to total `units.length`
6. Trace table shows ≥3 sources, ts-sorted, filter chips work, drawer shows full event JSON
7. Footer scores match `docs/guardrails/strength-report.json` byte-for-byte
8. 375px DevTools: no horizontal scroll, all sections reachable
9. `pnpm typecheck` clean · `pnpm lint --max-warnings=0` clean · pre-commit gates pass

## Pre-commit reminders (these have bitten me)

- `check-template-source-of-truth` blocks if `public/hds-manifest.json` modified without `scripts/generate-manifest.mjs` change. If you touch the manifest, run `pnpm manifest:generate` so source + output stay in sync. If you only touch downstream auto-regen artifacts, `regen-only` in the commit message bypasses (but only when it's truly regen-only).
- `check-validator-wiring` recomputes `precommitStructureHash`. If you edit `.husky/pre-commit` (you shouldn't need to), run `node scripts/update-precommit-hash.mjs` and commit registry.json with the hook change.
- `check-token-paths-ratchet.mjs` is now wired (ci-pr, severity:error). It asserts `.token-path-baseline.txt` count strictly decreases. Don't write code that adds new unresolved token-path references.

## When done

- Update `docs/ai/handoff-2026-05-06-ops-dashboard-rebuild.md` "State at handoff" with final scores + commits
- Append a one-paragraph summary to `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/project_hardening_overnight.md`
- Run `pnpm strength` to refresh the report
- Run `pnpm closure:plan` to confirm no new debt
- Tell Adrian: dashboard live at `/ops`, X commits shipped, mobile pass clean, here are the screenshots (he wants to see it)

---

## What this enables once shipped

- Daily traffic-direction: Adrian sits down, opens `/ops`, sees what's running + what's stuck + hits buttons to keep things moving
- Mobile triage: at 6am he can check the agency's health from his phone before laptop time
- Sales asset (eventual): when he pitches agentic OS to clients, this surface IS the demo
- Lower babysit cost: 8 buttons replace 8 commonly-typed terminal commands with one click each
- Honest debt picture: the lanes show where the active work is across all agency areas, not just the hardening cluster

The frame is Chase AI's three-layer agentic OS: **Architecture** (orchestration.json + watchdog — already there), **Memory** (claude-config skills + memory dir — already there), **Observability** (this build). When this lands, the agentic OS is functionally complete for solo daily use.
