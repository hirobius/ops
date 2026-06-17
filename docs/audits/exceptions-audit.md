# Exception Audit Report

Generated: 2026-05-12T04:24:38.746Z

## Summary

| Category | Count | Justified | Untriaged |
|----------|-------|-----------|----------|
| eslint-disable | 134 | 132 | 2 |
| @ts-ignore/@ts-expect-error | 1 | 1 | 0 |
| custom-sentinels (*-ok / hds-bypass) | 227 | 225 | 2 |
| **Total** | **362** | **358** | **4** |

## eslint-disable

| File | Line | Rule | Reason | Status |
|------|------|------|--------|--------|
| `src/app/components/CascadeText.tsx` | 29 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/ComponentDocPage.tsx` | 193 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/ComponentDocPage.tsx` | 223 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/animated-label.tsx` | 54 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- compound transition list; no Tailwind utility covers multi-prop animation` | justified |
| `src/app/components/asset-img.tsx` | 96 | `eslint-disable-next-line` | `jsx-a11y/no-noninteractive-element-interactions` | justified |
| `src/app/components/button.tsx` | 17 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- compound transition list; Tailwind has no single utility for transition-[colors,filter]` | justified |
| `src/app/components/code-block.tsx` | 6 | `eslint-disable*` | `jsx-a11y/no-noninteractive-tabindex -- scrollable code region requires tabIndex for keyboard navigation` | justified |
| `src/app/components/command-palette.tsx` | 366 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- 10px is the standard shadcn cmd-palette kbd metadata size` | justified |
| `src/app/components/command-palette.tsx` | 368 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- kbd shortcut hint` | justified |
| `src/app/components/command-palette.tsx` | 372 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- kbd shortcut hint` | justified |
| `src/app/components/command-palette.tsx` | 394 | `eslint-disable-next-line` | `jsx-a11y/no-autofocus` | justified |
| `src/app/components/command-palette.tsx` | 415 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- dialog results scroll cap at 60% viewport height` | justified |
| `src/app/components/command-palette.tsx` | 469 | `eslint-disable-next-line` | `tailwindcss/no-arbitrary-value -- footer hint metadata size` | justified |
| `src/app/components/componentPreviewRegistry.tsx` | 560 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/doc-page-header.tsx` | 272 | `eslint-disable-next-line` | `react-hooks/refs -- `ref` is a string prop (git branch), not a React ref` | justified |
| `src/app/components/doc-shell.tsx` | 307 | `eslint-disable-next-line` | `react-hooks/use-memo` | justified |
| `src/app/components/doc-toc.tsx` | 48 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/health-rail.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/components/history-card.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/components/lab/legacy-token-detail.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/components/mobius-logo.tsx` | 166 | `eslint-disable*` | `react-hooks/refs -- intentional: ref stores one-time detected tier, value does not change after mount` | justified |
| `src/app/components/mobius-logo.tsx` | 286 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/mobius-logo.tsx` | 450 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- isCoarsePointer read inside closure; adding it would restart event listeners on pointer mode change` | justified |
| `src/app/components/mobius-scene.tsx` | 231 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- initial values only; prop changes re-animate rather than re-mount` | justified |
| `src/app/components/mobius-scene.tsx` | 233 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- initial values only; prop changes re-animate rather than re-mount` | justified |
| `src/app/components/mobius-scene.tsx` | 993 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/morph-card.tsx` | 220 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- buildPath and render are stable arrow fns; adding them would re-mount observer on every render` | justified |
| `src/app/components/morph-card.tsx` | 373 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- render is stable; re-running on render identity change is unnecessary` | justified |
| `src/app/components/nav-group.tsx` | 68 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/perf-budget.ts` | 134 | `eslint-disable-next-line` | `no-console` | justified |
| `src/app/components/phase-header.tsx` | 6 | `eslint-disable*` | `tailwindcss/no-arbitrary-value -- semantic CSS vars (bg-[var(--semantic-*)]) are the HDS token system, not raw design values` | justified |
| `src/app/components/preview-frame.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/components/shell-controls.tsx` | 149 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/stepper-field.tsx` | 59 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/components/tile-grid.tsx` | 35 | `eslint-disable-next-line` | `no-restricted-syntax -- TileGrid IS the grid primitive; auto-fill template is its raison d'être` | justified |
| `src/app/context/__tests__/context.test.tsx` | 18 | `eslint-disable-next-line` | `@typescript-eslint/no-explicit-any` | justified |
| `src/app/pages/WetPaintPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/HDSLayout.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/HDSLayout.tsx` | 445 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/HDSLayout.tsx` | 890 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/HDSLayout.tsx` | 923 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps` | justified |
| `src/app/pages/hds/HdsDocPrimitives.tsx` | 182 | `eslint-disable-next-line` | `jsx-a11y/no-noninteractive-tabindex` | justified |
| `src/app/pages/hds/HdsDocPrimitives.tsx` | 216 | `eslint-disable-next-line` | `@typescript-eslint/no-unused-vars` | justified |
| `src/app/pages/hds/HdsDocPrimitives.tsx` | 528 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps` | justified |
| `src/app/pages/hds/HdsDocPrimitives.tsx` | 618 | `eslint-disable-next-line` | `@typescript-eslint/no-unused-vars` | justified |
| `src/app/pages/hds/HdsTocContext.tsx` | 116 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/HirobiusCaseStudyPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` | 221 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` | 229 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` | 238 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` | 255 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` | 265 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps` | justified |
| `src/app/pages/hds/MicrosoftDesignSystemsPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/OpsPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/PortfolioDraftPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/PortfolioDraftPage.tsx` | 208 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps` | justified |
| `src/app/pages/hds/PortfolioHomePage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/RanchFoundationCaseStudyPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/SpacingPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/TokensPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/hds/components/IconGallery.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/ops/BuildPage.tsx` | 2 | `eslint-disable*` | `no-restricted-syntax -- ops-internal; raw grid/flex layouts intentional for dense data tables` | justified |
| `src/app/pages/ops/ClientBrandAuditPage.tsx` | 2 | `eslint-disable*` | `tailwindcss/no-custom-classname -- deck-slide/deck-cover/deck-footer-screen are print CSS hooks, not Tailwind classes` | justified |
| `src/app/pages/ops/ClientReportPage.tsx` | 2 | `eslint-disable*` | `tailwindcss/no-custom-classname -- report-section is a print CSS hook, not a Tailwind class` | justified |
| `src/app/pages/ops/CostBurnWidget.tsx` | 2 | `eslint-disable*` | `no-restricted-syntax -- ops-internal; grid layouts intentional for responsive data tables` | justified |
| `src/app/pages/ops/Disclosure.tsx` | 2 | `eslint-disable*` | `react-hooks/set-state-in-effect -- localStorage hydration on mount is intentional: avoids SSR mismatch` | justified |
| `src/app/pages/ops/Disclosure.tsx` | 3 | `eslint-disable*` | `no-restricted-syntax -- ops-internal; grid layout intentional` | justified |
| `src/app/pages/ops/OpsDashboardPage.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `src/app/pages/ops/StagingPage.tsx` | 2 | `eslint-disable*` | `react-hooks/set-state-in-effect -- localStorage queue hydration on mount is intentional` | justified |
| `src/app/pages/ops/agentic-os/ResearchBar.tsx` | 2 | `eslint-disable*` | `react-hooks/set-state-in-effect -- mount-time data hydration via fetch is intentional: matches PluginsBar / SkillsBar idiom and avoids SSR mismatch` | justified |
| `src/app/pages/ops/agentic-os/SkillCreatorForm.tsx` | 2 | `eslint-disable*` | `react-hooks/set-state-in-effect -- mount-time queue hydration via fetch is intentional: matches PluginsBar / ResearchBar idiom and avoids SSR mismatch` | justified |
| `src/app/pages/ops/agentic-os/SkillsBar.test.tsx` | 16 | `eslint-disable-next-line` | `@typescript-eslint/no-explicit-any` | justified |
| `src/app/pages/ops/kanban/KanbanCard.tsx` | 2 | `eslint-disable*` | `react-hooks/purity -- Date.now() in render is intentional for live relative timestamps in kanban cards` | justified |
| `src/app/pages/ops/kanban/useArchivedTasks.ts` | 1 | `eslint-disable*` | `react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect body to hydrate from API` | justified |
| `src/app/pages/ops/kanban/useKanbanBoard.ts` | 1 | `eslint-disable*` | `react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect to hydrate board from API` | justified |
| `src/app/pages/ops/kanban/useKanbanBoard.ts` | 2 | `eslint-disable*` | `react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management` | justified |
| `src/app/pages/ops/kanban/useOpenThreads.ts` | 1 | `eslint-disable*` | `react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect to hydrate threads from API` | justified |
| `src/app/pages/ops/kanban/useOpenThreads.ts` | 2 | `eslint-disable*` | `react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management` | justified |
| `src/app/pages/ops/kanban/useProposedUnits.ts` | 1 | `eslint-disable*` | `react-hooks/set-state-in-effect -- polling hook intentionally calls setState in effect to hydrate data from API` | justified |
| `src/app/pages/ops/kanban/useProposedUnits.ts` | 2 | `eslint-disable*` | `react-hooks/immutability -- scheduleNext ref pattern is intentional for timer management` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 2 | `eslint-disable*` | `jsx-a11y/anchor-is-valid -- specimen demos use anchor-as-surface/action patterns intentionally` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 3 | `eslint-disable*` | `no-restricted-syntax -- specimen demos render raw grid layouts to demonstrate the pattern under evaluation` | justified |
| `src/app/pages/portal/ClientPortalPage.tsx` | 106 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/sketches/SketchbookShell.tsx` | 65 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/sketches/SketchbookShell.tsx` | 77 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 61 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 78 | `eslint-disable-next-line` | `react-hooks/immutability -- mutating scene.background is the R3F pattern for clear color` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 114 | `eslint-disable-next-line` | `no-console` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 116 | `eslint-disable-next-line` | `no-console` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 118 | `eslint-disable-next-line` | `no-console` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 152 | `eslint-disable-next-line` | `react-hooks/purity -- Math.random inside useMemo is safe (runs once per density change)` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 154 | `eslint-disable-next-line` | `react-hooks/purity` | justified |
| `src/app/pages/sketches/ThreeScenePage.tsx` | 156 | `eslint-disable-next-line` | `react-hooks/purity` | justified |
| `src/app/pages/sketches/imported/ClothSimulationLayout.tsx` | 158 | `eslint-disable-next-line` | `react-hooks/refs -- intentional mutable ref write during render for RAF color sync` | justified |
| `src/app/pages/sketches/imported/ClothSimulationLayout.tsx` | 160 | `eslint-disable-next-line` | `react-hooks/refs -- intentional mutable ref write during render for RAF color sync` | justified |
| `src/app/pages/sketches/imported/ClothSimulationLayout.tsx` | 165 | `eslint-disable-next-line` | `react-hooks/set-state-in-effect` | justified |
| `src/app/pages/sketches/private/BoidsFlockingLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/ElasticTextLayout.tsx` | 172 | `eslint-disable-next-line` | `react-hooks/refs -- read ref during render for layout calculation; container is stable` | justified |
| `src/app/pages/sketches/private/ElasticTextLayout.tsx` | 174 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/ElasticTextLayout.tsx` | 213 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/ElasticTextLayout.tsx` | 249 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/MagneticGridLayout.tsx` | 42 | `eslint-disable-next-line` | `react-hooks/refs -- read ref during render for layout calculation` | justified |
| `src/app/pages/sketches/private/MagneticGridLayout.tsx` | 44 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/MagneticGridLayout.tsx` | 69 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/MagneticGridLayout.tsx` | 96 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/MagneticGridLayout.tsx` | 123 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/MagneticParticlesLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/MagneticParticlesLayout.tsx` | 187 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- colors is a stable palette; adding it would restart the particle loop` | justified |
| `src/app/pages/sketches/private/MagneticParticlesLayout.tsx` | 217 | `eslint-disable-next-line` | `jsx-a11y/label-has-associated-control` | justified |
| `src/app/pages/sketches/private/MeshDeformationLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/MeshDeformationLayout.tsx` | 229 | `eslint-disable-next-line` | `jsx-a11y/label-has-associated-control` | justified |
| `src/app/pages/sketches/private/MetaballsLayout.tsx` | 48 | `eslint-disable-next-line` | `react-hooks/refs -- intentional mutable ref write during render for RAF sync` | justified |
| `src/app/pages/sketches/private/MetaballsLayout.tsx` | 50 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/MetaballsLayout.tsx` | 52 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/ParticleSandboxLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/PhysicsPlaygroundLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/PhysicsPlaygroundLayout.tsx` | 49 | `eslint-disable-next-line` | `react-hooks/refs -- intentional mutable ref write during render for RAF sync` | justified |
| `src/app/pages/sketches/private/PhysicsPlaygroundLayout.tsx` | 51 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/RigidBodyLayout.tsx` | 242 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- colors is a stable palette object; adding it would restart the physics loop` | justified |
| `src/app/pages/sketches/private/RigidBodyLayout.tsx` | 267 | `eslint-disable-next-line` | `react-hooks/refs -- reading ref in render for live body count display` | justified |
| `src/app/pages/sketches/private/SandPhysicsLayout.tsx` | 211 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- materials is a stable palette; adding it would restart the physics loop` | justified |
| `src/app/pages/sketches/private/ShapeExplorerLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/ShapeExplorerLayout.tsx` | 160 | `eslint-disable-next-line` | `react-hooks/refs -- intentional mutable ref write during render for RAF sync` | justified |
| `src/app/pages/sketches/private/ShapeExplorerLayout.tsx` | 162 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/ShapeExplorerLayout.tsx` | 164 | `eslint-disable-next-line` | `react-hooks/refs` | justified |
| `src/app/pages/sketches/private/SoftBodyLayout.tsx` | 232 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- colors is a stable palette; adding it would restart the physics loop` | justified |
| `src/app/pages/sketches/private/VerletRopeLayout.tsx` | 247 | `eslint-disable-next-line` | `react-hooks/exhaustive-deps -- colors is a stable palette object; adding it would restart the physics loop` | justified |
| `src/app/pages/sketches/private/VerletRopeLayout.tsx` | 272 | `eslint-disable-next-line` | `react-hooks/refs -- reading ref in render for live rope count display` | justified |
| `src/app/pages/sketches/private/WaveBackgroundLayout.tsx` | 2 | `eslint-disable*` | `@typescript-eslint/ban-ts-comment` | justified |
| `src/app/pages/sketches/private/WaveBackgroundLayout.tsx` | 96 | `eslint-disable*` | `react-hooks/use-memo, react-hooks/exhaustive-deps` | justified |
| `src/stories/surface.stories.tsx` | 1 | `eslint-disable*` | `no-restricted-syntax` | justified |
| `scripts/page-clone.mjs` | 321 | `eslint-disable*` | (none) | untriaged |
| `scripts/video-clone.mjs` | 373 | `eslint-disable*` | (none) | untriaged |

## @ts-ignore/@ts-expect-error

| File | Line | Rule | Reason | Status |
|------|------|------|--------|--------|
| `src/app/components/mobius-scene.tsx` | 900 | `@ts-expect-error` | `— dev/test telemetry hook` | justified |

## custom-sentinels (*-ok / hds-bypass)

| File | Line | Rule | Reason | Status |
|------|------|------|--------|--------|
| `src/app/App.tsx` | 20 | `spacing-ok` | `error boundary fallback, not a UI component */}` | justified |
| `src/app/components/CascadeText.tsx` | 76 | `audit-ok` | `orchestrated stagger — custom cubic-bezier + computed per-char delay; semantic motion tokens do not cover this easing curve` | justified |
| `src/app/components/OpsGate.tsx` | 8 | `hds-bypass` | `gate screen — 320px maxWidth is a fixed form measure, not a layout token */` | justified |
| `src/app/components/badge.tsx` | 75 | `audit-ok` | `no semantic token for 4% opacity overlay` | justified |
| `src/app/components/card.tsx` | 312 | `hds-bypass` | `INLINE_THIN_BAR — Card.Progress IS the progress bar primitive; height + token-bg is its raison d'être */` | justified |
| `src/app/components/componentPreviewRegistry.tsx` | 72 | `audit-ok` | `responsive container dimension derived from grid layout, not token-backed` | justified |
| `src/app/components/componentPreviewRegistry.tsx` | 85 | `audit-ok` | `responsive container dimension derived from grid layout, not token-backed` | justified |
| `src/app/components/disclosure.tsx` | 121 | `audit-ok` | `hds-focus applied via triggerClassName variable` | justified |
| `src/app/components/doc-sections.tsx` | 405 | `audit-ok` | `interactive demo area — fixed visual height, not a spacing/layout token` | justified |
| `src/app/components/foundation-swatch.tsx` | 158 | `hds-bypass` | `fixed specimen height keeps foundation swatches visually comparable across token demos` | justified |
| `src/app/components/morph-card.tsx` | 434 | `audit-ok` | `SVG fill transition — no token maps to 0.35s; hds.motion.productive.duration(0.15) is too fast for a color fill sweep` | justified |
| `src/app/components/nav-item.tsx` | 254 | `audit-ok` | `hds-focus applied via mergedClassName` | justified |
| `src/app/components/nav-item.tsx` | 275 | `audit-ok` | `hds-focus applied via mergedClassName` | justified |
| `src/app/components/side-nav.tsx` | 218 | `audit-ok` | `hds-focus applied via className` | justified |
| `src/app/components/side-nav.tsx` | 234 | `audit-ok` | `hds-focus applied via className` | justified |
| `src/app/components/sketch-controls.tsx` | 29 | `audit-ok` | `hds-focus applied via textarea className` | justified |
| `src/app/components/stacked-card-rail.tsx` | 54 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 66 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 67 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 83 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 126 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 127 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 168 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 169 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 174 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/stacked-card-rail.tsx` | 175 | `audit-ok` | `percentage fill in CSS template */` | justified |
| `src/app/components/text-lockup.tsx` | 9 | `font-ok` | `inline technical affordances within this lockup intentionally use monospace for code-like references` | justified |
| `src/app/data/hdsEditorial.tsx` | 55 | `audit-ok` | `*/) now supported. Self-healing policy documented: new violation classes must be added to script in same commit as fix.' },` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 1 | `hds-bypass` | `internal architecture-snapshot audit page. Intentionally renders code/terminal excerpts and tabular status with raw inline typography to mirror the diagnostic shape of the source it documents. Not user-facing canon. */` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 447 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: hds.semantic.space.component.padding, borderRadius: 'var(--component-card-radius)' /* tier-ok: internal audit page pre-block — uses card radius */, border: '1px solid var(--semantic-color-border-default)', overflow: 'auto', fontSize: '0.75rem', fontFamily: hds.monoFamily, lineHeight: 1.7, margin: 0 }}>` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 493 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: hds.semantic.space.component.padding, borderRadius: 'var(--component-card-radius)' /* tier-ok: internal audit page pre-block — uses card radius */, border: '1px solid var(--semantic-color-border-default)', overflow: 'auto', fontSize: '0.75rem', fontFamily: hds.monoFamily, lineHeight: 1.7, margin: 0 }}>` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 523 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: hds.semantic.space.component.padding, borderRadius: 'var(--component-card-radius)' /* tier-ok: internal audit page pre-block — uses card radius */, border: '1px solid var(--semantic-color-border-default)', overflow: 'auto', fontSize: '0.75rem', fontFamily: hds.monoFamily, lineHeight: 1.7, margin: 0 }}>` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 556 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: hds.semantic.space.component.padding, borderRadius: 'var(--component-card-radius)' /* tier-ok: internal audit page pre-block — uses card radius */, border: '1px solid var(--semantic-color-border-default)', overflow: 'auto', fontSize: '0.75rem', fontFamily: hds.monoFamily, lineHeight: 1.7, margin: 0 }}>` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 642 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: hds.semantic.space.component.padding, borderRadius: 'var(--component-card-radius)' /* tier-ok: internal audit page pre-block — uses card radius */, border: `1px solid var(--semantic-color-feedback-warning)`, overflow: 'auto', fontSize: '0.75rem', fontFamily: hds.monoFamily, lineHeight: 1.7, margin: 0 }}>` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 655 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: hds.semantic.space.component.padding, borderRadius: 'var(--component-card-radius)' /* tier-ok: internal audit page pre-block — uses card radius */, border: '1px solid var(--semantic-color-border-default)', overflow: 'auto', fontSize: '0.75rem', fontFamily: hds.monoFamily, lineHeight: 1.7, margin: 0 }}>` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 662 | `audit-ok` | `SVG sweep — 350ms intentional, inside template-literal doc block` | justified |
| `src/app/pages/hds/ArchitectureSnapshotPage.tsx` | 676 | `audit-ok` | `inside template-literal doc block, canonical-aligned value (150ms = --primitive-duration-short)` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 1 | `hds-bypass` | `foundation color doc — WCAG_PAIRINGS contains intentional raw hex literals for contrast-ratio math data; values are not used as CSS color properties */` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 180 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 181 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 182 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 183 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 184 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 185 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 186 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 187 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 188 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ColorPage.tsx` | 189 | `audit-ok` | `token value showcase` | justified |
| `src/app/pages/hds/ComponentHealthPage.tsx` | 1 | `hds-bypass` | `internal health dashboard — executive summary page for the HDS build system, not a public user-facing doc page. Inline typography used for table readouts and status indicators. */` | justified |
| `src/app/pages/hds/ComponentHealthPage.tsx` | 447 | `font-ok` | `code file path label — intentional monospace for path readout` | justified |
| `src/app/pages/hds/ComponentHealthPage.tsx` | 453 | `font-ok` | `component name in health table — monospace for aligned tabular readout` | justified |
| `src/app/pages/hds/ComponentHealthPage.tsx` | 532 | `spacing-ok` | `internal health table tight row, 4px = subgrid hairline` | justified |
| `src/app/pages/hds/ComponentHealthPage.tsx` | 540 | `spacing-ok` | `internal health table tight row, 4px = subgrid hairline` | justified |
| `src/app/pages/hds/ComponentHealthPage.tsx` | 618 | `spacing-ok` | `legend pip + label tight pairing, 4px = subgrid hairline` | justified |
| `src/app/pages/hds/HDSLayout.tsx` | 1295 | `audit-ok` | `main is tabIndex={-1} — programmatic skip-link target only, never receives keyboard Tab focus` | justified |
| `src/app/pages/hds/HdsDocPrimitives.tsx` | 44 | `hds-bypass` | `primitive documentation */` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 1 | `hds-bypass` | `BG_WHITE_BLACK, DATA_TENANT, INLINE_STRUCTURAL_BORDER */` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 86 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 87 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 88 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 89 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 90 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 91 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 92 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 93 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 94 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 95 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 96 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 97 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 98 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 99 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 100 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 101 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 112 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 113 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 114 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 115 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 116 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 117 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 118 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 119 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 120 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 121 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 122 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 123 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 124 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 125 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 126 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/MultiBrandThemingPage.tsx` | 127 | `audit-ok` | `brand palette demo content` | justified |
| `src/app/pages/hds/OpsPage.tsx` | 2 | `hds-bypass` | `internal workspace HQ. Not user-facing canon. */` | justified |
| `src/app/pages/hds/SandboxPage.tsx` | 12 | `hds-bypass` | `error-fallback path renders raw monospace 12px when the design-system context is unavailable — defensive on purpose so registry diagnostics still surface. Not user-facing canon. */` | justified |
| `src/app/pages/hds/SandboxPage.tsx` | 139 | `font-ok` | `sandbox error fallback intentionally uses raw monospace so registry diagnostics render even when the design-system context is unavailable` | justified |
| `src/app/pages/hds/SandboxPage.tsx` | 140 | `spacing-ok` | `error boundary fallback — hds context may be unavailable; raw 24px preserves diagnostic legibility` | justified |
| `src/app/pages/hds/SpacingPage.tsx` | 270 | `hds-bypass` | `demo-grid-visualization — explicit pixel values intentionally show the 8px grid step */}` | justified |
| `src/app/pages/hds/SpacingTestPage.tsx` | 1 | `hds-bypass` | `test page with hardcoded demo styles for visual audit */` | justified |
| `src/app/pages/hds/SpacingTestPage.tsx` | 2 | `font-ok` | `spacing test page intentionally uses monospace demo labels during visual inspection` | justified |
| `src/app/pages/hds/TokenCascadeDiagram.tsx` | 108 | `audit-ok` | `CSS var references only` | justified |
| `src/app/pages/hds/TokensPage.tsx` | 272 | `audit-ok` | `content rail minimum height is derived from viewport inset math` | justified |
| `src/app/pages/hds/TypographyPage.tsx` | 14 | `hds-bypass` | `typography reference page intentionally exposes primitive specimen values` | justified |
| `src/app/pages/hds/TypographyTestPage.tsx` | 1 | `hds-bypass` | `test page with hardcoded demo styles for visual audit */` | justified |
| `src/app/pages/hds/TypographyTestPage.tsx` | 2 | `font-ok` | `typography test page intentionally uses monospace demo labels during visual inspection` | justified |
| `src/app/pages/hds/TypographyTestPage.tsx` | 106 | `audit-ok` | `code-block surface — theme-aware fallback` | justified |
| `src/app/pages/hds/TypographyTestPage.tsx` | 120 | `audit-ok` | `code-block surface — theme-aware fallback */ padding: '0.25rem 0.5rem', borderRadius: hds.borderRadius[2], display: 'inline-block' }}>` | justified |
| `src/app/pages/hds/VisualsPage.tsx` | 22 | `audit-ok` | `sr-only utility uses a one-pixel clipping dimension` | justified |
| `src/app/pages/hds/VisualsPage.tsx` | 23 | `audit-ok` | `sr-only utility uses a one-pixel clipping dimension` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 63 | `audit-ok` | `demo placeholder div illustrating Stack layout — fixed px intentional for visual demo` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 64 | `audit-ok` | `demo placeholder div illustrating Stack layout — fixed px intentional for visual demo` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 69 | `audit-ok` | `demo placeholder — not a component dimension */}` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 78 | `audit-ok` | `demo placeholder */}` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 87 | `audit-ok` | `demo placeholder */}` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 99 | `audit-ok` | `demo placeholder */}` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 108 | `audit-ok` | `demo placeholder */}` | justified |
| `src/app/pages/hds/components/LayoutPage.tsx` | 117 | `audit-ok` | `demo placeholder */}` | justified |
| `src/app/pages/hds/portfolioData.tsx` | 4 | `hds-bypass` | `brand-mark letterforms (Ag logo SVG) intentionally use raw display weight + size for the SVG <text> render — these are graphic primitives, not body type. */` | justified |
| `src/app/pages/ops/AtlasPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/BriefingPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/BuildPage.tsx` | 1 | `hds-bypass` | `ops-internal page; not user-facing canon. */` | justified |
| `src/app/pages/ops/ClientBrandAuditPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/ClientDashboardPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/ClientReportPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/ClientsIndexPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/CostBurnWidget.tsx` | 1 | `hds-bypass` | `ops-internal widget. Raw grid layouts intentional for dense data tables. */` | justified |
| `src/app/pages/ops/CostBurnWidget.tsx` | 18 | `hds-bypass` | `ops-internal widget. Inline styles intentional for data-driven SVG dimensions. */` | justified |
| `src/app/pages/ops/CostBurnWidget.tsx` | 354 | `audit-ok` | `progress bar track height — thin bar, not a layout dimension` | justified |
| `src/app/pages/ops/Disclosure.tsx` | 1 | `hds-bypass` | `ops-internal chrome. Inline styles intentional for standalone ops surfaces. */` | justified |
| `src/app/pages/ops/KnowledgePage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/OpsCommandPalette.tsx` | 1 | `hds-bypass` | `ops-internal overlay. Inline styles intentional for ops dashboard. */` | justified |
| `src/app/pages/ops/OpsDashboardPage.tsx` | 2 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/OpsShell.tsx` | 1 | `hds-bypass` | `ops-internal layout. Inline styles intentional for ops dashboard. */` | justified |
| `src/app/pages/ops/OpsShell.tsx` | 61 | `spacing-ok` | `fixed FAB viewport anchor` | justified |
| `src/app/pages/ops/PageHeader.tsx` | 1 | `hds-bypass` | `ops-internal chrome. Inline styles intentional for standalone ops surfaces. */` | justified |
| `src/app/pages/ops/SecurityPostureWidget.tsx` | 1 | `hds-bypass` | `ops-internal widget. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/SessionInputForm.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for ops dashboard. */` | justified |
| `src/app/pages/ops/SessionsPage.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for ops dashboard. */` | justified |
| `src/app/pages/ops/SessionsSection.tsx` | 1 | `hds-bypass` | `ops-internal section. Inline styles intentional for ops dashboard. */` | justified |
| `src/app/pages/ops/StagingPage.tsx` | 1 | `hds-bypass` | `ops-internal staging surface — inline styles intentional. */` | justified |
| `src/app/pages/ops/agentic-os/AgenticOSPage.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/KpiCards.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/PillarRail.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/PluginsBar.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/ResearchBar.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/ServicesBar.tsx` | 1 | `hds-bypass` | `ops-internal page. Inline styles intentional for standalone ops surface. */` | justified |
| `src/app/pages/ops/agentic-os/SkillCreatorForm.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/SkillsBar.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/StatusBanner.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/agentic-os/SurfacesRail.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/atlas/clients-tab.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/atlas/component-graph.tsx` | 1 | `hds-bypass` | `ops-internal page. SVG graph with raw markdown parsing. */` | justified |
| `src/app/pages/ops/atlas/foundations-tab.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/atlas/knowledge-tab.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/atlas/pipeline-dag.tsx` | 1 | `hds-bypass` | `ops-internal page. SVG-driven DAG layout. */` | justified |
| `src/app/pages/ops/atlas/pipeline-dag.tsx` | 627 | `audit-ok` | `fixed label column for filter row alignment` | justified |
| `src/app/pages/ops/atlas/pipeline-dag.tsx` | 645 | `audit-ok` | `fixed label column for filter row alignment // audit-ok: fixed label column for filter row alignment` | justified |
| `src/app/pages/ops/atlas/pipeline-dag.tsx` | 670 | `audit-ok` | `fixed label column for filter row alignment // audit-ok: fixed label column for filter row alignment` | justified |
| `src/app/pages/ops/atlas/routes-tree.tsx` | 1 | `hds-bypass` | `ops-internal page. Vite raw import + brace-balanced parsing for route introspection. */` | justified |
| `src/app/pages/ops/atlas/strength-tab.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/atlas/tokens-tab.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/atlas/validators-tab.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/ArchiveDisclosure.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/BacklogDisclosure.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/KanbanCard.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/KanbanPage.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/LooseThreadsRail.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/OfflineBanner.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/PromotePopover.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/kanban/RoadmapDisclosure.tsx` | 1 | `hds-bypass` | `ops-internal page */` | justified |
| `src/app/pages/ops/staging/StagingChrome.tsx` | 1 | `hds-bypass` | `ops-internal staging chrome — inline styles intentional. */` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 1 | `hds-bypass` | `ops-internal staging surface — inline styles intentional for fast iteration. */` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 569 | `audit-ok` | `rank label, not hex color */}` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 570 | `audit-ok` | `rank label, not hex color */}` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 571 | `audit-ok` | `rank label, not hex color */}` | justified |
| `src/app/pages/ops/staging/specimens.tsx` | 572 | `audit-ok` | `rank label, not hex color */}` | justified |
| `src/app/pages/portal/ClientPortalPage.tsx` | 1 | `hds-bypass` | `standalone public-facing surface; no HDS sidebar/TOC chrome. The` | justified |
| `src/app/pages/sketches/private/BoidsFlockingLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/CombatArenaLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/ConstellationDrawerLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/CyberpunkGridLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/ElasticNodesLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/ElasticTextLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/GalleryWallLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/MagneticGridLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/MagneticParticlesLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/MagneticTextLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/MeshDeformationLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/MetaballsLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/ParticleSandboxLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/PhysicsPlaygroundLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/RigidBodyLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/RippleDistortionLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/SandPhysicsLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/ShapeExplorerLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/SoftBodyLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/SwarmAvoidanceLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/VerletRopeLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `src/app/pages/sketches/private/WaveBackgroundLayout.tsx` | 1 | `hds-bypass` | `experimental sketch layout — uses LegacyTokens shape from useTokens() which has no weight slot, so inline fontWeight values are intentional. */` | justified |
| `scripts/__tests__/build-token-index.test.mjs` | 262 | `audit-ok` | `hardcoded because WebGL shader constants` | justified |
| `scripts/__tests__/build-token-index.test.mjs` | 273 | `audit-ok` | `first reason\nconst a = 1;\n// audit-ok: second reason\n`;` | justified |
| `scripts/__tests__/build-token-index.test.mjs` | 286 | `audit-ok` | `reason with leading space  \n';` | justified |
| `scripts/audit-component-integrity.mjs` | 143 | `audit-ok` | `')) continue;` | justified |
| `scripts/audit-component-integrity.mjs` | 144 | `audit-ok` | `')) continue;` | justified |
| `scripts/audit-gate-replaceability.mjs` | 1102 | `spacing-ok` | `etc.) are well-formed. No industry tool manages project-specific inline suppression markers.',` | justified |
| `scripts/audit-pages.mjs` | 12 | `audit-ok` | `<reason>` | untriaged |
| `scripts/audit-pages.mjs` | 107 | `audit-ok` | `')) continue;` | justified |
| `scripts/audit-pages.mjs` | 108 | `audit-ok` | `')) continue;` | justified |
| `scripts/audit-pages.mjs` | 131 | `audit-ok` | `<reason> for an intentional editorial exception.\n');` | justified |
| `scripts/audit-tokens.mjs` | 535 | `audit-ok` | `reason */ or /* hds-bypass: reason */ or /* spacing-ok: reason */` | justified |
| `scripts/audit-tokens.mjs` | 535 | `hds-bypass` | `reason */ or /* spacing-ok: reason */` | justified |
| `scripts/audit-tokens.mjs` | 535 | `spacing-ok` | `reason */` | untriaged |
| `scripts/build-token-index.mjs` | 181 | `audit-ok` | `reason` comments in a file's content.` | justified |
| `scripts/check-dimensions.mjs` | 15 | `audit-ok` | `<reason> on the same line to suppress.` | justified |
| `scripts/check-dimensions.mjs` | 116 | `audit-ok` | `<reason>\n');` | justified |
| `scripts/check-doc-structure.mjs` | 178 | `hds-bypass` | `third-party-link both accepted)` | justified |
| `scripts/check-focus-states.mjs` | 23 | `audit-ok` | `<reason> to suppress a specific line` | justified |
| `scripts/check-focus-states.mjs` | 72 | `audit-ok` | `')) continue;` | justified |
| `scripts/check-focus-states.mjs` | 102 | `audit-ok` | `')) continue;` | justified |
| `scripts/check-hardcoded-spacing.mjs` | 15 | `spacing-ok` | `<reason> exemption pattern.` | justified |
| `scripts/check-hardcoded-spacing.mjs` | 27 | `spacing-ok` | `reason  (explicit exemption)` | justified |
| `scripts/check-hardcoded-spacing.mjs` | 33 | `spacing-ok` | `<reason> on the same line to suppress.` | justified |
| `scripts/check-hardcoded-spacing.mjs` | 160 | `spacing-ok` | `<reason>\n`);` | justified |
| `scripts/check-mono-roles.mjs` | 11 | `font-ok` | `<reason>` on the offending line.` | justified |
| `scripts/check-source-canon.mjs` | 101 | `hds-bypass` | `CODE1, CODE2, ... */` | justified |
| `scripts/check-source-canon.mjs` | 106 | `font-ok` | `...          — file intentionally uses bold/heavy weights` | justified |
| `scripts/check-source-canon.mjs` | 118 | `hds-bypass` | `<body> */  or  /* hds-bypass: <body>  (unclosed is fine)` | justified |
| `scripts/check-source-canon.mjs` | 135 | `hds-bypass` | `CODE1, CODE2 */ using codes from: ${[...ALL_RULE_CODES].join(', ')}\n`` | justified |
| `scripts/check-typography-discipline.mjs` | 21 | `font-ok` | `<reason>` on the offending line.` | justified |
| `scripts/check-typography-discipline.mjs` | 299 | `audit-ok` | `are intentional.` | justified |
| `scripts/check-typography-discipline.mjs` | 383 | `font-ok` | `<reason>" to annotate intentional exceptions.',` | justified |

## Summary Stats

- **Total suppressions:** 362
- **Justified (reason >= 10 chars):** 358
- **Untriaged (reason < 10 chars or missing):** 4

Scope reduced to inventory-only — resolution of untriaged suppressions deferred to follow-up units.
