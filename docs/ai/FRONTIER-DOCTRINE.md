# Hirobius frontier-engineering doctrine

> How _we_ do frontier engineering. Decided in the 2026-09-14 strategy session
> (ops#274), against Kiro/AWS's "frontier engineering" framing.
> Owner: Adrian. Sessions follow it; they don't quietly amend it.

## 0. The one-paragraph version

We already have the machinery — a real autonomous loop, real steering files, real
gates. What we lack is **direction discipline**: on 2026-09-14 the loop merged 15
PRs of dead-code cleanup while the `p0` that makes money (#185, leads → site
render) sat 64 days untouched, immaculately specified and simply never queued.
So our doctrine puts its weight on **routing and boundaries**, not on ceremony.
Specs are mandatory for epics; the _queue rule_ is what makes them matter.

## 1. What we took from Kiro, and what we rejected

Kiro's frontier-engineering pillars, scored honestly against us:

| Kiro principle                                          | Us                                             | Verdict                                            |
| ------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| Spec-driven development (requirements → design → tasks) | Issues-as-specs, no design step                | **Adopt the design step, not the file count** (§2) |
| Agent steering files                                    | `CLAUDE.md` + `docs/ai/*` + guardrail registry | **Have it — and it's obese** (§4)                  |
| Expand autonomous surface area                          | Ralph loop, single-flight, auto-merge          | **Have it — mis-aimed** (§3)                       |
| Trust the boundaries, not the agent                     | Gate + registry + labels                       | **Have it; upgrade labels → boundaries** (§5)      |
| Execution is cheap, direction is everything             | —                                              | **Our actual gap** (§3)                            |
| Treat code as disposable                                | We preserve everything                         | **Adopt, for ops only** (§6)                       |
| Continuously tune your setup                            | `learned-rules.jsonl` is 0 bytes               | **Adopt** (§4)                                     |
| Multi-surface, same agent                               | CLI + web + remote, all Claude                 | Have it                                            |

**Rejected outright: Kiro's productivity metrics.** "556 commits vs 96" and
"median 4.5× lift" are volume measures. We would have scored superbly on both on
2026-09-14 while shipping nothing that earns. We do not instrument volume. See §7.

**Where we differ philosophically.** Kiro is written for product teams whose
scarce resource is engineer-hours. We are a one-person agency whose scarce
resources are Adrian's attention and cash. Every Kiro principle gets translated
through that before we adopt it — maximising autonomous surface without fixing
aim just accelerates entropy cleanup.

## 2. Epic specs — one file, mandatory for epics, nothing for chores

**Decided: one file per epic.** (First decided as Kiro's full three-file triad,
then collapsed the same day — see the change log. What was load-bearing in the
triad was the _design step_, not the file count.)

Location: **`docs/specs/<epic-slug>.md`** in the repo that owns the code, with
these sections:

| Section                   | What it carries                                                        |
| ------------------------- | ---------------------------------------------------------------------- |
| Outcome                   | What's true when this ships, in business terms + the north-star test   |
| Acceptance criteria       | The checklist, out-of-scope, and the invariants that hold throughout   |
| Current state             | What exists today, with `file:line` references                         |
| Target shape              | Seams, data flow, contracts                                            |
| **Alternatives rejected** | **The reason this document exists** — the step we historically skipped |
| Risks                     | What could go wrong, and what catches it                               |
| Tasks                     | Dependency-ordered slices, one issue / one PR each, with queue posture |

Cross-repo epics live in **ops** with links out. `docs/specs/_template.md` is the
skeleton.

**When it's mandatory.** An epic that (a) spans more than three issues, **or**
(b) touches client-facing output, client PII, or money. Today that means:
leads→generation, Digest, Dashboard/skill-bar, outreach.

**When it's forbidden.** Chores, bugs, single-issue work. Those keep the light
issue → Ralph path unchanged. A spec for a one-file fix is pure overhead.

**Anti-rot rules** — the known failure mode of this repo is documents outliving
their truth (`HANDOFF.md` is 119 KB against its own "keep it one page" contract;
`learned-rules.jsonl` is 0 bytes because its writer was deleted with Hermes;
`docs/archive/superpowers/specs/` stopped in May). So:

1. Every spec carries `Status:` (`draft` / `active` / `shipped` / `abandoned`)
   and `Last verified:` at the top.
2. A spec whose issues are all closed gets marked `shipped` in the same PR that
   closes the last one. A `shipped` spec is history, not instruction.
3. The Tasks table links issue numbers. If an issue's scope changes, the table
   changes in the same PR — the same lockstep rule `ARCHITECTURE.md` ⇄
   `pipeline-walkthrough.html` already has.
4. **Follow-up: a `check-spec-freshness` guardrail** (registry gate, advisory
   channel) flagging `active` specs whose issues are all closed, or whose
   `Last verified` is >60 days old. Filed as an issue; not built in the
   strategy session.
5. `docs/archive/superpowers/specs/` is **archive** — no new files there.

**What a spec does NOT do.** It does not gate the queue. An epic's slices get
queued the moment they're written (§3); the spec is context for the agent, not
an approval step for a human.

## 3. The routing rule (the load-bearing part)

The 2026-09-14 finding: #185 and #186 carry better specs than Kiro's triad
produces — problem statement, exact `file:line` references, task breakdown, DoD
checklist, gates, mandated skills — and sat 64 days because nobody applied one
label. Spec quality was never the constraint. **The queue was.**

Therefore:

- **Filing a revenue-path issue with a DoD checklist and queuing it are one
  action, not two.** An issue that meets the intake bar gets `ralph-ready` in the
  same gesture that files it. Leaving it unlabelled is a decision that must be
  stated on the issue ("not queued because X"), never a default.
- **North-star share is checked, not assumed** (§7). A rolling window with zero
  revenue-path merges is a red flag on the _queue_, not on the loop.
- **The loop starving is a routing alarm, not an idle state.** As of
  2026-09-14, 1 of 57 open ops issues carried `ralph-ready`. When the ready pool
  drops below ~3, the next session's first job is to refill it from the
  north-star path — not from cluster-F chores.
- **A parked issue is a context gap, not a rejection.** Where the loop parks for
  a missing DoD checklist, the fix is to have it _draft_ the checklist for a
  thumbs-up, not to bounce the issue back to the human queue. (Follow-up issue.)

## 4. Steering: a budget, enforced

**Decided: budget + guardrail gate** (Adrian, 2026-09-14).

Measured 2026-09-14, always-loaded agent context: `HANDOFF.md` 119 KB +
`AGENT_GUIDELINES.md` 25 KB + `PROMPT_TEMPLATES.md` 19 KB + `status.json` 15 KB +
`CLAUDE.md` 12 KB = **~189 KB, ~47k tokens before an agent reads a line of code.**
Kiro's steering files have inclusion modes (`always` / `fileMatch` / `manual`);
ours are all `always`.

The rule:

- **Always-on set, hard cap ~25 KB:** `CLAUDE.md`, a genuinely one-page
  `HANDOFF.md`, `NORTH_STAR.md`.
- **On-demand:** everything else in `docs/ai/`, loaded by reference when the task
  calls for it (`AGENT_GUIDELINES` when dispatching, `PROMPT_TEMPLATES` when
  writing prompts, specs when working their epic).
- **Enforced by a registry gate**, so it cannot silently regrow — which is
  exactly how it reached 119 KB. Advisory first, blocking once clean.
- `status.json`'s `headline` is a _headline_. Its history belongs in the log
  file, not in a single 6,000-word string that every agent loads.

**Continuous tuning.** `docs/ai/learned-rules.jsonl` is 0 bytes — not because we
never used it, but because **its writer was deleted.** The persist → promote
pipeline is intact (`scripts/persist-learned-rule.mjs`,
`scripts/promote-learned-rule.mjs`, `pnpm guardrail:learned-rules`), and its only
caller was `scripts/hermes-unit.mjs runPostMortem()`, which went with the
orchestration retirement. The two `[auto]` rules still sitting in
`AGENT_GUIDELINES.md` are May-2026 Hermes output, and they're task artifacts, not
durable rules. So the loop needs a **new trigger**, not a new tool — and the
trigger's data already exists: `ralph/lib.sh` and `ralph/next.sh` write a marked
comment on every failure (`ralph-attempt-failed`, `🅿️ Ralph parked this issue`,
the model's own `ralph-blocked:`). The fix is therefore a **reader**, harvesting
those pairs retroactively (#298), not an engine change. The highest-value signal
is the **pair**: the loop's verdict plus the human's recovery comment saying what
actually broke. And note _why_ Hermes produced junk rules — it ran its post-mortem
on task **completion**, so it distilled task trivia. Trigger on **failure**.
Sessions that hit a context gap the steering should have prevented append one line.

### The decay rule

Two capture loops in this repo have died the same way, four months apart, and
neither death was noticed: `learned-rules.jsonl` lost its writer's only caller
when Hermes was retired, and `agent-heal-log.md`'s last entries restart processes
that no longer exist. Both had working tooling on the read side. Both went quiet
silently, because **an empty log and a healthy-but-idle log look identical.**

So:

1. **Never attach a capture step to a process.** Attach it to an event that is
   written unconditionally — a Ralph park, a merge, a gate failure. A trigger
   living inside a process dies with that process and leaves the artifact on disk
   looking fine.
2. **Every capture pipeline ships a liveness check.** A gate that fails when the
   pipeline produced nothing in N days _while the source events did occur_. The
   second clause is load-bearing: a gate that fires during a genuinely quiet
   period gets ignored within a week.
3. **Surface the count where a human already passes.** A store that fills
   silently is worth the same as an empty one.

A pipeline without a decay guard is not instrumented — it is merely unobserved,
and the difference only shows up months later.

## 5. Human gates — essential vs. friction

**Essential. Never removed, never "optimised with better context":**

- No AI on client PII (`automation-config.json` → `llm.provider: "none"` in the client-site repo).
- Fabrication bans in site generation — absent fields stay absent.
- Money: Stripe, Outscraper spend, anything that bills a client.
- Outbound customer sends — the client-site repo's `_shared/test-mode-guard.mjs` choke point.
- Secrets: agents never read or write `.env*`.
- History rewrites / force-push on shared branches.

These are _boundaries_, not preferences. They hold regardless of how good agent
context gets, because their failure mode is unrecoverable (a fabricated detail on
a client's live site, a real send, a leaked key).

**Friction, replaceable with a boundary** — per Kiro's _trust the boundaries, not
the agent_:

- **Per-issue `ralph-auto` → path allowlist** (ops#238). _Decided 2026-09-14:_
  auto-merge becomes the default posture; manual approval is required only for
  paths touching generation, client PII, or billing. A label you always apply is
  approval theatre; a path rule cannot be forgotten. Implementation note: this is
  a shared `hirobius/ralph` change across all three repos.
- **`needs-human` as a catch-all.** 26 of 57 open ops issues are human-gated, and
  several were already dispositioned in `BURNDOWN-GAMEPLAN.md`. Split into
  `needs-decision` (genuinely Adrian) and `needs-credential` (a key or account —
  a checklist item, not a gate).
- **The DoD-checklist intake filter** — see §3.

## 6. Code is disposable — in ops, and only in ops

ops is an internal dashboard with one user. We have been treating it with
production-preservation instincts: porting bash verbatim, ratcheting DOM-node
budgets rather than deleting the surface, keeping legacy gate chains alive
because they "catch real issues."

For **ops**: prefer deletion to preservation. If a surface isn't used, delete it;
the agent can rebuild it in an afternoon. Keep the end-to-end and invariant tests
— those are the contract a rewrite must satisfy — and let unit tests go with the
code they cover.

For **the client-site repo** and **site-engine**: the opposite. Those touch client PII, client
money, and client-visible output. Their invariants are load-bearing and their
code is not disposable.

## 7. Metrics — two, both about direction

1. **North-star share** — % of merged PRs in a rolling 14 days touching the
   revenue path (`lib/agent`, `lib/leads`, `lib/lead-gen`, `lib/render`,
   `lib/outreach`, billing) vs. everything else. Baseline 2026-09-14: **0 of 15
   (0%)**. This is the metric that would have caught the 64-day p0 in July.
2. **Human-gate latency** — median days an issue sits in
   `needs-adrian` / `needs-decision` before moving. That is the real constraint on
   a one-person agency; the loop's capacity is not.

Both are computable from GitHub history and fit the bounded-loop shape
`ralph/metric.sh` already defines. **We do not instrument commits, PR counts, or
lines changed.** Volume metrics reward the behaviour that cost us two months.

## 8. What this doctrine asks of a session

1. Read `NORTH_STAR.md`, then `HANDOFF.md`. Flag drift in one sentence.
2. Working an epic? Read its `docs/specs/<slug>.md` first. No spec and the
   epic qualifies under §2? Write it before writing code.
3. Before ending: **leave the ready pool non-empty**, biased toward the
   north-star path. A session that merges work and leaves the queue starved has
   handed the next session a routing problem.
4. Hit a context gap the steering should have prevented? One line in
   `learned-rules.jsonl`.
5. Update `HANDOFF.md` + `status.json` in the final commit (existing rule).

## Change log

- 2026-09-14: Initial doctrine, from the ops#274 strategy session. Decisions
  taken: epic specs in `docs/specs/` · path-allowlist auto-merge (#238) ·
  steering budget with an enforcing gate. Kiro's productivity metrics rejected.
- 2026-09-14 (same session, revised): the spec format was first adopted as
  Kiro's full three-file triad, then collapsed to **one file per epic** before
  anything merged. Rationale: this repo demonstrably rots documents, the triad's
  value is concentrated in its design/rejected-alternatives step, and one file
  is one thing to keep true. Recorded rather than silently rewritten — the
  reversal is itself a data point about our ceremony tolerance.
