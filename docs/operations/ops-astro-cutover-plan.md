# Ops runtime engine + Astro cutover — corrected execution plan

> **Supersedes** the 2026-06-18 "Ops handoff" brief. That brief was written
> against a stale/assumed picture of this repo (Next.js App Router, greenfield
> lead-gen, no render path) and against the *earlier* Duda-as-production decision.
> This plan is grounded in the actual `ops` tree and the **2026-06-30 reversal**
> recorded in `docs/ARCHITECTURE.md` (Astro is now production; Duda retired).
>
> Decision spine (see `docs/ARCHITECTURE.md`):
> 1. Production render → **self-hosted Astro** (`clients` factory, Vercel-per-client)
> 2. Migration → **hard cutover** (retire Duda)
> 3. Lifecycle → `sourced → generating → scored → rendered → published → sent → won/lost`, billing on `published`
> 4. Deploy → **automated, human-triggered, worker-executed, Claude-free**

---

## 0. Prerequisite gate (do not start cutover until true)

- [ ] The **Astro factory in `hirobius/clients` is live on Vercel** and its
      **preview-gate (basic-auth) is verified** (brief's old Open Q #3 / "HC-09").
      Hard cutover removes the working Duda path — there must be a proven Astro
      path to replace it first.

---

## 1. Ground truth — what's actually in `ops` (correct the brief's assumptions)

| Brief assumed | Reality in this repo |
|---|---|
| Next.js App Router; `app/api/**/route.ts` | **Vite 6 SPA + Vercel serverless functions** (`api/<name>.ts`, `@vercel/node` style), mirrored by Vite dev middleware |
| Move TS engine files in from `clients` | Engine is **already scaffolded in `lib/` as `.mjs`** (JSDoc-typed), not `.ts` — and `api/`+`lib/` aren't in the typecheck tsconfig |
| `import … from "@/lib/schema"` | `@/*` → `src/*`; root `lib/` is imported **relatively** (`../duda/index.mjs`). `@/lib/...` does not resolve |
| Greenfield lead-gen | `lib/lead-gen/index.mjs` **exists as a documented stub** (returns mock rows; its TODO points at Google **Places**, not Outscraper) |
| Move the full agent | `lib/agent/` exists but is a **stub** (`index.mjs` returns `_stub: true`; only `enrich.mjs` + `index.mjs`, ~150 lines) — not the full `generate/judge/loop/pipeline` |
| No render path yet | A **complete Duda render/publish path is wired**: `lib/leads/pipeline.mjs` → `lib/duda`; `api/build-site.ts` + `api/publish-site.ts`; states `building/built/publishing/published`; columns `duda_site_name`, `live_url` |
| Add `@anthropic-ai/sdk`, `zod` | `@anthropic-ai/sdk@0.92.0` already present ✓; **`zod` is not** (schema vendoring adds it); `@vercel/node` is not a local dep (ambient types) |

**Net:** Part A is "fill the existing stubs + redirect lead-gen," not "move files."
Part B is a real **Duda → Astro migration**, not greenfield.

---

## 2. Part A — Runtime engine (fill the stubs)

All framework-agnostic `.mjs` under `lib/`, relative imports, triggered by `api/` routes.

- **`lib/lead-gen/`** — redirect the stub away from its Google-Places TODO to
  **Outscraper** (managed Google-Maps + email enrichment, pay-as-you-go).
  - Keep `buildQueries()` (the *what/where* query definitions) — port from
    `clients/scripts/lead-gen/config.ts` if not already present.
  - `pullLeads()` → call Outscraper per query, dedupe by Google place id, return
    outreach-ready rows; the existing `api/pull-leads.ts` upserts `status='sourced'`.
  - **Keep the stub's stable signature + return shape** — `api/pull-leads.ts` +
    the `leads` table depend on them.
  - Qualification becomes optional (`has_website = !website`); only rebuild the
    "bad site = good lead" angle if wanted for the cold-email pitch.
  - Env: **`OUTSCRAPER_API_KEY`** (replaces `GOOGLE_PLACES_API_KEY`). *Adrian sets
    `.env*` — Claude never touches it.*
- **`lib/agent/`** — fill the stub with the real **enrich → generate → judge →
  loop** pipeline emitting a validated `ClientConfig`. Source: `clients/packages/agent`
  (see §5 — not reachable from this session). Already uses `@anthropic-ai/sdk` ✓.
- **`lib/schema/`** (new) — **vendor** the `ClientConfig` contract (`defineClient` +
  presets) from `clients/packages/schema`. Canonical copy stays in `clients`;
  re-sync on change. Adds **`zod`**. Agent imports it relatively.

---

## 3. Part B — Render cutover (Duda → Astro)

### Remove (Duda)
- `lib/duda/` (`buildSite`, `publishSite`).
- `api/build-site.ts`, `api/publish-site.ts` (Duda build/publish routes).
- Duda branches of `lib/leads/pipeline.mjs` (`buildLeadSite`/`publishLeadSite`).
- Duda lifecycle states `building/built/build_failed/publishing/published` and
  Duda-specific columns (`duda_site_name`, `site_status`).
  > **Sequencing:** remove Duda only **after** the Astro path below is wired and
  > green (§0 gate satisfied). Don't strand the only render path.

### Add (Astro)
- A render path that takes a `scored` lead's `config` and drives the `clients`
  Astro factory: `new-client <slug> --preset <preset>` → write `client.config.ts`
  → `vercel deploy` (preview) → on yes `vercel deploy --prod` + `domains add`.
- **Deploy worker (decision 4):** the board "Publish" enqueues a job; a worker /
  CI step **under Adrian's scoped Vercel token** runs the deploy. Claude builds
  this; it never invokes `vercel deploy` itself. Guardrails: confirm-before-publish,
  idempotent (no double-publish), domain-collision handling.

### Status machine migration
`sourced → generating → scored → rendered → published → sent → won/lost`
- `rendered` — preview deployed (free, basic-auth gated); set `preview_url`.
- `published` — prod deploy + domain attached → **billing event**; set `live_url`.
- `sent` — outreach email sent; set `sent_at`.
- Confirm exact column names during implementation (`status` vs `site_status`,
  `preview_url`/`live_url`/`sent_at` already exist per the brief).

### Board buttons
- **"Render"** (on `scored`) → preview deploy → `rendered` + `preview_url`.
- **"Publish + attach domain"** (on yes) → prod deploy worker → `published` +
  `live_url` (**bills here**).
- **"Mark sent"** (after outreach) → `sent` + `sent_at`.

---

## 4. Part C — Decision record

Recorded in `docs/ARCHITECTURE.md` (the 2026-06-30 reversal). No further action.

---

## 5. Cross-repo inputs + out-of-scope

- **Needs from `clients`** (this session is scoped to `hirobius/ops` only — provide
  these, or run a `clients` session): the real `packages/agent` source and the
  `packages/schema` (`ClientConfig`) source to fill §2.
- **`clients` cleanup PR is a separate session** — delete `packages/agent` +
  `scripts/lead-gen` (keep `packages/schema`), drop their workspace/`package.json`
  wiring, trim docs. **Only after `ops` is green** (never delete the only copy
  before ops builds + runs).

---

## 6. Execution order

1. [ ] **Gate:** confirm the Astro factory is live + preview-gate verified (§0).
2. [ ] **Part A:** redirect `lib/lead-gen` → Outscraper; fill `lib/agent`; vendor
       `lib/schema` (+`zod`). Verify it runs (`tsx` smoke) with env set.
3. [ ] Confirm `leads` table + add the new lifecycle states.
4. [ ] **Part B:** wire the Astro render path + the human-triggered deploy worker;
       migrate the status machine; board buttons. **Then** remove Duda.
5. [ ] Deploy the first real client site through the new path end-to-end.
6. [ ] Only after ops is green: the `clients` cleanup PR (§5).

## 7. Open items

- Outreach + billing are the largest unbuilt pieces — sequence right after the
  first real Astro render.
- Image sourcing (stock-by-trade until intake) — carried over from the brief.
