# Hiring-Bar Audit — 2026-05-10

Run pre-deploy as part of Track 1. Each finding categorized as **fix-now** (T1 blocker), **fix-later** (T2 backlog), or **decide** (needs Adrian).

## Method

Static analysis of source files + production build output (`dist/`). Build command: `pnpm build:prerender`. Five routes successfully prerendered. Lens: would a design-systems hiring manager (Stripe / Figma / Shopify / Atlassian / Vercel) form a positive-or-negative impression in 2–5 minutes?

## Build result

All 5 declared prerender routes succeeded:

- `✓ / → dist/index.html`
- `✓ /microsoft-design-systems → dist/microsoft-design-systems/index.html`
- `✓ /case-studies/hirobius → dist/case-studies/hirobius/index.html`
- `✓ /visuals → dist/visuals/index.html`
- `✓ /info → dist/info/index.html`

Routes not prerendered (SPA fallback via Vercel rewrite): `/case-studies/the-ranch-foundation`, `/vibe-sketchbook/*`, `/lab/incubator`.

---

## Findings

### `/`

- 4 tiles render correctly: Microsoft Design Systems, Visual Design, The Ranch Foundation, Vibe Sketchbook.
- Tile titles are clear and distinct. Caption ("DS showcase", "Work samples", "Nonprofit case study", "Playground") is legible.
- `<h1>` is sr-only (`"Adrian Milsap portfolio home"`) — correct a11y pattern; visual identity comes from tile layout.
- Ranch Foundation tile uses generic `plus` mark logo — same glyph as Vibe Sketchbook tile (`✦`). **fix-later**: Adrian to supply TRF mark (already noted in source comment).
- Grid logic: 1 col mobile / 2 col md / 3 col xl — correct per spec. No overflow or layout-breaking code visible.
- No console.log, no TODO/FIXME, no broken asset refs.
- Status: **PASS**

### `/info`

- Profile image: `adrian.webp` — file confirmed present at `public/assets/adrian.webp`.
- Heading: "Adrian Milsap" as `<h1>`, subtitle "Digital Designer & Systems Architect".
- Bio body copy is coherent for hiring-manager scan.
- Inline link to `/ops/hds/color` (the gated HDS docs) — visitor will hit the OpsGate password screen. Acceptable: it signals the system exists without exposing it publicly. **fix-later**: consider whether the link should be removed or replaced with a prose-only mention for public viewers.
- No console.log, no placeholder text, no broken refs.
- Status: **PASS**

### `/microsoft-design-systems`

- Build asset check: all 13 referenced MDS assets confirmed present (`hero-01.png`, `asset-19.png` through `asset-34.png`).
- TL;DR lead is present as `INTRO_TL_DR` constant — visible at page top: "Visual Designer on the Xbox Design System (XDS) team, then scaled to Microsoft Game Dev (MGD). Migrated hundreds of legacy Sketch assets into a centralized Figma ecosystem (~50 production components)…"
- `<h1>` is sr-only (`"Building a Unified Xbox Ecosystem"`) — visual heading uses a `<p>` styled `display1`. Semantic gap (heading should be an `<h1>` element, not a `<p>`), but not blocking for hiring manager. **fix-later**.
- Pillar 02 ("Operational Scalability") has `leadSlots: []` and `gallerySlots: []` — the gallery renders nothing for this pillar. Only principles list shows. **fix-later**: not broken, but sparse.
- No console.log, no TODO/FIXME, no placeholder text.
- Status: **PASS**

### `/visuals`

- All 38 asset references checked — all confirmed present across `visuals/xdl/`, `visuals/xbox-app/`, `visuals/sculpting/`, `visuals/illustrations/`.
- `StackedCardRail` carousel is present at page top. Spec notes a "broken carousel symptom" — not fixed here per instruction. Component has `@supports` guards for `animation-timeline: view()` with plain horizontal scrolling as fallback. The spec's concern is likely the scroll-driven stacking not firing on Safari < 18. **fix-later**.
- `<h1>` is sr-only (`"Visual Design"`) — visible heading uses `TextLockup`. Acceptable pattern consistent with rest of portfolio.
- No console.log, no placeholder text, no broken refs.
- Status: **PASS** (carousel symptom deferred to T2)

### `/vibe-sketchbook`

- Index route was redirecting to `/vibe-sketchbook/cloth-simulation` (status: `wip`). Landing a hiring-manager scan on a WIP sketch is a negative signal. **Fixed**: index now redirects to `logo-lab` (status: `live`).
- `SketchbookIndexPage` exists (`src/app/pages/sketches/SketchbookIndexPage.tsx`) but was never wired into routes — dead code. **fix-later**: decide whether to expose gallery index as the sketchbook entry point.
- 6 named live sketches: `logo-lab`, `particle-tunnel`, `morph-tiles`, `kinetic-type`, `three-scene` — all have dedicated route entries. `cloth-simulation` is still accessible at its slug but no longer the default landing.
- No console.log in public sketch files.
- Status: **FIXED** (index redirect corrected)

### `/case-studies/hirobius`

- `noindex` was implemented client-side only via `useEffect` — **not present in prerendered HTML**, meaning search crawlers could index the page before JS hydrates. **Fixed**: `prerender.mjs` now injects `<meta name="robots" content="noindex" />` into the static HTML for this route. Verified in `dist/case-studies/hirobius/index.html`.
- Single `<h1>` visible: "The strongest Hirobius signal is not the design language alone…" — strong hiring-manager signal. Copy is tight and credible.
- No console.log, no TODO/FIXME, no broken asset refs.
- Status: **FIXED** (noindex now in static HTML)

### `/case-studies/the-ranch-foundation`

- **Three visible placeholder blocks** were present — dashed-border divs with literal text:
  - `"Visual placeholder — ranchfoundation.com screenshot"` (§ Why this exists)
  - `"Visual placeholder — Wix Harmony layout + wellness practice card annotation"` (§ Decisions surfaced)
  - `"Visual placeholder — delivery status table"` (§ What's live / what's pending)

  These would read as unfinished work to any hiring manager. **Fixed**: all three removed. The surrounding prose is sufficient to carry each section. Asset placeholders remain as HTML comments only (`{/* T2: replace with TRF asset */}`).

- **React key warning** — `AT_A_GLANCE.map()` used bare `<>` fragments without `key` prop. `<dt>` and `<dd>` had keys but the fragment wrapping them did not, causing a React console warning. **Fixed**: fragments replaced with keyed `<Fragment key={label}>`. Import added.

- Page is not prerendered (not in `prerender.mjs` ROUTES). Falls back to SPA shell via Vercel rewrite — works correctly. **fix-later**: add prerender entry for SEO and first-paint speed.

- Content quality: 7 sections, ~430 lines. Prose is coherent, specific, and demonstrates design-systems thinking applied to a non-React context. Strong signal for hiring managers who care about breadth.

- Status: **FIXED** (3 placeholders removed, key warning fixed)

### `/lab/incubator`

- Page renders as an empty staging ground: title "Component Incubator", description "Staging ground for AI-generated draft components before they are promoted to the core library." One Surface with a mount point but no component mounted.
- This is an internal tool surface that was never intended as a public-facing portfolio page.
- No broken images, no console.log, no TODOs.
- **D5 verdict: 404**. See below.

### Cross-cutting

**Mobile responsiveness signals**

- Homepage uses JS-driven column count (`resolveHomeTileColumns`) with explicit 1/2/3 breakpoints. Clean.
- Ranch Foundation, Hirobius, and MDS pages use `isMobile` hook for layout branching. Patterns are consistent.
- Visuals page has explicit mobile reorder for the Xbox App section — thoughtful.

**Asset load verification**

- All 13 MDS assets present. All 38 visual assets present. Profile image and OG image present.
- No broken asset references found across any audited page.

**Console errors / warnings**

- No `console.log` found in any public-facing page source.
- One React key warning in TRF page (fixed in this audit).
- Prerender script `--localstorage-file` warning is a build-time artifact, not a runtime issue.

**Accessibility quick scan**

- Each public page has exactly one `<h1>` (sr-only or visible). No duplicate h1s found.
- All `<img>` elements route through `AssetImg` → `PortfolioAssetFrame` with `alt` required in slot definitions. Alt text is descriptive throughout.
- `<figure>` on `/info` profile image has `<figcaption>`. Keyboard expand/collapse is wired (`Enter`/`Space`/`Escape`).
- Focus visibility: inherits from HDS CSS variables. Not audited at pixel level — **fix-later**.

**Hirobius link on `/info`**

- `<InlineLink href="/ops/hds/color">Hirobius</InlineLink>` routes to the gated ops section. A visitor without the password hits the password screen. Not broken, but could confuse a recruiter. **fix-later**.

---

## Fix-now actions taken

1. **TRF placeholder text removed** — `src/app/pages/hds/RanchFoundationCaseStudyPage.tsx` — 3 visible dashed placeholder divs replaced with HTML-comment stubs only.
2. **TRF React key warning fixed** — same file — `AT_A_GLANCE.map()` fragments keyed via `<Fragment key={label}>`, `Fragment` import added.
3. **Hirobius noindex in static HTML** — `scripts/prerender.mjs` — `noindex: true` field added to route entry; `injectIntoShell` now emits `<meta name="robots" content="noindex" />` when flag is set; strip regex updated to be idempotent. Verified in rebuilt `dist/case-studies/hirobius/index.html`.
4. **Vibe Sketchbook default redirect** — `src/app/routes.tsx` — index route changed from `cloth-simulation` (WIP) to `logo-lab` (live).

---

## Fix-later (T2 backlog)

- **TRF not prerendered** — add `/case-studies/the-ranch-foundation` entry to `prerender.mjs` ROUTES with title/description/ogImage. Low urgency given Vercel SPA rewrite fallback.
- **MDS Pillar 02 empty gallery** — `gallerySlots: []` for Operational Scalability. Add assets or remove the empty gallery render path.
- **MDS visual heading semantic** — `<p style={{...display1}}>` should be `<h2>` for semantic correctness. Currently has sr-only `<h1>` + visible `<p>`. Fix heading level.
- **Vibe Sketchbook index page** — `SketchbookIndexPage` exists but is unreachable. Either wire it as the index route (replacing the current redirect), or delete it.
- **`/info` Hirobius link** — consider whether the `/ops/hds/color` link should remain public-facing or be rewritten as prose-only for visitors without the ops password.
- **Carousel scroll-driven stacking** — Safari < 18 gets plain horizontal scroll, no stack animation. Acceptable fallback per `@supports` guard; note for T2 refinement.
- **Both home tiles use `✦` logo** — Ranch Foundation and Vibe Sketchbook share the same `plus` glyph. Adrian to supply TRF mark.
- **Focus visibility** — not tested at pixel level; inherits HDS tokens; surface for T2 a11y pass.

---

## D5 verdict on `/lab/incubator`

**Verdict: 404**

Rationale: The incubator is an empty staging mount with no content and no portfolio value. A hiring manager who stumbles on it via the tile grid (it appears on the homepage as a linked route) sees a blank page titled "Component Incubator" with no components. This creates a negative impression of incompleteness. The route should redirect to `/404` or be removed from the public navigation surface. The functionality can remain accessible via `/ops/*` as an internal tool.

Note: `/lab/incubator` is not linked from the homepage tiles (only accessible by direct URL) and does not appear in the sitemap. However, the route is live and publicly accessible. A 404 redirect is the cleanest resolution.
