# 📦 HDS Manifest & Token Sync Standards

Authoritative rules for the token architecture, manifest structure, and sync pipelines. Read this before editing `public/hds-manifest.json`, `hirobius.tokens.json`, `scripts/generate-manifest.mjs`, `scripts/build-tokens.mjs`, or any script in the `tokens`, `sync`, or `check:*` families.

## 1. Two Separate Source Files — Know Which is Which

| File | What it is | Who writes it | Who reads it |
|---|---|---|---|
| `hirobius.tokens.json` | W3C DTCG token graph. The design primitive. | Humans + Figma export | `pnpm tokens` pipeline → CSS vars + TS constants |
| `public/hds-manifest.json` | System inventory: components, phases, health, and token snapshot. | `scripts/generate-manifest.mjs` + bridge `/update-manifest` | Agents, docs pages, LLM context, Figma plugin |

**NEVER conflate them.** A token lives in `hirobius.tokens.json`. A component spec lives in the manifest. A token _reference_ (the path string like `semantic.color.surface.raised`) may appear in both — in the token file as a node in the graph, in the manifest as a metadata field on a component spec.

## 2. W3C DTCG Three-Tier Architecture

```
primitive  →  semantic  →  component
```

| Tier | Path prefix | Purpose | Example |
|---|---|---|---|
| Primitive | `primitive.*` | Raw atoms. Direct values. | `primitive.color.blue.500 = #1E2EFD` |
| Semantic | `semantic.*` | Purpose-named. References primitive. | `semantic.color.surface.raised → primitive.color.neutral.50` |
| Component | `component.*` | Component-specific. References semantic. | `component.button.bg → semantic.accent.rest` |

**Rules:**
- Product UI MUST use `semantic.*` or `component.*` tokens. `primitive.*` is only touched when editing the token system itself.
- A token MUST NOT skip tiers: `component.*` may only reference `semantic.*`, not `primitive.*` directly.
- CSS variable naming: token path `semantic.color.surface.page` → `var(--semantic-color-surface-page)` (dots become hyphens, no other transformation).
- The TS constant mirror lives in `src/app/design-system/tokens.ts` (generated). Import as `import hds from '../design-system/tokens'`.

## 3. Token Pipeline Order (`pnpm tokens`)

Always run the full pipeline, in this order. Partial runs leave derived files out of sync.

```
generate-manifest.mjs      → rebuilds public/hds-manifest.json from source
build-tokens.mjs           → hirobius.tokens.json → src/styles/tokens.css + src/app/design-system/tokens.ts
audit-tokens.mjs --forbidden → fails if theme.css has hardcoded overrides
sync-hds-registry.mjs      → syncs component registry across the system
build-handoff.mjs          → produces DESIGN-HANDOFF.md
build-design-md.mjs        → produces DESIGN.md
build-token-index.mjs      → index for fast agent lookups
generate-llms-txt.mjs      → rebuilds public/llms.txt
```

Do not run individual scripts out of order. If a single script needs to run in isolation (e.g. after a quick token edit), be aware which downstream files are now stale and re-run the full pipeline before committing.

## 4. Manifest Structure

`public/hds-manifest.json` top-level keys and their owners:

| Key | Owner | Do not hand-edit |
|---|---|---|
| `name`, `version`, `generated`, `source` | `generate-manifest.mjs` | ✓ |
| `componentInventory` | `generate-manifest.mjs` (from source scan) | ✓ |
| `componentSpecs` | `generate-manifest.mjs` + bridge `/update-manifest` | Partial — see §5 |
| `tokens` | `generate-manifest.mjs` (snapshot from `hirobius.tokens.json`) | ✓ |
| `typographyRamp`, `patternInventory` | `generate-manifest.mjs` | ✓ |
| `phases`, `health` | `sync-system-health.mjs` + `build-roadmap-data.mjs` | ✓ |
| `agentEntrypoint`, `architecture`, `systemSpecs` | Human-authored, stable | Can edit carefully |
| `brand` | Human-authored | Can edit carefully |

## 5. `componentSpecs` — Required Fields Per Component

Every entry in `componentSpecs` MUST have these fields. The `scripts/validate-manifest.mjs` script (Phase 1.3) enforces this.

| Field | Type | Source | Notes |
|---|---|---|---|
| `category` | string | JSDoc `@category` | Governs docs routing |
| `filePath` | string | Source scan | Relative to repo root |
| `description` | string | JSDoc | One sentence |
| `props` | object | `src/app/data/component-api.json` | See prop schema below |
| `tokens` | object | Hand-authored | Maps semantic role → token path |
| `figmaPropertyMapping` | object | Hand-authored | Maps React prop → Figma property name |
| `states` | string[] | Hand-authored | e.g. `["default","hover","focus","disabled"]` |
| `allowedChildren` | string[] or `["*"]` | Hand-authored | Gatekeeper — Phase 1.2 addition |
| `propConstraints` | object | Hand-authored | Gatekeeper — Phase 1.2 addition |
| `requiredProps` | string[] | Derived from props | Gatekeeper — Phase 1.2 addition |
| `a11yRules` | object[] | Hand-authored | Gatekeeper — Phase 1.2 addition |
| `variantAxes` | string[] | Hand-authored | Phase A1 — ordered prop names emitted as Figma variant axes (cartesian product → COMPONENT_SET variants). e.g. `["variant","size","state"]` for HdsButton. |
| `componentProperties` | object[] | Hand-authored | Phase A1 — Figma component-property declarations. See `manifest/schema.json#definitions.componentProperty`. Applied via `master.addComponentProperty(name, type, defaultValue)` AFTER `combineAsVariants`. |

### Component property schema

```json
"componentProperties": [
  {
    "name": "Label",
    "type": "TEXT",
    "defaultValue": "Button",
    "sourceProp": "label",
    "boundTo": "characters",
    "targetSelector": "Label"
  },
  {
    "name": "Leading icon",
    "type": "BOOLEAN",
    "defaultValue": false,
    "sourceProp": "iconLeft",
    "boundTo": "visibility",
    "targetSelector": "IconLeft"
  },
  {
    "name": "Show label",
    "type": "BOOLEAN",
    "defaultValue": true,
    "sourceProp": "iconOnly",
    "boundTo": "visibility",
    "targetSelector": "Label",
    "invert": true
  }
]
```

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Figma panel display name. Title Case with spaces. |
| `type` | yes | One of `BOOLEAN`, `TEXT`, `INSTANCE_SWAP`. |
| `defaultValue` | no | Default applied at master creation. |
| `sourceProp` | no | React prop the JSX compiler maps from. |
| `boundTo` | no | Defaults: `BOOLEAN→visibility`, `TEXT→characters`, `INSTANCE_SWAP→mainComponent`. |
| `targetSelector` | no | Logical name of the tree node the property attaches to. Plugin matches by `node.name`. Convention: PascalCase. |
| `invert` | no | If true, the JSX compiler negates the source prop value (e.g. `iconOnly→!Show label`). |

### When the JSX compiler emits an instance, it must:

1. Read `componentProperties[].sourceProp` for each Figma property.
2. Look up the React prop value from the JSX attribute.
3. Apply `invert` if set.
4. Emit `setProperties({ [propertyKey]: convertedValue })` on the instance.

### Prop schema

```json
"props": {
  "variant": {
    "type": "enum",
    "values": ["primary", "secondary", "tertiary"],
    "default": "secondary"
  },
  "label": {
    "type": "string",
    "optional": true
  },
  "disabled": {
    "type": "boolean",
    "default": false
  }
}
```

`type` values: `"enum"`, `"string"`, `"boolean"`, `"number"`, `"ReactNode"`.  
If `optional` is absent and there is no `default`, the prop is implicitly required (appears in `requiredProps`).

## 6. Updating the Manifest

### From the bridge (token sync round-trip)
`POST /update-manifest` with `{ tokens: [...] }`. The bridge upserts by `path` first, falls back to `name`. Responds with `{ status, upserted, inserted }`. This is the canonical path for Figma→manifest token updates.

### From `generate-manifest.mjs`
Re-generates `componentInventory`, `componentSpecs` scaffolding, `tokens` snapshot, and phase metadata. Run via `pnpm manifest:generate`. This OVERWRITES generated sections — any hand-edits to those sections are lost. Put hand-edits only in the fields listed as "Can edit carefully" in §4.

### Adding a new component
1. Create the `.tsx` file with JSDoc `@category` tag.
2. Run `pnpm manifest:generate` — the component appears in `componentInventory` and gets a scaffold `componentSpecs` entry with `tokenMapping`, `variantAxes`, `componentProperties` defaulted to empty.
3. Hand-fill `tokens`, `figmaPropertyMapping`, `states`, `allowedChildren`, `propConstraints`, `requiredProps`, `a11yRules`, `variantAxes`, `componentProperties` either inline in the manifest or — preferably — in `scripts/build-tokens.mjs` so they survive re-generation.
4. Run `pnpm validate:manifest` to confirm the spec is valid.
5. Run `pnpm tokens` to propagate to docs and llms.txt.
6. If the component is in the generative-subset, also run Step 5 in the Figma plugin (`pnpm hds:bridge` → click "Step 5: Build Master Components") to materialize the master in the Figma file. The plugin's batch handler reads `variantAxes` to compute the cartesian variant set and `componentProperties` to call `master.addComponentProperty()` after `combineAsVariants`.

## 7. Figma Variables Round Trip

```
hirobius.tokens.json
       ↓  scripts/build-figma-variables.mjs
Figma Variables (Primitive + Semantic + Component collections)
       ↓  SYNC_TOKENS button in plugin → sync-tokens.js
public/hds-manifest.json (token snapshot updated)
       ↓  POST /update-manifest (bridge)
disk
```

Key facts:
- Typography tokens are composite (W3C DTCG) — `build-figma-variables.mjs` explodes each into 5 scalar Figma variables (family, size, weight, line-height, letter-spacing). Do not attempt to sync composite tokens directly.
- The `expandTypography()` function in `build-figma-variables.mjs` owns this expansion. Do not duplicate its logic elsewhere.
- Fluid clamp overrides on `display`, `heading1`, `heading2`, `heading3` are recorded in `$extensions["com.figma.variables"]` in `hirobius.tokens.json`. Figma stores the static desktop-max value; the browser applies the clamp on top. This divergence is intentional and documented.

## 8. Forbidden Patterns

- **NEVER hardcode a hex color, pixel value, or font string in `hirobius.tokens.json`** at the semantic or component tier. Those tiers contain references to primitive, not raw values.
- **NEVER edit the `tokens` snapshot in `public/hds-manifest.json` directly.** It is generated. Run `pnpm manifest:generate`.
- **NEVER edit `componentInventory` directly.** It is generated. Add or rename source files, then re-run the generator.
- **NEVER use `primitive.*` tokens in product UI (components, pages, styles).** Use `semantic.*` or `component.*`. The `audit-tokens.mjs` script enforces this via `--scan-source` mode (planned in backlog-1).
- **NEVER skip the `pnpm validate:manifest` check after hand-editing `componentSpecs`.** Silent schema drift is how the gatekeeper gets corrupted fixtures.
- **NEVER add a deprecated token alias to `hirobius.tokens.json`** to keep old code working. Update the consuming code instead. The audit pipeline tracks deprecated references in source.
- **NEVER commit a manifest where `version` has not been bumped** if `componentSpecs` schema has changed (new required field added). Bump is semver patch for additive changes, minor for breaking.

## 9. Quick Reference — Which Script Does What

| Need | Command |
|---|---|
| Rebuild everything after a token edit | `pnpm tokens` |
| Rebuild just the manifest | `pnpm manifest:generate` |
| Validate manifest against schema | `pnpm validate:manifest` |
| Check for ghost / unused token vars | `pnpm check:ghost-tokens` |
| Check for forbidden hardcoded overrides | `pnpm check:forbidden-overrides` |
| Full token + component audit | `pnpm check:fast` |
| Sync Figma Variables from tokens | `node scripts/build-figma-variables.mjs` |
| Audit Figma system state | `pnpm figma:audit` |
