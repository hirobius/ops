# HANDOFF — the living session-to-session state

> **Contract.** This is the single universal handoff. Any session (any device,
> any agent) that gets a short prompt — "continue", "status", "pick up", "go" —
> reads THIS file first and acts from it. Any session that does real work
> **updates this file before ending** (edit in place; keep it one page; move
> finished things to the log line at the bottom). Adrian never copy-pastes
> context again — he types one word.

_Last updated: 2026-07-09 (**Tasks-board combing (ops#57) done** — combed the Supabase `tasks` board directly via MCP (the session GitHub connector token had expired); full triaged plan committed at **`docs/ai/board-comb-2026-07.md`** — a fresh session should read that first. Result under the feature freeze + repo scope: a **2-issue file-now wave** (`discord-bot-runtime-bugs`, `dispatchstate-queued-deadend` — both ops bugs), **4 dedup-closes** (`security-portal-server-auth`, `client-facing-portal-route`, `ops-production-go-live`, `ops-lead-pipeline-go-live` — already done/stale), and everything else parked with a recorded reason (5 epics → `/to-tickets` when their repo unfreezes · 24 parked-repo tasks · ~15 idea-backlog · `security-history-rewrite` → `needs-adrian`). **EXECUTED 2026-07-09 (reconciled): 0 new issues filed, 7 board rows closed as `done`.** Reconciling against GitHub (which the plan couldn't reach) collapsed the file-now wave to zero — both "bugs" were already filed AND fixed (`discord-bot-runtime-bugs`=CLOSED #25, `dispatchstate-queued-deadend`=CLOSED #26, both fixed in `e8843a6`; verified in code), `security-portal-server-auth`=CLOSED #28, `security-history-rewrite`=OPEN #27 (Adrian: don't duplicate), the 3 go-live/portal rows are done/superseded. All 7 rows now `status=done` with a supersede `notes` entry + `dispatch_url`→their issue so they won't re-comb; epics/parked-repo/idea-backlog untouched, freeze holds. See board-comb doc's EXECUTED section. Also this session: 9 Matt-Pocock engineering skills vendored + wired deterministically into ops & clients CLAUDE.md; Monroe first lead→gated-preview shipped; `comb-tasks.yml` tool-perm fix merged (#61). Branch: `claude/ops-dashboard-launch-7cons7`.) · previously 2026-07-08 (Issue #44: auto-record `preview_url` on leads — `scripts/sync-preview-urls.mjs` + pure matcher `matchPreviewUpdates(projects, leads)` (13 unit tests, no network). Polls Vercel via `lib/projects/index.mjs::listProjects`, matches each project with a READY **preview** deployment to a lead by `config.slug` (`hirobius-` prefix stripped), and — `--apply` only, dry-run default — stamps `preview_url` + `status='rendered'` via `updateLead` (the same write the manual `render` action makes). Fill-only/idempotent (skips leads that already have a URL), preview-only (production/`live_url` deliberately out of scope), fail-soft without `VERCEL_TOKEN`. Closes the manual-paste nav gap from the first-lead→preview session; intended for the mayor Routine alongside `fleet-dispatch.mjs`; see Done-log) · previously 2026-07-08 (Fleet auto-dispatch epic #41, Slice 5: stale-dispatch watchdog — `scripts/fleet-watchdog.mjs`, pure `findStale(tasks,{staleHours,maxRetries,now})` detects dispatched tasks gone quiet past a threshold, re-dispatches (bumps `dispatch_count`, restamps) or flags (`status='blocked'`) once retries are exhausted, dry-run default, optional `--comment` re-pings the stalled issue via a new `commentOnIssue` port method on `lib/github/issues.mjs`; intended to run alongside `fleet-dispatch.mjs` in the mayor Routine; see Done-log) · previously 2026-07-08 (Fleet auto-dispatch epic #41, Slice 3: real approvals inbox — `/admin/approvals` now reads the live `tasks` store (`dispatch_status='queued'`) instead of the dead `localhost:3005/orchestration/*` Figma-bridge; new `queue`/`unqueue` task actions, `ApprovalCard` reused with a `showGrill` flag + tier/model chips, `dispatch` now stamps `dispatch_status='dispatched'` so an approved task leaves the inbox, `/ops/tasks` gets a per-row Queue toggle + "N awaiting approval" link, `/ops` SurfacesRail gets a live-count Approvals tile; see Done-log) · previously 2026-07-08 (Fleet auto-dispatch epic #41, Slice 2: headless fleet-mode dispatcher — `scripts/fleet-dispatch.mjs` scans `auto_ok=true` tasks, routes via `lib/tasks/tier.mjs`, dry-run-default, `--apply` reuses `lib/tasks/actions.mjs`'s dispatch action to open the `@claude` issue; live dispatch unverified in-sandbox, see Done-log) · previously 2026-07-08 (Fleet auto-dispatch epic #41, Slice 4: observability — shared `lib/ops/notify.mjs` notify seam + Discord fan-out, `docs/ops/events.jsonl`, unified `/ops` Fleet timeline merging run-log + events + alert-log; `scripts/deploy-alert.mjs`'s inlined Discord POST deduped into the shared helper) · 2026-07-08 (Fleet #41 Slice 1: board dispatch fields + deterministic tier→model routing — data + routing foundation for Slice 2's dispatcher) · 2026-07-08 (#9 outreach engine: Smartlead adapter scaffolded — provider-agnostic `lib/outreach/*` + compliance-gated `scripts/push-outreach.mjs`, dry-run default, webhook route deferred) · 2026-07-07 (autonomous run-log shipped — #8 run-log half, Slice 2 · task-importer Slice 1 landed — GitHub issues → tasks + OPS_AGENT_KEY machine auth · #11 deploy/blocked alert check landed · #12 lead-sweep manual-trigger landed · #17 orchestration-era dead-code sweep · #28 portal auth moved server-side · prospecting Run 01 + 3rd scorer landed) · branch `claude/outscraper-max-records`_

## Now (what is true today)

- **🔒 FEATURE FREEZE (2026-07-08, Adrian).** No net-new features. Only ship: (1) **revenue** (first paying client — Monroe preview → outreach), (2) **bug/hygiene + CI honesty** (e.g. #54), (3) finishing genuinely well-scoped in-flight work. Everything else is **captured & parked** as issues — do not build it, no matter how tempting. Lifts when Adrian says so. This exists because feature churn was outrunning revenue; the fleet/tooling is "good enough" — go earn a client.
- **PRODUCTION is LIVE** (project `hirobius-ops`, deploys from `main`). `/ops`
  login gate active (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` set). DS consumed
  from **public npm `@hirobius/design-system@0.11`** (GitHub Packages + `.npmrc`
  gone). Supabase wired (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`); tasks/leads
  boards online. `GITHUB_TOKEN` set (dispatch + issues board verified).
- **NEW: `/ops/issues`** — cross-repo GitHub Issues board (every open issue the
  `GITHUB_TOKEN` can see, grouped by repo, multi-select → copy refs to paste into
  a Claude chat). GitHub is the task source of truth; `api/issues.ts` keeps the
  token server-side. Route + SurfacesRail tile + layout-integrity coverage landed.
- **NEW: Fleet auto-dispatch epic #41, Slice 2 landed (2026-07-08)** — the
  headless fleet-mode dispatcher, `scripts/fleet-dispatch.mjs`. Scans the
  `tasks` board for `auto_ok=true AND dispatch_url IS NULL AND status='open'`
  rows, runs each through `lib/tasks/tier.mjs::routeTask` (pure
  `selectAndRoute(tasks, {max})`, 16 unit tests, no network), and — only with
  `--apply` (dry-run is the default) — writes `tier`/`model`/
  `dispatch_status`/`dispatch_count`/`last_dispatched_at` via `setTaskFields`
  then reuses `lib/tasks/actions.mjs`'s existing `dispatch` action to open the
  `@claude` GitHub issue (no reimplemented issue-creation logic). Every real
  dispatch posts through `notifyEvent` (Fleet timeline) and `appendRun` (Runs
  panel). Defensive against migration 0008 not being applied: a PostgREST
  42703 (undefined_column) error is caught and the script exits cleanly
  naming the migration instead of crashing. This is a **Node script that
  opens GitHub issues — it does NOT spawn Claude sub-agents in-process**;
  picking the issue up is GitHub's `@claude` mention hand-off, which the
  mayor session schedules separately. **Live dispatch unverified in this
  sandbox**: GitHub issue creation 403s (no reachable `GITHUB_TOKEN` path
  here) and this session's network egress allowlist blocks the Supabase host
  outright (confirmed via the agent-proxy status endpoint — a policy denial,
  not a code bug), so `--dry-run` against real Supabase couldn't be exercised
  either. Adrian should run `--dry-run` then `--apply` for real once migration
  0008 is applied and `GITHUB_TOKEN` is confirmed live.
- **NEW: Fleet auto-dispatch epic #41, Slice 3 landed (2026-07-08)** — the
  real approvals inbox. `/admin/approvals` reads the live `tasks` store
  (`useTasks`/`GET /api/tasks`) and lists rows with `dispatch_status ===
'queued'` — proposed for dispatch but awaiting a human click, distinct
  from `auto_ok` (which self-dispatches with no approval at all). Approve →
  `POST /api/task-action {action:'dispatch'}` (opens the `@claude` issue);
  Deny → `{action:'unqueue'}` (back to the backlog). New `queue`/`unqueue`
  actions in `lib/tasks/actions.mjs`'s `SIMPLE` table; `dispatch` itself now
  also stamps `dispatch_status: 'dispatched'` so an approved (or manually
  dispatched) task always leaves the 'queued' filter, whichever path reaches
  it. `ApprovalCard` (`src/app/components/approval-card.tsx`) reused as the
  presentational surface — extended with optional `tier`/`model` chips and a
  `showGrill` flag (v1 tasks have no `needs-grilling` equivalent state, so
  both approvals pages pass `showGrill={false}`). New shared
  `useApprovalsInbox` hook (`src/app/pages/admin/useApprovalsInbox.ts`) backs
  both `Approvals.tsx` (list) and `ApprovalDetail.tsx` (single-key view, id =
  URI-encoded `task.key` since keys like `github:hirobius/ops#42` contain
  `/`/`#`) — one fetch/optimistic-mutation implementation, no drift. The dead
  `localhost:3005/orchestration/*` Figma-bridge fetch is fully removed (zero
  remaining references, grep-verified). `/ops/tasks` gets a per-row
  Queue/Queued toggle (mirrors the existing Auto on/off toggle) plus an "N
  awaiting approval" link to the inbox; `/ops`'s SurfacesRail gets a live
  queued-count Approvals tile. **Not built (out of Slice 3 scope):** the
  mayor/agent side of "queued" — nothing currently sets `dispatch_status =
'queued'` automatically; today it's purely an operator action from
  `/ops/tasks`. See Done-log for full verification.
- **NEW: Fleet auto-dispatch epic #41, Slice 5 landed (2026-07-08)** — the
  stale-dispatch watchdog, `scripts/fleet-watchdog.mjs`. Closes the loop
  Slice 2 opened: a dispatched `@claude` task whose session died or never
  opened a PR previously just sat there. Pure `findStale(tasks,
  {staleHours, maxRetries, now})` (no network/Date-inside — `now` is
  caller-supplied) flags a task stale when it looks dispatched
  (`dispatch_status='dispatched'` OR `claimed_by='claude'`+`dispatch_url`
  set), `status` isn't already `done`/`blocked`, and `last_dispatched_at` is
  older than `--stale-hours` (default 24). `--apply` (dry-run is the
  default) then either **re-dispatches** (`dispatch_count < --max-retries`,
  default 2 — bumps the count, restamps `last_dispatched_at`,
  `dispatch_status='dispatched'`) or **flags** (`dispatch_status='failed'`,
  `status='blocked'`) the exhausted ones, posting through `notifyEvent`
  (Fleet timeline) and `appendRun` (Runs panel) either way. Optional
  `--comment` leaves a fresh `@claude` re-ping on the stalled issue via a
  new `commentOnIssue({issueUrl, body})` method added to the GitHub port in
  `lib/github/issues.mjs` — skips cleanly per-task (not a hard failure) when
  `GITHUB_TOKEN`/network is unavailable. Defensive against migration 0008
  not being applied, same pattern as `fleet-dispatch.mjs`. **Intended to run
  inside the mayor Routine alongside `fleet-dispatch.mjs`** — dispatch new
  work, then sweep for work that stalled, same pass. No new storage, no new
  `api/*.ts` route (stays 11/12). See Done-log for full verification.
- **Fleet auto-dispatch epic #41, Slice 4 landed (2026-07-08)** — the
  observability layer (built ahead of Slice 2/3, scoped as its own unit).
  `lib/ops/notify.mjs` (`notifyEvent`/`readEvents`/`postToDiscord`) is the
  shared seam any future dispatcher posts through: validates
  `{ts,kind,title}` (`kind` ∈ dispatched|completed|approval_waiting|
  deploy_error|blocked), appends to committed `docs/ops/events.jsonl`, fans
  out to `DISCORD_WEBHOOK_URL` fail-soft (never throws). `scripts/notify.mjs`
  is the manual-trigger CLI. `scripts/deploy-alert.mjs`'s inlined Discord POST
  is now deduped — it delegates the fetch/timeout/error-handling to the
  shared `postToDiscord`, decision logic (message formatting, "no alerts to
  send" short-circuit) stays local, behavior unchanged. New `/ops` **Fleet**
  section (`FleetTimeline.tsx`, mounted above Runs) merges `run-log.jsonl` +
  `events.jsonl` + `alert-log.jsonl` into one newest-first, kind-toned-badge
  timeline (same build-time `import.meta.glob` idiom as RunsPanel — no
  Supabase migration, no new `api/*.ts` route, still 11/12 fn slots).
- **Fleet auto-dispatch epic #41, Slice 1 landed (2026-07-08)** — data +
  routing foundation only, no dispatcher runs yet. Migration
  `0008_task_dispatch.sql` (not yet applied — Adrian applies it in Supabase)
  adds `auto_ok`/`tier`/`model`/`dispatch_status`/`dispatch_count`/
  `last_dispatched_at` to `tasks`. `lib/tasks/tier.mjs` is a **pure**
  `routeTask(task)` → `{ tier, model }` (mechanical|standard|judgment →
  sonnet|sonnet|opus, never haiku), extracted from `scripts/auto-assigner.mjs`'s
  directive tables. `/ops/tasks` renders tier/model chips (empty until Slice 2
  writes them) + a per-row "Auto: on/off" toggle (`auto_on`/`auto_off` actions
  on the existing `/api/task-action`, no new route). Slice 2 (not built): the
  worker that scans `auto_ok=true` rows, calls `routeTask`, writes
  tier/model/dispatch_status back, and actually dispatches.
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
- **NEW (#11): deploy/blocked alert check** — `node scripts/deploy-alert.mjs`
  (manual trigger, no cron) diffs live fleet state against the committed
  `docs/ops/deploy-snapshot.json` baseline and alerts only on a NEW deploy-ERROR
  or newly-added `blocked[]` entry; logs to `docs/ops/alert-log.jsonl`; prints
  to stdout, posts to `DISCORD_WEBHOOK_URL` if set. Currently shows
  `hirobius-design-system` in a real ERROR state (branch
  `claude/storybook-publishable-9tdovm`) — worth a look. `--help` / `--dry-run`
  / `--json` flags; follow-up not built: `/ops/projects` "recent alerts" line
  (needs a new api route, non-trivial + Hobby fn cap already at 10/12).
- **Engine wired, lead keys not yet exercised**: lead-gen = Outscraper wrapper,
  Agent = vendored clients pipeline (enrich→generate→judge, `ClientConfig` in
  `lib/schema`), render seam emits `client.config.ts` (`/api/render-site`, now
  folded into `/api/lead-action`). `OUTSCRAPER_API_KEY` / `ANTHROPIC_API_KEY` /
  Supabase are set but UNVERIFIED until the first lead run proves them.
- **Other surfaces**: `/ops/digest` (newsletter intel, JSONs in `src/app/digests/`),
  `/ops/leads` (the lead board), `/ops/tasks`.
- **NEW (#8 run-log half, Slice 2): autonomous-run log.** Committed append-only
  `docs/ops/run-log.jsonl` (one JSON line per agent/session run) + `lib/ops/run-log.mjs`
  (`appendRun`/`readRuns`) + `scripts/log-run.mjs` CLI (`node scripts/log-run.mjs
--actor <a> --outcome <o> --summary "<s>" [--task/--model/--tier/--url]`) + a
  **Runs panel on `/ops`** (`RunsPanel.tsx`, build-time `import.meta.glob` of the
  JSONL — same idiom as `status.json`/digests, no Supabase migration, no new
  `api/*.ts` route). Seeded with 13 real entries from this session's completed
  work. CLAUDE.md §2 now has a standing step 5: every autonomous sub-agent/session
  posts a one-line recap before ending. **#8's original approvals-inbox
  scope (reviewing outreach sends) is still not built** — it waits on #9
  outreach to give it real content to review. Note: the `/admin/approvals`
  **route** is now live for a different purpose — Fleet epic #41 Slice 3
  repointed it at the `tasks` store's `dispatch_status='queued'` approval
  flow (task-dispatch approve/deny), not outreach review; see the Slice 3
  bullet above and 2026-07-08 Done-log.
  **#9's own adapter scaffold is now built** (see Done log 2026-07-08): the
  Smartlead client + compliance eligibility filter + push CLI exist and are
  tested, but sending stays gated — no lead has actually been pushed to
  Smartlead. The inbound webhook route (needed for the lifecycle to close the
  loop AND to give #8's approvals inbox real content) is the deferred next
  step; it needs the 12th Vercel function slot (or a route-consolidation
  decision) + `SMARTLEAD_WEBHOOK_SECRET`, plus a real `SMARTLEAD_API_KEY` +
  campaign + 2-4 weeks of domain/inbox warmup before any of this can go live.
- **Decision record**: `docs/ARCHITECTURE.md` (2026-06-30 reversal — Astro is
  production, Duda retired). Execution plan: `docs/operations/ops-astro-cutover-plan.md`.

## Trigger phrases (manual, one-click/one-phrase — NO cron, #12)

Y6 delegation-interview mechanism: nothing runs on a schedule; these are the
documented manual triggers instead. Converting any of these to a cron job
requires an explicit per-item yes from Adrian (standing rule).

- **"scrub my newsletters"** — digest refresh. Any Claude session, said verbatim,
  executes end-to-end: Gmail read → distill → commit JSON to `src/app/digests/`
  → `/ops/digest` picks it up on next load. No board button yet (waits on
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
- **Vercel (#18)**: disable preview Deployment Protection (the "404" cause — app
  self-gates via `OPS_GATE_PASSWORD`) + evaluate Pro before more `api/` routes land.
- **Set `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` in Vercel** — `/ops/leads` +
  `/ops/tasks` are offline without it (#16); apply `supabase/migrations`.
- **Set `PORTAL_HMAC_SECRET` in Vercel (#28)** — server-only (NOT `VITE_`-prefixed),
  Production + Preview scopes. **Paste the SAME value the current
  `VITE_PORTAL_HMAC_SECRET` holds** so existing `/c/:slug?token=…` links keep
  verifying. Link: https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables
  Then redeploy the branch; once verified, the old `VITE_PORTAL_HMAC_SECRET` can be
  deleted (nothing reads it — its only effect was leaking the secret into the bundle).
- **Delete the 2 Error deployments** (`dpl_En1J6…`, `dpl_7D3tk…`) — dashboard tidy.
- **Confirm the 2 `.ps1` scripts** (bridge-wsl2-port, setup-cron-windows) are safe
  to delete — the Tier-2 scrub held them (possible personal tooling).

## Next (ordered queue)

1. **Env vars — login gate + VERCEL_TOKEN + GITHUB_TOKEN verified live; the
   rest set-but-unexercised.** (Runbook kept below as the reference.) Two rules
   that cost real time and MUST be remembered: **(a) set every var for BOTH
   Production AND Preview scopes** — the branch preview reads Preview-scoped
   vars; a Production-only var is invisible to it. **(b) Env changes only take
   effect on a NEW build** — after adding/editing, redeploy the _feature branch_
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
2. **Task importer — Slice 1 landed (2026-07-07), Slice 2+ open.** Slice 1
   shipped: `lib/supabase/tasks.mjs` `upsertTasks` (upsert on `key`,
   re-added — see 2026-07-06 Done-log for why it was removed), pure mapper
   `lib/tasks/import-issues.mjs` (`mapIssuesToTasks`: GitHub issue →
   `key='github:<owner>/<repo>#<number>'` row, `lane=<repo name>`,
   `group='Internal'`, `dispatch_url=<issue url>`), `POST /api/tasks` (folded
   into the existing GET function via method-dispatch — fn count stays 11/12)
   calling `gh.listOpenIssues()` → `mapIssuesToTasks` → `upsertTasks`, source
   filter chips (dynamic, derived from loaded tasks) + an "Import GitHub
   issues" button on `/ops/tasks`, and **`OPS_AGENT_KEY` machine auth**
   (`checkAgentKey` in `lib/ops-auth.mjs` — Bearer token OR'd into
   `requireOpsAuth`, so a valid agent key = same access as a logged-in
   operator; unset env = feature off). Still needs `GITHUB_TOKEN` +
   Supabase live to actually populate rows in prod (both set but this path
   unexercised against prod DB yet — `tasks` table exists via 0003/0004, no
   new migration needed). **Deferred to Slice 2+ (not built):** the autonomy
   dial (`auto-ok` label → agent self-dispatch vs. always-human strategy
   tasks), broadcast tasks (fan out one GitHub Issue per repo for an
   `all repos`-targeted task, adoption tracked by per-repo close state), and
   per-task iteration/time budgets with auto-halt + mandatory run-log recaps.
   Projects→Tasks link also not built. Decisions made: **no nested boards**
   (one flat table, filtered views); cross-repo assignment routes through the
   hub, never repo→repo. **Fleet auto-dispatch epic #41 Slice 1 landed
   (2026-07-08)**: this is the concrete shape the autonomy dial above takes —
   migration `0008_task_dispatch.sql` (`auto_ok`/`tier`/`model`/
   `dispatch_status`/`dispatch_count`/`last_dispatched_at`, not yet applied)
   - pure `lib/tasks/tier.mjs::routeTask` (mechanical|standard|judgment →
     sonnet|sonnet|opus) + the board's tier/model chips and `auto_on`/`auto_off`
     toggle. **Slice 2 landed (2026-07-08):** `scripts/fleet-dispatch.mjs` —
     the dispatcher worker that scans `auto_ok=true` rows, calls `routeTask`,
     writes the result back, and actually dispatches (`--apply`, dry-run
     default). Live dispatch still unverified against real Supabase/GitHub
     (sandbox network restrictions — see Now section + Done-log). **Slice 3
     landed (2026-07-08):** `/admin/approvals` is now a real inbox over the
     `dispatch_status='queued'` tasks — see the new Now-section bullet above.
     **Slice 5 landed (2026-07-08):** `scripts/fleet-watchdog.mjs` — the
     stale-dispatch watchdog, re-dispatches or flags tasks whose dispatch
     went quiet past a threshold; see the new Now-section bullet + Done-log.
     Epic #41 close-out (whatever's left after Slice 5 — check issue #41
     sub-tasks; nothing yet auto-sets `dispatch_status='queued'`, and the
     watchdog isn't wired into a live cron/Routine yet, only documented as
     intended to run inside the mayor Routine) is next.
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
_existing_ fleet repo; this one _stands up_ a client repo from a project + its
`tasks.json`. Core rule (learned on Lilac): **the work repo is private and stays
Hirobius-owned — you never hand the client the repo, you hand them a curated
deliverable.** Client PII + internal business (pricing, legal, pro-bono,
competitor, brand-audit) live here safely _because it's private_; the handoff
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

- 2026-07-09 (Tasks-card rework + Approvals tile folded into Tasks — Adrian design pass): reworked the `/ops/tasks` rows to the cleaner Issues-board card style Adrian preferred: `[checkbox] #N  title↗  ·  <status/tier/model/tags/import_flags badges>  ·  source · phase · P · E · @owner · due · updated <rel-time>`, with a right-side action cluster `copy # · Done/Reopen · Dispatch/Re-dispatch · ⋯`. The three confusing fleet controls (Auto-dispatch, Queue-for-approval, Trash) moved into a per-row **⋯ overflow menu** with plain-language labels instead of cryptic inline buttons. Per-row `copy #` (single ref) complements the existing multi-select **Copy refs** batch. New `relTime()` + `openMenuKey` state; badges now also render `t.tags` (GitHub labels, once the importer stores them — column exists, not yet populated). **Approvals:** removed the standalone Approvals launchpad tile; the queued-for-approval count now rides as a badge on the **Tasks** tile (`SurfacesRail`, only when >0) and the board keeps its "N awaiting approval" link — the `/admin/approvals` route + Queue action stay for when fleet auto-dispatch resumes. Note: DS exposes no `--semantic-color-content-danger` token (only accent/disabled/inverse/onAccent/primary/secondary), so the Trash item uses the normal menu-item style, not red. **Verified:** typecheck clean (touched) + `vite build` green + layout-integrity **16/16** + vitest **439/439**; screenshotted the reworked card (overflow menu open) + the 4-tile launchpad (no Issues/Approvals tiles). Branch `claude/ops-dashboard-launch-7cons7`.
- 2026-07-09 (#52 — consolidated issues+tasks into ONE board, retired /ops/issues): `/ops/tasks` is now the single board over every task and GitHub issue across all fleet repos; the standalone `/ops/issues` surface is retired. Both always used the SAME cross-repo source (`lib/github/issues.mjs::listOpenIssues` — "every open issue across all repos the token can see"); the importer (`POST /api/tasks`) already pulls that full feed, so `/ops/issues` was a redundant live view. Changes: (1) ported the only thing tasks lacked — multi-select → **Copy refs** (`owner/repo#N`) — onto the tasks board (`taskRef(t)` derives the ref from the `github:*` key or a `dispatch_url` issue URL; per-row checkbox + batch bar); (2) `/ops/issues` route now `<Navigate to="/ops/tasks">` (no 404 for bookmarks; layout-integrity's `/ops/issues` entry passes via the redirect); (3) **deleted** `src/app/pages/ops/issues/{IssuesPage,useIssues,types}.tsx` + **`api/issues.ts`** → **api functions 11→10** (more Hobby-cap headroom); (4) removed the interim "GitHub issues ↗" link from the tile-merge slice; lede + `api/tasks.ts` header updated. **NOT done (rest of #52, follow-ups):** the importer still only upserts-open (doesn't mark tasks done when their issue closes — a safe reconcile needs per-issue state, not absence-from-the-identity-feed), and `source_url` vs `dispatch_url` are still conflated. **Verified:** `pnpm typecheck` clean (touched files) + `typecheck:api` exit 0; route-coverage OK (14 paths); `vite build` green; layout-integrity **16/16**; **vitest 439/439**; screenshotted `/ops/tasks` showing the Copy-refs batch bar. Note: the 24 issues filed earlier today aren't board rows yet — a prod `Import GitHub issues` click syncs them in. Branch `claude/ops-dashboard-launch-7cons7`.
- 2026-07-09 (board-comb CLOSEOUT — every board row is now a repo-assigned issue): Adrian's directive "anything on this board needs to be an actual issue assigned to a repo, not just text." Turned all **59 text-only live rows** into (or mapped them onto) GitHub issues; **board now has 0 naked-text open rows** — the 115 still-open rows are all `github:*` issue-backed. Added `concrete` + `portfolio` to the session (`hds` already added). **Filed 24 new issues:** ops **#62** (EPIC: Dashboard command-center backlog — folds in 19 dashboard/skill-bar rows, parked under freeze), ops **#63–#75** (13: typography-windows-path bug, kimi-notify bug, soft-gates triage + OWASP-B2 + OSV-B6 investigations, scripts-prune, orphan/DOM guardrails, atlas-absorb-hds-docs, codeburn spec, ai-jsdoc, incubator visual-diff gallery, 2 needs-scoping stubs), `concrete` **#8–#10** (catalog data model, asset pipeline, Stripe-checkout verify), `portfolio` **#11–#17** (missing-asset 404 bug, asset-validation, bio copy, RTL QA, focus-ring QA, launch screenshots, case-study journaling). **Mapped/deduped (no new issue):** 10 hds rows → the FROZEN hds epic **hds#80** (it already absorbs expression layer/Figma/lab/visual-evolution/semantic-headings/token-modes — do NOT file into a frozen repo); `concrete` legal/content → existing concrete#5/#6; `ops-agentic-review-loop` → Fleet epic #41; 3 concrete rows done/obsolete; `grc-career-planning` closed off-tracker (personal, no repo). Every closed row carries `dispatch_url`→its issue + a `notes` line; SQL idempotent (guarded on `status in (open,blocked)`). **Remaining data-quality caveat (pre-existing, NOT fixed here):** 49 of the 115 `github:*` rows point at repos that 404 under `hirobius` (job-hunt, lilac-insure, lilac-bonds, veteran-resource-navigator) — verify where those live before trusting them as real issues. Branch `claude/ops-dashboard-launch-7cons7`.
- 2026-07-09 (ops UX — merge the Issues + Tasks launchpad tiles, #52 first slice): collapsed the two near-identical `/ops` SurfacesRail tiles (`Tasks`→/ops/tasks and `Issues`→/ops/issues) into **one** `Tasks` tile (`src/app/pages/ops/agentic-os/SurfacesRail.tsx`), per #52's "one board (/ops/tasks), retire /ops/issues". Non-lossy: `/ops/issues` (the cross-repo live GitHub view w/ multi-select→copy-refs — the one thing tasks doesn't do) stays a valid route and is now reachable via a new "GitHub issues ↗" secondary link on the Tasks board header (`TasksPage.tsx`), so it's demoted from a competing top-level tile to a sub-affordance rather than deleted. Deliberately NOT done here (rest of #52, larger): cross-repo importer (pull issues from all fleet repos into the tasks table), the `source_url` vs `dispatch_url` split, deleting the IssuesPage/route/api, and the agent-ready task-shape template. **Verified:** `pnpm typecheck` clean on both touched files (DS baseline still red, filtered); `pnpm exec vite build` green; layout-integrity **16/16** (incl. /ops, /ops/tasks, /ops/issues) via a temp sandbox Playwright config pinned to the image's chromium-1194 (default resolves to absent build 1208; config deleted, never committed); route-coverage OK (15 paths); screenshotted /ops (5 tiles, no Issues tile) + /ops/tasks (link present) from the gate-bypassed dev server. Branch `claude/ops-dashboard-launch-7cons7`.
- 2026-07-09 (board-comb file-now wave — EXECUTED, reconciled): executed the `docs/ai/board-comb-2026-07.md` file-now wave against live GitHub + the Supabase `tasks` board. **Reconciled first** against the `comb-tasks.yml` CI plan on ops#57 and against GitHub issue state — which collapsed the planned "2-issue file-now wave" to **0 new issues**: both proposed bugs were already filed AND fixed (`backlog:discord-bot-runtime-bugs`=CLOSED #25, `backlog:dispatchstate-queued-deadend`=CLOSED #26, both fixed in `e8843a6`; the plan + CI plan missed it because those rows key `backlog:*` not `github:*`, so their dedup pass skipped them — verified in code that `getOrchSummary`/`get_orchestration` and the `dispatchState:"queued"` write are both gone). Closed **7** board rows `status=done` with a supersede `notes` entry + `dispatch_url` stamped to the mapping issue where one exists: `discord-bot-runtime-bugs`→#25, `dispatchstate-queued-deadend`→#26, `security-portal-server-auth`→#28 (all CLOSED), `security-history-rewrite`→#27 (OPEN — Adrian confirmed: don't file a duplicate), and `client-facing-portal-route` / `ops-production-go-live` / `ops-lead-pipeline-go-live` (done/superseded, no issue). Board writes idempotent (guarded on `status='open'`). Left epics / parked-repo / idea-backlog untouched — feature freeze holds. Corrected the CI plan on ops#57 with a reconciliation comment so a later approver doesn't re-file #25/#26/#27. Branch `claude/ops-dashboard-launch-7cons7`.
- 2026-07-08 (Fleet auto-dispatch epic #41, Slice 5 — stale-dispatch watchdog): built `scripts/fleet-watchdog.mjs`, closing the loop Slice 2 opened — a dispatched `@claude` task whose session died or never opened a PR previously just sat there with no follow-up. Same shape as `scripts/audit-claims.mjs` (stale-claim detection over a JSON store) reused conceptually, storage layer swapped for the Supabase `tasks` table. Pure `findStale(tasks, {staleHours, maxRetries, now})` — no network, no Date-inside (`now` is caller-supplied ms epoch, throws if omitted/non-finite, keeping the function trivially unit-testable) — flags a task stale when it looks dispatched (`dispatch_status==='dispatched'` OR `claimed_by==='claude'` AND `dispatch_url` set), `status` isn't already `done`/`blocked`, and `last_dispatched_at` is set, parseable, and older than `now - staleHours*3_600_000` (missing/unparseable timestamp is skipped defensively rather than guessed at). Per stale task: `dispatch_count < maxRetries` → `{action:'re-dispatch'}`, else → `{action:'flag'}` (missing `dispatch_count` treated as 0). `--dry-run` is the DEFAULT (lists stale tasks + decision, zero writes); `--apply` performs it — re-dispatch bumps `dispatch_count`/restamps `last_dispatched_at`/sets `dispatch_status='dispatched'` via `setTaskFields`, flag sets `dispatch_status='failed'` + `status='blocked'`; both paths post through `notifyEvent` (Fleet timeline + Discord) and `appendRun` (Runs panel), matching Slice 2's dispatcher conventions. `isMissingColumnError` (migration 0008 defensiveness) duplicated locally rather than imported cross-script, matching `audit-claims.mjs`'s standalone-script precedent. New optional `--comment` flag leaves a fresh `@claude` re-ping on the stalled issue on re-dispatch — needed a new `commentOnIssue({issueUrl, body})` method added to the GitHub port (`lib/github/issues.mjs`, parses owner/repo/issue-number out of the stored `dispatch_url`), gated behind the flag and skips cleanly **per-task** (not a hard failure) when `GITHUB_TOKEN`/network is unavailable. **Verified:** `--help` exits 0; `--dry-run` reaches Supabase auth (env vars present — `getServiceClient()` succeeds) but 403s on this sandbox's Supabase host egress allowlist, same documented limitation as Slice 2's report — the script's own missing-column/query-failure/env-missing error paths were exercised individually via the unit tests instead. `scripts/__tests__/fleet-watchdog.test.mjs`: **23 new tests** — the caller-must-supply-`now` contract, empty/non-array input, stale-by-age-past-default-threshold, fresh-within-window exclusion, custom `--stale-hours`, `done`/`blocked` status exclusion, both dispatched-signal shapes (`dispatch_status` and `claimed_by`+`dispatch_url`) including the not-dispatched and claimed-without-url negatives, missing/unparseable `last_dispatched_at` exclusion, re-dispatch-vs-flag by `dispatch_count` vs `maxRetries` (incl. missing-count-as-0 and a custom `--max-retries`), a mixed six-task batch exercising every exclusion+decision path at once, non-finite `staleHours`/`maxRetries` falling back to defaults, and `isMissingColumnError` on code/message/unrelated-error shapes. `pnpm typecheck` + `typecheck:api` both clean (scripts/*.mjs isn't in either tsconfig's `include`, confirmed); `pnpm lint --max-warnings=0` 0/0; `pnpm exec vite build` green; `pnpm exec vitest run` **425/425** (38 files, up from 402); `ls api/*.ts | wc -l` stays **11**; `validate-guardrail-registry` ✓ (`fleet-*.mjs` doesn't match `check-`/`audit-`, no entry needed, same as `fleet-dispatch.mjs`'s precedent). Pre-commit run with `--no-verify` for the known `editorconfig-checker` 403 — confirmed via `git stash -u` on a clean tree that it predates this diff (gitleaks not installed locally, skips cleanly; every other hook step — lint-staged/prettier, typecheck, lint, validate-guardrail-registry, lockfile check — passed normally before the editorconfig step halted the chain). **Not built (out of Slice 5 scope):** the watchdog isn't wired into a live cron/Routine yet — it's documented as intended to run inside the mayor Routine alongside `fleet-dispatch.mjs`, but nothing schedules either script today; that wiring is Adrian's/epic-close-out's call.
- 2026-07-08 (Fleet auto-dispatch epic #41, Slice 3 — real approvals inbox): retired the dead `localhost:3005/orchestration/*` Figma-bridge dependency in `src/app/pages/admin/Approvals.tsx`/`ApprovalDetail.tsx` and repointed `/admin/approvals` at the live `tasks` store. **Backend:** `lib/tasks/actions.mjs`'s `SIMPLE` table gains `queue`/`unqueue` (flip `dispatch_status` to/from `'queued'` — migration 0008); the existing `dispatch` handler now also stamps `dispatch_status: 'dispatched'` in its `updateTask` call (a correctness fix needed for the inbox to actually empty on approval — without it a task stayed `'queued'` forever after being dispatched, since `fleet-dispatch.mjs`'s own `setTaskFields` write happens _before_ calling `dispatch`, not inside it; verified the existing `tests/api/task-actions.test.ts` assertions use `toMatchObject`, so the extra field didn't break them). `TaskAction` type + `api/task-action.ts` doc comment updated to match; no new `api/*.ts` file (still 11/12). **Frontend:** new `src/app/pages/admin/useApprovalsInbox.ts` — a shared hook (`useApprovalsInbox`) wrapping `useTasks` + optimistic `queue`d-key hide/rollback, plus `taskToApprovalUnit` (maps a `Task` → `ApprovalCard`'s `ApprovalUnitSummary`) — backs both `Approvals.tsx` (list, filtered to `dispatch_status==='queued'`) and `ApprovalDetail.tsx` (route `/admin/approvals/:id`, id = URI-encoded `task.key` since keys like `github:hirobius/ops#42` contain `/`/`#`; folds into the same inbox filtered to one key rather than a second fetch). `ApprovalCard` (`src/app/components/approval-card.tsx`) reused presentationally, extended with optional `tier`/`model` props (rendered as `Tag` chips so the operator sees Slice-1 routing before approving) and a `showGrill?: boolean` (default true) prop — both approvals pages pass `false` since v1 tasks have no `needs-grilling` equivalent; both additions are optional/backward-compatible. `/ops/tasks` (`TasksPage.tsx`) gets a per-row Queue/Queued toggle button (mirrors the Auto on/off toggle, hidden once a task already has a `dispatch_url`) and an "N awaiting approval" link to the inbox when N > 0. `/ops`'s `SurfacesRail.tsx` gets a new Approvals tile with a live queued-count label, wired from `AgenticOSPage.tsx` via its own `useTasks()` poll. **Verified:** `pnpm typecheck` + `typecheck:api` both clean; `pnpm lint --max-warnings=0` 0/0 (one import-order warning self-fixed); `pnpm exec vite build` green; `pnpm exec vitest run` **402/402** (existing `task-actions.test.ts` dispatch assertions still pass against the added `dispatch_status` field); `ls api/*.ts | wc -l` **11**; grep for `localhost:3005`/`BRIDGE_BASE`/`/orchestration/` across `src/` returns **zero** matches; `node scripts/check-route-coverage.mjs` OK; **16/16** layout-integrity routes green including `/admin/approvals`, `/admin/approvals/p0-1-repo-structure`, and `/ops/tasks` (temp `playwright.config.sandbox.ts` — `executablePath` pinned to the sandbox's pre-installed full-Chromium build since the default config resolves to a headless-shell build not present in this image — deleted after, never committed). Pre-commit run with `--no-verify` for the known `editorconfig-checker` 403 (#39) + gitleaks sandbox exceptions — confirmed via `git stash` that both predate this diff; every other hook step passed. `docs/ARCHITECTURE.md` + `docs/pipeline-walkthrough.html` updated in lockstep (admin/approvals flipped from "dead orchestration bridge" gap to live; #13's remaining gap trimmed to the autonomy dial + tier→model UI polish). **Not built (deliberately out of Slice 3 scope):** nothing yet writes `dispatch_status='queued'` automatically — today it's purely a human action from `/ops/tasks`; the mayor/agent-proposed-queue path is future epic #41 close-out work.
- 2026-07-08 (Fleet auto-dispatch epic #41, Slice 2 — headless fleet-mode dispatcher): built `scripts/fleet-dispatch.mjs`, the mayor's headless worker (a Node script that opens `@claude` GitHub issues — does NOT spawn Claude sub-agents in-process, that's the mayor session's separately-scheduled job). Pure `selectAndRoute(tasks, {max})` filters to `auto_ok===true && !dispatch_url && status==='open'`, runs each survivor through `lib/tasks/tier.mjs::routeTask`, and caps at `--max` (default 3, falls back to the default on a non-finite value); `isMissingColumnError(error)` recognizes a PostgREST 42703 (undefined_column) so a pre-0008 database exits cleanly naming the migration instead of crashing. `--dry-run` is the DEFAULT (lists eligible tasks + computed tier/model, zero writes); `--apply` writes `tier`/`model`/`dispatch_status`/`dispatch_count`/`last_dispatched_at` via `setTaskFields` first, then calls `lib/tasks/actions.mjs::applyTaskAction(..., {action:'dispatch'})` to open the `@claude` issue (reused as-is, no reimplemented issue-creation) — ordered so a mid-loop `GITHUB_TOKEN` failure can't happen (the token is checked up front, before any writes). Each successful dispatch posts through `notifyEvent` (kind:`dispatched`, Fleet timeline + Discord) and `appendRun` (Runs panel). `--json` for machine-readable output. **Verified:** `--help` exits 0; `pnpm typecheck` + `typecheck:api` clean; `lint --max-warnings=0` 0/0; `vite build` green; `vitest run` **402/402** (16 new in `scripts/__tests__/fleet-dispatch.test.mjs` — eligibility filter on each of the three conditions independently, routeTask wiring, `--max` cap incl. 0 and NaN-fallback, empty/non-array input, order-preservation, and `isMissingColumnError` on code/message/unrelated-error cases); `api/*.ts` stays **11/12**; `validate-guardrail-registry` ✓ (script name doesn't match `check-`/`audit-`, no entry needed). **Live-dispatch limitation (real, not just untested):** this session's network egress allowlist blocks the Supabase host outright (`Host not in allowlist: vvyccwxtcwvlusweenje.supabase.co`, confirmed via the agent-proxy status endpoint as a `connect_rejected`/403 policy denial — not a code bug), so `--dry-run` against real Supabase couldn't be exercised end-to-end here, and GitHub issue creation would also 403 per the known sandbox restriction. The script's own error handling for both cases (missing-column, generic query failure, missing `GITHUB_TOKEN`) was verified to print an actionable message and exit non-zero rather than crash. Pre-commit run with `--no-verify` for the known `editorconfig-checker` 403 + disabled gitleaks — confirmed via `git stash` that both predate this diff; every other hook step passed.
- 2026-07-08 (Fleet auto-dispatch epic #41, Slice 1 — board fields + tier→model routing): data + routing foundation for Slice 2's dispatcher, no dispatch logic yet. `supabase/migrations/0008_task_dispatch.sql` (additive, `if not exists`, stacks on 0003/0004): `auto_ok boolean default false`, `tier text` (mechanical|standard|judgment), `model text`, `dispatch_status text` (queued|dispatched|running|done|failed), `dispatch_count int default 0`, `last_dispatched_at timestamptz`, partial index on `auto_ok`. **Not yet applied in Supabase** — Adrian applies it; code is defensive (nullable fields, no query assumes they exist yet). `lib/tasks/tier.mjs` — **pure**, no network/Ollama/Date — `pickTier(task)` (judgment if `priority==='high'` OR `effort==='L'` OR title matches `/architecture|migration|security|refactor|validator|schema|auth|design|ambiguous/i`; mechanical if `effort==='S' && priority!=='high'` OR title matches `/rename|typo|bump|lint|format|copy|chip|docs?\b/i`; else standard — judgment checked before mechanical, so e.g. a high-priority typo fix still routes judgment), `pickModel(tier)` (mechanical/standard→sonnet, judgment→opus, **never haiku**, mirrors `scripts/auto-assigner.mjs`'s directive without reusing its Ollama/clients-json plumbing), `routeTask(task)` convenience. `lib/supabase/tasks.mjs` gets `setTaskFields(sb, key, patch)` (thin named alias over `updateTask`, for Slice 2's dispatcher and the auto toggle to write the new columns without ad-hoc column sets). `lib/tasks/actions.mjs` gets `auto_on`/`auto_off` actions (flip `auto_ok`, reuses the existing `/api/task-action` — no new route, still 11/12 `api/*.ts`). `/ops/tasks` (`TasksPage.tsx`) renders a tier chip + model chip per row when present (empty until Slice 2 writes them) and an "Auto: on/off" toggle button per row. `src/app/pages/ops/tasks/types.ts` extended with the 6 new `Task` fields + the 2 new `TaskAction` variants. **Verified:** `pnpm typecheck` + `typecheck:api` both clean; `pnpm lint --max-warnings=0` 0/0; `pnpm exec vite build` green; `pnpm exec vitest run` **366/366** (34 new in `scripts/__tests__/tier.test.mjs` — every judgment/mechanical trigger individually, the standard/empty-input defaults, the model mapping incl. "never haiku", and the three representative `routeTask` cases from the issue: high-priority arch task→judgment/opus, S/low typo→mechanical/sonnet, default→standard/sonnet); 16/16 layout-integrity routes green incl. `/ops/tasks` (temp in-repo Playwright config, sandbox Chromium `executablePath`, deleted after); `api/*.ts` stays **11/12**. Pre-commit run with `--no-verify` for the known `editorconfig-checker` 403 (#39) — every other hook step passed. **Deferred to Slice 2 (not built):** the dispatcher worker itself — nothing currently reads `auto_ok` or writes `tier`/`model`/`dispatch_status` outside the manual toggle; flipping "Auto: on" today has no runtime effect yet.
- 2026-07-08 (#9 outreach engine: Smartlead adapter scaffolded, sending stays gated): built the provider-agnostic outreach adapter per `docs/prospecting/outreach-providers.md`'s decision (Smartlead). `lib/outreach/types.mjs` (`OutreachProvider`/`OutreachEvent` JSDoc typedefs — swapping providers later is one new file, not a rewrite of callers); `lib/outreach/map.mjs` (pure: `leadToOutreachLead`/`leadsToOutreachLeads` map a `leads` row → Smartlead shape, `first_name` sourced from migration 0007's `owner_name` column and omitted rather than fabricated when absent, skips no-email rows; `webhookEventToPatch` maps a normalized event → the #36 lifecycle patch, exhaustive over sent/replied/bounced/unsubscribed); `lib/outreach/smartlead.mjs` (`makeSmartleadProvider({apiKey, fetch})` + `normalizeWebhook` — contract verified against Smartlead's docs via WebSearch + 2 independent open-source API clients since this sandbox's proxy policy-blocks direct requests to `*.smartlead.ai`; `// VERIFY` comments + dual-spelling event aliases (`EMAIL_REPLIED`/`EMAIL_REPLY` etc.) mark the spots that need confirming against a live payload; fails loud naming `SMARTLEAD_API_KEY` + the Vercel env link when the key is missing, checked before any DB read so `--apply` fails fast); `scripts/push-outreach.mjs` CLI (`--dry-run` default, `--apply` for real sends, enforces the compliance eligibility filter — `lead_score >= 60` AND `email` present AND `do_not_contact` is not true AND `outreach_status` is null — in the Supabase query itself, not just client-side). **Verified:** `--help` exits 0; a bare run with no `--campaign` exits 1 without touching Supabase or Smartlead; `--campaign <id> --apply` with `SMARTLEAD_API_KEY` unset fails loud naming the var (checked live in this sandbox); `--campaign <id>` dry-run reaches the Supabase read (env IS configured here) but never imports `smartlead.mjs`; `pnpm typecheck` + `typecheck:api` clean; `lint --max-warnings=0` 0/0; `vite build` green; `vitest run` 332/332 (24 new in `outreach-map.test.mjs`, incl. the Smartlead client against a stub fetch — no live network); `api/*.ts` stays **11/12** (no new route — the ungated webhook handler is deliberately deferred). **Deferred, documented as next step:** `api/outreach-webhook.ts` (needs the 12th function slot or a route-consolidation decision, plus `SMARTLEAD_WEBHOOK_SECRET` since it must be ungated for Smartlead's external POSTs) — the pure `normalizeWebhook`/`webhookEventToPatch` are already built+tested so wiring it later is small. Also still needed before any real send: a real `SMARTLEAD_API_KEY` + campaign, separate sending domains, and 2-4 weeks of warmup (all human/ops track, documented in the doc's original "Human setup + cost" section).
- 2026-07-07 (autonomous run-log — #8 run-log half, Slice 2): stack-fitting design per the issue's own "no migration, no new Vercel function" constraint (already at 11/12) — a **committed append-only JSONL**, rendered at build time, mirroring how `status.json`/digests are already consumed. New: `docs/ops/run-log.jsonl` (one JSON object per line: `ts/actor/task?/model?/tier?/outcome/summary/session_url?`); `lib/ops/run-log.mjs` (`appendRun(entry, opts?)` validates required `ts/actor/outcome/summary` and throws naming every missing field before writing anything, `readRuns(limit?, opts?)` parses tolerant of bad lines and returns newest-first by `ts` with later-appended-wins tie-break; both accept a `{ path }` override so tests never touch the committed file); `scripts/log-run.mjs` (thin CLI, stamps `ts` at post-time, `--help` exits 0); `RunsPanel.tsx` on `/ops` (build-time `import.meta.glob('...docs/ops/run-log.jsonl', { query: '?raw' })` — identical idiom to `agentic-os/data.ts`'s routing-log read — parsed via the existing shared `parseJsonlLines` from `src/app/lib/jsonl.ts` rather than a third bespoke JSONL parser; renders newest 15, tone-colored outcome `Badge`, empty-state points at the CLI). Wired into `AgenticOSPage.tsx` as a visible `Section` (not a collapsed `Disclosure` — this is the "glance and know" surface, the #1 stated time-eater) right after the KPI/pillar row. CLAUDE.md §2 gets a 5th protocol step: autonomous sub-agents/sessions post a recap via `log-run.mjs`/`appendRun` before ending. **Seeded with 13 real entries** for this session's completed runs (the 11 burn-down issues #28/#16/#17/#29/#12/#11/#36/#37/#14/#4/#39, task-importer Slice 1, and this run-log unit itself) spread across 2026-07-07 — panel isn't empty on day 1. **Verified:** `--help` exits 0; smoke-appended + removed a test line; `pnpm typecheck` + `pnpm typecheck:api` both clean; `pnpm lint --max-warnings=0` 0/0; `pnpm exec vite build` green (confirmed the seed summaries are present in the built `AgenticOSPage` chunk); `pnpm exec vitest run` 308/308 (14 new: `run-log.test.mjs` covering `validateRunEntry`/`appendRun`/`readRuns` incl. malformed-line tolerance and tie-breaking); `api/*.ts` count unchanged at **11/12** (no new function, no migration); route-coverage OK; 16/16 layout-integrity routes green via a temp Playwright config (`executablePath` pinned to the sandbox Chromium, deleted after) — `/ops` re-verified with the Runs panel rendered. **Deferred:** the approvals-inbox half of #8 — needs #9 outreach to give it real content to review; not started.
- 2026-07-07 (task-importer Slice 1 — #8/#13 foundation): `upsertTasks(sb, rows)` re-added to `lib/supabase/tasks.mjs` (upsert on `key`, mirrors `upsertLeads`'s style — dropped in the 2026-07-06 BACKLOG.md retirement, needed again for the GitHub-issues source); new pure mapper `lib/tasks/import-issues.mjs` (`mapIssuesToTasks`: issue → `key='github:<owner>/<repo>#<number>'`, `source='github:<owner>/<repo>'`, `lane=<repo name>`, `group='Internal'`, `status='open'`, `dispatch_url=<issue url>` — unit-tested with no network/DB). `api/tasks.ts` restructured to a single default export that dispatches on `req.method`: GET (unchanged, list) and a new POST (import — `gh.listOpenIssues()` → `mapIssuesToTasks` → `upsertTasks`, returns `{ imported: n }`), composing two separately-`withOpsHandler`-wrapped inner handlers rather than duplicating the auth/method/500-backstop logic — kept the Hobby-plan function count at **11/12** (no new `api/*.ts` file). **`OPS_AGENT_KEY` machine auth**: `checkAgentKey(req)` in `lib/ops-auth.mjs` reads `Authorization: Bearer <token>`, constant-time-compares against `process.env.OPS_AGENT_KEY` (same hash-to-fixed-length pattern as `checkPassword`), false when the env var is unset; `requireOpsAuth` now `verifySession(cookie) || checkAgentKey(req)` so a valid agent key grants the same access as a logged-in operator — lets headless agents call the hub without a browser session. `/ops/tasks` gets source filter chips derived dynamically from the loaded tasks' distinct `source` values (replacing the old hardcoded tracker/backlog/client set, which no longer matches a `github:*`-sourced world) plus an "Import GitHub issues" button (POSTs `/api/tasks`, refetches). **Verified:** typecheck clean, `pnpm lint --max-warnings=0` 0/0, `vite build` green, 294/294 vitest green (13 new: 2 `upsertTasks`, 3 `mapIssuesToTasks`, 5 `checkAgentKey`/`requireOpsAuth`, `api/tasks.ts` covered indirectly via the repo/importer units), `/ops/tasks` layout-integrity passes (temp Playwright config, deleted after). `typecheck:api`'s one failure (`api/portal-verify.ts` TS4111) is pre-existing, confirmed via `git stash` — not touched by this unit. **Deferred to Slice 2+:** autonomy dial (`auto-ok` self-dispatch), broadcast tasks (fan-out to `all repos`), per-task budgets/auto-halt/run-log recaps, Projects→Tasks link — see Next queue item 2 for the full list. Not yet exercised against prod Supabase/GitHub (both env vars set but this exact path unverified live).
- 2026-07-07 (issue burn-down — 11 closed): grind of the open ops issues. **#28** portal server-auth, **#16** prod offline-copy (dev-only message no longer leaks to prod), **#17** orchestration-era dead-code sweep, **#29** daily-review Slice 1 (`scripts/daily-review.mjs` → findings.jsonl + digest), **#12** spend-safe lead-sweep presets on `/ops/leads`, **#11** `deploy-alert.mjs`, **#36** `do_not_contact` suppression wired into `upsertLeads` ingest (re-scrapes can't resurrect opt-outs; +4 tests), **#37** retention purge code-complete, **#14** collision policy (already in CLAUDE.md §3), **#4** plan/PR-artifact convention (CLAUDE.md §1), **#39** inherited-lint-debt cleared. All pushed to `main`, each verified typecheck/lint-0-0/build/tests. **Parked with reasons** (need Adrian): **#8** approvals inbox (its data source, the Hermes bridge, is dead — needs the task-importer + `OPS_AGENT_KEY`); **#13** tier→model (same task-importer dependency); **#3** Playwright MCP (`.mcp.json` write blocked by self-mod guard → run `claude mcp add playwright --scope project`); **#32** `.env.example` (blocked by CLAUDE.md hard rule — Adrian adds it); **#9** outreach (needs email provider + #8); **#7** (needs `ANTHROPIC_API_KEY` + prompt changes want live eval); **#5** blast-radius (dev-tooling — NORTH_STAR drift, hook-wiring blocked by self-mod guard); **#35/#38** legal; **#18/#27/#33** human/Vercel/force-push; **#19/#20** cross-repo. Migrations 0006/0007 still need applying for #36 suppression + #37 purge to function in prod.
- 2026-07-07 (#11 deploy/blocked alert check — manual trigger, not cron): `scripts/deploy-alert.mjs` diffs live fleet state against a committed baseline and alerts only on a NEW transition. Reuses the existing `/ops/projects` sources as-is — `lib/projects/index.mjs`'s `listProjects()` (Vercel deploy states, `VERCEL_TOKEN`) and `attachRepoStatuses()` (per-repo root `status.json` `blocked[]`, `GITHUB_TOKEN`) — zero reimplementation of either fetch. State: `docs/ops/deploy-snapshot.json` (per-project last deploy state + per-repo blocked set) + append-only `docs/ops/alert-log.jsonl`. Alerts fire only on deploy state → `ERROR` or a newly-added `blocked[]` entry that wasn't already alerted; clearing either is an info line. Fixed a real bug caught in testing: `buildSnapshot` was resetting a repo's `blocked` set to `[]` whenever `repoStatus` came back null (GITHUB_TOKEN unset/expired that run) — would have caused false "newly blocked" alerts once the token started working again; now carries forward the last-known blocked state instead. Delivery: always stdout; POSTs to `DISCORD_WEBHOOK_URL` if set; email is a documented follow-up (needs a transactional-email provider + key — not built). Named `deploy-alert.mjs` (not `check-*`) deliberately so it's an ops tool, not a guardrail-registry gate — `validate-guardrail-registry.mjs` confirms it doesn't need registration. **Live-call note:** in this sandbox, Vercel calls work end-to-end (confirmed against real fleet state — `hirobius-design-system` really is mid-ERROR right now, which is the baseline the committed snapshot now reflects); the GitHub contents API 403s here ("GitHub access is not enabled for this session") — a sandbox/proxy restriction, not a code bug — so blocked-transition diff logic was verified by direct fixture calls to the exported `computeDiff`/`buildSnapshot` (ERROR transition, newly-blocked, already-alerted suppression, clearing→info, and the token-outage carry-forward all pass) plus a live `--dry-run` integration test against a synthetic prior-snapshot fixture (correctly reported the real ERROR transition and did not touch the file). **Follow-up, not built (per issue's "do not overbuild"):** a "recent alerts" line on `/ops/projects` — needs a new `api/*.ts` route to read `alert-log.jsonl` (repo-committed file, no DB) plus UI wiring; skipped since it's non-trivial and the Vercel Hobby plan is already at the 12-function cap (see Parked note above). Verified: typecheck clean, lint 0/0, `vite build` green, `validate-guardrail-registry` ✓, `--help` exits 0, `--dry-run` fixture tests as above (exit 2 when alerts present, 0 when none, snapshot untouched either way).
- 2026-07-07 (#12 lead-sweep manual-trigger affordances, spend-safe): `/ops/leads` gets a saved-sweep selector (`LeadSweepPanel.tsx`) — pick a preset from `scripts/lib/query-presets.mjs` (fencing/tree-service/septic/pressure-washing/concrete-coating/excavation/welding/well-drilling/masonry, all -wa), preview expands into niche×metro pairs as a de-selectable checklist with a live record estimate ("N of 500 monthly free tier"), a configurable hard cap (default 120/run), and an explicit confirm step before anything fires — "Run selected" then POSTs `/api/pull-leads` sequentially (one `{niche, metro, count}` per pair) with a progress bar + Stop control. Kept DRY: new browser-safe `sweepPresets.ts` imports `PRESETS`/`PRESET_NAMES` straight from `scripts/lib/query-presets.mjs` (pure ESM data, no Node-only APIs, so Vite bundles the cross-`src/`-boundary import fine — verified in `dist/`) rather than duplicating the matrix; only the pair-expansion/estimate/sampling helpers (UI-only) live in the new file. Digest refresh's half of #12 is the trigger-phrase doc line above ("scrub my newsletters") — no Gmail integration built, per the issue's own scope (documented phrase, not code). Verified: typecheck clean, lint 0/0, `vite build` green (confirmed preset data present in the built `LeadsPage` chunk), `query-presets.test.mjs` 6/6, 16/16 layout-integrity routes green (`/ops/leads` re-verified with the sweep panel rendered — no new route). Preset-select fires zero requests (traced: `handlePresetChange` only calls pure `expandPresetPairs`/`sampleBounded`) — real Outscraper calls were not exercised; spend stays on hold pending Adrian's go.
- 2026-07-07 (#17 orchestration-era dead-code sweep): audited the issue's survivor list against current `main` and found the routed pages (`BuildPage`, `BriefingPage`, the Hermes/Dispatcher Kanban) and their routes were **already gone** — a prior "adopt cleaned dashboard" rewrite (`662d94c`) superseded them before #17 was ever filed against this line of `main` (the commits literally titled "(#17)" that showed up in `git log --all` live on an abandoned, never-merged parallel branch, `origin/claude/relaxed-ramanujan-vvhqf8`, diverged since commit #2 — irrelevant to this timeline). What _was_ real: `src/app/pages/ops/agentic-os/data.ts` still eagerly read + exported five orphaned aggregates with zero live callers — `computeStaleClaims`/`STALE_CLAIM_HOURS`/`StaleClaim` (a dead watchdog-style stale-claim mirror), `PROPOSED_UNITS`/`dedupedProposals`/`ProposedUnit` (a never-rendered agent-proposal inbox, plus its `docs/ai/proposed-units.jsonl` glob read), and `loadStrength`/`StrengthSnapshot`/`StrengthHistoryPoint` (a duplicate of the guardrail-strength read `atlas/strength-tab.tsx` already does itself) — plus the now-orphaned `fmtAge` formatter. Deleted all of it (~110 lines) and un-exported `parseJsonl`/`RoutingEntry`, which are still used internally for the live cost-burn KPI. Confirmed `atlas/` (routes-tree, clients-tab, validators-tab, strength-tab) and `SurfacesRail` are current, live, actively-imported surfaces, not orchestration leftovers — despite sharing a directory name with the issue's now-nonexistent `pipeline-dag.tsx`. No NaN%/divide-by-zero found in any surviving surface. **Verified:** typecheck clean, lint 0/0, `vite build` green, 16/16 layout-integrity routes green, 278/278 unit tests green, route-coverage OK, knip unused-exports 10→1 and unused-exported-types 31→26. Left 3 unrelated knip "unused files" alone (`prospectTypes.ts` is live WIP for _this_ branch's Outscraper pipeline; `useIsMobile.ts`/`entry-server.tsx` are unrelated general infra) — out of #17's scope.
- 2026-07-07 (guardrail hygiene — ops vs DS gates, #39): ops inherited the **entire DS-repo guardrail apparatus** (43 gates + husky hooks + `check:full`), so DS-authoring gates ran on every commit/push — `check-contrast` **crashed** on the absent `hirobius.tokens.json`, forcing habitual `--no-verify` (which also skipped the gates that matter). Fixed the gate layer: **pre-push** slimmed to `typecheck`+`test` (dropped `check:full`/`test:a11y`/HDS-heal/foundation-parity); **10 DS-authoring gates reclassified pre-commit→manual** (contrast, focus-states, code-connect, frozen-demos, doc-structure, registry, reduced-motion, motion, attributions, audit-tiers); fixed pre-existing rot (stale precommit hash refreshed, dead `check-unit-overlap` entry removed, unregistered `audit-sites` registered as manual, `lint` script's removed `validators/` dir dropped). Pre-commit **26→16 gates, all green** (`run-gates`/`validate-guardrail-registry`/`check-validator-wiring`/`fixture-proof` all ✓). Commit `806e25f`. **Then cleared the lint debt** (commit `b0a450c`): 11 errors + 29 warnings → **0/0**; deleted 5 dead DS-carryover scripts (run-canon-fixtures, test-retry-loop, auth-middleware, generate-llms-txt, sync-system-health) + their package.json entries, fixed `usePoll.ts` react-hooks + unused vars, per-rule import fixes. `git commit`/`git push` now run clean **locally** without `--no-verify` (pre-push = typecheck+test, verified green on 3 pushes). **Web-session caveat (#39):** `editorconfig-checker` in pre-commit **403s** downloading its Go binary in the sandbox egress → web-session commits still need `--no-verify` until that binary is vendored or the step moves to CI. Remaining #39 follow-ups: `check:full` vestigial/crashes, gitleaks silently disabled, orchestration gates are Hermes heritage.
- 2026-07-07 (#28 portal server-auth): moved the `/c/:slug?token=…` client-portal gate **server-side**, closing the same class of hole `/ops` had — the old `src/lib/portal-token.ts` verified tokens **in the browser** using `VITE_PORTAL_HMAC_SECRET`, which Vite inlines into the static bundle (anyone could read it and mint a token for any slug). New `lib/portal-auth.mjs` (mirrors `lib/ops-auth.mjs`) + raw handler `api/portal-verify.ts` (GET ?slug checks the httpOnly `portal_session` cookie, POST {slug,token} verifies with server-only `PORTAL_HMAC_SECRET` and sets a slug-scoped cookie); `ClientPortalPage.tsx` `useTokenAuth` rewritten to round-trip the server (DEV_BYPASS in dev, same as OpsGate); deleted `portal-token.ts` (client secret/verifier gone from the bundle — grep of `dist/` confirms). **Token scheme byte-identical**, so every link already handed to a client keeps working. api fns 10→11 (≤12). 288 tests green (10 new in `portal-auth.test.mjs`) + typecheck + 16/16 layout (incl `/c/lilac-insure`) + `dist/` clean of the secret. **Human-gated (Adrian):** set `PORTAL_HMAC_SECRET` in Vercel (Prod+Preview) to the SAME value as the current `VITE_PORTAL_HMAC_SECRET`, redeploy, then the old `VITE_PORTAL_HMAC_SECRET` can be removed.
- 2026-07-07 (prospecting Run 01 + 3rd scorer + compliance + prompts): first live Outscraper runs — **Run 01: 249 WA-trade leads, 25 qualified** (all no-site; 90% of scraped businesses already on custom sites). **Key learnings** (`docs/prospecting/run-log.md`): Spokane+Olympia yield ~4× Seattle; excavation/tree/pressure-washing beat fencing (which ranked #1 in theory, worst in practice). Built the **site-quality/redesign-need 3rd scorer** (`scripts/lib/site-audit.mjs` + `audit-sites.mjs` via PageSpeed — arbitrary-domain fetch is blocked by the egress allowlist, so Google fetches server-side; migration 0006) to mine the 223 custom-site leads for bad-site redesign targets at **zero Outscraper cost**. Added `--max-records` budget cap, underserved-trade presets (excavation/welding/well-drilling/masonry), `prospect-stats.mjs` analytics. **Compliance pass** filed #35–#38 + `docs/prospecting/compliance.md` + migration 0007 (lifecycle + `do_not_contact`) + `purge-stale-leads.mjs` (12-mo retention). **Fable prompt library** in `docs/prompts/`. Realtors dropped (avoid niche + data lost). **Human-gated next:** create `PAGESPEED_API_KEY`, apply migrations 0006/0007 → then I run the 223-lead site-audit. **Outscraper spend on hold** (Adrian) until bad-site thesis validated. 268 tests green.
- 2026-07-06 (prospecting pipeline landed + bug cleanups): closed #25 (discord-bot `getOrchSummary`/bridge dead refs) and #26 (orphaned `dispatchState` write) in `e8843a6`; filed #30 (Discord→ops workflow, low-pri). Landed the **Outscraper→Supabase prospecting pipeline (#21)** onto `main` (`0f7daba`) off the ephemeral `claude/prospect-to-site` branch (canonical superset of `nwrktj`) — 5 scripts + `prospectTypes.ts` + 4 vitest specs + `docs/prospecting/*`; migration renumbered `0004_lead_score`→**`0005`** (0004 taken by tasks_dispatch_url), 2 specs converted node:test→vitest. Verified 262/262 vitest + typecheck + build + a live fixture dry-run (5 scored rows to `0005` columns, no DB/API). **#21 still blocked on Adrian:** Supabase env (`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`) + apply migrations `0001`/`0002`/`0005`, then a first live run. Stale branches to prune later: `claude/prospect-to-site`, `claude/outscraper-prospecting-pipeline-nwrktj` (both now landed).
- 2026-07-06 (cross-repo backlog handoff finished): DS accessibility idea (`12v-token-system-modes`) recorded on DS #80; Concrete repo `hirobius/concrete` exists + was already bootstrapped (issues #1–#4: brand hexes, catalog data, tenant tooling, launch prereqs) — its catalog model + Stripe checkout are already built, so only the two genuine gaps were filed: **concrete#5** (WA legal pages) + **concrete#6** (AI content-repurpose, post-launch). BACKLOG.md is now fully drained into per-repo Issues across ops/DS/portfolio/concrete.
- 2026-07-06 (BACKLOG.md retired): removed the local-backlog seeding path now that GitHub Issues are the source of truth — deleted `BACKLOG.md`, `scripts/gen-backlog-tasks.mjs`, `lib/tasks/backlog.mjs`, the generated `backlog.tasks.mjs`, `api/tasks-import.ts`; unwired `ensure-ops-data` + dropped `upsertTasks` + the `/ops/tasks` "import backlog" button (tab keeps Supabase tasks + dispatch). typecheck + build green. Handoff verified clean first: DS items already migrated to DS repo #80 (+ #56); portfolio backlog items were stale (old Vite portfolio, not the current Next.js `hirobius/portfolio` — its own issues #1–#9 stand); Concrete's 5 items wait on the repo #19 stands up; ops survivors are #25–#29. Loose end tracked on #25: the Discord bot's `!status`/`!recent` + roadmap-data/llms-txt still referenced BACKLOG.md (degrade to empty, build unaffected).
- 2026-07-06 (production live + issues board + backlog triage): got the ops dashboard onto **PRODUCTION** (`main`) — fixed the SPA/prerender 404, moved DS to public npm `@0.11`, sanitized `SUPABASE_URL`, added `dispatch_url` migration 0004, actionable `GITHUB_TOKEN` failure messaging, one-click backlog import. Shipped **`/ops/issues`** (cross-repo GitHub Issues board; `api/issues.ts` server-side token; typecheck + build + 16/16 layout tests green). **Triaged all 76 BACKLOG.md items** against the 19 existing issues (#3–#22) + repo state: most are already-an-issue, done (ops-production-go-live, client-facing-portal-route, 13z-7-scripts-prune), stale/removed-surface (atlas/kanban/build/staging/knowledge/hermes-era), or belong in other repos (portfolio ×7, concrete ×8 → anchored by #19, HDS/DS ×10 → #20 anchors gates). Filed the 5 surviving ops-repo items as issues **#25** (discord-bot getOrchSummary/bridge bugs), **#26** (dispatchState dead-end), **#27** (PII git-history rewrite), **#28** (portal server-auth), **#29** (agentic review-loop Slice 1). Other-repo items handed to Adrian as paste-ready blocks (session scope is `hirobius/ops` only — can't write cross-repo). BACKLOG.md recommended for retirement now that Issues are the source of truth.
- 2026-07-02 (client repos): added the "New client-work repo procedure" above — reusable prompt for standing up a private, Hirobius-owned client-work repo from a project + `tasks.json` (status.json + fleet pointer + tasks→issues with an `internal` label; handoff = curated deliverable, never the repo). First use: hirobius/lilac-insure (Lilac Insure / Conrad). Client-data model settled: PII + internal data live in the private work repo or Supabase — never git-committed anywhere client-facing. The ops-history PII scrub (clients/{lilac-insure,prospect-001,the-ranch-foundation}, docs/ai/routing-log.jsonl) is scoped + dry-run-verified; filter-repo runbook handed to Adrian to force-push (ops is private, so hygiene not exposure).
- 2026-07-02 (architecture scrub + cleanup): 5-agent scrub (findings in `docs/ai/ARCHITECTURE_SCRUB_2026-07-02.md`), then shipped Tier 1 + Tier 2 in 8 verified batches — T1a dead post-commit step + 3 ENOENT /ops skill buttons · T1b failing CI build:lib/size-limit · T1c decoupled /ops dashboard from the 52-day frozen archive (also dropped a 1 MB bundle chunk) · T1d strength-report lies · T2a 6 dead deps + three · T2b 8 dead scripts · T2c 6 dead src files + 4 orphan tests · T2d api/ops-logout (→9 fns) + ALL_ROUTES ~60→23. ~30 dead files/deps gone, CI unbroken, no regressions, all 8 deploys READY. **Deferred (still open):** Tier 3 (duplicate/orchestration-era scripts), Tier 4 (doc identity: CLAUDE.md routes to retired docs; README/AGENTS "HDS product" vs NORTH_STAR agency-platform), the T1b package.json exports/check-public-api untangle, and the 2 `.ps1` files (held — possible personal tooling; Adrian to confirm). Discord always-on/fleet-aware filed as #15. **Next real work: HDS cutover** on the survivor list (PageHeader first — used by 16/17 pages).
- 2026-07-02 (fleet hub LIVE — end of the deploy saga): after the function-cap fix, three more blockers fell in sequence — (a) `/ops` login gate needed `OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` (never in the keys list); (b) env vars only bind on a NEW feature-branch build (dashboard "Redeploy" re-runs stale `main`, which fails `invalid_engines_value`); (c) every guarded route imported `'../lib/api/handler'` extensionless → `ERR_MODULE_NOT_FOUND` at ESM runtime (typecheck-green, 500 live). All fixed. `/ops/projects` now renders all 10 repos + their status.json; `VERCEL_TOKEN` + `GITHUB_TOKEN` verified active. Login works. Preview is the live hub.
- 2026-07-02 (deploy fix 2): the 38de046 deploy cleared the typecheck but then hit `exceeded_serverless_functions_per_deployment` (Hobby cap 12, we had 13). Consolidated the 4 lead-lifecycle routes (generate/build/publish/render-site) into one `api/lead-action.ts` POST dispatcher → 10 functions. Repointed LeadsPage callers + the dev middleware (scripts/leads-middleware.mjs, one `action` handler) + vite.config wiring. Added `pnpm typecheck:api` (tsconfig.api-check.json) as the real deploy-parity gate + fixed 7 pre-existing TS4111 so it's fully green. 41 api tests green, app build green.
- 2026-07-02 (deploy fix): branch had been ERROR-deploying for 7 commits (since d454856 /ops/projects) — Vercel type-checks api/\*.ts functions and `@vercel/node`/`@types/node` were missing. Installed both; function typecheck now 0 blocking errors, app build green. This is why the preview looked stale + env vars weren't taking effect.
- 2026-07-02 (newsletter sweep): mined all 10 "The Code" editions (Jun 18–Jul 1) → filed ops issues #3–#7 (Playwright MCP self-verify · HTML plans/PR artifacts convention · blast-radius pre-edit hook · CLAUDE.md diet per Anthropic steering guide · lib/agent Sonnet-5 tiering + prompt audit). Judgment calls (cheap-model routing, observability, importer autonomy dial) parked pending Adrian.
- 2026-07-02 (later): fleet-status layer — per-repo root status.json rendered on /ops/projects (token-gated, TTL-cached) · combined one-shot onboarding prompt (tasks + status + pointer) · HANDOFF.md system + CLAUDE.md routing repointed off the retired night-shift loop.
- 2026-07-02: /ops/projects + /api/projects (fleet hub v1) · /ops/digest + first digest · Outscraper lead-gen · vendored agent+schema · render seam + /api/render-site · Astro decision recorded + cutover plan · script INDEX (#13-15) · architecture review #1-12 shipped.
