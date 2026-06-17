# Guardrail hardening roadmap

Captured 2026-05-05 after a deep grill on what "completely deterministic gates" would actually mean. Source-of-truth for the `13g-hardening` orchestration cluster. Every entry below either becomes an orchestration unit or is explicitly deferred.

---

## Motivating incident

`audit-typography-overrides` was authored, registered in the guardrail registry, and added to `pnpm tokens`. It looked wired. It wasn't. The validator never ran on a per-commit basis because nobody added it to `.husky/pre-commit`. **17 violations across 7 files shipped past the dormant gate** before we caught it manually. That is the failure mode every entry in this roadmap aims to make impossible.

We then built two meta-validators:
- `validate-guardrail-registry.mjs` — every `check-*.mjs` and `audit-*.mjs` must be registered.
- `check-validator-wiring.mjs` — every registered entry must declare a `firingChannel` matching reality.

Both are now in pre-commit. We empirically tested both with contrived violations: registry-validator caught an unregistered fake script (exit 1, blocked commit); wiring-validator caught BAD_CHANNEL, MISSING_CHANNEL, and WIRING_DRIFT cases (exit 1).

That closes the *registration* and *wiring* loops. It does NOT close the *effect* loop. A wired gate could still be silently broken. The roadmap below addresses that.

---

## What "completely deterministic gates" means

A gate is fully deterministic when:

1. **Pure observer** — no mutation of working tree, no clock, no randomness, no network, no env-var dependence beyond a small allowlist.
2. **Hermetic input → expected output** — given the same scanned source, always same exit code + same stdout/stderr.
3. **Coverage-proven** — has both `violating.example` and `passing.example` fixtures; meta-test asserts gate exits 1 on the first and 0 on the second.
4. **Tamper-resistant wiring** — the invocation cannot be silently weakened (no `|| true`, no conditional skip, no commented-out shadow lines, argv matches strict-mode).
5. **Single source of truth** — pre-commit AND CI invoke the same gate set from the same entry point, not divergent copies.
6. **Bypass-detected** — if `--no-verify` happens, a downstream check rediscovers the violation.
7. **Reproducible across machines** — locked Node version, no Windows-vs-Linux path divergence, no locale-dependent regex.

Each principle below corresponds to one or more units in this roadmap.

---

## Ranked gaps + planned units

### P0 — closes the deepest gap (effect not just wiring)

**`13g-3-fixture-proof-of-firing`** *(scaffolded 2026-05-05 — all stubs generated; real fixtures to fill incrementally)*

Delivered by unit 13g-3:
- `fixtures/<gate-id>/{violating.example.<ext>, passing.example.<ext>}` generated for all 73 registered gates.
- `scripts/validate-fixture-proof-of-firing.mjs` — meta-validator: exits 0 with stub warnings, exits 1 on missing fixtures or real-fixture proof failure. mtime-scoped cache for fast pre-commit runs. `--json` mode for CI.
- Wired into `.husky/pre-commit` immediately after `check-validator-wiring.mjs`.
- All 72+1 gates have stub fixtures; 0 missing. Stubs are marked with `// TODO:` prefix (first line) so the validator distinguishes stub from real.
- `generate-strength-report.mjs` A3 dimension updated: stubs count as `withStubFixtures` (not toward score); only real non-stub fixtures verified firing count toward A3.

**A3 today: 0 real / 73 stub / 0 missing.** Score = 0/100 on A3 (correctly low — stubs are placeholders, not proof). Fill real fixtures by replacing TODO-marked stub files to raise A3.

Next milestone: seed the highest-risk 5 gates with real fixtures: `audit-typography-overrides`, `check-source-canon`, `check-token-paths`, `check-hardcoded-spacing`, `check-validator-wiring`. Each gate that doesn't accept `--fixture-mode` will need a small targeted-scan support patch.
Done when ≥80% of registered gates have real (non-stub) fixtures + meta-test green.

### P0 — close cheap wiring-validator gaps

**`13g-7-wiring-tamper-resistance`**
- Extend `check-validator-wiring.mjs`:
  - Reject `|| true` (and other failure-swallowing patterns: `; true`, `; exit 0`, trailing `&`) immediately following a registered gate's invocation in `.husky/pre-commit`.
  - Reject conditional wraps: `if false; then`, `[ ... ] && node script.mjs`, `set +e` → call → `set -e` patterns.
  - Replace substring match with line-by-line parse: ignore comment lines, ignore commented-out shadow lines.
  - Validate argv matches the registered strict-mode invocation. If a gate has `--strict` or `--soft` flags, the registry declares which one is canonical; pre-commit must use that one.
- Empirically test: each new check has a fixture pre-commit file that should be rejected.

### P0 — eliminate voluntary self-audit

**`13g-8-agent-self-audit-required`**
- Modify `scripts/hermes-unit.mjs`: the mark-done step runs `node scripts/audit-batch-deliverables.mjs --units <id>` and refuses to flip `status: claimed` → `done` if it fails.
- Same for swarm.mjs's worker pool.
- Add to the standard agent prompt template the line "audit will run automatically on mark-done; you cannot bypass."
- Empirically test: dispatch a deliberately-broken unit, verify mark-done is refused.

### P1 — protect the pre-commit hook itself

**`13g-9-precommit-structure-hash`**
- Compute a canonical hash of `.husky/pre-commit` (after stripping comments + normalizing whitespace), store in the registry as `precommitStructureHash`.
- `check-validator-wiring.mjs` recomputes on each run and fails if hash diverges without a corresponding update committed.
- Forces structural changes to surface in PR diffs.
- This is tamper-resistance against future-me forgetting why a line was added, NOT against malice.

### P1 — every gate is a pure observer (audit)

**`13g-10-gate-purity-audit`**
- Author `scripts/audit-gate-purity.mjs` that walks every registered gate and statically checks for impure patterns: `fs.writeFileSync`, `Math.random`, `Date.now`, `new Date(`, `process.env` access outside an allowlist, network imports (`fetch`, `https`, `axios`).
- Document each impurity finding; for each, decide: refactor to pure / declare exception in registry / replace gate.
- Goal: every gate either certifies pure OR has a registry-recorded exception with rationale.
- Wire as ci-pr (slow-ish, not pre-commit).

### P1 — single source of truth for the gate set

**`13g-11-unified-gate-runner`**
- Author `scripts/run-gates.mjs --channel <pre-commit|pre-push|ci-pr>` that walks the registry, filters by channel, and invokes each gate in order.
- Replace the per-line `node scripts/check-*.mjs` listing in `.husky/pre-commit` with a single line: `node scripts/run-gates.mjs --channel pre-commit`.
- CI workflows likewise call `node scripts/run-gates.mjs --channel ci-pr`.
- Now there's exactly ONE place that decides "which gates run on this channel." Drift between pre-commit and CI becomes structurally impossible.
- Wiring validator updates: the canonical invocation is `run-gates.mjs --channel <X>`, registry declares channel, run-gates.mjs reads registry to dispatch.

### P1 — per-file scoping for speed

**`13g-2-validator-self-register`** *(was Wave 1)*
- Each gate exposes a `glob` or `affectedFiles(changed)` API. Pre-commit reads `git diff --cached --name-only` and runs only the gates whose globs match changed files.
- Sub-second pre-commit on small commits → adoption survives.
- Mitigation against missing cross-file violations: gates that need full-tree scan (e.g. manifest-drift, route-coverage) opt out of scoping by declaring `scope: 'full-tree'` in registry.

### P2 — bypass detection

**`13g-12-postcommit-verifier`**
- A `.husky/post-commit` hook (or local cron) re-runs the full pre-commit gate set against the committed tree (NOT staged — committed). Append the result to `docs/guardrails/firing-log.jsonl` with commit SHA + per-gate exit code.
- If a gate that was supposed to gate the commit fails post-commit, that means `--no-verify` was used or pre-commit silently failed. Surface as red row in `/ops/atlas#validators`.
- Doesn't prevent bypass (that requires server-side gating we don't have), but makes it auditable.

### P2 — Hermes learned-rules pipe

**`13g-13-learned-rules-promotion`**
- Hermes post-mortem distillation already extracts a rule per failure. Currently goes to stdout.
- New: append to `docs/ai/learned-rules.jsonl` with `{ rule, rationale, applies_to, source: 'hermes-distillation', evidence_unit_id, ts }`.
- Author `scripts/promote-learned-rule.mjs` (interactive): walks recent unprommoted entries, asks Adrian to flip each to a registry entry as `severity: warn`. Once a learned rule has caught a real fixture-violation, promote to `severity: error`.
- This is the closed-loop fix: every regression contributes back to the gate set.

### P2 — firing telemetry

**`13g-14-gate-firing-telemetry`**
- Each gate emits a one-liner JSON to `docs/guardrails/firing-log.jsonl` per run: `{ gate, ts, exitCode, violations, durationMs, commitSha }`.
- Periodic job (`pnpm guardrail:report`) updates `lastFiringAt` / `lastViolationAt` in registry from the log.
- Surface dormant gates (no fires in 90 days) on `/ops/atlas#validators`.
- Distinguishes "perfectly clean" from "silently broken."

### P3 — platform robustness

**`13g-15-locked-node-version`**
- Pin Node version in `package.json` `engines` and add `.nvmrc`.
- Detect Windows-vs-WSL path divergences in hooks (the `tokens:verify` hook in `.claude/settings.json` has a hardcoded Windows path). Replace with cross-platform invocation or document as Adrian-only.

**`13g-16-mutation-test-spike`**
- Spike: pick one gate (e.g. `check-source-canon`). Programmatically inject N variations of the violation pattern. Measure what % the gate catches.
- If it's <90%, that's evidence of incomplete coverage even with passing fixtures. Decide: invest in mutation-testing infrastructure (overkill for now?), or just rely on incident-driven fixture growth.
- Don't run as a gate — this is a one-time analysis.

---

## Overnight orchestration plan

User request: run this through orchestration overnight with **2 parallel agents max** + an **observer/monitor** that prevents endless loops.

### Concurrency cap

Lower CLAUDE.md's standard 6-8 cap to **2** for unattended overnight runs. Smaller blast radius. Smaller merge-conflict surface. The observer's reaction window is wider.

### Observer / loop-killer

Author `scripts/swarm-watchdog.mjs`:
- Polls `docs/ai/orchestration.json` every 60s.
- For each `status: claimed` unit: if `claimedAt` is older than wall-clock-cap (default 25 min for sonnet, 45 min for opus), mark abort: revert claim, increment `attempts`, append `lastAbort` note. After 2 aborts on the same unit, mark `status: parked` and surface for Adrian's review.
- For overall swarm: if total open claims exceeds the cap (2), refuse to dispatch new ones.
- For cost: read `telemetry/events.jsonl` cumulative cost per session; abort everything if exceeds Adrian-set ceiling.
- Logs to `docs/ai/swarm-watchdog.log` with timestamps so morning-Adrian can see what happened.

### Per-pod constraints (already enforced by `hermes-unit.mjs`, formalize for swarm)

- Wall-clock per unit: 25 min for sonnet, 45 min opus, 8 min hermes (already default).
- Token budget: 75K warn / 120K hard-abort (already default).
- Iteration cap: 12 tool calls (already default).
- Max attempts before park: 2 (tightened from default 3 for unattended overnight).

### Selection priority

Observer picks units in this order: P0 first, then P1, then P2, then P3. Within tier: smaller scope first (faster turnaround = more units close overnight). Skip any unit whose dependencies aren't done.

### What's safe to run unattended

- Doc-only units (`13g-9` hash gen, `13g-15` Node lock).
- Pure-static-scan units (`13g-7` wiring tamper-resistance, `13g-10` purity audit).
- Single-file edits with strict pre-commit gates (`13g-8` agent self-audit).

### What needs Adrian-attention (NOT for overnight)

- `13g-11` unified gate runner — refactors pre-commit; high blast radius.
- `13g-13` learned-rules promotion — the interactive review step requires Adrian.
- `13g-2` per-file scoping — refactors gate APIs across all 68 gates; needs careful sequencing.

---

## Final grill: can the system be FULLY deterministic?

**Gate side:** YES, modulo the impurity audit (`13g-10`) and incremental fixture coverage (`13g-3`). Once both are at 100%, every gate is a pure observer with proven catches and proven non-false-fires. Re-running the same commit input produces the same gate set output bit-for-bit.

**Agent-output side:** NO, by design. LLMs are stochastic. Same prompt yields different code each run. **But:** gates bound the non-determinism to "any solution that passes." When agent generation is stochastic and gate evaluation is deterministic, the system converges on quality even though individual runs vary.

**The remaining gap:** an agent could produce code that passes all current gates but is wrong in a way no gate catches. This is the unknown-unknown class of defect. Can never be eliminated, only reduced over time as new failure modes get codified into new gates. The `13g-13` learned-rules pipe is the structural mechanism that turns each new defect into a new gate — closing the loop.

**Conclusion:** the asymptote of "completely deterministic" is reachable on enforcement but not on generation. That's the right shape: gates ratchet, models improvise within ratchet bounds. The system gets quieter over time as the ratchet tightens.

The single failure mode that defeats this: someone (me, future me, an agent) editing a gate to make it weaker, AND the meta-validators not catching it. `13g-7` (wiring tamper-resistance) is the largest mitigation. `13g-9` (pre-commit structure hash) is the second. Beyond that, the only protection is review discipline + small commits + recoverable git state, which is a property of the human layer, not the gate layer.

---

## Additional gaps surfaced in the senior-eng grill (2026-05-05)

These were missed in the first pass. Most are P2/P3 candidates — appended for completeness so they're not lost when we automate this.

### GitHub-side

**`13g-17-github-branch-protection-runbook`** *(P2 — write but don't enforce until we push)*
- Document required-status-checks, no force-push to main, linear history, block-direct-push, in `docs/operations/github-branch-protection.md`. The settings live in GH UI, not the repo, so this is the readable contract.

**`13g-18-codeowners`** *(P2)*
- `.github/CODEOWNERS` even for a solo repo. Documents path → reviewer mapping. Forces explicit thought when paths cross client/agency boundaries (e.g. `clients/lilac-insure/legal/` requires Conrad ack, even though Conrad has no GH account).

**`13g-19-github-actions-permissions`** *(P3)*
- Add `permissions:` block to every workflow in `.github/workflows/*.yml`, scoped to least privilege.

**`13g-20-signed-commits-policy`** *(P3 — solo low-priority)*
- Document `git commit -S` setup; configure GH to mark unsigned commits. Cryptographic attestation against compromised agent credentials.

**`13g-21-dependabot`** *(P2 — overlaps `13s-1-dependency-hygiene`)*
- `.github/dependabot.yml` for npm + GH Actions. Weekly cadence. Pair with the existing `pnpm audit` gate.

### Vercel-side

**`13g-22-vercel-env-var-parity-check`** *(P1 — load-bearing for `13w-ops-3`)*
- `api/route.ts` returns 503 with actionable message when `HIROBIUS_BRIDGE_URL` / `HDS_BRIDGE_SECRET` aren't set (already done). Add a build-time assertion: `vercel.json` build step that fails the deploy if required env vars are missing in the project. Surfaces config drift before runtime.

**`13g-23-edge-vs-node-decision`** *(P3 — small ADR)*
- `docs/adr/00X-vercel-runtime.md` — pick edge or node for `api/route.ts`. Edge = faster cold-start + smaller limits + restricted Node API. Node = full runtime. Document the choice.

**`13g-24-vercel-preview-deploy-pipeline`** *(P2)*
- Push to non-main branches → Vercel preview deploy → preview URL re-runs `/api/route` smoke test. Closes the "we never test prod path until prod" loop.

### Backup / disaster recovery

**`13g-25-orchestration-snapshot-cron`** *(P1 — cheap; high value)*
- Daily snapshot: `cp docs/ai/orchestration.json docs/ai/snapshots/orchestration.YYYY-MM-DD.json`. Keep last 30 days. Saved at first ops:dev hook OR by a `pnpm orchestration:snapshot` script.
- Same idea for `docs/guardrails/registry.json`.

**`13g-26-off-machine-backup-policy`** *(P2 — write-decision; not yet implement)*
- Distinguish "never push to main" from "never push at all." Decision doc: do we push `fix/ui-pipeline` to GH as off-machine backup? Argue the trade-offs.

**`13g-27-atomic-registry-writes`** *(P1)*
- Refactor every script that writes `orchestration.json` / `registry.json` to write to `<file>.tmp` then `fs.rename` (POSIX-atomic on same filesystem). Eliminates the corruption-mid-write class of bug we've already seen.

### Coverage / discipline

**`13g-28-doc-drift-gate`** *(P2)*
- Author `scripts/check-doc-drift.mjs`: every code symbol mentioned in `docs/*.md` (functions, components, file paths, route paths) must resolve to an actual export / file / route. Catches docs-vs-code drift after refactors.

**`13g-29-promotion-ratcheting`** *(P2)*
- When flipping a registry entry's `severity: warn` → `error`, simulate by walking the last N commits and re-running the gate. If any past commit would have failed under the strict rule, surface for cleanup BEFORE promotion. Safer ratchet.

**`13g-30-hook-idempotency-audit`** *(P3)*
- Verify every `.husky/*` hook + every `.claude/settings.json` PostToolUse is idempotent: running it twice on the same input must produce the same outcome. The current `eslint --fix` PostToolUse hook is the obvious risk (it mutates).

**`13g-31-onboarding-bootstrap-script`** *(P2)*
- `scripts/bootstrap.sh` that installs all preconditions: pnpm, node version, gitleaks, ollama (optional), husky setup, .nvmrc-aware. README points to it. Future-Adrian (or actual hire) can clone + run + commit successfully without 30 minutes of "what's missing now."

**`13g-32-validator-unit-tests`** *(P2)*
- Recursion concern: a validator that's wrong by N% is wrong by N% of all our protection. Test the validators themselves with vitest unit tests against contrived inputs. Pair with `13g-3` fixture proof-of-firing — fixtures prove behavior end-to-end; unit tests prove logic.

### Meta-budget

**`13g-33-discipline-vs-feature-cost-tracking`** *(P3)*
- Track agent-cost spent on `13g-*` units vs `13w-*` units. If discipline cost > 25% of total, signal: "we're hardening at the expense of shipping." Surfaces in `/ops/build`.

---

## How this doc gets maintained

- Every closed unit moves to "Done" section at the bottom (link to commit SHA).
- Every new gap discovered during this work gets appended to the Ranked gaps section.
- Quarterly review: are the P-rankings still right?
- This doc is the registry-of-discipline. The registry.json is the registry-of-gates. They reference each other.

---

## System Strength tracking (`13s-strength` cluster)

Adrian's ask (2026-05-05): "How do we continually track these new features and hardening work — visually + document-driven — without having to remember to update it? Where can we log progressive evolutions? How can we score the system as an overall strength metric?"

**Principle:** auto-generated from canonical state, never hand-maintained. Same shape readable by humans (markdown) AND LLMs (JSON). Single composite score + per-dimension breakdown so gaps surface without ambiguity.

### Two parallel strength scores — both grounded, both real

Adrian's clarified position (2026-05-05): internal house-in-order metrics ARE valid (they prove integrity of our discipline) AND industry standards prevent us from making stuff up. Both layers matter. The order matters: lock down own house FIRST, then chase external comparison. So we publish two scores side-by-side, not a single composite that conflates them.

#### Score A — Internal Integrity (house-in-order)

Methodology: closed-loop guardrail discipline. Each dimension is empirically proven by an existing meta-validator running in pre-commit. NOT navel-gazing — every metric is backed by a gate that fails the commit if drift occurs. Dimensions:

| Dim | Methodology source | Empirical proof | Today |
|---|---|---|---|
| A1 Registration coverage | "Every gate is registered" — codified-gated-wired discipline | `validate-guardrail-registry.mjs` exits non-zero if drift | 100% (68/68) |
| A2 Wiring honesty | "Every gate's declared firingChannel matches reality" | `check-validator-wiring.mjs` exits non-zero if drift | 100% (68/68) |
| A3 Fixture proof-of-firing | "Every gate proves it catches what it claims" | `13g-3` deliverable; meta-test runs each gate against contrived violating + passing examples | 0% (target via `13g-3`) |
| A4 Strict gating | "Static gates run pre-commit, not just pnpm-meta" | Wiring-validator records `firingChannel`; orphan `pnpm-meta` count surfaces | ~21% (14 pre-commit / 68 total) |
| A5 Hardening cluster completeness | "13g-hardening cluster shipped" | `orchestration.json` status counts | ~12% (2/16 done; 16g-1 + 13g-16) |
| A6 Debt closure ratio | "Phase 2 inventory turned into closures or baselines" | `docs/guardrails/full-strictness-inventory.json` count | undefined until Phase 2 |

These are NOT made up. They're the closed-loop discipline made measurable. Each dimension's score == "fraction of our discipline that's actually firing." Score A says: **is our own house in order?**

#### Score B — Industry Benchmark (where we stand vs world)

Each dimension maps to a published framework with externally-validated thresholds. We don't invent thresholds; we compare to the published Elite tier.

| Dim | Source framework | Metric | Elite threshold |
|---|---|---|---|
| B1 DORA | DORA / Google Cloud State of DevOps | Deployment frequency + change failure rate (derived from `git log` + `routing-log.jsonl` + `agent-audit-log.jsonl`) | "Elite": multi-deploy/day, <15% failure |
| B2 SAMM/SSDF gate coverage | OWASP SAMM + NIST SSDF | Pre-commit covers: secrets, types, lint, deps, license, accessibility, perf, WCAG | 8/8 covered |
| B3 WCAG 2.1 AA | W3C WCAG 2.1 | axe-playwright violations per route | 0 violations on critical pages |
| B4 Web Vitals | Google Web Vitals | LCP/INP/CLS thresholds | "Good" on ≥75% of routes |
| B5 TS strict-mode | TypeScript industry baseline | `tsconfig.strict` flags + zero `any` outside escape hatches | 100% strict |
| B6 OSV/audit | OSV.dev / npm audit standard | Critical + high CVE count | 0 critical, 0 high |
| B7 CHAOSS docs | CHAOSS (Linux Foundation) | % of public exports with JSDoc + top-level READMEs | 80% baseline |
| B8 Test coverage | Istanbul/v8 coverage norms | Line + branch coverage from vitest+playwright | 80% baseline |

Score B says: **how do we compare to the published Elite tier?**

#### Why both scores matter

- **Score A high, Score B low** = our house is honest but we're behind industry on capabilities. Action: dispatch external-capability units.
- **Score A low, Score B high** = we look good on industry tests but our discipline is theatrical. Action: HARDEN FIRST. (This is the trap Adrian wants us to avoid.)
- **Both high** = the goal. Both real, both proven, both gated.
- **Both low** = early state. We're here today.

**Priority:** Score A goes first. Locking down own house before chasing industry comparisons. Once Score A is consistently >80, Score B becomes the next-edge focus.

| Dim | Source framework | Metric | Elite / Target threshold |
|---|---|---|---|
| 1 | **DORA** (Google Cloud + DORA Reports) | Deployment Frequency + Change Failure Rate (derived from our git log + routing-log + agent-audit-log) | "Elite" tier: deploy multiple times/day; <15% change failure rate |
| 2 | **OWASP SAMM** + **NIST SSDF** | Pre-commit gate coverage of: secrets, types, lint, deps, license, accessibility, perf, WCAG (each binary; score = % covered) | 8/8 covered = 100; partial coverage scaled |
| 3 | **WCAG 2.1 AA** (W3C) | axe-playwright violations per route | Level AA = 0 violations per route across critical pages; AAA = 0 across all |
| 4 | **Google Web Vitals** | LCP / INP / CLS thresholds per route | "Good" on all three for ≥75% of routes (Google's published target) |
| 5 | **TypeScript strict-mode** | `tsconfig.strict` flag set + zero `any` outside escape hatches | 100% strict (industry baseline for modern TS) |
| 6 | **OSV / npm audit** | Critical + high CVE count in `package.json` deps | 0 critical, 0 high (industry baseline; standard since SolarWinds) |
| 7 | **CHAOSS** (Linux Foundation) | % of public exports with JSDoc + README coverage on top-level dirs | 80% (CHAOSS-suggested baseline for healthy projects) |
| 8 | **Test coverage** (Istanbul/v8 norms) | Line + branch coverage from vitest+playwright | 80% (industry-standard baseline) |

Composite = weighted average. Initial weights equal (12.5% each); revisit per `13s-strength-1` ADR.

**Where each metric comes from in our codebase:**

- **DORA** → derived from `git log --first-parent`, `docs/ai/routing-log.jsonl`, `docs/security/agent-audit-log.jsonl`. Lead time = commit-to-main timestamp. Failure rate = `lastAbort` ratio.
- **SAMM/SSDF** → check-list against `.husky/pre-commit` invocations + `docs/guardrails/registry.json`. We already have most of these gates; the score reflects whether they're pre-commit-firing vs `pnpm-meta`-orphan.
- **WCAG** → axe-playwright runs in CI (`a11y.yml` workflow). Violation count parsed from artifact JSON.
- **Web Vitals** → Lighthouse runs (`perf.yml`). LCP/INP/CLS per-route from `lhci/assertions`.
- **TS strict** → grep `tsconfig*.json` for strict flags; count `any` in `src/**/*.ts(x)`.
- **OSV/npm audit** → `pnpm audit --json` parsed counts (already runs as part of `13s-1-dependency-hygiene`).
- **CHAOSS** → `scripts/check-public-api.mjs` + JSDoc presence count via `react-docgen-typescript` output (`src/app/data/component-api.json`).
- **Test coverage** → `pnpm test --coverage` artifact (`12p-test-coverage-reporting-wired` already approved).

**Today's snapshot (rough estimate, pre-implementation):**

```
Dim 1  DORA              ≈ 60   (we deploy locally daily, but no metric)
Dim 2  SAMM/SSDF         ≈ 50   (4-5 of 8 covered pre-commit; rest pnpm-meta)
Dim 3  WCAG AA           ≈ ?    (a11y.yml exists, not yet read)
Dim 4  Web Vitals        ≈ ?    (perf.yml exists, not yet read)
Dim 5  TS strict         ≈ 90   (mostly strict; some `any` and noPropertyAccessFromIndexSignature recently flipped)
Dim 6  OSV/audit         ≈ ?    (need pnpm audit run)
Dim 7  CHAOSS docs       ≈ 70   (component-api.json populated; some TODO descriptions)
Dim 8  Test coverage     ≈ ?    (coverage reporting unit not yet wired)
```

Once `13s-strength-2-generator` ships, these become real numbers from canonical sources, refreshed every commit. Dimensions with `?` get explicit "needs-data" status until their data source is wired.

**Why grounded vs internal:**

External-standard dimensions tell us where WE stand vs the world. Internal dimensions (registration coverage, wiring honesty) only tell us about our own meta-discipline — useful, but they live one layer below this. They become input signals to Dim 2 (SAMM/SSDF coverage), not a top-level dimension.

The internal meta-discipline metrics get tracked separately on `/ops/atlas#validators` (the existing wiring-audit table) — that's the layer-below view. The Strength tab is the layer-above view: how do WE compare to industry-published Elite tiers?

### Wiring requirement per dimension (NO aspirational metrics)

Adrian's standing rule (2026-05-05): every dimension MUST be backed by a real, wired, firing gate. A dimension whose data source isn't gated and firing is `needs-wiring`, not scored. The strength generator (`13s-strength-2-generator`) refuses to compute a fake number for a dimension whose gate isn't proven.

If a dimension surfaces a NEW gate need, that gate becomes a follow-up unit. Below: per-dimension status today + wiring obligation.

| Dim | Data source today | Wiring obligation | New unit if missing |
|---|---|---|---|
| 1 DORA | `git log`, `routing-log.jsonl`, `agent-audit-log.jsonl` exist; derivation logic does not | **Author derivation script + smoke gate**: `scripts/derive-dora-metrics.mjs` reads sources, emits scores; CI verifies the script runs (no division-by-zero, no unhandled-error crashes) | `13s-strength-7-dora-derivation` |
| 2 SAMM/SSDF | Registry + `firingChannel` already wired (today's commit) | None — readable from registry directly | n/a |
| 3 WCAG AA | `.github/workflows/a11y.yml` exists | **Verify axe-playwright actually exits non-zero on violations**; if it doesn't, it's a green-theater gate | `13s-strength-8-wcag-hard-fail` |
| 4 Web Vitals | `.github/workflows/perf.yml` exists; `12o-perf-bundle-budget-hard-fail-promote` is open | **Verify Lighthouse assertions actually fail the workflow on threshold breach** | `13s-strength-9-vitals-hard-fail` (overlaps with `12o-perf-bundle-budget-hard-fail-promote`) |
| 5 TS strict | `tsconfig.typecheck.json` exists; pre-commit runs `pnpm typecheck` | None — already gated | n/a |
| 6 OSV/audit | `pnpm audit` available; `13s-1-dependency-hygiene` is approved-not-done | **Wire `pnpm audit --audit-level=high` into ci-pr** (slow for pre-commit); refuse merge if non-zero | `13s-strength-10-audit-ci-gate` (subsumes 13s-1) |
| 7 CHAOSS docs | `src/app/data/component-api.json` populated; `check-token-description-quality.mjs` exists | **Add JSDoc-presence gate for public exports**: refuse pre-commit on a public export with no description | `13s-strength-11-jsdoc-gate` |
| 8 Test coverage | `12p-test-coverage-reporting-wired` approved-not-done | **Author the unit + wire `vitest --coverage` into pre-push or ci-pr with 80% threshold** | dispatch `12p-test-coverage-reporting-wired` |

**The contract:** the generator's output JSON includes per-dimension `wiringStatus: 'wired' | 'needs-wiring'`. A dimension marked `needs-wiring` shows the corresponding follow-up unit ID for the user to dispatch. The composite score is calculated only over `wired` dimensions, with the count exposed: `composite: 67/100 over 4 of 8 dimensions wired`.

**This is exactly the same discipline as the wiring validator:** every measurement we claim must be backed by a firing enforcement mechanism. No metric without a gate. Drift impossible.

**Net effect tonight:** the roadmap captures `13s-strength-7` through `13s-strength-11` as candidate units. They become orchestration units when `13s-strength-1-score-spec` is authored (Adrian-attended), at which point Adrian decides which to dispatch via the watchdog as `safeForUnattended: true`.

### New units in the `13s-strength` cluster

**`13s-strength-1-score-spec`** *(P2 — define before building)*
- Author `docs/guardrails/strength-score-spec.md` formalizing the six dimensions, weights, and edge cases. Adrian-attended (small ADR-style decision doc).

**`13s-strength-2-generator`** *(P2 — author once spec is signed)*
- `scripts/generate-strength-report.mjs` reads: `registry.json`, `orchestration.json`, `swarm-watchdog-decisions.jsonl`, `firing-log.jsonl`, `learned-rules.jsonl`. Emits two artifacts:
  - `docs/guardrails/strength-report.md` (human-readable: dashboard + per-dimension + recent changes)
  - `docs/guardrails/strength-report.json` (LLM-readable: structured score + dimension subscores + raw counts)
- Idempotent. Pure observer of canonical state. No mutation.
- Wire to `pnpm strength` AND a new pre-commit step so every commit refreshes the report.

**`13s-strength-3-history-log`** *(P3)*
- `docs/guardrails/strength-history.jsonl` — append-only daily snapshot of the composite + dimension scores. One line per day. Drives sparklines in the atlas tab.
- Generated by a cron / GH Actions scheduled run, OR from the watchdog's `onSessionEnd` hook.

**`13s-strength-4-atlas-tab`** *(P3 — visual surface)*
- New atlas tab `/ops/atlas#strength` (or extend the existing Validators tab). Renders `strength-report.json`. Big composite number top-center, six dimension bars, recent-changes feed, link to the markdown report. Mobile-first; HdsCard composition; existing token-only styling.

**`13s-strength-5-llm-system-overview`** *(P2 — closes Adrian's "point humans and LLMs at" ask)*
- A short, generated single-page overview at `docs/guardrails/SYSTEM_OVERVIEW.md` derived from the strength report + key roadmap state. Designed to be the SINGLE artifact handed to a fresh LLM as boot context: "here's where the system stands, here's what's strong, here's what's weak, here's the active sprint." Used by future agents (hermes, sonnet) at dispatch-time so they don't start fresh.
- Auto-regenerated from the strength generator on every run.

**`13s-strength-6-watchdog-strength-hook`** *(P3)*
- The watchdog's `onSessionEnd` hook calls `scripts/generate-strength-report.mjs` automatically. Closes the loop: every overnight run leaves the strength state up-to-date for the next session.

### What this gives us

- **Single number** that improves over time, visible in `/ops/atlas#strength` AND `docs/guardrails/strength-report.md`. Adrian can glance and know "we're at 56 / 100 today, was 39 yesterday."
- **Per-dimension visibility** when the composite stalls — we know whether the bottleneck is fixture coverage, strict gating, or debt closure.
- **Auto-regenerated** from canonical state — no hand maintenance, no drift, no "did I forget to update the doc?"
- **LLM-friendly boot context** in `SYSTEM_OVERVIEW.md` — every fresh agent starts with current-state awareness.
- **Historical sparkline** for proof of progress (and detection of regression).
- **Closes the Mario / pi argument loop**: agents have shared deterministic state to consult, not just stochastic prompts.

### What's NOT scored (intentional)

- Wave 1/2/3 feature completion (separate metric, separate roadmap)
- Visual quality (subjective; can't be deterministically scored)
- Adrian's velocity (Boris-Cherny PRs/day metric belongs in `/ops/build`, not strength)
- Test coverage (orthogonal; `pnpm test --coverage` exists)

### How this slots into the watchdog

The watchdog reads the strength report at boot (already does — listed in boot-context sources). New units appearing as low scores on a dimension surface as candidates for dispatch. Closed-loop: hardening units run → score rises → dispatch priority shifts to the next-weakest dimension. Self-improving without explicit prompting.
