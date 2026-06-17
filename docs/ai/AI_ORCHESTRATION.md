# 🚀 HDS Orchestration State

## 🟢 System Status: STABLE
* Bi-directional token sync (Figma <-> Manifest) is live.
* AI Documentation auto-generation is live.
* Figma Component Scaffolder is live.
* Headless LLM streaming renderer (JSONL + SSE) is the active Figma direction.

## ✅ Generative UI Pipeline — Phases 1 & 2 COMPLETE (2026-04-28)

**What was built** (start a new session from Phase 4 — all earlier work is done and tested):

### Phase 1 — Native Variable Binding & Smart Placement (`figma-agent-plugin/code.js`)
- `streamPaintAsync`: semantic alias tokens (no resolved hex in manifest) now create a placeholder paint and bind the Figma variable so nodes get live color links, not raw fallback hex.
- `streamApplyTextProps`: font loading (`figma.loadFontAsync`) moved to **before** any text-property write. Font family now resolved from `streamTypographyFromToken` via `streamEnsureFont` — Atkinson Hyperlegible Next is used when available, Inter as fallback.
- `streamRenderAddNode`: root-level FRAME nodes now scan `figma.currentPage.children` for the rightmost edge and place at `x = rightEdge + 100` to prevent overlap.

### Phase 2 — JSX-to-Figma Compiler (`scripts/hds-jsx-compiler.mjs` + `scripts/generate-to-figma.mjs`)
- **New file** `scripts/hds-jsx-compiler.mjs`: zero-dependency recursive HTML/JSX → ADD_NODE compiler. Tokenizer → tree builder → `attrsToProps` → `treeToCommands`. Handles HDS JSX tags (`HdsFrame`, `Text`, `HdsInstance`, `Icon`) and standard HTML (`div`, `h1–h6`, `p`, `button`).
- `var:X` shorthand: `fill="var:color.surface.raised"` expands to `semantic.color.surface.raised`. `resolveDim()` coerces plain numeric strings to numbers so `streamResolveDimensionSync` doesn't choke.
- Card-class HTML defaults: `padding → semantic.space.component.padding`, `radius → semantic.radius.action`, `itemSpacing → semantic.space.layout.tight` — all as token paths so Figma variable binding fires.
- FRAME nodes compiled from JSX/HTML get `primaryAxisSizingMode: AUTO` + `counterAxisSizingMode: AUTO` so frames hug children instead of defaulting to 100×100.
- `generate-to-figma.mjs`: system prompt updated with HDS JSX alternative format. After stream drain, if `counters.forwarded === 0` and markup is present, the JSX compiler runs as a fallback.
- **New node type ICON** (`type: 'ICON'`): `<Icon name="ph:gear-bold" size="24" />` in JSX → compiler emits an ICON command → plugin fetches SVG from `https://api.iconify.design/{set}/{name}.svg` → `figma.createNodeFromSvg()`. Falls back to empty placeholder frame if Iconify unreachable.

### Test scripts added
- `pnpm test:phase1` — `scripts/test-phase1.mjs`: injects two ADD_NODE sequences directly to the bridge, bypassing the LLM, to verify variable binding + smart placement.

## ✅ Phase 3: Bi-Directional Canvas Reading — COMPLETE (2026-04-28)
## ✅ Phase 3.5: LLM Upgrade to hermes3 — COMPLETE (2026-04-28)

**Goal:** The LLM needs to "see" the current canvas so it can edit/fix existing UI, not just append new frames.

### Phase 3 — Completed tasks:

#### 3.5 — hermes3 LLM upgrade (`scripts/generate-to-figma.mjs`)
- Default model changed from `hds-coder` to `hermes3` (Nous Hermes 3 / Llama 3.1 8B, pulled 2026-04-28)
- Added `format: 'json'` (Ollama JSON mode — eliminates markdown fences and prose)
- Added `max_tokens: 4096` and `options: { num_ctx: 8192 }` (prevents context truncation on complex UIs)
- Trimmed `buildSystemPrompt` from ~700 tokens to ~250 tokens (leaves more headroom for output)
- `buildFixSystemPrompt` also trimmed to the same density target
- `isValidCommand` now accepts both `ADD_NODE` and `UPDATE_NODE`
- Type-hoist normalizer: if model puts `type` inside `props` for ADD_NODE, it is hoisted to top level automatically
- `HDS_LLM_MODEL`, `HDS_LLM_FORMAT` env vars added for runtime model switching without code changes
- Certified 4/4: settings card gen, fix background, fix fill+radius, login form gen — all produce valid schema-correct JSON with token-path fills

### Phase 3 Tasks (implement in order, self-heal before proceeding):

#### 3a — Bridge endpoints (`scripts/hds-bridge.mjs`)
Add two in-memory endpoints:
```js
// POST /selection — Figma plugin writes the current selection tree here
// GET  /selection — generate-to-figma.mjs reads it before prompting the LLM
let currentSelection = null;
app.post('/selection', (req, res) => { currentSelection = req.body; res.json({ ok: true }); });
app.get('/selection',  (req, res) => { res.json(currentSelection || {}); });
```

#### 3b — Plugin selection watcher (`figma-agent-plugin/code.js` + `figma-agent-plugin/ui.html`)
In `code.js`, add:
```js
figma.on('selectionchange', () => {
  const tree = figma.currentPage.selection.map(n => extractNodeTree(n));
  figma.ui.postMessage({ type: 'selection-changed', tree });
});
```
`extractNodeTree(node)` — recursive fn that returns `{ id, name, type, width, height, x, y, fills, boundVariables, children }` (stop recursing at depth 4 to avoid payload blowout).

In `ui.html`, listen for `selection-changed` and POST to `http://localhost:3005/selection`.

#### 3c — Fix mode in `generate-to-figma.mjs`
Add a `--fix` flag: `pnpm ui:fix "Make it dark mode"`. Script:
1. `GET /selection` → current canvas tree
2. Builds system prompt with the tree JSON as context: "Here is the current selected UI tree. Output only UPDATE_NODE or ADD_NODE commands to fulfill the instruction."
3. Streams LLM response → compiler → bridge → plugin

#### 3d — UPDATE_NODE support (`figma-agent-plugin/code.js`)
Handle `action: 'UPDATE_NODE'` in `figma.ui.onmessage` using `figma.getNodeById(command.id)` then reapply props.

### figma-cli inspired features to add (no new deps)
- [x] **`var:` shorthand** — DONE (Phase 2)
- [x] **SVG icon support via Iconify** — DONE (Phase 2)
- [ ] **XPath-like selection queries** — Add `GET /query?selector=//FRAME[@name~=Card]` bridge endpoint that walks `figma.root.findAll()` — Phase 3 bonus
- [ ] **Lint rules** — `GET /audit` bridge endpoint, 4 rules minimum: unnamed layers, hardcoded hex fills, text with no typography binding, frames with no auto-layout — Phase 4


# 🤖 HDS V2 MASTER ORCHESTRATION: AUTO-PILOT MODE

## 0. AGENT EXECUTION PROTOCOL (INTERNAL LOOP)
Perform these steps for EVERY task below. Do not mark a task as complete until Step 0.4 passes.

1. **READ**: Identify the first unchecked task.
2. **EXECUTE**: Apply the required code changes.
3. **VALIDATE**: Run `pnpm run heal` (Static) and `pnpm run heal:smoke` (Runtime). Zero errors allowed.
4. **SELF-HEAL**: Whenever you successfully self-heal a test failure or layout bug, you MUST append a timestamped entry to `docs/logs/AI_DECISION_LEDGER.md` detailing the 'Root Cause' and 'Resolution'.
5. **FINALIZE**: Mark as `[x]` and move to the next numbered task.

---

## 1. THE HDS UI INTEGRITY CONSTITUTION
*These rules are permanent guardrails. Enforce them autonomously during every task:*

- **The Sticky Rail Law**: All foundation pages using `DocLayout` MUST have a sticky `navSlot` and `tocSlot`.
- **The Hero Rule**: Primary page titles and hero text lockups must NEVER be wrapped inside an `<HdsSurface>`. They must sit flush on the background.
- **The Reading Column Rule**: All `DocLayout` content slots and documentation pages, including Token Explorer and technical foundations, MUST default to `contentMaxWidth="content"`. Overflowing tables or wide datasets must scroll horizontally inside their own container (`overflow-x: auto`) instead of expanding the page width. Only use `maxWidth="max"` for intentional full-bleed tables or galleries.
- **The Flush Rule**: Never wrap documentation content in an `<HdsSurface>` unless it is a standalone card. Content must sit flush on the background.
- **The Gap Mandate**: Every `Grid` and `Stack` MUST declare an explicit `gap`. Never rely on an implicit default for production layout spacing.
- **The Containment Rule**: Every text-holding surface or card MUST have internal padding so text never touches or bleeds over the border.
- **The Stretch Rule**: Side-by-side containers must utilize `align-items: stretch` to ensure a consistent horizontal "Visual Horizon."
- **The Motion Guardrail**: All new animations must respect `prefers-reduced-motion` via global CSS and `MotionConfig`.

---

## 2. THE EXECUTION QUEUE (ORDERED)

### Phases 1–6: Systems Foundations
- [x] **Tasks 1–15**: (Context, Enterprise Polish, Grid Engine, Macro-Layouts, and Framework Initialization completed).

### Phase 7: Macro-Layout Excellence & System Sync
- [x] **Task 17: Layout Breadth Audit (Fixing the "Narrow" Layout)**
- [x] **Task 18: Equal-Height & Vertical Alignment Logic**
- [x] **Task 19: Design Heuristic Implementation (Judgment Call Logic)**
- [x] **Task 20: Final Typography Visual Verification**

- [x] **Task 21: GitHub Repository Re-Alignment (The "Mass Commit")**
  - **Migration Report**: Create `docs/MIGRATION_REPORT_V2.md` summarizing the Grid Engine, DocLayout, and Foundation Swatch wins.
  - **Branching**: Create branch `migration/hds-v2`.
  - **Lock-in**: Commit with `arch(hds): systemic v2 architecture lock-in [skip ci]` and push to origin.

### Phase 8: Component Scrub, Hidden UI Sweep & Self-Learning
- [x] **Task 22: Component "Dry-Run" Audit**
  - Scrub `src/app/components/` for any remaining hardcoded hex codes, manual padding or raw `div` wrappers.
  - Replace any remaining `div` layout hacks with `Stack` or `Grid`.
  - Test every component in `IncubatorPage.tsx` at mobile (375px) and desktop (1440px).

- [x] **Task 22.5: Hidden UI Sweep**
  - Specifically hunt down "Hidden/Docked UI" (e.g., `SketchControls`, floating panels, drawers, modals) and ensure they consume semantic tokens and `Stack`/`Grid` primitives.
  - Sweep all remaining foundation, overview, and component pages into `DocLayout`.

- [x] **Task 23: Autonomous Memory Update (Self-Learning)**
  - Audit all recent visual fixes (especially "box-in-box" and "squished text" fixes).
  - Update `@ai-rules` JSDoc in `HdsSurface.tsx`, `Grid.tsx`, and `Stack.tsx` with "Lessons Learned" to prevent future regressions.

### Phase 9: Figma Sync & Token Hardening
- [x] **Task 24: Figma Variable Alignment**
  - Patched `build-figma-variables.mjs`: `expandTypography()` flattens 9-style ramp → 45 Figma scalar vars in Semantic collection.
  - Eradicated all camelCase CSS debt in `theme.css` (fluid overrides + body baseline + deprecated monoXs/monoSm aliases).
  - Injected `com.hirobius.fluid` extensions into display/heading1/heading2/heading3 tokens documenting clamp() spec.
  - All 17 layout-integrity tests pass. Total Figma variables: 302 (was 257).

- [ ] **Task 25: Deployment & Final Validation**
  - Run `pnpm check:release` to execute full build, style audits, and smoke tests.
  - Confirm Vercel previews pass the `HDS Token Scan` with a `FAIL_THRESHOLD` of 0.

## Phase 10: System Intelligence & Case Study Polish

- [x] **Task 26: The "Self-Heal" CLI Tool**
  - Create `scripts/self-heal.mjs`. 
  - Automate the process of running `visual-ingest`, comparing the local build vs. the live remote, and generating a formal "Diff Report" for the AI to parse and fix autonomously.
  - *(Completed: Automated smoke tests and diagnostic engine.)*

- [x] **Task 26.5: Token Explorer UX Overhaul & Type Ramp Scale-Up**
  - Globally increase the base primitive typography sizes (e.g., bumping `caption`, `ui`, and `body` up a step) to prevent blending at small sizes.
  - Redesign the `TokenExplorerPage`: implement sticky table headers, remove outer container padding to maximize horizontal real estate, and increase vertical row padding for data breathability.

- [x] **Task 27: Playwright Collision Detection (Micro-Guardrails)**
  - Create an automated test in the Playwright suite to evaluate DOM bounding boxes.
  - **Trigger 1:** Fail the build if sibling grid items overlap (enforcing the "Gap Mandate").
  - **Trigger 2:** Fail the build if child text overflows its parent container (enforcing the "Containment Rule").

- [ ] **Task 28: Token Shadow Cleanup & Component Promotion**
  - Perform a deep scrub of `theme.css` to remove any legacy variables that aren't mapped to the new `hirobius.tokens.json`.
  - [x] CLI tooling complete: `pnpm promote [ComponentName]` now promotes a drafted component from the lab/incubator search paths into `src/app/components/` and aborts unless the source already uses `React.forwardRef`.
  - [ ] Token cleanup and broader token compliance verification remain open.

- [ ] **Task 29: Incubator Dashboard Enhancement**
  - Update `src/app/pages/lab/IncubatorPage.tsx` to include a "Visual Diff Gallery".
  - Establish a workflow where the agent can post side-by-side screenshots of its autonomous UI fixes for your manual visual review before a commit.

- [ ] **Task 30: Hirobius Case Study Refactor & Auto-Journaling**
  - Refactor the Hirobius case study page to use `CaseStudyLayout.tsx`, ensuring its slots are properly assigned for narrative flow.
  - Implement the "Automated Case Study" engine: Task the AI to append a timestamped dev note to `docs/CASE_STUDY_JOURNAL.md` outlining every major layout refactor or self-heal it performs.

- [x] **Task 31: The "Visual Parity" Pre-Commit Hook (Evolution 4)**
  - Integrate the `visual-ingest` check into a Husky pre-commit hook.
  - Fail the commit if the core foundation pages (Typography, Color) show more than a 5% visual drift from the live "Gold Standard" site.

- [ ] **Task 32: Veo/Lyria Integration Prep**
  - Establish `Sketch` support for high-fidelity generative video background textures and 30-second audio motion-study accompaniments.


## Phase 11: Resilience & Scale
- [x] **Task 33: Accessibility Hard-Stop**
  - [cite_start]Integrate `axe-playwright` into the `Autonomous Verification Loop`[cite: 24].
  - [cite_start]Fail the build if a component lacks an aria-label or fails the 4.5:1 contrast ratio[cite: 4].
- [x] **Task 34: Pixel-Diff Automation (VRT)**
  - [cite_start]Update `visual-ingest.mjs` to use `pixelmatch` to generate a neon-pink diff map[cite: 7, 25].
  - [cite_start]Set a 0.1% tolerance threshold for visual regressions[cite: 8].
- [x] **Task 35: Performance Budgets**
  - [cite_start]Add a Lighthouse CI check to the release script[cite: 12, 26].
  - [cite_start]Enforce Cumulative Layout Shift (CLS) and Largest Contentful Paint (LCP) budgets[cite: 9, 11].
- [x] **Task 36: Error Boundary Injection**
  - [cite_start]Wrap all `DocLayout` and `CaseStudyLayout` slots in functional React Error Boundaries[cite: 17, 27].

## Phase 12: Structural Integrity & Hygiene (Anti-Slop Pass)
- [x] **Task 36.5: Pre-Scale Hardening & Autonomous Guardrail Tune-Up**
  - CSS Slop Purge: Fixed undefined `--hds-space-px3` in `.hds-token-chip`; remapped dark hover to `--semantic-accent-hover`; deleted `--hds-surface-*` duplicate vars from `:root` and `[data-theme="dark"]` and redirected `utilities.css` consumers to semantic vars; mapped all e-commerce/badge hex codes to W3C DTCG semantic tokens; removed deprecated `displayXl` and `display2` clamp overrides.
  - Polymorphism Patch: Implemented `React.forwardRef` with correct HTML element types in `Tag` (`HTMLButtonElement`), `Card` (`HTMLDivElement`), `Alert` (`HTMLDivElement` via `motion.div`), `Disclosure` (`HTMLDivElement`, both nav and panel/card render paths), and `Badge` (`HTMLSpanElement`).
  - Smoke Routing Expansion: Added `/hds/components` and `/lab/incubator` to `DEFAULT_SMOKE_PATHS` in `scripts/self-heal.mjs`; existing `pageError` + white-screen detection + `process.exit(1)` gate covers new routes.
  - Validation Engine Hardening: Added `/hds/components` and `/lab/incubator` to `FOUNDATION_ROUTES` in `tests/layout-integrity.spec.ts`; confirmed `auditPageLayout` enforces Gap Mandate and Containment Rule via `getBoundingClientRect()` bounding box checks; patched `visual-ingest.mjs` to call explicit `process.exit(1)` rather than deferred `process.exitCode` so CI pipelines see immediate exit on threshold breach.

- [ ] **Task 37: Strict Type & Polymorphism Hardening**
  - [cite_start]Audit all components to eradicate `any` and enforce strict Union types[cite: 41].
  - [cite_start]Verify every primitive implements `React.forwardRef` and the Radix `asChild` (or `as`) pattern for semantic polymorphism[cite: 34, 71, 72].
  - [cite_start]Strip raw `className` and `style` props from public interfaces (Sealed API)[cite: 62].
- [ ] **Task 38: The "Flush" Code Review**
  - [cite_start]Remove manual `div` wrappers and inline CSS `calc()` hacks[cite: 46, 47].
- [ ] **Task 39: AI-Optimized Context (The Manifest)**
  - [cite_start]Enforce JSDoc `@ai-rules` and `@example` tags on all components[cite: 48].
  - [cite_start]Generate a mathematically perfect `llms.txt` or `hds-manifest.json` map of the system for future AI consumption[cite: 77, 78].

## Phase 13: Repository Hardening (The Great Prune)
- [x] **Task 40: Artifact & Script De-Clutter**
  - [cite_start]Delete unused scripts, legacy "V1" components, and clear `/public/assets/_incoming`[cite: 191, 192, 193].
- [x] **Task 41: Dependency & Workspace Audit**
  - [cite_start]Run a dependency audit and consolidate build commands in `package.json`[cite: 194, 195].
  - [cite_start]Integrate bundle-size tracking (e.g., `size-limit`) to prevent bloat[cite: 83].
- [x] **Task 42: The "Golden Standard" Scrub**
  - [cite_start]Purge failed experiments from `IncubatorPage.tsx`[cite: 196, 197].
  - [cite_start]Ensure every remaining file follows the Strict Hygiene Protocol[cite: 199].
- [x] **Task 43: Handoff-Ready Documentation**
  - [cite_start]Update `README.md` to document the 12-column Grid Engine and the Agentic Workflow setup[cite: 200, 201, 202].


## 🚀 HDS Orchestration Status (April 2026)

### ✅ Recently Completed
* **Bi-Directional Token Sync:** Built a Node.js bridge (`scripts/hds-bridge.mjs`) and Figma plugin (`figma-agent-plugin`) to sync Primitive color tokens between the Figma canvas and `public/hds-manifest.json`.
* **AI Documentation Engine:** Local 14B model (`hds-coder`) successfully wired to the Node bridge to automatically write `docs/HDS_COLORS_AUTO.md` based on live manifest data.
* **Figma Foundation Renderer:** Plugin now programmatically draws "Tier 1: Primitives" and "Tier 2: Semantics" directly onto a `🎨 HDS: Foundations` page in Figma, including dynamic layout wrapping and alias mapping.
* **Component Scaffolding:** Plugin reads `componentSpecs` from the manifest and generates dashed placeholder frames on a `🧩 HDS: Components` page, grouped by category.

### 🚧 Active Sprint: Component Parity & Automation

**Task 1: The AI Orchestrator (Node + Local LLM)**
* **Goal:** Build `scripts/ai-orchestrator.mjs`.
* **Context:** We need a deterministic traffic cop. Instead of the LLM writing directly to files and breaking syntax, the LLM should output strict JSON instructions (e.g., `{"action": "update_token", "path": "semantic.color.new", "value": "#fff"}`). The Node orchestrator will parse this JSON and execute the safe file-system overwrite. 
* **Directive:** Scaffold the Express endpoint for the orchestrator to receive natural language commands, ping Ollama for a JSON intent, and route the action.

**Task 2: Figma Component Parity (Manual/Hybrid)**
* **Goal:** Convert the dashed scaffolds on the `🧩 HDS: Components` page into actual Figma Components with variants.
* **Context:** We need to map semantic tokens (e.g., `var(--semantic-color-surface-accent)`) to the Figma component properties so they stay in sync with the foundation page.
* **Directive for Claude:** Review the React components in `src/app/components/` (e.g., `HdsButton.tsx`). Ensure the code strictly uses the semantic CSS variables defined in the manifest. Prepare the Playwright test suite for visual grabs.

**Task 3: Playwright Visual Bridge**
* **Goal:** Send React component screenshots to Figma.
* **Context:** We want true parity validation. 
* **Directive for Claude:** Write a script (`scripts/visual-grab.mjs`) using Playwright. It should spin up the local Vite/Next dev server, isolate specific components (like `HdsButton`), take a high-res screenshot, and save it to a `.hds/snapshots/` directory so the Figma plugin can fetch and render it next to the Figma component for a side-by-side audit.

**Task 4: Page Layout Templates**
* **Goal:** Generate full-page layout templates in Figma.
* **Context:** We need to translate `Container` and `Grid` logic into Figma Page templates utilizing the `semantic.layout.width.max` (1200px) token.

### 🧠 Specification: The Local AI Orchestrator (`scripts/ai-orchestrator.mjs`)

**Purpose:** A Node.js CLI tool that acts as a secure, deterministic bridge between natural language commands and the filesystem. It prevents local LLMs from breaking syntax by forcing them to output strict JSON schemas, which the script then executes via JavaScript object mutation.

**Architecture & Flow:**
1. **Invocation:** Run via CLI: `node scripts/ai-orchestrator.mjs "Rename primary blue to brand-blue"`
2. **Context Gathering:** The script reads `public/hds-manifest.json` into memory.
3. **The Prompt:** The script sends a prompt to the local Ollama API (`http://localhost:11434/api/generate`, model: `hds-coder`). 
   * *System Prompt:* "You are a JSON-only router. Given the user's command and the current manifest, output a strict JSON array of 'actions'. Do not output markdown or explanations."
   * *Schema Definition:* `{ "action": "UPDATE_TOKEN", "path": "primitive.color.blue.500", "key": "name", "value": "brand-blue" }`
4. **Execution Engine:** The script parses the returned JSON. It uses lodash/vanilla JS to safely navigate the parsed manifest object based on the `path` and applies the change.
5. **Persistence:** `fs.writeFileSync()` saves the cleanly formatted, syntax-error-free JSON back to the disk.

**Why this is foolproof:**
The LLM never touches actual file writing. If the LLM hallucinates a bad JSON structure or a missing path, the Node script's `try/catch` block simply rejects it and logs an error, protecting the codebase.

**Task 5: Streaming Headless UI Renderer**
* **Goal:** Render local LLM output incrementally in Figma as flat JSONL commands arrive.
* **Context:** DOM scraping is retired. The LLM emits append-only `ADD_NODE` commands; the bridge forwards validated lines over SSE; the plugin maps frames, text, and HDS component instances onto the canvas.
* **The Pipeline Steps for Claude:**
  1. **Schema:** Use `docs/LLM_STREAM_SCHEMA.md` as the command contract.
  2. **Bridge:** Run `node scripts/llm-stream-bridge.mjs` and stream JSONL into `POST /generate`.
  3. **Listener:** The plugin UI connects to `GET /stream` with `EventSource`.
  4. **Renderer:** `figma-agent-plugin/code.js` renders each `ADD_NODE` immediately and validates `INSTANCE` commands against `public/hds-manifest.json`.

## ✅ Phase A1–A5: Master Fan-Out — COMPLETE (2026-04-29)

**Goal:** Make Figma master components expose the same prop surface as React 1:1 — variant axes (Variant × Size × State) plus Figma component properties (TEXT/BOOLEAN/INSTANCE_SWAP) — so the Figma library mirrors the runtime library.

**What landed (commit `64fc02e`):**

### A1 — Manifest schema additions
- `componentSpecs[X].variantAxes: string[]` — ordered prop names emitted as Figma variant axes.
- `componentSpecs[X].componentProperties: Array<{name, type, defaultValue, sourceProp, boundTo, targetSelector, invert?}>`.
- Schema definitions in `manifest/schema.json#definitions.componentProperty`.
- Seeded values for all 13 generative-subset components in `scripts/build-tokens.mjs`.
- `scripts/generate-manifest.mjs` defaults the new fields to `[]` on every spec.

### A2 — Cartesian variant generation
- `pipeline/figma-masters-batch.mjs` rewritten with `resolveAxisValues`, `axisFigmaName`, `cartesianProduct`, `variantTuples` helpers.
- Output state names are composite (`"Variant=primary, Size=md, State=hover"`) so `figma.combineAsVariants()` parses multiple property axes.
- 80 total variants across 13 components (HdsButton: 54).

### A3 — Plugin runtime (additive on top of de29b1e)
- `figma-agent-plugin/code.js`: composite variant names pass through; legacy single-axis names still get a `State=` prefix.
- `buildNode()` honors `data.visible` across TEXT, RECTANGLE/VECTOR, SVG, FRAME branches.
- After `combineAsVariants`, the batch handler walks `bItem.componentProperties`, calls `master.addComponentProperty(name, type, defaultValue)` per declaration, then walks every variant binding `componentPropertyReferences` on nodes whose `name` matches `def.targetSelector`.
- `boundTo` defaults: TEXT → characters, BOOLEAN → visible, INSTANCE_SWAP → mainComponent.
- Diagnostic logs on failure: `[HDS batch] addComponentProperty failed for "<name>"`, `[HDS batch] componentPropertyReferences failed for "<name>"->"<selector>"`.

### A4 — Tree builder named slots
- `txt()`, `rect()`, `baseFrame()` helpers accept `name` and `visible` options.
- HdsButton: explicit `Label` text, `IconLeft` + `IconRight` 16×16 placeholders (`visible: false` default).
- Alert: `Title` + `Body` text nodes.
- Badge, Tag: `Label` text nodes.
- HeadingStack: `Heading` + `Subtext`.
- TextLockup: `Eyebrow` + `Title` + `Description`.

### A5 — End-to-end verification
- Step 5 in plugin UI dispatches 80 states.
- Plugin draws the Sticker Sheet with 13 component sets.
- Registry indexes 88 entries (8 sets + 75 variants + 5 single COMPONENTs).
- HdsButton master shows 3 named axes plus 4 component properties in Figma's panel.
- `pnpm ui:gen "<prompt>"` resolves to real master instances; the registry-fallback in the plugin gracefully handles deleted masters.

**Known follow-ups (Phase A6, see `OPERATOR_BRIEF.md` §4):**
- Visual differentiation per variant×size combination (currently all 54 button variants render with default-state visuals).
- Input text-slot split — Label, Helper, and Error TEXT properties dangle until the input tree is split into separate text nodes.
- iconOnly invert mapping in the JSX compiler (Figma binding works; the React→Figma translation needs to negate when generating instances).

**Audit trail:** Phase commits on `claude/path-a-completion` (`2e2127a`, `d0424d4`, `5d86f73`, `97212c5`) consolidated into `64fc02e` on `fix/ui-pipeline` so the consolidated branch carries Codex's `streamLoadManifest` plumbing from `de29b1e`.


  
