# HDS Framework v2.1 — Lean Headless / Figma-Targeting Edition

**Targeting:** Figma hiring bar. Solo builder. Schema-grounded, not doc-heavy.
**Mental model:** Schemas are the system. Docs are a side-effect of correctness, not proof of it.

---

## Strategic Pivots from v2.0

| v2.0 Model | v2.1 Model |
|---|---|
| Phase 2 (Tokens) listed as "In Progress" | Tokens promoted to **Complete** — W3C DTCG compliant, bugs fixed, pipeline clean |
| Phase 1 (Contract) and Phase 6 (Spec Manifest) as separate phases | Merged into single **System Manifest** phase with two sub-steps |
| 8 sequential phases | 6 phases — resequenced by actual dependency order |
| Framework agnostic about current state | Each phase explicitly grades current state against the files |

---

## Phase 1: W3C DTCG Token Architecture ✅ COMPLETE

**Status: Done.** `hirobius.tokens.json` passes all W3C DTCG gates. This phase is no longer blocking.

### Evidence (verified against source files)

- Token file uses `$value`, `$type`, `$description` throughout
- `$type` inherited at group level (`primitive.color.$type: "color"`, `primitive.space.$type: "dimension"`) — no redundant per-token overrides
- Three-tier alias chain enforced: component → semantic → primitive, zero semantic→semantic chains
- Modes declared via `$extensions.com.figma.variables` with explicit `Light`/`Dark` on every semantic color token
- Semantic tier: zero raw hex values — all `{primitive.*}` references
- Component tier: references semantic tokens for color, primitive tokens for spacing/typography (correct per architecture)
- 256 tokens, 0 orphaned vars, pipeline clean

### Remaining hygiene (non-blocking)

- `primitive.color.blue.500` uses hex `#1E2EFD` while rest of blue scale uses oklch — consider normalizing to oklch for consistency (cosmetic, not a compliance issue)
- Manifest `aliasRule` says "except computed oklch() color values for derived tints" — this exception applies only to primitives and should be stated more precisely to prevent misuse in semantic tier

### What this unlocks

- Figma Variables import ready (one command)
- Token compile pipeline can generate `tokens.css`, `generated-tokens.ts`, `tokens.figma.json`
- Agent instructions can reference exact token paths instead of prose descriptions

---

## Phase 2: Reflective System Manifest (merged from v2.0 Phases 1 + 6)

**Status: Complete.** `system.manifest.json` now owns the system inventory, system specs, component metadata, and the criteria-driven phase model used by the docs shell.

The current `hds-manifest.json` is a **token manifest** — it enumerates every token with path, cssVar, type, alias, resolvedValue, and dark overrides. This is valuable infrastructure. But it does not declare what the system *ships* (components, patterns) or how those components are shaped (props, states, Figma property mappings).

### Sub-step A: System-level declarations

The machine-readable source of truth now lives in `system.manifest.json` at the repo root:

```json
{
  "name": "Hirobius Design System",
  "version": "0.1.0",
  "systemSpecs": {
    "engine": "React + TypeScript",
    "icons": "Phosphor (Bold)",
    "tokens": "W3C DTCG",
    "styling": "CSS Variables"
  },
  "componentInventory": ["HdsButton", "IconButton", "Input", "Nav", "DocLinkCard", "InlineLink", "Stack", "Divider", "Tag", "Card"],
  "componentSpecs": {
    "HdsButton": { "category": "Actions", "figmaUrl": "https://www.figma.com/file/hirobius-hds-library?node-id=button-root" }
  },
  "phases": [
    {
      "id": "1",
      "label": "Tokens",
      "description": "W3C DTCG token architecture is complete.",
      "criteria": [
        { "label": "W3C DTCG format", "done": true }
      ]
    },
    {
      "id": "6",
      "label": "AI Context (llms.txt)",
      "description": "Agent guidance is schema-bounded and machine-readable.",
      "criteria": [
        { "label": "Repo agent docs", "done": true }
      ]
    }
  ]
}
```

**Complete when:**

- `componentInventory` array lists every shipped component by name
- `componentSpecs` records component categories and manifest-backed Figma links
- `phases` tracks each numbered phase as a structured record with criteria-derived progress
- `systemSpecs` captures the public system stack in machine-readable form
- `version` field in package.json is intentionally tagged (pre-release `0.x` or `1.0.0+`)

### Sub-step B: Component spec declarations

Add a `componentSpecs` block to the manifest (or a separate `component-spec.json`), structured per component:

```json
{
  "Button": {
    "props": {
      "variant": { "type": "enum", "values": ["primary", "secondary", "tertiary"] },
      "size": { "type": "enum", "values": ["sm", "md", "lg"] },
      "disabled": { "type": "boolean", "default": false },
      "loading": { "type": "boolean", "default": false },
      "label": { "type": "string" },
      "icon": { "type": "ReactNode", "optional": true }
    },
    "tokens": {
      "background": "component.button.bg",
      "backgroundHover": "component.button.bgHover",
      "text": "component.button.text",
      "radius": "component.button.radius",
      "paddingX": "component.button.paddingX",
      "paddingY": "component.button.paddingY",
      "fontSize": "component.button.fontSize",
      "fontWeight": "component.button.fontWeight"
    },
    "figmaPropertyMapping": {
      "variant": "Variant",
      "size": "Size",
      "disabled": "Disabled",
      "loading": "Loading",
      "label": "Label",
      "icon": "Icon"
    },
    "states": ["default", "hover", "focus", "active", "disabled", "loading"]
  }
}
```

**Complete when:**

- Every component in `componentInventory` has a matching spec entry
- Props use explicit union types (not generic `string`) for anything that maps to a Figma Variant
- `tokens` block lists every token the component consumes (verifiable against `component.*` tokens in the token file)
- `figmaPropertyMapping` declares the Figma ↔ React prop name mapping
- `states` array lists all interaction states

**This manifest should be generated from TypeScript interfaces, not hand-authored.** A `pnpm manifest:generate` script that walks component source files and emits the spec prevents drift. Hand-authoring is acceptable for v1 bootstrap but must be replaced by generation before Phase 5 (Pipeline).

### Common false positives

- A detailed CLAUDE.md that describes conventions but never declares what ships
- Well-organized folders as implicit inventory — organization is not declaration
- JSDoc on components — useful, but not a structured schema
- DESIGN.md with lean visual rules and DESIGN-HANDOFF.md with token tables — human-readable spec, not machine-readable manifest

### Why this matters for Figma

- Figma's own infrastructure is schema-driven (library manifests, component inventories)
- A machine-readable manifest is a direct input to Code Connect and Figma library auto-generation
- Showing you think in structured data about your system's scope is a hiring signal

---

## Phase 3: Component Logic + React↔Figma Property Parity

**Status: Not started.** This is the active build priority. The token foundation is solid — build components against it.

### Gate: every component's TypeScript interface maps 1:1 to Figma Component Properties

| Figma Property Type | TypeScript Equivalent | Example |
|---|---|---|
| Variant | string union type | `variant: 'primary' \| 'secondary' \| 'tertiary'` |
| Boolean | boolean prop | `disabled?: boolean`, `loading?: boolean` |
| Text | string prop | `label: string`, `placeholder?: string` |
| Instance Swap | React.ReactNode or component type | `icon?: React.ReactNode` |

### Complete for v1

- Prop names are identical to Figma property names — no mapping layer needed
- No prop uses a generic `string` type where a specific union would do
- All meaningful interaction states implemented and functional (not just visual):
  - `disabled` truly prevents interaction (`pointer-events: none` + `aria-disabled`)
  - `loading` disables interaction + shows indicator
  - `error` applies correct token AND correct ARIA attribute (`aria-invalid`)
  - Focus state uses token-backed ring, not overridden by global reset
- All token-backed: zero hardcoded hex, px, or font values in component files
- `pnpm tokens:audit` exits clean for every component

### Required evidence

- Every component: TypeScript interface with explicit union types for all variant dimensions
- Grep for `string` prop types where unions should exist — zero unjustified hits
- A `figma.connect()` annotation (Code Connect) or a comment block on each component listing its Figma property mapping
- Keyboard audit: Tab → focus ring visible, Enter/Space → activates, Escape → dismisses (modal/dropdown)
- ARIA: inputs have associated labels, disabled elements have `aria-disabled`, error states have `aria-invalid`
- `pnpm tokens:audit` clean pass — zero violations

### Sequencing note

As each component is built, its spec should be added to the component manifest (Phase 2 Sub-step B). The manifest evolves alongside components, not before or after.

### Why this matters for Figma

- This is the exact technical capability Figma's DS team works on (Code Connect, component property mapping)
- A React component that is already Figma-property-shaped requires zero translation — it *is* the spec

---

## Phase 4: Composition Schemas (Patterns)

**Status: Not started.**

Patterns are not doc pages. They are documented compositions with token and constraint declarations.

### Complete for v1

- Patterns are defined in code as compositions of existing system components — no new atoms
- Each pattern has a schema declaration (TypeScript type or JSON schema block) that lists:
  - `components[]` — which system components it uses
  - `tokens[]` — which layout/spacing tokens constrain it
  - `constraints` — any hard rules (e.g., "max 3 items", "always full-width on mobile")
- Pattern names are system-agnostic, not feature-named
- At minimum: one form composition, one navigation composition, one feedback/empty-state composition
- Patterns are registered in the system manifest's `patternInventory` array

### Required evidence

- At least 3 named, extractable pattern compositions in the codebase
- Each pattern: TypeScript props interface declares which components it accepts
- `patternInventory` in the system manifest
- Pattern names pass context-agnostic test (rename-safe across features)

---

## Phase 5: Automated Code↔Design Sync Pipeline

**Status: Partially exists.** Token compile pipeline works. CI enforcement, Code Connect, and manifest generation are missing.

### Complete for v1

**Token pipeline (automated, one command):**

- `hirobius.tokens.json` (W3C DTCG) → `tokens.css` (CSS vars) + `generated-tokens.ts` (TS constants) + optionally `tokens.figma.json` (Figma Variables import)
- Pipeline runs in CI on every PR — `pnpm tokens:verify` is a required check
- Generated files are never hand-edited (enforced by build-tool header comment + CI check)

**Manifest pipeline:**

- `pnpm manifest:generate` walks component TypeScript interfaces and emits `component-spec.json`
- Manifest generation runs in CI — spec cannot drift from source code

**Code Connect:**

- Code Connect annotations present on all shipped components (or a tracking file showing which are pending)
- At least 3 components have `figma.connect()` annotations or equivalent

**Sync enforcement:**

- DESIGN.md and DESIGN-HANDOFF.md updated in the same commit as any token change — enforced by pre-commit hook or CI diff check
- `pnpm tokens:audit` runs against all component files and returns zero violations
- Token drift check is a required PR gate

### Required evidence

- `build-tokens.mjs` committed and executable with W3C parser
- `package.json` scripts: `tokens`, `tokens:verify`, `tokens:audit`, `tokens:figma`, `manifest:generate`
- CI config: `pnpm tokens:verify` and `pnpm tokens:audit` are required PR checks
- Generated files have build-tool header: `/* DO NOT EDIT — generated by build-tokens.mjs */`
- Pre-commit hook or CI step that detects DESIGN.md / DESIGN-HANDOFF.md drift

---

## Phase 6: AI Context (llms.txt)

**Status: Complete.** `public/llms.txt` and `CLAUDE.md` now point agents at the machine-readable system map before code changes.

### Complete for v1

**Agent skills are schema-bounded:**

- Every skill has access to `public/llms.txt`, `system.manifest.json`, `src/app/data/component-api.json`, and `hirobius.tokens.json` before generating output
- Skills declare their operation constraints: which tokens they may use, which component props they may set, which layouts they may compose
- Output is validated against `pnpm tokens:audit` as a post-generation step — not trusted on visual inspection alone

**Agent instructions are deterministic, not heuristic:**

- `"Use var(--component-button-bg) for button backgrounds"` not `"use the brand blue for interactive elements"`
- Props specified by exact TypeScript type: `"use variant: 'primary'"` not `"use the primary style"`

**Proof of pipeline:**

- At least one agent workflow exercises the full pipeline: agent reads `public/llms.txt` → generates a component or layout → `pnpm tokens:audit` runs on the output → zero violations, no manual correction
- Agent no-touch zones explicitly declared in `CLAUDE.md`: `hirobius.tokens.json`, generated files, `figma/` components

### Current implementation

- `CLAUDE.md` references `public/llms.txt`, `system.manifest.json`, `src/app/data/component-api.json`, and `hirobius.tokens.json` by path, not by description
- Agent token consumption rules use exact token paths: `var(--component-button-bg)` — not color descriptions
- `scripts/generate-llms-txt.mjs` writes the machine-readable AI map from the manifest + component API
- `pnpm tokens` and `pnpm build` regenerate `public/llms.txt`### Why this matters for Figma

- Figma is building AI features that operate on design system schemas — this is their roadmap
- A system where agents operate within schema constraints (not free-form prompts) is the architecture Figma is moving toward

---

## Cross-Phase Release Standards

All of these must be true simultaneously for a credible Lean v1:

1. **Token file is W3C DTCG compliant.** ✅ Every token has `$type`. Every semantic token references a primitive path. `pnpm tokens:verify` checks this.
2. **Every component interface maps 1:1 to Figma Component Properties.** Variant → union type. Boolean → boolean prop. Text → string prop. Instance Swap → ReactNode prop. No generic `string` where a union should be.
3. **A machine-readable component manifest exists.** Tools and agents can enumerate the system's surface area without crawling source files.
4. **The pipeline runs in CI without manual steps.** Token compile → CSS → TS constants → Figma export. One command. CI-enforced.
5. **Agent output passes `pnpm tokens:audit` without manual correction.** If it doesn't, the system is not agent-ready — it's agent-assisted.
6. **No hardcoded values anywhere in the component layer.** Zero hex, zero raw px for spacing or font sizes, zero raw font stacks. Grep-verifiable.
7. **Multi-mode (Light/Dark) is resolved at compile time, not runtime.** No JS re-renders for theme switching. `[data-theme="dark"]` CSS attribute selector only.
8. **The system has a `componentInventory`.** Even a 10-item JSON array. Without it, there is no defined scope.

---

## Likely Blockers

1. **No machine-readable component manifest.** The component spec lives only in JSDoc and prose DESIGN.md / DESIGN-HANDOFF.md. Agents infer; they should read. ← **Highest priority blocker.**
2. **Props may be typed as `string` where unions are required.** `variant: string` has no Figma property parity. It's not a schema — it's a loose hint.
3. **No Code Connect annotations.** The React↔Figma parity may be designed into the props but never declared to Figma's tooling.
4. **Token pipeline not in CI.** A pipeline that runs locally only will drift. Every time.
5. **Agent skills operate on prose descriptions.** `"Use the brand blue"` vs `"use var(--primitive-color-blue-500)"` — the second is a deterministic instruction. The first is a hint that produces hallucinated hex.
6. **`pnpm tokens:audit` has never been run on agent-generated code.** The audit exists for hand-written code. Agent output lives in an unverified gap.

---

## Audit Method: Evidence Rounds

### Round 1 — Schema Foundation ✅ (can run now)

- `hirobius.tokens.json` — full file (W3C `$type` check, primitive/semantic separation, mode declarations)
- `package.json` — scripts section + version field
- `build-tokens.mjs` — first 50 lines (parser type, W3C awareness)
- `src/styles/tokens.css` — first 100 lines (generation header, mode selector structure)

### Round 2 — Component Property Parity (run after Phase 3 work begins)

- Full file listing of `src/app/components/`
- 3 component TypeScript interfaces in full
- Any Code Connect annotation files (`*.figma.ts` or equivalent)
- `tsconfig.json` — `compilerOptions` only

### Round 3 — Machine-Readable Manifest (run after Phase 2 Sub-step B)

- `system.manifest.json` or `component-spec.json`
- DESIGN.md — lean visual rules; DESIGN-HANDOFF.md — token tables and "Last updated" date only
- CLAUDE.md — agent instructions section only

### Round 4 — Pipeline + Agent Verification (run after Phase 5)

- CI config (`.github/workflows/` or `vercel.json`) — full file
- Output of `pnpm tokens:audit` run against the full component set
- Any agent-generated component file (raw, before manual correction)
- `.ai/` folder file listing + any rules files

---

## Recommended Build Order

```
Phase 1 (Tokens)          ✅ Done
  ↓
Phase 2A (System Manifest) → add componentInventory, agentEntrypoint
  ↓
Phase 3 (Components)      → build components, add specs to manifest as you go (2B)
  ↓
Phase 4 (Patterns)        → compose components into named patterns
  ↓
Phase 5 (Pipeline)        → CI enforcement, Code Connect, manifest generation
  ↓
Phase 6 (Agent Consumer)  → schema-bounded agent instructions, audit gate
```

---

Framework version: 2.1 — Revised from v2.0 based on file audit
Updated: 2026-03-31 — Phase 2 marked reflective and complete, component metadata now manifest-backed, progress bars are criteria-derived

