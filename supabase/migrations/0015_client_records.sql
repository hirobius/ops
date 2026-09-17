-- Migration 0015 — `client_records` (client records out of the public repo)
--
-- Client records (identity, contact, retainer, tasks, automations, brand audit)
-- are business-confidential and often carry PII. They used to be JSON under
-- clients/<slug>/ — gitignored, so they existed only on the machine that wrote
-- them, and were baked into the /ops bundle at build time. They now live here,
-- in the private database, read by GET /api/clients through the ClientStore
-- port (lib/clients/store.mjs). The public repo keeps only clients/_template/
-- and pseudonymous slugs in code and tests.
--
-- One row per client; each column holds one of the former JSON files verbatim
-- (jsonb), so the /ops pages render exactly what they rendered before:
--   meta.json → meta (required) · tasks.json → tasks · checklist.json → checklist
--   retainer.json → retainer · goals.json → goals · status.json → status
--   automation-config.json → automation_config · brand-audit.json → brand_audit
--   automations/<id>/config.json → workflows ([{ id, config }], id order)
--
-- Filled by the one-time, idempotent import (upsert on slug):
--   node --env-file=.env.local scripts/import-client-records.mjs --apply
--
-- Named `client_records`, not `clients`: 0003_tasks.sql's header already refers
-- to a separate `clients` table concept, so this avoids a silent
-- `create table if not exists` no-op against a differently-shaped table.
--
-- Purely additive and safe to re-run (`if not exists` throughout). RLS enabled
-- with NO policies: only the service-role key (server-side api/ functions and
-- local scripts) can read or write — the anon key sees nothing.

create table if not exists client_records (
  -- identity --------------------------------------------------------------
  -- lowercase kebab-case; `_`-prefixed folders (clients/_template) are
  -- scaffolding and can never be stored.
  slug              text primary key check (slug ~ '^[a-z0-9][a-z0-9-]*$'),

  -- the former clients/<slug>/*.json files ---------------------------------
  meta              jsonb not null check (jsonb_typeof(meta) = 'object'),
  tasks             jsonb,
  checklist         jsonb,
  retainer          jsonb,
  goals             jsonb,
  status            jsonb,
  automation_config jsonb,
  workflows         jsonb check (workflows is null or jsonb_typeof(workflows) = 'array'),
  brand_audit       jsonb,

  -- timestamps ------------------------------------------------------------
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- search_path pinned so the Supabase advisor's "function search path mutable"
-- lint stays clean (now() resolves from pg_catalog regardless).
create or replace function client_records_touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists client_records_touch_trg on client_records;
create trigger client_records_touch_trg before update on client_records
  for each row execute function client_records_touch();

alter table client_records enable row level security;
-- Deliberately no policies: service-role only. Do not add an anon/authenticated
-- read policy — these rows are client-confidential.
