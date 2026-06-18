-- Migration 0001 — leads
--
-- Backing table for the lead-gen + AI-agent pipeline ported from hirobius/clients
-- (Places "lead puller" + enrich→generate→judge agent). See docs/OPS-INTEGRATION
-- brief, Part 2.
--
-- Lifecycle (status column): sourced → generating → scored → sent → won/lost
--   - sourced:    inserted by /api/pull-leads (Places sourcing)
--   - generating: claimed by /api/generate-site while the agent runs
--   - scored:     agent finished (config + eval_* populated)
--   - sent:       outreach delivered (preview_url + sent_at)
--   - won/lost:   terminal outcome
--
-- Idempotency: `place_id` is the natural unique key so re-running a sweep
-- upserts (onConflict: 'place_id') instead of duplicating rows.
--
-- Security: RLS is enabled with NO policies. The service-role key (used only in
-- server code — Vercel functions / workers) bypasses RLS, so all reads/writes go
-- through the server. The anon/public key has zero access. Never ship the
-- service-role key to the client.

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),

  -- sourcing (Places puller)
  place_id text unique,
  name text,
  category text,
  phone text,
  website text,
  city text,
  region text,
  rating numeric,
  review_count int,
  has_website boolean,
  qualified boolean,
  qualify_reason text,

  -- generation (AI agent)
  status text not null default 'sourced',   -- sourced → generating → scored → sent → won/lost
  config jsonb,                             -- the generated ClientConfig
  eval_score numeric,
  eval_pass boolean,
  eval_notes text,
  loop_iterations int,

  -- outreach
  preview_url text,
  sent_at timestamptz
);

create index if not exists leads_status_idx on leads (status);

alter table leads enable row level security;
