# Backlog

Single source of truth for open work. Plain markdown — any tool (humans, AI,
IDE) can read or edit. Items grouped by area; tags show status.

**Legend:**

- `ready` — picked, start anytime
- `blocked` — waiting on a decision or dependency
- `parked` — intentionally deferred
- `needs-grilling` — scope not yet pinned down
- `idea` — proposed seed, not committed

Consolidated 2026-05-11 from `docs/ai/orchestration.json`,
`~/.hermes/kanban.db`, and `docs/ai/proposed-units.jsonl` (all archived to
`docs/ai/_archive/`).

---

## Portfolio (adrianmilsap.com) _(7)_

- `ready` **portfolio-about-bio-copy** — Draft /info About bio: one grounded first-person paragraph + LinkedIn/GitHub links
- `parked` **portfolio-tab-focus-ring-polish** — Desktop visual QA: focus ring through sidebar items, dropdown groups, indicators, nested nav states
- `parked` **portfolio-language-switcher-rtl-qa** — Finish language switcher and LTR/RTL visual QA across home / case study / /info
- `parked` **portfolio-launch-screenshots** — Capture launch screenshots: shell IA, before/after improvements, case-study evidence
- `ready` **portfolio-missing-asset-references** — src/app/data/projects.ts references 104 image paths (e.g. `/assets/xds/xds-1.jpg`, `/assets/hds/hds-1/01.jpg`, `/assets/lab/*.jpg`) that don't exist on disk. Rendered on /visuals — produces 404s in browser console. Decide per-card: provide assets OR remove dead entries from projects.ts.
- `parked` **portfolio-asset-population-validation** — Validate production folder structure + naming + responsive derivatives before bulk asset intake
- `parked` **backlog-8-case-study-auto-journaling** — Case study auto-journaling

## Concrete Creations _(8)_

- `ready` **12u-cc-repo-bootstrap** — Concrete Creations: bootstrap separate repo importing HDS as dependency
- `ready` **12u-cc-product-catalog-data-model** — Concrete Creations: product catalog data model + admin authoring flow
- `ready` **12u-cc-stripe-checkout-integration** — Concrete Creations: Stripe Checkout (hosted) integration — payments live
- `ready` **12u-cc-wa-legal-pages** — Concrete Creations: WA-compliant legal pages (terms, privacy, refunds, shipping)
- `ready` **12u-cc-handmade-asset-pipeline** — Concrete Creations: handmade-product asset pipeline
- `ready` **12u-cc-ai-content-repurpose-pipeline** — Concrete Creations — AI content repurposing pipeline (Hormozi model)
- `blocked` **t_968c0cb4** — concrete-creations
- `parked` **12n-api-monorepo-workspace-split** — OPUS PLAN: monorepo workspace split (packages/hds + apps/site + apps/concrete-creations)

## Client Work _(3)_

- `ready` **t_ad1b2374** — Client-bucket skills suite (4 sub-skills)
- `idea` **client-facing-portal-route** — Token-gated /c/:slug client portal
- `idea` **dashbd-skill-bundle-client-augment** — Client-bucket augmentation: meeting→tasks + weekly client digest

## HDS / Design System _(10)_

- `ready` **12i-bloat-hdslayout-architectural-split** — HDSLayout architectural split: 1918 LoC → 5 modules + slot-based shell
- `ready` **12q-figma-system-drift** — Resolve Figma library variable drift (HITL)
- `ready` **12q-figma-master-shadcn-fidelity** — Figma masters visually mirror shadcn React render (multi-tenant)
- `ready` **13y-21-figma-export-refresh** — Refresh Figma plugin variable export to match repo source
- `ready` **t_0472231f** — /lab Staging workspace — Variants/Themes/Research three-tab shell
- `ready` **t_b89f2dd7** — Visual evolution foundation: primitives + vocabulary + theme explorer
- `parked` **12q-semantic-page-headings** — Add heading structure to InfoPage and SandboxPage
- `idea` **session-late-audit-figma-system-fix** — Fix audit-figma-system gate failure
- `idea` **figma-plugin-planning-docs-save** — Save Figma DesignOps planning dumps to docs/figma-plugin/
- `idea` **atlas-absorb-hds-docs** — Absorb HDS documentation into /ops/atlas

## Ops / Agents _(19)_

- `ready` **t_be5c5b75** — AI-powered Build skills bundle (6 sub-skills)
- `ready` **t_bc7081a8** — Daily task picker view — pick from 474 units, queue for today
- `ready` **t_4ddf8e05** — Quality-gate skills (designer-engineer routine checks)
- `blocked` **t_edd336b5** — Service buttons + Roadmap Kanban routing
- `blocked` **t_d3b5353a** — Improve loose threads rail — session context, workspace correlation, branch→assignee
- `blocked` **t_9d5ec287** — Triage 7 investigate-broken gates from soft-gates audit
- `blocked` **t_adadb12f** — Surface youtube-knowledge as Knowledge-bucket button
- `idea` **dashbd-skillsbar-input-shell** — SkillTile input-shell variant for input-needing skills
- `idea` **dashbd-skill-creator-meta** — 'New skill' capture button + proposed-skills.jsonl seam
- `idea` **dashbd-skill-bundle-self** — Self-bucket skills (recruiter-facing + founder hygiene)
- `idea` **dashbd-skill-bundle-sales** — Sales-bucket skills (CRM minimums for solo agency)
- `idea` **dashbd-visual-ingest-drag-drop** — Drag-drop image + video inputs for visual-ingest / page-clone buttons
- `idea` **dashbd-auto-research** — Auto-research — scheduled research jobs that surface findings to /ops
- `idea` **dashbd-task-pillar-classification** — Adaptive pillar/category field on orchestration units
- `parked` **ops-agentic-review-loop** — Daily cron → analyze app (`audit-*`/`check-*` + optional LLM) → post refactor/improve findings to Discord with Proceed/Punt/Backlog CTAs → Proceed opens a GitHub issue that @mentions Claude → Claude Code session on a branch (no Claude API). Scrapped from active build 2026-06-18; design + 4 slices + decided dispatch in [docs/operations/agentic-ops-loop.md](./docs/operations/agentic-ops-loop.md). Safe start = Slice 1 (`scripts/daily-review.mjs` → `findings.jsonl` + Discord digest, no auto-dispatch). Related: `dashbd-auto-research`.
- `ready` **ops-production-go-live** — Preview is LIVE on `claude/relaxed-ramanujan-vvhqf8` (hirobius-ops project) as of 2026-06-23. To cut PRODUCTION over: merge PR #1 → `main` (brings published-DS `^0.5.0` + the client-PII scrub + the roadmap-data mkdir fix), set prod env (`VITE_OPS_GATE_HASH`, `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `DUDA_*`), and run migrations `0001`/`0002`/`0003`. `NODE_AUTH_TOKEN` already set in Vercel. DS `0.5.1` (delete the dangling `token.tsx`) clears the typecheck-red so PR #1 CI goes green — not a deploy blocker (the Vercel build skips typecheck). Replaces the shipped `ops-dashboard-deploy-unblock`.
- `ready` **ops-lead-pipeline-go-live** — Lead-gen → agent → Duda pipeline is scaffolded (stubs) and now merged onto `relaxed-ramanujan`; deploy is unblocked. To ship: port real Places (`lib/lead-gen`), agent + enrich (`lib/agent`), Duda (`lib/duda`); set Supabase/Places/Anthropic/Duda env + run migrations. Docs: [lead-gen-integration.md](./docs/operations/lead-gen-integration.md), [lead-pipeline-platform-integrations.md](./docs/operations/lead-pipeline-platform-integrations.md), [lead-gen-test-plan.md](./docs/operations/lead-gen-test-plan.md).
- `ready` **discord-bot-runtime-bugs** — `scripts/discord-bot.mjs`: `getOrchSummary()` called (~L406) but never defined → ReferenceError on the `get_orchestration` tool; dead reference to non-existent `scripts/hermes-discord-bridge.mjs` (~L40). Fix or remove (relevant to the agentic-ops-loop Discord path).
- `ready` **dispatchstate-queued-deadend** — `auto-assigner.mjs` writes `dispatchState:"queued"` to `clients/*/tasks.json` but nothing consumes it to start a build. Wire a consumer (folds into the agentic-ops-loop dispatch) or drop the field.

## Security / Compliance _(5)_

- `ready` **security-history-rewrite** — Purge client PII (lilac-insure / prospect-001 / the-ranch-foundation workspaces + contact names) from git history. The tip-scrub (PR #2, merged) removed it going forward but left it in history on a **public** repo. Tested `git filter-repo` runbook delivered — recommended: rewrite → recreate repo (only certain GitHub erasure); alt: filter-repo + force-push all refs + GitHub Support. Also notify the two client contacts (was public). Runbook + replacements file handed off out-of-band.
- `ready` **security-portal-server-auth** — Harden the `/c/:slug` portal token: today it's a client-bundled HMAC ("casual unguessable-link" privacy — forgeable, by design). Move verification server-side: new `api/portal-verify` + server-only `PORTAL_HMAC_SECRET` (no `VITE_` prefix) + httpOnly session cookie; delete `DEV_PORTAL_SECRET` + client-side `getPortalSecret`. ~half-day.
- `ready` **13s-10-grc-career-planning** — GRC career positioning — research + planning (HITL)
- `blocked` **t_52a4852d** — Investigate B2 OWASP SAMM 88→75 regression
- `blocked` **t_5f36efeb** — Investigate B6 OSV/audit 100→95 drift mid-session

## Other / Uncategorized _(14)_

- `blocked` **t_35125ddb** — check-typography-discipline: skip Windows-drive-letter top-level paths
- `blocked` **t_23df2183** — Lanes tiles drill into Pipeline tab pre-filtered to lane
- `needs-grilling` **backlog-14-agency-dashboard-codeburn** — Agency dashboard — codeburn cost observability + moving parts spec
- `parked` **backlog-4-strict-type-polymorphism** — Strict type polymorphism
- `parked` **backlog-5-flush-code-review** — Flush code review
- `parked` **backlog-6-ai-optimized-context-jsdoc** — AI-optimized context JSDoc
- `parked` **backlog-7-incubator-visual-diff-gallery** — Incubator visual diff gallery
- `parked` **backlog-15-orphan-circular-dom-budgets** — Orphan sweeper + circular dep locks + DOM node budgets
- `parked` **12v-token-system-modes-beyond-light-dark** — System modes beyond light/dark — high-contrast + reduced-motion + sepia (parked)
- `parked` **13z-7-scripts-audit-and-prune** — Audit scripts/ for unreferenced one-offs and prune
- `idea` **session-late-kimi-notify-false-positive-tighten** — Tighten kimi drain-notify false-positive surface
- `idea` **dashbd-skillsbar-wire-input-skills** — Wire 13 input-needing buried scripts as buttons via input-shell
- `idea` **dashbd-approved-triage-tool** — Approved-bucket triage command (gap: no dedicated tool today)
- `idea` **dashbd-skill-token-impact-trace** — Token impact trace — blast-radius report per token

---

**Total: 76 open items.**

## Conventions

- **Add work**: append to the appropriate section. ID = kebab-case, area-prefixed.
- **Ship work**: delete the line. Git log is the historical record.
- **Change status**: edit the badge in place.
- **Needs a plan?** Link to one: `- \`ready\` **id** — title ([plan](./docs/plans/id.md))`.
- **Re-categorize**: just move the line. No tooling enforces categories.
