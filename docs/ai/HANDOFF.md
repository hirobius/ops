# HANDOFF — the one document

> **Point the next agent here. Nothing else.** A session given "continue",
> "status" or "go" reads this and acts from **Next**; a session that does real
> work updates it before ending.

_Last updated: 2026-09-24._

## The map (what else exists, and when to open it)

Everything below is **on-demand** — open one only when the task calls for it.

| File                    | Open it when                                                |
| ----------------------- | ----------------------------------------------------------- |
| `SESSION-BOARD.md`      | A session may be running. Claim your subsystem there first. |
| `NORTH_STAR.md`         | A request might be scope drift. Adrian owns it.             |
| `PARKED.md`             | Work deliberately not being done (`pnpm parked:check`).     |
| `FRONTIER-DOCTRINE.md`  | Deciding _how_ to work — specs, gates, metrics.             |
| `AGENT_GUIDELINES.md`   | Dispatching sub-agents (prompts: `PROMPT_TEMPLATES.md`).    |
| `REPO-PROCEDURES.md`    | You need a runbook (releases, the PII-scrub rehearsal).     |
| `DONE-LOG.md`           | Shipped history — "was this already done?"                  |
| `../DECISIONS.md`       | You need to know **why** — the four decision records.       |
| `BURNDOWN-GAMEPLAN.md`  | Open issues, clustered, with a plan.                        |
| `learned-rules.jsonl`   | Walking unpromoted rules (`pnpm guardrail:learned-rules`).  |
| `../ARCHITECTURE.md`    | The pipeline's narrative. **Not** its status.               |
| `../state-of-play.html` | Business picture: the six numbers, blockers, order to work. |

**Live state is not in a document.** Whether a pipeline stage works: read
`/ops/standing`, which derives every verdict from `leads` row counts. Who to
call next: `/ops/pitch`. A doc that restates either will drift.
`docs/ai/archive/` is history, not context — do not read it to get oriented.

## The fleet is SIX repos (all `hirobius/`)

`ops` · `site-engine` · `hds` · `Ralph` · `folio` · `concrete` — **95 open
issues**. `portal-kit` is consumed, not worked. **Anything not in those six is
NOT fleet — never touch it**, whatever it is called (~114 issues of noise).
Allowlist, not a name-list — naming client repos here leaked one.
**`FLEET_REPOS` in `api/tasks.ts` lists only three** — ops#405 replaces it.
**Default is `main` in all six** (2026-09-19) — folio and concrete fixed, so
`Closes #N` no longer no-ops there (ops#407).

## Now (what is true today)

- **☎️ THE EMAIL CHANNEL CANNOT RUN. 1 lead of 263 has an email address.**
  Not 39 — that was `lead_score`, which never checked for an address. Google
  Business Profile has **no email field**, so no Maps scraper returns one.
  **Segment problem, not tooling.** Fix: crawl the 223 sites for `mailto:` (#346).
  **Phone is the only live channel — 260 leads have one**; the funnel reads
  `0 contacted` and per Adrian's directive no session raises dialling.

- **🔒 PII: prevention landed, history not yet purged (#27, p1/sev1,
  `needs-decision`).** `check-pii` runs pre-commit, on the commit message, on
  every PR and main push, and weekly, fleet-wide. The **history rewrite is still
  pending** — rehearsed, runbook in `REPO-PROCEDURES.md`; the cleanup list also
  holds the `refs/pull` copy of ops#388's early commit and the #367/#388 PR
  text. **The gate is only as strong as its denylist**, deliberately out of repo
  (`PII_DENYLIST` secret / gitignored `.pii-denylist`) and not yet created, so
  today it matches generic patterns only — it missed a client tenant's name in a
  PR test fixture.

- **🪟 `/ops/standing` is the ONLY fleet surface** — chain, waiting-on-you, in
  flight, loop health, queue, backlog, deploys; `/ops/tasks` + `/ops/projects`
  redirect here. Phone-operable (#367), repo-filtered on every lane (#388). Its
  actions write labels straight to GitHub, bypassing the Supabase mirror.
  **`listOpenIssues()` returns `{ issues, truncated, fetched }`, not an array**
  — anything branched before #367 that calls it is broken.
  Issues and PRs are fleet-scoped once #405's branch merges.

- **🛡️ CI gates are in place** — full roll-call in `DONE-LOG.md` (2026-09-17).
  The load-bearing one: the watchdog enforces the #238 supervised-path boundary
  on its own merge path; the engine's (Ralph#25) is built, not yet wired.

- **🎨 hds: Figma foundation, nothing shipped** (#211–#216). **Code Connect
  publishing needs Org/Enterprise — Pro cannot**, so no Dev Mode snippet is
  live. **npm is v0.15.0 — verified; hds#199's premise is stale.** ops pins
  `^0.13.0`: a bump in ops, not a broken pipe. Detail: `SESSION-BOARD.md`.

- **📞 `/ops/pitch` — the call sheet.** Only pitchable leads (`preview_url`,
  not `do_not_contact`), re-checked on every write. Notes live in the
  `lead_notes` **table**, never a column. `0012`–`0014` **are applied**;
  `digest_items` (`0011`) is not (#348).
- **🎯 Revenue path is merged, unrun** (`docs/specs/leads-to-site.md`). The
  doctrine finding that steers: **we have the machinery and mis-aim it.**
- **PRODUCTION is LIVE** — `hirobius-ops` deploys from `main`; `/ops` is password
  gated (`OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET`); Supabase wired; DS from
  npm. Vercel **Pro**; preview Deployment Protection off — the gate covers it.
- **AUTO-MERGE IS CONDITIONAL (Adrian, 2026-09-19).** Tag `ralph-auto` only on
  an issue whose DoD names **no** supervised path — the engine's arm has no path
  check (ops#238), so a blanket tag is what let #368 and #362 merge lead-handling
  diffs unreviewed. `ralph-gate` is the **sole required check**. **One unapproved
  `ralph/*` PR halts the queue; `ralph.yml` then no-ops in ~12s — fast-green runs
  are the wedge signature, not progress. Check open PRs BEFORE the run list.**
- **Compliance gates SCALED outreach** (#35 → #38 → #27 before #9); one call or
  one manual email is not. **Outscraper spend (#190) stays ON HOLD.** Publishing
  stays a human action — it is the billing event.

**Done log (latest):** _2026-09-24_ — 29 issues built (hds 19, ops 8, Ralph 2)
on `claude/open-issues-count-1i85qw`, unmerged; list + leftovers in `DONE-LOG.md`.

## Adrian's open actions (his court, not blocked on a session)

- **Restrict sharing on the linked private docs and rotate any credentials in
  them** — one is a "Logins" doc; a gate cannot rotate.
- **hds: tick "Allow GitHub Actions to create and approve pull requests"** at
  https://github.com/hirobius/hds/settings/actions. One checkbox; it is the only
  thing failing `release` (hds#199). ops#346's emails are redacted.
- **Create the `PII_DENYLIST` Actions secret + a gitignored `.pii-denylist`**
  (format in `REPO-PROCEDURES.md`, secret at
  https://github.com/hirobius/ops/settings/secrets/actions). Without it the gate
  checks generic patterns only; the terms that matter are denylist entries.
- **Set the bot host config before the next `git pull`** — `clients/local.json`
  or `DISCORD_DEFAULT_CLIENT`; the client records are moving out of the repo.
- **Work the hds release hold** — token-file descriptions, Satoshi licensing, the
  tenant rename — then decide 0.14.0 (hds#199). No agent writes the changeset.
- **Set `PAGESPEED_API_KEY` in Vercel.** Free, ~2 min. Anonymous PageSpeed 429s,
  so `audit-sites.mjs` cannot run and 223 leads have no true opening line. Enable
  at https://console.cloud.google.com/apis/library/pagespeedonline.googleapis.com,
  key at https://console.cloud.google.com/apis/credentials.
- **Run the client onboarding prompt** → client repo to fleet spec.
- **Remove `PORTAL_HMAC_SECRET` + `VITE_PORTAL_HMAC_SECRET` from Vercel** —
  nothing reads either since the in-ops portal moved to `portal-kit`.

## Next (ordered queue)

0. **Merge `claude/open-issues-count-1i85qw` (ops, hds, Ralph), then close its
   29 issues** — do not rebuild them. Ralph#25/#26 still need the
   `ralph-gate-reusable.yml` wiring (human PR) before ops#402.
1. **Four open ops PRs each wait on a human.** #380: `OPS_AGENT_KEY`. #387:
   migration `0015` + Adrian's import (writes production). #378 (draft): a real
   eval run + `ralph-approved`. #384 (draft): the new hirobius.com.
   **Do not rebuild any — unblock or leave.**
2. **hds:** #210 (draft) blocked on the tenant-rename decision; #207/#208 are
   open and reviewable.
3. **#348 — gate SHIPPED (#392); the rest needs Adrian (writes production).**
   `pnpm migrations:check` with `SUPABASE_ACCESS_TOKEN` finds **7** unrecorded
   migrations, not 2. Apply `0011_digest_items` BEFORE recording it, then
   `--sql`.
4. **Guardrails:** #330 (telemetry structurally unfillable) **carries
   `ralph-wip` — the loop holds it.** Then `reconcile-ralph-closures.mjs
--apply` with a real `GITHUB_TOKEN`.
5. **site-engine#192:** that repo's Ralph loop has had **no scheduled watchdog
   since 2026-07-16** — its `ralph.yml` schedule is off.
6. **Adrian's calls:** #200 (Stripe — no way to take money today) · #303/#302/#296
   (one shared engine release). **#238 is decomposed:** Ralph#25 (engine path
   check) MUST land before ops#402 (flip the default), or the flip deletes the
   revenue-path boundary #375 added. `v1` advanced to `a4f0c21` 2026-09-19.
7. **Compliance, to unlock the scaled send:** #35 → #38 → #27, then #9.
8. **Run the email crawler where egress works** — merged (#346), never run;
   both containers 403 all egress.
9. **Cutover Part B** — gated on the Astro factory.

## Parked / known warts

- **`public/hds-manifest.json` churn**: builds rebake it (sometimes INVALID).
  `git checkout --` it on sight; never commit regens.
- **Vercel:** on Pro — the 12-function cap no longer binds. Deploy parity + the
  ESM extension trap: `REPO-PROCEDURES.md`.
- `OPERATOR_BRIEF.md`, the night-shift loop, `orchestration.json`: RETIRED.

## Decisions (dated, newest first)

- **2026-09-17 — a green merge button is not evidence.** The only required check
  passes non-Ralph PRs untested; run the repo's real gate on the pushed head.
- **2026-09-16 — HANDOFF holds state, decisions and directives; PR roll-calls
  and metric snapshots go to `DONE-LOG.md`**, which is binding under the 25KB
  budget. Older decisions: `DONE-LOG.md`.

## Fleet directives (broadcast board — a dated line here reaches every repo)

- 2026-07-02: Track work as GitHub Issues; keep root `status.json` fresh at
  session end; cross-repo asks route through the ops hub, never repo→repo.
- **2026-09-15: Claim your subsystem in `SESSION-BOARD.md` first**, and
  pre-flight with `gh pr list` + `git log origin/main -5`. Branch-per-session
  prevents overwrites, not duplicated work — three collisions in a day proved
  it. After a squash-merge your branch is dead: `git checkout -B <b> origin/main`.
- **2026-09-15: Before merging to main, check for an in-flight `ralph/*` PR and
  re-base it after** — stranding it halts the single-flight queue (#325).
- **2026-09-16 (Adrian, verbatim): STOP PROMPTING ABOUT CALLS.** "stop with the
  pressure to dial — I need you to focus on the build." The tooling stays and
  `0 contacted` stays a true metric — but **no session raises dialling or
  `0 contacted` as a prompt or recommendation.** Answer if asked; never lead.
- **2026-09-16: A closed issue is not proof its migration ran.** Verify the
  table/column exists in the live project before closing (#348).
- **2026-09-17: A redacted term can come back in a test fixture.** An agent
  writing a gate's tests reaches for a real example, and without the denylist
  the gate cannot catch it. Denylist first, fixtures second.

## Standing rules (never violate)

Keys are Adrian's only (never read/write `.env*`). Never push to `main`. Never
run deploys or `pnpm check:release`. Update this file before ending a session.
