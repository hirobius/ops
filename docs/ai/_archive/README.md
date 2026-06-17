# Legacy orchestration / task systems

Read-only historical snapshot from the era when this repo ran 4 parallel
task-tracking systems. As of 2026-05-11, the single source of truth is
[`/BACKLOG.md`](../../../BACKLOG.md) at the repo root.

## Contents

**[`legacy-task-systems-2026-05-11.json`](./legacy-task-systems-2026-05-11.json)** — single
consolidated archive containing snapshots of:

| Source | Tasks | Was |
|---|---|---|
| `sources.orchestration` | 474 units | `docs/ai/orchestration.json` (build-pipeline units, `13y-*` / `12i-*` / etc.) |
| `sources.hermes_kanban` | 639 tasks | `~/.hermes/kanban.db` SQLite (modern `t_*` tasks) |
| `sources.ready_queue` | derived view | `docs/ai/ready-queue.json` (auto-generated) |
| `sources.proposed_units` | 28 seeds | `docs/ai/proposed-units.jsonl` (append-only side-quest seam) |

## Why archived, not deleted

Some commits reference these IDs (`Refs: 13y-9`, `Refs: t_a8e3...`), some
branch names use the legacy ID format, and a few `src/app/pages/ops/**`
components still read this archive to render frozen historical data on the
internal /ops dashboards. Keeping the snapshots means historical references
stay resolvable.

## Do not modify

This file is frozen. New tasks go in [`/BACKLOG.md`](../../../BACKLOG.md) only.
