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

- **Components:** the 3 ops-flavored components the strip moved out of the package
  (`agent-tag`, `approval-card`, `phase-header`) are now **absorbed locally** at
  `src/app/components/` (see Gap A, resolved).

Intentionally NOT absorbed (discarded — unneeded): `src/app/pages/hds/OpsPage.tsx`
(orphaned "Workspace HQ", never routed; ops has its own dashboard under
`src/app/pages/ops/`). Final reconciliation 2026-06-18 against both export tarballs
(`ops-bundle` 191 files + `ops-4b` 55 files): **every** archived script, doc dir, and
the b4 extras (`.husky/commit-msg`, `dispatch-unit` skill) were already present; the
only missing-and-intended content was the 3 components. The archives carried nothing
else this repo needed.

## Gaps to act on

### A. ✅ RESOLVED — DS package drops 3 components ops imports (absorbed 2026-06-18)

The strip moves `agent-tag` / `approval-card` / `phase-header` OUT of the
`@hirobius/design-system` package. Ops imported all three from the package — which
would have broken typecheck/build the moment the strip PR merged. **Fixed by
absorbing them into this repo:**

- `src/app/components/agent-tag.tsx` — consumes DS primitives `Badge`, `Stack` +
  `@hirobius/design-system/tokens`. Used by `ops/SessionsSection.tsx`,
  `ops/SessionsPage.tsx`, `ops/SessionInputForm.tsx`.
- `src/app/components/approval-card.tsx` — consumes DS primitives `Card`, `Button`,
  `Tag` + ops-local `cn`. Used by `admin/Approvals.tsx`, `admin/ApprovalDetail.tsx`.
- `src/app/components/phase-header.tsx` — self-contained (ops-local `cn` + semantic
  CSS vars). Used by `ops/ClientDashboardPage.tsx`.
- `src/lib/utils.ts` — new ops-local `cn` (clsx + tailwind-merge; backs the `./cn`
  export map) so the absorbed components don't depend on the package's `cn` subpath.

All 6 consumer imports were repointed from `@hirobius/design-system` to the local
relative paths. Only the moved symbols were repointed; all other DS primitives
(`Badge`/`Stack`/`Card`/`Button`/`Tag`/`Page`/…) still come from the package
(confirmed public exports). The 3 components carry `@internal` + `hds-bypass` headers
matching the `OpsGate` precedent; `check-source-canon` passes.

**Pending (DS-resolved env only):** run `pnpm manifest:generate` once `pnpm install`
succeeds (needs the published DS package — see `deploy-unblock.md`) so the manifest +
`component-api.json` register the 3 new components. They can't be generated in the
agent container (no `node_modules`/`typescript`); this is the standard post-add step
per CLAUDE.md, not a defect. `check-manifest-drift` already passes (it only governs
`Hds*` compiler tags).

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
