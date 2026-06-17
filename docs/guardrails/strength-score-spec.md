# Strength Score Spec — ADR

**Status:** Accepted (2026-05-05)
**Authors:** Adrian Milsap + in-window assistant (Opus 4.7)
**Supersedes:** initial sketch in `HARDENING_ROADMAP.md` §"Two parallel strength scores"
**Implements:** unit `13s-strength-1-score-spec`

---

## Decision

The Hirobius repo computes **two parallel composite scores**, refreshed on every commit and snapshotted daily. Each score is an arithmetic mean over its own dimensions; dimensions whose data source is not yet wired (`needs-wiring`) are **excluded from the average**, not zeroed.

- **Score A — Internal Integrity** (6 dimensions): how honest our own house is. Closed-loop methodology — every dimension is empirically proven by a meta-validator that fails the commit if drift occurs.
- **Score B — Industry Benchmark** (8 dimensions): where we stand vs published Elite tiers from external frameworks (DORA, OWASP SAMM, NIST SSDF, WCAG 2.1 AA, Web Vitals, TS strict, OSV, CHAOSS).

**Priority:** Score A goes first. Score B becomes the next-edge focus only after Score A is consistently ≥80 across three consecutive daily snapshots.

The two scores are **never collapsed into a single number**. A single number invites confusion between "we're disciplined" and "we're industry-leading," which are different claims.

---

## Context

### Why two scores

Adrian's standing rule (2026-05-05): metrics must be *grounded* — anchored to externally validated thresholds where possible, and otherwise anchored to closed-loop discipline that has a real gate behind it. Avoid the trap of inventing internal-only language that flatters our own work.

Two scores, side-by-side, prevent the common failure mode where:

- **A high, B low** → "our house is in order but we're behind industry on capabilities." Action: dispatch external-capability units.
- **A low, B high** → "we look good on industry tests but our discipline is theatrical." Action: HARDEN FIRST. (This is the trap the dual-score model catches.)
- **Both high** → goal state.
- **Both low** → today (2026-05-05).

A single composite would average these out and hide the diagnostic signal.

### Why equal weights to start

We don't yet have empirical evidence that one dimension matters more than another. Equal weights are the unbiased default. Future ADRs (`13s-strength-1-rev`) can re-weight once we have history.

### Why arithmetic mean (not geometric)

Geometric mean punishes any single weak dimension hard — useful when no dimension can be allowed to lag. Arithmetic mean lets dimensions trade off, which matches how we ship in practice (some debts are accepted while others are paid down).

We accept that arithmetic mean can mask an outlier. Mitigation: the per-dimension breakdown is always shown alongside the composite, and the ops/atlas#strength tab renders the bars individually.

### Why exclude `needs-wiring` from the average

A `needs-wiring` dimension means "we haven't built the gate yet." Counting it as 0 punishes us for not-yet-existing infrastructure, which incentivizes adding gates we can't yet enforce (theatrical guardrails — the exact failure mode `13g-7` and `audit-typography-overrides` exposed). Excluding it from the average keeps the score honest: "of the dimensions we have *proof* for, we score X."

The number of `needs-wiring` dimensions is surfaced separately as `wiredCoverage = wired / total`. A score of 95 with `wiredCoverage = 2/8` is clearly a different state than 95 with `wiredCoverage = 8/8`, and the dashboard must show both.

---

## Score A — Internal Integrity

**6 dimensions, each 0–100, equal weight (16.67% each).**

| Dim | Name | Methodology | Empirical proof | Computed from |
|---|---|---|---|---|
| A1 | Registration coverage | every `scripts/check-*.mjs` and `scripts/audit-*.mjs` is registered in `registry.json` | `validate-guardrail-registry.mjs` exits non-zero if drift (pre-commit) | `count(registered) / count(scripts/check-*.mjs ∪ scripts/audit-*.mjs)` |
| A2 | Wiring honesty | every gate's declared `firingChannel` matches reality | `check-validator-wiring.mjs` exits non-zero on drift (pre-commit) | `count(channel-honest) / count(registered)` |
| A3 | Fixture proof-of-firing | every gate proves it catches what it claims | `13g-3` deliverable; meta-test runs each gate against `fixtures/<id>/{violating,passing}.example` | `count(gates with passing+violating fixture pair) / count(registered)` |
| A4 | Strict gating | static gates fire pre-commit, not just `pnpm-meta` | derived from registry's `firingChannel` field | `count(firingChannel ∈ {pre-commit, pre-push, ci-pr}) / count(registered)` |
| A5 | Hardening cluster completeness | the `13g-hardening` cluster has shipped | derived from `orchestration.json` | `count(13g-* status=done) / count(13g-*)` |
| A6 | Debt closure ratio | Phase 2 inventory turned into closures or baselines | derived from `docs/guardrails/full-strictness-inventory.json` (post-Phase-2) | `count(violations closed or baselined) / count(violations in inventory)` |

**Today's snapshot (informational, not normative):** A1=100, A2=100, A3=0, A4=~21, A5=~60 (9/15), A6=`needs-wiring` (Phase 2 hasn't run).

Excluded `needs-wiring`: A6. **Score A today (5 wired dims, arithmetic mean): ≈ 56**, `wiredCoverage = 5/6`.

---

## Score B — Industry Benchmark

**8 dimensions, each 0–100, equal weight (12.5% each).** Each maps to a published framework with externally-validated thresholds. We don't invent thresholds.

| Dim | Source framework | Metric | Elite threshold | Wiring obligation |
|---|---|---|---|---|
| B1 | DORA (Google Cloud State of DevOps) | Deploy frequency + change failure rate | "Elite": multi-deploy/day, <15% failure | `scripts/derive-dora-metrics.mjs` reads `git log --first-parent`, `routing-log.jsonl`, `agent-audit-log.jsonl` |
| B2 | OWASP SAMM + NIST SSDF | Pre-commit covers: secrets, types, lint, deps, license, accessibility, perf, WCAG | 8/8 covered = 100; partial scaled | derived from `registry.json` `firingChannel` (no new wiring) |
| B3 | WCAG 2.1 AA (W3C) | axe-playwright violations per route on critical pages | 0 violations | `.github/workflows/a11y.yml` must hard-fail on violations (verify; if not, follow-up unit `13s-strength-8-wcag-hard-fail`) |
| B4 | Google Web Vitals | LCP / INP / CLS thresholds | "Good" on ≥75% of routes | Lighthouse assertions in `.github/workflows/perf.yml` must hard-fail (verify; follow-up `13s-strength-9-vitals-hard-fail`) |
| B5 | TS strict-mode | `tsconfig.strict` flags + zero `any` outside escape hatches | 100% strict | grep `tsconfig*.json` + count `any` in `src/**/*.ts(x)`; pre-commit `pnpm typecheck` already gated |
| B6 | OSV / npm audit | Critical + high CVE count | 0 critical, 0 high | `pnpm audit --audit-level=high` wired into ci-pr (follow-up `13s-strength-10-audit-ci-gate`) |
| B7 | CHAOSS (Linux Foundation) | % of public exports with JSDoc + READMEs on top-level dirs | 80% baseline | derived from `src/app/data/component-api.json` + `react-docgen-typescript` output |
| B8 | Test coverage | Line + branch coverage from vitest+playwright | 80% baseline | `pnpm test --coverage` artifact (`12p-test-coverage-reporting-wired` is open) |

**Today's snapshot (rough estimate, informational):** B1≈60, B2≈50, B3=`needs-wiring`, B4=`needs-wiring`, B5≈90, B6=`needs-wiring`, B7≈70, B8=`needs-wiring`.

Excluded `needs-wiring`: B3, B4, B6, B8. **Score B today (4 wired dims, arithmetic mean): ≈ 67.5**, `wiredCoverage = 4/8`.

---

## Edge cases

### Division by zero (no gates registered)

If `count(registered) = 0`, all of A1–A4 are undefined. The generator emits `score: null, reason: "no-registered-gates"` rather than dividing. The dashboard renders this as a literal "Bootstrap state — no gates yet" message, not as `0`.

This is a transient state the repo will only re-enter if `registry.json` is wiped. Today, with 68 gates registered, it cannot fire.

### All dimensions `needs-wiring`

If all dimensions in a score are `needs-wiring`, the score is `null` with `reason: "all-dims-need-wiring"`. The dashboard shows the wiring-obligation table prominently.

### Partial wiring

Score is computed over wired dimensions only. The number of wired dimensions is surfaced as `wiredCoverage`. UI must always show both: `composite` and `wiredCoverage`.

### Score regression

A score drop between two consecutive daily snapshots > 10 points triggers a warning entry in `swarm-watchdog-decisions.jsonl` (decision type: `strength-regression`). This is a soft signal — the watchdog does not act on it autonomously. Adrian's morning review surfaces it.

### Stale data

A dimension whose data source has not been refreshed in > 30 days (e.g., `git log --first-parent` empty for a month) is treated as `needs-data` (distinct from `needs-wiring`) and excluded from the average with a "stale" badge in the UI.

### Idempotency

The generator must produce byte-identical output (modulo a single ISO timestamp at the top of `strength-report.json`) for the same input state. This is required by the determinism gate (`13g-3`-adjacent meta-test). Achieved via:
- Deterministic iteration order (sort all dictionary keys alphabetically before emitting)
- No `Date.now()` outside the top-level `generated` field
- No `Math.random()`
- No file-system-mtime reads

---

## Consequences

### Positive

- **Honest single number per score.** Adrian glances at `/ops/atlas#strength`, sees "Score A: 56, Score B: 67.5", knows the state in 2 seconds.
- **Bottleneck visibility.** Per-dimension breakdown surfaces which dim is dragging.
- **Closed-loop:** every dimension's data source is gated; the gate fails the commit if the metric it produces would be wrong. No hand maintenance.
- **LLM-friendly.** `strength-report.json` is the canonical state any fresh agent reads at boot.
- **Anti-theatrical:** `needs-wiring` is loud. We can't hide a fake number behind a "we'll wire it eventually" promise — the dimension is excluded from the average, with the gap shown.
- **Historical:** daily snapshot in `strength-history.jsonl` (per `13s-strength-3`) drives sparklines.

### Negative / accepted trade-offs

- **Arithmetic mean masks outliers.** Mitigated by always showing per-dimension bars; not solved at the composite level.
- **Equal weights are arbitrary.** Initial assumption; can be revised per follow-up ADR after we have history.
- **`needs-wiring` exclusion can flatter early states.** A score of 95 with `wiredCoverage = 1/8` looks great until you read the second number. Mitigated by always rendering both, and by the watchdog surfacing low `wiredCoverage` as a dispatch priority.
- **Two scores is more cognitive overhead than one.** Accepted — the diagnostic value is worth the second number.
- **No client-facing meaning.** Both scores are repo-internal. Clients see shipped product; they do not see strength scores. (Avoids the temptation to game the score for marketing.)

### Trigger conditions for re-visiting this ADR

- Once Score A is ≥80 for three consecutive daily snapshots, the priority shifts to Score B (per HARDENING_ROADMAP §"Why both scores matter"). Re-visit weights at that time.
- If a dimension's source framework publishes a new threshold (e.g., DORA bumps Elite to >5 deploys/day), update Score B's threshold mapping in a minor ADR addendum.
- If a new dimension is required (e.g., supply-chain provenance per SLSA Level 3), add it as a new `B9` only if a wired gate accompanies it — never as an aspirational entry.

---

## Alternatives considered

### Alt 1: Single composite score

**Rejected.** Hides the A-vs-B diagnostic signal. A single number incentivizes gaming whichever sub-metric is easiest to move.

### Alt 2: Geometric mean

**Rejected for now.** Punishes any one weak dim hard, which would discourage incremental progress on a single dim while others lag. Re-visit if we see the team avoiding hard-but-isolated dim improvements.

### Alt 3: Weight dimensions by the size of their underlying gate set

E.g., A1 (registration) covers 68 gates; A4 (strict gating) covers a subset; weight by count.

**Rejected.** Conflates "more gates" with "more important." A2 (wiring honesty) is structurally critical even though it covers the same 68 gates as A1 — we don't want to halve its weight.

### Alt 4: Treat `needs-wiring` as 0

**Rejected.** Incentivizes registering aspirational gates that don't fire — the exact failure mode this whole hardening cluster exists to prevent.

### Alt 5: Treat `needs-wiring` as 100 (assume it would pass if wired)

**Rejected.** Even more dishonest than alt 4.

### Alt 6: Bayesian prior over `needs-wiring`

E.g., assume a `needs-wiring` dim has a beta(α=1, β=1) prior, sample posterior given the rest of the system's score.

**Rejected as over-engineered.** Adds statistical complexity without operational benefit. The simple "exclude and show coverage ratio" approach is honest and legible.

---

## How this gets implemented

This ADR is the spec. Implementation follows in:

- **`13s-strength-2-generator`** — `scripts/generate-strength-report.mjs` reads canonical sources, computes per-dimension scores per the methodology table above, emits `strength-report.{md,json}`. Idempotent. Pure observer. Pre-commit-wired.
- **`13s-strength-3-history-log`** — daily-snapshot mode appends to `strength-history.jsonl` (one line per day, idempotent on re-run).
- **`13s-strength-4-atlas-tab`** — `/ops/atlas#strength` renders both scores, per-dimension bars, `wiredCoverage`, sparkline from history.
- **`13s-strength-5-llm-system-overview`** — `docs/guardrails/SYSTEM_OVERVIEW.md` derived from `strength-report.json` for LLM boot context.
- **`13s-strength-6-watchdog-strength-hook`** — watchdog `onSessionEnd` regenerates the report so future-Adrian's first session-of-the-day reads current numbers.

Each follow-up unit's `validationCmd` must verify the deliverable conforms to this ADR. If a future generator implementation diverges from the methodology table, the unit's audit fails.

---

## References

- `docs/guardrails/HARDENING_ROADMAP.md` §"Two parallel strength scores" (the upstream sketch this ADR formalizes)
- `docs/guardrails/registry.json` (canonical gate inventory, source for A1/A2/A4/B2)
- `docs/ai/orchestration.json` (canonical unit state, source for A5)
- `docs/ai/swarm-watchdog-decisions.jsonl` (regression detection log)
- DORA: https://dora.dev/research/
- OWASP SAMM: https://owaspsamm.org/
- NIST SSDF: https://csrc.nist.gov/Projects/ssdf
- WCAG 2.1: https://www.w3.org/TR/WCAG21/
- Google Web Vitals: https://web.dev/vitals/
- CHAOSS: https://chaoss.community/
