# CLAUDE.md

Hirobius **Ops** — the agency operations dashboard: leads → site pipeline,
client CRM, projects/digest/tasks, build telemetry. It **consumes**
`@hirobius/design-system` for UI; it does **not** author the design system (that
lives in its own repo). Stack: Vite + React Router + Vercel serverless functions.

## 0. HARD RULES (no exceptions, apply to all agents including Claude)

- **NEVER read, write, create, or delete `.env*` files.** Keys are set by the human only. If a task needs a new key, document it in a comment in the script and stop — do not touch `.env.local`.
- **NEVER git push.** Local commits only.
- **NEVER run `pnpm check:release` or deploy commands.**
- **Issue intake is gated.** An issue holds work with a _current_ reason to act.
  Before filing, verify it isn't already done (`closed_by_pull_requests`, the code
  on `main`, AND prior comments for park reasons or Adrian decisions — the
  2026-09-14 sweep found 8 of 11 already shipped or obsolete). Use the **Work**
  template (needs a real `- [ ]` DoD, or `ralph/next.sh` parks it on sight) or the
  **Decision** template (needs a default + a date, so silence resolves instead of
  blocking). If the reason to act lies in the **future**, it is not an issue —
  add it to `docs/ai/PARKED.md` with a trigger; `pnpm parked:check` surfaces it
  when the condition fires. A discussion with no deliverable is not an issue.
- **`/ops` is gated in production** by a server-side password: `api/ops-login.ts` checks `OPS_GATE_PASSWORD` + `OPS_SESSION_SECRET` and sets an httpOnly session cookie. Adrian sets those in the Vercel dashboard env (Production + Preview scopes). `pnpm dev` bypasses the gate. Claude must never read or write `.env*` files.

---

## 1. What to read first

> **Current state (2026-09-14 burndown session) — read `docs/ai/BURNDOWN-GAMEPLAN.md`
> for the full picture (all open issues clustered, the phased plan, and the
> needs-adrian decisions).** Durable facts to carry forward:
>
> - **ops CI is green.** `ralph-gate` is the **sole required check** on `main`; the
>   other CI jobs (Lighthouse, "Quality gates", the "Typecheck…Playwright (desktop)"
>   job) are informational — a PR at `mergeable_state: unstable` is still mergeable.
>   Don't be alarmed by red _non-required_ checks.
> - **Auto-merge is the proven default:** `ralph-auto` + `ralph-ready` + a green
>   `ralph-gate` → self-merge; the 6h idle-watchdog cron is ON (PR #232).
>   **Single-flight** = one `ralph/*` PR at a time, so a supervised/unmerged PR stalls
>   the whole loop — merge or close it promptly, and **verify merge state via the API,
>   never assume "it merged"** (a 4h idle happened when a merge tap didn't complete).
> - **`.github/workflows/*` edits can't be pushed by the bot (no `workflows` scope).**
>   Route CI/workflow changes through an **adr-eng PR via the GitHub connector** — the
>   sanctioned, human-directed exception to §0's "no agent push", not a Ralph task.
> - **Parking is recoverable:** a missing `- [ ]` DoD checklist, a cross-repo scope, or
>   2 failed attempts park an issue (drops `ralph-ready`). Recover by fixing the cause
>   and re-adding `ralph-ready`; don't mass-tag (churn causes parking).
> - Vercel is on **Pro**; preview Deployment Protection is **off** (the `/ops` password
>   gate still protects it). Frontier-engineering deep-dive is queued as **#274**.

- **Current state / what's next:** `docs/ai/HANDOFF.md` — start here on any short or open-ended prompt ("continue", "go", "status") and act from its Next queue.
- **Focus contract:** `docs/ai/NORTH_STAR.md` — if a request materially expands scope beyond it (infrastructure that doesn't ship a paying client site sooner), flag the drift in one sentence, then do what Adrian decides. Sessions never edit that file.
- **Delivery architecture (lead → site → outreach → invoice):** `docs/ARCHITECTURE.md` (canonical for the narrative) ⇄ `docs/pipeline-walkthrough.html` (visual Artifact) — keep the two in lockstep. **For whether a stage actually works, read `/ops/standing`, not a doc:** it derives every verdict from live `leads` row counts (`leadFunnel` → `lib/chain/evidence.mjs`). Never hand-write pipeline status.
- **Guardrail registry:** `docs/guardrails/registry.json` — every `scripts/check-*.mjs` / `audit-*.mjs` gate with its `firingChannel`; `validate-guardrail-registry` keeps registry ↔ scripts consistent.
- **On-demand context (NOT loaded by default — read when the task calls for it):**
  `docs/ai/AGENT_GUIDELINES.md` (dispatching) · `docs/ai/PROMPT_TEMPLATES.md` (writing
  prompts) · `docs/specs/README.md` (working an epic) · `docs/ai/DONE-LOG.md` (shipped
  history) · `docs/ai/REPO-PROCEDURES.md` (repo runbooks) · `docs/ai/FRONTIER-DOCTRINE.md`
  (how we work). The always-on set is capped by `scripts/check-steering-budget.mjs` —
  add to `docs/guardrails/steering-budget.json` only deliberately (ops#292).
- **Context awareness:** look for local `CLAUDE.md` files in subdirectories for overriding rules before editing.
- **Plan & PR artifacts (convention, #4):** for a substantial implementation plan, write it as a self-contained **HTML file** (real tables, mockups, data-flow, key code snippets) reviewable in a browser — not a markdown wall (template gallery: `anthropics/html-effectiveness`). For a large diff, produce an **artifact walkthrough** (the diff, reasoning per change, what was tested). Small changes stay inline.

**Before ending a session that did real work:** update `docs/ai/HANDOFF.md` (Now / Next / Parked / one Done-log line) and refresh root `status.json` (the fleet dashboard renders it); include both in the final commit.

**Voice-dictation resilience:** Adrian often dictates; transcripts carry homophone artifacts ("stray" → "strategy"). Act on the evident intent; ask only when genuinely ambiguous.

## 2. AGENT EXECUTION PROTOCOL (MANDATORY)

1. **PRE-FILTER:** Before writing code, analyze whether the request affects UI, Layout, CSS, or Components.
2. **AUTO-VALIDATE:** If UI/Layout is affected, autonomously run `pnpm typecheck` and `pnpm test:layout` after your changes, before your final response.
3. **SELF-HEAL:** If tests fail, read the output, fix the error, and re-run until green — don't ask for help.
4. **FINALIZATION:** Only report a task complete when tests are 100% green.
5. **RECAP:** retired 2026-09-15 — `/ops/standing` reads GitHub live instead. Details in `docs/ai/DONE-LOG.md`.
6. **BROWSER-VERIFY:** UI-touching sessions should verify changes via the Playwright MCP browser when available (Chromium preinstalled at `/opt/pw-browsers` in remote sessions).

### Working-with-Adrian conventions (standing prefs, 2026-07-06)

- **Give paste-ready text for every human-filled field.** When a setup step needs Adrian to type into a description/name/value field (Vercel env var, GitHub token name, Supabase key, etc.), supply the exact copy-paste text — never leave him to guess what to write.
- **Token/secret-backed features must fail loud and actionable.** Any feature that depends on an env token or secret must catch the failure and return a message that names the variable AND the fix (e.g., "GITHUB_TOKEN is expired/revoked — rotate it in Vercel → Settings → Environment Variables (Production), then redeploy"), never a generic/cryptic error. Build this in when you build the feature, not after it breaks.
- **Hand Adrian clickable deep-links, not directions.** Whenever a step means "go create a key" or "run this SQL" or "set this env var", give the actual clickable URL to the exact place — not a breadcrumb trail. Known destinations for this account:
  - Supabase SQL editor (project `ops`, ref `vvyccwxtcwvlusweenje`): `https://supabase.com/dashboard/project/vvyccwxtcwvlusweenje/sql/new`
  - Supabase API keys: `https://supabase.com/dashboard/project/vvyccwxtcwvlusweenje/settings/api-keys`
  - Vercel env vars (`hirobius-ops`): `https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables`
  - GitHub fine-grained tokens: `https://github.com/settings/personal-access-tokens`
    Pair every "paste this" with the link to where it goes.

### Dispatched-task discipline (2026-07-08)

Applies to any agent working a dispatched `@claude` task — and to any session dispatching them.

- **Decompose epics; never build one wholesale.** If a dispatched task is actually an epic — multiple deliverables, or a design/spec/roadmap doc (e.g. a "fleet mayor", "compliance", "consolidation", "live status feed" issue) — do NOT attempt the whole thing in one PR. File concrete sub-issues, implement the smallest well-scoped slice, and link the rest. A dispatching session splits an epic into tasks _before_ dispatch; an agent that receives one decomposes rather than flailing at all of it.
- **Never false-close.** An agent that cannot make real, mergeable progress — blocked on a human decision, a missing key/paid account, out-of-scope, or genuinely not agent-actionable — must NOT mark the task `done`. Set it `blocked` (or `on-hold`) with a one-line reason on the issue, so the thought is recycled, never lost to a false "completed". **"I analyzed it" is not "done".**
- **Ask, don't guess.** When input is genuinely needed, drain every non-blocked part first (open a draft PR), then post the specific question, apply `needs-adrian`, and set the task blocked (see ops#51) — rather than guessing or closing.

### Skill protocol — the engineering skills are MANDATORY, not optional (2026-07-08)

`.claude/skills/` vendors Matt Pocock's engineering skills. They only earn their keep if invoked **deterministically** — so this is a routing mandate, not a suggestion the model may skip:

- **Building anything (feature or fix) → `/implement` + `/tdd`** (test-first, red-green-refactor). No "just write it."
- **Epic / multi-part / fuzzy task → `/to-tickets`** (split into dependency-ordered tickets); `/grill-me` first if the _plan_ itself is unclear. Pairs with the Dispatched-task discipline above.
- **Before opening ANY PR → `/code-review`** (dual-axis: standards + spec).
- **A bug → `/diagnosing-bugs`** (reproduce → minimize → hypothesize → fix), then `/tdd`.
- **Design-touching / new module → `/codebase-design`**; periodic design-debt sweep → `/improve-codebase-architecture`.
- **Board / issue-lifecycle work → `/triage`.**

**Tracker config for `/to-tickets` + `/triage`** (they ask for it): our tracker is **GitHub Issues in the current repo**; label vocabulary is `backlog` · `bug` · `blocked` · `needs-adrian`. Dependencies: **sub-issues** for epic→child, **"Depends on #N"** in the body for cross-task prerequisites.

Dispatched `@claude` issues carry these invocations in their body (`lib/tasks/actions.mjs`), so fleet work runs them by default; interactive sessions follow this table.

## 3. Sub-agent dispatch

Canonical detail: **`docs/ai/AGENT_GUIDELINES.md`** §1–3 (model matrix, effort,
pod sizing, worktree isolation, the bulk-lint:fix incident). Load it when you are
actually dispatching. The three rules that must not be rediscovered:

- **Cheapest model that can do the job.** `sonnet` is the default for source work
  and is **required for anything involving deletions**. `opus` only for
  cross-cutting architecture or subtle validator logic.
- **NEVER `pnpm lint:fix` across the codebase** (Pod N incident, 2026-05-01 — it
  merged unrelated code blocks into syntax errors). Per-rule only:
  `pnpm exec eslint src --fix --rule '{"<rule>": "error"}'`, then
  `pnpm typecheck && pnpm exec vite build` after EACH rule. >50 files touched by
  one rule → stop and ask.
- **Branch-per-session** (`claude/*`); never two sessions on one branch.

---

## 4. Learned rules — promoted from loop failures (2026-09-14)

Distilled from the retro harvest of every Ralph park/blocked/attempt-failed comment
in ops (ops#274 session; full corpus in `docs/ai/learned-rules.jsonl`, walk it with
`pnpm guardrail:learned-rules`). These five earned always-on space because they
change what a session does; the rest stay in the JSONL until promoted.

- **A park is not proof the work is stuck.** `iteration ended without a pushed
branch` is frequently loop _infrastructure_ (bot-actor push rejection, a
  permission wall, a sensitive-file edit block) or a deliberate ask-don't-guess
  stop — not a failure of the issue. Read the agent's own comment before believing
  the verdict.
- **Before re-queuing a parked/blocked issue, read its comment history.**
  `closed_by_pull_requests` plus the current code is not enough — ops#142 burned a
  full iteration in September rediscovering a blocker written down in July.
- **A gate failure blaming a missing binary may be a red herring.** Install it and
  re-run before trusting the diagnosis; ops#178's real faults were a stale route
  list and an architectural mismatch hiding underneath.
- **A `ralph-gate` startup_failure with 0 jobs run = caller/reusable permission or
  version skew on a stale branch.** Update the branch from `main` first; don't
  conclude the shared engine regressed (ops#144).
- **Diff a deletion issue's premise against `main` before deleting.** A prior
  unrelated PR may have solved the problem differently, leaving the DoD stale —
  stop and ask rather than deleting working code on the issue text's word (ops#122).

**Never queue an issue whose DoD requires editing `.github/workflows/*`** — the
bot's token lacks the `workflows` scope. Split it: the workflow file goes to a
human/adr-eng PR, the rest becomes a script-or-registry issue Ralph can push.
ops#90, #240, #241 and #243 each did the full work and then died at the push.
