-- Migration 0003 — consolidated tasks (PROVISIONAL)
--
-- One home for ALL tasks across sources:
--   - the ops-archive markdown tracker  → source 'tracker'
--   - this repo's BACKLOG.md            → source 'backlog'
--   - clients/*/tasks.json              → source 'client:<slug>'
--
-- This is the import target so scripts/import-tasks.mjs has somewhere to write.
-- RECONCILE with hirobius/ops-archive's finalized migration/tasks.schema.sql when
-- the consolidation-handoff lands (adjust columns / status enum to match theirs).
-- See docs/operations/tasks-consolidation.md.

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- identity / provenance
  key text unique not null,   -- namespaced, idempotent upsert: tracker: / backlog: / client:<slug>:
  source text not null,       -- tracker | backlog | client:<slug>

  -- core
  title text not null,
  body text,                  -- notes / description
  status text not null default 'todo',  -- triage|todo|ready|in_progress|blocked|done|archived|idea|parked
  area text,                  -- BACKLOG section / client phase / tracker lane group
  lane text,                  -- tracker lane / client swimlane
  priority int,
  due date,
  owner text,
  tags jsonb,                 -- string[]
  sub_tasks jsonb,            -- [{ title, done }]
  depends_on jsonb,           -- string[] of keys/ids

  -- lifecycle
  archived boolean not null default false,
  deleted_at timestamptz,     -- soft delete

  -- agent-native (dispatch loop: Proceed → GitHub issue → Claude Code session)
  claimed_by text,
  claimed_at timestamptz,
  dispatch_url text,          -- GitHub issue / PR handling this task

  -- traceability
  meta jsonb                  -- original source record
);

create index if not exists tasks_status_idx on tasks (status);
create index if not exists tasks_source_idx on tasks (source);
create index if not exists tasks_area_idx   on tasks (area);

alter table tasks enable row level security;

-- Lightweight audit trail referenced by the tracker's agent-native carry-over spec.
-- Provisional; reconcile on handoff.
create table if not exists task_events (
  id uuid primary key default gen_random_uuid(),
  at timestamptz not null default now(),
  task_key text not null,
  event text not null,        -- created | status_changed | claimed | dispatched | done | note
  data jsonb
);
create index if not exists task_events_task_key_idx on task_events (task_key);
alter table task_events enable row level security;
