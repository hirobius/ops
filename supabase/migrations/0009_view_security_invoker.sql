-- Migration 0009 — close the SECURITY DEFINER view hole on the tasks views.
--
-- Supabase Advisor (2026-07-08) flagged `public.tasks_blocked` and
-- `public.tasks_next` as CRITICAL "Security Definer View": both were created in
-- 0003 without `security_invoker`, so by Postgres default they run with the
-- VIEW OWNER's rights and therefore **bypass the row-level security** that 0003
-- enables on the underlying `tasks` table. A caller holding the public anon key
-- could read tasks through these views despite RLS.
--
-- Fix: flip both views to `security_invoker = on` (Postgres 15+, which Supabase
-- runs), so a query through the view is evaluated with the CALLER's rights and
-- RLS applies. The ops app is unaffected — it reads via the server-side
-- service-role key, which bypasses RLS either way; this only denies the
-- anon/authenticated roles the RLS was always meant to deny.
--
-- Idempotent; safe to re-run. (0003's CREATE statements are also updated to bake
-- this in for fresh installs.)

alter view public.tasks_blocked set (security_invoker = on);
alter view public.tasks_next    set (security_invoker = on);
