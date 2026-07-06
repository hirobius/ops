-- Migration 0002 — richer lead fields + Duda site tracking
--
-- Two purposes:
--  1. Capture the business fields Duda's content-injection / business-data model
--     consumes (address, geo, hours, photos, socials, description, …) DURING the
--     Places pull, so we never have to re-scrape a lead to build its site. Most
--     map directly from Google Places Place Details (address_components, geometry,
--     opening_hours, photos, formatted_phone_number, editorial_summary, types).
--  2. Track the Duda site through build → preview → publish.
--
-- See docs/operations/lead-pipeline-platform-integrations.md (field-mapping table).

alter table leads
  -- richer sourcing fields (Places details → Duda business data) -------------
  add column if not exists street_address text,
  add column if not exists postal_code text,
  add column if not exists country text,
  add column if not exists latitude numeric,
  add column if not exists longitude numeric,
  add column if not exists email text,
  add column if not exists hours jsonb,            -- opening hours (structured)
  add column if not exists photos jsonb,           -- array of image URLs
  add column if not exists logo_url text,
  add column if not exists social jsonb,           -- { platform: url }
  add column if not exists google_maps_url text,   -- Places `url`
  add column if not exists price_level int,
  add column if not exists business_status text,    -- OPERATIONAL / CLOSED_*
  add column if not exists description text,         -- editorial summary / about
  add column if not exists types jsonb,             -- full Places category list
  add column if not exists service_area text,        -- Duda "area served"
  -- Duda site tracking (build → preview → publish) ---------------------------
  add column if not exists duda_site_name text,
  add column if not exists editor_url text,
  add column if not exists live_url text,
  -- none → building → built → publishing → published  (+ build_failed / publish_failed)
  add column if not exists site_status text default 'none',
  add column if not exists published_at timestamptz;

-- Idempotency for the Duda build: one site per lead, keyed by Duda's site name.
-- Partial so the many leads without a site (null) don't collide.
create unique index if not exists leads_duda_site_name_key
  on leads (duda_site_name)
  where duda_site_name is not null;
