# System blind spots — issue specs (2026-07-12)

Paste-ready GitHub issue specs from the design-skills session's blind-spot
review. The session's GitHub connector was unauthenticated, so these could not
be filed directly. File each (respecting the target repo + `Depends on` links),
then delete this doc. Companion: `followup-issues-2026-07-12-design-skills.md`
(design-skills follow-ups) — file both together; cross-references below.

Label vocab: `backlog` · `bug` · `blocked` · `needs-adrian`. Deps via
sub-issues (epic→child) and `Depends on <repo>#N` in the body.

---

## EPIC — BS1: the auto-merge gate verifies none of the design quality the fleet sells

**Repo:** ops (epic; children in ops/site-engine/hds) · **Labels:** `backlog`

**Problem.** Every repo's `ralph/gate.sh` runs exactly `pnpm typecheck && pnpm
test && pnpm lint` (hds adds a manifest bootstrap first). The required
branch-protection check is the plain `ralph-gate` context. Therefore, with
everything `ralph-auto`, a change auto-merges **without** running any visual,
layout, a11y, contrast, focus-order, or responsive verification:

- ops/site-engine: the Playwright suites (`test:visual`, `test:layout`,
  `test:a11y`, `test:collision`, `test:responsive`) exist as CI workflows but
  are **not** required checks — informational only.
- hds: retired Playwright (#161; Storybook is the visual surface), and its
  deterministic design gates (`check-contrast`, `check-focus-states`,
  `check-reduced-motion`, `check-page-shell`, …) live in `check:full` /
  `check:release`, **not** in `gate.sh`.

Net: the fleet's entire value proposition is design quality, and the automated
merge path enforces zero of it. The `check-impeccable-detect` guardrail added
this session is also `manual` channel, so it does not gate either.

**Prerequisite risk.** ops/site-engine Playwright runs require the browser
binary to be present at the version Playwright expects; the remote sandbox
ships a different build number, so every session hand-symlinks binaries (see
BS1a). A visual gate can't be made required until that's stable in CI.

**Definition of done (epic):** a UI-affecting change that breaks a visual /
layout / contrast invariant is blocked from auto-merge in all three repos.
Children below.

### BS1a — ops: stabilize Playwright browser provisioning (no manual symlinks) ✅ DONE (2026-07-12, branch claude/hirobius-design-skills-jr28dm)
**Repo:** ops · **Labels:** `bug`

Playwright resolves a versioned browser path (`chromium_headless_shell-<build>`)
that does not match `/opt/pw-browsers` in the remote env; every session manually
symlinks `1194 → {1208,1223}` in two locations to make `test:layout`/visual run.
Fix: detect the installed browser and pass `executablePath` (or set the resolved
`PLAYWRIGHT_BROWSERS_PATH`) in `playwright.config.ts`, committed, so the suites
run anywhere with zero manual bridging. **DoD:** fresh remote session runs
`pnpm test:layout` green with no symlink step; documented in the config.

### BS1b — site-engine: stabilize Playwright browser provisioning ✅ DONE (2026-07-12, same branch)
**Repo:** site-engine · **Labels:** `bug`

Same failure as BS1a — the `demo-*`/`preview-*` app smoke suites
(`@playwright/test` 1.60) need `chromium_headless_shell-1194 → 1223` bridging in
the sandbox. Add committed env-detection of the pre-installed Chromium
(`executablePath: '/opt/pw-browsers/chromium'` fallback per the remote-env
convention). **DoD:** `pnpm test` (Playwright smoke included) green in a fresh
remote session with no manual bridge.

### BS1c — ops: add visual/layout verification to the merge gate
**Repo:** ops · **Labels:** `backlog` · **Depends on** ops#(BS1a)

Add `pnpm test:layout` (route-coverage + layout-integrity) — and consider
`test:a11y` + `test:collision` — to `ralph/gate.sh` so the gate fails closed on
layout/collision/a11y regressions. Keep runtime sane (layout-integrity is the
cheap desktop pass). **DoD:** a deliberately-broken layout PR is blocked by the
gate. Branch-protection change (making the enriched gate required) is Adrian's
manual step — note it, don't assume it.

### BS1d — site-engine: add a design-quality gate step to the merge gate
**Repo:** site-engine · **Labels:** `backlog` · **Depends on** site-engine#(BS1b)

Gate currently: implicit via `pnpm test`. Add the per-app Playwright smoke +
the `packages/template` purity/acceptance sweep to `ralph/gate.sh` explicitly,
and add `npx impeccable detect apps/<slug>/` as an advisory (non-blocking to
start) step before any client-site ship. **DoD:** a placeholder-leaking or
purity-violating client build is caught by the gate.

### BS1e — hds: add deterministic design gates to the merge gate
**Repo:** hds · **Labels:** `backlog`

hds has no Playwright, but its design invariants are deterministic node scripts.
Add the cheap, high-signal subset to `ralph/gate.sh`: `check-contrast`,
`check-focus-states`, `check-reduced-motion`, `check-page-shell`,
`check-hardcoded-colors`, `check-tier-bypass` (a curated slice of `check:full`,
not the whole thing — keep gate latency bounded). **Depends on** hds#(BS4a)
(the contrast/proof-of-firing passing-fixtures must be green on clean main
first, else the gate is red from day one). **DoD:** a contrast/focus regression
blocks auto-merge; gate stays under ~60s.

---

## BS2 — skills-lock.json is a decorative pin (unenforced, no installer, inconsistent)
**Repo:** ops (fleet) · **Labels:** `backlog` · **Depends on / absorbs** the
"fleet skills-lock installer" item in `followup-issues-2026-07-12-design-skills.md`

Nothing in-tree reads `skills-lock.json`: no installer, the `computedHash`
algorithm was unrecovered (the legacy `extract-design` hash ≠ sha256 of its own
SKILL.md), hds's `.claude/skills/` is gitignored (fresh clone / Ralph re-clone
installs **zero** skills, no gate notices), and the three repos disagree on
mechanism (ops committed · hds locked-but-gitignored · site-engine committed;
site-engine had no lock until this session). "The shared pin" is a doc claim
with no enforcement. Scope:
1. `scripts/install-skills.mjs` (the existing follow-up): reads the lock incl.
   `pinnedCommit`/`paths`, fetches, verifies hash, installs. **Owns the canonical
   hash-algorithm definition.**
2. A `check-skills-lock` gate: installed skills match the lock (paths present,
   SKILL.md hash matches) — so a missing/stale skill fails loudly.
3. Reconcile the three-repo mechanism divergence: pick committed-vs-gitignored
   deliberately and document it; recompute/annotate the legacy `extract-design`
   hash under the new algorithm.

**DoD:** a fresh clone can reconstitute every pinned skill from the lock, and a
drifted/absent skill is caught by a gate.

## BS3 — silent-empty degradation contradicts the "fail loud + actionable" rule
**Repo:** ops · **Labels:** `bug`

CLAUDE.md mandates token/secret-backed features "fail loud and actionable," but
two degradations this session were silent: the GitHub connector was
unauthenticated and simply returned nothing (issue-filing no-op'd with no
signal), and `PluginsBar` returned `[]` in prod for an unknown period (fixed
this session). The Ralph loop depends on GitHub auth; a session/cron that loses
it fails as "nothing happens," not an alert. Scope: audit token-backed surfaces
(issue import `api/tasks.ts`, dispatch, projects, PluginsBar) so each names the
missing var + the fix on failure; add a lightweight auth/health indicator on
`/ops` (or the Runs panel) that goes red when `GITHUB_TOKEN`/connector is
absent or rejected. **DoD:** a revoked token produces a visible, named,
actionable failure — never a silent empty.

## BS4a — hds: two guardrail gates are red on clean main (passing-fixture triggers)
**Repo:** hds · **Labels:** `bug`

On a pristine `origin/main` in the remote sandbox, `validate-fixture-proof-of-firing
--no-cache` reports two real failures: `check-contrast` and
`validate-fixture-proof-of-firing` itself — "passing fixture triggered gate
(expected exit 0, got 1)." A closed-loop guardrail system whose gates are red on
a clean checkout of the env Ralph runs in trains everyone to ignore those reds —
which is how a real regression walks through. Fix the passing-fixtures (or the
gates) so a clean checkout is green. Blocks BS1e. **DoD:** `--no-cache` full
proof-of-firing run is green on untouched `main`.

## BS4b — ops+hds: registry `lastFiringAt` self-stamp re-dirties the tree every commit/push
**Repo:** ops (and hds) · **Labels:** `bug`

The pre-commit/pre-push gate chain writes `lastFiringAt` telemetry into
`docs/guardrails/registry.json` on both commit and push, so the working tree is
never clean after a push — the stop-hook "commit your changes" check always
re-fires, forcing `--no-verify` and telemetry-only commits (see this session's
git log). Fix: on hook-channel runs, either skip registry writes or write
telemetry to a gitignored sidecar (`.guardrail-telemetry.json`) and keep
`registry.json` config-only. **DoD:** a clean commit+push leaves the tree clean;
no telemetry-only churn commits.

## BS4c — fleet: guardrail scripts are duplicated across repos with no drift detection
**Repo:** ops (fleet) · **Labels:** `backlog`

`validate-fixture-proof-of-firing.mjs` (and siblings) are copy-pasted across
ops/hds. This session, ops's copy carried a cached-`skip`-as-failure bug that
**hds had already fixed** (its version has the corrected logic + a comment
describing the exact bug) — the fix never propagated. The Ralph kit solved this
class with a checksum drift-guard; the guardrail scripts have no equivalent.
Options: (a) a kit-drift-style checksum guard over the shared `scripts/{check,
audit,validate}-*.mjs` set, or (b) extract the shared harness (gate-output,
proof-of-firing, run-gates) into a versioned package the repos consume. **DoD:**
a fix to a shared guardrail script can't silently fail to reach a sibling repo.

## BS5 — ops: HANDOFF "Now" drifts from the Decisions log
**Repo:** ops · **Labels:** `backlog`

The 2026-07-08 feature-freeze lived as an active "Now" bullet three days after
being lifted (2026-07-11 Decisions entry) — a read-first doc actively
misdirecting the next agent. Lightweight fix: a convention + optional
`check-handoff-freshness.mjs` that flags "Now" claims contradicted by a newer
dated Decisions entry, or a session-end checklist item to reconcile Now against
Decisions. **DoD:** stale Now bullets are caught before they mislead a session.

## BS6 — ops: Vercel Hobby function ceiling (10/12) is an unresolved architectural wall
**Repo:** ops · **Labels:** `needs-adrian`

The function cap recurrently shapes design decisions (this session's catalog was
built static specifically to avoid a new `api/*`). It's a ceiling, not a
resolved constraint — the next api-backed feature hits it. Decide: consolidate
routes under a single dispatcher function (path-param routing in one handler),
or move to a paid plan. Track the tradeoff as a real decision, not a per-feature
workaround. **DoD:** a documented decision + (if consolidation) a plan for the
dispatcher pattern.

## BS7 — fleet: the new design tooling is opt-in and wired to nothing that fires
**Repo:** ops (fleet) · **Labels:** `backlog` · **Cross-ref** hds detect-gate
promotion item in `followup-issues-2026-07-12-design-skills.md`

impeccable's `critique`/`polish` are agent-invoked commands and `detect` is
`manual` channel — nothing makes them fire automatically, so the tooling can sit
unused and never change output. Decide the deterministic firing points:
site-engine pre-ship acceptance step (BS1d), hds `check-impeccable-detect`
promoted to `ci-scheduled`, and/or a CLAUDE.md routing rule strong enough that
the loop actually runs `critique` before a design-touching PR. **DoD:** at least
one automatic firing point per design-facing repo, so adoption doesn't depend on
memory.
