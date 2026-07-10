-- Migration 0010 — tasks.source_url (ops#105)
--
-- lib/tasks/import-issues.mjs stamped a freshly-imported GitHub issue's own
-- URL into `dispatch_url` at import time, on the reasoning that "the issue
-- already IS the dispatch target." But scripts/fleet-dispatch.mjs's
-- eligibility query requires `dispatch_url IS NULL`, so any GitHub-imported
-- task already had `dispatch_url` set the moment it was imported and could
-- never satisfy that check — auto-dispatch never fired for imported issues.
--
-- Split provenance (source_url: where the issue came from) from dispatch
-- lifecycle (dispatch_url: set only once actually dispatched).

alter table tasks add column if not exists source_url text;
