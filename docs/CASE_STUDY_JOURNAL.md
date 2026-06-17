# Case Study Journal

Timestamped Dev Notes for autonomous visual fixes, self-heals, and layout reconciliation work.

Add one entry per fix with:

- timestamp
- page or route
- layout drift observed
- reconciliation applied

## 2026-04-24 04:15:14Z

- timestamp: `2026-04-24 04:15:14Z`
- page or route: `system-wide foundations and shared layout primitives`
- layout drift observed: `audit-tokens reported 22 primitive token bypasses, one fixed-height specimen surface override, and local @media responsiveness embedded in Grid; the layout suite was also blocked because the Playwright Vite server could not bind inside the sandboxed host configuration.`
- reconciliation applied: `Added scripts/self-heal.mjs and the package heal entrypoint, remapped primitive spacing calls to semantic or size tokens, exposed semantic subgrid xs through tokens.ts, moved Grid responsiveness to breakpoint-driven runtime columns instead of injected media queries, documented the intentional foundation swatch frame with an explicit bypass, and constrained the Playwright web server to localhost so pnpm run heal completes green end-to-end.`

## 2026-04-24 04:46:14Z

- timestamp: `2026-04-24 04:46:14Z`
- page or route: `/hds/typography, /hds/color, /hds/spacing, /hds/shape`
- layout drift observed: `Color, Spacing, and Shape were still using mixed legacy doc chrome instead of the embedded DocLayout foundation pattern, and the self-heal workflow had no runtime smoke gate for route crashes, console errors, or white-screen renders.`
- reconciliation applied: `Extended scripts/self-heal.mjs with a Playwright smoke mode that captures pageerror stacks, console.error payloads, and empty-body failures in the AI diagnostic report; added pnpm run heal:smoke plus the new orchestration/history docs; expanded the embedded foundation DocLayout shell to Color, Spacing, and Shape; and refactored those pages onto the Typography-style FoundationDocPage + HdsFoundationSection + FoundationSwatch structure before re-running static and runtime heal checks to green.`

## 2026-04-24 05:26:31Z

- timestamp: `2026-04-24 05:26:31Z`
- page or route: `/hds, /hds/tokens, /hds/elevation, /hds/motion, /hds/breakpoints, /hds/components/*`
- layout drift observed: `Overview, token exploration, and multiple foundation/component index routes were still split across mixed legacy shells; the token explorer lacked a full-width DocLayout pass; docked utility controls still carried raw flex wrappers; and the Playwright integrity suite did not target Grid items or text-node containment with enough precision.`
- reconciliation applied: `Scaled the smaller utility typography tiers up in hirobius.tokens.json, regenerated the token outputs, moved overview/tokens/foundation/component index routes onto embedded DocLayout patterns, widened the token explorer to contentMaxWidth=max with flush panel shells, upgraded Table for stickier and roomier data presentation, replaced docked control wrappers with Stack/Grid in control/token list surfaces, added stable audit hooks to Grid and HdsSurface, and expanded the Playwright layout integrity pass so overlap and text overflow checks now cover the overhauled HDS documentation routes before heal and smoke passed green.`

## 2026-04-24 05:46:24Z

- timestamp: `2026-04-24 05:46:24Z`
- page or route: `/hds/tokens, embedded DocLayout foundation/component shells`
- layout drift observed: `Sticky documentation rails were entering from a padded grid wrapper instead of starting at viewport zero, which caused the nav and TOC to jump upward before sticking; Token Explorer also drifted out to contentMaxWidth=max, let its left library rail bleed down the page, and allowed the footer pager to ride too high relative to the main content column.`
- reconciliation applied: `Reset the embedded DocLayout wrappers to top-zero geometry, split sticky rail padding into inner scroll containers with strict sticky top 0 and height 100dvh, restored Token Explorer to contentMaxWidth=content, added a sticky max-height scroll shell for the left library list, and reintroduced a full-column minimum height on the page content so the shared footer pager stays below the data surfaces.`

## 2026-04-24 06:03:40Z

- timestamp: `2026-04-24 06:03:40Z`
- page or route: `/hds, /hds/tokens, /hds/components/actions, /hds/components/inputs, /hds/components/display, /hds/components/feedback, /hds/components/layout, /hds/components/navigation, /hds/components/doc-utilities`
- layout drift observed: `Primary heroes were still boxed inside shared doc chrome, the overview and component index routes leaned on repetitive card dividers instead of editorial hierarchy, and the Token Explorer detail columns had lost their interior breathing room while the layout audit still allowed copy to sit directly against a surface edge.`
- reconciliation applied: `Removed the shared hero surface wrapper so page lockups now sit flush on the background, rebuilt the component index shell around a 12-column editorial 4/8 split with soft hover-only navigation cards, opened the overview architecture/pipeline/history sections into asymmetrical grids, restored component padding to the Token Explorer anatomy and details panels, and tightened the Playwright containment audit so text within 4px of a surface edge now fails before typecheck, layout, heal, and heal:smoke all passed green.`

## 2026-04-24 08:30:00Z

- timestamp: `2026-04-24 08:30:00Z`
- page or route: `/case-studies/hirobius`, `/hds/case-studies/hirobius`
- layout drift observed: `HirobiusCaseStudyPage was rendering a flat motion.article with an unslotted header and DocSection stack instead of the governed CaseStudyLayout slot anatomy. Standalone card surfaces used raw div+border+padding styles in violation of the HdsSurface containment rule. Unused imports (AnimatePresence, CaretDown, DocLinkCard, AUDIT_LOG, AuditSeverityIcon, auditSevColor, auditSevLabel) and a dead auditOpen state were present. The hero region had no Hero Rule enforcement documentation.`
- reconciliation applied: `Migrated HirobiusCaseStudyPage to CaseStudyLayout with heroSlot (title + sidebar grid, flush on background, no HdsSurface per Hero Rule), introSlot (Problem section at prose maxWidth), metricsSlot (Governance Snapshot pair as governed HdsSurface KPI cards), and contentSlot (Delivery Pipeline, Process Signals, Repo History, Commit Trail, Outcome/Impact, Useful Entry Points wrapped in Grid columns=1 spacious). Converted all standalone card surfaces from raw border/padding divs to HdsSurface. Removed all unused imports and dead state. Followed motion.article wrapper pattern from MicrosoftDesignSystemsPage. All 17 layout-integrity tests and typecheck passed green.`

## 2026-04-24 07:36:43Z

- timestamp: `2026-04-24 07:36:43Z`
- page or route: `DocLayout, CaseStudyLayout, component documentation surfaces, and the visual/performance verification lane`
- layout drift observed: `Phase 11 guardrails were still incomplete: accessibility audits were soft-failing and not part of the autonomous loop, visual regression checks had no explicit diff-map artifact, runtime slot crashes could still white-screen a whole doc or case-study shell, and the first hard-stop a11y pass exposed non-focusable scroll regions in the component property tables.`
- reconciliation applied: `Hardened tests/a11y.spec.ts into a blocking axe pass across foundation and component routes, serialized self-heal Playwright checks, made Table scroll regions keyboard-focusable, added a slot-scoped ErrorBoundary around DocLayout and CaseStudyLayout rails/content, upgraded tests/visual.spec.ts and scripts/visual-ingest.mjs to use pixelmatch with a 0.1% tolerance and neon-pink diff maps, and wired package perf budgets through size-limit before re-running typecheck, heal, heal:smoke, a11y, visual baseline generation, visual compare, and the perf budget to green.`

## 2026-04-25 00:33:40Z

- timestamp: `2026-04-25 00:33:40Z`
- page or route: `DocLayout, /hds/tokens, /hds/spacing, shared token/nav primitives`
- layout drift observed: `The doc shell rails were inheriting top inset from the shared grid and rail content wrapper, which made the sticky nav and TOC sit below the viewport ceiling; the token explorer still stacked extra surface shells around the library/anatomy/details columns; long token paths truncated from the wrong edge; and the large spacing specimens could overrun their foundation swatch frames.`
- reconciliation applied: `Reset the DocLayout rail path to sticky top 0 with height 100dvh and no rail-top padding, moved breathing room to the content column only, stripped the token explorer's outer HdsSurface wrappers in the page and library panel, flattened the anatomy trace/composite wrappers to plain layout containers, aligned the sidebar title and section labels without nested surfaces, switched shared token path truncation to left-ellipsis behavior, reduced copy-rail inline code indentation, and clamped spacing specimen bars with max-width plus overflow containment before re-running typecheck and the full layout suite to green.`

## 2026-04-25 01:00:38Z

- timestamp: `2026-04-25 01:00:38Z`
- page or route: `DocLayout, embedded HDS foundation pages, /hds/tokens, shared token explorer primitives`
- layout drift observed: `Embedded DocLayout pages were still receiving their vertical breathing room from outer shell padding instead of the grid itself, which delayed sticky activation and created an oversized top gap; the token explorer library column still carried nested surface chrome through sticky section headers and background wrappers; large spacing specimen bars could still threaten column containment; and several token path readouts were still truncating from the wrong edge in lab-side inspectors.`
- reconciliation applied: `Moved the embedded doc breathing room into DocLayout's grid with a single 40px sticky offset shared by the nav, TOC, and token library rail; removed the embedded-doc top padding from HDSLayout; flattened token collection headers and the library panel background so the explorer columns sit flush on the page; tightened spacing specimen overflow behavior; and applied left-side ellipsis rules to the remaining token inspector text rows before re-running typecheck and the layout suite.`

## 2026-04-25 01:14:47Z

- timestamp: `2026-04-25 01:14:47Z`
- page or route: `DocLayout, embedded HDS foundation/component docs, /hds shell sidebar`
- layout drift observed: `Embedded DocLayout pages were still letting the shared pager and footer render outside the center grid column, so the three-column grid ended early and the sticky left/right rails released upward before the document truly finished; the HDS shell sidebar also rendered Foundations with looser label/list rhythm than the Components disclosure group.`
- reconciliation applied: `Added an embedded DocLayout bottom-slot context so HDSLayout can hand the shared pager/footer to DocLayout and render them inside the center content column with extra bottom breathing room, removed the duplicate embedded footer branch from HDSLayout, wrapped the HDS shell Foundations links in the same side-nav group structure as Components, normalized the sidebar group stack gap to 24px in both the shell and HdsSidebarNav, and re-ran pnpm typecheck plus pnpm test:layout to green.`

## 2026-04-26 19:30:55Z

- timestamp: `2026-04-26 19:30:55Z`
- page or route: `/vibe-sketchbook/*`
- layout drift observed: `The mobile SketchbookShell rendered the shared ControlsPanel as a persistent fixed overlay, so the controls surface sat over the stage and intercepted canvas gestures across sketch routes.`
- reconciliation applied: `Moved mobile sketch controls behind a shell-owned icon toggle and rendered the panel as an animated bottom drawer only while open, leaving the desktop sidebar path unchanged and keeping the closed mobile canvas fully interactive.`

## 2026-04-25 02:50:01Z

- timestamp: `2026-04-25 02:50:01Z`
- page or route: `DocLayout, HDSLayout, shared doc footer spacing`
- layout drift observed: `The embedded doc shell still stored its terminal breathing room on an outer center-column wrapper while HDSLayout kept an additional bottom pad on the root main surface, creating ghost bottom spacing where sticky rails could detach before the content lane truly ended. The footer note also carried its own trailing margin, which stacked another hidden spacer onto the page end.`
- reconciliation applied: `Moved the deliberate end buffer off the outer wrappers and onto the actual content lane that owns the pager/footer, set HDSLayout root main bottom padding to zero for embedded DocLayout routes while preserving the established top inset, removed the footer note's terminal margin so the page ends on one governed spacer, and re-ran pnpm typecheck plus pnpm test:layout to confirm the shell header and Mobius alignment remained stable.`

## 2026-04-25 11:55:00Z

- timestamp: `2026-04-25 11:55:00Z`
- page or route: `PortfolioHomePage (/)`
- layout drift observed: `The homepage had no reading-column intro section — the 12-column HDS grid was bypassed entirely in favor of a raw CSS grid (`shellEntryGridStyle`) for the portfolio entry tiles. The case studies had no dedicated section with proper visual weight parity, and the Vibe Sketchbook was represented only as one of four MorphCard tiles rather than a premium interactive-lab teaser. The `useIsMobile` import was live but its only consumer (the raw grid `maxWidth` branch) was the forbidden pattern.`
- reconciliation applied: `Extracted all static data (logos, cards, constants) into `portfolioData.tsx` to keep the page under 200 lines. Replaced `shellEntryGridStyle` raw CSS grid with `Grid layout="auto-fit"` constrained via the `--hds-local-HomeTiles-maxWidth` local override token. Added a 12-column reading-column section: `Grid columns={12}` with a full-width item using `display:flex; justify-content:center` and an inner `Stack maxWidth 660px` hosting `TextLockup size="heroXl" align="center"`. Added a Case Studies section with `Grid columns={12} gap="normal"`, each slot in `colSpan={6}` — Hirobius DS, Microsoft DS, and a ComingSoonCard placeholder matching visual weight via shared `HdsSurface` shells. Added a Vibe Teaser section as a full-bleed `HdsSurface as="section"` with `--hds-local-VibeTeaser-bg` set to `semantic.color.feedback.bg.success`, border and borderRadius removed, a 7/5 column split with `TextLockup` copy and a sketch-label list via `InlineLink`. All typography tokens, spacing tokens, and surface primitives sourced exclusively from HDS. Typecheck and 17/17 layout-integrity tests passed green.`

## 2026-04-25 10:25:00Z

- timestamp: `2026-04-25 10:25:00Z`
- page or route: `/vibe-sketchbook/* canvas routes, shared SketchbookShell stage`
- layout drift observed: `Canvas-heavy sketches were mixing viewport sizing with renderer mounting. Several routes handed SketchbookShell a shrink-wrapped root node while the actual canvas lived in an absolute child, so the stage could collapse, align left, or fragment into a smaller-than-expected draw box depending on the sketch wrapper.`
- reconciliation applied: `Introduced a shared SketchCanvasStage that separates the centered layout shell from the absolute-fill canvas mount, capped desktop canvas width at the governed 10-of-12 desktop track, added shell-level direct-child stretch rules so sketch roots inherit width and height reliably, and routed both live WebGL pages plus imported canvas sketches through the same parent-box sizing model before re-running typecheck and the layout suite.`

## 2026-04-26 17:23:37Z

- timestamp: `2026-04-26 17:23:37Z`
- page or route: `/vibe-sketchbook/logo-lab`, shared `SketchCanvasStage`
- layout drift observed: `The shared sketch canvas shell still inherited height from shrink-wrapped parents, so the centered stage could collapse upward and leave the persistent Möbius context pinned near the viewport top. Logo Lab also rendered its JSON scene editor inside the relative stage area, which let the drawer overlap the centered Möbius read during immersive tuning.`
- reconciliation applied: `Pinned the shared canvas shell to 600px on mobile and 80vh from the desktop breakpoint up, preserved the absolute-fill mount contract for canvas children, added shell-level flex centering in SketchCanvasStage, routed Logo Lab through the shared stage, and moved the JSON scene editor into a dedicated SketchbookShell side drawer so the 3D context and editor now occupy separate lanes before re-running validation.`

## 2026-04-26T00:00:00Z

- timestamp: `2026-04-26 00:00:00Z`
- page or route: `system-wide — HdsSurface, Badge, PortfolioHomePage case study cards`
- layout drift observed: `HdsSurface defaulted to a 1px solid border on every card and panel, creating a visually noisy outlined grid on the portfolio home page. Badge used monospaced technical typography and a bordered neutral style, misaligning it with the minimalist aesthetic direction. The Vibe Teaser surface redundantly overrode border:none.`
- reconciliation applied: `Pivoted HdsSurface to a borderless elevation model — default border removed, shadow prop now applies a two-layer box-shadow (0 4px 12px rgba(0,0,0,0.10), 0 2px 4px rgba(0,0,0,0.05)). Badge swapped hds.typeStyles.technical for hds.typeStyles.ui with 11px/uppercase/0.04em letter-spacing and a theme-aware ghost neutral background (rgba(255,255,255,0.04) dark / rgba(0,0,0,0.04) light). Added shadow prop to CaseStudyCard and ComingSoonCard in PortfolioHomePage; removed the now-redundant border:none override from the Vibe Teaser surface. pnpm typecheck and pnpm test:layout both passed 17/17 green.`

## 2026-04-26T18:00:00Z

- timestamp: `2026-04-26 18:00:00Z`
- page or route: `/microsoft-design-systems`, `/case-studies/hirobius`, and all routes using `DocSection` from `HdsDocPrimitives`
- layout drift observed: Three layout regressions on case study pages: (1) `DocSection` wrapped every section heading in `HdsSurface padding="component"`, producing a full-width 24px-padded raised box for each h2 ("Process", "Learnings", etc.) — a massive chrome surface instead of a plain heading. (2) `TocPanel` used `height: calc(100vh - ...)` on its `<aside>` and `overflowY: auto` on the inner `<nav>`, creating a second scroll container nested inside the page body lane. (3) The TOC sticky wrapper div carried `minHeight: 100vh`, which forced the right rail grid column to a minimum of full viewport height even when the TOC had few items.
- reconciliation applied: Replaced `<HdsSurface>` in `DocSection`'s title slot with a plain `<div>` preserving the same flex row layout but removing the background, padding, and border-radius chrome. Set `tocPanelStyle.height` to `'fit-content'` and replaced the inner `<nav>` overflow/flex constraints with a simple `overflowX: hidden` so the body scroll owns the TOC lane entirely. Changed the TOC sticky wrapper `minHeight: '100vh'` to `height: 'fit-content'`. Typecheck clean; all 17 layout-integrity tests green.

## 2026-04-26 17:43:27Z

- timestamp: `2026-04-26 17:43:27Z`
- page or route: `/vibe-sketchbook/three-scene`, `/vibe-sketchbook/cyberpunk-grid`
- layout drift observed: `Three Scene still carried local overlay copy inside the canvas stage and resolved its renderer backdrop independently from the semantic page surface. Cyberpunk Grid kept a custom section/sidebar shell instead of the shared SketchCanvasStage overlay contract, which made its controls path diverge from the rest of the sketchbook HUD.`
- reconciliation applied: `Mapped Three Scene renderer clear color and stage background to semantic surface tokens, kept its mesh accent on semantic.color.surface.accent, and moved the control stack onto HDS HUD primitives. Rebuilt Cyberpunk Grid around SketchCanvasStage with an ControlsPanel side drawer, ControlsSection sliders, and semantic page-background stage/canvas styling before re-running typecheck and the layout suite to green.`

## 2026-04-26 19:01:00Z

- timestamp: `2026-04-26 19:01:00Z`
- page or route: `PortfolioHomePage (/)`
- layout drift observed: `The shell-level Mobius anchor and the homepage hero text used only the normal stack rhythm, letting the 3D canvas read overlap the hero headline block.`
- reconciliation applied: `Increased the hero section Stack gap to the governed px96 spacing token so the text block clears the Mobius anchor without introducing ad hoc margins or local canvas transforms.`

## 2026-04-26 19:24:00Z

- timestamp: `2026-04-26 19:24:00Z`
- page or route: `/visuals`
- layout drift observed: `The Visual Design archive still rendered as stacked illustration sections, so the page did not expose the intended bento/masonry rhythm and relied on one-off inline span branching instead of a reusable grid primitive for portfolio media.`
- reconciliation applied: `Introduced a VisualsBentoGrid helper that feeds the existing slot data through safe colSpan/rowSpan defaults, maps card radius/border/surface/muted copy to HDS CSS variables, preserves motion/react viewport entrance and hover movement, and moves the responsive one-column/four-column grid behavior into scoped theme.css rules.`
