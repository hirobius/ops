-- Migration 0009 — live dispatch-status feed (issue #50)
--
-- Adds `pr_url`, the merged/open pull request lib/tasks/dispatch-status.mjs
-- resolves from a task's `dispatch_url` (the @claude issue) via the GitHub
-- timeline API. Purely additive, `if not exists` — safe to re-run.

alter table tasks
  add column if not exists pr_url text;
