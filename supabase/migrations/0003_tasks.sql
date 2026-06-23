-- =============================================================================
-- hirobius-ops — unified `tasks` table (consolidation target)
-- =============================================================================
-- FINALIZED schema from the ops-archive consolidation-handoff (validated against
-- Postgres 16). Supersedes the earlier provisional 0003. See
-- docs/operations/tasks-consolidation.md and the handoff briefing.
--
-- Receives tasks from MULTIPLE sources into ONE table:
--   - the markdown tracker  (consolidation-handoff/tasks.export.json, source='tracker')
--   - the dashboard's BACKLOG.md                                      (source='backlog')
--   - clients/*/tasks.json                                            (source='client')
-- The lead pipeline lives in a SEPARATE `leads` table (NOT here); client records in
-- a `clients` table — the importer filters those out by import_flags.
--
-- Idempotent import: upsert on `key`. Keys are namespaced (`tracker:OPS-25`,
-- `backlog:...`, `client:...`) so they never collide across sources.

-- ---------------------------------------------------------------- enums --------
-- Status lifecycle (stable, 3 values) — an enum so it's enforced + finalized.
do $$ begin
  create type task_status as enum ('open', 'blocked', 'done');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tasks ---------
create table if not exists tasks (
  id           uuid primary key default gen_random_uuid(),

  -- identity / provenance --------------------------------------------------
  key          text unique not null,            -- namespaced upsert key: '<source>:<NATIVE-ID>' (e.g. tracker:OPS-25)
  source       text not null default 'tracker', -- tracker | backlog | client  (collision-free namespace)
  native_key   text,                            -- original id within the source (OPS-25, LEAD-001)

  -- placement --------------------------------------------------------------
  lane         text not null,                   -- leads|client-sites|lilac|agency|ops|hirobius-clients|learning|career (or backlog/client lanes)
  "group"      text,                            -- sidebar group: Pipeline | Client work | Internal | Personal
  phase        text,                            -- the "## heading" section within a lane
  title        text not null,

  -- lifecycle --------------------------------------------------------------
  status       task_status not null default 'open',  -- canonical lifecycle
  raw_status   text,                            -- source fidelity: open|done|manual-block (tracker)
  derived      text,                            -- actionable|blocked|done SNAPSHOT at import (recompute live, see view below)
  stage        text,                            -- board column where the lane has a pipeline (intake|building|review|live, etc.)

  -- reserved fields (were backtick tags; now real columns) -----------------
  priority     text check (priority in ('high','med','low')),
  due          date,
  owner        text,
  effort       text check (effort in ('S','M','L')),

  -- collections -----------------------------------------------------------
  tags         text[]  not null default '{}',   -- FREE tags only (reserved fields pulled out)
  deps         text[]  not null default '{}',   -- namespaced dependency keys (tracker:L-02)
  blocked_by   text[]  not null default '{}',   -- unmet deps SNAPSHOT (recompute live)
  notes        jsonb   not null default '[]'::jsonb,  -- string[]  (append-only history)
  subtasks     jsonb   not null default '[]'::jsonb,  -- { done: bool, text: string }[]
  import_flags text[]  not null default '{}',   -- leads-pipeline|client-record|test-fixture|tracker-meta|personal-lane

  sort_order   int     not null default 0,      -- preserves original file order

  -- agent-native -----------------------------------------------------------
  claimed_by   text,                            -- "claim before working" — agent/person holding the task
  claimed_at   timestamptz,                     -- when claimed (claim with no progress >24h is stale)
  completed_at timestamptz,                     -- set when status -> done (drives completion ping)
  pinged_at    timestamptz,                     -- last completion ping sent (idempotent webhook guard)

  -- timestamps / soft-delete ----------------------------------------------
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz                      -- soft-delete (Trash). NULL = live.
);

create index if not exists tasks_lane_idx        on tasks (lane);
create index if not exists tasks_status_idx      on tasks (status);
create index if not exists tasks_source_idx      on tasks (source);
create index if not exists tasks_due_idx         on tasks (due);
create index if not exists tasks_live_idx        on tasks (deleted_at) where deleted_at is null;
create index if not exists tasks_deps_gin        on tasks using gin (deps);
create index if not exists tasks_tags_gin        on tasks using gin (tags);

-- ---------------------------------------------------- updated_at + completed_at -
create or replace function tasks_touch() returns trigger as $$
begin
  new.updated_at := now();
  if new.status = 'done' and (old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  end if;
  if new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists tasks_touch_trg on tasks;
create trigger tasks_touch_trg before update on tasks
  for each row execute function tasks_touch();

-- =============================================================================
-- task_events — audit trail (replaces git blame / Discord-on-push history)
-- =============================================================================
create table if not exists task_events (
  id         bigint generated always as identity primary key,
  task_id    uuid references tasks(id) on delete cascade,
  task_key   text not null,                    -- survives a hard delete
  event_type text not null,                    -- created | status_changed | claimed | note_added | completed | deleted | restored
  actor      text,                             -- who/what triggered it (agent name, user, 'system')
  payload    jsonb not null default '{}'::jsonb, -- e.g. { "from": "open", "to": "done" }
  created_at timestamptz not null default now()
);
create index if not exists task_events_task_idx on task_events (task_id);
create index if not exists task_events_key_idx  on task_events (task_key);

-- Log insert + meaningful updates. status->done also pg_notify's for the
-- completion ping (a Supabase DB webhook / Edge Function / pg_cron worker
-- listens on 'task_completed' and posts to Discord, then stamps pinged_at).
create or replace function tasks_audit() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    insert into task_events(task_id, task_key, event_type, actor, payload)
      values (new.id, new.key, 'created', new.owner, jsonb_build_object('status', new.status));
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into task_events(task_id, task_key, event_type, actor, payload)
      values (new.id, new.key, 'status_changed', new.claimed_by,
              jsonb_build_object('from', old.status, 'to', new.status));
    if new.status = 'done' then
      insert into task_events(task_id, task_key, event_type, actor, payload)
        values (new.id, new.key, 'completed', new.claimed_by, jsonb_build_object('key', new.key, 'title', new.title));
      perform pg_notify('task_completed', new.key);   -- completion ping hook
    end if;
  end if;

  if new.claimed_by is distinct from old.claimed_by and new.claimed_by is not null then
    insert into task_events(task_id, task_key, event_type, actor, payload)
      values (new.id, new.key, 'claimed', new.claimed_by, jsonb_build_object('claimed_at', new.claimed_at));
  end if;

  if new.deleted_at is distinct from old.deleted_at then
    insert into task_events(task_id, task_key, event_type, actor, payload)
      values (new.id, new.key, case when new.deleted_at is null then 'restored' else 'deleted' end, new.claimed_by, '{}'::jsonb);
  end if;

  return new;
end $$ language plpgsql;

drop trigger if exists tasks_audit_ins on tasks;
create trigger tasks_audit_ins after insert on tasks
  for each row execute function tasks_audit();
drop trigger if exists tasks_audit_upd on tasks;
create trigger tasks_audit_upd after update on tasks
  for each row execute function tasks_audit();

-- =============================================================================
-- Views — derived-blocked (live) + "what's next"
-- =============================================================================
-- A task is blocked if ANY dep key is not done. Recomputed LIVE — do not trust
-- the imported blocked_by snapshot.
create or replace view tasks_blocked as
select t.id, t.key,
       array_remove(array_agg(d.key) filter (where d.status <> 'done'), null) as unmet_deps,
       (count(d.*) filter (where d.status <> 'done')) > 0                     as is_blocked
from tasks t
left join tasks d on d.key = any(t.deps) and d.deleted_at is null
where t.deleted_at is null
group by t.id, t.key;

-- "What's next": open, not deleted, every dep done — the deps-aware daily driver.
create or replace view tasks_next as
select t.*
from tasks t
join tasks_blocked b on b.key = t.key
where t.status = 'open'
  and t.deleted_at is null
  and not b.is_blocked
order by (t.due is null), t.due asc,
         case t.priority when 'high' then 0 when 'med' then 1 when 'low' then 2 else 3 end,
         t.sort_order;

-- =============================================================================
-- RLS — enable; service-role (server-side import/writes) bypasses RLS.
-- =============================================================================
alter table tasks       enable row level security;
alter table task_events enable row level security;
-- adjust to hirobius-ops auth, e.g.:
-- create policy "tasks read"  on tasks       for select to authenticated using (true);
-- create policy "events read" on task_events for select to authenticated using (true);
