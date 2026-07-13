-- 0012_client_feedback.sql — client-portal feedback intake (change requests).
--
-- Backs the portal's "Send feedback" card (/c/:slug — previously a
-- console.log stub) and the /ops ClientFeedbackPanel inbox. Written by
-- api/portal-verify.ts via lib/portal-feedback.mjs (service-role only; no RLS
-- policies needed — the anon key never touches this table).
--
-- Applied manually by Adrian via the Supabase SQL editor (same convention as
-- 0008/0011): https://supabase.com/dashboard/project/vvyccwxtcwvlusweenje/sql/new

create table if not exists client_feedback (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  message text not null,
  contact text,
  status text not null default 'new', -- new | done
  created_at timestamptz not null default now()
);

create index if not exists client_feedback_created_at_idx
  on client_feedback (created_at desc);

alter table client_feedback enable row level security; -- service-role bypasses; anon gets nothing
