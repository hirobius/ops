# Lead-gen + AI-agent pipeline — ops integration

Wraps the Places **lead puller** and the **enrich→generate→judge agent** (from
`hirobius/clients`) into the `/ops` dashboard, per the OPS-INTEGRATION brief
(Part 2). A button sources local businesses → rows land in Supabase → the board
renders them → a per-lead button runs the agent and writes the score back.

Status at time of writing: **wiring is complete and real; the two ported tools
are STUBS.** `lib/lead-gen` and `lib/agent` return deterministic mock data so the
full flow can be exercised end to end. Replace those two modules with the real
ported logic to go live (see "Going live", step 6).

## Architecture (how it maps to this repo)

This repo is **Vite + React Router**, deployed on Vercel — _not_ Next.js. So the
brief's `app/api/<tool>/route.ts` shape becomes:

- **Production** → Vercel serverless functions in `api/` (`export default handler`,
  same style as the existing `api/route.ts`).
- **Local dev** (`pnpm dev`) → Vite middleware in `scripts/leads-middleware.mjs`,
  wired in `vite.config.mjs` with `apply: 'serve'`. Mirrors the functions using
  the same `lib/*` modules, so dev and prod never drift.

| Part              | File(s)                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data model        | `supabase/migrations/0001_leads.sql` (`leads` table, status lifecycle, `place_id` unique key, RLS on)                                            |
| Server libs       | `lib/supabase/server.mjs`, `lib/lead-gen/index.mjs` (stub), `lib/agent/index.mjs` (stub)                                                         |
| Runner (prod)     | `api/pull-leads.ts`, `api/generate-site.ts`, `api/build-site.ts`, `api/publish-site.ts`, `api/leads.ts`                                          |
| Site build (Duda) | `lib/duda/index.mjs` (`buildSite`/`publishSite`/`toDudaContent`, stub); schema `supabase/migrations/0002_lead_site_fields.sql`                   |
| Runner (dev)      | `scripts/leads-middleware.mjs` + `vite.config.mjs` plugin                                                                                        |
| Render            | `src/app/pages/ops/leads/` (`LeadsPage.tsx`, `PullLeadsForm.tsx`, `useLeads.ts`, `types.ts`); route + nav in `routes.tsx` and `SurfacesRail.tsx` |

Flow:

1. **Pull leads** (`POST /api/pull-leads` `{ niche, metro, count }`) → Places
   sourcing (one page) → upsert to `leads` (status `sourced`, dedupe on `place_id`).
2. **Generate site** (`POST /api/generate-site` `{ leadId }`) → agent runs on one
   lead → row gets `config`, `eval_*`, `loop_iterations`, status `scored`.
3. **Build site** (`POST /api/build-site` `{ leadId }`) → Duda creates an
   **unpublished** site + injects content → row gets `duda_site_name`,
   `preview_url`, `editor_url`, `site_status='built'`. Send the preview link.
4. **Publish site** (`POST /api/publish-site` `{ leadId }`, on conversion) → goes
   live → `live_url`, `published_at`, `site_status='published'`.
5. **Board** polls `GET /api/leads` every 5s and renders live status.

## Environment variables (server-only)

Set these in the **Vercel project** (production) and in **`.env.local`** for dev.
An agent never writes `.env*` — a human sets these.

```
SUPABASE_URL                 # Supabase project URL
SUPABASE_SERVICE_ROLE_KEY    # service-role key — SERVER ONLY, bypasses RLS, never shipped to client
GOOGLE_PLACES_API_KEY        # used by the real puller (lib/lead-gen) — request the richer Place Details fields
ANTHROPIC_API_KEY            # used by the real agent (lib/agent)
DUDA_API_USER                # Duda white-label API username (HTTP Basic) — used by the real lib/duda
DUDA_API_PASSWORD            # Duda white-label API password
DUDA_TPL_LANDSCAPING         # per-preset Duda template ids (keyed on config.brand.palettePreset)
DUDA_TPL_JUNK                #   "
DUDA_TPL_PRESSURE            #   "
DUDA_TPL_CONCRETE            #   "
```

## Setup steps (human)

1. **Install deps + sync lockfile.** `@supabase/supabase-js` was added to
   `package.json`, but the lockfile must be regenerated where the sibling
   `@hirobius/design-system` is present (the integration session couldn't run
   installs). Run `pnpm install`, then commit the updated `pnpm-lock.yaml`.
   **Vercel/CI builds will fail on the frozen lockfile until this is committed.**
2. **Create the Supabase table.** Run both migrations in order —
   `supabase/migrations/0001_leads.sql` then `0002_lead_site_fields.sql` — in the
   Supabase SQL editor, or, with the Supabase CLI linked: `supabase db push`.
3. **Set the four env vars** above (Vercel + `.env.local`).
4. **Deploy** (Vercel) for production, or `pnpm dev` for local.

## Validation (must run where the design-system is installed)

The integration session ran in an isolated container **without**
`../hirobius-design-system`, so it could not run `pnpm install`, `typecheck`,
`build`, or the layout tests. Run these before trusting the build:

```
pnpm typecheck
pnpm test:layout      # includes check:route-coverage — /ops/leads is registered
pnpm build
```

## Going live (replace the stubs)

Port the real source from `hirobius/clients` into the two modules — keep the
function signatures and return shapes stable (the routes and table depend on them):

- `lib/lead-gen/index.mjs` ← `scripts/lead-gen/*` (config, places, qualify,
  pull-leads). `pullLeads({ niche, metro, max })` → `SourcedLead[]`. Reads
  `GOOGLE_PLACES_API_KEY`. Single-page Places query, ~20s request timeout
  (pagination stalls behind some egress proxies).
- `lib/agent/index.mjs` ← `packages/agent/src/*` + `packages/schema`.
  `runPipeline({ name, city, region, category, phone, website })` →
  `{ enrichment, config, judge: { overall, pass, notes }, loop: { iterations } }`.
  Reads `ANTHROPIC_API_KEY`.
- `lib/agent/enrich.mjs` ← `packages/agent/src/enrich`. `enrich(input)` →
  `{ email, logo_url, social, description }` — the fields Places can't supply.
  Real impl: parse the lead's website (mailto / favicon-og:image / JSON-LD
  `sameAs`) + optional LLM pass. `generate-site` persists these to the lead
  (coalesced, so existing values aren't clobbered) for the Duda build.

## Open items / hardening

- **Auth.** The `/api/*` triggers are currently fronted only by the client-side
  ops gate (`VITE_OPS_GATE_HASH`). They spend Places + Anthropic budget — add real
  server-side auth (session check or signed header) before exposing widely.
- **Bulk / queue.** Today: per-lead generate. For one-click bulk, enqueue and
  drain `sourced → scored` in batches with a cron/worker (the status-queue
  pattern from the brief's Part 1) to stay under serverless timeouts.
- **Realtime.** The board polls. A Supabase realtime subscription is possible but
  would need an anon-key path + RLS policies (RLS is currently policy-less =
  service-role only). Polling keeps all access server-side.
