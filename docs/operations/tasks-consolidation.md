# Tasks consolidation — one Supabase `tasks` table

Goal: a single source of truth for all tasks, in this repo (`hirobius/ops`), in a
Supabase `tasks` table — merging three sources:

| Source | Where | `key` prefix |
|---|---|---|
| Markdown tracker | `hirobius/ops-archive` (the `ops-dusky` repo) — export via the handoff prompt | `tracker:` |
| Dashboard backlog | `BACKLOG.md` (this repo) | `backlog:` |
| Client tasks | `clients/*/tasks.json` (this repo) | `client:<slug>:` |

## Repo topology (confirmed)

- **`hirobius/ops`** — this dashboard (new). Consolidation target.
- **`hirobius/ops-archive`** — old markdown tracker; has the drafted
  `migration/tasks.schema.sql` + `tasks.seed.json` + the live markdown tasks.
  **Run the consolidation-handoff prompt here.**
- `hirobius/clients` — lead-gen/agent source. `hirobius/hirobius-design-system` —
  the design-system package (also the deploy blocker, see `deploy-unblock.md`).

## Scaffold (shipped on this branch)

- `supabase/migrations/0003_tasks.sql` — provisional `tasks` (+ `task_events`)
  table: `key` unique (idempotent upsert), `source`, status lifecycle, area/lane,
  priority/due/owner/tags/sub_tasks/depends_on, soft-delete, agent-native claim +
  `dispatch_url` columns, `meta` (original record). **Reconcile with ops-archive's
  finalized `tasks.schema.sql` when the handoff lands.**
- `scripts/import-tasks.mjs` — parses all three sources → normalized rows →
  dedupes by `key` → dry-run output + (with `--write`) upserts into Supabase.

## Run it (at cutover)

1. Get the handoff from the `ops-archive` chat (the prompt was sent there). Drop its
   `tasks.export.json` at **`data/tracker-tasks.export.json`** in this repo.
2. Apply the migration: run `0003_tasks.sql` in Supabase (after `0001`/`0002`).
3. Dry run: `node scripts/import-tasks.mjs` → review `data/tasks.normalized.json`
   and the printed by-source / by-status / collision summary.
4. Write: `node scripts/import-tasks.mjs --write` (needs `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`). Idempotent — safe to re-run.

> `data/` is local I/O (export in, normalized out) — gitignore it; don't commit.

## Status mapping (normalized)

`ready, blocked, parked, triage(needs-grilling), idea` (backlog) ·
`done, todo, in_progress, blocked` (clients) · tracker statuses pass through
(lowercased, spaces/dashes → `_`). Reconcile the canonical set against the
tracker's `MAPPING.md` when it arrives, then tighten `0003` (enum or check).

## Next (after import)

- `/ops/tasks` board (mirror the leads pattern) reading the `tasks` table — the new
  single source of truth, with the same Proceed/Punt/Backlog CTAs as the agentic
  loop (`agentic-ops-loop.md`). Tasks + findings share one store.
- Retire `BACKLOG.md` to a thin pointer at the board; archive `clients/*/tasks.json`
  once mirrored (or keep client task editing client-side and sync).
- Reconcile `0003` with the tracker schema; add any agent-native columns we kept.
