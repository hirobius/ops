# DS → Ops migration reconciliation

Cross-reference of the "Hirobius DS → Ops Repo — Migration Handoff" against what
this repo (`hirobius/ops`) already contains. The artifacts are being stripped from
`hirobius/hirobius-design-system` (branch `claude/strip-to-design-system`); retrieve
any original with `git show origin/main:<path>` from a DS clone (out of scope here).

## Coverage — already absorbed ✓

This repo was extracted from the same monorepo, so it already has essentially the
entire inventory (audited 2026-06-18):

- **Scripts (31/31 present):** chat bots (discord/telegram/haiku), routing
  (`auto-assigner`, `kanban-start`, `migrate-*-to-hermes`), all `*-middleware.mjs`,
  commit-ref/claims gates, knowledge/media (youtube, bookmarks, gpt, auto-research,
  batch-scan, video-clone, page-clone, process-call-recording), client tooling
  (client-digest, sync-client-emails, google-auth), telemetry-report, and
  `scripts/_retired-2026-05-06/`.
- **`docs/ai/`** (the crown jewel): guidelines, orchestration, operator brief, model
  tiers, multi-agent overnight, prompt templates, watchdog-policy, learned-rules,
  routing-log, swarm-watchdog-decisions, `rules/`, `skills/`, and
  `_archive/legacy-task-systems-2026-05-11.json`.
- **`docs/` dirs:** business, legal, operations, signal, superpowers, vision,
  knowledge, research, logs, migrations, findings.
- **Gate:** `src/app/components/OpsGate.tsx` + `src/lib/ops-gate.ts`.

Intentionally NOT absorbed: `src/app/pages/hds/OpsPage.tsx` (orphaned "Workspace HQ"
— ops has its own dashboard under `src/app/pages/ops/`).

## Gaps to act on

### A. ⚠️ Build-breaker — DS package drops 3 components ops imports
The strip moves `agent-tag` / `approval-card` / `phase-header` OUT of the
`@hirobius/design-system` package. Ops imports all three from the package:
- `AgentTag`, `AgentTier` → `ops/SessionsSection.tsx`, `ops/SessionsPage.tsx`, `ops/SessionInputForm.tsx`
- `ApprovalCard`, `ApprovalState`, `ApprovalUnitSummary` → `admin/Approvals.tsx`, `admin/ApprovalDetail.tsx`
- `PhaseHeader`, `PhaseHeaderTone` → `ops/ClientDashboardPage.tsx`

If DS republishes without them, ops typecheck/build breaks (5 files). **Decide:**
keep them exported from DS (recommended — ops is the consumer), or vendor them into
ops. Coordinate with the DS strip PR. Compounds the deploy-unblock blocker
(`deploy-unblock.md`).

### B. `discord-bot.mjs` runtime bugs (present in OUR copy)
- `getOrchSummary()` is called (~line 406) but never defined → ReferenceError on the
  `get_orchestration` tool.
- references a non-existent `scripts/hermes-discord-bridge.mjs` (~line 40).

Fix or remove before relying on the bot (relevant to the agentic-ops-loop, which
posts to Discord).

### C. `dispatchState:"queued"` dead-end
`auto-assigner.mjs` writes `dispatchState:"queued"` to `clients/*/tasks.json`, but
nothing consumes it to start a build. Wire a consumer (folds into the
agentic-ops-loop dispatch) or drop the field.

### D. Three disconnected task stores → unify
bot→`clients/*/tasks.json`, Hermes→`~/.hermes/kanban.db`, plus `BACKLOG.md`.
**Already being addressed** by the Supabase `tasks` consolidation
(`tasks-consolidation.md`) — that table is the unification target.

## Env vars + external state (human-set; not in git)

See handoff §7–§8. Notable for what we're building: `DISCORD_WEBHOOK_URL` (agentic
loop), `ANTHROPIC_API_KEY`, `OLLAMA_*` / `ASSIGNER_MODEL` (auto-assigner),
`GMAIL_*` / `GOOGLE_*` (client email/digest), `VITE_OPS_GATE_HASH` (gate),
`KANBAN_REF_ENFORCE`. External state not in git: `~/.hermes/kanban.db` (live Hermes
store, served on :9119), `telemetry/events.jsonl` (gitignored).

## Currency check (optional)

Ops has copies, but DS `origin/main` may hold newer pre-strip edits to `docs/ai/**`
and the scripts. If exact parity matters, from a DS clone:
`git diff --diff-filter=D --name-only origin/main...origin/claude/strip-to-design-system`
to list removals, and `git archive origin/main docs/ai | tar -x` into a temp dir to
diff. (Needs a DS clone — out of this session's scope.)
