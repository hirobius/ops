# Leads pipeline — test plan

Test plan for the lead-gen + AI-agent integration (`/ops/leads`). Scope: the code
shipped on `claude/laughing-ride-gja5xd` — `lib/lead-gen`, `lib/agent`,
`lib/supabase`, `api/{pull-leads,generate-site,leads}.ts`,
`scripts/leads-middleware.mjs`, and `src/app/pages/ops/leads/*`.

Two realities to keep in mind:
- The integration session could not run `pnpm typecheck`/`build`/tests (the
  sibling `@hirobius/design-system` isn't present). **Layers 0–1 below are the
  first things to run once it is.**
- `pullLeads`/`runPipeline` are **stubs** returning deterministic mock data.
  Tests at Layers 1–4 should target the *contract* (shapes, status transitions,
  idempotency), not the mock values — so they survive the real-logic swap.

## Layer 0 — gates that must pass first

| Check | Command | Why |
|---|---|---|
| Types | `pnpm typecheck` | `src/` is the only typechecked surface; the new page/hook/form must compile. |
| Route coverage | `pnpm test:layout` | Asserts `/ops/leads` renders without crashing + is in `ALL_ROUTES`. |
| Build | `pnpm build` | Confirms the Vite SPA + lazy route bundle. |
| Lockfile | `pnpm install` (then commit `pnpm-lock.yaml`) | `@supabase/supabase-js` was added; frozen installs fail until synced. |

## Layer 1 — pure logic (vitest, no network)

Target `lib/lead-gen/index.mjs` and `lib/agent/index.mjs`. Fast, deterministic,
no Supabase. Suggested file: `lib/lead-gen/index.test.mjs`, `lib/agent/index.test.mjs`
(or `tests/`). `pnpm test` runs vitest (`--passWithNoTests`).

- **pullLeads — count + cap.** `max=20` → 20 rows; `max=999` → capped at 60; `max=0` → 1.
- **pullLeads — idempotency key.** Same `{niche, metro}` twice → identical `place_id`
  set (so the upsert dedupes). This is the contract the real puller must keep.
- **pullLeads — shape.** Every row has the sourcing columns (`place_id`, `name`,
  `has_website`, `qualified`, …) and **no** `status`/`config` (route adds those).
- **pullLeads — qualify rule.** `has_website === false` ⇒ `qualified === true`.
- **runPipeline — result shape.** Returns `{ config, judge:{overall,pass,notes}, loop:{iterations} }`;
  `overall` in 0–100; `pass === (overall >= 80)`.
- **runPipeline — determinism.** Same input → same score (so the board is stable).

## Layer 2 — API contract (the three routes)

Test method/validation/env guards and the Supabase calls with a **mocked**
service client (stub `getServiceClient` to return a fake with `upsert/select/update`
spies). Run against the dev middleware (`scripts/leads-middleware.mjs`) or the
functions — same contract.

`POST /api/pull-leads`
- non-POST → `405`.
- missing `niche` or `metro` → `400`.
- env missing (`getServiceClient` throws) → `503` `{ code: 'ENV_MISSING_SUPABASE' }`.
- happy path → calls `upsert(rows, { onConflict: 'place_id' })`, every row `status:'sourced'`, returns `{ inserted }`.
- Supabase returns error → `500` with the message.

`POST /api/generate-site`
- non-POST → `405`; missing `leadId` → `400`; env missing → `503`.
- lead not found → `404`.
- happy path → row set to `generating`, then `scored` with `config/eval_score/eval_pass/eval_notes/loop_iterations`; returns `{ ok, score, pass }`.
- pipeline throws → row rolled back to `sourced`, `500`.

`GET /api/leads`
- non-GET → `405`; env missing → `503`.
- `?limit` clamped to 1–500 (default 200).
- happy path → `{ leads: [...] }` ordered by `created_at` desc.

## Layer 3 — UI components (vitest + jsdom)

- **useLeads** — polls `/api/leads`; 3 consecutive failures → `isOffline`; success resets; pauses when `document.hidden`. (Mock `fetch`.)
- **PullLeadsForm** — submit disabled until `niche` + `metro` non-empty; success → `Sourced` badge + `onInserted` fired; error JSON → `Error` badge.
- **LeadsPage** — renders the four states: initial-loading, offline notice, empty ("No leads yet…"), populated list; "Generate site" disabled while `inFlight` / `status==='generating'`; "Regenerate" label for non-`sourced` rows.

## Layer 4 — integration (live Supabase test project)

Point env at a throwaway Supabase project with `0001_leads.sql` applied.
- **End-to-end happy path:** pull → rows appear (status `sourced`) → generate one → row flips `generating`→`scored` with a score → board reflects it on the next poll.
- **Idempotency:** pull the same `{niche, metro}` twice → row count unchanged (upsert), not doubled.
- **RLS:** a client using the **anon** key can read/write `leads` → must return zero rows / be denied (only the service-role key works). Guards the "secrets server-only" rule.

## Layer 5 — manual QA checklist (pre-ship)

- [ ] `/ops/leads` reachable behind the ops gate; tile shows on `/ops`.
- [ ] Pull a real niche/metro → leads populate within one poll (5s).
- [ ] "no website" leads flagged; "Generate site" → score within ~30s.
- [ ] Kill Supabase creds → board shows the offline notice (no crash, no leaked key in the network tab).
- [ ] Mobile (≤640px): form fields + rows wrap, tap targets ≥44px.
- [ ] Network tab: no Supabase URL/service-role key in any client request — only `/api/*`.

## Out of scope (until the real logic lands)

Places quota/pagination behaviour, Anthropic cost/latency, judge-loop iteration
caps, and outreach (`sent`/`won`/`lost`) — covered when `lib/lead-gen` + `lib/agent`
are ported and when the build/CRM layers (see
`docs/operations/lead-pipeline-platform-integrations.md`) are added.
