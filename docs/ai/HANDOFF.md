# HANDOFF — the one document

> **Point the next agent here. Nothing else.** A session given "continue",
> "status" or "go" reads this and acts from **Next**; a session that does real
> work updates it before ending. "Put it in the handoff" means this file.

_Last updated: 2026-09-16._

## The map (what else exists, and when to open it)

Everything below is **on-demand**. You do not need any of it to start work —
open one only when the task in hand calls for it.

| File                   | Open it when                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------- |
| `SESSION-BOARD.md`     | Another session may be running. Claim your subsystem there first.                                  |
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

- **📞 First-contact stack (#326).** Everything outbound routes through the one
  choke point `lib/outreach/guard.mjs`; `--rehearse` on `push-outreach.mjs`;
  call channel via `export-call-list.mjs` + `log-call.mjs`.
  **The lesson that still steers:** a scoring ceiling (4+30+10+15 = **59** vs a
  threshold of **60**) made custom-domain leads permanently unqualifiable and
  silently orphaned the redesign play; the weighting also ranked the _hardest_
  sells highest. A Wix site is a **proven buyer**; a decade with no site is a
  revealed preference.

- **📦 Land before you build.** The constraint is opening work, not capacity —
  a night that started with 4 open PRs and zero merges ended with 11 merged.
- **📞 `/ops/pitch` — the phone call sheet; migrations 0012/0013/0014 applied.**
  Only pitchable leads appear (`preview_url` present, `do_not_contact` false);
  both gates re-check on every write. Marking pitched stamps `contacted_at` +
  `contact_channel` — the evidence #321 needs. Notes live in the `lead_notes`
  TABLE, never a column. Not a CRM.
- **📉 north-star share: `pnpm metric:north-star-share`.** 20% target is
  uncalibrated — retune with `--target` once a few windows exist.

- **🪟 `/ops/standing` is the ONLY fleet surface.** Chain, waiting-on-you, in
  flight, queue, backlog, deploys. `/ops/tasks` + `/ops/projects` redirect here.
  Its actions write labels straight to GitHub, bypassing the Supabase mirror on
  purpose — Standing lists repos the importer never touched.
- **🎯 Revenue path is merged, unrun.** The generator takes real hours, address,
  photos and a contrast-checked palette. Spec: `docs/specs/leads-to-site.md`.
  Doctrine finding that still steers: **we have the machinery and mis-aim it.**
- **PRODUCTION is LIVE** — `hirobius-ops` deploys from `main`; `/ops` password gate
  active (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET`); Supabase wired; DS consumed
  from public npm `@hirobius/design-system`. Vercel is on **Pro**; preview
  Deployment Protection is off (the `/ops` gate still covers it).
- **The loop works and is under-aimed.** `ralph-gate` is the **sole required
  check** — other CI jobs are informational, so `mergeable_state: unstable` is
  still mergeable. Single-flight (one `ralph/*` PR at a time), auto-merge on
  `ralph-auto`, 6h watchdog on. **Keep the ready pool biased to revenue.**
- **#190 is blocked on Adrian's go** for Outscraper details-API spend.
- **Compliance gates SCALED outreach** (#35 → #38 → #27 before #9); one call or
  one manual email is not gated. Outscraper spend stays ON HOLD pending a go.
- **`.github/workflows/*` cannot be pushed by the bot** (no `workflows` scope).
  Route CI/workflow changes through an adr-eng PR — never a Ralph task. Four
  issues (#90/#240/#241/#243) each burned attempts rediscovering this.
- **Publishing stays a human action — it is the billing event.** The engine is
  wired end to end; its narrative lives in `docs/ARCHITECTURE.md`.

## Adrian's open actions (his court — one-time, not blocked on a session)

- **Set `PAGESPEED_API_KEY` in Vercel — highest-leverage unblock open.** Free,
  ~2 min. Anonymous PageSpeed 429s, so `audit-sites.mjs` cannot run and 223 leads
  have no true opening line. Enable
  (https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com),
  create a key (https://console.cloud.google.com/apis/credentials), paste at
  https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables
  Then `node scripts/audit-sites.mjs --presence custom --write`.
- **Decide hds 0.14.0 (hds#199, reopened).** Release path armed but **zero
  fuel**: `.changeset/` has no entries, so no "Version Packages" PR can open, and
  `NPM_TOKEN` is unverified. Cutting it means the breaking `Hds*`→unprefixed
  renames plus an ops migration across ~41 files. No agent writes the changeset.
- **Run the lilac-insure onboarding prompt** → stands up the client repo to fleet
  spec + files its tasks (the "New client-work repo procedure" below is the prompt).
- **File the Alert Figma-drift issue** in the DS repo (not ops): tone-colored
  title + border, danger→`circle-alert`; Figma node 33:34.
- **Run the ops-history PII scrub** — runbook in `docs/ai/REPO-PROCEDURES.md`.
  ops is private, so hygiene not urgency.
- **Set `PORTAL_HMAC_SECRET` in Vercel (#28)** — server-only (NOT `VITE_`-),
  Prod + Preview. **Paste the SAME value `VITE_PORTAL_HMAC_SECRET` holds** so
  existing `/c/:slug?token=…` links keep verifying; then redeploy and delete the
  old `VITE_` one (nothing reads it; it only leaked the secret into the bundle).

## Next (ordered queue)

> Per-issue detail for everything open: `docs/ai/BURNDOWN-GAMEPLAN.md`.

1. **Make calls — `0 contacted` is the computed break** and has been zero since
   the table existed. `node scripts/export-call-list.mjs --limit 100 > calls.csv`
   (261 eligible, 100 queued, 38 with a real opening line). Log every dial,
   no-answers included: `node scripts/log-call.mjs --id <id> --outcome <o>`,
   funnel via `--funnel`. **Outcomes are a closed vocabulary on purpose — 200
   calls logged as free text are anecdotes, not data.** Compliance gates the
   _scaled_ send (#35 → #38 → #27 → #9); one call is not. B2B calls to business
   numbers sit largely outside the national DNC registry — but WA (most of this
   list) needs all-party consent to record.
2. **Guardrail follow-through, unblocked by #325:** #329 (the fixture ratchet
   rewrites its baseline on every run) and #330 (gate telemetry is structurally
   unfillable — a failing pre-commit gate aborts the commit, so post-commit
   never logs it). Then `reconcile-ralph-closures.mjs --apply` with a real
   `GITHUB_TOKEN`, and walk the unpromoted rules.
3. **Adrian's calls:** #200 (Stripe — no way to take money today) · #306 (curate
   gate severity on _provable_ firing, not firing history) · #303/#302/#296/#238
   (one shared `hirobius/ralph` engine release, not four) · the 94-branch prune
   (this session's credential 403s on ref deletion).
4. **Compliance, to unlock the scaled send:** #35 → #38 → #27, then #9.
5. **Website email crawler** — 223 leads have a site, 1 has an address. Claimed
   on the board by the ops burndown session; check before touching.
6. **Cutover Part B remainder** — gated on the clients Astro factory being live.

## Parked / known warts

- **`public/hds-manifest.json` churn**: builds rebake it (sometimes INVALID).
  `git checkout --` it on sight; never commit regens.
- **Vercel:** on Pro (the 12-function cap no longer binds, but fewer is still
  better). Deploy parity + the ESM extension trap: `docs/ai/REPO-PROCEDURES.md`.
- `OPERATOR_BRIEF.md`, the night-shift loop and `orchestration.json` are RETIRED.

## Decisions (dated, newest first)

- **2026-09-16 — HANDOFF holds state, decisions and directives; PR roll-calls
  and metric snapshots go to `DONE-LOG.md`.** The 25KB budget is the binding
  constraint, and shipped-work detail is what crowds it out.
- **2026-09-15 — the call channel is not the email channel.** Email needs an
  address and a `lead_score`; calls need neither and repeat. Notes are a table
  (`lead_notes`), never a column — a column loses the conversation.

Older decisions: `docs/ai/DONE-LOG.md`.

## Fleet directives (broadcast board — a dated line here reaches every repo)

- 2026-07-02: Track work as GitHub Issues; keep root `status.json` fresh at
  session end; cross-repo asks route through the ops hub, never repo→repo.
- **2026-09-15: Claim your subsystem in `SESSION-BOARD.md` before you start**,
  and pre-flight with `gh pr list` + `git log origin/main -5`. Branch-per-session
  prevents overwrites, not duplicated work — three collisions in one day proved
  it.
- **2026-09-15: Before merging to main, check for an in-flight `ralph/*` PR and
  re-base it after.** Single-flight means a merge that strands the loop's PR
  halts the queue — that is what stalled #325.
- **2026-09-15: After your PR squash-merges, your branch is dead.** Squash
  rewrites history, so the branch is no longer an ancestor of `main`. Start the
  next unit with `git fetch origin main && git checkout -B <branch> origin/main`
  — never keep committing to a merged branch.

## Standing rules (never violate)

Keys are set by Adrian only (never read/write `.env*`). Never `git push` to
main; feature branch only. Never run deploys or `pnpm check:release`. Update
this file before ending a work session.
