# Tasks-board combing — plan for approval (2026-07-09)

**What this is:** the output of combing the Supabase `tasks` board (ops#57).
Built by reading the board directly via the Supabase MCP (live data), because the
session's GitHub connector token had expired and couldn't post to #57. This file
is the durable handoff: a fresh session (or the `@claude` CI agent) should act
from here, and reconcile against anything the `comb-tasks.yml` CI run posted on
#57 so the two don't compete.

**Constraints in force:** the FEATURE FREEZE (see `HANDOFF.md`) — only revenue /
bug-hygiene-CI-honesty / finishing in-flight work — and repo scope (this session
could only file to `hirobius/ops`; `concrete` / `hds` / `portfolio` lanes route to
PARKED repos).

## Board inventory (181 live tasks, 0 done)

| Bucket                                                | Count |
| ----------------------------------------------------- | ----- |
| Open, already mapped to a GitHub issue (dedup — skip) | 115   |
| Open, no issue yet (combing candidates)               | 57    |
| Blocked (recycle, don't re-file)                      | 9     |

The 115 already-issued span 10 repos (ops 29, lilac-insure 22, clients 11,
veteran-resource-navigator 10, lilac-bonds 9, hirobius-design-system 9,
job-hunt 8, concrete 7, portfolio 7, access-tech 3) — **none get re-filed.**

## The 57 candidates — triage

### ① Already done — dedup & close, don't file (4)

- `backlog:security-portal-server-auth` — built by completed tasks #11–15
  (`lib/portal-auth.mjs`, `api/portal-verify.ts`, `useTokenAuth` rewrite, tests). Close.
- `backlog:client-facing-portal-route` — `/c/:slug` portal ships (`ClientPortalPage`). Verify & close.
- `backlog:ops-production-go-live` — stale (references `relaxed-ramanujan`, "merge PR #1 → main"). Ops is in prod. Close as superseded.
- `backlog:ops-lead-pipeline-go-live` — same stale go-live framing. Close/supersede.

### ② Freeze-compliant + in ops scope — the FILE-NOW wave (2)

- `backlog:discord-bot-runtime-bugs` — real bug: `getOrchSummary()` called (~L406)
  but never defined → `ReferenceError`; dead ref to nonexistent
  `scripts/hermes-discord-bridge.mjs` (~L40). → file as `bug` in ops.
- `backlog:dispatchstate-queued-deadend` — `auto-assigner.mjs` writes
  `dispatchState:"queued"` to `clients/*/tasks.json`, nothing consumes it. Wire a
  consumer or drop the field. → file as `bug` in ops (or fold into the fleet epic).

### ③ Epics — decompose via /to-tickets when their repo unfreezes (5)

`t_ad1b2374` (client skills, 4 sub) · `t_be5c5b75` (build skills, 6 sub) ·
`t_4ddf8e05` (quality-gate skills) · `12n-api-monorepo-workspace-split` (concrete) ·
`12i-bloat-hdslayout-architectural-split` (hds). All parked/frozen — do NOT file wholesale.

### ④ Parked-repo work (24) — hold

concrete (7: repo bootstrap, catalog data model, Stripe checkout, WA legal pages,
handmade-asset pipeline, content-repurpose pipeline) · hds (10: HDSLayout split,
Figma drift/refresh, semantic headings, /lab shell, visual-evolution foundation,
audit-figma-system fix) · portfolio (7: bio copy, asset validation, RTL QA,
launch screenshots, missing-asset 404s, focus-ring polish). Belong to parked repos.

### ⑤ Feature-idea backlog (`tag: idea`, ~15) — defer under freeze

`dashbd-*` skill bundles (sales/self/client/creator-meta/input-shell/wire-input),
auto-research, visual-ingest drag-drop, token-impact-trace, approved-triage-tool,
task-pillar-classification, atlas-absorb-hds-docs, figma-plugin-planning-docs-save,
kimi-notify-tighten, and the like. Feature expansion — park until freeze lifts.

### ⑥ Security lane (2)

- `backlog:security-history-rewrite` — client PII (lilac-insure / prospect-001 /
  the-ranch-foundation) still in git history on a **public** repo; tip-scrub (PR #2)
  fixed going-forward only. Genuinely important; it's a `clients`-repo history
  rewrite needing a human go → file with `needs-adrian` (do NOT auto-run filter-repo).
- `backlog:13s-10-grc-career-planning` — HITL research → park.

## The 9 blocked — keep blocked with a reason (recycle, don't re-file)

`t_968c0cb4` (concrete-creations, parked) · `t_9d5ec287` (triage 7 broken gates) ·
`t_adadb12f` (youtube-knowledge button) · `t_d3b5353a` (loose-threads rail) ·
`t_edd336b5` (service buttons + Roadmap Kanban) · `t_23df2183` (lanes tiles drill-in) ·
`t_35125ddb` (check-typography-discipline Windows-path skip — CI hygiene) ·
`t_52a4852d` (B2 OWASP SAMM 88→75 regression) · `t_5f36efeb` (B6 OSV/audit 100→95 drift).
The last three are CI-honesty/security — worth investigating when the freeze eases.

## Recommendation

Under the freeze the combing yields a **2-issue file-now wave** (both ops bugs),
**4 dedup-closes**, and everything else parked with a recorded reason. Mass-filing
57 issues would fight both the freeze and the parked-repo decision. Adrian to
confirm whether to also file `security-history-rewrite` (`needs-adrian`) now.

## Next actions (once GitHub access is restored)

1. Reconcile with any plan the `comb-tasks.yml` CI run posted on ops#57.
2. File the 2 ops bugs (`discord-bot-runtime-bugs`, `dispatchstate-queued-deadend`) as `bug`.
3. Close/supersede the 4 dedups on the board.
4. If approved: open `security-history-rewrite` with `needs-adrian`.
5. Leave epics / parked-repo / idea-backlog untouched until the freeze lifts.
