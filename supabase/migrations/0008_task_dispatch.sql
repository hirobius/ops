-- Migration 0008 — Fleet auto-dispatch board fields (epic #41, Slice 1)
--
-- Fleet epic #41 is the orchestration layer that lets tasks be picked up and
-- routed to an agent automatically instead of via the manual "Dispatch"
-- button (lib/tasks/actions.mjs). Slice 1 (this migration + lib/tasks/tier.mjs)
-- lays the data + routing foundation only — no dispatcher runs yet. Slice 2
-- will add the worker that reads `auto_ok=true` rows, computes tier/model via
-- lib/tasks/tier.mjs::routeTask, writes them back here, and drives
-- dispatch_status through its lifecycle.
--
-- Purely additive so it stacks on 0003/0004 (and is independent of the
-- leads-side 0005/0006/0007 chain). `if not exists` throughout — safe to
-- re-run.

alter table tasks
  -- operator opt-in: only rows with auto_ok=true are eligible for the
  -- Slice 2 dispatcher to pick up unattended. Defaults false — dispatch stays
  -- manual (the existing "Dispatch" action) until a task is explicitly
  -- marked auto_ok via the /ops/tasks board toggle.
  add column if not exists auto_ok          boolean not null default false,
  -- tier/model are the routing OUTPUT of lib/tasks/tier.mjs::routeTask —
  -- computed deterministically from priority/effort/title, no LLM call.
  add column if not exists tier             text,   -- mechanical | standard | judgment
  add column if not exists model            text,   -- sonnet | opus (never haiku — see tier.mjs)
  -- dispatch lifecycle, distinct from the task's own `status` (open|blocked|
  -- done): tracks the auto-dispatch run itself, not the underlying work.
  add column if not exists dispatch_status  text,   -- queued | dispatched | running | done | failed
  add column if not exists dispatch_count   int not null default 0,
  add column if not exists last_dispatched_at timestamptz;

-- Slice 2's dispatcher will scan for eligible rows; a partial index keeps
-- that scan cheap as the table grows (mirrors tasks_live_idx's pattern).
create index if not exists tasks_auto_ok_idx on tasks (auto_ok) where auto_ok;
