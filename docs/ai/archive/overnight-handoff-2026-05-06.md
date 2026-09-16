# Overnight handoff — 2026-05-06

Adrian going to sleep. Three layers running unattended; heal-loop owns recovery.

## What's running

```
HEAL-LOOP (pid 3339253)         → singleton supervisor
  ├── swarm-watchdog-pulse      → announces eligibility, reverts stale claims (>4h)
  ├── hermes-unit-pulse          → executor for T1 + cheap T2 (Ollama, free)
  └── kimi-agent-pulse           → executor for T2/T3 (Moonshot, ~$0.10/unit)

Caps: --max-pods 4 --max-hours 12 --max-cost-usd 30 --max-attempts 2
```

Each pulse auto-restarts its child on crash. heal-loop auto-restarts pulses if any die. Self-healing without intervention.

## What just shipped (commit `0ae76d0b`)

The blocker was: `audit-batch-deliverables` checked `status==='done'` but agents called it BEFORE flipping status. Every mark_done failed. Units cycled claim → abort → claim → abort.

Fix: `--pre-mark-done` flag accepts `claimed` status and the still-set claim metadata. Agents pass it. Path-existence checks demote to warn-only in pre-mark-done mode (so `13z-3` deleting `docs/archive/` doesn't fail the gate).

Plus dashboard accuracy:
- `lanes.ts` foundation regex now includes `13y` and `13z`
- `AgenticOSPage` auto-refreshes every 30s + manual refresh button + page-load timestamp
- `KpiCards` Active sub shows agent names, not unit IDs

Plus pulse wrappers and heal-loop (this file's parent system).

## Recovery procedures

**Symptom: nothing committing for >15 min**

```bash
ps aux | grep -E '(hermes|kimi|heal-loop)' | grep -v grep
tail docs/ai/agent-heal-loop.log
tail /tmp/hermes-loop.out  # or /tmp/kimi-loop.out
```

If heal-loop is dead: `bash scripts/agent-heal-loop.sh > /tmp/heal-loop.out 2>&1 &`

**Symptom: heal log shows "5 rapid crashes"**

Pulse paused that agent for 30 min. Look at the heal-log entry — root cause is one of:
- Ollama not running → `ollama serve`
- Moonshot rate limit → wait, or pause kimi via `pkill -f kimi-agent-pulse`
- Pre-commit gate failing every commit → check `docs/guardrails/firing-log.jsonl`

**Symptom: claims stuck in `claimed` state**

Two possibilities:
1. Agent is genuinely working — let it run (qwen2.5-coder takes 3-8 min/unit).
2. Agent died mid-claim, claim is orphaned. Watchdog reverts after 4h.

Manual force-revert: edit `docs/ai/orchestration.json`, set `status: approved`, delete `claimedBy` + `claimedAt`. Agents re-claim within 60s.

**Symptom: pre-commit fails on agent's deliverable commit**

Likely a new gate caught a regression. Agent retries up to `MAX_KIMI_ATTEMPTS` (3) then quarantines (`hitl: true`). Quarantined units fall out of the queue — review in the morning.

**Symptom: file count growing instead of shrinking**

13z-1 (delete one-off files) didn't ship. Manual: `git rm vite-actions-check.log gitleaks-report.json CHANGELOG.md.bak .hermes-prompt.tmp` and add patterns to `.gitignore`.

## Stop everything

```bash
pkill -f agent-heal-loop.sh         # stops the supervisor
pkill -f swarm-watchdog-pulse.sh    # stops watchdog
pkill -f hermes-unit-pulse.sh       # stops hermes
pkill -f kimi-agent-pulse.sh        # stops kimi
# Or nuclear:
pkill -f 'pulse|heal-loop|swarm-watchdog'
```

## What to expect by morning

Burndown order: 13z cluster (7 units) → 13y-0 → 13y-1 through 13y-21 (22 units). Hermes also broadly grabbing 12q-* units (it doesn't honor `safeForUnattended` flag — that's a known bug; not blocking, just over-eager).

Best case: all 13z + most 13y land. ~25 commits, ~$5-12 spend, ~600 fewer findings tomorrow.

Worst case: a stuck unit blocks the chain. `git log --since='6 hours ago' --oneline | wc -l` tells you how many commits landed; if <5, something's wedged — check heal-log.

## Known limitations as of this handoff

1. `hermes-unit.findEligible()` doesn't filter by `safeForUnattended` — hermes will claim ANY approved+non-T4 unit. Watchdog respects the flag, hermes doesn't. Net effect: hermes does more work than the safe-overnight policy says it should. If overnight does land 12q stuff that breaks things, this is the cause.
2. `audit-batch-deliverables` (channel-run mode, called by `run-gates --channel manual` without `--units`) still throws. Doesn't affect agents (they pass `--units`). Watchdog channel-run will keep showing it as failing — cosmetic, not load-bearing.
3. Stale claims from killed agents persist for 4h until watchdog reverts. If you see weird claims at orange agentId, that's an orphan — heal-loop doesn't auto-release on agent restart (would be a 13y/13z follow-up).
4. The 508-prettier-dirty-files burndown is NOT happening — it's a separate cleanup. Files only get formatted when an agent edits them (staged-only gate).

## Single sanity check command

```bash
ls -la docs/ai/agent-heal-log.md && \
  tail -20 docs/ai/agent-heal-loop.log && \
  echo --- && \
  git log --since='6 hours ago' --oneline | head -10 && \
  echo --- && \
  node -e "const o=require('./docs/ai/orchestration.json');const c=o.units.filter(u=>u.status==='claimed');const d=o.units.filter(u=>u.id&&u.id.startsWith('13z-')&&u.status==='done');console.log('claimed='+c.length+' 13z-done='+d.length)"
```

If 13z-done > 0 by morning: gate fix worked. If 13z-done = 0 and claimed = 0: queue stuck, check heal-log.

---

## Post-handoff session — 2026-05-06 PM (assistant cleanup pass)

Adrian typed `go` ~13:51 PDT, immediately after the handoff commit. 4 commits landed in the cleanup pass:

| Commit | What |
|---|---|
| `c1353c41` | **Silent wedge fix** — `check-registry` was failing on every commit since `84498f98` (a colocated `HdsTocContext.test.tsx` was being treated as a page). Skip `.test.tsx` in the page collector. Pre-commit gates were running; this one specific gate kept exiting 1, blocking nothing visible because firing-log only records, doesn't gate — but it would fail any agent's pre-commit hook proper. |
| `699443ae` | **6 zombie hitl units → done** — 13y-2, 13y-3, 13y-8, 13y-14, 13y-16, 13y-18 already passed their deterministic gates. Kimi was looping `max iterations` on already-shipped work it didn't see. Cleared `hitl` / `_kimiQuarantined` / `_kimiAttempts` / `_kimiLastAbort`. |
| `de0efc93` | **13y-9** — 2 stale `docs/archive/` refs in OPERATING_MAP.md + SYSTEMS_REGISTRY.md (rot from 13z-3 archive cleanup). Spec also pointed at `scripts/check-doc-references.mjs` which doesn't exist; corrected to `check-link-integrity --doc-refs-only`. |
| `fb62c049` | **13y-10 + 13y-19 → done** — same validator-consolidation rot pattern. Both `check-route-links.mjs` and `check-external-links.mjs` were folded into `check-link-integrity.mjs` (with `--route-links-only` / `--external` flags). |

### Why kimi mass-quarantined overnight

Not "task too hard." Two systemic causes:

1. **Already-done work** — 7 of 24 hitl units pass their actual validator clean. Kimi loops because the gate is already green; `pre-mark-done` flag wasn't enough to short-circuit.
2. **Validator path drift** — 6 units' `validationCmd` points at scripts that no longer exist (consolidated into other gates). Kimi hits `MODULE_NOT_FOUND` and counts it as a failed attempt.

Token-budget aborts were a real third cause for some 13y units (e.g. `13y-1-tenant-css-tokenize` aborted at `tokens: 126875, iters: 10`), but that's the minority.

### Remaining 13 hitl units — categorized

Quick-lookup so the next session can skip re-derivation:

**Group A — bad validator path, needs investigation (4 units):**
- `13y-1-tenant-css-tokenize` → `scripts/check-css-values.mjs` missing. Closest existing gates: `check-tenant-tokens.mjs` (already in cmd), `check-css-integrity.mjs`. May need a new gate or just rely on `check-tenant-tokens` + manual `check-hardcoded-colors` exclude.
- `13y-15-sketches-inline-styles` → `scripts/check-inline-styles.mjs` missing. Likely an ESLint rule replaced it; check `pnpm check:inline-styles` if the script entry exists or the rule is wired into `check:fast`.
- `13y-17-component-docs-burndown` → `scripts/check-component-docs.mjs` missing. Likely folded into `audit-component-integrity.mjs --api`.
- `13y-20-public-api-decision` → `scripts/check-public-api.mjs` missing. No obvious replacement; may need decision from Adrian on whether the unit is even still in scope.

**Group B — real mechanical work (5 units):**
- `13y-4-sandbox-heading-outline` — add heading structure to SandboxPage; gate `pnpm lint --max-warnings=2`.
- `13y-6-token-descriptions-fill` — fill 29 missing token descriptions; gate `check-token-descriptions --no-missing`.
- `13y-11-ops-atlas-token-discipline` — burn down ops/atlas raw transitions/border-radii/tier-bypass/grids; gate triple `audit-pages && check-tier-bypass && check-unresponsive-grids`.
- `13y-12-theme-toggle-tw-and-motion` — fix theme-toggle `[8rem]` arbitrary + missing motion feedback; gates `lint --rule tailwindcss/no-arbitrary-value` + `check-motion`.
- `13y-13-tw-arbitrary-admin-arch` — burn down tailwind-arbitrary in ApprovalDetail + ArchitectureSnapshotPage.

**Group C — strategic / Adrian-context (4 units):**
- `12u-cc-repo-bootstrap` — first multi-tenant pilot consumer repo. Adrian needs to bootstrap.
- `13s-10-grc-career-planning` — explicitly HITL T4, requires `/grill-me` session.
- `12q-figma-system-drift` — `pnpm figma:audit`. Validator runs but unit work needs spot-check.
- `12q-inline-styles-burndown` — overlaps Group A 13y-15.

**Group D — defer (1 unit):**
- `12q-figma-master-shadcn-fidelity` — validator passes but it's a `pipeline + snapshot --update`, not a violation gate. Spec describes ~6-12h of token-resolution-at-build rewrite. Validator green ≠ work done; left hitl.

### Operational state at session end

- `swarm-watchdog-pulse.sh` (pid 3209) + `swarm-watchdog.mjs` (pid 208683) — alive, finds nothing eligible (all remaining are still hitl).
- `kimi-agent-pulse.sh` (pid 3304) — alive, idle.
- `agent-heal-loop.sh` (pid 66144) — alive, log says `/3 agent pulses alive` but only 2 are.
- `hermes-unit-pulse.sh` — **dead**. No `/tmp/hermes-loop.out`. Not auto-restarted by heal-loop. Restart manually if you want hermes back: `bash scripts/hermes-unit-pulse.sh > /tmp/hermes-loop.out 2>&1 &`.

### Default for next "go"

Group B mechanical work, smallest-first: `13y-12` (theme-toggle, ~10 lines) → `13y-13` (admin tw-arbitrary, ~30 min) → `13y-4` (sandbox headings) → `13y-6` (token descriptions, batch). Each ships as its own commit, validators verified, hitl + kimi-quarantine fields cleared in the same commit that flips status to done.
