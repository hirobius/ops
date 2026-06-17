# Design Extract Gap Analysis — Static + Motion/Video Ingestion

**Unit:** `backlog-13-design-extract-gap-analysis`  
**Date:** 2026-05-02  
**Reference repo:** [github.com/Manavarya09/design-extract](https://github.com/Manavarya09/design-extract)

---

## 1. What We Already Cover

Our stack is deeper in some dimensions than design-extract and shallower in others. Mapping what exists:

### Visual regression + viewport diffing
- `scripts/visual-ingest.mjs` — Playwright-driven full-page screenshot capture at multiple breakpoints, pixelmatch-backed diff, foundation parity check against live Vercel URL. Covers desktop + mobile viewports.
- `tests/visual.spec.ts` — pixel regression at mobile (375px), tablet (768px), desktop (1280px), TV (1920px) in light/dark themes. Interactive state capture for hover/focus/disabled on HDS primitives.
- `tests/responsive.spec.ts` — layout integrity checks across breakpoints.

### Token extraction and sync
- `hirobius.tokens.json` — DTCG-structured token source with primitive, semantic, component, and role tiers.
- `scripts/sync-tokens.js` (figma plugin) — bidirectional Figma Variable sync: OKLCH → RGB, full collection management (Primitive, Semantic, Component).
- `scripts/audit-tokens.mjs` — validates token paths, descriptions, renames, rebake-detection.
- `scripts/build-tokens.mjs` / `build-hds-tokens.mjs` — CSS custom property generation from DTCG source.

### Component manifest + anatomy
- `public/hds-manifest.json` — machine-readable inventory: category, tier, props, states, a11y rules, Figma links, slot anatomy, token mapping, figmaPropertyMapping.
- `scripts/generate-manifest.mjs` — self-driving manifest regen from source tree.
- `src/app/data/component-api.json` — full prop table and TypeScript interface parity per component.
- `scripts/component-discovery.mjs` — AST-based component scanner.
- `scripts/enrich-manifest.mjs` — enriches manifest entries from live source.

### DOM/CSS token audit
- `scripts/headless-scan.browser.js` — browser-injected scanner that resolves `getComputedStyle` against a `var(--token)` inverse map; checks color, spacing, typography, shape; flags raw values not routed through tokens.
- `scripts/batch-scan.mjs` — Playwright-driven multi-route runner that injects the headless scanner, deduplicates findings, writes fix-prompt files to `scans/`.
- `scripts/ui-lint.mjs` — component-level linting against HDS rules.

### WCAG / a11y audit
- `tests/a11y.spec.ts` — axe-core via `@axe-core/playwright`, WCAG 2.1 AA, all foundation and component routes. Blocks on critical/serious violations.
- `scripts/audit-components.mjs` — component a11y rule check.

### Figma pipeline
- `figma-agent-plugin/` — bi-directional: token sync, template injection, component property inspection, HMAC auth, reverse token sync, snapshot, XPath query, pair mode.
- `scripts/hds-bridge.mjs` — local bridge server (port 3005) with correlation, auth, runtime error collection, gatekeeper, retry loop.
- `scripts/figma-diff.mjs` / `figma-parity-check.mjs` — manifest-to-Figma drift detection.
- `scripts/figma-sync.ts` — structured sync orchestrator.

### MCP / LLM integration
- `scripts/llm-stream-bridge.mjs` — streaming LLM bridge.
- `public/llms.txt` + `public/hds-manifest-agent.json` — LLM-optimized projections of the manifest for AI consumption.
- Agent dispatch system (Hermes Agent kanban + `~/.hermes/kanban.db`) — autonomous build pipeline.

---

## 2. Gaps Worth Closing

The design-extract repo is a URL-in, 17-files-out Playwright crawler. Its primary strength is **external-URL ingestion**: point it at any deployed site and extract tokens + component anatomy without needing source access. Our stack is source-first. The meaningful gaps:

### Gap A — External URL token extraction (no source access required)
**design-extract approach:** Navigate to a URL, resolve all `getComputedStyle` values across every DOM element at 4 breakpoints, emit DTCG tokens.  
**Our gap:** `headless-scan.browser.js` checks existing HDS token _usage_ (CSS variable routing compliance) but does not perform a fresh token _discovery_ pass. It requires a token inverse map pre-built from our source. It cannot extract a token set from an unknown third-party site.  
**Worth closing?** Yes — for the client tenant use case (Concrete Creations, Ranch Foundation, Lilac Insure). Crawling a client's existing site to generate a baseline DTCG token set before onboarding them into HDS is a real workflow.

### Gap B — Tailwind / shadcn output generation
**design-extract approach:** Maps extracted CSS values to Tailwind config format and shadcn theme variables.  
**Our gap:** We have no Tailwind output path. We output CSS custom properties + DTCG JSON.  
**Worth closing?** Conditionally. Our tenant token override system uses CSS variables, not Tailwind. If a client wants a Tailwind-first handoff, this matters. Low priority unless a client requests it explicitly.

### Gap C — Interaction state capture at scale (DOM snapshot per state)
**design-extract approach:** For each interactive element, triggers hover/focus/active/disabled states and captures DOM snapshots + computed styles per state.  
**Our gap:** `tests/visual.spec.ts` captures interaction states for specific known HDS components on specific routes. It does not do a full-DOM sweep of unknown states across all elements at all routes.  
**Worth closing?** Yes, incrementally. A Playwright script that sweeps all focusable/hoverable elements and snapshots computed style changes would catch untokenized state transitions. Medium priority.

### Gap D — Component anatomy extraction (structural, not visual)
**design-extract approach:** Parses DOM structure to infer component boundaries, child slots, and semantic roles.  
**Our gap:** Our manifest drives component anatomy from source (TypeScript interfaces + JSDoc). We do not do a post-render DOM anatomy extraction to validate that the rendered output matches the documented anatomy.  
**Worth closing?** Yes — a DOM anatomy validator that checks rendered slot structure against `hds-manifest.json` anatomy entries would catch silent slot regressions. Medium priority.

### Gap E — MCP server output from extraction
**design-extract approach:** Spins up an MCP server exposing extracted tokens and component data as tools, consumable by any MCP-aware client.  
**Our gap:** We have the LLM projection files (`public/llms.txt`, `public/hds-manifest-agent.json`) but no runtime MCP server wrapping live token/component data.  
**Worth closing?** Yes — a thin MCP server that serves `hds-manifest.json` and `hirobius.tokens.json` as queryable tools would let Claude and VS Code Copilot fetch live HDS context without manual file reads. Medium priority.

---

## 3. Motion and Video Ingestion Path

This is the deepest gap and the most architecturally novel. design-extract captures **static computed styles** and **CSS `transition`/`animation` declarations** (the text of the rule) — not runtime motion behavior.

### What design-extract actually does for motion
- Reads `transition` and `animation` CSS properties from `getComputedStyle`.
- Outputs timing functions, durations, and easing values as tokens.
- Does NOT trigger the transitions or record them.
- Does NOT capture JS-driven motion (GSAP, Framer Motion, React Spring).

### What we currently have
- `hirobius.tokens.json` has a `motion` section with `duration.*`, `easing.*`, and `reduce-motion.*` tokens.
- `tests/visual.spec.ts` captures static screenshots; no motion capture.
- `scripts/visual-ingest.mjs` captures full-page PNGs; no video.
- No runtime animation inspector or CSS animation declaration extractor.

### Proposed motion ingestion architecture

**Tier 1 — CSS declaration harvest (low cost, no new deps)**  
Extend `headless-scan.browser.js` to include `transition`, `animation`, `animation-duration`, `animation-timing-function`, `animation-delay` in the `CHECKED_PROPERTIES` map. Match the computed values against our `motion.*` token paths. Flag untokenized raw durations (e.g., `0.3s` not routed through `var(--duration-fast)`). This is a direct analogue of what design-extract does for motion — attainable now.

**Tier 2 — Runtime motion recording (medium cost, Playwright video)**  
Playwright supports `video: 'on'` in its context options. A new script (`scripts/motion-capture.mjs`) could:  
1. Launch pages with `{ video: 'on' }`.  
2. Trigger interactive states (hover, focus, click, transition-in).  
3. Save `.webm` recordings per component per state.  
4. Parse the video as frame sequences using ffmpeg/canvas extraction to detect frame-by-frame delta (motion energy).  
The output is a motion artifact per component — not a token, but an audit surface. High storage cost; only worth running as a pre-release gate.

**Tier 3 — JS animation instrumentation (higher cost, requires monkey-patching)**  
Framer Motion, GSAP, and React Spring all expose animation APIs at the JS layer. Capturing their runtime behavior requires either:
- A browser extension/CDP override that intercepts `requestAnimationFrame` callbacks and records easing/duration data.
- Monkey-patching `Element.prototype.animate` (Web Animations API) in the Playwright context before navigation.

This is architecturally expensive and brittle. Recommendation: **skip for now**. CSS declaration harvest covers the 90% case. If a client has a GSAP-heavy site, a one-off audit session is more practical than automation.

**Tier 4 — Screen-recorded user flows (video ingestion for UX audit)**  
`scripts/video-clone.mjs` already exists in the repo (video utility). The design-extract repo does not cover this either. For user-flow motion (multi-step transitions, page transitions, scrolled animations), Playwright's `recordVideo` output can be processed with ffmpeg to extract keyframes and run pixelmatch between them. This is a reporting tool, not a token extractor. Out of scope for the current phase.

---

## 4. Proposed Unit Stubs

### `backlog-14-ext-token-crawler`
**Job:** New script `scripts/crawl-external-tokens.mjs` — Playwright crawler that visits any URL, injects a token discovery pass (no source required), and emits a DTCG JSON baseline. Uses `getComputedStyle` sweep across all elements at 375/768/1280/1920. No inverse map required. Output: `scans/<slug>-token-baseline.dtcg.json`.  
**Why:** Enables client onboarding baseline extraction (Gap A).  
**Effort:** Medium. New script, no manifest changes.

### `backlog-15-motion-token-audit`
**Job:** Extend `headless-scan.browser.js` `CHECKED_PROPERTIES` to include `transition`, `animation-duration`, `animation-timing-function`. Update token inverse map builder to include `motion.*` paths. Update `batch-scan.mjs` to surface motion token violations in fix-prompt output.  
**Why:** Closes the CSS motion declaration gap (Tier 1 of motion ingestion path). No new deps.  
**Effort:** Small. Additive changes to two existing scripts.

### `backlog-16-dom-anatomy-validator`
**Job:** New Playwright spec `tests/anatomy.spec.ts` — for each component listed in `hds-manifest.json` with a `slots` array, render the component on its doc page, query the DOM for expected slot elements, and assert presence. Fail if a documented slot is absent in the rendered output.  
**Why:** Closes Gap D (rendered anatomy vs documented anatomy drift). Catches silent regressions in slot structure.  
**Effort:** Medium. New test file, reads manifest.

### `backlog-17-hds-mcp-server`
**Job:** New script `scripts/hds-mcp-server.mjs` — minimal MCP server (JSON-RPC over stdio) exposing two tools: `get_component(name)` → manifest entry, `get_token(path)` → resolved token value. Reads `public/hds-manifest.json` and `hirobius.tokens.json` at startup. Register in `.claude/mcp.json`.  
**Why:** Closes Gap E. Lets Claude and VS Code Copilot query live HDS data without reading files manually. Directly extends our existing MCP integration patterns.  
**Effort:** Medium. New 100-line script + `.claude/mcp.json` registration.

### `backlog-18-interaction-state-sweep`
**Job:** New script `scripts/interaction-sweep.mjs` — Playwright-driven sweep of all focusable/hoverable elements across HDS doc routes. For each interactive element: compute style before, trigger hover/focus, compute style after, diff. Flag any style changes not routed through a `var(--*)` token. Output: `scans/<slug>-interaction-drift.json`.  
**Why:** Closes Gap C at scale. Catches untokenized interaction states that visual regression won't catch (color changes that are within pixel threshold but use raw values).  
**Effort:** Medium-high. New script, multi-route, requires careful state triggering.

---

## Summary

| Gap | Coverage | Priority | Proposed Unit |
|-----|----------|----------|--------------|
| External URL token extraction | None | High (client onboarding) | `backlog-14-ext-token-crawler` |
| Motion CSS declaration harvest | None | Medium | `backlog-15-motion-token-audit` |
| DOM anatomy validation | None | Medium | `backlog-16-dom-anatomy-validator` |
| MCP server for live HDS data | Partial (static files) | Medium | `backlog-17-hds-mcp-server` |
| Interaction state sweep | Partial (known components only) | Medium-high | `backlog-18-interaction-state-sweep` |
| Tailwind/shadcn output | None | Low | Backlog only if client requests |
| JS-driven motion (GSAP/Framer) | None | Low | Skip — brittle, manual audit preferred |
| Video flow recording | None | Low | Out of scope this phase |

Our stack outperforms design-extract on: source-aware token sync, Figma bidirectional pipeline, autonomous build orchestration, and tenant token overrides. design-extract's advantage is the source-free URL crawler. The highest-ROI close is `backlog-14-ext-token-crawler` (client onboarding) + `backlog-17-hds-mcp-server` (Claude tooling leverage).
