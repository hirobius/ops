# Hirobius DesignOps Engine — Architectural Roadmap

> **Draft — populate from 2026-05-06 session notes.** The original
> Adrian-pasted blocks ("Hirobius DesignOps Engine — Architectural Roadmap"
> and "Execution Strategy — Autonomous Orchestration Plan") were not
> recovered from `~/.hermes/sessions/` archives. This file scaffolds the
> WHY layer from `docs/adr/004-figma-cli-skipped.md`,
> `docs/operations/figma-plugin-runbook.md`,
> `docs/ai/rules/FIGMA_BRIDGE.md`, `docs/ai/OPERATOR_BRIEF.md`, and the
> Phase 0–7 unit graph in `docs/ai/orchestration.json`. Replace the
> wrapper prose with the original paste blocks when they surface.

The companion HOW document is
[`docs/figma-plugin/EXECUTION_PLAN.md`](./EXECUTION_PLAN.md).

---

## 1. Purpose

The Figma plugin + bridge + JSX compiler is the closed loop between
design iteration and code generation in the Hirobius DesignOps Engine.
It is the primary force multiplier for the solo-founder agency model: a
designer (Adrian or a future operator) types intent into Figma, an LLM
emits constrained JSX, validators reject anything that drifts from the
manifest, and the plugin paints the result on canvas — no manual
component placement, no manual token selection, no human in the
correction loop.

This roadmap captures the architectural why. The execution plan in the
companion doc captures the how, ordered by the Phase 0–7 unit graph
already encoded in `docs/ai/orchestration.json`.

---

## 2. Gap Analysis — what works today vs. what is missing

### What works today (verified across Phase 0–7)

- **Three-process architecture** (CLI → Bridge → Plugin) over localhost
  with hermes3/Ollama as the local LLM. See
  `docs/ai/rules/FIGMA_BRIDGE.md` §1.
- **JSONL command schema** with two action verbs (`ADD_NODE`,
  `UPDATE_NODE`) and prop rules requiring token paths instead of raw
  hex/px values. See `docs/ai/rules/FIGMA_BRIDGE.md` §5.
- **Validator suite (the AST Gatekeeper)** — JSX parser + manifest
  validator + token validator + a11y validator + orchestrator. Phase 2
  units `p2-1`..`p2-5` all status `done`.
- **Self-healing retry loop** — correction formatter, retry controller,
  pipeline integration, and the Hermes orchestration agent that pumps
  the loop. Phase 3 units `p3-1`..`p3-4` all status `done`.
- **JSX compiler upgrades** — fixtures, expression containers, variant
  mapping, a11y metadata, fragments + conditionals. Phase 4 units
  `p4-1`..`p4-5` all status `done`.
- **Two-way protocol foundations** — message envelope, request/response
  correlation, HMAC auth, runtime error channel. Phase 5 units
  `p5-1`..`p5-4` all status `done`.
- **Selection-driven fix-mode** — selection serializer, lint command,
  contrast checker, token sync, fix-mode diff. Phase 6 units
  `p6-1`..`p6-5` all status `done`.
- **CI + telemetry + flag-cleanup hardening** — Phase 7 units
  `p7-1`..`p7-3` all status `done`.

### What the existing repo docs cover only at high level

`docs/adr/004-figma-cli-skipped.md` records the choice of plugin-first
over figma-cli but says nothing about the validator architecture.

`docs/process/2026-04-19-figma-sync.md` (predecessor) and
`docs/operations/figma-plugin-runbook.md` cover the operator surface —
how to start the bridge, where the secret lives, what to do when SSE
disconnects — but not the architectural reasoning behind the gatekeeper
or the retry loop.

`docs/ai/rules/FIGMA_BRIDGE.md` is binding standards (endpoints, schema,
forbidden patterns) but not narrative. It tells you *what is true*; it
does not tell you *why these particular shapes were chosen* or *what we
are still building toward*.

This file fills the narrative gap. Read it first if you are new to the
plugin pipeline. Then read FIGMA_BRIDGE for the contracts.

---

## 3. The four pillars

### 3.1 AST Gatekeeper

**Problem.** LLMs hallucinate. Hermes3 will happily emit
`<HdsButton variant="ghost" />` after the `ghost` variant has been
removed, or `fill="#FFFFFF"` after we forbade hex strings. Without a
gatekeeper between the LLM and the plugin, every drift becomes a Figma
canvas defect.

**Solution.** Parse every LLM output to AST, then walk the tree against
the manifest:

1. **Manifest validator** (`p2-2-manifest-validator`). Every JSX element
   must resolve to a `componentInventory` entry. Every prop must match
   the `propsSpec` for that component. Unknown props or unknown variants
   are hard fails.
2. **Token validator** (`p2-3-token-validator`). Every color, dimension,
   spacing, and typography prop must be a token path or `var:`
   shorthand. Raw hex / `rgb()` / pixel strings are rejected.
3. **a11y validator** (`p2-4-a11y-validator`). Every interactive element
   must carry the role / label / focus-target metadata declared in the
   manifest's a11y annotations.
4. **Orchestrator** (`p2-5-validator-orchestrator`). Runs the three
   validators in sequence, aggregates failures into a single
   correction-formatter-friendly payload, gates the JSONL POST to
   `/generate`.

**House rule.** The gatekeeper is the only place where schema is
checked. CLI-side `isValidCommand` is a soft pre-filter; the gatekeeper
is the hard gate. Per `docs/ai/rules/FIGMA_BRIDGE.md` §8, no pipeline
stage may bypass it without a `bridge.config.json` flag and a ledger
entry in `AI_DECISION_LEDGER.md`.

### 3.2 Self-healing retry loop

**Problem.** Even with a gatekeeper, the LLM produces invalid output ~10%
of the time on first generation. Surfacing every failure to the operator
defeats the closed-loop promise.

**Solution.** Validator failures are formatted as natural-language
correction prompts and fed back to the LLM as a follow-up message:

1. **Correction formatter** (`p3-1-correction-formatter`). Translates
   structured validator errors into LLM-readable prose ("the prop
   `fill='#FFFFFF'` is forbidden; use a token path like
   `'semantic.color.surface.raised'` instead").
2. **Retry controller** (`p3-2-retry-controller`). Re-prompts the LLM
   with the original instruction + the correction. Bounded retries
   (default 3) with exponential backoff. Logs every attempt to
   `telemetry/events.jsonl` for retry-rate analytics.
3. **Pipeline integration** (`p3-3-pipeline-integration`). Wires the
   retry controller into `scripts/generate-to-figma.mjs` so retries
   happen transparently between LLM call and JSONL POST.
4. **Streaming refactor** (`p3-3-streaming-refactor`). Streams partial
   LLM output through the validator so we can fail fast instead of
   waiting for the full envelope before checking validity.
5. **Hermes orchestration agent** (`p3-4-hermes-orchestration-agent`).
   The autonomous wrapper that pumps the loop end to end without a human
   in the chair.

**Telemetry contract.** Operator-facing dashboards in
`/ops/build/telemetry` read `telemetry/events.jsonl` directly; if
retry-exhaustion rate exceeds 10%, the `OPERATOR_BRIEF.md` §10 stop rule
fires.

### 3.3 JSX compiler upgrades

**Problem.** The naive JSX → JSONL compiler can only handle literal
strings, literal numbers, and a fixed component vocabulary. Real-world
LLM output uses expressions, conditionals, fragments, and references
manifest-driven variants the compiler does not statically know.

**Solution.** Phase 4 lifts the compiler from "literals only" to
"manifest-aware expression compiler":

1. **Compiler fixtures** (`p4-1-compiler-fixtures`). Locked snapshot
   inputs/outputs that pin compiler behavior. The fixture is the
   contract; "fixing the fixture" is forbidden per OPERATOR_BRIEF §5.7.
2. **Expression containers** (`p4-2-expression-containers`). Compile
   `{expression}` JSX by evaluating against a sandboxed scope, falling
   back to manifest-derived defaults for unresolvable identifiers.
3. **Variant mapping** (`p4-3-variant-mapping`). Translate React variant
   props (`variant="primary"`) into Figma component-property tuples
   (`Variant=primary`) using the manifest's variant axis declarations.
4. **a11y metadata** (`p4-4-a11y-metadata`). Emit `boundVariables` and
   `targetSelector` annotations the plugin needs for screen-reader
   parity in master batches.
5. **Fragments + conditionals** (`p4-5-fragments-conditionals`). Compile
   `<>...</>` fragments and `{cond && <Element/>}` conditional renders
   by emitting `visible: false` on the conditional branch, so the plugin
   can flip visibility without re-rendering.

**Path-A (master batches)** layers on top: `path-a-figma-masters` builds
cartesian-variant master sets; `path-a-visual-differentiation` emits
fills/borders/states so each variant is visually distinct on canvas.

### 3.4 Two-way protocol

**Problem.** The original plugin-bridge channel is one-way: CLI emits,
plugin draws. There is no back-channel for runtime errors, selection
state, lint findings, or contrast warnings.

**Solution.** Phase 5 + Phase 6 build a symmetric envelope-based
protocol:

1. **Message envelope** (`p5-1-message-envelope`). Every message wraps
   `{ id, type, payload, timestamp, hmac }`. Schema in
   `docs/ai/rules/FIGMA_BRIDGE.md` §7.
2. **Request/response correlation** (`p5-2-request-response-correlation`).
   Bridge tracks pending request IDs in memory with 30s timeout; plugin
   replies echo the original ID so async callers can resolve.
3. **HMAC auth** (`p5-3-auth-hmac`). HMAC-SHA256 over
   `${id}.${type}.${timestamp}.${stableStringify(payload)}` using
   `HDS_BRIDGE_SECRET`. Replay protection via 5-minute id-cache.
4. **Runtime error channel** (`p5-4-runtime-error-channel`). Plugin-side
   draw failures (font-load failure, invalid component reference, etc.)
   surface back through the envelope as if they were validator errors,
   so the retry loop can correct them without human intervention.
5. **Selection serializer** (`p6-1-selection-serializer`). Plugin
   serializes the active Figma selection into the
   `SelectionPayload` shape from FIGMA_BRIDGE §4 (depth-bounded at 4)
   and POSTs to `/selection` on every selectionchange.
6. **Lint command** (`p6-2-lint-command`). Read-path: the CLI can ask
   the plugin "is this canvas selection manifest-conformant?" and get
   structured findings.
7. **Contrast checker** (`p6-3-contrast-checker`). Walks the selection
   tree, computes WCAG contrast for every text/background pair, returns
   findings with token-aware suggestions.
8. **Token sync** (`p6-4-token-sync`). Pushes tokens from Figma's
   variable system back to `public/hds-manifest.json` via
   `/update-manifest`, so designer-side token edits land in code.
9. **Fix-mode diff** (`p6-5-fix-mode-diff`). When `pnpm ui:fix` runs
   against a selected node, the bridge computes a diff between current
   selection and proposed update and only emits `UPDATE_NODE` for
   changed properties — no full-frame redraws.

---

## 4. Adrian's priorities (memory pointer)

Per `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/project_figma_plugin_priority.md`,
the plugin is the top focus once HDS Sprint 2 closes. Concrete priorities
in order:

1. **Auth.** `HDS_BRIDGE_SECRET` + envelope HMAC end-to-end
   (Phase 5 — done; verify the operator pairing flow per the runbook).
2. **Status sync.** `orchestration.json` → Figma status page so the
   designer sees unit progress on canvas. Not in Phase 0–7; new work.
3. **Template injection.** Auto-populate the standard 8-page Figma
   client file (per
   `~/.claude/projects/-home-adrian-projects-adrian-milsap/memory/project_figma_template_structure.md`)
   from a one-button plugin action. Not in Phase 0–7; new work.
4. **Brand token override.** Per-client theming applied at plugin
   render time so a single component pipeline serves multiple
   client brands. Not in Phase 0–7; new work.

The execution plan covers Phase 0–7 closure verification and tees up
the new work above as Phase 8+ proposed units.

---

## 5. Decision log (current)

The choices below are binding house style; deviations require an entry
in `docs/logs/AI_DECISION_LEDGER.md` per OPERATOR_BRIEF §5.

| Decision | Source | Why |
|---|---|---|
| Plugin-first, no figma-cli | `docs/adr/004-figma-cli-skipped.md` | Different abstraction; asar patching is fragile; Plugin API is stable |
| Local LLM (hermes3 via Ollama) | runbook + memory | Free, deterministic-enough, no token-budget concern, no remote call |
| JSONL over POST `/generate` | `FIGMA_BRIDGE.md` §2 | One-line-per-command keeps streaming simple, parser tolerant |
| Manifest as single source of truth | OPERATOR_BRIEF §5.1 | Compiler, validators, plugin all read the same file; no duplication |
| Fixtures before code (Phase 2+) | OPERATOR_BRIEF §5.2 | Fixture defines correctness; failing tests fix the implementation, never the fixture |
| Feature-flag everything | OPERATOR_BRIEF §5.3 | New behavior in `bridge.config.json`, default false, flip after 24h clean telemetry |
| Telemetry through the logger | OPERATOR_BRIEF §5.4 | `telemetry/events.jsonl` only; never `console.log` for command-flow |
| One commit per phase | OPERATOR_BRIEF §5.5 | `feat(gatekeeper): complete Phase N — <name>` |
| Schemas are immutable | OPERATOR_BRIEF §5.6 | Once a unit's output schema is committed, only additive changes; breaking changes need a version bump |

---

## 6. Open questions

These are the genuinely-open items as of 2026-05-09. Most became open
*because* Phase 0–7 closed and surfaced what we still cannot do
end-to-end:

- **Status-sync surface.** Where on the Figma canvas does the
  orchestration status page live? Plugin-injected frame, or a
  separately-loaded file? Affects template-injection work.
- **Multi-tenant brand override.** Per-client overrides apply at
  generation time (LLM prompt) or render time (plugin remap)? Trade-off:
  generation-time gives fewer surprises; render-time keeps a single
  pipeline.
- **Status-page authority.** When orchestration.json says "done" but the
  validator stops finding violations, is the unit really done? Need a
  closed-loop-ready audit, not just a green test.
- **LLM upgrade path.** When Hermes4 / Devstral lands, do we re-run the
  fixture suite as a regression test, or do we lock to hermes3 until a
  curated migration?
- **Plugin-side telemetry.** The runbook covers bridge-side failures,
  not plugin-side draw exceptions. The runtime-error channel
  (`p5-4`) handles the data; what is the operator surface?

These feed the proposed-units seam at `docs/ai/proposed-units.jsonl`;
review before promotion.
