# Ops Burndown — Gameplan & Recommendations

> **Snapshot:** 2026-09-14 · **72 open issues** · ops CI fully green · autonomous loop draining.
> Author: Claude (session `session_01PjpPJJrgkYMsoeA5HMirNf`). This is a living handoff —
> a fresh session can read this + `docs/ai/HANDOFF.md` and pick up smoothly.

---

## 0. TL;DR — where things stand

- **The autonomous machine works now.** `ralph-auto` + `ralph-ready` issues self-merge on a
  green `ralph-gate`; the 6h idle-watchdog (PR #232) auto-restarts a wedged chain; CI is green.
  **The ~22 `ralph-auto` issues are merge-pre-approved, but `ralph-auto` alone does NOT
  queue them — `ralph-ready` is what the selector reads.** When the `ralph-ready` set empties,
  the loop goes idle (guard step succeeds, every later step skipped) and stays idle until
  something re-labels. Keep 3-5 `ralph-auto` issues carrying `ralph-ready` at all times.
- **The real constraints are human gates, not agent capacity.** What's left that matters is
  sequencing: revenue path → compliance-before-outreach → core product → platform epics.
- **This doc = recommendations + a phased plan for all 72**, so you (or a new session) can execute
  without re-deriving context.

### How to read the queue at a glance

| Bucket         | Count | Who acts          | Meaning                                                                    |
| -------------- | ----- | ----------------- | -------------------------------------------------------------------------- |
| `ralph-auto`   | ~22   | **you/a session** | pre-approved to self-merge, but only moves while also tagged `ralph-ready` |
| `needs-human`  | 18    | **you**           | compliance / secrets / outreach / strategic epics                          |
| `needs-adrian` | 6     | **you**           | decisions (mostly dispositioned below)                                     |
| untagged       | ~26   | triage            | real work not yet queued — recs below                                      |

---

## 1. How the machine works (for a fresh session)

- **Labels:** `ralph-ready` = eligible for pickup; `ralph-auto` = self-merge on green gate;
  `needs-adrian`/`needs-human` = human-gated; `ralph-parked` = auto-parked after a failed attempt.
- **The gate:** `ralph-gate` is the **only required check** on `main`. Other CI jobs (Lighthouse,
  Quality gates, etc.) are informational — a PR at `mergeable_state: unstable` is still mergeable.
- **Single-flight:** one `ralph/*` PR at a time. Merging any PR to `main` chain-triggers the loop
  to grab the next `ralph-ready` issue. The 6h cron is the backstop if the chain stalls.
- **A park does NOT chain-trigger the loop.** Only a _merge_ to `main` hops the chain. When an
  iteration ends in a park (or in "queue empty"), nothing re-dispatches — the loop sits idle until
  something re-labels an issue (the `issues` event wakes `ralph.yml`) or the 6h watchdog fires.
  Observed twice on 2026-09-14: idle 15:54→16:29 after the queue emptied, and 16:36→17:14 after
  #63 parked. **Feeding the queue is therefore also how you restart the loop.**
- **Before queueing anything, check it hasn't already shipped.** Read the issue's
  `closed_by_pull_requests` (and spot-check `main`) first. Several board-era issues are done but
  never auto-closed — the "Closes #N" auto-close raced the next claim. Queueing one burns an
  iteration and parks it via the PR-history guard. #156 (shipped in #162) and #103 (shipped in
  #192) both did exactly this on 2026-09-14; both are now closed.
- **A large slice of the `ralph-auto` pool is already shipped but never closed.** On 2026-09-14 a
  verification sweep closed 8 in one cycle (#3 #78 #103 #108 #113 #156 #158, plus cross-repo #63) —
  most had a merged PR the auto-close raced. **Sweep before you queue:** check
  `closed_by_pull_requests`, then confirm against `main` (`git show origin/main:<file> | grep ...`).
  Closing a done issue is worth as much burndown as building a new one, and costs one API call
  instead of a whole iteration.
- **Two shapes that always park — never tag them `ralph-ready` as-is:**
  (a) an issue whose deliverable is a file under `.github/workflows/` (the bot has no `workflows`
  scope — #90; split the logic into a `scripts/*.mjs` Ralph _can_ write, or route the `.yml`
  through an adr-eng PR); (b) an issue whose DoD is "reviewed/accepted by Adrian" (#71) or that
  has no `- [ ]`/DoD section at all (#5, #51).
- **Parking causes (all recoverable):** missing a `- [ ]` DoD checklist in the body; 2 failed
  attempts; `ralph-blocked` (cross-repo, or a real human decision); a prior PR merged but the issue
  didn't auto-close. **Recovery: fix the cause, re-add `ralph-ready`.**
- **Workflow-file edits (`.github/workflows/*`) can only be pushed by a human (adr-eng)** — the
  bot's Actions token lacks `workflows` scope. Route those through a manual PR, not Ralph.
- **To queue work:** add `ralph-ready` (+ `ralph-auto` for self-merge). Give every issue a DoD
  checklist or it parks. **Don't mass-tag** — churn parks issues; feed the loop in small batches.

---

## 2. The remaining 72 — by cluster, with recommendations

### A. `ralph-auto` pool — draining automatically (no action) ~22

Tasks-board / dashboard polish and guardrail chores. Let them drain:
`#3 #5 #51 #63 #68 #71 #73 #78 #90 #103 #106 #107 #108 #109 #113 #139 #140 #142 #156 #158 #159`

- **#44** is `ralph-parked` — re-add `ralph-ready` to recover (preview_url auto-record; genuinely
  Ralph-doable).
- **Rec:** leave them. If the pool ever starves, that's when to promote untagged work (below).

### B. Core product — leads → site generation (HIGHEST product value)

This is the money-maker: sourcing a lead and auto-generating its site. Handle **deliberately,
supervised** (generation-touching, fabrication bans apply — do NOT `ralph-auto` these blind).

- **#185 (p0)** — wire the `render` action into LeadsPage + surface the config hand-off. **Top priority.**
- **#186 (p1)** — forward `hours/street_address/photos/logo_url` from lead row to the agent. Prereq for #190.
- **#190 (p1)** — Outscraper photo/logo details pass (spend approved). Sequence **after #186**, when lead sweeps resume.
- **#188 / #191 / #196 (p2)** — agent polish: free palette + contrast pre-checks; model-chosen hero/section order; Pexels fallback.
- **#187 (p1)** — mark the dead Duda path for removal (pure cleanup — safe to `ralph-auto`).
- **Rec / sequence:** #185 → #186 → #190, each as its own supervised PR (`ralph-ready`, review before merge).
  #187 can `ralph-auto` now. #188/#191/#196 are follow-on polish.

### C. Compliance — the gate before scaling outreach (do NOT skip)

Cold outreach cannot scale until these land. This is the critical sequencing constraint.

- **#35** — prospecting data / PII / CAN-SPAM pass
- **#38** — privacy policy page + CCPA / opt-out handling
- **#27 (p1)** — rewrite git history to purge client PII from the public repo (force-push; human)
- **#9 (blocked, p1)** — Smartlead cold-email engine (API key, sending domains, 2–4wk warmup)
- **Rec:** treat #35 + #38 + #27 as a **hard prerequisite** for #9. Don't turn on outreach first.

### D. Secrets & security hygiene

- **#32** — adopt secrets standard in ops · **#33** — rollout tracker (remaining human steps)
- **#182** — react-router 4 high-sev CVEs (already `ralph-ready`, supervised — review the routing diff before merge)
- **#229 / #230** — investigate B2 OWASP-SAMM and B6 OSV/audit score drift (#230 partly addressed by #182)
- **Rec:** merge #182 after a routing smoke-check. Queue #229/#230 as `ralph-auto` investigations.

### E. Platform epics — pick ONE to advance next (freeze is lifted)

These were "parked under freeze"; the freeze lifted 2026-07-11, so they're revivable. Each is big —
decompose into `ralph-auto` slices rather than one mega-PR.

- **Digest → Issue pipeline:** #77 (epic) · #78 (P1, `ralph-auto`) · #79 (P2 core) · #80 (P3) · #81 (P4)
- **Dashboard command-center / skill-bar:** #62 (epic) · #227 (skill-bar system) · #211 · #212 · #142
- **Autonomous Ralph engine:** #87 (roadmap) · #89 (mayor/dispatcher) · #111 (self-repair loop) · #113
- **Rec:** **Digest** is the most self-contained and highest-leverage (turns inbox noise into tracked
  work automatically). Advance #78 → #79 next. Consolidate #62 vs #227 (overlap — likely merge into one epic).

### F. Chores / bugs — safe to queue as `ralph-auto` (drain the frontier)

Well-scoped, low-risk. Promote in small batches (add a DoD checklist first to avoid parking):

- **#187** (Duda dead code) · **#221** (a11y headings on the /info page)
- **#226** (triage the 7 investigate-broken gates — some already resolved tonight, re-assess) · **#68** · **#103**
- **#104** (DOM-node budget guard — needs a ratchet-vs-fixed decision first; light human call)
- **#256 / #257** (discord `!dispatch` + kill-switch — follow-ups to #30, already delivered #255)
- **Rec:** queue 3–5 at a time as `ralph-auto`, let them drain, repeat.

### G. Platform / infra features

- **#8 (blocked)** — approvals inbox + autonomous-run log on /ops · **#201** — monthly client report
- **#228** — agentic review loop · **#234** — unify design tokens across portals + the client site (cross-repo-ish)
- **#3 / #5** — Playwright MCP self-verify; pre-edit blast-radius hook (both `ralph-auto`)
- **#19** — extract Concrete Creations multi-tenant subsystem to its own repo (big; human decision)
- **#7** — evaluate Sonnet 5 for MODELS tiering (an eval + decision)
- **#10 / #15 / #73** — visual self-QA loop; always-on Discord bot; incubator visual-diff gallery

### H. Housekeeping

- **#57** — the tasks-board comb job (already ran; produced the #211–#257 issues). **Rec: close as done** —
  it's a one-time job, and the duplicate issues it spawned were cleaned up tonight.
- **#134** — your master manual-setup checklist. **Keep** — it's the canonical human-queue index.

---

## 3. Recommended sequencing (the gameplan)

**Phase 0 — now, autonomous (no you needed):** let the `ralph-auto` pool drain; recover parks; keep
CI green. The watchdog backstops. _(Running tonight.)_

**Phase 1 — Revenue (Access Tech = first paying client):**

1. Send the prospect the reinstatement email (drafted locally).
2. On his reply: finalize the services agreement (needs his legal business name) + file the Google
   appeal within 3 business days.
3. When the first deal closes: run the Stripe no-code setup (#200, ~20 min).

**Phase 2 — Unblock outreach (compliance):** #35 → #38 → #27, then #9. Hard gate: no scaled cold
email until these are done.

**Phase 3 — Core product (leads → generation):** #185 (p0) → #186 → #190, supervised. Then agent
polish #188 / #191 / #196.

**Phase 4 — Platform epic:** advance **Digest** (#78 → #79), decomposed into `ralph-auto` slices.
Consolidate the Dashboard epics (#62/#227) into one.

**Always-on:** chores/bugs (cluster F) drain via `ralph-auto`; keep the queue fed 3–5 at a time.

---

## 4. Decisions captured (needs-adrian) — my recommendations

| #        | Decision                                                       | My rec                                                                                                                                                         |
| -------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **#238** | Make auto-merge the hard default (drop per-issue `ralph-auto`) | **Keep per-issue tag** — the shared `hirobius/ralph` change touches all 3 repos; the tag already works.                                                        |
| **#239** | CI/gate epic                                                   | **Re-scope or close** — its "3 broken systems" premise is outdated; tonight's targeted fixes (#243/#241/#260/#262/#270) got CI green without the big refactor. |
| **#240** | Retire the legacy `check:full` chain                           | **Close** — `check:full` now runs green and catches real issues; retiring it is unnecessary.                                                                   |
| **#241** | Fold `quality.yml` steps into the registry                     | **Optional cleanup** — the dead steps are already gone; remaining is cosmetic consolidation.                                                                   |
| **#200** | Stripe billing                                                 | **Do when first deal closes** (runbook ready).                                                                                                                 |
| **#214** | Local Ralph runner                                             | **Deferred** — ops is public = free Actions; the watchdog covers stall-recovery.                                                                               |

**Open strategic call for you:** which Phase-4 epic to advance first (my rec: Digest), and confirm
the compliance gate (Phase 2) before any outreach.

---

## 5. How to resume

**This session or a new one:**

1. Read this doc + `docs/ai/HANDOFF.md` + the fleet `status.json`.
2. **Check the ready queue first — this is the #1 failure mode.** `gh issue list --label ralph-ready
--state open`: if it returns nothing, the loop is idle (not "draining"), and no merge will wake it.
   Re-label 3-5 `ralph-auto` issues that already carry a DoD checklist. Then: any newly
   `ralph-parked`? Recover parks (fix cause → re-add `ralph-ready`); close obsolete/cross-repo/duplicate.
3. To make progress: promote 3–5 cluster-F chores to `ralph-auto` (with DoD checklists), or advance
   the current phase.
4. Workflow-file edits → manual PR as adr-eng. Everything else → let Ralph do it.

**Guardrails that still hold:** never skip a test to get green; never push `.env`; generation code
respects the fabrication bans; compliance before scaled outreach.
