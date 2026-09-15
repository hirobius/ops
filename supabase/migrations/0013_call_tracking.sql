-- Migration 0013 — call-channel outcome tracking
--
-- RENUMBERED from 0012. Two sessions landed a 0012 on the same day: #324's
-- 0012_pitch_queue.sql (assigned_to, next_action_at, the lead_notes table) and
-- this one. Both were applied to the live database before the collision was
-- noticed; this file is the reconciliation, and it defers to #324 wherever the
-- two overlapped.
--
-- What #324 already owns, and this migration therefore does NOT duplicate:
--   * "come back to this lead at time T"  -> its `next_action_at`, not a second
--     `callback_at` column.
--   * "what was said"                     -> its `lead_notes` TABLE, not a
--     `call_notes` text column. Its reasoning is right and worth repeating: a
--     single overwritten column loses the history of a conversation, which is
--     the one thing a second person picking up the call actually needs.
-- Both of this migration's duplicate columns were dropped again in 0014; they
-- never held a row.
--
-- What remains here is genuinely additive, because #324's queue reuses
-- `outreach_status` from 0007 for stage, and that vocabulary is the EMAIL
-- lifecycle ('sent' / 'replied' / 'bounced' / 'unsubscribed'). It cannot express
-- a dial that nobody picked up, and it has nowhere to count repeats:
--
--   1. Calls REPEAT. A lead is dialled three or four times before it resolves.
--      Without an attempt counter, "called twice, no answer" and "never called"
--      are indistinguishable.
--   2. Calls produce a COARSE, FIXED set of outcomes. 200 calls logged as free
--      text yield anecdotes; logged against a closed vocabulary they yield a
--      funnel you can divide.
--
-- Purely additive (`add column if not exists`).

alter table leads
  add column if not exists call_attempts int default 0,  -- dials placed, not conversations
  add column if not exists last_call_at  timestamptz,
  add column if not exists call_outcome  text;           -- latest outcome, vocabulary below

-- The closed vocabulary, in three groups:
--
--   RETRY    no-answer, voicemail, gatekeeper  -> dial again later
--   TERMINAL not-interested, wrong-number, disconnected, do-not-call,
--            meeting-booked                    -> never cold-dial again
--   ADVANCED callback, interested              -> a real outcome
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
