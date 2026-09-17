# PARKED — things deliberately not in the work queue

> **Why this file exists.** An issue tracker should hold work with a _current
> reason to act_. Anything whose reason lies in the future is a reminder, not a
> task — and left as an open issue it costs triage attention on every pass while
> never being actionable. On 2026-09-15 eleven such issues were closed; their
> substance lives here.
>
> **Nothing here is lost.** Every entry names the closed issue that holds the
> full detail, and a **trigger** — the concrete condition that puts it back in
> the queue. `scripts/check-parked-triggers.mjs` evaluates the machine-checkable
> triggers and tells you which have fired.

## How re-entry works

Each entry carries a `trigger:` of one of four kinds:

| Kind    | Format                                                         | Evaluated by              |
| ------- | -------------------------------------------------------------- | ------------------------- |
| `date`  | `date: 2026-12-01`                                             | the script, automatically |
| `path`  | `path: apps/concrete` (fires when the path appears/disappears) | the script, automatically |
| `issue` | `issue: ops#78 closed`                                         | the script, automatically |
| `event` | `event: <plain-English condition>`                             | a human, at review        |

Run `pnpm parked:check` (or `node scripts/check-parked-triggers.mjs`). It exits
non-zero and names any entry whose trigger has fired. Nobody has to remember to
run it: `.github/workflows/parked-triggers.yml` runs it daily, and a fired
trigger fails that scheduled run (GitHub notifies whoever last changed its cron
line) every day until the entry is handled. `event:` triggers can't be
evaluated automatically, so they surface on the **quarterly review** line below —
that review is the backstop that stops this file becoming a graveyard.

**Next quarterly review: 2026-12-15.**

When a trigger fires: **file a fresh issue** citing the parked entry and the
original closed issue, then delete the entry here. Don't reopen the old issue —
its premise is months stale by definition, and today's sweep found stale
premises in six of the issues examined.

**Exception — recurring entries.** An entry with a `- **when it fires:**` line
(the betting table) is a cadence, not a one-shot reminder. Follow that line
instead — usually "roll the date forward" — and keep the entry. The script
prints the line in place of the file-and-delete instruction.

---

## Tripwires — dated, falsifiable, pre-committed

> A tripwire is not work. It is **one measurable condition, one date, and an action
> decided in advance**. It exists so a strategic question gets answered on a date
> instead of drifting. `date:` triggers here fire automatically — daily in CI
> (`parked-triggers.yml`) and on demand via `pnpm parked:check`; the betting
> table (#319) reads that as a standing item.

### Ship tripwire — one lead, one preview_url, one contact

- **origin:** ops#321 (OPEN — this one blocks, it does not default)
- **trigger:** `date: 2026-10-15`
- **condition:** a row in `leads` with `preview_url` non-null and `status = 'rendered'`, whose URL actually loads, produced through the pipeline, and that lead **contacted** about it — `contacted_at` set and `contact_channel` recording how.
- **why not "email":** amended 2026-09-15. Of 39 qualified leads, **1 has an email and 38 have a phone**; the two that already carry a `preview_url` are phone-only. Requiring email would have failed this tripwire for reasons unrelated to the strategy it tests, and getting emails at all means #190 (Outscraper spend) — a purchasing decision. Any channel that reaches a human counts; a phone call tests the demand hypothesis identically.
- **if it fires:** the factory-first sequencing is falsified. Pre-committed action — stop all infrastructure work for one cycle and close the gap manually, hand-building a site if necessary. A hand-built site tests the demand hypothesis identically.
- **if it still can't ship after that cycle:** the § Pivot paths below become live.

### Betting table — next sitting

- **origin:** ops#319 (closed 2026-09-16 — Adrian accepted option C: 3-week cycle + 1-week cooldown)
- **trigger:** `date: 2026-10-14`
- **what it is:** one ~30-minute sitting. Every open `needs-adrian` / `needs-decision` issue gets an answer or "default stands"; pick the next cycle's short list; read #293 (north-star share) and any open `sev1` (#317).
- **cadence:** a table opens each 4-week period (3-week cycle + 1-week cooldown). The 2026-09-16 backlog interview was the first table. This date sits one day before the ship tripwire on purpose.
- **reminder:** the daily `parked-triggers.yml` run goes red on this date and stays red until the date is rolled forward, so the sitting does not depend on anyone remembering.
- **when it fires:** run the table, record decisions on the issues themselves, then roll this date forward 4 weeks (recurring: keep this entry). Do not file an issue for it.

---

## Pivot paths — only if the ship tripwire fails

> Captured 2026-09-15 so the decision isn't invented under pressure. **None of these
> is a reason to abandon the agency now** — the business hypothesis is untested, not
> disproven. They exist because a plan made calmly beats one made in a panic.
>
> The asymmetry that motivates them: **inbound exists for design-system expertise
> (Adrian has been approached about DS roles); zero inbound exists for generated SMB
> sites.** That is the clearest external market signal available.

### Fractional design-system engineering

- **trigger:** `event: the ship tripwire (#321) fires and a manual cycle still produces no sale`
- **the asset:** HDS — 133 public components (Radix + cva), 361 DTCG tokens, 112 Storybook stories, 34 Figma Code Connect mappings, a multi-tenant token overlay schema, token governance + migration docs, ADRs, published to public npm.
- **why it's the strongest path:** most candidates show a component library; this shows a _governed pipeline_. Highest expected value, fastest cash, near-zero build.
- **cheap test available now, no trigger needed:** merge hds#204 so the portfolio repo stops announcing it is stalled, and reply to the existing role approaches purely to learn what they value.

### Publish the guardrail proof-of-firing idea

- **trigger:** `event: an afternoon is free, or the ship tripwire fires`
- **the asset:** `validate-fixture-proof-of-firing` — every gate ships a violating fixture and a passing one, and is run against both. 49 gates registered under a firing-channel taxonomy.
- **why:** "how do you know your CI gates actually catch anything" is a real unsolved problem, and this is a genuinely novel answer. Currently invisible, buried in ops.
- **shape:** one blog post first. If it lands, an OSS library. Not a product.

### Ralph as OSS → consulting pull-through

- **trigger:** `event: the ship tripwire fires, or the guardrail post lands well`
- **the asset:** `hirobius/Ralph` — autonomous issue→PR→merge loop vendored across 3 repos, with ralph-gate, single-flight, claim refs, a parking taxonomy and an idle watchdog.
- **why not a product:** Devin, OpenHands, Cursor agents, Claude Code all compete directly. A solo entrant sells nothing there.
- **why publish anyway:** the differentiator is the **governance**, not the loop — everyone building agent fleets hits exactly those walls. Revenue is indirect, via reputation.

### Writing / teaching the fleet experience

- **trigger:** `event: any of the above is in motion`
- **the asset:** SIGNAL.md, the decision ledgers, `progress.txt`, the 2026-09 retro findings.
- **why:** "I ran an autonomous agent fleet for six months, here is what actually broke" is valuable and almost nobody can write it honestly. Slow burn; feeds the paths above.

---

## Compliance / legal

### Vanta — SOC 2 / continuous compliance monitoring

- **origin:** ops#49 (closed 2026-09-15) — full runbook, cost model, framework comparison
- **trigger:** `event: a named prospect makes a security attestation a condition of signing`
- **why parked:** paid subscription + separate auditor fee + a 3–6 month observation window, committed before any client has asked. The issue's own scope note said not to pull it ahead of first revenue.
- **sequencing note:** do the GitHub org promotion (#48) first — Vanta's GitHub integration monitors org-level controls and is much cleaner against a real org.

---

## Product / tooling

### Digest → Issue promotion pipeline (P2 analyze, P3 sources, P4 Gmail pull)

- **origin:** ops#77 (epic), #79, #80, #81 — all closed 2026-09-15. P1 (#78) **shipped and stays shipped**.
- **trigger:** `event: the manual "scrub my newsletters" pass becomes a proven, recurring bottleneck`
- **why parked:** builds a machine that files _more_ issues, when the measured constraint is decision throughput, not intake. P2 also carries per-analyze LLM spend; P4 needs server-side Gmail OAuth.
- **what already works:** `digest_items` store, `api/digest.ts` + `api/digest-action.ts`, dismiss/restore with a collapsible stash on `DigestPage`.
- **design preserved in #77:** the two-step Analyze→Approve recommendation (vs draft-immediately), and the reused seams (`lib/agent/llm.mjs`, `lib/github/issues.mjs::createIssue`, the 12-Vercel-function ceiling).

### Lead-scoring axes 2-5 (intent, ability to pay, reachability, disqualifiers)

- **origin:** the 2026-09-15 qualification tune (commit `a3f698e`). Axis 1 (presence
  opportunity) shipped; these four are the deliberate remainder. Adrian's call:
  reweight and ship outreach first, add axes once reply data exists to tune against.
- **trigger:** `event: the first real outreach batch has produced reply/bounce data (outreach_status populated on >= 50 leads)`
- **why parked:** every one of these is a guess until a single email has been
  answered. Tuning a five-axis scorer with zero conversion data optimises a model
  against an imagined customer. One axis, one send, then measure.

**Axis 2 — intent (is something happening NOW?).** Need is static; buying is
event-driven. Cheapest signals, best first:

| Signal                              | Source                                       | Cost | Reads as                           |
| ----------------------------------- | -------------------------------------------- | ---- | ---------------------------------- |
| Domain registered, nothing deployed | RDAP                                         | free | decided to have a site, stalled    |
| Site 4xx/5xx or expired TLS         | `scripts/lib/site-audit.mjs` (already built) | free | urgent, and they paid once already |
| Domain expiring < 90 days           | RDAP                                         | free | a renewal decision moment          |
| First review < 6 months old         | Outscraper (already paid for)                | free | new business, budget allocated     |
| Running Google Ads                  | Ads Transparency Center                      | free | has an acquisition budget          |

**Axis 3 — ability to pay.** Nothing models this today, and it is probably the
largest single miss. A roofer or dentist ($5–20k jobs) can pay for a site; a nail
salon ($40 tickets) cannot, however badly they need one. `category` is already on
the row, so a static trade → value-tier table is nearly free. Supporting signals:
Google price level ($–$$$$), multi-location, years in business (age of first review).

**Axis 4 — reachability.** Blocks conversion and, worse, threatens the sending
domain. A role address (`info@`, `contact@`) converts far worse than a named one,
and unverified scraped addresses bounce. **Sustained bounce rates above ~3% get a
cold-email sending domain throttled or blacklisted**, which is not a scoring
problem so much as an existential one for the channel. MX/catch-all validation
before the first large batch; `owner_name` presence gates a personalised greeting
(`lib/outreach/map.mjs` already refuses to fabricate one).

**Axis 5 — disqualifiers.** The scorer can currently only ADD points; the sole
negative is `CLOSED_PERMANENTLY`. Hard excludes worth encoding:

- **Franchise / chain** — corporate owns the website. The franchisee cannot buy one.
- **Site rebuilt within ~12 months** (current copyright year + modern stack) — they
  just bought; they will not buy again.
- **Regulated trades** (medical → HIPAA, legal → bar advertising rules) — real
  compliance surface on a generated site.
- **Footer credits an agency** — already has a vendor relationship.

**Re-entry rule:** file ONE axis with a real DoD, cheapest first (Axis 4's bounce
protection is the one with a deadline, since it must precede volume). Never file
the umbrella.

### Dashboard command-center / skill-bar backlog (19 items)

- **origin:** ops#62 (closed 2026-09-15); ops#227 remains open as the single surviving dashboard epic
- **trigger:** `event: one specific skill-bar item removes a proven, recurring bottleneck`
- **why parked:** 19 checkboxes, no DoD, structurally un-closeable. Net-new dashboard tooling — the exact expansion the feature freeze exists to hold.
- **re-entry rule:** file the _one_ item, with a real DoD. Never revive the umbrella.

### Monthly client report (Plausible stats + health checks + work log)

- **origin:** ops#201 (closed 2026-09-16) — full shape and test-first DoD preserved there
- **trigger:** `event: the first care-plan client has been live and paying for a full month`
- **why parked:** the issue itself says "do NOT build before then" — it needs a paying client plus a month of real data, a Plausible account (se#84) and the Stripe care plan (#200). Until then it is a reminder, not work.
- **re-entry rule:** file a fresh issue carrying #201's DoD (pure report-builder over injected sources first), not the old issue.

### Always-on, fleet-aware Discord HQ bot

- **origin:** ops#15 (closed 2026-09-16, parked on Adrian's triage call)
- **trigger:** `event: a proven need to reach ops from the phone while the machine is off`
- **what is actually left:** an always-on host off Adrian's machine (the bot still runs locally under pm2 and defaults to Ollama); a single cloud provider default for the hosted bot; pushed daily one-line recaps and blocked-task pings. Fleet-aware read commands already shipped (#255, #256 via #363, #257 via #364); deploy alerts are #11's `deploy-alert.mjs` + `lib/ops/notify.mjs`; the needs-you pager is #51; the production health check is #318/#347.
- **security precondition:** remove or lock down the `!shell` raw passthrough in `scripts/discord-bot.mjs` (`execSync`, OWNER_ID-only gate) before hosting the bot 24/7 anywhere.
- **deferred audit:** PR #364 deferred a nothing-silent check of the background push path (`DISCORD_HERMES_CHANNEL_ID` / hermes bridge) to this work.
- **corrected dependencies:** `OPS_AGENT_KEY` machine auth already shipped (2026-07-07, `lib/ops-auth.mjs`); the "#8" in #15's body is a misnumbered reference, not the approvals inbox. Also drop the stale "machine is always running" Hermes/Ollama rationale from the bot's header when this is picked up.

### Cross-repo Ralph dispatcher ("mayor")

- **origin:** ops#89 and ops#47 (the full safety-layer plan) — #89 closed 2026-09-16 as a triage deferral. This effectively answers #87 Decision #6 ("mayor now vs per-repo crons as MVP") as "not now"; Adrian has not ruled on the design itself.
- **trigger:** `event: a 4th Ralph repo is onboarded, two or more repos have non-empty ralph-ready queues at once, per-repo parallelism is relaxed (#302/#238), or usage limits are hit across repos`
- **unmet DoD:** a scheduled orchestrator dispatches ready work across repos within the concurrency ceiling, reports to Discord, and never exceeds the approved autonomy level.
- **still unbuilt:** a per-run and daily spend/usage ceiling (related: ops#71 codeburn); a cross-repo concurrency cap; restoring and re-registering `check-unit-overlap` (only orphan fixtures remain in `fixtures/check-unit-overlap/`) — required before any repo runs parallel Ralph PRs; the `watchdog-policy.json` + `proposed-units.jsonl` pattern.
- **already shipped (don't rebuild):** claim refs with `RALPH_CLAIM_TTL`, per-cycle and lifetime attempt caps, `RALPH_ITER_TIMEOUT`, single-flight + wedge alerts, the ops hourly watchdog (#347/#365), Discord read commands.
- **recommendation carried from #87 Decision #7 (not yet Adrian's ruling):** the mayor proposes only and never auto-tags `ralph-ready`.
- **separate defect, not covered by parking the mayor:** site-engine's disabled `ralph.yml` schedule is tracked in [hirobius/site-engine#192](https://github.com/hirobius/site-engine/issues/192).
- **stale leftovers:** `scripts/fleet-dispatch.mjs` and `scripts/fleet-watchdog.mjs` still describe themselves as the mayor's workers.

### CommandPalette on /ops/tasks (⌘K jump-to-task + card actions)

- **origin:** ops#142 (closed 2026-09-16). Adrian parked it 2026-07-30 ("lowest-urgency operator polish… revisit after the higher-priority board work") — parked, not ruled won't-do; the 2026-09-14 three-option question was never answered.
- **trigger:** `event: HDS ships a palette that accepts external items and actions, or Adrian approves a bespoke ⌘K overlay in ops`
- **why parked:** `@hirobius/design-system` 0.13's `CommandPalette` only takes `className` and owns its own open state and ⌘K binding; HDS has been frozen since 2026-07-09 (hds#80).
- **salvage:** branch `claude/issue-142-20260712-1845` (commit `175fc57`) holds standalone helpers (`taskPaletteMatch.ts`, `taskPaletteActions.ts`, `useTaskCommandPalette.ts`, ~20 unit tests) that carry into a custom overlay. Its tests were never run and its `TaskCommandPalette.tsx` targets an API that doesn't exist. Don't delete the branch in a cleanup.
- **re-entry rule:** file a fresh issue reusing #142's DoD.

### Stripe billing — care-plan subscriptions

- **origin:** ops#200 (closed 2026-09-16)
- **trigger:** `event: the first care-plan client signs`
- **decision (Adrian, 2026-09-16):** the first client's one-off SOW fee is paid by check. By card, Stripe would take ~3.4% of it (2.9% + 30¢, plus 0.4% Invoicing) versus $0. Stripe earns its keep on recurring care-plan billing, so it is set up then. Detail in #200.
- **runbook preserved in #200:** account at https://dashboard.stripe.com/register, Payment Link for build fees, Subscription for the care plan.

---

## Cross-repo

### Extract the Concrete Creations multi-tenant subsystem

- **origin:** ops#19 (closed 2026-09-15) — holds the 48-file manifest and the exact extraction recipe
- **trigger:** `path: apps/concrete` — fires if it ever reappears in ops (it should not)
- **also:** `event: you decide to stand up the concrete-creations repo`
- **why parked:** `apps/concrete/` was already stripped from ops in `b8abe96`. There is no ops-side change left to make; the remaining work belongs to a repo that doesn't exist yet.
- **gotchas for the new repo:** resolve the base token graph from the published `@hirobius/design-system`, not a local copy; `hirobius.tenant-metadata.schema.json` is dangling — author it or drop the `$schema` line; the brand hexes are placeholders.

---

## Decided — do not revive

### Local Ralph runner

- **origin:** ops#214 (closed 2026-09-15)
- **trigger:** `event: a real constraint appears — rate limits, a private repo, or wanting to drive the loop offline`
- **why parked:** the premise was false (both repos are public, so Actions are free) and acting on it **caused a two-month hds outage** — the watchdog was relocated to this runner, which was then never built. The 6h cron backstop (ops#232, hds#201) is the correct mechanism.
- **if revived:** it must be _additive_ to the cron, never a replacement.

### Legacy `check:full` / `check:release` retirement

- **origin:** ops#240 (closed 2026-09-15)
- **trigger:** `event: check:full starts failing for reasons other than a real defect`
- **why parked:** premise inverted. #175 and #245 fixed the crashes; it now runs green as a 17-gate local pre-flight that catches real issues. Deleting it would be tidiness at the cost of coverage.

### "Frontier engineering" discussion

- **origin:** ops#274 (closed 2026-09-15)
- **trigger:** `event: further reading produces a specific structural change worth making`
- **why parked:** a thinking prompt with no deliverable. It already paid out as #292, #293, #298, #302 and #303 — file the change, not the discussion.
