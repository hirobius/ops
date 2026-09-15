# HANDOFF — the living session-to-session state

> **Contract.** This is the single universal handoff. Any session (any device,
> any agent) that gets a short prompt — "continue", "status", "pick up", "go" —
> reads THIS file first and acts from it. Any session that does real work
> **updates this file before ending** (edit in place; keep it one page; move
> finished things to the log line at the bottom). Adrian never copy-pastes
> context again — he types one word.

_Last updated: 2026-09-14 — full shipped history in `docs/ai/DONE-LOG.md`._

## Now (what is true today)

- **🪟 `/ops/standing` — the fleet read, all of it derived (2026-09-15).**
  Repos are DISCOVERED (`listOpenIssues()` spans every repo the token sees across
  `hirobius` + `adr-eng`; one PR search covers all owners, so cost is flat in repo
  count). The chain is derived too: `leadFunnel` counts the `leads` table per
  stage and `lib/chain/evidence.mjs` computes state, the break and the biggest
  leak. **A stage reads `proven` only when real leads got through it.**
  Live funnel: 263 sourced → 249 scored → 39 qualified → 3 generated → 2
  published → 0 contacted. **The break is outreach, not publish** — two sites
  ARE deployed. The hand-written table this replaced was wrong on three counts
  (see ARCHITECTURE's note). `?ralph=1` keeps its hardcoded repos for the Tasks
  panel. No new Vercel function.

- **🎯 Revenue path moving again (2026-09-14).** **#185 shipped** (PR #301) — the
  Leads board now dispatches `render` and surfaces the paste-ready
  `client.config.ts` + deploy commands. It had sat `p0` and **unqueued for 64
  days**; labelling it `ralph-ready` shipped it in under two hours. **#186 is in
  flight** (PR #308, gate green + AI approved) — **single-flight means it stalls
  the whole loop until merged.** #187 marked the retired Duda path deprecated;
  removal is #309. Spec: `docs/specs/leads-to-site.md`.
- **🧭 Frontier-engineering doctrine (ops#274, branch
  `claude/hirobius-frontier-engineering-v6duri`, unmerged).**
  `docs/ai/FRONTIER-DOCTRINE.md` + `docs/specs/`. Finding: **we have the machinery
  and mis-aim it.** Retro harvest of 281 issues → 13 rules in
  `docs/ai/learned-rules.jsonl` (5 promoted to `CLAUDE.md` §4), 9 harness defects
  (#302–#305). Shipped on the branch: #304, #305 (ops-local half), #292 (steering
  budget, 135KB → 24KB). **#292/#304/#305 were de-queued** — built here, unmerged;
  leaving them `ralph-ready` would have had the loop rebuild them.
- **PRODUCTION is LIVE** — `hirobius-ops` deploys from `main`; `/ops` password gate
  active (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET`); Supabase wired; DS consumed
  from public npm `@hirobius/design-system`. Vercel is on **Pro**; preview
  Deployment Protection is off (the `/ops` gate still covers it).
- **The autonomous loop works and is under-aimed.** `ralph-gate` is the **sole
  required check** on `main` — other CI jobs are informational, so
  `mergeable_state: unstable` is still mergeable. Single-flight (one `ralph/*` PR
  at a time), auto-merge on `ralph-auto`, 6h idle-watchdog cron on. **Keep the
  ready pool non-empty and biased to the revenue path** (doctrine §8).
- **Revenue path is the priority and is now queued.** #185 (`p0`) + #186 are
  `ralph-ready` and **supervised — not `ralph-auto`** (client-facing output,
  fabrication bans apply). #190 is blocked on Adrian's go for Outscraper
  details-API spend. Spec: `docs/specs/leads-to-site.md`.
- **Compliance gates outreach.** #35 → #38 → #27 are a hard prerequisite for #9.
  No scaled cold email before they land. Outscraper spend stays ON HOLD pending
  an explicit go.
- **`.github/workflows/*` cannot be pushed by the bot** (no `workflows` scope).
  Route CI/workflow changes through an adr-eng PR — never a Ralph task. Four
  issues (#90/#240/#241/#243) each burned attempts rediscovering this.
- **Engine wired, lead keys not fully exercised.** lead-gen is an Outscraper
  wrapper; generation runs enrich → generate → judge; `lib/render` emits the
  paste-ready `client.config.ts` + deploy commands. Publishing stays a deliberate
  human action (it is the billing event).
- **Where to look:** `docs/ai/BURNDOWN-GAMEPLAN.md` (the clustered plan for every
  open issue) · `docs/ARCHITECTURE.md` ⇄ `docs/pipeline-walkthrough.html` (keep in
  lockstep) · `docs/ai/DONE-LOG.md` (shipped history) ·
  `docs/ai/REPO-PROCEDURES.md` (repo runbooks).

## Trigger phrases (manual, one-click/one-phrase — NO cron, #12)

Y6 delegation-interview mechanism: nothing runs on a schedule; these are the
documented manual triggers instead. Converting any of these to a cron job
requires an explicit per-item yes from Adrian (standing rule).

- **"scrub my newsletters"** — digest refresh. Any Claude session, said verbatim,
  executes end-to-end: Gmail read → distill → commit JSON to `src/app/digests/`
  → then run `node scripts/seed-digest-items.mjs --apply` to import the new
  file into the `digest_items` store (ops#78 P1 — `/ops/digest` now reads the
  store, not the JSON glob directly; the seed is idempotent, keyed on
  `item_key`, so re-running it is always safe). No board button yet (waits on
  `OPS_AGENT_KEY`); run it by saying the phrase in a session.
- **Lead sweeps** — no phrase; use the board instead. `/ops/leads` has a
  saved-sweep selector (`LeadSweepPanel.tsx`) — pick a preset, review the
  previewed niche×metro pairs + record estimate, then "Run selected" (explicit
  confirm, hard cap, sequential `/api/pull-leads` calls). Spend-safe: nothing
  fires on preset-select alone. Outscraper spend is still ON HOLD pending the
  bad-site thesis validation (see Done-log 2026-07-07) — get an explicit go
  from Adrian before clicking "Confirm run".

## Adrian's open actions (his court — one-time, not blocked on a session)

- **Run the lilac-insure onboarding prompt** → stands up the client repo to fleet
  spec + files its tasks (the "New client-work repo procedure" below is the prompt).
- **File the Alert Figma-drift issue** in `hirobius/hirobius-design-system` (a
  ready prompt was handed over): tone-colored title + border, danger→`circle-alert`;
  Figma node 33:34. Alert lives in the DS repo, not ops — that's where it lands.
- **Run the ops-history PII scrub** — `git filter-repo` runbook (dry-run-verified)
  removes `clients/{lilac-insure,prospect-001,the-ranch-foundation}` +
  `docs/ai/routing-log.jsonl` from all history, then force-push. ops is private → hygiene.
- **Set `PORTAL_HMAC_SECRET` in Vercel (#28)** — server-only (NOT `VITE_`-prefixed),
  Production + Preview scopes. **Paste the SAME value the current
  `VITE_PORTAL_HMAC_SECRET` holds** so existing `/c/:slug?token=…` links keep
  verifying. Link: https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables
  Then redeploy the branch; once verified, the old `VITE_PORTAL_HMAC_SECRET` can be
  deleted (nothing reads it — its only effect was leaking the secret into the bundle).

## Next (ordered queue)

> Detailed per-issue recommendations for everything open: `docs/ai/BURNDOWN-GAMEPLAN.md`.

1. **Revenue path — #185 (`p0`) → #186.** Both `ralph-ready`, supervised. Review
   the diffs before merge; do not add `ralph-auto`. Spec: `docs/specs/leads-to-site.md`.
2. **Adrian's calls, unblocking real work:** #190 (Outscraper details-API spend +
   endpoint) · #306 (curate gate severity — 16 judgement calls) · #303 / #302 /
   #296 / #238 (one shared `hirobius/ralph` engine release, not four).
3. **Guardrail follow-through:** run
   `node scripts/reconcile-ralph-closures.mjs --apply` once with a real
   `GITHUB_TOKEN` — likely closes several stale issues immediately (#3, #205,
   #210, #282 are candidates). Then walk the 8 unpromoted rules with
   `pnpm guardrail:promote-rule` (wants #300's steering destination first).
4. **Compliance before outreach:** #35 → #38 → #27, then #9. Hard gate.
5. **First real run:** pull leads (Access Tech) → generate → eyeball → render →
   publish. This is the north star; everything above either unblocks it or waits.
6. **Cutover Part B remainder** — gated on the clients Astro factory being live.
   `hirobius/clients#10` tracks that repo's cleanup.

## Parked / known warts

- **`public/hds-manifest.json` churn**: container builds rebake it (sometimes
  INVALID — drops required fields). Standing order: `git checkout --` it on
  sight; do NOT commit regens. Real fix waits on the HDS import rework.
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
- **Vercel is on Pro.** The old Hobby 12-function cap no longer binds, but keep
  consolidating `api/*.ts` (the 4 lead routes live behind one `api/lead-action.ts`
  dispatcher) — concurrency and cold starts still favour fewer functions.
- `docs/ai/OPERATOR_BRIEF.md` + night-shift loop + `orchestration.json` are
  RETIRED — do not execute them.

## Decisions (dated, newest first)

> Shipped history: `docs/ai/DONE-LOG.md` · repo runbooks: `docs/ai/REPO-PROCEDURES.md`.

- **2026-09-14 — Frontier-engineering doctrine adopted (ops#274).**
  One spec file per epic (`docs/specs/<slug>.md`), path-allowlist auto-merge over the
  per-issue `ralph-auto` tag, and an enforced budget on always-loaded steering.
  Kiro's productivity metrics (commit volume, "4.5× lift") **rejected** — we
  instrument north-star share and human-gate latency instead. Full rationale:
  `docs/ai/FRONTIER-DOCTRINE.md`.

> Older decisions: `docs/ai/DONE-LOG.md`.

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

