# Hirobius Ops — Architecture

Org source of truth for cross-cutting delivery decisions in the ops command
center. Component-level ADRs live under `docs/architecture/`; this file holds the
agency-wide contracts and the lead → site delivery pipeline.

> **⇄ Keep in lockstep with `docs/pipeline-walkthrough.html`** (the visual
> version, published as an Artifact). This markdown is canonical — every session
> reads it. When the pipeline state changes, update BOTH files in the same commit
> so the readme and the walkthrough never drift.

---

## Pipeline gap-map (2026-07-08)

The funnel is `lead → score → site → preview → outreach → reply → deal → invoice`.
Status legend: 🟢 live/proven · 🟡 built but gated on a human step (key/migration)
· 🔵 scaffolded (code exists, never run for real) · 🔴 gap / broken link.

| #   | Stage                      | Status                     | Moving parts                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ①   | Source leads               | 🟢 live (spend on hold)    | `scripts/outscraper-fetch.mjs`, `lib/lead-gen/`, presets `scripts/lib/query-presets.mjs`; `scripts/lib/outscraper-normalize.mjs` → Supabase `leads` (0001/0002) via `lib/supabase/leads.mjs` `upsertLeads`; UI `/ops/leads` + #12 sweep presets. Env: `OUTSCRAPER_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Proven: Run 01 = 249 leads / 25 qualified. |
| ②   | Score / qualify            | 🟢 live · 🟡 3rd scorer    | `lead_score`+`build_score` (`outscraper-normalize.mjs`, 0005), `QUALIFIED ≥ 60`; analytics `scripts/prospect-stats.mjs`. **Gated:** site-quality/redesign score `scripts/lib/site-audit.mjs`+`audit-sites.mjs` (PageSpeed, 0006) needs `PAGESPEED_API_KEY` + apply 0006.                                                                                            |
| ③   | Generate site              | 🔵 wired, never run        | `lib/agent/` (enrich→generate→judge, `llm.mjs` MODELS), `ClientConfig` in `lib/schema`; trigger `/api/lead-action` action `generate` → status `scored`, writes config. Env: `ANTHROPIC_API_KEY` (set, unexercised). Output is a _config_, not a live site.                                                                                                          |
| ④   | Build + publish            | 🔴 gap (mid-cutover)       | `lib/render/` emits config; `lib/duda/` **retired** (Astro reversal, below); Astro clients factory (`hirobius/clients`) is the target but **not live** (Cutover Part B, `docs/operations/ops-astro-cutover-plan.md`). **No working config → published-site path today.**                                                                                            |
| ⑤   | Preview / portal           | 🟢 live (needs ④)          | `/c/:slug?token=` portal, server auth `lib/portal-auth.mjs`+`api/portal-verify.ts` (#28); `preview_url` is the outreach hook. Env: `PORTAL_HMAC_SECRET` (set; redeploy to activate).                                                                                                                                                                                |
| ⑥   | Outreach                   | 🔵 scaffolded · 🟡 gated   | `lib/outreach/{types,map,smartlead}.mjs` + `scripts/push-outreach.mjs` (dry-run default, compliance-filtered) — #9. Webhook-back deferred (12th fn + `SMARTLEAD_WEBHOOK_SECRET`). Env: `SMARTLEAD_API_KEY`/`_CAMPAIGN_ID` (unset) + warmed sending domain (not started).                                                                                            |
| ⑦   | CRM lifecycle / compliance | 🟡 built, 0007 not applied | Migration 0007 (outreach_status, contacted/replied/won/lost, `do_not_contact`, unsubscribed…); suppression on ingest (#36), retention purge `scripts/purge-stale-leads.mjs` (#37), `docs/prospecting/compliance.md`. B2B cold email is CAN-SPAM-legal. Gap: privacy page (#38).                                                                                     |
| ⑧   | Deal → invoice             | 🔴 not built               | Future. No won-deal → billing path.                                                                                                                                                                                                                                                                                                                                 |

**Headline:** both ends are built (① ② live, ⑥ scaffolded) but the **middle is the
broken link** — ③ generate has never run on a real lead and ④ build/publish is
mid Duda→Astro cutover. Until that works there is **no `preview_url` to send**, so
the #1 build target is the **site generation + build/publish path** (③→④), not the
outreach engine.

### Cross-cutting: the command center (`/ops`) — 🟢 live

Surfaces: leads · tasks · digest · projects · issues · clients · agentic-os home
· admin/approvals (live — tasks-store approvals inbox, epic #41
Slice 3: `dispatch_status='queued'` tasks await an Approve/Deny click, reusing
`ApprovalCard` + `/api/task-action`'s `dispatch`/`unqueue` actions; the dead
`localhost:3005/orchestration/*` bridge is fully retired). Auth:
`OPS_GATE_PASSWORD`+`OPS_SESSION_SECRET` (gate), `OPS_AGENT_KEY` (machine auth,
#25). Fleet: `/ops/projects` + `scripts/deploy-alert.mjs` (#11). Task machinery:
`tasks` table + GitHub-issue importer (#25) + dispatch (opens an issue @-mentioning
Claude). Run-log: `docs/ops/run-log.jsonl`, rendered via FleetTimeline (#8 half,
RunsPanel retired ops#140). Gaps: autonomy dial, tier→model dispatch UI polish (#13).

### Active env vars (pipeline) vs. dead weight

Active: `OUTSCRAPER_API_KEY`, `SUPABASE_URL`/`SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
`PAGESPEED_API_KEY`, `PORTAL_HMAC_SECRET`, `SMARTLEAD_API_KEY`/`_CAMPAIGN_ID`,
`OPS_GATE_PASSWORD`/`SESSION_SECRET`, `OPS_AGENT_KEY`, `GITHUB_TOKEN`,
`VERCEL_TOKEN`/`TEAM_ID`, `DISCORD_WEBHOOK_URL`. ~30 more (Figma/Ollama/HDS-bridge/
Discord-bot/Telegram/OpenAI/Groq/OpenRouter) linger from the retired
orchestration/DS era — a cleanup candidate.

---

## Client-site delivery

> **Superseded 2026-06-30 (Adrian) — production render target reversed Duda → Astro.**
> The prior decision (2026-06-18, recorded from the `clients` Duda-delivery handoff)
> made **Duda** the production fleet and Astro demo-only ("do not scale it past the
> demo"). That is reversed: **Astro is now the production render target; Duda is
> being retired.** Rationale: consolidate production on the self-hosted Astro factory
> in `hirobius/clients` — which already owns the `ClientConfig` schema + templates —
> and own the per-client Vercel deploys end-to-end rather than renting Duda. The
> retired Duda path (`lib/duda`, `api/build-site`, `api/publish-site`, the
> `building/built/publishing/published` states) and its mapping docs
> (`clients/docs/DUDA-DELIVERY.md`, `docs/operations/lead-pipeline-platform-integrations.md`)
> are historical. Execution plan: `docs/operations/ops-astro-cutover-plan.md`.

### Current decision (2026-06-30)

- **Production render target: self-hosted Astro** (`hirobius/clients` →
  `packages/template`, `apps/*`, `new-client` scaffold). **One Vercel project per
  client.** Prerequisite for cutover: the Astro factory must be live + its
  preview-gate verified.
- **The contract: `ClientConfig`** (`hirobius/clients` → `packages/schema`,
  canonical). The agent emits it; the Astro factory consumes it. `ops` **vendors a
  copy** (`lib/schema`) — don't fork the meaning; re-sync on contract change.
- **Runtime engine lives in `ops`** (the moat, framework-agnostic `.mjs` under
  `lib/`), triggered from the ops board:
  - `lib/lead-gen` — sourcing via **Outscraper** (managed Google-Maps + email
    enrichment; replaces the retired self-built Places scraper).
  - `lib/agent` — enrich → generate → judge → loop, emitting a `ClientConfig`.
  - `lib/schema` — vendored `ClientConfig` contract.
- **Render/deploy is automated but human-triggered and Claude-free.** The board's
  "Publish" enqueues a deploy job; a worker under Adrian's Vercel creds runs
  `new-client` + `vercel deploy --prod` + `domains add`. Claude never runs deploy
  commands (HARD RULE) — it builds the pipeline; your infra executes it.

Flow: `lead → enrich → generate → judge → ClientConfig → Astro factory → Vercel
(preview, basic-auth gated) → (on "yes") prod + domain`.

Lifecycle on the `leads` row:
`sourced → generating → scored → rendered → published → sent → won/lost`.

- `rendered` — preview deployed (free, basic-auth gated); set `preview_url`.
- `published` — prod deploy + domain attached → **billing event**; set `live_url`.
- `sent` — outreach email sent; set `sent_at`.

> Repo-stack note: ops is **Vite + React Router + Vercel serverless functions**,
> not Next.js App Router. The handoff's `app/api/.../route.ts` examples are App
> Router; here those become `api/<name>.ts` Vercel functions (mirrored by Vite dev
> middleware), matching the existing `api/route.ts`.
