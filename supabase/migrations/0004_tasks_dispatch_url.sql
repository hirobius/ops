-- Migration 0004 — tasks.dispatch_url
--
-- The Dispatch action (lib/tasks/actions.mjs) opens a GitHub issue and stamps
-- its URL back onto the row (alongside claimed_by='claude'). The finalized 0003
-- schema shipped without this column, so dispatch created the issue but 500'd on
-- the write-back ("Could not find the 'dispatch_url' column"). Add it.

alter table tasks add column if not exists dispatch_url text;
