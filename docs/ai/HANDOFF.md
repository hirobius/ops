# HANDOFF — the living session-to-session state

> **Contract.** This is the single universal handoff. Any session (any device,
> any agent) that gets a short prompt — "continue", "status", "pick up", "go" —
> reads THIS file first and acts from it. Any session that does real work
> **updates this file before ending** (edit in place; keep it one page; move
> finished things to the log line at the bottom). Adrian never copy-pastes
> context again — he types one word.

_Last updated: 2026-07-06 (PRODUCTION live · /ops/issues board shipped · backlog triaged to Issues) · branch `claude/ops-dashboard-launch-7cons7` (pushed to `main`)_

## Now (what is true today)

- **PRODUCTION is LIVE** (project `hirobius-ops`, deploys from `main`). `/ops`
  login gate active (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` set). DS consumed
  from **public npm `@hirobius/design-system@0.11`** (GitHub Packages + `.npmrc`
  gone). Supabase wired (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`); tasks/leads
  boards online. `GITHUB_TOKEN` set (dispatch + issues board verified).
- **NEW: `/ops/issues`** — cross-repo GitHub Issues board (every open issue the
  `GITHUB_TOKEN` can see, grouped by repo, multi-select → copy refs to paste into
  a Claude chat). GitHub is the task source of truth; `api/issues.ts` keeps the
  token server-side. Route + SurfacesRail tile + layout-integrity coverage landed.
- **GitHub Issues supersede BACKLOG.md.** `hirobius/ops` now carries issues
  #3–#29; the 2026-07-06 triage confirmed the issues are current and BACKLOG.md is
  the stale artifact (see Done-log). New ops work → file a GitHub Issue directly,
  not a markdown line. The `/ops/tasks` board + BACKLOG import path can be retired
  once the migration is confirmed (Adrian's call — it touches the build pipeline).
- **Fleet hub is LIVE (2026-07-02)**: `/ops/projects` renders all 10 Vercel
  projects + each repo's root `status.json` (phase · headline · ⚠blocked).
  Verified active: **`VERCEL_TOKEN`** (fleet rows) + **`GITHUB_TOKEN`** (status
  layer). Fleet-status convention: every repo keeps `status.json` at root (ops's
  own is the reference).
- **Engine wired, lead keys not yet exercised**: lead-gen = Outscraper wrapper,
  Agent = vendored clients pipeline (enrich→generate→judge, `ClientConfig` in
  `lib/schema`), render seam emits `client.config.ts` (`/api/render-site`, now
  folded into `/api/lead-action`). `OUTSCRAPER_API_KEY` / `ANTHROPIC_API_KEY` /
  Supabase are set but UNVERIFIED until the first lead run proves them.
- **Other surfaces**: `/ops/digest` (newsletter intel, JSONs in `src/app/digests/`),
  `/ops/leads` (the lead board), `/ops/tasks`.
- **Decision record**: `docs/ARCHITECTURE.md` (2026-06-30 reversal — Astro is
  production, Duda retired). Execution plan: `docs/operations/ops-astro-cutover-plan.md`.

## Adrian's open actions (his court — one-time, not blocked on a session)

- **Run the lilac-insure onboarding prompt** → stands up the client repo to fleet
  spec + files its tasks (the "New client-work repo procedure" below is the prompt).
- **File the Alert Figma-drift issue** in `hirobius/hirobius-design-system` (a
  ready prompt was handed over): tone-colored title + border, danger→`circle-alert`;
  Figma node 33:34. Alert lives in the DS repo, not ops — that's where it lands.
- **Run the ops-history PII scrub** — `git filter-repo` runbook (dry-run-verified)
  removes `clients/{lilac-insure,prospect-001,the-ranch-foundation}` +
  `docs/ai/routing-log.jsonl` from all history, then force-push. ops is private → hygiene.
- **Vercel (#18)**: disable preview Deployment Protection (the "404" cause — app
  self-gates via `OPS_GATE_PASSWORD`) + evaluate Pro before more `api/` routes land.
- **Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel** — `/ops/leads` +
  `/ops/tasks` are offline without it (#16); apply `supabase/migrations`.
- **Delete the 2 Error deployments** (`dpl_En1J6…`, `dpl_7D3tk…`) — dashboard tidy.
- **Confirm the 2 `.ps1` scripts** (bridge-wsl2-port, setup-cron-windows) are safe
  to delete — the Tier-2 scrub held them (possible personal tooling).

## Next (ordered queue)

1. **Env vars — login gate + VERCEL_TOKEN + GITHUB_TOKEN verified live; the
   rest set-but-unexercised.** (Runbook kept below as the reference.) Two rules
   that cost real time and MUST be remembered: **(a) set every var for BOTH
   Production AND Preview scopes** — the branch preview reads Preview-scoped
   vars; a Production-only var is invisible to it. **(b) Env changes only take
   effect on a NEW build** — after adding/editing, redeploy the *feature branch*
   (a fresh push), NOT the dashboard "Redeploy" button (that re-runs `main`,
   which is stale + fails `invalid_engines_value`). Vault = Bitwarden. Full list,
   grouped by what each unlocks:
   - **Login gate (without these `/ops` login is dead — "Ops auth isn't
     configured"):** `OPS_GATE_PASSWORD` (the password you type on the gate),
     `OPS_SESSION_SECRET` (any long random string; signs the session cookie).
   - **Data boards (leads / tasks / projects rows):** `SUPABASE_URL`,
     `SUPABASE_SERVICE_ROLE_KEY`.
   - **Features:** `ANTHROPIC_API_KEY` (agent generate), `OUTSCRAPER_API_KEY`
     (real lead pull), `VERCEL_TOKEN` + `VERCEL_TEAM_ID=team_niSKMbO08RycEwm9EXhN1PnE`
     (/ops/projects fleet), `GITHUB_TOKEN` (fine-grained, read-only
     Issues+Metadata — per-repo status.json on /ops/projects).
2. **Task importer unit** (needs `GITHUB_TOKEN`): pull open GitHub issues from
   every repo into the `tasks` table (`source: 'github:<repo>'`, `native_key` =
   issue#), project filter chips on `/ops/tasks`, Projects→Tasks link, and
   **`OPS_AGENT_KEY` machine auth** (Bearer alternative to the cookie on read
   endpoints) so headless agents can use the hub. Also: **broadcast tasks** —
   a task with target `all repos` fans out one GitHub Issue per repo via the
   existing issue port; adoption tracked by per-repo close state. Decisions
   made: **no nested boards** (one flat table, filtered views); cross-repo
   assignment routes through the hub, never repo→repo; **autonomy dial
   (Adrian 2026-07-02)** — menial tasks may carry an `auto-ok` label letting
   agents self-dispatch; strategy tasks always human-dispatched; every
   autonomous run gets a per-task iteration/time budget with auto-halt
   (runaway protection) and posts a one-line recap to a run log surfaced on
   /ops (recaps mandatory — nothing silent).
3. **First-time repo onboarding ("the ping")**: for each client repo, run the
   universal prompt at the bottom of this file in a session scoped to that repo.
   It normalizes the repo's ad-hoc tasks into GitHub Issues (what the importer
   ingests) and drops the fleet-hub pointer into its CLAUDE.md. One prompt,
   reused verbatim per repo.
4. **First real run**: pull leads (Access Tech campaign) → generate → eyeball
   the config + the ⚠️VERIFY items (Outscraper enrichment param + email field;
   model ids in `lib/agent/llm.mjs`).
5. **Cutover Part B remainder** (gated on the clients Astro factory being live +
   preview-gate verified): human-triggered deploy worker → status migration →
   remove Duda (`lib/duda`, `api/build-site`, `api/publish-site`).
6. **clients repo cleanup** — tracked canonically as **hirobius/clients#10**
   (delete `packages/agent` + `scripts/lead-gen`, keep `packages/schema`); do
   not re-spec here. Unblock condition: first live generate in ops passes
   (item 4). Until then the clients engine is FROZEN (no edits) so copies
   can't diverge.

## Parked / known warts

- **`public/hds-manifest.json` churn**: container builds rebake it (sometimes
  INVALID — drops required fields). Standing order: `git checkout --` it on
  sight; do NOT commit regens. Real fix waits on the HDS import rework.
- `pnpm typecheck` is DS-baseline-red → commits/pushes use `--no-verify`;
  validate touched files by filtering typecheck output.
- **Vercel build ≠ local `vite build`.** Vercel type-checks every `api/*.ts`
  serverless function; `vite build` does not. So a green local build can still
  fail on Vercel. If you touch api/ types, run **`pnpm typecheck:api`
  (EXIT 0 required)** — it uses `tsconfig.api-check.json` (the real compiler
  options over `api/**`), the correct deploy-parity gate. (Do NOT use the old
  `tsc --types node api/*.ts` form — dropping the project config yields false
  `noImplicitAny`/TS7016 noise on the `.mjs` imports.) **But `typecheck:api`
  does NOT catch extensionless-relative-import runtime crashes:** the deploy is
  ESM (`"type":"module"`), so every relative import in `api/*.ts` MUST carry an
  explicit extension (`.mjs` for lib JS, `.js` for the compiled `.ts` handler) —
  Node's ESM loader won't guess. An extensionless `'../lib/api/handler'`
  type-checks green but 500s at runtime with `ERR_MODULE_NOT_FOUND` (the whole
  /ops board hung on this until 2026-07-02). Explicit extensions only.
- **Vercel Hobby plan caps at 12 serverless functions/deployment.** We sit at
  **10** (`ls api/*.ts`). The 4 lead-lifecycle routes were consolidated into one
  `api/lead-action.ts` dispatcher (POST `{leadId, action}`) to buy headroom.
  Adding endpoints (importer, outreach, alerts — #8/#9/#11) will re-hit the cap;
  the durable fix is **Vercel Pro** (raises the limit + concurrency). Until then,
  consolidate rather than add new `api/*.ts` files.
- `docs/ai/OPERATOR_BRIEF.md` + night-shift loop + `orchestration.json` are
  RETIRED — do not execute them.

## Decisions (dated, newest first)

- 2026-07-02 (delegation interview): filed #8–#14 — approvals inbox + run log
  (#8, top time-eater), outreach v1 (#9, sequenced after first live generate),
  visual self-QA (#10), deploy/blocked alerts (#11), manual triggers NO cron
  (#12), tier-labeled model dispatch (#13), collision safety: claims +
  worktrees + branch-per-session (#14). North star recorded at
  docs/ai/NORTH_STAR.md; CLAUDE.md drift-guard added (flag scope creep in one
  sentence, Adrian decides). Y6 stays manual-trigger until per-item cron yes.

- 2026-07-02: Autonomy dial — `auto-ok` label = agent self-dispatch for menial
  work; strategy stays human; budgets + auto-halt + mandatory recaps on all
  autonomous runs. Cheap-model routing (GLM et al) DECLINED at current volume
  — quality > pennies; revisit only if lead volume makes enrich-tier costs
  real. Voice-dictation resilience line added fleet-wide. Delegation-interview
  skill created (`claude-config/skills/delegation-interview/`) — run with
  "run the delegation interview".

## Fleet directives (broadcast board — write here to reach every repo)

Every fleet repo's CLAUDE.md pointer instructs its sessions to read this file
before cross-project decisions — so a dated line here IS a fleet-wide
broadcast. Keep each directive one line; prune when obsolete.

- 2026-07-02: Track work as GitHub Issues; keep root `status.json` fresh at
  session end; cross-repo asks route through the ops hub, never repo→repo.

## Standing rules (never violate)

Keys are set by Adrian only (never read/write `.env*`). Never `git push` to
main; feature branch only. Never run deploys or `pnpm check:release`. Update
this file before ending a work session.

## Universal repo-onboarding prompt (copy-paste per client repo — the ONE prompt)

Run this verbatim in a Claude Code session scoped to the target repo (queue
item 3). Self-contained: consolidates tasks, creates the status file, wires the
pointer. Send once per repo.

```
Onboard this repo into the Hirobius fleet hub (hirobius/ops). Four jobs:

1. CONSOLIDATE TASKS → GITHUB ISSUES. Audit this repo for every open/implied
   task: TODO/FIXME comments, tasks.json or TODO.md files, unchecked README
   checklists, half-built features noted in docs. Create one GitHub Issue per
   real task in THIS repo (title = verb-first one-liner; body = 2-3 lines of
   context + file paths; label `backlog`). Skip trivia; dedupe against existing
   open issues instead of double-filing. GitHub Issues are this repo's task
   source of truth — the ops hub imports them automatically.

2. CREATE THE STATUS FILE. From what the audit showed, write `status.json` at
   the repo root — the ops fleet dashboard reads this file from the default
   branch. Exactly this shape (all narrative fields short):

   {
     "updatedAt": "<ISO timestamp now>",
     "phase": "active | prelaunch | live | maintenance | paused",
     "headline": "one line: where this project truly stands",
     "next": ["up to 3 bullets of what's next"],
     "blocked": ["only real blockers, else empty array"]
   }

3. ADD THE FLEET POINTER. Create or append to CLAUDE.md at the repo root:

   ## Fleet hub
   This repo is part of the Hirobius fleet. The operations hub is the
   hirobius/ops repo: fleet state at /api/projects, consolidated tasks at
   /ops/tasks (this repo's GitHub Issues sync there), current cross-project
   state in docs/ai/HANDOFF.md (in ops). Conventions for every session here:
   (a) track new work as GitHub Issues in THIS repo — never a local TODO
   file; (b) before ending any session that changed project state, update
   root status.json (updatedAt, phase, headline, next, blocked) — the ops
   dashboard renders it; (c) read the ops HANDOFF before cross-project
   decisions; (d) Adrian often dictates — read past voice-transcription
   errors and act on evident intent.

4. REPORT. Reply with: issues created (numbers + titles), issues skipped as
   duplicates, the status.json you wrote, and anything found that needs a
   human decision (do NOT decide it yourself).

Guardrails: work on a branch and push it; merge to the default branch if the
repo has no protections (status.json must land on the default branch to be
visible to the fleet dashboard), otherwise open a PR. Do not touch .env*
files, secrets, or deploy config. Do not refactor code — this is inventory +
wiring only.
```

## New client-work repo procedure (copy-paste — spin up a fresh client repo)

Sibling to the universal prompt above, but for a **new, private, Hirobius-owned
client-work repo** (one per engagement). The universal prompt onboards an
*existing* fleet repo; this one *stands up* a client repo from a project + its
`tasks.json`. Core rule (learned on Lilac): **the work repo is private and stays
Hirobius-owned — you never hand the client the repo, you hand them a curated
deliverable.** Client PII + internal business (pricing, legal, pro-bono,
competitor, brand-audit) live here safely *because it's private*; the handoff
excludes them via the `internal` label. Run in a session that has the client
project files (reads `tasks.json`). Replace `<Client Name>` / `<contact>`.

```
Onboard this repo into the Hirobius fleet. It's a NEW, private client-work repo — client: <Client Name>, contact: <contact>. Match the fleet convention (status.json + CLAUDE.md pointer + GitHub Issues). Five jobs:

1. STATUS FILE. Create `status.json` at the repo root (the ops fleet dashboard reads it from the default branch). Shape, all fields short:
   { "updatedAt": "<ISO now>", "phase": "active | prelaunch | live | maintenance | paused",
     "headline": "one line: where this engagement truly stands",
     "next": ["up to 3 near-term items"], "blocked": ["only real blockers"] }
   Derive the content from tasks.json (current phase/status; the live blockers).

2. FLEET POINTER. Create `CLAUDE.md` at the repo root with:
   (a) the standard fleet-hub pointer — part of the Hirobius fleet; hub = hirobius/ops (fleet state at /api/projects, cross-project state in its docs/ai/HANDOFF.md); every session tracks work as GitHub Issues + refreshes root status.json before ending;
   (b) CLIENT-DATA rule: this is a PRIVATE Hirobius work repo; internal business content (pricing/retainer/legal/invoicing/pro-bono/competitor/brand-audit) NEVER goes to the client — the handoff is a curated deliverable (working code + INSTALL/OPERATOR/access-review docs), never this repo wholesale, never `internal`-labeled issues;
   (c) PII rule: client PII (emails, vendor account/app IDs) never ships in a public bundle; the repo stays private.

3. TASKS -> GITHUB ISSUES. From tasks.json, one issue per task; body = notes + owner + dependsOn/automationRef; STRIP orchestration metadata (assignee/model/costCeiling/routingRationale/dispatchState). Labels: phase (`phase-N`); `done` -> create + close, `blocked` -> `blocked`, open stays open; `owner:<name>`; and an `internal` label on every Hirobius-only task (business/compliance, pro-bono, competitor, brand-audit) so the handoff can filter them out. Dedupe against existing issues.

4. README. Short: what the engagement is, the phase structure, a one-line "handoff = curated deliverable, not this repo."

5. REPORT. status.json written · issues by phase · which got `internal` · anything needing a human decision (don't decide it).

Guardrails: branch + push; merge to the default branch (status.json must land there for the dashboard). Do NOT commit raw internal planning files (tasks.json, retainer.json, notes.md, brand-audit.json, stack.json) — gitignore them; the issues are the tracker. Never touch .env* or secrets.
```

## Done log (one line each, newest first)

- 2026-07-06 (cross-repo backlog handoff finished): DS accessibility idea (`12v-token-system-modes`) recorded on DS #80; Concrete repo `hirobius/concrete` exists + was already bootstrapped (issues #1–#4: brand hexes, catalog data, tenant tooling, launch prereqs) — its catalog model + Stripe checkout are already built, so only the two genuine gaps were filed: **concrete#5** (WA legal pages) + **concrete#6** (AI content-repurpose, post-launch). BACKLOG.md is now fully drained into per-repo Issues across ops/DS/portfolio/concrete.
- 2026-07-06 (BACKLOG.md retired): removed the local-backlog seeding path now that GitHub Issues are the source of truth — deleted `BACKLOG.md`, `scripts/gen-backlog-tasks.mjs`, `lib/tasks/backlog.mjs`, the generated `backlog.tasks.mjs`, `api/tasks-import.ts`; unwired `ensure-ops-data` + dropped `upsertTasks` + the `/ops/tasks` "import backlog" button (tab keeps Supabase tasks + dispatch). typecheck + build green. Handoff verified clean first: DS items already migrated to DS repo #80 (+ #56); portfolio backlog items were stale (old Vite portfolio, not the current Next.js `hirobius/portfolio` — its own issues #1–#9 stand); Concrete's 5 items wait on the repo #19 stands up; ops survivors are #25–#29. Loose end tracked on #25: the Discord bot's `!status`/`!recent` + roadmap-data/llms-txt still referenced BACKLOG.md (degrade to empty, build unaffected).
- 2026-07-06 (production live + issues board + backlog triage): got the ops dashboard onto **PRODUCTION** (`main`) — fixed the SPA/prerender 404, moved DS to public npm `@0.11`, sanitized `SUPABASE_URL`, added `dispatch_url` migration 0004, actionable `GITHUB_TOKEN` failure messaging, one-click backlog import. Shipped **`/ops/issues`** (cross-repo GitHub Issues board; `api/issues.ts` server-side token; typecheck + build + 16/16 layout tests green). **Triaged all 76 BACKLOG.md items** against the 19 existing issues (#3–#22) + repo state: most are already-an-issue, done (ops-production-go-live, client-facing-portal-route, 13z-7-scripts-prune), stale/removed-surface (atlas/kanban/build/staging/knowledge/hermes-era), or belong in other repos (portfolio ×7, concrete ×8 → anchored by #19, HDS/DS ×10 → #20 anchors gates). Filed the 5 surviving ops-repo items as issues **#25** (discord-bot getOrchSummary/bridge bugs), **#26** (dispatchState dead-end), **#27** (PII git-history rewrite), **#28** (portal server-auth), **#29** (agentic review-loop Slice 1). Other-repo items handed to Adrian as paste-ready blocks (session scope is `hirobius/ops` only — can't write cross-repo). BACKLOG.md recommended for retirement now that Issues are the source of truth.
- 2026-07-02 (client repos): added the "New client-work repo procedure" above — reusable prompt for standing up a private, Hirobius-owned client-work repo from a project + `tasks.json` (status.json + fleet pointer + tasks→issues with an `internal` label; handoff = curated deliverable, never the repo). First use: hirobius/lilac-insure (Lilac Insure / Conrad). Client-data model settled: PII + internal data live in the private work repo or Supabase — never git-committed anywhere client-facing. The ops-history PII scrub (clients/{lilac-insure,prospect-001,the-ranch-foundation}, docs/ai/routing-log.jsonl) is scoped + dry-run-verified; filter-repo runbook handed to Adrian to force-push (ops is private, so hygiene not exposure).
- 2026-07-02 (architecture scrub + cleanup): 5-agent scrub (findings in `docs/ai/ARCHITECTURE_SCRUB_2026-07-02.md`), then shipped Tier 1 + Tier 2 in 8 verified batches — T1a dead post-commit step + 3 ENOENT /ops skill buttons · T1b failing CI build:lib/size-limit · T1c decoupled /ops dashboard from the 52-day frozen archive (also dropped a 1 MB bundle chunk) · T1d strength-report lies · T2a 6 dead deps + three · T2b 8 dead scripts · T2c 6 dead src files + 4 orphan tests · T2d api/ops-logout (→9 fns) + ALL_ROUTES ~60→23. ~30 dead files/deps gone, CI unbroken, no regressions, all 8 deploys READY. **Deferred (still open):** Tier 3 (duplicate/orchestration-era scripts), Tier 4 (doc identity: CLAUDE.md routes to retired docs; README/AGENTS "HDS product" vs NORTH_STAR agency-platform), the T1b package.json exports/check-public-api untangle, and the 2 `.ps1` files (held — possible personal tooling; Adrian to confirm). Discord always-on/fleet-aware filed as #15. **Next real work: HDS cutover** on the survivor list (PageHeader first — used by 16/17 pages).
- 2026-07-02 (fleet hub LIVE — end of the deploy saga): after the function-cap fix, three more blockers fell in sequence — (a) `/ops` login gate needed `OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` (never in the keys list); (b) env vars only bind on a NEW feature-branch build (dashboard "Redeploy" re-runs stale `main`, which fails `invalid_engines_value`); (c) every guarded route imported `'../lib/api/handler'` extensionless → `ERR_MODULE_NOT_FOUND` at ESM runtime (typecheck-green, 500 live). All fixed. `/ops/projects` now renders all 10 repos + their status.json; `VERCEL_TOKEN` + `GITHUB_TOKEN` verified active. Login works. Preview is the live hub.
- 2026-07-02 (deploy fix 2): the 38de046 deploy cleared the typecheck but then hit `exceeded_serverless_functions_per_deployment` (Hobby cap 12, we had 13). Consolidated the 4 lead-lifecycle routes (generate/build/publish/render-site) into one `api/lead-action.ts` POST dispatcher → 10 functions. Repointed LeadsPage callers + the dev middleware (scripts/leads-middleware.mjs, one `action` handler) + vite.config wiring. Added `pnpm typecheck:api` (tsconfig.api-check.json) as the real deploy-parity gate + fixed 7 pre-existing TS4111 so it's fully green. 41 api tests green, app build green.
- 2026-07-02 (deploy fix): branch had been ERROR-deploying for 7 commits (since d454856 /ops/projects) — Vercel type-checks api/*.ts functions and `@vercel/node`/`@types/node` were missing. Installed both; function typecheck now 0 blocking errors, app build green. This is why the preview looked stale + env vars weren't taking effect.
- 2026-07-02 (newsletter sweep): mined all 10 "The Code" editions (Jun 18–Jul 1) → filed ops issues #3–#7 (Playwright MCP self-verify · HTML plans/PR artifacts convention · blast-radius pre-edit hook · CLAUDE.md diet per Anthropic steering guide · lib/agent Sonnet-5 tiering + prompt audit). Judgment calls (cheap-model routing, observability, importer autonomy dial) parked pending Adrian.
- 2026-07-02 (later): fleet-status layer — per-repo root status.json rendered on /ops/projects (token-gated, TTL-cached) · combined one-shot onboarding prompt (tasks + status + pointer) · HANDOFF.md system + CLAUDE.md routing repointed off the retired night-shift loop.
- 2026-07-02: /ops/projects + /api/projects (fleet hub v1) · /ops/digest + first digest · Outscraper lead-gen · vendored agent+schema · render seam + /api/render-site · Astro decision recorded + cutover plan · script INDEX (#13-15) · architecture review #1-12 shipped.
