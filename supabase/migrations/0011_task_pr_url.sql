-- Migration 0011 — tasks.pr_url (ops#107)
--
-- The live dispatch-status poller (lib/tasks/dispatch-status.mjs) resolves a
-- dispatched task's linked pull request via the GitHub issue timeline and
-- drives `dispatch_status` through dispatched → running (PR open) → done
-- (merged) / failed (closed unmerged). `pr_url` records which PR that was —
-- distinct from `dispatch_url` (the @claude issue) and `source_url` (import
-- provenance) — so the board can render a "PR ↗" link per row.

alter table tasks add column if not exists pr_url text;
