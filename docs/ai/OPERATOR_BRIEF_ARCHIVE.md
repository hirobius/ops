# OPERATOR_BRIEF — Archived Historical Sections

> Archived 2026-05-02. These sections were removed from OPERATOR_BRIEF.md to reduce token cost.
> Source of truth for current state: docs/ai/orchestration.json + docs/ai/ready-queue.json

## 3. Current state (as of last reconciliation)

### Completed phases

Phase 0  ✅ Foundation        — repo structure, test harness, telemetry, feature flags
Phase 1  ✅ Manifest schema   — JSON schema, validation script, drift check, 13 enriched components
Phase 2  ✅ Validator suite   — parse-jsx, manifest, token, a11y, orchestrator (16/16 fixtures pass)
Phase 3  ✅ Retry loop        — retry-loop.mjs + format-correction.mjs (5/5 mock tests pass)
         ✅ Wired into live path — gatekeeperPath() in generate-to-figma.mjs, retryLoopEnabled=true
         ✅ p3-4 Hermes orchestration agent — `pnpm hds:run` reads orchestration.json,
            runs validationCmds, marks done on green; honors stopConditions (commit `53064f7`)
Phase A1 ✅ Manifest schema additions — variantAxes + componentProperties on every spec
Phase A2 ✅ Cartesian variant generation — pipeline/figma-masters-batch.mjs (80 variants × 13 components)
Phase A3 ✅ Plugin runtime    — addComponentProperty + componentPropertyReferences after combineAsVariants
Phase A4 ✅ Tree builder slots — IconLeft/IconRight/Label/Title/Body etc. nodes named for binding
Phase A5 ✅ End-to-end verified — Step 5 dispatches 80 states, plugin draws 13 component sets, registry indexes 88 entries, pnpm ui:gen resolves to real master instances
Phase A6 ✅ Visual differentiation — buttonStateTree branches on tuple.variant + tuple.size; Input
            split into vertical Label/Placeholder/Helper/Error slots (commit `ef7c105`)
Phase 4  ✅ Compiler upgrades:
         ✅ p4-1 Compiler regression fixtures — 32 input.jsx → expected.json pairs (now 50 with
            p4-2/3/4/5 additions) under fixtures/compiler/. Wrapper at validators/compiler.mjs.
         ✅ p4-2 Expression containers — `{value}` resolved via resolveExpression() (literal types,
            `tokens.X.Y` → token paths, unknown → `{__expr: source}` passthrough). 6 fixtures.
         ✅ p4-3 Variant prop → Figma mapping — additive `figmaProperties` field on INSTANCE commands
            using manifest's componentProperties (with invert) + figmaPropertyMapping. Schema-safe;
            `attributes` (React names) unchanged. 4 fixtures + 12 existing fixtures updated additively.
         ✅ p4-4 A11y metadata attachment — extractA11yMetadata() reads aria-label/role/description
            attrs and emits an `a11y` field on each command. Manifest-description fallback intentionally
            deferred until p6-1 selection serializer consumes it. 4 fixtures.
         ✅ p4-5 Fragments + conditionals — `<>` / `</>` flatten into parent (transparent __fragment__);
            `{cond && <Tag/>}` rewritten to `<Tag data-hds-conditional="true"/>` with cmd.conditional
            flag for fix-mode diffing; ternary / complex expressions discarded. 4 fixtures.
Phase 7  ⚠️  Partial (productionization):
         ✅ p7-1 Manifest CI drift — validate-manifest + check-manifest-drift wired into check:fast,
            check:full, and the new `pretest` hook
         ✅ p7-2 Telemetry report — `pnpm telemetry:report` prints all-time stats and threshold-checks
            production retry-exhaustion in a 24h window (matches orchestrator's filter)

### What works end-to-end

- `pnpm ui:gen "<prompt>"` calls Hermes3 (non-streaming), validates JSX
  via runWithRetry + all validators, compiles and POSTs to bridge, plugin draws
- Up to 3 correction retries on bad JSX before aborting; all attempts logged
  to telemetry/events.jsonl (retry.start / retry.validate / retry.success)
- Validators run cleanly against any JSX string via `validators/index.mjs`
- Manifest validation runs in CI via `pnpm validate:manifest` and
  `pnpm check:manifest-drift`
- Fix mode (`pnpm ui:fix`) still uses the legacy streaming path (correct —
  its output is UPDATE_NODE/ADD_NODE commands, not JSX)
- **Step 5: Build Master Components** (plugin UI) builds 13 real Figma master
  component sets from `public/hds-manifest.json` componentSpecs. HdsButton has
  3 variant axes (Variant × Size × State = 54 variants) plus 4 component
  properties (Label TEXT, Leading icon BOOLEAN, Trailing icon BOOLEAN, Show
  label BOOLEAN). Generated UI now resolves to those masters instead of
  placeholder rectangles.
- **Hermes token-edit agent** (`pnpm hds:bot "<command>"`) is in production
  for tokens. It uses model `hds-coder` via Ollama, parses RENAME_TOKEN /
  UPDATE_VALUE intents, and mutates `public/hds-manifest.json` deterministically.
  This is NOT the orchestration dispatcher — that's `p3-4` and is unbuilt.

### What does NOT work yet

- **Phase 5 — auth + envelope.** No HMAC, no shared secret, no envelope
  protocol. Required only if the bridge ever leaves localhost. Fully scoped
  in orchestration.json p5-1 through p5-4.
- **Phase 6 — read path.** Selection serializer is partial; lint, contrast,
  reverse token sync, fix-mode diff are all pending or partial. With p4-4
  done, p6-1 selection serializer is unblocked on the a11y dependency (still
  needs p5-2 correlation, or accept shipping without correlated request IDs).
- **`/sync` endpoint.** "Step 3: AI Documentation" button hits a 404 — route
  was never implemented. Tracked as `cleanup-dead-sync-endpoint`.

## 4. The active open threads

### Phase 8-pre — LLM output quality ✅ DONE (2026-04-30)

**Why it mattered:** Adrian's stated reason for hardening was improving
local hermes3 generation quality, not (primarily) downstream kit-readiness.
The LLM produced aesthetic slop (bold headings, generic card grids,
oversized padding, multi-hue text emphasis, gradient surfaces) even when
structural output was correct. The leverage point: the existing retry-loop
+ a Swiss-canon validator that loops violations back through it.

**Four units, all done:**

- ✅ **`8p-1-swiss-canon-validator`** (`75347aa`) — validators/swiss-canon.mjs
  flags 10 antipatterns: SWISS_BOLD, SWISS_OFF_GRID, SWISS_BG_WHITE_BLACK,
  SWISS_GRADIENT, SWISS_OVERSIZED_RADIUS, SWISS_LOREM, SWISS_ELLIPSIS,
  SWISS_PURPLE_INDIGO, SWISS_MULTI_HUE_TEXT, SWISS_STRAIGHT_QUOTES. Wired
  into validators/index.mjs alongside manifest/token/a11y validators so
  violations feed into the Phase 3 retry loop. Token-path-aware:
  semantic.color.accent.violet does NOT trip SWISS_PURPLE_INDIGO; tailwind
  text-violet-500 does. 14 fixtures (8 violation cases + 3 false-positive
  stress cases). 80/80 validator tests pass; retry-loop confirmed
  self-corrects swiss-canon violations on Round 2.
- ✅ **`8p-2-manifest-description-enrichment`** (`9d9cfb3`) — 15 LLM-facing
  componentSpecs descriptions replaced with Swiss-intent prose, each
  embedding at least one canon constraint (weight, opacity hierarchy,
  on-grid spacing, or radius rule). HdsField/HdsRail in the unit draft
  were proposed primitives that don't yet exist — substituted HdsLabel
  (form-label primitive) and Container (width-constrained layout).
- ✅ **`8p-3-style-canon-system-prompt`** (`6f42f22`) — 13-line STYLE CANON
  block in scripts/generate-to-figma.mjs:buildSystemPrompt() between
  BINDING RULES and COMPLETE EXAMPLE. Smoke: `pnpm ui:gen "a primary
  button labeled Save"` clean on attempt 1. `pnpm ui:gen "a login form"`
  exhausts on PRE-EXISTING manifest gaps (HdsFrame/Text specs have
  empty props, Input/HdsButton trip a11y when LLM omits label/aria) —
  not a regression.
- ✅ **`8p-4-component-completeness-and-source-canon`** (`5df5a67`) — three
  pieces: (a) `pnpm scaffold:component <Name>` reading
  templates/component-template.tsx, supports --dry-run; (b)
  `scripts/check-component-completeness.mjs` walking
  src/app/components/Hds*.tsx; (c) `scripts/check-source-canon.mjs`
  walking src/**/*.tsx via shared `validators/canon-rules.mjs`. Both new
  gates wired into pretest as `--soft` (warn-only). Today: 39 completeness
  warnings + 61 source-canon warnings (mostly fontWeight: 700 in test/demo
  pages). Promote to hard fail in a follow-up after fixing easy wins.

**Pre-commit gate (all green at landing):**
```
node scripts/run-validator-tests.mjs   # 80/80
node scripts/test-retry-loop.mjs       # 5/5
node scripts/validate-manifest.mjs     # 94 components valid
node scripts/check-manifest-drift.mjs  # no drift
```

**Follow-ups landed (2026-04-30, three units):**

- ✅ **`8p-5-primitive-prop-declarations`** (`154e053`) — declared props +
  propConstraints for HdsFrame, Text, HdsHeading, HdsLabel, HdsCaption;
  extended Card with frame attributes. Full attribute set the JSX
  compiler accepts (scripts/hds-jsx-compiler.mjs:240) including alias
  spellings (fill/background, stroke/border, layout/layoutMode,
  gap/itemSpacing). Smoke: `pnpm ui:gen "a login form"` and `"a marketing
  hero"` now succeed on attempt 2 (were exhausting at 3). Settings table
  still trips but on `UNKNOWN_COMPONENT` for hallucinated `TableHeader`/
  `HdsTh` — separate problem, out of 8p-5 scope.
- ✅ **`8p-6-source-canon-cleanup-and-promote`** (`5e97c53`) —
  check-source-canon.mjs now honors the project's existing per-file
  exemption conventions: `/* hds-bypass: ... */` (skip every rule) and
  `// font-ok: ...` (skip just FONT_BOLD), already used by 5 files
  (TextLockup, ArchitectureSnapshotPage, TypographyTestPage,
  SpacingTestPage, BurnDownPage). Fixed `Loading preview...` →
  `Loading preview…` and tagged portfolioData.tsx (Ag-letterform brand
  mark). Promoted to hard-fail in pretest.
- ✅ **`8p-7-completeness-cleanup-and-promote`** (`3d23be9`) —
  check-component-completeness.mjs now honors `@doc-exempt` JSDoc tags
  (the existing convention the component-api generator already uses).
  Marked Controls (barrel re-export), ErrorBoundary (runtime
  safety), NotFoundPattern (zero-prop wrapper) as `@doc-exempt`.
  Extended 8 short manifest descriptions to >= 80 chars with Swiss-canon
  constraints. Promoted to hard-fail in pretest.

**Pretest pipeline now blocks on (all hard-fail):**
```
node scripts/validate-manifest.mjs
node scripts/check-manifest-drift.mjs
node scripts/check-component-completeness.mjs
node scripts/check-source-canon.mjs
```

**Final follow-up landed (2026-04-30):**

- ✅ **`8p-8-table-composition`** (`c9de075`) — third COMPLETE EXAMPLE
  block in `scripts/generate-to-figma.mjs:buildSystemPrompt()` showing a
  3-row settings table composed of flat HdsFrame rows + Text cells
  with `semantic.color.border.default` dividers and on-grid 16/24
  spacing. Resolves 8p-5's surfaced structural failure (LLM
  hallucinating `<TableHeader>` / `<HdsTh>` / `<TableRow>` /
  `<HdsTd>` on table prompts → UNKNOWN_COMPONENT exhaustion). No fake
  primitives added to the manifest — flat-frame composition is the canon
  path for generated tabular UI; real `Table` (columns/rows data
  props) remains for hand-authored docs and matrices. Smoke deferred
  (bridge offline at landing); validationCmd grep matched, all four
  pre-commit gates green.

**Phase 8-pre cluster fully closed.** All eight units (8p-1..8p-8)
done. Empirical data lap done.

### shadcn-pivot cluster — 28 units drafted, ready to execute

Adrian's strategic pivot (2026-04-30): the broader Phase 8 hardening
in `reference_phase8_hardening_skills.md` memory is superseded by a
concrete shadcn-baseline + primitives-up rebuild. Five clusters,
sequential, drafted into `orchestration.json` as a single architectural
prep commit. Eligible heads: `8v-1`, `8x-1`, `8e-1`.

**Strategic context for the pivot** (so any agent picking up has the
full reasoning):

- **shadcn over hand-rolled.** Adrian rejected a third-party component mirror
  framing in favor of shadcn-baseline distribution (MIT, copy-the-code,
  Radix-built, Tailwind-themed). Lineage: Radix UI primitives + shadcn
  distribution model + Material-style approachability + Swiss
  structural canon. Documented as `docs/ai/rules/COMPONENT_API_STANDARD.md`
  in 8s-1.
- **Tailwind reversal.** Repo previously exited Tailwind (`9abc1901`).
  Adrian confirmed the exit was a misunderstanding — Tailwind ≠
  competing with DTCG tokens, they're different layers. Re-introducing
  Tailwind v4 with the tokens-as-Tailwind-config bridge.
- **DTCG tokens stay the source.** `hirobius.tokens.json` remains
  authoritative. `scripts/build-tokens.mjs` is already a custom DTCG
  compiler emitting CSS vars + TS constants; 8e-3 extends it with a
  third Tailwind-config emitter. Style Dictionary explicitly skipped.
- **figma-cli (silships) explicitly skipped.** Evaluated, rejected —
  different abstraction (deterministic CLI for Figma stamping vs our
  LLM generation pipeline). Yolo Mode `app.asar` patching is fragile.
  Our pipeline keeps its own infrastructure.
- **North Star primitives:** HdsButton, Input, Card, Dialog.
  All are tier:primitive. Adrian ratified.
- **Tier classification** (added in 8-X cluster): primitive / pattern
  / template / utility / experiment. Asymmetric doc weight — primitives
  get heavy API pages, patterns get light usage pages, templates get
  galleries, utilities + experiments hide from public docs.
- **Elevation contract** (8-E cluster): role-based, not numeric.
  flat / raised / floating / overlay / sticky. Each role bundles
  surface + shadow + border. Multi-layer shadows. `--shadow-color`
  variable is theme-aware so dark mode tints automatically.

**Cluster ordering and gates:**

| Cluster | Phase | Units | Estimate | Why this order |
|---------|-------|-------|----------|----------------|
| **8-V** Manifest-driven master bindings | `8-V-binding` | 6 | 1.5 wk | Foundation: kills 40+ inline `_hdsTokenBinding` calls in `pipeline/figma-masters-batch.mjs` by moving them into manifest `slots[]`. Lands first because every later cluster benefits from manifest-driven binding. |
| **8-X** Tier classification + cleanup | `8-X-tier` | 5 | 1 wk | Adds `tier` field, audits 94 specs (37 are orphans), moves utilities + experiments out of `componentSpecs`. Must land before 8-S so we don't shadcn-refactor entries that turn out to be utilities. |
| **8-E** Elevation + role-alias tokens | `8-E-tokens` | 3 | 0.5 wk | Adds `elevation.*` + `shadow.*` semantic tokens, role-alias layer (background/foreground/primary/etc. → existing semantic paths), Tailwind config emitter. |
| **8-S** shadcn primitives baseline | `8-S-shadcn` | 8 | 1.5 wk | Reinstall Tailwind v4, install Radix + cva + clsx + tailwind-merge, build spike (8s-3 has STOP CONDITION on Adrian visual ratification), then refactor 4 flagships, then write manifest projection script. |
| **8-T** Patterns + templates pass | `8-T-patterns` | 6 | 1.5 wk | Light pattern docs format, template galleries, batch-refactor every pattern + template to compose flagship primitives only. Final orphan cleanup + public API lockdown. |

Total: 28 units, ~6 wk.

**Stop conditions specific to this cluster set:**

- **8s-3 spike** halts the autonomous loop when complete. Adrian must
  explicitly ratify the side-by-side visual output before 8s-4..8s-8
  execute.
- **8x-4 orphan resolution** surfaces a deletion list for Adrian's
  ratification before deleting manifest entries.
- **Standard stop conditions** apply (validationCmd fails twice, schema
  conflict with done units, push-to-remote requirement).

### 8-V cluster — manifest-driven master bindings ✅ DONE (2026-04-30)

**All six units landed.** The cluster eliminated 41 inline
`_hdsTokenBinding: compactBindings({...})` calls in
`pipeline/figma-masters-batch.mjs` by moving rest-state bindings into
manifest `componentSpecs[*].slots[]`, then layered governance gates
on top so future drift between source `var(--*)` references and
manifest slot bindings fails the build.

**Six units, all done:**

- ✅ **`8v-1-slot-schema-extension`** (`be8c1a8`) — added optional
  `componentSpecs[*].slots[]` to `manifest/schema.json` with new
  `slotSpec` + `tokenBinding` definitions. Slot fields: `name`
  (semantic role, required), `figmaSlotName` (Figma layer name,
  required when tokenBinding is present), `tokenBinding` (object with
  fill/stroke/padding{X,Y,Top,Bottom,Left,Right}/cornerRadius/gap/
  typography/color, each a token-path string or null). Validator
  extended (`scripts/validate-manifest.mjs`) — rejects empty names,
  unknown binding keys, non-string token paths, tokenBinding without
  figmaSlotName. 4 negative-path cases verified.
- ✅ **`8v-2-migrate-inline-bindings-to-manifest`** (`417c42d`) —
  captured rest-state slot bindings for the 13 components in
  `pipeline/figma-masters-batch.mjs:GENERATIVE_SUBSET`. 36 slot entries
  total. Slot vocab uses semantic roles shared across components
  (`background`, `label`, `title`, `body`, `icon-start`, `icon-end`,
  `root`, etc.).
- ✅ **`8v-3-pipeline-projection-rewrite`** (`33335fb`) — added
  `slotBinding(spec, slotName, overlay?)` helper at top of
  `pipeline/figma-masters-batch.mjs`; replaced all 41 inline
  `_hdsTokenBinding: compactBindings({...})` calls with slot
  projections. Pipeline 836 → 739 lines. Smoke: 13 components × 80
  states × 295 bound nodes (unchanged from pre-rewrite count).
- ✅ **`8v-4-binding-drift-gate`** (`e40922e`) —
  `scripts/check-binding-drift.mjs` walks every `src/app/components/Hds*.tsx`,
  extracts `var(--component-<self-slug>-*)` refs, asserts each resolves
  to a `slot.tokenBinding` or `spec.tokens.*` in the matching spec.
  Modes: default hard-fail / `--soft` warn-only. Honors `// binding-ok:`
  marker in first 15 lines. `pathToCSSVar` converts `component.button.bg`
  → `--component-button-bg`; `specToSlug` converts HdsButton → button
  preserving camelCase. Wired into pretest as `--soft` at landing.
- ✅ **`8v-5-binding-validator-and-hard-fail`** (`2b4f44a`) — new
  `validators/binding-completeness.mjs` — manifest-level invariant:
  if a spec declares `tokens` (or legacy `tokenMapping`), `slots[]`
  must have at least one non-empty `tokenBinding`. Emits
  `BINDING_INCOMPLETE` error code. Dual signature accepts JSX string
  (production via `validators/index.mjs` 5th validator) or
  `{jsx, manifestOverride}` (fixture testability — used by
  `empty-tokenbinding-rejected` synthetic spec). 4 fixtures cover
  complete/no-tokens/missing-slots/empty-tokenbinding paths. Drift
  gate promoted to hard-fail in pretest after Badge.tokens
  (height/minWidth) and Tag.tokens (minWidth/minHeight) cleanups.
- ✅ **`8v-6-visual-regression-snapshot`** (`464a7f0`) —
  `scripts/test-figma-masters-snapshot.mjs` imports `buildMastersBatch`
  from the pipeline, canonicalizes (recursive key-sort) and serializes
  to `fixtures/figma-masters/snapshot-pre-8v3.json` (239 KB, 8698 lines).
  Modes: default diff vs baseline / `--update` writes baseline. Reports
  `13 components × 80 states × 295 bound nodes`. Wired into pretest
  hard-fail. **Caveat ratified:** since 8v-3 already landed before this
  snapshot, the baseline locks post-rewrite known-good state forward
  rather than verifying byte-equivalence with pre-rewrite output —
  acceptable per OPERATOR_BRIEF §4 reasoning at the time.

**Critical decisions made during 8-V (preserve across threads):**

1. **Option B state semantics — RATIFIED.** State-dependent bindings
   (button hover/active/disabled) live in the **pipeline**, not in
   the schema. Slot tokenBinding captures rest-state defaults; pipeline
   computes state-specific overlays from `spec.tokens.*` keys (e.g.
   `spec.tokens.backgroundHover`) and passes via the helper's overlay
   parameter. This matches Material/Polaris/Spectrum/shadcn industry
   convention — tokens are flat, state lives in the consumer. Option A
   (`tokenBinding.byState` overlay structure) was rejected because no
   ecosystem tooling consumes it.
2. **`slotBinding` overlay convention:**
   - `undefined` → keep slot default
   - `null` → explicitly remove the binding (for variants with no
     binding at rest, e.g. tertiary button has no fill)
   - any string → override slot default with this token path
3. **Slot vocab aligned to Radix:** `icon-start` / `icon-end` (not
   `icon-leading`/`icon-trailing`). `figmaSlotName` stays as
   `IconLeft`/`IconRight` for layer-name compatibility with the
   existing plugin runtime.
4. **HdsButton padding deferred.** Removed `paddingLeft/Right/Top/Bottom`
   from HdsButton's slot.tokenBinding. Reason: the old pipeline emitted
   `component.button.size.md.paddingX`-style paths but no CSS variables
   back them — bindings failed silently in production, raw size values
   (sz.paddingX = 8/16/24) persisted. To preserve byte-equivalence, new
   slot just omits padding. **Restoring semantic padding bindings
   requires expanding the token system with size-segmented tokens
   (`component.button.size.{sm,md,lg}.paddingX/Y`)** — separate unit
   post-cluster, low priority.
5. **Input error-text path corrected:**
   `semantic.color.feedback.fg.error` (no CSS var) →
   `component.input.borderError` (real CSS var). All 36 slot binding
   paths now resolve to real CSS variables (verified via grep).
6. **Drift gate scope = self-coverage only.** `check-binding-drift.mjs`
   only flags `var(--component-<self-slug>-*)` refs (e.g.
   `var(--component-button-*)` inside HdsButton). Cross-component refs
   and ambient `--semantic-*` vars are ignored to avoid noise.
   Sufficient for promote-to-hard-fail; broader semantic coverage can
   layer in later if needed.
7. **Drift cleanup precondition for 8v-5 promote.** Badge.tokens
   was missing `height/minWidth`; Tag.tokens was missing
   `minWidth/minHeight`. Added both before flipping the gate to
   hard-fail so the bindable set covered the source-referenced vars.

**`slotBinding` helper signature (canonical, in pipeline file ~line 134):**

```js
function slotBinding(spec, slotName, overlay = null) {
  const slot = (spec && Array.isArray(spec.slots) ? spec.slots : [])
    .find((s) => s && s.name === slotName);
  const base = slot && slot.tokenBinding ? { ...slot.tokenBinding } : {};
  if (overlay) {
    for (const key of Object.keys(overlay)) {
      const v = overlay[key];
      if (v === null) delete base[key];
      else if (v !== undefined) base[key] = v;
    }
  }
  return compactBindings(base);
}
```

**Pretest pipeline now blocks on (all hard-fail) — full list after 8-V:**

```
node scripts/validate-manifest.mjs
node scripts/check-manifest-drift.mjs
node scripts/check-component-completeness.mjs
node scripts/check-source-canon.mjs
node scripts/check-binding-drift.mjs                # NEW (8v-4 → 8v-5)
node scripts/test-figma-masters-snapshot.mjs        # NEW (8v-6)
```

**Naming proposal (tracked as `backlog-3-component-prefix-rename`):**
Adrian flagged on 2026-04-30 the possibility of dropping the `Hds` prefix
and renaming HDS → Hydra. Do NOT execute concurrent with broader Phase 8
hardening — doubles the merge surface. Recommended order: HDS→Hydra brand
rename (cheap, ~0.25 day, brand only) at any time; Hds prefix drop only
after the broader Phase 8 hardening lands.

### shadcn-pivot remaining clusters (next eligible heads)

With 8-V closed, the eligible-head list narrows to **`8x-1`** (tier
classification schema-extension), **`8e-1`** (elevation contract +
shadow tokens), and (optionally, gated) **`p5-1`** envelope. Per the
cluster ordering table in §4, `8-X` lands before `8-E` so we don't
shadcn-refactor entries that turn out to be utilities. **`8x-1` is the
next autonomous-loop pick.**

### Phase 6 — Read path (selection serializer first)

**Why it matters:** Phase 4 just shipped a11y metadata on every emitted
node (p4-4), which was the blocker on p6-1 selection serializer. Finishing
p6-1 unblocks `/lint`, `/contrast`, fix-mode diffing, and reverse token
sync — every designer-facing feature in Phase 6.

**What's in place:**
- `figma-agent-plugin/code.js#extractNodeTree` — exists but doesn't
  resolve `componentName` from master component IDs, doesn't translate
  `boundVariables` to token paths, and has no a11y metadata pickup.
- a11y metadata is now emitted by the compiler on every command (p4-4).
- Manifest is the source of truth for componentName ↔ component ID
  mapping (already built into the registry by p3-x / Phase A).

**What's needed (per orchestration.json p6-1):**
- Match each selected node to its master via Figma component ID, emit
  `componentName`, resolve `boundVariables` to token paths, surface
  `a11y` (name/role/description) on serialized nodes.
- Gate behind `selectionSerializerEnabled` flag in `bridge.config.json`.

**Caveat:** `p6-1` also lists `p5-2-request-response-correlation` as a
dependency. Either ship `p5-2` first or accept that the serializer
won't have correlated request IDs (fine for read-only inspection).

### Phase 5 — Auth + envelope (only if bridge leaves localhost)

**Why it matters:** As long as the bridge runs on `localhost:3005` and the
plugin is the only client, none of Phase 5 is required. The moment the
bridge is reached from another machine — or the moment more than one tool
talks to it — HMAC and an envelope protocol become non-negotiable.

**What's needed:** four units (`p5-1` envelope, `p5-2` correlation,
`p5-3` auth+HMAC, `p5-4` runtime error channel). Each is fully scoped in
`orchestration.json`. Units are sequential; `p5-1` first.

**Defer condition:** stay on the localhost path; pick this up only if the
bridge needs to be reachable from another host or if a second client appears.

## 6. The 7-phase roadmap

```
Phase 0 ✅ Foundation
Phase 1 ✅ Manifest schema + enrichment
Phase 2 ✅ AST validator suite
Phase 3 ✅ Retry loop + streaming refactor (p3-3 done)
        ✅ p3-4 Hermes orchestration dispatcher (`pnpm hds:run`)
Phase 4 ✅ Compiler upgrades:
        ✅ path-a-figma-masters (Phase A1–A5)
        ✅ path-a-visual-differentiation (Phase A6)
        ✅ p4-1 compiler regression fixtures (now 50 cases)
        ✅ p4-2 expression containers
        ✅ p4-3 variant prop → Figma mapping (additive figmaProperties field)
        ✅ p4-4 a11y metadata attachment
        ✅ p4-5 fragments + conditionals
Phase 5 ✅ Auth + envelope + correlation (overnight 2026-05-01 — all 4 done, feature-flagged off):
        ✅ p5-1 message envelope (HMAC + replay-protection) — `1a15de3`
        ✅ p5-2 request/response correlation (pending Map + 30s TTL) — `af1d4a0`
        ✅ p5-3 auth — shared secret + HMAC middleware — `88e64e0`
        ✅ p5-4 plugin runtime error channel — `c1cd3d7`
Phase 6 ✅ Read path (overnight 2026-05-01 — all 5 done):
        ✅ p6-1 selection serializer (manifest-aware) — `b176ffc`
        ✅ p6-2 /lint endpoint — `f246e3f`
        ✅ p6-3 /contrast endpoint (WCAG 2.1) — `630f794`
        ✅ p6-4 reverse token sync — `d6b0e3c`
        ✅ p6-5 fix-mode diff (selection vs LLM proposal) — `cd3f7d8`
Phase 7 ✅ Productionization (all 3 done):
        ✅ p7-1 manifest CI in check:fast / check:full / pretest
        ✅ p7-2 telemetry report (`pnpm telemetry:report`)
        ✅ p7-3 feature-flag lifecycle policy + flag audit — `2fcf922`
Phase 8-pre ✅ LLM output quality (commits 75347aa, 9d9cfb3, 6f42f22, 5df5a67):
        ✅ 8p-1 Swiss canon validator + retry-loop wiring (10 rules, 14 fixtures)
        ✅ 8p-2 manifest description enrichment (15 components, Swiss intent)
        ✅ 8p-3 STYLE CANON system-prompt block (13 lines in buildSystemPrompt)
        ✅ 8p-4 scaffolder + completeness + source canon
            (canon-rules.mjs shared between LLM-output validator and source scan)
Phase 8-pre-followup ✅ Drained (commits 154e053, 5e97c53, 3d23be9, c9de075):
        ✅ 8p-5 primitive prop declarations (HdsFrame/Text/HdsHeading/Card
            no longer trip UNKNOWN_PROP on layout/fill/typography)
        ✅ 8p-6 source canon cleanup + hard-fail promote (honors hds-bypass /
            font-ok markers; 0 violations in source)
        ✅ 8p-7 completeness cleanup + hard-fail promote (honors @doc-exempt;
            8 descriptions extended; 0 violations in 57 components)
        ✅ 8p-8 settings-table COMPLETE EXAMPLE in system prompt (resolves
            TableHeader/HdsTh/TableRow/HdsTd hallucination via flat
            HdsFrame composition pattern — no fake primitives in manifest)
Phase 8 SUPERSEDED — replaced by the shadcn-pivot cluster set
        (Adrian decision 2026-04-30). Reference_phase8_hardening_skills.md
        memory remains useful for cluster 8-T's a11y / motion / quality
        passes but is no longer the primary roadmap.

shadcn-pivot cluster set ✅ FULLY CLOSED 2026-05-01 (28/28 units):
        ✅ 8-V-binding (6/6) — manifest-driven master bindings
        ✅ 8-X-tier (6/6) — 4-tier classification + orphan resolution
        ✅ 8-E-tokens (3/3) — elevation roles + role.* aliases + Tailwind emitter
        ✅ 8-S-shadcn (8/8) — Tailwind v4 + Radix/cva/clsx + 4 flagships + AST projection
        ✅ 8-T-patterns (7/7 — overnight closer): pattern doc template (8t-1),
            template gallery (8t-2), light pattern batch (8t-3a), heavy
            pattern batch (8t-3b), template refactor batch (8t-4),
            orphan-final-cleanup (8t-5), public-api-lockdown (8t-6)

9-D-docs-aesthetic cluster ✅ FULLY CLOSED 2026-05-01 (10/10 units):
        ✅ 9d-1 three-column doc shell — `343c848`
        ✅ 9d-2 cmd-k command palette over manifest — `e964600`
        ✅ 9d-3 system/light/dark theme toggle — `b5ace7b`
        ✅ 9d-4 standardized doc-page header — `13d1a45`
        ✅ 9d-5 CodeBlock collapsed-by-default — `e285b64`
        ✅ 9d-6 right-rail TOC + scrollspy + deep-link anchors — `b85d23a`
        ✅ 9d-7 semantic.docs.* type + spacing scale — `f696a66`
        ✅ 9d-8 inline collapsed ApiReference — `7a4b13a`
        ✅ 9d-9 batch-refactor every doc page — `77d01a7`
        ✅ 9d-10 doc-page snapshot regression gate + a11y audit — `7f848e5`

Backlog:
- ✅ cleanup-dead-sync-endpoint — `555d872` (overnight 2026-05-01)
- ✅ backlog-1-consolidate-audit-scripts — `390e147`
- ✅ backlog-2-full-manifest-enrichment — `38fb002` (GENERATIVE_SUBSET 13→27 via 8s-8 AST)
- backlog-3-component-prefix-rename (drop Hds / consider HDS→Hydra) — DEFERRED, do NOT run during Phase 8 hardening
```

Each phase is a set of units in `orchestration.json`. Units have
`dependsOn` arrays — pick any unit whose deps are all "done" and
it's eligible to execute.

## 7. Non-negotiable safety rules

## 8. How to resume after this brief

### 2026-05-01 PM handoff — context cleared, Phase 12 ready to dispatch

**State:** 196 units total, 114 done, 53 pending, 22 parked, 4 proposed,
3 needs-grilling. 42 immediately-eligible units in dry-run.

**Top of queue per Adrian's stated priority** (visual + Figma to a great
spot ASAP, business expansion soon):

1. **`12a-1-component-index-removal`** (P1, sprint 2) — strip the
   "Editorial Index" / "Component Index" link grid from
   `src/app/pages/hds/components/ComponentDocPageShell.tsx` (lines
   ~41-113). Closes Adrian's "double import of nav happening within HDS
   route main content area" flag. Mechanical deletion + visual rebake.
   Dispatch as **sonnet** (deletion → sonnet per CLAUDE.md rule).

2. **`12a-2-component-page-refactor`** (P1, PROPOSED) —
   Adrian's "most impactful visual change." Match the target simplicity:
   less editorial framing, less prose, direct preview + props + code +
   tokens. **STATUS PROPOSED** — needs Adrian visual ratification on the
   target before refactor. When approved, sonnet pod with reference URLs in
   prompt.

3. **`12d-1-manifest-driven-docs-pass`** (P2, sprint 2) — drive every
   hard-coded component list / token table / prop signature on doc
   pages to manifest projection. Sonnet (cross-cutting refactor).

4. **`12c-1-hirobius-case-study-homepage`** (P2, PROPOSED) — homepage
   integration + Swiss-canon reflow. Needs Adrian content brief.

5. **`12s-1-cloth-sim-flicker-fix`** (P2) — diagnose + fix flicker on
   `src/app/pages/sketches/imported/ClothSimulationLayout.tsx`. Sonnet
   (debugging).

**Then drain Phase-10 sprint-1 in parallel pods** (eco mix):
- Haiku pod: 10a-7 scope-doc + 10t-4-style ADRs follow-ups
- Sonnet pod: 10a-2 token-audit-clean (drives BACKLOG Foundations
  criterion to zero; deletion-heavy)
- Sonnet pod: 10d-* doc-polish chain (1, 2, 3 sequential — doc polish
  shape may absorb most of these)
- Sonnet pod: 10o-21 follow-ups, 10o-3 hooks audit, 10o-9 agent-context
  consolidation

**Background actions that can interleave:**
- **Phase 5/6 flag flips** — 10m-4-feature-flag-flip-window. Earliest
  eligibility 2026-05-02 (24h after each unit landed). Flips activate
  the live read-path: selection serializer + /lint + /contrast + reverse
  token sync + fix-mode diff. Phase 6 can build on top (10f-2..6).

**Skip until grilled (status: needs-grilling):**
- `8h-1`, `8h-2`, `8h-3` Phase 8 hardening
- `10f-13-wat-framework-readability` (WAT acronym undefined)
- Cluster F agent infra (10g-1..4 / OpenClaw / Hermes learning) — none
  yet drafted in restored backlog; Adrian to grill before drafting.

**Skip until ratified (status: parked):**
- `10n-*` narrative-adoption (8 units) — defer until visual+Figma solid
- `backlog-4..22` — repo-wide changes; ratify per-item before opening
- `10p-5-mobile-first-pass` — huge merge surface; defer until visual stable

**Hard rules reminder for next agent dispatch:**
- Eco model selection per CLAUDE.md SUB-AGENT DISPATCH RULES.
- Worktree isolation for ANY parallel pod touching shared files.
- Worktree branches drift from HEAD on creation (branched from stale
  state) — agents MUST `git reset --hard fix/ui-pipeline` early in the
  worktree, OR risk merging stale base files. Pod 8's Pod-5-typography
  conflict is the exemplar.
- After each pod completes, RECONCILE orchestration.json with status:done
  + completedAt in a single chore commit so the autonomous queue stays
  current.
- COMMIT IMMEDIATELY after Node script writes — orchestration.json edits
  uncommitted will be wiped by next worktree reset (this happened in
  the prior session and lost the 86-unit prioritization).

---



The cheapest first move is `node scripts/ai-orchestrator.mjs --orchestrate
--dry-run`. Post-overnight reconciliation 2026-05-01: the active build
queue is **EMPTY** of eligible units. The shadcn-pivot cluster (28/28),
9-D docs-aesthetic cluster (10/10), Phase 5 (4/4), Phase 6 (5/5), and
Phase 7 (3/3) are all closed. Backlog 1 + 2 also drained. Only deferred
backlog item remains: **`backlog-3-component-prefix-rename`** (Hds drop /
HDS→Hydra rename) — do NOT run concurrent with Phase 8 hardening; safe
to schedule now that the hardening has fully landed.

**Option 1 (only remaining queued item): `backlog-3-component-prefix-rename`.**
Drop the `Hds` prefix and (optionally) rename HDS → Hydra. Cheap
mechanical pass once you accept the merge surface (every TSX file +
manifest + docs). ~0.25 day for the brand rename alone; Hds prefix
drop is a longer batch but is now safe to run since the Phase 8
hardening + shadcn-pivot is fully landed.

**Option 2 (flag flips).** Phase 5/6 features all shipped feature-
flagged off. Per p7-3's policy, each flag gets flipped to `true` only
after its unit's validationCmd is green AND 24h of telemetry. Once
24h elapse from each landing (mostly 2026-05-02 onward), individual
flags can flip — see `bridge.config.json#flagAudit` for the per-flag
introduced-at metadata that drives mechanical eligibility.

**Option 3 (post-overnight maintenance).** Run any deferred follow-ups:
the four pre-existing a11y issues 9d-10 surfaced (foundations pages
contrast on `/hds/typography`, `/hds/color`, etc.) — flagged as a
future foundations a11y unit but not opened.

**Option 4 (open work that wasn't part of overnight).** Investigate
the visual-test-baseline-rewrite issue (Playwright `updateSnapshots`
default writes baselines on every run — flagged in backlog-2 +
multiple agent reports). Real fix would set `updateSnapshots: 'none'`
in the playwright config and only allow updates via explicit
`--update-snapshots`.

Default recommendation: nothing in queue. Whenever Adrian wants to
extend, propose **`backlog-3-component-prefix-rename`** as the natural
next strategic move (HDS → Hydra brand-rename + Hds prefix drop).

