-- Migration 0009 — Fleet auto-dispatch safety layer (issue #47, B.2 + B.3)
--
-- Issue #47 audited the old (deleted) orchestration tooling and named the two
-- gates that must exist before the mayor can be scheduled unattended:
--   B.2 claim/lease — closes the double-dispatch race (two concurrent
--       fleet-dispatch runs, or a Routine overlapping a manual run, both
--       selecting the same eligible row before either writes back).
--   B.3 file-overlap — the fan-out safety gate ("two agents must never touch
--       the same file"), revived from the deleted check-unit-overlap.mjs.
--
-- Purely additive, `if not exists` throughout — safe to re-run, stacks on
-- 0008 (auto_ok/tier/model/dispatch_status).

alter table tasks
  -- B.2: claim/lease. A short-TTL lease claimed atomically (conditional
  -- UPDATE — see lib/tasks/lease.mjs::claimLease) immediately before a task
  -- is dispatched. lease_expires_at in the past (or null) means unleased —
  -- an abandoned/expired lease is reclaimable, not permanent.
  add column if not exists lease_owner      text,
  add column if not exists lease_expires_at timestamptz,
  -- B.3: file-overlap. Operator/importer-supplied list of file paths (or
  -- directory prefixes) this task is expected to touch. Nullable — a task
  -- with no `touches` declared is a known gap (nothing infers it
  -- automatically yet) and is NOT blocked by the overlap gate; it's on the
  -- honor system until a follow-up wires inference from the task body.
  add column if not exists touches          jsonb;

-- lib/tasks/lease.mjs's claimLease filters on this column every dispatch
-- attempt; keep the scan cheap (mirrors tasks_auto_ok_idx's pattern).
create index if not exists tasks_lease_idx on tasks (lease_expires_at) where lease_expires_at is not null;
