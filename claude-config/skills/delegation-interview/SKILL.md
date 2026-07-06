---
name: delegation-interview
description: "Interview Adrian about his recurring manual work, then turn the answers into an automation backlog — concrete loops/skills/cron-able jobs filed as GitHub Issues, ranked by hours-saved × feasibility. Use whenever Adrian says 'run the delegation interview', 'what can I hand off', 'map my manual tasks', or complains about repetitive chores / being the bottleneck. Inspired by the loop-me pattern (mattpocock/skills) + the 'GitHub director with 40 automations' playbook."
---

# Delegation Interview — map Adrian's manual labor to automatable loops

> Goal: leave the session with (a) a ranked automation backlog filed as issues,
> (b) 1–2 quick wins implemented on the spot if trivially safe.

## Ground rules

- Adrian dictates and is time-pressed: ask **one compact batch of questions at
  a time** (max 4), plain language, no jargon. Read past transcription errors.
- His stated posture (2026-07-02): comfortable releasing the reins on **menial
  labor**; stays involved in **strategy**; hates being the bottleneck; wants
  **recaps** and **runaway protection** on anything autonomous.
- Every proposed automation MUST name its **kill-switch + recap surface**
  (where he sees what it did — /ops surfaces, HANDOFF done-log, or issue
  comments). Nothing silent, nothing unbounded.

## Interview flow (3 rounds max)

**Round 1 — inventory.** Ask for: the recurring chores he did this week
(anything done ≥2×), the ones he dreads, the ones that block others when he's
busy, and roughly how long each takes. Seed with candidates observed from the
repo/session history: relaying handoffs between sessions, pasting context
between repos, checking deploy states, triaging newsletters, chasing keys/env
setup, kicking CI/preview links, reconciling task lists.

**Round 2 — shape.** For the top ~6 by time cost, classify each:
`loopable` (same steps every time → skill/cron/hook) · `dispatchable`
(judgment-light → agent task with auto-ok label) · `strategy` (keep human —
do NOT automate; say so explicitly).

**Round 3 — confirm.** Present the ranked backlog (hours-saved/week ×
feasibility), each with: mechanism (skill / cron / hook / importer-auto-task),
recap surface, kill-switch. Get a yes/no per item.

## Output contract

1. File one GitHub Issue per approved automation in `hirobius/ops`
   (label `backlog`, title `automation: <verb phrase>`, body = mechanism +
   recap + kill-switch + est. hours saved).
2. Add one Done-log line to `docs/ai/HANDOFF.md`.
3. If a quick win is ≤30 min and touches nothing destructive, build it in the
   same session; otherwise leave it as the issue.
4. Do NOT auto-enable anything recurring (cron) without an explicit per-item
   yes — Adrian's standing "no cron rn" holds until he flips it per item.
