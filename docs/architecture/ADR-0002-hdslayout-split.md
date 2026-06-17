---
id: ADR-0002
title: HDSLayout Split Plan
status: accepted
date: 2026-05-01
supersedes: []
superseded-by: []
---

# HDSLayout Split Plan

| Field | Value |
|---|---|
| Status | proposed |
| Date | 2026-05-01 |
| Author | Architecture pod (sonnet, B5) |
| Gates | `12i-bloat-hdslayout-architectural-split` (orchestration unit) |
| Prerequisites | All steps 1–6 below must be done before step 7 |

---

## 1. Context

`src/app/pages/hds/HDSLayout.tsx` is currently ~1530 LoC after Pod 3's deletion (was 1858 originally). It mixes 8 distinct responsibilities: ThemeProvider/FontProvider wrapping, LanguageContext consumption + RTL, sticky desktop sidebar with localStorage-backed nav state, mobile overlay sidebar with backdrop scrim, TOC right-rail with IntersectionObserver scrollspy, mobile TOC dropdown, MobiusShellLayer anchor binding with a 100-line scroll-hide RAF loop, and a 300-line health rail (`TokensRail` + `RailSignalCard`/`RailDisclosureMetric`/`RailStaticMetric` + data-builder helpers). Plus inline `<style>` (~70 LoC), duplicated nav data (`HDS_NAV` + `HDS_NAV_SECTIONS`), and `isDark`/`onToggleDark` prop drilling through 3 call-sites despite `useTheme` being available everywhere.

Without this split, every future contributor faces a 1500+-line context dump. A change to TOC scrollspy risks merge conflict with a Mobius-anchoring change; theme adjustments collide with sidebar layout. Pod A's bloat audit identified each responsibility individually. This document is the architectural decision that ratifies the 5-module decomposition.

---

## 2. Five Modules

### `HdsShell` (root, ~50 LoC)
- File: `src/app/pages/hds/HdsShell.tsx` (or keep `HDSLayout.tsx` as the entry name)
- Role: Provider shell. ThemeProvider + FontProvider wrapping. The root `<div data-hds-component="hds-layout" dir={direction}>` with `isolation: isolate`. Composes the 4 children + `<MobiusShellLayer />` lazy-loaded.
- State: none of its own. All via providers.

### `HdsShellNavRail` (~330 LoC)
- File: `src/app/pages/hds/HdsShellNavRail.tsx`
- Role: Sticky sidebar nav (desktop) + mobile overlay + backdrop scrim + scroll-hide hook driving Mobius nav-pill opacity.
- Owns: `sidebarOpen`, scroll-position preservation refs, the scroll-hide RAF loop (extracted to `useNavScrollHide()` in prereq step 3).
- Consumes: `useTheme`, `useLanguage`, `useMobiusStore`, `useLocation`.
- Houses: `NestedNavGroup`, `SideNavItem`, `Sidebar`.

### `HdsShellTopBar` (~180 LoC)
- File: `src/app/pages/hds/HdsShellTopBar.tsx`
- Role: Fixed top bar. Mobius nav-pill anchor (`data-mobius-anchor`), mobile hamburger/X button, mobile sidebar-open backdrop blur, skip-to-content link.
- Owns: nothing — delegates state to siblings.
- Consumes: `useTheme`, `useMobiusStore`.

### `HdsShellContent` (~200 LoC)
- File: `src/app/pages/hds/HdsShellContent.tsx`
- Role: Main content column. Hosts the `<TocProvider key={location.pathname}>` boundary (moved here from root). Renders `<Outlet />`, `FooterPager`, `DocPageFooterNote`, `DocPageSpec`. Owns the 3-column CSS grid shell + inline-start/end inset calculations.
- Consumes: `useTheme`, `useLanguage`, `useLocation`.

### `HdsShellTOC` (~200 LoC)
- File: `src/app/pages/hds/HdsShellTOC.tsx`
- Role: Right-rail TOC panel (desktop) + mobile TOC dropdown.
- Houses: `TocPanel`, `TocMobileDropdown`, `TocLink`, `TocLinks`, `getOrderedTocItems`, `scrollToTocTarget`.
- Note: Health-rail components (`TokensRail`, etc) live in their own file (`src/app/components/HealthRail.tsx`) per prereq step 2 and are imported here.

### Plus support files
- `src/app/pages/hds/hds-shell-constants.ts` — all SIDEBAR_W / TOC_W / DOC_SHELL_W / z-index / color constants.
- `src/app/data/shell-copy.ts` — i18n strings.
- `src/app/data/nav.ts` — `HDS_NAV_SECTIONS` + `ALL_PAGES` + `SIDEBAR_PAGER_PAGES` (consolidated by prereq step 5).
- `src/app/hooks/useNavScrollHide.ts` — extracted in prereq step 3.
- `src/app/hooks/useShellBreakpoints.ts` — NEW hook bundling `isMobile` + `showToc` + resize listener.
- `src/app/hooks/useShellRouteState.ts` — NEW hook bundling `isHomeRoute` / `isShellRoute` / `isHdsRoute` / etc.

---

## 3. Migration Sequence (the order of dependent units)

| Step | Unit | Effect |
|---|---|---|
| 1 | `12i-bloat-hdslayout-dead-code` ✅ DONE | -293 LoC (SearchModal/CollapsibleNavGroup/Fuse) |
| 2 | `12i-bloat-hdslayout-health-rail-extract` | -300 LoC, new file `HealthRail.tsx` |
| 3 | `12i-bloat-hdslayout-scroll-hook` | -100 LoC, new hook `useNavScrollHide` |
| 4 | `12i-bloat-hdslayout-inline-css` | -70 LoC, moved to `hds-shell.css` or const |
| 5 | `12i-bloat-hdslayout-hds-nav-dedup` | -50 LoC, single source of truth in `data/nav.ts` |
| 6 | `12i-bloat-isdark-prop-drilling` | -30 LoC, no more prop threading |
| 7 | `12i-bloat-hdslayout-architectural-split` | The 5-module split (this unit) |

**Invariant after every step:** `pnpm typecheck && pnpm test:layout && pnpm test:visual` exit 0 with byte-identical visual output.

---

## 4. Key Boundaries

- **TocProvider** moves from `HDSDocRoot` into `HdsShellContent`. It's content-scoped, not shell-scoped. The `key={location.pathname}` is preserved.
- **ThemeProvider + FontProvider** stay at `HdsShell` root.
- **MobiusShellLayer** stays a sibling at root (it uses `position: fixed` covering the viewport). Wrap in `React.lazy()` at split time as a free win.
- **`HDS_NAV_SECTIONS` + `ALL_PAGES`** consolidated to `src/app/data/nav.ts` (step 5).
- **`SHELL_COPY`** moves to `src/app/data/shell-copy.ts` (micro-task within split).

---

## 5. Risks + Mitigations

### Risk 1 — Visual regression (HIGH)
Split must be byte-identical DOM/CSS. Mitigation: `pnpm test:visual` after every commit; any pixel diff is a bug to fix before commit.

### Risk 2 — useEffect ordering across siblings (HIGH)
After split, sibling components' relative effect ordering isn't guaranteed across React versions. The route-change effect (sidebar close + scroll restore) and Mobius scroll-hide effect currently fire in a single component in source order; after split they're in different components.

**Mitigation:** Hoist shared coordination into a `useShellRouteEffect()` hook called from `HdsShell` root. Adrian must ratify this addition.

### Risk 3 — Performance (LOW-MEDIUM)
More component instances = more reconciliation. Should be a wash since each component is smaller. Mitigation: profile with React DevTools Profiler on `/hds/color` before and after; investigate if commit time grows >2ms.

### Risk 4 — Test coverage (MEDIUM)
New module files start with zero dedicated tests. Mitigation: each gets a smoke test via Vitest + React Testing Library.

---

## 6. Decision

**Proceed AFTER all 6 prerequisite units are done.** The split is mechanical once the prereqs land — it becomes move-and-rename, not a refactor. Doing it earlier creates a second-order mess.

DO NOT execute as a single big-bang commit. Each prerequisite extract is independently reviewable and revertable.

---

## 7. Migration Checklist (for the executor agent)

1. Verify gate: all 6 prereq units `status: done` in orchestration.json.
2. Create `src/app/pages/hds/hds-shell-constants.ts` — move all module-level constants.
3. Create `src/app/data/shell-copy.ts` — move `SHELL_COPY`.
4. Create `useShellBreakpoints()` hook bundling viewport state.
5. Create `useShellRouteState()` hook bundling route booleans.
6. Create `src/app/pages/hds/HdsShellNavRail.tsx` — move sidebar + nav components.
7. Create `src/app/pages/hds/HdsShellTopBar.tsx` — move top-bar + Mobius pill overlay.
8. Create `src/app/pages/hds/HdsShellContent.tsx` — move main + TocProvider + footer.
9. Create `src/app/pages/hds/HdsShellTOC.tsx` — move TocPanel + mobile dropdown.
10. Refactor `HDSDocRoot` → `HdsShell` root composer.
11. Wrap `MobiusShellLayer` in `React.lazy()` + `<Suspense fallback={null}>`.
12. Run `pnpm typecheck` — exit 0.
13. Run `pnpm test:layout` — exit 0.
14. Run `pnpm test:visual` — byte-identical to baseline.
15. Update orchestration.json — mark `12i-bloat-hdslayout-architectural-split` done.

---

## Appendix A — Highest-Risk Decisions for Adrian to Review

1. **`useShellRouteEffect()` hook for cross-sibling effect ordering.** The split forces shared coordination logic into a new root-level hook. This wasn't in the original prereq plan. Ratify or propose alternative.

2. **TocProvider key placement.** `<TocProvider key={location.pathname}>` is currently keyed in `HDSDocRoot`. After move, the key must stay on `TocProvider` itself, not on its parent — otherwise TOC items from the previous route briefly leak.

## Appendix B — Unassigned Blocks

- **`ALL_PAGES` / `SIDEBAR_PAGER_PAGES`** (lines 525-537): used by `FooterPager` only but conceptually belongs in `data/nav.ts`. Move as side-effect of step 5.
- **`SHELL_COPY` i18n object** (lines 485-505): used by 4 future modules. Shared via `src/app/data/shell-copy.ts`. Micro-task within split.
