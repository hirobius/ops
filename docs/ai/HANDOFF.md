# HANDOFF — the one document

> **Point the next agent here. Nothing else.** A session given "continue",
> "status" or "go" reads this and acts from **Next**; a session that does real
> work updates it before ending. "Put it in the handoff" means this file.

_Last updated: 2026-09-15._

## The map (what else exists, and when to open it)

Everything below is **on-demand**. You do not need any of it to start work —
open one only when the task in hand calls for it.

| File                   | Open it when                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `NORTH_STAR.md`        | A request might be scope drift. Adrian owns it; sessions never edit it.                            |
| `PARKED.md`            | Something is deliberately not being worked on, or a tripwire may have fired (`pnpm parked:check`). |
| `FRONTIER-DOCTRINE.md` | You are deciding _how_ to work — specs, gates, metrics.                                            |
| `AGENT_GUIDELINES.md`  | You are dispatching sub-agents.                                                                    |
| `PROMPT_TEMPLATES.md`  | You are writing a prompt for one.                                                                  |
| `REPO-PROCEDURES.md`   | You need a runbook (trigger phrases, release steps).                                               |
| `DONE-LOG.md`          | You need shipped history, or "was this already done?"                                              |
| `../DECISIONS.md`      | You need to know **why** — the four decision records and which is which.                           |
| `BURNDOWN-GAMEPLAN.md` | You want open issues clustered with a plan.                                                        |
| `learned-rules.jsonl`  | Walking the unpromoted rules (`pnpm guardrail:learned-rules`).                                     |
| `../ARCHITECTURE.md`   | The pipeline's narrative. **Not** its status — that's `/ops/standing`.                             |

**Live state is not in a document.** For whether a pipeline stage actually
works, read `/ops/standing`; it derives every verdict from `leads` row counts.
For who to call next, read `/ops/pitch`. A doc that restates either will drift.

`docs/ai/archive/` holds superseded material. It is history, not context — do
not read it to get oriented.

## Now (what is true today)

- **☎️ THE EMAIL CHANNEL CANNOT RUN. 1 lead of 263 has an email address.**
  Not 39 — that was `lead_score` qualification, which never checked for an
  address. Google Business Profile has **no email field**, so no Maps scraper
  (Outscraper, Apify, SerpApi, BrightData) returns one. The enrichment tier
  (Hunter, Apollo, Clay) is built from corporate-domain crawls and covers a
  3-person plumber badly. **Segment problem, not tooling.** Realistic fix:
  crawl the 223 known websites for `mailto:` ourselves. **Phone is the only
  live channel — 260 leads have one.**

- **📞 First-contact stack shipped (#326).** `--rehearse` on
  `push-outreach.mjs` (real provider, real merge data, recipients rewritten to
  you, capped at 3) behind the one choke point `lib/outreach/guard.mjs`; the
  scorer reweight; `rescore-leads.mjs`; the call channel
  (`export-call-list.mjs`, `log-call.mjs`, migrations 0013/0014).
  **Two bugs worth remembering:** a custom-domain lead could never be qualified
  (ceiling 4+30+10+15 = **59** vs threshold **60**), silently orphaning the
  redesign play; and the weighting ranked the _hardest_ sells highest — a Wix
  site is a **proven buyer**, a decade with no site is a revealed preference.

- **📦 2026-09-15 shipped 9 PRs and left the loop clean** (roll-call in
  `DONE-LOG.md`). It started the night with 4 open PRs and zero merges to
  `main`; that inversion was the point. **Land before you build.**
- **📞 `/ops/pitch` is live; migrations 0012/0013/0014 applied** (verified: both
  columns, `lead_notes`, RLS, 3 indexes). A partner can work the list from a
  phone. Marking a lead pitched stamps `contacted_at` + `contact_channel` — the
  evidence #321 needs.
- **📉 north-star share: run `pnpm metric:north-star-share`.** The 20% target
  is uncalibrated — retune with `--target` once a few windows exist.
- **🧹 Docs consolidated** — `docs/ai/` 31 → 16, `docs/` 146 → 122 live. Nothing
  deleted; superseded material is in `docs/archive/`. `docs/DECISIONS.md` indexes
  the four decision records (cite full paths — two unrelated ones read as "ADR 2").

- **📞 `/ops/pitch` — the phone call sheet (#324).** Only pitchable leads appear
  (`preview_url` present, `do_not_contact` false); both gates re-check on every
  write. Marking pitched stamps `contacted_at` + `contact_channel` (#321
  evidence). Stages reuse 0007's `outreach_status`. Notes live in the
  `lead_notes` TABLE, never a column. Not a CRM.

- **🪟 `/ops/standing` is the ONLY fleet surface.** Chain, waiting-on-you, in
  flight, queue, backlog, deploys. `/ops/tasks` + `/ops/projects` redirect here.
  Actions (`queue_on`/`queue_off`/`ralph_requeue`) write labels straight to
  GitHub via `labelIssueDirect`, bypassing the Supabase mirror on purpose —
  Standing lists repos the importer never touched. Queue-from-backlog is the
  direct fix for ops#274's routing finding.
- **🎯 Revenue path is merged, unrun.** The generator takes real hours, address,
  photos and a contrast-checked palette. Spec: `docs/specs/leads-to-site.md`.
  Doctrine finding that still steers: **we have the machinery and mis-aim it.**
- **PRODUCTION is LIVE** — `hirobius-ops` deploys from `main`; `/ops` password gate
  active (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET`); Supabase wired; DS consumed
  from public npm `@hirobius/design-system`. Vercel is on **Pro**; preview
  Deployment Protection is off (the `/ops` gate still covers it).
- **The autonomous loop works and is under-aimed.** `ralph-gate` is the **sole
  required check** on `main` — other CI jobs are informational, so
  `mergeable_state: unstable` is still mergeable. Single-flight (one `ralph/*` PR
  at a time), auto-merge on `ralph-auto`, 6h idle-watchdog cron on. **Keep the
  ready pool non-empty and biased to the revenue path** (doctrine §8).
- **#190 is blocked on Adrian's go** for Outscraper details-API spend.
- **Compliance gates SCALED outreach** (#35 → #38 → #27 before #9); one call or
  one manual email is not gated. Outscraper spend stays ON HOLD pending a go.
- **`.github/workflows/*` cannot be pushed by the bot** (no `workflows` scope).
  Route CI/workflow changes through an adr-eng PR — never a Ralph task. Four
  issues (#90/#240/#241/#243) each burned attempts rediscovering this.
- **Engine wired.** lead-gen wraps Outscraper; generation runs
  enrich → generate → judge; `lib/render` emits `client.config.ts` + deploy
  commands. Publishing stays a human action — it is the billing event.

## Adrian's open actions (his court — one-time, not blocked on a session)

- **Set `PAGESPEED_API_KEY` in Vercel — highest-leverage unblock open.** Free,
  ~2 min. Anonymous PageSpeed returns 429 (shared quota gone), so
  `audit-sites.mjs` cannot run, so 223 leads have no true opening line and stay
  out of email eligibility. Enable the API
  (https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com),
  create a key (https://console.cloud.google.com/apis/credentials), paste as
  `PAGESPEED_API_KEY` at
  https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables
  Then: `node scripts/audit-sites.mjs --presence custom --write`.
- **Decide hds 0.14.0 (hds#199, reopened).** The release path is armed but has
  **zero fuel**: `.changeset/` holds only `README.md` + `config.json`, so no
  "Version Packages" PR can ever open, and `NPM_TOKEN` is still unverified (the
  green run never reached the publish step). Cutting 0.14.0 means the breaking
  `Hds*`→unprefixed renames and a coordinated ops migration across ~41 files.
  An agent must NOT write the changeset unilaterally.
- **Run the lilac-insure onboarding prompt** → stands up the client repo to fleet
  spec + files its tasks (the "New client-work repo procedure" below is the prompt).
- **File the Alert Figma-drift issue** in the DS repo (not ops): tone-colored
  title + border, danger→`circle-alert`; Figma node 33:34.
- **Run the ops-history PII scrub** — `git filter-repo` runbook (dry-run-verified)
  in `docs/ai/REPO-PROCEDURES.md`. ops is private, so this is hygiene not urgency.
- **Set `PORTAL_HMAC_SECRET` in Vercel (#28)** — server-only (NOT `VITE_`-),
  Prod + Preview. **Paste the SAME value `VITE_PORTAL_HMAC_SECRET` holds** so
  existing `/c/:slug?token=…` links keep verifying; then redeploy and delete the
  old `VITE_` one (nothing reads it; it only leaked the secret into the bundle).

## Next (ordered queue)

> Detailed per-issue recommendations for everything open: `docs/ai/BURNDOWN-GAMEPLAN.md`.

> **Read this before starting anything.** On 2026-09-15 the open-PR count reached
> six while `main` moved zero times, and the lead funnel still reads
> `0 contacted`. The failure mode is not capacity — it is that sessions keep
> opening work instead of landing it. **Land before you build.**

1. **Merge #326, then make calls.** #316/#320/#323/#324 all landed 2026-09-15;
   #326 is the last one open. Then:
   `node scripts/export-call-list.mjs --limit 100 > calls.csv` — 261 eligible,
   100 queued, 38 with a real opening line. Log every dial, including
   no-answers: `node scripts/log-call.mjs --id <id> --outcome <outcome>`,
   funnel via `--funnel`. **Outcomes are a closed vocabulary on purpose — 200
   calls logged as free text are anecdotes, not data.**
2. **Contact one lead.** `0 contacted` is the computed break and has been zero
   since the table existed. Compliance gates the _scaled_ send
   (#35 → #38 → #27 → #9); **one call, or one manual email, is not gated by any
   of that.** B2B calls to business numbers sit largely outside the national DNC
   registry — but WA (most of this list) needs all-party consent to record.
3. **Adrian's calls, unblocking real work:** #200 (Stripe — there is no way to
   take money today) · #306 (curate gate severity) · #303 / #302 / #296 / #238
   (one shared `hirobius/ralph` engine release, not four).
4. **Compliance, to unlock the scaled send:** #35 → #38 → #27, then #9.
5. **Guardrail follow-through:** `reconcile-ralph-closures.mjs --apply` once with
   a real `GITHUB_TOKEN`; then walk the unpromoted rules (wants #300 first).
6. **Cutover Part B remainder** — gated on the clients Astro factory being live.

## Parked / known warts

- **`public/hds-manifest.json` churn**: container builds rebake it (sometimes
  INVALID). Standing order: `git checkout --` it on sight; never commit regens.
- **Vercel deploy parity + the ESM extension trap:** see `docs/ai/REPO-PROCEDURES.md`.
- **Vercel is on Pro** — the Hobby 12-function cap no longer binds, but keep
  consolidating `api/*.ts`; cold starts still favour fewer functions.
- `docs/ai/OPERATOR_BRIEF.md` + night-shift loop + `orchestration.json` are
  RETIRED — do not execute them.

## Decisions (dated, newest first)

> Shipped history: `docs/ai/DONE-LOG.md` · repo runbooks: `docs/ai/REPO-PROCEDURES.md`.

- **2026-09-15 — the call channel is not the email channel.** Email needs an
  address and a `lead_score`; calls need neither and repeat. Two sessions built
  overlapping call tooling the same day and both numbered a migration `0012`;
  reconciled in #326 (renumber + drop the duplicated columns), deferring to
  #324. **Lesson: branch-per-session prevents overwrites, not duplicated work —
  sequence sessions on one pipeline.**
- **2026-09-14 — Frontier-engineering doctrine adopted (ops#274).** Spec per
  epic, path-allowlist auto-merge, enforced steering budget. Kiro's productivity
  metrics **rejected**. Rationale: `docs/ai/FRONTIER-DOCTRINE.md`.

> Older decisions: `docs/ai/DONE-LOG.md`.

## Fleet directives (broadcast board — a dated line here reaches every repo)

- 2026-07-02: Track work as GitHub Issues; keep root `status.json` fresh at
  session end; cross-repo asks route through the ops hub, never repo→repo.

## Standing rules (never violate)

Keys are set by Adrian only (never read/write `.env*`). Never `git push` to
main; feature branch only. Never run deploys or `pnpm check:release`. Update
this file before ending a work session.
