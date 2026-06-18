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

Handoff **received** (briefing from `ops-archive`; artifacts on its
`consolidation-handoff` branch). Schema + importer now match it.

- `supabase/migrations/0003_tasks.sql` — the **finalized** schema from the handoff
  (PG16-validated): `task_status` enum (`open|blocked|done`), namespaced unique
  `key`, `source`/`native_key`, lane/group/phase/stage, reserved columns
  (priority/due/owner/effort) + free `tags[]`, `deps[]`/`blocked_by[]`,
  `notes`/`subtasks` jsonb, `import_flags[]`, `sort_order`, soft-delete, agent-native
  `claimed_by`/`claimed_at`/`completed_at`/`pinged_at`; `tasks_touch` + `tasks_audit`
  triggers; `task_events` audit table (+ `pg_notify('task_completed')` for the
  Discord ping); `tasks_blocked` + `tasks_next` views; RLS on.
- `scripts/import-tasks.mjs` — tracker rows are already schema-shaped → passed
  through (minus the descriptive-only `is_done`); BACKLOG.md + clients are mapped
  into the same columns; dedupe by `key`; dry-run by default; `--write` upserts.
  Applies the handoff's default **DROP filter** (`leads-pipeline`, `client-record`,
  `test-fixture`) unless `--include-all`. Verified locally: 62 backlog + 55 client
  rows normalized cleanly to the enum.

## Run it (at cutover)

1. Get `tasks.export.json` from the `ops-archive` repo's `consolidation-handoff`
   branch (`consolidation-handoff/tasks.export.json`) — download it and drop it at
   **`data/tracker-tasks.export.json`** here, OR add `ops-archive` to the agent's
   scope so it can pull the branch directly. (Re-run the exporter at cutover for a
   fresh snapshot.)
2. Apply the migration: run `0003_tasks.sql` in Supabase (after `0001`/`0002`).
3. Dry run: `node scripts/import-tasks.mjs` → review `data/tasks.normalized.json`
   and the printed by-source / by-status / collision summary.
4. Write: `node scripts/import-tasks.mjs --write` (needs `SUPABASE_URL` +
   `SUPABASE_SERVICE_ROLE_KEY`). Idempotent — safe to re-run.

> `data/` is local I/O (export in, normalized out) — gitignore it; don't commit.

## Status mapping (3-value, finalized)

Canonical lifecycle is the enum **`open | blocked | done`**. The original is kept
verbatim in `raw_status`:
- backlog badges: `blocked`→blocked, (none done)→done, everything else
  (`ready`/`idea`/`parked`/`needs-grilling`)→**open** (badge preserved in `raw_status`).
- client tasks: `done`→done, `blocked`→blocked, `todo`/`in-progress`→**open**.
- tracker: already `open|blocked|done` — passed through.
Derived-blocked is recomputed live by the `tasks_blocked` view — the imported
`blocked_by` is only a snapshot.

## Merge caveats (from the handoff — defaults applied by the importer)

- **leads (36)** → excluded (flag `leads-pipeline`); belong in the dashboard's
  separate `leads` table. Optional follow-up: map them into `leads`.
- **client-sites (4)** → excluded (`client-record` + `test-fixture`); they're client
  *entities* (1 template + 3 fictional seeds), not tasks.
- **HC-16/17/18** → excluded (`test-fixture`, fictional briefs).
- **ops lane (25, `tracker-meta`)** → imported but **review**; it's the retiring
  tracker's own build backlog (~14 already done) and overlaps this repo's backlog.
- **learning (10) + career (8), `personal-lane`** → imported; decide whether the
  command center should carry personal lanes (use `--include-all` is unrelated —
  these aren't in the DROP set; triage post-import or filter by flag).
- **done (19)** → imported as history (`status='done'`); skip later if undesired.

Net with defaults (verified by dry-run against the real export): **105** tracker +
**65** backlog + **55** client = **225** rows, 0 key collisions. (The handoff's
"~101 tracker" estimate was off by 4 — the real drop is exactly 43 = leads 36 +
client-sites 4 + HC-16/17/18.) Then triage `tracker-meta` / `personal-lane` / done.

## Board — `/ops/tasks` (shipped)

Built on the leads-board pattern (reads the `tasks` table, mutates via the API):
- `api/tasks.ts` (GET) + `api/task-action.ts` (POST) — prod Vercel functions;
  dev-mirrored by `scripts/tasks-middleware.mjs` via the shared `lib/tasks/actions.mjs`.
- `src/app/pages/ops/tasks/` — `TasksPage.tsx` (lane-grouped, status/source filters),
  `useTasks.ts` (poll), `types.ts`. Route + nav + route-coverage wired.
- CTAs per task: **Done/Reopen**, **Trash** (soft-delete), and **Dispatch** — opens a
  GitHub issue that @mentions Claude (the agentic-loop hand-off; no Claude API).
  Dispatch needs `GITHUB_TOKEN` (+ optional `GITHUB_REPO`, default `hirobius/ops`).
- Shows live only after `0003_tasks.sql` is applied + the import runs; until then
  the board renders its offline notice.

## Next

- Retire `BACKLOG.md` to a thin pointer at the board; archive `clients/*/tasks.json`
  once mirrored (or keep client task editing client-side and sync).
- Reconcile `0003` with the tracker schema; add any agent-native columns we kept.
- Wire the daily-review findings into the same store (the agentic loop) — tasks +
  findings, one board.
