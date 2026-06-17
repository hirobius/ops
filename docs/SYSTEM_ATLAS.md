# System Atlas

Generated: 2026-05-01T17:37:33.428Z

Scope:
- `src/app/components/`
- `src/app/layouts/`
- `src/app/pages/hds/`

## Summary

- Files scanned: 130
- Primitives: 66
- Layouts: 6
- Pages: 35
- Utilities: 23
- Files with top-of-file intent comments: 104
- Files without top-of-file intent comments: 26

## Classification Rules

- `Primitives` covers component-library files in `src/app/components/` that primarily render UI.
- `Layouts` covers `src/app/layouts/` plus route-level shells/layout wrappers.
- `Pages` covers HDS route/page modules.
- `Utilities` covers helpers, registries, contexts, and page-support modules.

## Dependency Chains

Direct file-level HDS edges:

- `HDSLayout` -> `DocPageFooterNote`, `DocPageSpec`, `Badge`, `HdsButton`, `Container`, `DocLinkCard`, `Icon`, `IconButton`, `NavGroup`, `NavItem`, `HdsSidebarUtilityButton`, `Stack`, `HdsSurface`, `DocLayout`, `EmbeddedDocLayoutProvider`, `TocProvider`
- `HdsComponentDoc` -> `Alert`, `HdsButton`, `Disclosure`, `Icon`, `PreviewFrame`, `SegmentedControl`, `SpecimenBlock`, `HdsSurface`, `Table`, `TextLockup`, `Token`, `buildPropTableRows`, `buildReflectiveTokenRows`, `TocProvider`
- `TypographyPage` -> `FoundationSwatch`, `Grid`, `NavGroup`, `NavItem`, `HdsSidebarNav`, `Stack`, `Table`, `Text`, `TextLockup`, `Token`, `DocLayout`, `DocPageHeader`, `TocProvider`
- `OverviewPage` -> `Badge`, `HdsButton`, `HdsButtonGroup`, `DocLinkCard`, `Grid`, `HistoryCard`, `Icon`, `HdsSurface`, `TextLockup`, `DocPageHeader`, `HdsSystemDocLayout`, `TocProvider`
- `DocPageHeader` -> `HdsButton`, `Icon`, `PreviewFrame`, `Stack`, `HdsSurface`, `Table`, `Text`, `TextLockup`, `Token`, `buildPropTableRows`, `TocProvider`
- `LegacyTokenExplorerPanel` -> `HdsSlider`, `Icon`, `IconButton`, `Input`, `Stack`, `Tag`, `LegacyTokenList`, `TokenCollectionList`, `formatCategoryLabel`, `DocLayout`, `DocPageHeader`
- `TokensPage` -> `HdsButton`, `Grid`, `Icon`, `Stack`, `LegacyTokenDetail`, `formatCategoryLabel`, `DocPageHeader`, `HdsSystemDocLayout`, `TocProvider`, `LegacyTokenExplorerPanel`
- `ComponentDocPageShell` -> `CategoryComponentDocs`, `Grid`, `Icon`, `Stack`, `Text`, `TextLockup`, `DocPageHeader`, `HdsSystemDocLayout`, `TocProvider`
- `MicrosoftDesignSystemsPage` -> `AssetImg`, `Grid`, `ImageLightbox`, `HdsSurface`, `TextLockup`, `CaseStudyLayout`, `DocPageHeader`, `TocProvider`, `PortfolioAssetFrame`
- `LegacyTokenDetail` -> `Badge`, `CodeBlock`, `Icon`, `InlineCode`, `InlineLink`, `Token`, `formatCategoryLabel`, `DocPageHeader`
- `InputsPage` -> `CategoryComponentDocs`, `ComponentInstanceMatrix`, `HdsSlider`, `Input`, `SegmentedControl`, `HdsSurface`, `ComponentDocPageShell`, `DocPageHeader`
- `ElevationPage` -> `FoundationSwatch`, `IconButton`, `PreviewFrame`, `Stack`, `HdsSurface`, `formatCategoryLabel`, `FoundationDocPage`, `DocPageHeader`
- `FoundationDocPage` -> `NavGroup`, `NavItem`, `HdsSidebarNav`, `Stack`, `Text`, `TextLockup`, `DocLayout`, `TocProvider`
- `SandboxPage` -> `Alert`, `Badge`, `HdsButton`, `Input`, `Stack`, `HdsSurface`, `Tag`, `TextLockup`
- `ImageLightbox` -> `AssetImg`, `HdsButton`, `Grid`, `Icon`, `InlineLink`, `Stack`, `HdsSurface`
- `HdsSystemDocLayout` -> `NavGroup`, `NavItem`, `HdsSidebarNav`, `Text`, `DocLayout`, `FoundationDocPage`, `TocProvider`
- `BreakpointsPage` -> `Stack`, `HdsSurface`, `Table`, `Text`, `Token`, `FoundationDocPage`, `DocPageHeader`
- `IconsPage` -> `Alert`, `Icon`, `Stack`, `HdsSurface`, `Text`, `Token`, `DocPageHeader`
- `MotionPage` -> `Stack`, `HdsSurface`, `Table`, `Text`, `Token`, `FoundationDocPage`, `DocPageHeader`
- `AutoPreviewSpecimen` -> `HdsButton`, `HdsButtonGroup`, `NavGroup`, `NavItem`, `PreviewFrame`, `Table`, `formatCategoryLabel`
- `DocLabel` -> `CascadeText`, `HdsButton`, `Icon`, `HdsSurface`, `Tag`, `Token`, `Tooltip`
- `DocShell` -> `CommandPalette`, `DocTOC`, `Stack`, `ThemeToggle`, `EmbeddedDocLayoutProvider`, `TocProvider`
- `ColorPage` -> `FoundationSwatch`, `Grid`, `Stack`, `Text`, `FoundationDocPage`, `DocPageHeader`
- `ActionsPage` -> `CategoryComponentDocs`, `HdsButton`, `ComponentInstanceMatrix`, `IconButton`, `ComponentDocPageShell`, `DocPageHeader`

Representative transitive chains:

- `ActionsPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `DisplayPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `DocUtilitiesPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `FeedbackPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `InputsPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `LayoutPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `NavigationPage` -> `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `VisualsPage` -> `visualsData` -> `VisualsBentoGrid` -> `PortfolioAssetFrame` -> `ImageLightbox` -> `AssetImg` -> `Tooltip` -> `Grid`
- `ComponentDocPageShell` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `OverviewPage` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `TokensPage` -> `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `visualsData` -> `VisualsBentoGrid` -> `PortfolioAssetFrame` -> `ImageLightbox` -> `AssetImg` -> `Tooltip` -> `Grid`
- `HdsSystemDocLayout` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `BreakpointsPage` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `ColorPage` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `ElevationPage` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `MicrosoftDesignSystemsPage` -> `PortfolioAssetFrame` -> `ImageLightbox` -> `AssetImg` -> `Tooltip` -> `Grid`
- `MotionPage` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `ShapePage` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `SpacingPage` -> `FoundationDocPage` -> `HdsSidebarNav` -> `NavGroup` -> `Disclosure` -> `Icon`
- `VisualsBentoGrid` -> `PortfolioAssetFrame` -> `ImageLightbox` -> `AssetImg` -> `Tooltip` -> `Grid`
- `HdsComponentDoc` -> `SpecimenBlock` -> `AutoPreviewSpecimen` -> `NavGroup` -> `Disclosure` -> `Icon`
- `SpecimenBlock` -> `AutoPreviewSpecimen` -> `NavGroup` -> `Disclosure` -> `Icon`
- `VariantPreviewDeck` -> `AutoPreviewSpecimen` -> `NavGroup` -> `Disclosure` -> `Icon`

## Primitives

### `CascadeText`
Path: `src/app/components/CascadeText.tsx`

Exports: `CascadeText (default)`

Local HDS dependencies:
- `src/app/components/Tag.tsx` via `Tag`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @doc-exempt: internal animation helper, not a consumer-facing HDS component

### `ActivityFeed`
Path: `src/app/components/ActivityFeed.tsx`

Exports: `ActivityFeed`, `ActivityFeed (alias of ActivityFeed)`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Stack.tsx` via `Stack`

Top comment:
> @tier pattern
> 
> @doc-exempt: internal portfolio and systems timeline pattern, not a standalone HDS doc surface
> 
> ActivityFeed — chronological system event log.
> @category Display
> 
> Renders a list of activity events using white space as the sole separator.
> No dividers, no borders between items. 48px gap (space.12) creates the
> visual grouping between events; 16px gap inside each item structures the
> content hierarchy.
> 
> Typography mapping:
>   title       → heading3  (24px/1.25)
>   description → body      (16px/1.5)
>   timestamp   → technical (12px/1.0 mono)
>   category    → ui        (14px/1.5)

### `Alert`
Path: `src/app/components/Alert.tsx`

Exports: `Alert`, `Alert (alias of Alert)`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`

Top comment:
> Alert - compact feedback surface with contextual severity.
> @category Feedback
> @tier primitive
> 
> Variants: success | error | warning | info
> Consumes semantic.color.feedback.* and semantic.color.feedback.bg.* token vars.
> Optional title. No dismiss affordance.
> 
> Validated against: Material UI (Alert), Ant Design (Alert), Chakra UI (Alert).
> Category: Display - non-interactive information presentation.

### `AnimatedLabel`
Path: `src/app/components/AnimatedLabel.tsx`

Exports: `AnimatedLabel`

Local HDS dependencies:
- None

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: animation slot helper used inside other surfaces; not a standalone component docs surface.
> 
> AnimatedLabel â€” animated text slot for use inside interactive surfaces.
> @category Utilities
> 
> Renders the shared CinematicLink text treatment (slide-up reveal + underline
> draw) as a composable span, not a standalone anchor. Designed to slot inside
> HdsButton asChild or any other interactive surface that owns the hover group.
> 
> Usage: add className="group" to the parent HdsButton (or any ancestor), then
> wrap the label text in <AnimatedLabel>. The group-hover classes activate on
> CSS :hover of the parent group element â€” no JS hover state needed.
> 
> @guide Slot pattern: This component is intentionally element-free at the root
>   level. The parent surface (button, anchor, etc.) owns semantic role, focus,
>   and pointer events. AnimatedLabel only owns the visual animation layer.
> 
> motion-ok: Uses cubic-bezier(0.19, 1, 0.22, 1) expo-out to match CinematicLink.
> Intentional design direction â€” matches the established animated link treatment.

### `ApiReference`
Path: `src/app/components/ApiReference.tsx`

Exports: `buildApiRowsFromManifest`, `ApiReference`, `ApiReference (default)`

Local HDS dependencies:
- None

Top comment:
> ApiReference — collapsed inline API reference for primitive/pattern doc pages.
> @category Utilities
> @tier utility
> 
> 9d-8 baseline: a single <details> block, closed by default, mounted at the
> bottom of every primitive/pattern doc page (mounting itself is 9d-9). Reads
> `componentSpec.props + propConstraints + slots[]` straight from the live HDS
> manifest (`virtual:hds-manifest`) and falls back to `component-api.json` for
> per-prop descriptions (the manifest carries shape, not JSDoc text).
> 
> Columns: name, type, default, description, required.
> 
> Design contract:
>   - Native <details>/<summary> — no JS toggle, no animation, no extra deps.
>     Matches the 9d-5 "Show Code" pattern: cheap, accessible, keyboard-native.
>   - Surface from role tokens only (border, content, surface) — no hex.
>   - Templates SKIP this block (templates compose primitives — link out
>     instead). Adrian-ratified judgment call 2026-05-01.
>   - Doc-tier internal scaffolding, not part of the public HDS authoring
>     surface (mirrors DocShell / SpecimenBlock conventions).
> 
> @doc-exempt: doc-tier scaffolding rendered at the bottom of generated component docs; not a consumer surface.

### `AssetImg`
Path: `src/app/components/AssetImg.tsx`

Exports: `AssetImg`

Local HDS dependencies:
- `src/app/components/Tooltip.tsx` via `Tooltip`

Top comment:
> @tier primitive

### `Badge`
Path: `src/app/components/Badge.tsx`

Exports: `Badge`, `Badge (alias of Badge)`

Local HDS dependencies:
- None

Top comment:
> @tier primitive

### `HdsButton`
Path: `src/app/components/HdsButton.tsx`

Exports: `HdsButton`

Local HDS dependencies:
- None

Top comment:
> HdsButton — shared button primitive for the Hirobius Design System.
> @category Actions
> @tier primitive
> 
> shadcn-baseline implementation (8s-4): cva-driven variants composed against
> role-token Tailwind utilities (bg-primary / text-primary-foreground /
> border-input / bg-accent / etc.) wired by 8e-2 + 8s-1. All visual decisions
> resolve through CSS custom properties — no inline style branching, no
> rgba() construction. Dark mode is handled by [data-theme="dark"] + .dark
> overrides on <html>, which Tailwind's class-based dark variant honors via
> tailwind.config.ts.
> 
> Variants:
>   primary   — solid brand fill (bg-primary). One accent per layout.
>   secondary — outlined; transparent rest, accent fill on hover.
>   tertiary  — ghost; no chrome at rest, accent surface on hover.
> 
> Sizes:
>   sm — 32px tall
>   md — 40px tall (default)
>   lg — 48px tall
> 
> iconOnly: collapses padding to a square aspect for icon-only controls.
>           Requires aria-label since there is no text node to name the control.
> 
> loading:  swaps the leading icon for a spinner, sets aria-busy and disabled.
> asChild:  renders the button chrome onto a single child element so a router
>           link or anchor can remain the semantic owner of navigation.
> isDark:   @deprecated — CSS vars are theme-aware. Retained for backward
>           compatibility; ignored internally.
> 
> @figma Variant=Button/Variant
> @figma Size=Button/Size

### `HdsButtonGroup`
Path: `src/app/components/HdsButtonGroup.tsx`

Exports: `HdsButtonGroup`

Local HDS dependencies:
- None

Top comment:
> HdsButtonGroup â€” layout wrapper for adjacent button actions.
> @category Actions
> @tier primitive

### `CardHeader`
Path: `src/app/components/Card.tsx`

Exports: `CardHeader`, `CardTitle`, `CardDescription`, `CardBody`, `CardFooter`

Local HDS dependencies:
- None

Top comment:
> Card — surface container (shadcn baseline, compound parts).
> @category Display
> @tier primitive
> @doc-exempt: generic surface primitive currently not surfaced in the active HDS component inventory
> 
> shadcn-baseline implementation (8s-6): role-token surface
> (bg-card text-card-foreground border rounded-lg) composed with
> compound parts so callers opt into anatomy where it helps.
> 
>   <Card>
>     <Card.Header>
>       <Card.Title>…</Card.Title>
>       <Card.Description>…</Card.Description>
>     </Card.Header>
>     <Card.Body>…</Card.Body>
>     <Card.Footer>…</Card.Footer>
>   </Card>
> 
> Each part is its own forwardRef component published on the root function
> (the standard React compound idiom). Parts apply their own padding (p-6
> with the shadcn vertical-rhythm offsets), so a Card composed entirely
> from parts should pass `padding="none"` on the root.
> 
> Legacy props (padding / gap / noPadding / as / style) are retained for
> existing callers that render raw children inside the root. The
> legacy padding map (`component | item | px24 | px16 | none`) is honored
> unchanged; new callers should prefer compound parts + `padding="none"`.
> 
> Depth comes from semantic.color.border.default (role.border) at rest;
> elevation tokens are not bound by default — pass `className="shadow-..."`
> for a hover/floating treatment on interactive cards.

### `CinematicLink`
Path: `src/app/components/CinematicLink.tsx`

Exports: `CinematicLink`

Local HDS dependencies:
- None

Top comment:
> CinematicLink - cinematic editorial link treatment for portfolio surfaces.
> @category Branding
> @tier primitive
> 
> motion-ok: CinematicLink uses custom CSS transition timing (cubic-bezier expo-out).
> The 0.5s theatrical slide is intentional design direction — semantic motion tokens
> are too short for this specific cinematic micro-interaction.

### `CodeBlock`
Path: `src/app/components/CodeBlock.tsx`

Exports: `CodeBlock`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`

Top comment:
> CodeBlock - code display with copy + optional collapsed-by-default Show Code toggle.
> @category Display
> @tier primitive
> 
> Variants:
>   - inline: single-line snippet with copy button (unchanged from baseline).
>   - block:  multi-line snippet with header (filename + language tag) and copy button.
> 
> 9d-5 upgrade: block variant supports `collapsible` mode where the
> code is hidden behind a "Show code" toggle below the live preview. Copy button stays
> pinned to the top-right of the expanded block. Backward-compatible — existing
> consumers default to `collapsible={false}` and render unchanged.
> 
> Syntax coloring: regex-based, no new dependency. Recognises a small set of
> tokens (keyword / string / comment / number / type) for ts/tsx/js/jsx/json/css/html.
> Other languages render as plain text.

### `CommandPalette`
Path: `src/app/components/CommandPalette.tsx`

Exports: `CommandPalette`, `CommandPalette (default)`

Local HDS dependencies:
- `src/app/components/Dialog.tsx` via `Dialog`

Top comment:
> CommandPalette — Cmd-K / Ctrl-K fuzzy-search over the HDS manifest.
> @category Overlays
> @tier utility
> @doc-exempt: doc-shell scaffolding (9d-2); not part of the public authoring surface
> 
> Built on Dialog (8s-7 / Radix) with a custom listbox + input. NO new
> npm deps — search is a hand-rolled subsequence + token-Levenshtein scorer
> (think micro-fzf). Indexes four corpora from `virtual:hds-manifest`:
> 
>   1. componentSpecs — non-hidden, non-docExempt entries (primitive / pattern / template)
>   2. utilities      — non-hidden entries (utility tier)
>   3. role tokens    — `role.*` entries from manifest.tokens.role
>   4. section anchors — curated /hds foundation + tokens pages
> 
> Each row carries a tier chip + brief description. Enter (or click)
> navigates via React Router; Esc closes. ↑/↓ wraps. Cmd-K / Ctrl-K
> toggles open from anywhere in the doc shell.
> 
> Result rows sanitize free-text: HMAC-style tokens (long hex / signed
> URL fragments that may leak from upstream description fields) are
> stripped before render.

### `ComponentInstanceMatrix`
Path: `src/app/components/ComponentInstanceMatrix.tsx`

Exports: `ComponentInstanceMatrix`

Local HDS dependencies:
- None

Top comment:
> @tier primitive
> 
> @doc-exempt: specimen matrix helper used by docs pages, not a consumer-facing HDS surface.
> 
> ComponentInstanceMatrix - responsive specimen matrix for variant and state parity.
> @category Utilities

### `Container`
Path: `src/app/components/Container.tsx`

Exports: `Container`, `Container (alias of Container)`

Local HDS dependencies:
- None

Top comment:
> Container — semantic width-constrained layout.
> @category Layout
> @tier primitive
> 
> Centers content horizontally and applies semantic max-width constraints.
> - maxWidth options: 'content' (760px prose) | 'max' (1200px full layout)
> - No arbitrary pixel values allowed
> 
> Usage:
>   <Container maxWidth="max">
>     <div>...</div>
>   </Container>

### `DialogOverlay`
Path: `src/app/components/Dialog.tsx`

Exports: `DialogOverlay`, `DialogContent`, `DialogHeader`, `DialogFooter`, `DialogTitle`, `DialogDescription`

Local HDS dependencies:
- None

Top comment:
> Dialog — modal dialog (shadcn baseline, compound parts).
> @category Overlays
> @tier primitive
> @doc-exempt: greenfield primitive landing in 8s-7; docs page follows in 8t-1
> 
> shadcn-baseline implementation (8s-7): Radix Dialog primitive
> (@radix-ui/react-dialog) themed with role tokens. Provides focus
> trap, scroll lock, ESC-to-close, backdrop scrim, and portal
> mounting out of the box.
> 
>   <Dialog>
>     <Dialog.Trigger asChild>
>       <HdsButton>Open</HdsButton>
>     </Dialog.Trigger>
>     <Dialog.Content>
>       <Dialog.Header>
>         <Dialog.Title>Confirm</Dialog.Title>
>         <Dialog.Description>Are you sure?</Dialog.Description>
>       </Dialog.Header>
>       <Dialog.Footer>
>         <Dialog.Close asChild>
>           <HdsButton variant="secondary">Cancel</HdsButton>
>         </Dialog.Close>
>       </Dialog.Footer>
>     </Dialog.Content>
>   </Dialog>
> 
> Surface uses role.popover (semantic.color.surface.overlay) +
> shadow-overlay (semantic.shadow.overlay from 8e-1). The scrim is
> a foreground/80 wash so it picks up the theme without a hardcoded
> black. The close affordance is rendered as an absolutely-positioned
> X inside Content; pass `hideClose` to opt out for fully-custom layouts.

### `Disclosure`
Path: `src/app/components/Disclosure.tsx`

Exports: `Disclosure`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> Disclosure - compact disclosure surface for optional explanatory content.
> @category Layout
> @tier pattern

### `Divider`
Path: `src/app/components/Divider.tsx`

Exports: `Divider`, `Divider (alias of Divider)`

Local HDS dependencies:
- None

Top comment:
> Divider — semantic separator between content regions.
> @category Layout
> @tier primitive
> 
> Horizontal by default. Uses semantic border token — auto dark/light.
> Thin optical weight (1px) — the system breathes.

### `DocLinkCard`
Path: `src/app/components/DocLinkCard.tsx`

Exports: `DocLinkCard`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`

Top comment:
> DocLinkCard - navigation card for editorial and documentation cross-links.
> @category Navigation
> @tier primitive

### `DocPageHeader`
Path: `src/app/components/DocPageHeader.tsx`

Exports: `projectLede`, `projectGithubBlobUrl`, `resolveStability`, `DocPageHeader`, `DocPageHeader (default)`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`

Top comment:
> DocPageHeader — standardized header zone mounted at the top of every
> primitive / pattern / template doc page. Projected from the live HDS
> manifest; the unit `9d-9` batch refactor wires this component into the
> doc routes — this file only CREATES the surface.
> 
> @category Layout
> @tier utility
> 
> 9d-4 contract (from `docs/ai/orchestration.json`):
>   - H1: component name
>   - Lede: single-line summary derived from `componentSpec.description`
>     (truncated at the first newline / sentence break for the header zone;
>     the full description still flows into the doc body downstream).
>   - Status badge: Stable / Beta — derived from a new optional
>     `componentSpec.stability` field (additive, schema 9d-4). When absent,
>     the default falls back to the unit-spec rule: primitives → 'stable';
>     patterns and templates → 'beta' when they lack `slots[]` or carry
>     propConstraints warnings, otherwise 'stable'.
>   - Tier chip: primitive / pattern / template / utility (manifest field).
>   - Source link: GitHub blob URL projected from `componentSpec.filePath`
>     against the repo's origin remote (hirobius/adrian-milsap, branch
>     `main` for canonical permalinks).
>   - Figma link: rendered when `componentSpec.figmaUrl` is non-null.
> 
> Surface rules (component-zone CLAUDE.md):
>   - Heavy prop restriction — one slot, no business logic.
>   - Theming via CSS variables / role tokens only (no inline hex).
>   - Composes Stack rather than re-implementing layout primitives.
> 
> Anti-goals:
>   - Not a doc-shell — `DocShell` already owns the wordmark, search,
>     theme-toggle, and rail nav. This component lives INSIDE the content
>     column, not the header bar.
>   - Does not render badges as decorative stickers next to prose; they
>     sit in a dedicated metadata row below the H1, per CLAUDE.md.

### `DocShell`
Path: `src/app/components/DocShell.tsx`

Exports: `DocShell`, `DocShell (default)`

Local HDS dependencies:
- `src/app/components/CommandPalette.tsx` via `CommandPalette`
- `src/app/components/DocTOC.tsx` via `DocTOC`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/ThemeToggle.tsx` via `ThemeToggle`
- `src/app/layouts/EmbeddedDocLayoutContext.tsx` via `EmbeddedDocLayoutProvider`
- `src/app/pages/hds/HdsTocContext.tsx` via `TocProvider`, `useToc`

Top comment:
> DocShell — three-column documentation layout for /hds doc routes.
> @category Layout
> @tier utility
> 
> 9d-1 baseline: thin top header bar (wordmark + search slot + theme slot)
> over a three-column body — sticky left rail (~200px) projecting hierarchical
> nav from the live HDS manifest, max-width content column, sticky right rail
> (~200px) reserved as a TOC placeholder for 9d-6.
> 
> Design contract (from the unit brief):
>   - Compose Container / Stack — do NOT re-implement layout primitives.
>   - Project left-rail nav from componentSpecs + utilities; never hand-author.
>   - Surface from role tokens only (bg-background, border-border, etc.).
>   - Sticky rails, scrollable content. Background: surface.background.
> 
> Slots reserved for downstream 9-D units (placeholder text only):
>   - 9d-2 — search input (header center)
>   - 9d-6 — table of contents (right rail)
> Filled slots:
>   - theme-toggle — ThemeToggle (9d-3, system / light / dark dropdown)
> 
> Compatibility:
>   - Wraps <Outlet /> in TocProvider (so existing useToc/useTocActiveId
>     consumers keep working) and EmbeddedDocLayoutProvider (bottomSlot=null,
>     so DocLayout consumers don't break when the shell hosts them).
>   - This component is doc-tier internal scaffolding (utility tier) — not a
>     part of the public HDS authoring surface, so it is intentionally not
>     enrolled in the LLM-facing component inventory.

### `DocTOC`
Path: `src/app/components/DocTOC.tsx`

Exports: `DocTOC`, `DocTOC (default)`

Local HDS dependencies:
- `src/app/pages/hds/HdsTocContext.tsx` via `useToc`

Top comment:
> @tier utility
> 
> @doc-exempt: doc-shell internal — right-rail TOC, not part of public component surface
> 
> DocTOC — right-rail "On this page" table of contents for /hds doc routes.
> 
> @category Layout
> 
> 9d-6 contract:
>   - Reads registered headings from TocProvider (via useToc) — populated by
>     HeadingAnchor wrappers around H2/H3 in the doc-page content column.
>   - IntersectionObserver-based scrollspy: each registered heading element
>     is observed; the topmost intersecting heading (within the activation
>     band) drives the active highlight. Threshold: 0 with a rootMargin band
>     of `-80px 0px -65% 0px` — the top 80px is the sticky-header dead-zone,
>     the bottom 65% trims the activation window so a heading must scroll
>     past the top third before it activates.
>   - Anchor click smooth-scrolls to the heading and updates the URL hash
>     without a full page jump.
>   - Renders nothing if there are no registered headings (keeps the rail
>     visually quiet on doc pages without H2/H3 content).
> 
> Surface: bg-background + border-l border-border (composed by DocShell's
> right-rail container — this component handles its own internal padding /
> typography only).

### `ErrorBoundary`
Path: `src/app/components/ErrorBoundary.tsx`

Exports: `ErrorBoundary`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> ErrorBoundary — slot-scoped recovery surface for runtime render failures.
> @category Feedback
> @tier utility
> @doc-exempt: runtime safety infra, not an LLM-facing layout primitive

### `ErrorPattern`
Path: `src/app/components/ErrorPattern.tsx`

Exports: `ErrorPattern`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Text.tsx` via `Text`

Top comment:
> ErrorPattern - governed recovery surface for routed application errors.
> @category Feedback
> @tier template

### `FoundationSwatch`
Path: `src/app/components/FoundationSwatch.tsx`

Exports: `FoundationSwatch`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/Token.tsx` via `Token`

Top comment:
> FoundationSwatch - governed foundation specimen for color and semantic role previews.
> @category Utilities
> @tier pattern

### `Grid`
Path: `src/app/components/Grid.tsx`

Exports: `Grid`, `Grid (alias of Grid)`

Local HDS dependencies:
- None

Top comment:
> Grid — responsive grid composition primitive.
> @category Layout
> @tier primitive
> @ai-intent Solves multi-column layout and repeatable alignment with token-governed gaps, responsive column collapse, and a first-class subgrid escape hatch for nested structure.
> @ai-rules Use Grid for spatial layout, not for surface styling or content padding. Do NOT apply background, border, or internal padding directly to Grid to mimic a card. Do NOT use arbitrary CSS grid templates when fixed, auto-fit, or subgrid modes already express the layout. Do NOT use Grid for simple one-dimensional stacks where Stack is sufficient.
> 
> Enforces semantic gap and column values. No arbitrary CSS grid.
> - layout='fixed':   responsive base (collapses via CSS at tablet/mobile).
>                     `columns` sets desktop count (default 12). Tablet/mobile
>                     clamp to min(8, cols) and min(4, cols) respectively.
> - layout='auto-fit': responsive card wrapping via auto-fit.
> - subgrid=true:     sets gridTemplateColumns:'subgrid' for nested alignment.
> 
> Usage (default responsive 12-col):
>   <Grid>
>     <Grid.Item colSpan={6}>…</Grid.Item>
>     <Grid.Item colSpan={6}>…</Grid.Item>
>   </Grid>
> 
> Usage (responsive auto-fit):
>   <Grid layout="auto-fit">
>     <Card />
>     <Card />
>   </Grid>

### `HeadingAnchor`
Path: `src/app/components/HeadingAnchor.tsx`

Exports: `HeadingAnchor`, `HeadingAnchor (default)`

Local HDS dependencies:
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`, `useToc`

Top comment:
> @tier utility
> 
> @doc-exempt: doc-shell internal — TOC heading anchor wrapper, not part of public component surface
> 
> HeadingAnchor — H2/H3 wrapper that registers a stable slug ID with the
> doc-shell TOC and exposes a hover-revealed `#` deep-link icon.
> 
> @category Layout
> 
> 9d-6 contract:
>   - Auto-derives a slug ID from heading text via the existing slugify util.
>   - Registers (id, title) with TocProvider so DocTOC can render rails.
>   - Renders an inline `<a href="#id">` with a `#` glyph that fades in on
>     hover/focus. Click copies the absolute deep-link URL to the clipboard
>     (falls back to anchor navigation if Clipboard API is unavailable).
>   - Heading text is rendered as plain children — typography styling comes
>     from the consuming doc page (Text / HeadingStack / etc).
> 
> No surfaces, no role tokens, no margin — pure structural wrapper. Color
> comes from inherited `text-foreground` / `text-muted-foreground` so this
> component is theme-passive.

### `HeadingStack`
Path: `src/app/components/HeadingStack.tsx`

Exports: `HeadingStack`

Local HDS dependencies:
- None

Top comment:
> @tier primitive
> 
> @doc-exempt: internal typography lockup utility, documented through page composition rather than a standalone component page
> 
> HeadingStack — enforced vertical rhythm for heading + subheading pairs.
> @category Typography
> 
> Automatically handles gap and secondary color, preventing manual stacking.
> - Heading level: 'heading1' | 'heading2' | 'heading3'
> - Gap: px4 (tight) | px8 (default)
> - Subheading color: always var(--semantic-color-content-secondary)
> 
> GUARDRAIL: Never manually stack headings using Stack. Always use HeadingStack.
> 
> Usage:
>   <HeadingStack level="heading1" heading="Main Title" subheading="Subtitle text" />
>   <HeadingStack level="heading2" heading="Section" subheading="Description" gap="px4" />

### `HistoryCard`
Path: `src/app/components/HistoryCard.tsx`

Exports: `HistoryCard`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`

Top comment:
> HistoryCard - compact commit-history card for repo and systems-log surfaces.
> @category Utilities
> @tier primitive

### `Icon`
Path: `src/app/components/Icon.tsx`

Exports: `Icon`, `Icon (alias of Icon)`

Local HDS dependencies:
- None

Top comment:
> Icon â€” semantic icon wrapper for monochrome Phosphor glyphs.
> @category Display
> @tier primitive

### `IconButton`
Path: `src/app/components/IconButton.tsx`

Exports: `IconButton`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`, `HdsButtonProps`
- `src/app/components/Icon.tsx` via `Icon`, `IconProps`, `IconSize`

Top comment:
> IconButton â€” icon-only action trigger built on the shared HdsButton primitive.
> @category Actions
> @tier pattern

### `ImageLightbox`
Path: `src/app/components/ImageLightbox.tsx`

Exports: `ImageLightbox`

Local HDS dependencies:
- `src/app/components/AssetImg.tsx` via `AssetImg`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: portfolio lightbox utility used by case-study media, not a consumer-facing HDS component

### `InfoPage`
Path: `src/app/components/InfoPage.tsx`

Exports: `InfoPage`

Local HDS dependencies:
- `src/app/components/AssetImg.tsx` via `AssetImg`
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Text.tsx` via `Text`

Top comment:
> @tier template

### `InlineCode`
Path: `src/app/components/InlineCode.tsx`

Exports: `InlineCode`, `InlineCode (alias of InlineCode)`

Local HDS dependencies:
- `src/app/components/IconButton.tsx` via `IconButton`

Top comment:
> InlineCode — inline code chip for token paths, file paths, and code-adjacent prose.
> @category Display
> @tier primitive
> 
> motion-ok: copy feedback is handled by the nested IconButton, while the inline code chip stays visually stable inside prose and tables

### `InlineLink`
Path: `src/app/components/InlineLink.tsx`

Exports: `InlineLink`, `InlineLink (alias of InlineLink)`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`

Top comment:
> InlineLink â€” inline navigation and external-link primitive for body copy.
> @category Navigation
> @tier primitive

### `Input`
Path: `src/app/components/Input.tsx`

Exports: `Input`

Local HDS dependencies:
- None

Top comment:
> Input — text field primitive (shadcn baseline).
> @category Inputs
> @tier primitive
> 
> shadcn-baseline implementation (8s-5): cva-driven sizing/state composed
> against role-token Tailwind utilities (bg-background / border-input /
> focus-visible:ring-ring / placeholder:text-muted-foreground / etc.) wired
> by 8e-2 + 8s-1. Border swaps to border-destructive on error and the focus
> ring follows. Theme is handled entirely by CSS custom properties.
> 
> The label/helper/error wrapper is deliberately retained on this primitive
> so existing call sites keep working unchanged. A future 8t pass may extract
> those slots into an HdsField pattern (see orchestration agentNote).
> 
> Variants:
>   size      — sm (32px) / md (40px, default) / lg (48px)
>   textStyle — body (default) / mono
> 
> Derived state (data-state):
>   default | focus | filled | error | disabled | loading
> 
> loading swaps the trailing area for a spinner and sets aria-busy; disabled
> is implied. demoState (frozen, via DemoStateContext) is honored so matrix
> cells still freeze visually.
> 
> @figma Size=Input/Size
> @figma Disabled=Input/Disabled
> @figma Error=Input/Error
> @figma Loading=Input/Loading

### `MobiusLogo`
Path: `src/app/components/MobiusLogo.tsx`

Exports: `MobiusLogo`

Local HDS dependencies:
- `src/app/components/MobiusScene.tsx` via `MobiusScene`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> MobiusLogo — production R3F Canvas wrapper.
> 
> Responsibilities (mount-time only):
>   1. Auto-detect performance tier from navigator.hardwareConcurrency
>   2. Read brand color from --semantic-color-surface-accent CSS var
>   3. Read lerp duration from --hds-motion-expressive-duration CSS var
>   4. Subscribe to prefers-reduced-motion media query
>   5. Track mouse position for MobiusScene's magnetic influence
> 
> MobiusScene is responsible for the frame loop and all rendering.
> This file never imports Leva.
> 
> @sketchbook-canvas
> Canvas drawing code and shader uniforms here use values intrinsic to the
> 3D effect and not mappable to design tokens. Exempt from check-hardcoded-colors.
> The surrounding UI chrome in LogoLabSketch uses tokens normally.
> 
> @tier utility
> @doc-exempt: R3F Canvas host for MobiusScene — a sketchbook visualization component, not a shared HDS primitive. Promoted to shell in a future phase.

### `MobiusScene`
Path: `src/app/components/MobiusScene.tsx`

Exports: `MobiusScene`

Local HDS dependencies:
- None

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> MobiusScene â€” R3F scene internals for the MÃ¶bius logo.
> 
> Rendered inside MobiusLogo's <Canvas>. Reads all visual parameters
> from useMobiusStore. Never imports Leva.
> 
> MÃ¶bius twist is applied entirely in the vertex shader via Rodrigues rotation
> around the path tangent at each cross-section. This makes uTwistCount and
> uTwistAmount smoothly animatable without geometry rebuild.
> 
> @sketchbook-canvas
> Shader uniforms and procedural geometry values are intrinsic to the 3D
> effect and not mappable to design tokens. Exempt from check-hardcoded-colors.
> The surrounding UI chrome in LogoLabSketch uses tokens normally.
> 
> @tier utility
> @doc-exempt: R3F scene internals â€” rendered inside MobiusLogo's Canvas, not a standalone UI component. Documented via MobiusLogo.

### `MobiusShellLayer`
Path: `src/app/components/MobiusShellLayer.tsx`

Exports: `MobiusShellLayer`

Local HDS dependencies:
- `src/app/components/MobiusLogo.tsx` via `MobiusLogo`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> MobiusShellLayer — persistent shell-level host for the Möbius canvas.
> 
> This layer mounts once inside HDSLayout and never unmounts during route
> changes. Route changes only update store-driven presets and layout state.
> 
> @doc-exempt: Shell-only visualization host. Routed pages consume the shared
> @tier utility
> scene indirectly through mobiusStore and do not render their own canvas.

### `MorphCard`
Path: `src/app/components/MorphCard.tsx`

Exports: `MorphCard`

Local HDS dependencies:
- None

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: portfolio presentation utility, not a consumer-facing HDS component

### `NavGroup`
Path: `src/app/components/NavGroup.tsx`

Exports: `NavGroup`

Local HDS dependencies:
- `src/app/components/Disclosure.tsx` via `Disclosure`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/Stack.tsx` via `Stack`

Top comment:
> NavGroup - labeled navigation group for stacks of nav items.
> @category Navigation
> @tier pattern

### `NavItem`
Path: `src/app/components/NavItem.tsx`

Exports: `NavItem`, `NavItem (alias of NavItem)`

Local HDS dependencies:
- None

Top comment:
> NavItem - navigation row primitive for sidebars, table of contents, and list navigation.
> @category Navigation
> @tier primitive

### `NotFoundPattern`
Path: `src/app/components/NotFoundPattern.tsx`

Exports: `NotFoundPattern`

Local HDS dependencies:
- `src/app/components/ErrorPattern.tsx` via `ErrorPattern`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> NotFoundPattern - governed not-found recovery surface for unroutable pages.
> @category Feedback
> @tier utility
> @doc-exempt: zero-prop wrapper around ErrorPattern; LLMs should target ErrorPattern directly

### `SegmentedControl`
Path: `src/app/components/SegmentedControl.tsx`

Exports: `SegmentedControl`

Local HDS dependencies:
- None

Top comment:
> SegmentedControl â€” segmented selection input for compact mutually-exclusive choices.
> @category Inputs
> @tier primitive

### `HdsSidebarUtilityButton`
Path: `src/app/components/ShellControls.tsx`

Exports: `HdsSidebarUtilityButton`, `HdsMobileTopBar`

Local HDS dependencies:
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: shell-only controls used by the app chrome, not consumer-facing HDS components.
> 
> ShellControls - shell-only navigation controls documented as maintenance utilities.
> @category Utilities

### `HdsSidebarNav`
Path: `src/app/components/HdsSidebarNav.tsx`

Exports: `HdsSidebarNav`

Local HDS dependencies:
- `src/app/components/NavGroup.tsx` via `NavGroup`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/Stack.tsx` via `Stack`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: internal documentation shell navigation wrapper, not a consumer-facing HDS component

### `SideNav`
Path: `src/app/components/SideNav.tsx`

Exports: `SideNav`, `SideNav (alias of SideNav)`

Local HDS dependencies:
- None

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> SideNav - sidebar navigation row primitive.
> @doc-exempt: documented under NavItem in the active component docs because the row primitive is presented alongside the section shell
> 
> Two levels:
>   root   — top-level section link. Full-width row using the shared nav label
>            type style.
>   nested — child page link. Keeps the same full-width hit area and label type
>            treatment, with indentation handled via inner padding only.
> 
> No indicator bar (reserved for HdsTocNav).
> Idle text = content-secondary → primary on hover/active.
> Accent surface fill on active state.
> @category Navigation
> @tier utility

### `Sketch`
Path: `src/app/components/Sketch.tsx`

Exports: `Sketch`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> Sketch — shared shell for generative canvases and WebGL sketches.
> @category Layout
> @tier pattern

### `SpecimenBlock`
Path: `src/app/components/SpecimenBlock.tsx`

Exports: `SpecimenBlock`

Local HDS dependencies:
- `src/app/components/componentPreviewRegistry.tsx` via `AutoPreviewSpecimen`, `VariantPreviewDeck`
- `src/app/components/PreviewFrame.tsx` via `PreviewFrame`

Top comment:
> @tier primitive
> 
> @doc-exempt: shared doc-specimen composition used to render component docs, not a consumer-facing surface.
> 
> SpecimenBlock - shared component-doc specimen block with preview, variant deck, and optional matrix.
> @category Utilities

### `Stack`
Path: `src/app/components/Stack.tsx`

Exports: `Stack`, `Stack (alias of Stack)`

Local HDS dependencies:
- None

Top comment:
> Stack — one-dimensional layout primitive.
> @category Layout
> @tier primitive
> @ai-intent Solves vertical and horizontal rhythm with tokenized flex gaps so agents can compose sequences of content without inventing ad hoc spacer divs or margin-based stacking.
> @ai-rules Use Stack for flow spacing and simple flex alignment only. Do NOT use Stack to create card chrome, internal surface padding, or page-width constraints. Do NOT apply arbitrary margins to Stack to fake spacing between children when the gap prop should own that rhythm. Do NOT use Stack for true two-dimensional layouts that require Grid.
> 
> Thin flex wrapper that enforces gap values from the HDS space scale.
> Eliminates inline flex boilerplate and prevents arbitrary spacing values.
> 
> Validated against: Radix Themes (Flex), Chakra UI (Stack), MUI (Stack).
> 
> Usage:
>   <Stack gap="tight" align="center">...</Stack>
>   <Stack direction="row" gap="component" justify="space-between">...</Stack>

### `StepperField`
Path: `src/app/components/StepperField.tsx`

Exports: `StepperField`

Local HDS dependencies:
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/components/Input.tsx` via `Input`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> StepperField â€” numeric input with decrement/increment controls.
> @category Inputs
> @tier pattern
> 
> Classification baseline:
> Material Design, Chakra UI, and Ant Design treat steppers as numeric input
> controls rather than page-specific controls. This lives in shared components
> so sketches and docs consume the same primitive.
> 
> replace-ok: this is a candidate for later Radix-backed numeric plumbing once
> the input family is simplified and the stepper contract is re-evaluated.

### `HdsSurface`
Path: `src/app/components/HdsSurface.tsx`

Exports: `HdsSurface`

Local HDS dependencies:
- None

Top comment:
> @tier primitive

### `Table`
Path: `src/app/components/Table.tsx`

Exports: `Table`

Local HDS dependencies:
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> Table - structured data table primitive for documentation and compact UI matrices.
> @category Display
> @tier primitive

### `Tag`
Path: `src/app/components/Tag.tsx`

Exports: `Tag`, `Tag (alias of Tag)`

Local HDS dependencies:
- None

Top comment:
> Tag â€" interactive filter and category chip.
> @category Inputs
> @tier primitive
> 
> The outer <button> carries the accessible 44px hit target directly via the
> size token while the inner pill keeps the visible surface compact. Colors
> (background, border-color, color) are owned by .hds-tag-btn / .hds-tag-pill
> in theme.css so :hover transitions work â€" inline styles beat :hover
> selectors and would silently break the effect.
> 
> Active state: brand fill via [data-active="true"] in theme.css.
> Hover states: inactive â†’ subtle tint + brand border; active â†’ brand-hover fill.

### `Text`
Path: `src/app/components/Text.tsx`

Exports: `Text`

Local HDS dependencies:
- None

Top comment:
> @tier primitive

### `TextLockup`
Path: `src/app/components/TextLockup.tsx`

Exports: `TextLockup`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Text.tsx` via `Text`

Top comment:
> @tier pattern
> 
> motion-ok: numbered lockup copy actions intentionally keep the heading static so anchor affordances do not introduce editorial layout jitter
> font-ok: inline technical affordances within this lockup intentionally use monospace for code-like references
> 
> TextLockup - governed title-and-description pairing primitive.
> @category Display
> @ai-intent Solves recurring heading, eyebrow, and supporting-copy composition with predefined typographic pairings so agents can express hierarchy without manually tuning text stacks.
> @ai-rules Use TextLockup when content is a semantic title lockup with optional eyebrow and supporting text. Do NOT use TextLockup for arbitrary prose groups, data tables, or freeform mixed layouts. Do NOT restyle the internal type pairing with custom heading stacks when an existing size already fits. Do NOT use TextLockup to replace standalone body text or labels that do not form a title-description unit.

### `ThemeToggle`
Path: `src/app/components/ThemeToggle.tsx`

Exports: `ThemeToggle`, `ThemeToggle (default)`

Local HDS dependencies:
- None

Top comment:
> ThemeToggle — System / Light / Dark theme dropdown for the doc shell.
> 
> @category Layout
> @tier utility
> 
> 9d-3 baseline: a header-slot dropdown with three options:
> 
>   - System — follow `prefers-color-scheme`, react live to OS changes.
>   - Light  — force light mode.
>   - Dark   — force dark mode.
> 
> Persistence:
>   - Stored in localStorage under `hds-theme-mode` ('system' | 'light' | 'dark').
>   - Mirrored to the legacy `hds-theme` key ('light' | 'dark') so the existing
>     ThemeContext binary toggle (if mounted) stays in sync without a hard
>     dependency between the two.
> 
> Application:
>   - Sets `data-theme="light"` or `data-theme="dark"` on `<html>` so the
>     8e-2 `role.*` alias layer (theme-aware CSS vars) flips automatically.
>   - Also toggles `<html>.dark` for parity with Tailwind's class-based dark
>     variant (matching the convention already used in ThemeContext).
> 
> Dependencies:
>   - Zero new npm deps. Native button + click-outside listener.
>   - SVG icons inlined (Sun / Moon / Monitor) — no icon-library dep added.
> 
> Slot:
>   - Renders into the `data-hds-slot="theme-toggle"` zone in DocShell.
> 
> @doc-exempt — internal doc-shell scaffolding, not a public authoring primitive.

### `Token`
Path: `src/app/components/Token.tsx`

Exports: `Token`, `Token (alias of Token)`

Local HDS dependencies:
- `src/app/components/lab/tokenUtils.ts` via `allTokens`

Top comment:
> Token - reflective token specimen for unified node-based token views.
> @category Display
> @tier primitive

### `Tooltip`
Path: `src/app/components/Tooltip.tsx`

Exports: `Tooltip`

Local HDS dependencies:
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: image affordance utility, not a consumer-facing HDS component
> 
> Tooltip â€” HDS image interaction tooltip
> 
> A pill-shaped label (brand blue / white text) that indicates an image
> is expandable. Supports two render modes:
> 
>   'cursor'   â€” fixed-positioned portal tracking the mouse cursor.
>                Appears offset from the cursor tip on hover.
>   'centered' â€” absolute overlay centered within the nearest positioned
>                ancestor. Used for keyboard-focus state so keyboard
>                users get an identical visual treatment.
> 
> Rendered by AssetImg whenever `expandable` is true and an `onClick`
> handler is provided â€” no per-call configuration needed at the call site.

### `VariantPreviewDeck`
Path: `src/app/components/VariantPreviewDeck.tsx`

Exports: `VariantPreviewDeck`

Local HDS dependencies:
- `src/app/components/componentPreviewRegistry.tsx` via `VariantPreviewDeck`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: variant preview helper used by docs pages, not a consumer-facing HDS surface.
> 
> VariantPreviewDeck - preview deck for size/tone/variant families.
> @category Utilities

### `LegacyTokenDetail`
Path: `src/app/components/lab/LegacyTokenDetail.tsx`

Exports: `LegacyTokenDetail`, `HdsLegacyTokenGovernancePanel`

Local HDS dependencies:
- `src/app/components/Badge.tsx` via `Badge`
- `src/app/components/CodeBlock.tsx` via `CodeBlock`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/InlineCode.tsx` via `InlineCode`
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/Token.tsx` via `Token`
- `src/app/components/lab/tokenUtils.ts` via `allTokens`, `FlatToken`, `formatCategoryLabel`, `formatTokenValue`, `resolveAlias`, `resolveTokenLiteralValue`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `useIsMobile`

Top comment:
> LegacyTokenDetail - lab-facing token inspect
> @category Lab
> @tier experiment

### `LegacyTokenList`
Path: `src/app/components/lab/LegacyTokenList.tsx`

Exports: `LegacyTokenList`

Local HDS dependencies:
- `src/app/components/lab/TokenCollectionList.tsx` via `TokenCollectionList`
- `src/app/components/lab/tokenUtils.ts` via `FlatToken`, `formatCategoryLabel`, `groupByCategory`, `Tier`

Top comment:
> LegacyTokenList - legacy token grouping list retained for lab-side maintenance workflows.
> @category Lab
> @tier experiment
> 
> motion-ok: list wrapper - all interactive rows render as Token (motion.button with whileTap)

### `TokenCollectionList`
Path: `src/app/components/lab/TokenCollectionList.tsx`

Exports: `TokenCollectionList`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Token.tsx` via `Token`
- `src/app/components/lab/tokenUtils.ts` via `FlatToken`

Top comment:
> TokenCollectionList - grouped token inventory list for lab and explorer maintenance.
> @category Lab
> @tier experiment
> 
> motion-ok: token row interaction feedback is owned by the nested Token nodes, while the collection wrapper remains a static organizational scaffold

### `TokenDetail`
Path: `src/app/components/lab/TokenDetail.tsx`

Exports: `TokenDetail`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Tag.tsx` via `Tag`
- `src/app/components/Token.tsx` via `Token`
- `src/app/components/lab/tokenUtils.ts` via `FlatToken`, `formatCategoryLabel`, `formatTokenValue`, `resolveAlias`, `resolveAliasCssVar`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `useIsMobile`

Top comment:
> @tier experiment
> 
> @doc-exempt: internal lab token inspector, used by live explorer plumbing rather than docs surfaces.
> 
> TokenDetail - canonical token detail inspector for the live token explorer and lab tooling.
> @category Lab

### `TokenList`
Path: `src/app/components/lab/TokenList.tsx`

Exports: `TokenList`

Local HDS dependencies:
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/lab/tokenUtils.ts` via `FlatToken`, `formatCategoryLabel`, `formatTokenValue`, `groupByCategory`, `resolveTokenLiteralValue`

Top comment:
> @tier experiment
> 
> @doc-exempt: internal lab token rail, used by live explorer plumbing rather than docs surfaces.
> 
> TokenList - searchable token rail for interactive lab-side token inspection.
> @category Lab

### `Surface`
Path: `src/app/components/Surface.tsx`

Exports: `Surface`

Local HDS dependencies:
- None

Top comment:
> Surface — strict guardrail for bordered/background containers.
> @category Utilities
> @tier primitive
> 
> Enforces padding on any surface with background or border to prevent text-to-edge cramping.
> - Default padding: px16 (surfaces) | px24 (cards)
> - Default radius: var(--component-card-radius)
> - Optional shadow: var(--semantic-shadow-card)
> 
> Usage:
>   <Surface>Text inside gets px16 padding</Surface>
>   <Surface padding="component" shadow>Card-like surface with shadow</Surface>


## Layouts

### `CaseStudyLayout`
Path: `src/app/layouts/CaseStudyLayout.tsx`

Exports: `CaseStudyLayout`

Local HDS dependencies:
- `src/app/components/Container.tsx` via `Container`
- `src/app/components/ErrorBoundary.tsx` via `ErrorBoundary`
- `src/app/components/Stack.tsx` via `Stack`

Top comment:
> CaseStudyLayout — macro-layout skeleton for portfolio case study pages.
> @category Layout
> 
> Invisible structure only. No HdsSurface, no decorative chrome.
> Slot anatomy:
>   heroSlot    → full-width (maxWidth="max")  — hero image + headline
>   introSlot   → prose-width (maxWidth="content") — narrative, Brief/Problem/Solution
>   metricsSlot → full-width (maxWidth="max")  — KPI or summary cards (optional)
>   contentSlot → full-width (maxWidth="max")  — chapters, galleries, learnings

### `DocLayout`
Path: `src/app/layouts/DocLayout.tsx`

Exports: `getDocLayoutShellMaxWidth`, `DocLayout`

Local HDS dependencies:
- `src/app/components/Container.tsx` via `Container`
- `src/app/components/ErrorBoundary.tsx` via `ErrorBoundary`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/layouts/EmbeddedDocLayoutContext.tsx` via `useEmbeddedDocLayoutBottomSlot`

Top comment:
> No top-of-file intent comment found.

### `EmbeddedDocLayoutProvider`
Path: `src/app/layouts/EmbeddedDocLayoutContext.tsx`

Exports: `EmbeddedDocLayoutProvider`, `useEmbeddedDocLayoutBottomSlot`

Local HDS dependencies:
- None

Top comment:
> No top-of-file intent comment found.

### `ComponentDocPageShell`
Path: `src/app/pages/hds/components/ComponentDocPageShell.tsx`

Exports: `ComponentDocPageShell`

Local HDS dependencies:
- `src/app/components/CategoryComponentDocs.tsx` via `getCategoryComponentNames`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`
- `src/app/pages/hds/HdsSystemDocLayout.tsx` via `HdsSystemDocLayout`
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`

Top comment:
> No top-of-file intent comment found.

### `HDSLayout`
Path: `src/app/pages/hds/HDSLayout.tsx`

Exports: `HDSLayout (default)`

Local HDS dependencies:
- `src/app/components/DocPageFooterNote.tsx` via `DocPageFooterNote`
- `src/app/components/DocPageSpec.tsx` via `DocPageSpec`, `type PageSpec`
- `src/app/components/Badge.tsx` via `Badge`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Container.tsx` via `Container`
- `src/app/components/DocLinkCard.tsx` via `DocLinkCard`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/components/NavGroup.tsx` via `NavGroup`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/ShellControls.tsx` via `HdsSidebarUtilityButton`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/layouts/DocLayout.tsx` via `getDocLayoutShellMaxWidth`
- `src/app/layouts/EmbeddedDocLayoutContext.tsx` via `EmbeddedDocLayoutProvider`
- `src/app/pages/hds/HdsTocContext.tsx` via `TocProvider`, `useToc`, `useTocActiveId`

Top comment:
> HDSLayout - unified shell for the full portfolio and HDS surface.
> 
> Sidebar is sticky; main area scrolls vertically. Legacy gallery routes now
> redirect into this shell so case studies, supporting material, and docs all
> share one navigation and interaction model.

### `HdsSystemDocLayout`
Path: `src/app/pages/hds/HdsSystemDocLayout.tsx`

Exports: `HdsSystemDocLayout`

Local HDS dependencies:
- `src/app/components/NavGroup.tsx` via `NavGroup`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/HdsSidebarNav.tsx` via `HdsSidebarNav`
- `src/app/components/Text.tsx` via `Text`
- `src/app/layouts/DocLayout.tsx` via `DocLayout`, `type DocLayoutContentMaxWidth`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FOUNDATION_NAV_SECTIONS`
- `src/app/pages/hds/HdsTocContext.tsx` via `useToc`, `useTocActiveId`

Top comment:
> @doc-exempt: internal HDS documentation shell wrapper, not a standalone component artifact


## Pages

### `ArchitectureSnapshotPage`
Path: `src/app/pages/hds/ArchitectureSnapshotPage.tsx`

Exports: `ArchitectureSnapshotPage (default)`

Local HDS dependencies:
- `src/app/components/HeadingStack.tsx` via `HeadingStack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/TextLockup.tsx` via `TextLockup`

Top comment:
> font-ok: architecture snapshot intentionally includes code and terminal excerpts with monospace formatting

### `BreakpointsPage`
Path: `src/app/pages/hds/BreakpointsPage.tsx`

Exports: `BreakpointsPage (default)`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/Token.tsx` via `Token`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FoundationDocPage`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `BurnDownPage`
Path: `src/app/pages/hds/BurnDownPage.tsx`

Exports: `BurnDownPage (default)`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`

Top comment:
> No top-of-file intent comment found.

### `ColorPage`
Path: `src/app/pages/hds/ColorPage.tsx`

Exports: `ColorPage (default)`

Local HDS dependencies:
- `src/app/components/FoundationSwatch.tsx` via `FoundationSwatch`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Text.tsx` via `Text`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FoundationDocPage`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `ActionsPage`
Path: `src/app/pages/hds/components/ActionsPage.tsx`

Exports: `ActionsPage (default)`

Local HDS dependencies:
- `src/app/components/CategoryComponentDocs.tsx` via `CategoryComponentDocs`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/ComponentInstanceMatrix.tsx` via `ComponentInstanceMatrix`
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `useIsMobile`

Top comment:
> ActionsPage - /hds/components/actions
> 
> Components: HdsButton, HdsButtonGroup, IconButton
> Category validated against: Material Design (Buttons), Ant Design (Button),
> Radix UI (Button), Chakra UI (Button) - buttons and icon-only triggers are
> universally classified under "Actions" or an equivalent.

### `DisplayPage`
Path: `src/app/pages/hds/components/DisplayPage.tsx`

Exports: `DisplayPage (default)`

Local HDS dependencies:
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`
- `src/app/pages/hds/components/IconGallery.tsx` via `IconGallery`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocSection`, `DocSubsection`, `HdsComponentDoc`

Top comment:
> DisplayPage - /hds/components/display
> 
> Components: Icon, TextLockup, Table, InlineCode, CodeBlock, Token, AssetImg
> Category validated against: Ant Design (Data Display), Chakra UI (Data Display),
> Radix UI (Card) - non-interactive components that present information
> are grouped under "Display" or "Data Display".

### `DocUtilitiesPage`
Path: `src/app/pages/hds/components/DocUtilitiesPage.tsx`

Exports: `DocUtilitiesPage (default)`

Local HDS dependencies:
- `src/app/components/CategoryComponentDocs.tsx` via `CategoryComponentDocs`
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `TextLockup`

Top comment:
> No top-of-file intent comment found.

### `FeedbackPage`
Path: `src/app/pages/hds/components/FeedbackPage.tsx`

Exports: `FeedbackPage (default)`

Local HDS dependencies:
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocSection`, `HdsComponentDoc`

Top comment:
> FeedbackPage - /hds/components/feedback
> 
> Components: Alert, Badge
> Category validated against: Material Design (Snackbar, Banner), Ant Design (Alert, Message),
> Chakra UI (Alert, Toast) - components whose primary purpose is communicating system
> or editorial status are consistently separated from passive display primitives.

### `InputsPage`
Path: `src/app/pages/hds/components/InputsPage.tsx`

Exports: `InputsPage (default)`

Local HDS dependencies:
- `src/app/components/CategoryComponentDocs.tsx` via `CategoryComponentDocs`
- `src/app/components/ComponentInstanceMatrix.tsx` via `ComponentInstanceMatrix`
- `src/app/components/Controls.tsx` via `HdsRadio`, `HdsToggle`, `type HdsRadioDemoState`, `type HdsToggleDemoState`
- `src/app/components/Input.tsx` via `Input`, `type InputSize`
- `src/app/components/SegmentedControl.tsx` via `SegmentedControl`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `useIsMobile`

Top comment:
> InputsPage - /hds/components/inputs
> 
> Components: Input, HdsSlider, HdsRadio, SegmentedControl, HdsSelect, Tag
> Category validated against: Material Design (Text fields, Sliders, Switches, Select),
> Ant Design (Data Entry), Chakra UI (Forms), Radix UI (Form) - all major DSes
> classify text-primary fields, sliders, radios, and selects together under "Inputs",
> "Controls", or "Data Entry".

### `LayoutPage`
Path: `src/app/pages/hds/components/LayoutPage.tsx`

Exports: `LayoutPage (default)`

Local HDS dependencies:
- `src/app/components/CategoryComponentDocs.tsx` via `CategoryComponentDocs`
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`

Top comment:
> LayoutPage - /hds/components/layout
> 
> Components: Disclosure, Divider, Stack
> Category validated against: Ant Design (Layout > Divider), Chakra UI (Layout > Stack/Divider),
> Radix UI (Separator, Flex, Accordion) - structural layout primitives that define spatial
> relationships between content regions or govern the reveal of optional supporting content
> are grouped under "Layout".

### `NavigationPage`
Path: `src/app/pages/hds/components/NavigationPage.tsx`

Exports: `NavigationPage (default)`

Local HDS dependencies:
- `src/app/components/CategoryComponentDocs.tsx` via `CategoryComponentDocs`
- `src/app/pages/hds/components/ComponentDocPageShell.tsx` via `ComponentDocPageShell`

Top comment:
> NavigationPage - /hds/components/navigation
> 
> Components: NavGroup, NavItem, DocLinkCard, InlineLink
> Category validated against: Material Design (Navigation bar, Navigation drawer),
> Ant Design (Navigation group), Chakra UI (Breadcrumb, Link, Stepper) - components
> whose primary purpose is spatial orientation and page-level routing are universally
> grouped under "Navigation", separate from action triggers (buttons) and data
> entry controls (inputs).

### `ElevationPage`
Path: `src/app/pages/hds/ElevationPage.tsx`

Exports: `ElevationPage (default)`

Local HDS dependencies:
- `src/app/components/FoundationSwatch.tsx` via `FoundationSwatch`
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/components/PreviewFrame.tsx` via `PreviewFrame`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/lab/tokenUtils.ts` via `resolveTokenLiteralValue`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FoundationDocPage`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `FoundationSwatchGrid`, `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `FoundationDocPage`
Path: `src/app/pages/hds/FoundationDocPage.tsx`

Exports: `FoundationDocPage`

Local HDS dependencies:
- `src/app/components/NavGroup.tsx` via `NavGroup`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/HdsSidebarNav.tsx` via `HdsSidebarNav`, `type HdsSidebarNavSection`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/layouts/DocLayout.tsx` via `DocLayout`
- `src/app/pages/hds/HdsTocContext.tsx` via `useToc`, `useTocActiveId`

Top comment:
> No top-of-file intent comment found.

### `GettingStartedPage`
Path: `src/app/pages/hds/GettingStartedPage.tsx`

Exports: `GettingStartedPage (default)`

Local HDS dependencies:
- `src/app/components/DocLinkCard.tsx` via `DocLinkCard`
- `src/app/components/InlineCode.tsx` via `InlineCode`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Text.tsx` via `Text`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`, `DocSection`

Top comment:
> No top-of-file intent comment found.

### `GuidancePage`
Path: `src/app/pages/hds/GuidancePage.tsx`

Exports: `GuidancePage (default)`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`, `DocSection`

Top comment:
> No top-of-file intent comment found.

### `HirobiusCaseStudyPage`
Path: `src/app/pages/hds/HirobiusCaseStudyPage.tsx`

Exports: `HirobiusCaseStudyPage (default)`

Local HDS dependencies:
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/layouts/CaseStudyLayout.tsx` via `CaseStudyLayout`

Top comment:
> No top-of-file intent comment found.

### `IconsPage`
Path: `src/app/pages/hds/IconsPage.tsx`

Exports: `IconsPage (default)`

Local HDS dependencies:
- `src/app/components/Alert.tsx` via `Alert`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/Token.tsx` via `Token`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`, `DocSection`

Top comment:
> No top-of-file intent comment found.

### `LicensePage`
Path: `src/app/pages/hds/LicensePage.tsx`

Exports: `LicensePage (default)`

Local HDS dependencies:
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Table.tsx` via `Table`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`, `DocSection`

Top comment:
> No top-of-file intent comment found.

### `MicrosoftDesignSystemsPage`
Path: `src/app/pages/hds/MicrosoftDesignSystemsPage.tsx`

Exports: `MicrosoftDesignSystemsPage (default)`

Local HDS dependencies:
- `src/app/components/AssetImg.tsx` via `AssetImg`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/ImageLightbox.tsx` via `ImageLightbox`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/layouts/CaseStudyLayout.tsx` via `CaseStudyLayout`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocSection as Section`
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`, `useToc`
- `src/app/pages/hds/PortfolioAssetSlot.tsx` via `PortfolioAssetCaption`, `PortfolioAssetFrame`, `type PortfolioAssetSlot`

Top comment:
> @doc-exempt: portfolio case study page, not a consumer-facing HDS component
> 
> MicrosoftDesignSystemsPage
> Data-backed portfolio case study for the live microsoft-design-systems route.
> @category Portfolio

### `MotionPage`
Path: `src/app/pages/hds/MotionPage.tsx`

Exports: `MotionPage (default)`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/Token.tsx` via `Token`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FoundationDocPage`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `HdsFoundationTableStack`

Top comment:
> No top-of-file intent comment found.

### `OverviewPage`
Path: `src/app/pages/hds/OverviewPage.tsx`

Exports: `OverviewPage (default)`

Local HDS dependencies:
- `src/app/components/Badge.tsx` via `Badge`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/HdsButtonGroup.tsx` via `HdsButtonGroup`
- `src/app/components/DocLinkCard.tsx` via `DocLinkCard`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/HistoryCard.tsx` via `HistoryCard`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`
- `src/app/pages/hds/HdsSystemDocLayout.tsx` via `HdsSystemDocLayout`
- `src/app/pages/hds/HdsTocContext.tsx` via `useToc`

Top comment:
> No top-of-file intent comment found.

### `portfolioData`
Path: `src/app/pages/hds/portfolioData.tsx`

Exports: None detected

Local HDS dependencies:
- None

Top comment:
> portfolioData — static data and token constants for PortfolioHomePage.
> 
> font-ok: brand-mark letterforms (Ag logo SVG) intentionally use display-bold weight

### `PortfolioDraftPage`
Path: `src/app/pages/hds/PortfolioDraftPage.tsx`

Exports: `PortfolioDraftPage (default)`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocSection as Section`, `useIsMobile`
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`, `useToc`

Top comment:
> @doc-exempt: portfolio draft page, not a consumer-facing HDS component
> 
> PortfolioDraftPage
> Placeholder-first layout study for a more image-heavy portfolio direction.
> @category Portfolio

### `PortfolioHomePage`
Path: `src/app/pages/hds/PortfolioHomePage.tsx`

Exports: `PortfolioHomePage (default)`

Local HDS dependencies:
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/MorphCard.tsx` via `MorphCard`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/pages/hds/HDSLayout.tsx` via `HDSLayout`
- `src/app/pages/hds/portfolioData.tsx` via `HOME_MOBIUS_ANCHOR_SIZE`, `HOME_PAGE_TOP_OFFSET`, `HOME_TILE_HOVER_FOREGROUND`, `MDS_TILE_HOVER_DARK`, `MDS_TILE_HOVER_LIGHT`, `MOBIUS_REST_DARK`, `MOBIUS_REST_LIGHT`, `SHELL_ENTRY_CARD_MAX_H`, `SHELL_ENTRY_CARD_RATIO`, `SHELL_ENTRY_CARDS`, `TILE_HOVER_COLORS`

Top comment:
> No top-of-file intent comment found.

### `SandboxPage`
Path: `src/app/pages/hds/SandboxPage.tsx`

Exports: `SandboxPage (default)`

Local HDS dependencies:
- `src/app/components/Alert.tsx` via `Alert`
- `src/app/components/Badge.tsx` via `Badge`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Input.tsx` via `Input`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Tag.tsx` via `Tag`
- `src/app/components/TextLockup.tsx` via `TextLockup`

Top comment:
> SandboxPage — isolated component renderer for programmatic Figma capture.
> 
> No nav, no sidebar, no layout chrome. Renders a single HDS component
> by name from ?component=Name&variant=variantKey query params.
> 
> Legacy isolated preview route for HDS components. The active Figma path is
> the JSONL streaming renderer in scripts/llm-stream-bridge.mjs.
> 
> URL: /hds/sandbox?component=HdsButton&variant=primary

### `ShapePage`
Path: `src/app/pages/hds/ShapePage.tsx`

Exports: `ShapePage (default)`

Local HDS dependencies:
- `src/app/components/FoundationSwatch.tsx` via `FoundationSwatch`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/Token.tsx` via `Token`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FoundationDocPage`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `HdsFoundationTableStack`, `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `SpacingPage`
Path: `src/app/pages/hds/SpacingPage.tsx`

Exports: `SpacingPage (default)`

Local HDS dependencies:
- `src/app/components/FoundationSwatch.tsx` via `FoundationSwatch`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/Token.tsx` via `Token`
- `src/app/pages/hds/FoundationDocPage.tsx` via `FoundationDocPage`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `HdsFoundationTableStack`, `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `SpacingTestPage`
Path: `src/app/pages/hds/SpacingTestPage.tsx`

Exports: `SpacingTestPage (default)`

Local HDS dependencies:
- `src/app/components/ActivityFeed.tsx` via `defaultActivityEvents`, `ActivityFeed`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> hds-bypass: test page with hardcoded demo styles for visual audit
> 
> font-ok: spacing test page intentionally uses monospace demo labels during visual inspection

### `TechStackPage`
Path: `src/app/pages/hds/TechStackPage.tsx`

Exports: `TechStackPage (default)`

Local HDS dependencies:
- `src/app/components/InlineCode.tsx` via `InlineCode`
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/Table.tsx` via `Table`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`, `DocSection`, `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `TokensPage`
Path: `src/app/pages/hds/TokensPage.tsx`

Exports: `TokensPage (default)`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/lab/LegacyTokenDetail.tsx` via `LegacyTokenDetail`, `HdsLegacyTokenGovernancePanel`
- `src/app/components/lab/tokenUtils.ts` via `allTokens`, `type FlatToken`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocPageHeader`
- `src/app/pages/hds/HdsSystemDocLayout.tsx` via `HdsSystemDocLayout`
- `src/app/pages/hds/HdsTocContext.tsx` via `useToc`
- `src/app/pages/hds/LegacyTokenExplorerPanel.tsx` via `LegacyTokenExplorerPanel`

Top comment:
> No top-of-file intent comment found.

### `TypographyPage`
Path: `src/app/pages/hds/TypographyPage.tsx`

Exports: `TypographyPage (default)`

Local HDS dependencies:
- `src/app/components/FoundationSwatch.tsx` via `FoundationSwatch`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/NavGroup.tsx` via `NavGroup`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/HdsSidebarNav.tsx` via `HdsSidebarNav`, `type HdsSidebarNavSection`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/components/Token.tsx` via `Token`
- `src/app/layouts/DocLayout.tsx` via `DocLayout`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `HdsFoundationSection`, `HdsFoundationTableStack`
- `src/app/pages/hds/HdsTocContext.tsx` via `useToc`, `useTocActiveId`

Top comment:
> No top-of-file intent comment found.

### `TypographyTestPage`
Path: `src/app/pages/hds/TypographyTestPage.tsx`

Exports: `TypographyTestPage (default)`

Local HDS dependencies:
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> hds-bypass: test page with hardcoded demo styles for visual audit
> 
> font-ok: typography test page intentionally uses monospace demo labels during visual inspection

### `VisualsBentoGrid`
Path: `src/app/pages/hds/VisualsBentoGrid.tsx`

Exports: `VisualsBentoGrid`

Local HDS dependencies:
- `src/app/components/InlineLink.tsx` via `InlineLink`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/pages/hds/PortfolioAssetSlot.tsx` via `PortfolioAssetCaption`, `PortfolioAssetFrame`, `resolvePortfolioAssetSlot`, `type PortfolioAssetSlot`

Top comment:
> @doc-exempt: portfolio visuals page helper, not a consumer-facing HDS component

### `visualsData`
Path: `src/app/pages/hds/visualsData.ts`

Exports: None detected

Local HDS dependencies:
- `src/app/pages/hds/VisualsBentoGrid.tsx` via `type VisualsBentoSlot`

Top comment:
> @doc-exempt: portfolio visuals page data, not a consumer-facing HDS component

### `VisualsPage`
Path: `src/app/pages/hds/VisualsPage.tsx`

Exports: `VisualsPage (default)`

Local HDS dependencies:
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `TextLockup`, `useIsMobile`
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`, `useToc`
- `src/app/pages/hds/VisualsBentoGrid.tsx` via `VisualsBentoGrid`
- `src/app/pages/hds/visualsData.ts` via `type VisualPageSection`, `VISUAL_PAGE_SECTIONS`

Top comment:
> @doc-exempt: portfolio visuals page, not a consumer-facing HDS component
> 
> VisualsPage
> Image-led visual design archive with TOC-registered sections.
> @category Portfolio


## Utilities

### `CategoryComponentDocs`
Path: `src/app/components/CategoryComponentDocs.tsx`

Exports: `getCategoryComponentNames`, `CategoryComponentDocs`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `DocSection`, `HdsComponentDoc`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @doc-exempt: documentation orchestration helper - renders manifest-backed component docs by category
> motion-ok: this orchestration helper delegates interaction feedback to the child HDS components it renders rather than animating at the wrapper level

### `HdsComponentDoc`
Path: `src/app/components/ComponentDocPage.tsx`

Exports: `HdsComponentDoc`

Local HDS dependencies:
- `src/app/components/Alert.tsx` via `Alert`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Disclosure.tsx` via `Disclosure`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/PreviewFrame.tsx` via `PreviewFrame`
- `src/app/components/SegmentedControl.tsx` via `SegmentedControl`
- `src/app/components/SpecimenBlock.tsx` via `SpecimenBlock`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/components/Token.tsx` via `Token`
- `src/app/components/propTableUtils.tsx` via `buildPropTableRows`, `PROP_TABLE_COLUMNS`, `type ComponentPropRow`
- `src/app/components/tokenTableUtils.ts` via `buildObservedTokenRows`, `buildReflectiveTokenRows`
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`, `useToc`

Top comment:
> @doc-exempt: documentation shell for generated
> 
> HdsComponentDoc - storefront documentation shell for shared components and internal utilities.
> @category Utilities

### `AutoPreviewSpecimen`
Path: `src/app/components/componentPreviewRegistry.tsx`

Exports: `getPreviewVariantGroups`, `AutoPreviewSpecimen`, `VariantPreviewDeck`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/HdsButtonGroup.tsx` via `HdsButtonGroup`
- `src/app/components/NavGroup.tsx` via `NavGroup`
- `src/app/components/NavItem.tsx` via `NavItem`
- `src/app/components/PreviewFrame.tsx` via `PreviewFrame`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/lab/tokenUtils.ts` via `allTokens`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.

### `DocPageFooterNote`
Path: `src/app/components/DocPageFooterNote.tsx`

Exports: `DocPageFooterNote`

Local HDS dependencies:
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/components/InlineLink.tsx` via `InlineLink`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @doc-exempt: doc shell utility, not a consumer-facing HDS component

### `DocPageSpec`
Path: `src/app/components/DocPageSpec.tsx`

Exports: `DocPageSpec`

Local HDS dependencies:
- None

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @doc-exempt: doc-infrastructure — renders machine-readable JSON-LD on HDS doc pages. Not a design-system UI primitive.
> 
> ── Types ─────────────────────────────────────────────────────────────────────

### `ComponentPreview`
Path: `src/app/components/ComponentPreview.tsx`

Exports: `ComponentPreview`

Local HDS dependencies:
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: preview harness used by docs and lab tooling, not a consumer-facing HDS surface.
> 
> ComponentPreview - framed preview harness for utility and lab specimens.
> @category Utilities

### `HdsSlider`
Path: `src/app/components/Controls.tsx`

Exports: `HdsSlider`, `HdsToggle`, `HdsRadio`, `HdsSelect`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> Controls â€” shared input/control primitives used across HDS docs and sketches.
> @category Inputs
> @tier utility
> @doc-exempt: barrel re-export module; consumers reference HdsSlider / HdsToggle / HdsRadio / HdsSelect directly
> 
> HdsSlider, HdsToggle, HdsRadio, HdsSelect â€” token-compliant throughout.
> These are first-class HDS components housed in src/app/components/.
> Sketch surfaces consume them; they do not define them.
> 
> Token acceptance criteria:
>   âœ“ All spacing via hds.space.* â€” no raw pixel numbers
>   âœ“ All color via var(--semantic-*) or hds.color.* â€” no hardcoded hex
>   âœ“ Typography via hds.typeStyles.* â€” no raw font sizes
>   âœ“ Border radius via hds.borderRadius.action â€” references semantic.radius.action
>   âœ“ Transitions reference hds.motion.productive.duration â€” no raw ms/s literals
>   âœ“ accentColor â†’ --semantic-color-surface-accent (brand token, not blue-500)
>   âœ“ Motion via motion/react for interactive states
>   âœ“ hds-focus on all focusable elements

### `ControlsPanel`
Path: `src/app/components/ControlsPanel.tsx`

Exports: `ControlsPanel`, `ControlsSection`

Local HDS dependencies:
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: sketch control shell helper used by tooling surfaces, not a consumer-facing HDS component.
> 
> ControlsPanel - shared controls shell for system maintenance surfaces and sketch tooling.
> @category Utilities

### `DocLabel`
Path: `src/app/components/DocSections.tsx`

Exports: `DocLabel`, `Swatch`, `SurfaceSwatch`, `HRule`, `FONT_SIZES`, `LETTER_SPACING`, `bezierPath`, `DemoButton`, `DemoTag`, `TooltipDemo`, `CascadePreview`

Local HDS dependencies:
- `src/app/components/CascadeText.tsx` via `CascadeText`
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Tag.tsx` via `Tag`
- `src/app/components/Token.tsx` via `Token`
- `src/app/components/Tooltip.tsx` via `Tooltip`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> DocSections — shared utilities, data, and demo components for the HDS docs.
> @doc-ignore
> 
> This file is the shared source of truth for:
>   • Shared sub-components — DocLabel, Swatch
>   • Reference/demo arrays that still belong to component docs — TYPE_PRESETS, TOKEN_REF_GROUPS, etc.
>   • Interactive demo components — DemoButton, DemoTag, TooltipDemo, etc.
> 
> Editorial data like AUDIT_LOG and GUIDANCE_DATA now lives in /src/app/data/hdsEditorial.tsx
> and is re-exported here for backward compatibility.
> 
> ct() — the runtime theme resolver — lives in /src/app/design-system/theme.ts.
> It is re-exported from here for backward-compat with existing page imports.
> 
> Page-level layout lives in /src/app/pages/hds/*.tsx.
> ALL style values reference hds tokens — no hardcoded colours, sizes, or spacing.

### `PreviewFrame`
Path: `src/app/components/PreviewFrame.tsx`

Exports: `PreviewFrame`

Local HDS dependencies:
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Text.tsx` via `Text`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: documentation preview shell used by component docs and utilities.
> 
> PreviewFrame - documentation preview shell for storefront component demos.
> @category Utilities

### `SketchRange`
Path: `src/app/components/SketchControls.tsx`

Exports: `SketchRange`, `SketchCheckbox`, `SketchButton`, `SketchTextarea`, `SketchPanelToggle`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Grid.tsx` via `Grid`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @tier utility
> 
> @doc-exempt: internal sketchbook control set used by private lab routes
> ref-ok: internal sketchbook controls are not consumer-facing form primitives

### `useHorizontalScroll`
Path: `src/app/components/hooks.ts`

Exports: `useHorizontalScroll`, `useScrollProgress`, `useNoVerticalScroll`

Local HDS dependencies:
- None

Top comment:
> No top-of-file intent comment found.

### `formatCategoryLabel`
Path: `src/app/components/lab/tokenUtils.ts`

Exports: `formatCategoryLabel`, `getTokensByTier`, `getTierCategories`, `formatTokenValue`, `resolveAlias`, `resolveAliasCssVar`, `resolveTokenLiteralValue`, `getTokenModeValue`, `groupByCategory`

Local HDS dependencies:
- None

Top comment:
> tokenUtils — flatten hirobius.tokens.json into a searchable list
> and trace alias chains through the three-tier hierarchy.

### `buildPropTableRows`
Path: `src/app/components/propTableUtils.tsx`

Exports: `buildPropTableRows`

Local HDS dependencies:
- `src/app/components/Table.tsx` via `type TableColumn`, `type TableRow`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @doc-exempt: internal HDS documentation utility that shapes generated prop rows for Table

### `TokenDisplayToggle`
Path: `src/app/components/TokenDisplayToggle.tsx`

Exports: `TokenDisplayToggle`

Local HDS dependencies:
- `src/app/components/SegmentedControl.tsx` via `SegmentedControl`

Top comment:
> @internal — utility-tier component; not part of @hirobius/design-system public API.
> 
> @doc-exempt: internal display toggle, not a consumer-facing HDS component

### `buildReflectiveTokenRows`
Path: `src/app/components/tokenTableUtils.ts`

Exports: `buildReflectiveTokenRows`, `buildObservedTokenRows`

Local HDS dependencies:
- `src/app/components/lab/tokenUtils.ts` via `resolveTokenLiteralValue`

Top comment:
> No top-of-file intent comment found.

### `types`
Path: `src/app/components/types.ts`

Exports: None detected

Local HDS dependencies:
- None

Top comment:
> ─── Types ────────────────────────────────────────────────────────────────────

### `IconGallery`
Path: `src/app/pages/hds/components/IconGallery.tsx`

Exports: `IconGallery`

Local HDS dependencies:
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/Input.tsx` via `Input`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Text.tsx` via `Text`

Top comment:
> No top-of-file intent comment found.

### `DocPageHeader`
Path: `src/app/pages/hds/HdsDocPrimitives.tsx`

Exports: `useIsMobile`, `DocPageHeader`, `DocSection`, `DocSubsection`, `HdsFoundationSection`, `HdsFoundationSubsection`, `FoundationSwatchGrid`, `HdsFoundationTableStack`

Local HDS dependencies:
- `src/app/components/HdsButton.tsx` via `HdsButton`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/PreviewFrame.tsx` via `PreviewFrame`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/Table.tsx` via `Table`
- `src/app/components/Text.tsx` via `Text`
- `src/app/components/TextLockup.tsx` via `TextLockup`
- `src/app/components/Token.tsx` via `Token`
- `src/app/components/propTableUtils.tsx` via `buildPropTableRows`, `PROP_TABLE_COLUMNS`, `type ComponentPropRow`
- `src/app/pages/hds/HdsTocContext.tsx` via `slugify`, `useToc`

Top comment:
> HdsDocPrimitives â€” shared doc-page building blocks.
> @doc-ignore
> 
> Previously embedded in HDSLayout.tsx. Extracted so page files can import
> from a single, focused module without pulling in the entire shell.
> 
> Import pattern (from a sibling hds/ page):
>   import { DocPageHeader, DocSection, useIsMobile } from './HdsDocPrimitives';
> 
> Import pattern (from hds/components/ sub-page):
>   import { DocPageHeader, DocSection, ComponentBlock } from '../HdsDocPrimitives';

### `TocProvider`
Path: `src/app/pages/hds/HdsTocContext.tsx`

Exports: `useToc`, `TocProvider`, `useTocActiveId`, `slugify`

Local HDS dependencies:
- None

Top comment:
> HdsTocContext — TOC registration context, active-section tracker, and slug helper.
> 
> Extracted from HDSLayout.tsx to break the circular-dependency between
> HdsDocPrimitives (which needs useToc for DocSection) and HDSLayout (which
> provides TocProvider and renders TocPanel / TocMobileDropdown).
> 
> No styles, no layout — pure state and behaviour.

### `LegacyTokenExplorerPanel`
Path: `src/app/pages/hds/LegacyTokenExplorerPanel.tsx`

Exports: `LegacyTokenExplorerPanel`

Local HDS dependencies:
- `src/app/components/Controls.tsx` via `HdsSelect`
- `src/app/components/Icon.tsx` via `Icon`
- `src/app/components/IconButton.tsx` via `IconButton`
- `src/app/components/Input.tsx` via `Input`
- `src/app/components/Stack.tsx` via `Stack`
- `src/app/components/Tag.tsx` via `Tag`
- `src/app/components/lab/LegacyTokenList.tsx` via `LegacyTokenList`
- `src/app/components/lab/TokenCollectionList.tsx` via `TokenCollectionList`
- `src/app/components/lab/tokenUtils.ts` via `allTokens`, `FlatToken`, `formatCategoryLabel`, `formatTokenValue`, `getTierCategories`, `getTokensByTier`, `groupByCategory`, `resolveTokenLiteralValue`, `Tier`
- `src/app/layouts/DocLayout.tsx` via `DOC_LAYOUT_STICKY_OFFSET`, `DOC_LAYOUT_STICKY_VIEWPORT_HEIGHT`
- `src/app/pages/hds/HdsDocPrimitives.tsx` via `useIsMobile`

Top comment:
> No top-of-file intent comment found.

### `PortfolioAssetFrame`
Path: `src/app/pages/hds/PortfolioAssetSlot.tsx`

Exports: `resolvePortfolioAssetSlot`, `PortfolioAssetFrame`, `PortfolioAssetCaption`

Local HDS dependencies:
- `src/app/components/AssetImg.tsx` via `AssetImg`
- `src/app/components/ImageLightbox.tsx` via `ImageLightbox`
- `src/app/components/HdsSurface.tsx` via `HdsSurface`
- `src/app/components/types.ts` via `type PortfolioItem`

Top comment:
> @doc-exempt: portfolio page helper, not a consumer-facing HDS component

### `TokenCascadeDiagram`
Path: `src/app/pages/hds/TokenCascadeDiagram.tsx`

Exports: `TokenCascadeDiagram`

Local HDS dependencies:
- `src/app/components/Token.tsx` via `Token`

Top comment:
> TokenCascadeDiagram — visualises the primitive → semantic → component
> token cascade. Three columns of node boxes connected by SVG bezier curves
> computed after layout via useLayoutEffect + ResizeObserver.
