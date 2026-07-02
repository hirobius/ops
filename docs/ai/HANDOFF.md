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
  `/ops/projects` (live Vercel fleet — needs `VERCEL_TOKEN`).
- **Decision record**: `docs/ARCHITECTURE.md` (2026-06-30 reversal — Astro is
  production, Duda retired). Execution plan: `docs/operations/ops-astro-cutover-plan.md`.

## Next (ordered queue)

1. **Adrian: drop keys into Vercel env** (hirobius-ops → Settings → Env Vars,
   Production + Preview): `ANTHROPIC_API_KEY`, `OUTSCRAPER_API_KEY`,
   `VERCEL_TOKEN`, `VERCEL_TEAM_ID=team_niSKMbO08RycEwm9EXhN1PnE`,
   `GITHUB_TOKEN` (fine-grained, read-only Issues+Metadata). Vault = Bitwarden.
2. **Task importer unit** (needs `GITHUB_TOKEN`): pull open GitHub issues from
   every repo into the `tasks` table (`source: 'github:<repo>'`, `native_key` =
   issue#), project filter chips on `/ops/tasks`, Projects→Tasks link, and
   **`OPS_AGENT_KEY` machine auth** (Bearer alternative to the cookie on read
   endpoints) so headless agents can use the hub. Decision made: **no nested
   boards** — one flat table, filtered views.
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
6. **clients repo cleanup PR** (separate session scoped to hirobius/clients):
   delete `packages/agent` + `scripts/lead-gen`, keep `packages/schema`.

## Parked / known warts

- **`public/hds-manifest.json` churn**: container builds rebake it (sometimes
  INVALID — drops required fields). Standing order: `git checkout --` it on
  sight; do NOT commit regens. Real fix waits on the HDS import rework.
- `pnpm typecheck` is DS-baseline-red → commits/pushes use `--no-verify`;
  validate touched files by filtering typecheck output.
- `docs/ai/OPERATOR_BRIEF.md` + night-shift loop + `orchestration.json` are
  RETIRED — do not execute them.

## Standing rules (never violate)

Keys are set by Adrian only (never read/write `.env*`). Never `git push` to
main; feature branch only. Never run deploys or `pnpm check:release`. Update
this file before ending a work session.

## Universal repo-onboarding prompt (copy-paste per client repo)

Run this verbatim in a Claude Code session scoped to the target repo (queue
item 3). It is self-contained — no other context needed.

```
Onboard this repo into the Hirobius fleet hub (hirobius/ops). Three jobs:

1. CONSOLIDATE TASKS → GITHUB ISSUES. Audit this repo for every open/implied
   task: TODO/FIXME comments, tasks.json or TODO.md files, unchecked README
   checklists, half-built features noted in docs. Create one GitHub Issue per
   real task in THIS repo (title = verb-first one-liner; body = 2-3 lines of
   context + file paths; label `backlog`). Skip trivia; dedupe against existing
   open issues instead of double-filing. GitHub Issues are this repo's task
   source of truth — the ops hub imports them automatically.

2. ADD THE FLEET POINTER. Create or append to CLAUDE.md at the repo root:

   ## Fleet hub
   This repo is part of the Hirobius fleet. The operations hub is the
   hirobius/ops repo: fleet state at /api/projects, consolidated tasks at
   /ops/tasks (this repo's GitHub Issues sync there), current cross-project
   state in docs/ai/HANDOFF.md (in ops). Track new work as GitHub Issues in
   THIS repo — never a local TODO file. Read the ops HANDOFF before
   cross-project decisions.

3. REPORT. Reply with: issues created (numbers + titles), issues skipped as
   duplicates, and anything found that needs a human decision (do NOT decide
   it yourself).

Guardrails: work on a branch and push it (open a PR if the repo has branch
protections; otherwise a plain branch push is fine). Do not touch .env* files,
secrets, or deploy config. Do not refactor code — this is inventory + wiring
only.
```

## Done log (one line each, newest first)

- 2026-07-02: /ops/projects + /api/projects (fleet hub v1) · /ops/digest + first digest · Outscraper lead-gen · vendored agent+schema · render seam + /api/render-site · Astro decision recorded + cutover plan · script INDEX (#13-15) · architecture review #1-12 shipped.
