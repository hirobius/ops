-- Migration 0004 — prospecting score + signals (Outscraper pipeline)
--
-- Additive columns for the Outscraper prospecting pipeline
-- (scripts/outscraper-fetch.mjs → scripts/lib/outscraper-normalize.mjs). PR#1's
-- 0001/0002 modelled a Duda-oriented pull with a boolean `qualified`; this run
-- scores each prospect on two axes and stores the signals that produced them, so
-- the ranking is transparent and re-sortable in SQL:
--
--   lead_score   (0–100)  how much the business NEEDS a site — weak/absent web
--                         presence + reachability + operating + social proof.
--   build_score  (0–100)  how compelling a spec site we can build from what they
--                         already have online (photos, hours, description, reviews,
--                         logo, services). Higher = more real material = a more
--                         believable "here's a site of your business" pitch.
--
-- The dream prospect is high on BOTH. Purely additive (`add column if not exists`)
-- so it stacks cleanly on 0001/0002 and never collides with PR#1 (which tops out
-- at 0003). The richer content columns those two scores read from — description,
-- hours, photos, logo_url, social, types — already exist in 0002; the extended
-- normalizer now actually populates them.

alter table leads
  add column if not exists lead_score int,
  add column if not exists build_score int,
  -- '' | social host | builder host | custom domain
  add column if not exists site_presence text,
  add column if not exists has_social_proof boolean,
  add column if not exists owner_verified boolean,
  add column if not exists operational boolean,
  add column if not exists photos_count int,     -- count (0002's `photos` is URLs)
  add column if not exists source_query text,     -- the query that surfaced the lead
  add column if not exists run_id text,           -- the pipeline run that sourced it
  add column if not exists slug text;             -- links to a scaffolded clients/<slug>/

-- Bounded domain for site_presence (added separately so re-runs don't fail if the
-- column already exists from a prior partial apply).
do $$
begin
  if not exists (
    select 1 from information_schema.constraint_column_usage
    where table_name = 'leads' and constraint_name = 'leads_site_presence_check'
  ) then
    alter table leads
      add constraint leads_site_presence_check
      check (site_presence is null or site_presence in ('none','social-only','builder','custom'));
  end if;
end $$;

-- Ranking reads: "top prospects by need" and "by buildability".
create index if not exists leads_lead_score_idx on leads (lead_score desc);
create index if not exists leads_build_score_idx on leads (build_score desc);
