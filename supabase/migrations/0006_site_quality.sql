-- Migration 0006 — site-quality / redesign-need score (the "bad site" play)
--
-- The 3rd scoring axis. lead_score (0001/0005) finds businesses with NO/weak
-- website; this finds businesses whose EXISTING site is bad enough to pitch a
-- redesign. Populated by scripts/audit-sites.mjs (Google PageSpeed Insights →
-- scripts/lib/site-audit.mjs), which runs on leads we already sourced — zero
-- Outscraper cost. Purely additive so it stacks on 0001/0002/0005.

alter table leads
  add column if not exists site_quality_score   int,      -- 0–100, INVERSE: higher = worse site = better redesign prospect
  add column if not exists site_pagespeed_mobile int,      -- Lighthouse mobile performance 0–100
  add column if not exists site_seo_score        int,      -- Lighthouse SEO 0–100
  add column if not exists site_mobile_friendly  boolean,  -- responsive viewport + legible text + tap targets
  add column if not exists site_https            boolean,  -- served over HTTPS
  add column if not exists site_issues           jsonb,    -- human-readable gripes (double as outreach hooks)
  add column if not exists site_audited_at       timestamptz;

-- Rank read: "worst existing sites among established businesses" (redesign pipeline).
create index if not exists leads_site_quality_idx on leads (site_quality_score desc);
