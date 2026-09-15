-- Migration 0014 — drop the two columns 0012_call_tracking duplicated
--
-- Same-day collision cleanup. `callback_at` duplicated #324's `next_action_at`,
-- and `call_notes` duplicated its `lead_notes` table. Keeping both of each would
-- mean two places to write "call back Tuesday" and two places to look for what
-- was said — the worst outcome, because a reader cannot tell which is
-- authoritative.
--
-- Safe: verified both columns held zero non-null values across all 263 rows
-- before dropping. No data is lost.

alter table leads
  drop column if exists callback_at,
  drop column if exists call_notes;
