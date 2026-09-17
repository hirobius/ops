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

- **📞 First-contact stack (#326).** All outbound routes through one choke
  point, `lib/outreach/guard.mjs`. **The lesson that still steers:** a scoring
  ceiling (59 vs a threshold of 60) made custom-domain leads permanently
  unqualifiable, and the weighting ranked the _hardest_ sells highest. A Wix
  site is a **proven buyer**; a decade with no site is a revealed preference.

- **📞 `/ops/pitch` — the call sheet; `0012`/`0013`/`0014` ARE applied.** The
  #348 warning that `pitch_queue` is missing is wrong — it is a filename, not a
  table; `lead_notes` is what `0012` creates and it exists. (`digest_items`,
  `0011`, IS absent despite #78 being closed.) Only pitchable leads appear
  (`preview_url` present, `do_not_contact` false), re-checked on every write.
  Marking pitched stamps `contacted_at` + `contact_channel` — the evidence #321
  needs. Notes live in the `lead_notes` TABLE, never a column. Not a CRM.
- **🪟 `/ops/standing` is the ONLY fleet surface.** Chain, waiting-on-you, in
  flight, queue, backlog, deploys. `/ops/tasks` + `/ops/projects` redirect here.
  Its actions write labels straight to GitHub, bypassing the Supabase mirror on
  purpose — Standing lists repos the importer never touched. Stage 5 reports
  **stored vs live** `preview_url`s (#322); unreachable reads `unchecked`, never
  `dead` — the usual cause is our egress, not the site.
- **🎯 Revenue path is merged, unrun.** The generator takes real hours, address,
  photos and a contrast-checked palette. Spec: `docs/specs/leads-to-site.md`.
  Doctrine finding that still steers: **we have the machinery and mis-aim it.**
- **PRODUCTION is LIVE** — `hirobius-ops` deploys from `main`; `/ops` is password
  gated (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET`); Supabase wired; DS from npm.
  Vercel **Pro**; preview Deployment Protection off (the `/ops` gate covers it).
- **FULL-AUTO since 2026-09-16.** Every `ralph-ready` issue carries
  `ralph-auto` (#349 merged unattended). `ralph-gate` is the
  **sole required check**. **One unapproved `ralph/*` PR halts the queue and
  `ralph.yml` then no-ops in ~12s — fast-green runs are the wedge signature, not
  progress. Check open PRs BEFORE the run list** (`ralph-watchdog.mjs`).
- **Compliance gates SCALED outreach** (#35 → #38 → #27 before #9); one call or
  one manual email is not gated. **Outscraper spend (#190) stays ON HOLD**
  pending Adrian's go.
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
  fuel**: `.changeset/` is empty so no "Version Packages" PR can open, and
  `NPM_TOKEN` is unverified. Cutting it means the breaking `Hds*`→unprefixed
  renames plus an ops migration across ~41 files. No agent writes the changeset.
- **Run the client onboarding prompt** → stands up the client repo to fleet
  spec + files its tasks.
- **File the Alert Figma-drift issue** in the DS repo (not ops): tone-colored
  title + border, danger→`circle-alert`; node 33:34.
- **Run the ops-history PII scrub** — runbook in `REPO-PROCEDURES.md`; hygiene,
  not urgency.
- **Remove `PORTAL_HMAC_SECRET` + `VITE_PORTAL_HMAC_SECRET` from Vercel** —
  nothing reads either var since the in-ops portal moved to `portal-kit`.

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
2. **#348 — apply `0011_digest_items` ONLY. Needs Adrian (writes production).**
   Its `pitch_queue` half is wrong: **that is a FILENAME, not a table**, and all
   six objects `0012` creates are verified live (corrected on the issue).
   `digest_items` IS absent, so #78's criteria are unmet. Ledger repairs for
   0010/0012/0013 stand; `check-migration-ledger` is the highest-value box.
3. **Guardrail follow-through:** #330 (gate telemetry structurally unfillable)
   **carries `ralph-wip` — the loop holds it.** #329 landed in #349. Then
   `reconcile-ralph-closures.mjs --apply` with a real `GITHUB_TOKEN`.
4. **Adrian's calls:** #200 (Stripe — no way to take money today) · #306 (curate
   gate severity on _provable_ firing, not firing history) · #303/#302/#296/#238
   (one shared `hirobius/ralph` engine release, not four).
5. **Compliance, to unlock the scaled send:** #35 → #38 → #27, then #9.
6. **Website email crawler — MERGED (#346), never run for real.** It has never
   fetched a trades site (both containers 403 all egress), so hit rate across the
   223 sites is unknown. **Run it where egress works**; expect tuning.
7. **Cutover Part B remainder** — gated on the clients Astro factory.

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
  re-base it after** — single-flight means stranding it halts the queue (#325).
- **2026-09-15: After a squash-merge your branch is dead** (no longer an
  ancestor of `main`). Start the next unit with
  `git fetch origin main && git checkout -B <branch> origin/main`.
- **2026-09-16 (Adrian, verbatim): STOP PROMPTING ABOUT CALLS.** "stop with the
  pressure to dial — I need you to focus on the build." The tooling stays
  (`export-call-list.mjs`, `log-call.mjs`) and `0 contacted` stays a true
  metric — but **no session raises dialling or `0 contacted` as a prompt or
  recommendation.** Answer if asked; never lead with it.
- **2026-09-16: A closed issue is not proof its migration ran.** Verify the
  table/column exists in the live project before closing — #78 closed with its
  table absent (#348).
- **2026-09-16: Fixture tests do not prove an extractor works.** Run the real
  path against any reachable live host first (check the proxy's `noProxy`
  list); 28 fixtures missed what one live fetch caught (#346).

## Standing rules (never violate)

Keys are set by Adrian only (never read/write `.env*`). Never `git push` to
main; feature branch only. Never run deploys or `pnpm check:release`. Update
this file before ending a work session.
