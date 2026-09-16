# Architecture Scrub — 2026-07-02

> **Point-in-time audit + cleanup tracker. NOT a routing doc.** Produced by a
> 5-agent parallel scrub (lib+deps · api · ops-surfaces · scripts · docs) ahead
> of the HDS cutover, so we don't restyle or build on dead code. Every Tier-1
> and dead-dep claim below was spot-verified by hand (grep/ls), not taken on
> the agents' word. Canonical state stays in `HANDOFF.md`; this file is deleted
> once the tiers are worked through.

## The shape of it

The repo carries a thick layer of **retired-orchestration sediment**. An old
multi-agent build system (`orchestration.json` + `OPERATOR_BRIEF` night-shift
loop + `swarm-watchdog` + `_retired-2026-05-06/` scripts) was replaced by Hermes
Kanban + `HANDOFF.md`, but the replacement was never finished cleanly: dead
files were moved, not deleted, and **live wiring still points into the graves**
(a commit hook, three `/ops` buttons, a CI gate, a registry entry). Meanwhile
the `/ops` index renders its headline numbers from a **frozen 52-day-old
archive**, and the doc layer has 4–5 competing "start here" files that disagree
on whether this repo is an HDS product or an agency ops platform.

None of it is fatal — the app works — but it's exactly the "building on stale
foundations" tax to clear before the cutover.

Counts: **~90 findings** — 6 live-breakage · ~15 safe deletions · ~20
retired-but-referenced · ~15 doc-coherence · plus the 57-file / ~17k-line HDS
cutover inventory.

---

## Tier 1 — Live breakage (fix now, low risk) ✅ all verified

| # | What's broken | Evidence | Fix |
|---|---|---|---|
| 1 | **Every commit silently fails a hook step** | `.husky/post-commit:17` nohup-calls `scripts/orchestration-watcher.mjs` — only exists in `_retired-2026-05-06/`; stderr → `/dev/null` hides it | Remove the dead nohup block |
| 2 | **3 `/ops` skill buttons ENOENT when clicked** | `scripts/skill-runner-middleware.mjs:55-62` — `snapshot-orch`, `list-eligible`, `triage-approved` argv point at moved scripts | Remove/repoint those SKILLS entries |
| 3 | **CI fails on `main`** | `.github/workflows/quality.yml:48,55` run `pnpm size-limit` + `pnpm build:lib`; both target `vite.config.lib.ts` + `src/index.ts` which **never existed** | Remove vestigial library config + those CI steps (see Tier 2 dep note) |
| 4 | **`/ops` index shows stale numbers** | `agentic-os/data.ts:22`, `BuildPage.tsx:29`, `atlas/pipeline-dag.tsx` import `docs/ai/_archive/legacy-task-systems-2026-05-11.json` (frozen 52d) for KpiCards/PillarRail/StatusBanner/DAG | Repoint at live Kanban hooks (`useKanbanBoard`/`useOpenThreads`) or retire those blocks |
| 5 | **`SYSTEM_OVERVIEW.md` regenerates lies** | `generate-strength-report.mjs` (~L1359-1384) emits hardcoded strings ("swarm-watchdog dispatches…", "435+ orchestration units", links retired `OPERATOR_BRIEF`) — refreshed today by `pnpm strength` | Fix the hardcoded template strings |
| 6 | **`registry.json` dangling gate** | `check-unit-overlap` entry (~L754) `gateScript` points at moved `scripts/check-unit-overlap.mjs`; `firingChannel:"manual"` so it doesn't fire, but it's a lie | Repoint or delete the entry + `fixtures/check-unit-overlap/` |

Secondary: `/api/projects` has **no dev middleware** (unlike leads/tasks), so
`/ops/projects` can't load data under plain `pnpm dev` — add a mirror or
document the gap.

---

## Tier 2 — Dead code, safe to delete (report → your approval → remove)

**Dead dependencies (0 importers, verified):** `@react-three/drei`,
`@react-three/fiber`, `@react-three/postprocessing`, `postprocessing`,
`fuse.js`, `zustand` — plus the dead `vendor-three` `manualChunks` branch in
`vite.config.mjs` (references a `HdsMobiusLogo` that doesn't exist). Keep the 4
radix/cva deps that *look* unused — they're load-bearing transitive deps of
`@hirobius/design-system`.

**Dead scripts (8):** `a11y-schema-check.mjs`, `gpt-knowledge.mjs` (+ its only
consumer `lib/knowledge-classify.mjs`), `project-component-spec.mjs`,
`update-commit-history.mjs`, `test-bridge-endpoints.mjs`,
`migrate-backlogs-to-hermes.mjs`, `compact-done-units.py`. ⚠ Confirm before
delete (possibly your personal machine tooling): `bridge-wsl2-port.ps1`,
`setup-cron-windows.ps1`.

**Dead `src/app` files:** `pages/lab/IncubatorPage.tsx` (no `/lab` route),
`pages/ops/atlas/knowledge-tab.tsx` (orphan), `hooks/useHdsManifest.ts`,
`lib/navLevels.ts`, `stores/mobiusCurve.ts` + `utils/colorUtils.ts` (test-only)
— plus their orphan tests, incl. the already-broken `tests/mobiusStore.test.ts`
(imports a module that never existed).

**Dead route:** `api/ops-logout.ts` — zero callers. Either wire a logout button
or delete it (reclaims 1 of 10 Hobby function slots).

**Stale test manifest:** `tests/layout-integrity.spec.ts` `ALL_ROUTES` — 7
entries 404 against the live router (`/wet-paint`, `/case-studies/*`, `/visuals`,
`/portfolio/draft`, `/lab/incubator`, …); 25 `/ops/hds/*` entries all hit one
redirect. Prune to match reality.

---

## Tier 3 — Retired-but-referenced (finish the retirement)

**Duplicate scripts:** `figma-library-generate.mjs` (fold `--live` into
`build-figma-variables.mjs`), `hds-lint.js` (superseded by registered gates),
`swiss-canon-check.mjs` (overlaps `check-source-canon.mjs`).

**`orchestration.json`-dependent scripts now inert** (input file gone):
`classify-pillars.mjs`, `triage-approved.mjs` (also a live `/ops` no-op button),
`merge-squash.mjs` step 4, `migrate-orchestration-to-hermes.mjs`,
`import-tasks.mjs`, `haiku-agent.mjs` (haiku is banned per CLAUDE.md),
`cost-ceiling-gate.mjs` (companion to retired `swarm.mjs`).

**Missing pnpm aliases** documented as real commands: `kanban:start`
(CLAUDE.md + dispatch-unit skill reference `pnpm kanban:start`).

**Live skill/doc references into `_retired-2026-05-06/`:**
`claude-config/skills/dispatch-unit/SKILL.md` still cites `swarm-watchdog.mjs` +
`hermes-unit.mjs` as current — add a retirement note or rewrite.

---

## Tier 4 — Doc coherence (fix routing, don't delete)

The single biggest orientation risk: **CLAUDE.md's own routing table sends
sessions to retired docs** with no marker.

- **CLAUDE.md** §1a/routing: `AUTONOMOUS_BUILD.md`, `overnight-handoff-2026-05-06.md`,
  the `watchdog-policy.json`/`proposed-units.jsonl` bullets all describe the
  retired watchdog in the present tense (sibling bullets already carry
  `doc-ref-ok: retired`). Add markers or repoint.
- **Identity split — reconcile to `NORTH_STAR.md` (agency ops platform, HDS is
  instrumental):** `README.md` + `AGENTS.md` frame the repo as a "portfolio-grade
  design-system product," omit `HANDOFF.md`/`NORTH_STAR.md`, and point at
  nonexistent `TASKS.md`. `AI_ORCHESTRATION.md` self-presents as a live
  "AUTO-PILOT" directive with unchecked task boxes. `AGENT_GUIDELINES.md` (cited
  as "source of truth") lists banned haiku + a stale gate cascade + the dead
  claim protocol.
- **Competing "what exists" registries:** `SYSTEMS_REGISTRY.md` (describes
  unwired `.githooks/`), `OPERATING_MAP.md` (routes tasks to nonexistent
  `TASKS.md`) vs the live `registry.json` + `scripts/INDEX.json`.
- **Archive hygiene:** move `handoff-2026-05-06-evening.md`,
  `handoff-2026-05-06-late.md`, `figma-plugin/{EXECUTION_PLAN,ROADMAP}.md`,
  `MULTI_AGENT_OVERNIGHT.md`, `PROMPT_TEMPLATES.md`, `MODEL_TIERS.md` into
  `docs/ai/archive/` with banners.

---

## HDS cutover inventory (the survivor worklist)

**Scale:** 57 files under `src/app/pages/ops/**` + shared components, ~17,300
lines. **56/57 carry the deprecated bare-prose `hds-bypass` skip-all marker** —
per-file style gates are effectively OFF across all of `/ops` today. **9 files
(~2,100 lines) import zero HDS components** (fully hand-rolled).

**Delete before cutover (don't restyle dead pages):** `OpsDashboardPage.tsx`
(`/ops/_legacy`, self-marked temporary — first harvest its Services/Packages
content), `IncubatorPage.tsx`, `atlas/knowledge-tab.tsx`.

**Highest-leverage conversion order (shared chrome first):**
1. `PageHeader.tsx` (104 L, **used by 16/17 routed pages**, zero HDS imports) — single biggest win
2. `OpsShell.tsx` (74 L, layout for all `/ops/*`) + `Disclosure.tsx` (131 L, shared collapsible)
3. `SessionInputForm.tsx` (used by 4 surfaces), `agent-tag.tsx`, `phase-header.tsx`
4. Then per-cluster pages: leads → projects → tasks → clients → kanban → atlas → ops-index

**Handle with care:** `OpsGate.tsx` (the password gate — don't break auth);
`PodTail.tsx` (the ONE file with no bypass marker — inline styles, inconsistent).

**Cutover open question:** all 17 routed pages, or core-first (leads/projects/
clients/tasks) to lock the HDS pattern before the long tail?

---

## Recommended sequence

1. **Tier 1** — fix the 6 live-breakage items (low risk, mostly deletions of dead wiring). Unblocks a clean commit hook + green CI + honest `/ops` numbers.
2. **Tier 2** — remove dead deps/scripts/files (on your approval). Shrinks the cutover surface before we touch it.
3. **HDS cutover** — shared chrome first, then survivor pages in cluster order.
4. **Tier 4** — reconcile the doc/identity layer to `NORTH_STAR.md` (can run in parallel with the cutover).
