-- Migration 0012 — the pitch queue (a call sheet, not a CRM)
--
-- Adds only what moving a lead through a conversation needs: who is working
-- it, when to come back, and a running log of what was said. The stage itself
-- reuses `outreach_status` from 0007 rather than introducing a parallel
-- vocabulary — the compliance doc, the retention purge and the #321 tripwire
-- all read those values.
--
-- Purely additive, so it stacks on 0001/0002/0005/0006/0007.

alter table leads
  -- Who is working this lead. Free text (a name), not a user id: there is no
  -- user table, and the partner is a person on a phone, not an account.
  add column if not exists assigned_to    text,
  -- "call back Tuesday". The queue surfaces anything due.
  add column if not exists next_action_at timestamptz;

-- Notes are a log, not a field. A single overwritten text column loses the
-- history of a conversation, which is the one thing a second person picking up
-- the call actually needs.
create table if not exists lead_notes (
  id         uuid primary key default gen_random_uuid(),
  lead_id    uuid not null references leads(id) on delete cascade,
  created_at timestamptz not null default now(),
  author     text not null,
  body       text not null
);

-- The queue reads newest-note-per-lead constantly.
create index if not exists lead_notes_lead_created_idx on lead_notes (lead_id, created_at desc);
create index if not exists leads_assigned_to_idx on leads (assigned_to);
create index if not exists leads_next_action_idx on leads (next_action_at) where next_action_at is not null;

-- Same posture as `leads`: service-role only. No anon or authenticated path to
-- lead PII, and notes are lead PII (they are about a named business owner).
alter table lead_notes enable row level security;
