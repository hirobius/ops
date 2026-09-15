# Repo procedures — copy-paste runbooks

> Split out of `docs/ai/HANDOFF.md` on 2026-09-14 (ops#292). Reference procedures,
> not session state: load when spinning up a repo, not on every session. Unchanged
> in the move.

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

---

<!-- Moved out of docs/ai/HANDOFF.md 2026-09-15: a runbook, not live state,
     and the always-on steering set was over its 25KB budget (ops#292). -->

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
