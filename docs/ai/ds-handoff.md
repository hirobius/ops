# Design-System Repo Handoff → `hirobius/hirobius-design-system`

> **Target repo:** `hirobius/hirobius-design-system` — *"standalone, publishable
> component library + token system + docs site"* (default branch `main`, public).
> This is the published `@hirobius/design-system` package + its docs site.
>
> **Scope of this handoff:** ONLY tasks that build **in the DS repo**. The repo was
> split *after* these tasks were frozen (2026-05-11): the HDS primitives, the doc
> shell (HDSLayout), and the `/hds` doc surface were extracted out of `hirobius/ops`
> into this DS repo. `hirobius/ops` is now just a *consumer* (`package.json`:
> *"Consumes @hirobius/design-system for UI"*).
>
> Everything else from the old DS backlog was deliberately **excluded** — see
> "What was left out" at the bottom. This is a short list on purpose.

---

## ⚠️ Read this before starting — provenance & limits

- **How these were routed:** I confirmed each task's target files **left
  `hirobius/ops`** (evidence inline per task) and confirmed the DS repo's identity
  via GitHub search. I could **not read inside `hirobius/hirobius-design-system`**
  from the session that produced this doc — its GitHub scope was restricted to
  `hirobius/ops`. So **exact paths and current status inside the DS repo are
  unverified.** Treat the paths below as "where it was in ops before the move" and
  re-locate in the DS repo first.
- **Statuses are frozen** as of the 2026-05-11 task archive
  (`docs/ai/_archive/legacy-task-systems-2026-05-11.json` in ops). The files have
  since moved repos, so some of this may already be done or restructured. Verify
  against the DS repo's own backlog/README before executing.
- **First reads in the DS repo:** its own `README` / `public/llms.txt` / `DESIGN.md`
  (whatever the DS repo ships) before touching code.

---

## 🔴 DO FIRST — `ds-0.5.1-token-tsx-fix` (unblocks ops CI)

DS `0.5.0` ships `src/app/components/token.tsx` with a dangling
`import { allTokens } from './lab/tokenUtils'` — but `lab/` (tokenUtils /
ComponentDocPage / SpecimenBlock) was deleted in `0.5.0`. The package ships raw
`.tsx`, so **every consumer type-checks it and fails** (this is the 3-error
typecheck-red that ops/PR #1 carries today).

**Fix:** delete (or repair) `token.tsx` in this repo and publish `0.5.1`. Ops pins
`^0.5.0`, so it auto-resolves `0.5.1` on the next install → ops typecheck-red clears
and PR #1 CI goes green.

**Reproduce from ops (until you can read the DS repo):** `pnpm install && tsc --noEmit`
in `hirobius/ops` surfaces the three `token.tsx` errors pointing at the dead
`./lab/tokenUtils` import. Confirm the import still exists at DS `main` HEAD before cutting.

**Validation:** `tsc --noEmit` clean in ops after `pnpm install` of `0.5.1`.  ·  **Depends on:** none

---

## Task 1 — `12q-semantic-page-headings` (small; good warm-up)
status `parked` · approval `approved` · tier `T1` · priority `3`

check:semantic reports 2 pages with no detectable heading structure. Add a single
`<h1>` + descend through h2/h3 without skipping levels. Both are utility pages but
still need an accessible heading outline.

**Why it's a DS-repo task now:** its two target files left ops —
`InfoPage` is now imported from `@hirobius/design-system`
(`src/app/pages/InfoPageWrapper.tsx` in ops does `import { InfoPage } from
'@hirobius/design-system'`), and `SandboxPage` moved with the `/hds` doc surface
(ops `/hds/*` is now just a redirect stub).

**Agent notes (from archive):**
- Source of audit: `docs/ai/scan-logs/2026-05-03/check_semantic.log` (in ops; the audit that flagged it).
- Files (old ops paths — re-locate in DS repo): `src/app/components/InfoPage.tsx`, `src/app/pages/hds/SandboxPage.tsx`.
- Use `Text variant="h1"` or `hds.typeStyles.h1` for the page title.
- ⚠ **Known-failing validation:** `pnpm check:semantic` was failing across the
  2026-05-06 hermes sessions (exit 1, against `@hirobius/design-system@0.3.0`).
  So the gate itself may be broken independent of headings — triage `check:semantic`
  first, don't assume a red is your edit.

**Validation:** `pnpm check:semantic`  ·  **Depends on:** none

---

## Task 2 — `12i-bloat-hdslayout-architectural-split` (OPUS-CLASS; not mechanical)
status `approved` · approval `approved` · priority `1`

OPUS-CLASS architectural decision. After all the focused bloat extracts land,
refactor HDSLayout from a 1918-LoC do-everything shell to a slot-based composition:
`HdsShell` (skeleton), `HdsShellNavRail` (sticky sidebar + active-route + nav
scroll-hide hook), `HdsShellTopBar` (theme + language + search + mobile-menu
trigger), `HdsShellContent` (main outlet + right-rail TOC), `HdsShellMobiusLayer`
(3D scene anchor binding). Each child consumes `useTheme`/`useLanguage`/`useToc`
directly — no more `isDark` prop drilling. Boundaries must preserve all existing
behavior; visual regression must be **byte-identical**. The kind of split that earns
or wastes the next 6 months of velocity.

**Why it's a DS-repo task now:** HDSLayout left ops — `routes.tsx:46` in ops:
*"The design-system doc shell (HDSLayout) now lives in the standalone DS site."*

**Agent notes (from archive):**
- **DO NOT execute mechanically — this needs an architectural session with Adrian first.**
- Output first: a `docs/architecture/HDSLayout-split-plan.md` with the 5-module
  proposal, the dependency graph, the migration sequence, the blast-radius for each
  public-API change.
- Resolve: where does the Mobius nav scroll-hide animation belong? (Probably
  `HdsShellNavRail`, which owns the nav.)
- Resolve: `TocProvider` wraps children today — move into `HdsShellContent` or keep outside?
- Resolve: `HDS_NAV_SECTIONS` lives in the file today — move to `src/app/data/nav.ts`?
- Smoke test: visual regression must be byte-identical. If it isn't, the split
  changed semantics — investigate before committing.

**⚠ Two move-related caveats:**
1. **5 unmet prerequisites.** `dependsOn`: `12i-bloat-hdslayout-dead-code`,
   `-health-rail-extract`, `-inline-css`, `-hds-nav-dedup`, `12i-bloat-isdark-prop-drilling`.
   Their status **after the repo move is unknown** — verify which are already done in
   the DS repo. The HDSLayout LoC may already differ from the 1918 snapshot.
2. Needs `pnpm test:visual` wired in the DS repo (the byte-identical gate).

**Validation:** `pnpm typecheck && pnpm test:visual && pnpm test:layout`  ·  **Depends on:** the five `12i-bloat-hdslayout-*` extracts above

---

## What was left out (and why)

You scoped this to **DS-repo-only**, so these were intentionally dropped:

**Builds in `hirobius/ops`, not the DS repo** (the DS *authoring* machinery stayed
in ops — Figma plugin, `hirobius.tokens.json` + `build-tokens.mjs`, `hds-manifest.json`,
`pipeline/figma-masters-batch.mjs`, audit scripts — all confirmed present in ops):
`12q-figma-system-drift`, `13y-21-figma-export-refresh`,
`session-late-audit-figma-system-fix`, `figma-plugin-planning-docs-save`,
`12q-figma-master-shadcn-fidelity` (pipeline in ops; reads its spec from `button.tsx`
which now lives in the DS package — cross-repo), `t_0472231f` (/lab staging),
`t_b89f2dd7` (token source + theme explorer), `dashbd-skill-token-impact-trace`,
`12v-token-system-modes` (parked).

**Obsolete / superseded by the extraction itself:**
`atlas-absorb-hds-docs` (wanted to pull `/hds` docs *into* `/ops/atlas`; the split did
the **opposite** — pushed them *out* to this DS repo), and
`12n-api-monorepo-workspace-split` (the DS extraction already accomplished its core).

> Want the ~9 ops-side DS-adjacent tasks as a **separate** handoff for the ops agent?
> Say so and I'll generate it from bucket ③.

---
_2 archived tasks + the `0.5.1` fix. Routed by confirmed-departure from `hirobius/ops`;
not yet verified inside `hirobius/hirobius-design-system` (out of session scope).
Re-confirm there before executing._
