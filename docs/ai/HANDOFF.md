# HANDOFF — the living session-to-session state

> **Contract.** This is the single universal handoff. Any session (any device,
> any agent) that gets a short prompt — "continue", "status", "pick up", "go" —
> reads THIS file first and acts from it. Any session that does real work
> **updates this file before ending** (edit in place; keep it one page; move
> finished things to the log line at the bottom). Adrian never copy-pastes
> context again — he types one word.

_Last updated: 2026-07-02 · branch `claude/relaxed-ramanujan-vvhqf8` (all work committed + pushed)_

## Now (what is true today)

- **Preview**: https://hirobius-ops-git-claude-relaxed-ra-858b32-adrian-6234s-projects.vercel.app
  (auto-updates per push · `/ops` asks the gate password · Vercel login required
  unless using a fresh `_vercel_share` link).
- **Engine is real, awaiting keys**: lead-gen = Outscraper wrapper (mock rows
  until key). Agent = vendored clients pipeline (enrich→generate→judge loop,
  `ClientConfig` contract in `lib/schema`). Render seam emits `client.config.ts`
  + deploy commands (`/api/render-site`).
- **New surfaces**: `/ops/digest` (newsletter intel, JSONs in `src/app/digests/`),
  `/ops/projects` (live Vercel fleet — needs `VERCEL_TOKEN`; also renders each
  repo's root `status.json` — phase · headline · blocked — once `GITHUB_TOKEN`
  is set). Fleet-status convention: every repo keeps `status.json` at root
  (ops's own is the reference).
- **Decision record**: `docs/ARCHITECTURE.md` (2026-06-30 reversal — Astro is
  production, Duda retired). Execution plan: `docs/operations/ops-astro-cutover-plan.md`.

## Next (ordered queue)

1. **Adrian: drop keys into Vercel env** (hirobius-ops → Settings → Env Vars).
   **Set every var for BOTH Production AND Preview scopes** — the branch preview
   reads Preview-scoped vars; a Production-only var is invisible to it. **Env
   changes only take effect on a NEW build** — after adding/editing, redeploy
   the *feature branch* (a fresh push), NOT the dashboard "Redeploy" button
   (that re-runs `main`, which is stale + fails `invalid_engines_value`). Vault
   = Bitwarden. Full list, grouped by what each unlocks:
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
  `noImplicitAny`/TS7016 noise on the `.mjs` imports.)
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

## Done log (one line each, newest first)

- 2026-07-02 (deploy fix 2): the 38de046 deploy cleared the typecheck but then hit `exceeded_serverless_functions_per_deployment` (Hobby cap 12, we had 13). Consolidated the 4 lead-lifecycle routes (generate/build/publish/render-site) into one `api/lead-action.ts` POST dispatcher → 10 functions. Repointed LeadsPage callers + the dev middleware (scripts/leads-middleware.mjs, one `action` handler) + vite.config wiring. Added `pnpm typecheck:api` (tsconfig.api-check.json) as the real deploy-parity gate + fixed 7 pre-existing TS4111 so it's fully green. 41 api tests green, app build green.
- 2026-07-02 (deploy fix): branch had been ERROR-deploying for 7 commits (since d454856 /ops/projects) — Vercel type-checks api/*.ts functions and `@vercel/node`/`@types/node` were missing. Installed both; function typecheck now 0 blocking errors, app build green. This is why the preview looked stale + env vars weren't taking effect.
- 2026-07-02 (newsletter sweep): mined all 10 "The Code" editions (Jun 18–Jul 1) → filed ops issues #3–#7 (Playwright MCP self-verify · HTML plans/PR artifacts convention · blast-radius pre-edit hook · CLAUDE.md diet per Anthropic steering guide · lib/agent Sonnet-5 tiering + prompt audit). Judgment calls (cheap-model routing, observability, importer autonomy dial) parked pending Adrian.
- 2026-07-02 (later): fleet-status layer — per-repo root status.json rendered on /ops/projects (token-gated, TTL-cached) · combined one-shot onboarding prompt (tasks + status + pointer) · HANDOFF.md system + CLAUDE.md routing repointed off the retired night-shift loop.
- 2026-07-02: /ops/projects + /api/projects (fleet hub v1) · /ops/digest + first digest · Outscraper lead-gen · vendored agent+schema · render seam + /api/render-site · Astro decision recorded + cutover plan · script INDEX (#13-15) · architecture review #1-12 shipped.
