-- Migration 0007 — CRM lifecycle + suppression (compliance #36)
--
-- Adds the columns that (a) let us honor opt-outs / deletion requests
-- (do_not_contact tombstone survives the retention purge — see #37) and
-- (b) finally let us measure conversion by niche/geo/score, not just what
-- SCORES. Purely additive so it stacks on 0001/0002/0005/0006.

alter table leads
  -- outreach lifecycle
  add column if not exists outreach_status text,        -- queued | sent | replied | bounced | won | lost
  add column if not exists contacted_at    timestamptz,
  add column if not exists replied_at      timestamptz,
  add column if not exists won_at          timestamptz,
  add column if not exists lost_at         timestamptz,
  add column if not exists contact_channel text,        -- email | phone
  add column if not exists owner_name      text,
  -- suppression (compliance): never contact / never re-surface these
  add column if not exists do_not_contact   boolean not null default false,
  add column if not exists unsubscribed_at  timestamptz,
  add column if not exists suppression_reason text;      -- unsubscribe | deletion-request | bounce | manual

-- Suppression + lifecycle reads.
create index if not exists leads_do_not_contact_idx on leads (do_not_contact) where do_not_contact = true;
create index if not exists leads_outreach_status_idx on leads (outreach_status);
