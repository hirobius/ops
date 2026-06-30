# Hirobius Ops — Architecture

Org source of truth for cross-cutting delivery decisions in the ops command
center. Component-level ADRs live under `docs/architecture/`; this file holds the
agency-wide contracts and the lead → site delivery pipeline.

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
