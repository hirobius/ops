# Ops Page Rearrangement + Kanban Unification

**Date:** 2026-05-07  
**Status:** Approved — ready for implementation plan

---

## Problem

Three disconnected issues:

1. `AgenticOSPage` has grown bottom-heavy — high-value panels (Strength, Services, Inbox, Trace) are buried below low-signal expanded sections (Clients, Gates, Lanes).
2. Outstanding orchestration build units (39 tasks: `approved`, `parked`, `needs-grilling`) live only in `orchestration.json` and are invisible to the Hermes Kanban board.
3. The LanesGrid links to Atlas when clicked — not the Kanban — creating a navigation dead end.

---

## Decisions

### Kanban is the single source of truth

Hermes Kanban (`/ops/kanban`) is the one board. All outstanding work lives there.  
Status columns (`ready` / `running` / `blocked` / `done`) are the routing mechanism — no additional lane categorization layer needed.  
`assignee` handles role routing. Unassigned tasks → dispatcher. Adrian-owned tasks → his name.

### Lane categories: retired

The `agentic-os/lanes.ts` classification system was designed for `orchestration.json` unit ID prefix patterns. It has no clean mapping to Hermes task IDs (`t_<hex>`). Rather than build a keyword classifier or body-tag system, lanes are dropped entirely. If category grouping becomes necessary later, Hermes' native `skills` field is the hook.

### orchestration.json: read-only history

After migration, `orchestration.json` is a historical record of the autonomous-build run (420 done, 15 denied). No new units are added. The file is not deleted.

---

## Scope

### 1. Migration script — `scripts/migrate-orchestration-to-hermes.mjs`

- Reads `docs/ai/orchestration.json`
- Filters to `status: approved` (26), `parked` (12), `needs-grilling` (1) — 39 units total
- Status mapping:
  - `approved` → Hermes `ready`
  - `parked` → Hermes `todo`
  - `needs-grilling` → Hermes `triage`
- Task body includes: orchestration unit ID, description, validationCmd, agentNotes, dependsOn list
- Dry-run by default; `--execute` flag to actually call Hermes
- Prints a mapping table of `unit_id → hermes_task_id` on completion

### 2. AgenticOSPage rearrangement

New section order (top → bottom):

| # | Component | Change |
|---|---|---|
| 1 | PageHeader | unchanged |
| 2 | SurfacesRail | add "Build" → `/ops/build`, "Knowledge" → `/ops/knowledge` |
| 3 | StrengthFooter | **moved from bottom** |
| 4 | StatusBanner | unchanged |
| 5 | KpiCards | unchanged |
| 6 | Disclosure: Services | **moved up** from bottom |
| 7 | Disclosure: Skills | **moved up** from bottom |
| 8 | Disclosure: Inbox | **moved up** from bottom |
| 9 | Disclosure: Trace | **moved up** from bottom |
| 10 | Section: Routes | unchanged (stays expanded) |
| 11 | Disclosure: Clients | **was Section → now Disclosure** (collapsed by default) |
| 12 | Disclosure: Gates | **was Section → now Disclosure** (collapsed by default) |

Removed: Lanes section, Knowledge section.

### 3. New `/ops/knowledge` page

Minimal hub page. Three pillar tiles in SurfacesRail style:

- **Build** → `/ops/build` — "Autonomous-build pipeline, cost burn, agent audit"
- **Grow** → `/ops/clients` — "Client pipeline, retainers, prospects"
- **Run** → `/ops/atlas` — "Guardrail registry, routes, component inventory"

Route added: `{ path: 'knowledge', element: <LazyHDS Page={KnowledgePage} /> }` under `/ops`.

### 4. routes.tsx

Add the `/ops/knowledge` route. No other route changes.

---

## Out of scope

- Lane classification / keyword tagger
- LanesGrid on KanbanPage (not added)
- Any changes to KanbanPage itself
- Building out Build/Grow/Run as full sub-pages (just the hub tiles)
- Pushing orchestration `done` or `denied` units to Hermes

---

## Validation

- `pnpm typecheck` passes
- `pnpm test:layout` passes
- `/ops` renders with new section order; Strength panel visible near top
- `/ops/knowledge` renders with three tiles, all links resolve
- `/ops/kanban` unaffected
- Migration script dry-run prints 39 units with correct status mapping; `--execute` requires Hermes running locally
