-- Migration 0012 — call-channel tracking
--
-- The email channel has a lifecycle (0007: outreach_status, contacted_at,
-- replied_at, do_not_contact). The CALL channel had nothing, and calls are
-- shaped differently in two ways that a single status column cannot express:
--
--   1. Calls are REPEATED. A lead is dialled three or four times before it is
--      resolved; `outreach_status` can only hold the latest state, so without an
--      attempt counter "called twice, no answer" and "never called" look alike.
--   2. Calls produce a COARSE, FIXED set of outcomes. 200 calls logged as free
--      text yield anecdotes; logged against a closed vocabulary they yield a
--      funnel you can actually divide.
--
-- Purely additive (`add column if not exists`), so it stacks on 0001-0011.

alter table leads
  add column if not exists call_attempts  int default 0,   -- dials placed, not conversations
  add column if not exists last_call_at   timestamptz,
  add column if not exists call_outcome   text,            -- latest outcome, see vocabulary below
  add column if not exists callback_at    timestamptz,     -- honour a "call me Tuesday"
  add column if not exists call_notes     text;            -- what was actually said

-- The closed vocabulary. Split deliberately into three groups:
--
--   RETRY    no-answer, voicemail, gatekeeper  -> dial again later
--   TERMINAL not-interested, wrong-number, disconnected, do-not-call
--            -> never dial again (do-not-call ALSO sets do_not_contact)
--   ADVANCED callback, interested, meeting-booked -> a real outcome
--
-- Keeping "no-answer" distinct from "voicemail" matters: reaching voicemail
-- proves the number is live, which is a different fact about the lead than
-- ringing out, and it is the difference between a bad list and a bad time of day.
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'leads' and constraint_name = 'leads_call_outcome_check'
  ) then
    alter table leads
      add constraint leads_call_outcome_check
      check (call_outcome is null or call_outcome in (
        'no-answer', 'voicemail', 'gatekeeper',
        'not-interested', 'wrong-number', 'disconnected', 'do-not-call',
        'callback', 'interested', 'meeting-booked'
      ));
  end if;
end $$;

-- Read: "who do I dial next?" — the export script's ordering.
create index if not exists leads_call_queue_idx
  on leads (call_attempts, last_call_at nulls first);

-- Read: "what came back from the calls?" — the funnel.
create index if not exists leads_call_outcome_idx on leads (call_outcome);
