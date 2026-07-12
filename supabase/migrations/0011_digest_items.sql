-- Migration 0011 — `digest_items` (Digest → Issue epic #77, P1 state foundation, ops#78)
--
-- Replaces the read-only src/app/digests/*.json glob with a real store so
-- digest items can carry a status lifecycle: dismiss/restore lands here (P1);
-- analyze/promote (P2-P4, LLM-backed) land on the same row later — no
-- migration needed for those, just new `status` values + the `analysis`
-- column already provisioned below.
--
-- Idempotent import: upsert on `item_key`, a stable id derived from the
-- source JSON's `date` + `title` (scripts/seed-digest-items.mjs) — re-running
-- the seed for the same committed JSON updates rows in place, never
-- duplicates. Purely additive — safe to re-run. Mirrors 0003_tasks.sql's
-- shape/conventions (enum status, `if not exists` throughout, RLS enabled
-- with no policies — service-role key bypasses).

do $$ begin
  create type digest_item_status as enum ('new', 'analyzed', 'promoted', 'dismissed');
exception when duplicate_object then null; end $$;

create table if not exists digest_items (
  id         uuid primary key default gen_random_uuid(),

  -- identity / provenance ---------------------------------------------------
  item_key   text unique not null,             -- stable id: '<date>::<title-slug>'
  date       date not null,
  source     text,                             -- newsletter/feed name (digest file's `source`)

  -- content -------------------------------------------------------------------
  title      text not null,
  summary    text,
  ops_angle  text,
  tag        text,
  -- source article links ({ label, url }[]) — not in the issue's column list
  -- but load-bearing: the page's whole point is "read -> open link -> decide",
  -- not re-reading the newsletter. Dropping it would regress existing behavior.
  links      jsonb not null default '[]'::jsonb,

  -- lifecycle -------------------------------------------------------------
  status     digest_item_status not null default 'new',
  analysis   jsonb,                            -- P2+ LLM analysis output, null until analyzed
  issue_url  text,                             -- P4: the GitHub issue this item was promoted to

  -- timestamps --------------------------------------------------------------
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists digest_items_date_idx   on digest_items (date);
create index if not exists digest_items_status_idx on digest_items (status);

create or replace function digest_items_touch() returns trigger as $$
begin
  new.updated_at := now();
  return new;
end $$ language plpgsql;

drop trigger if exists digest_items_touch_trg on digest_items;
create trigger digest_items_touch_trg before update on digest_items
  for each row execute function digest_items_touch();

alter table digest_items enable row level security;
-- adjust to hirobius-ops auth, e.g.:
-- create policy "digest_items read" on digest_items for select to authenticated using (true);
