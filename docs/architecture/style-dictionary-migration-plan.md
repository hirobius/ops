# Style Dictionary Migration Plan

> Status: PLAN + POC (not a migration). Run `pnpm audit:style-dictionary` to verify POC parity.

---

## 1. Summary

| Metric | Value |
|---|---|
| Current `build-tokens.mjs` LOC | **1,494** |
| Estimated post-migration LOC (SD config + plugins) | **~350–450** (SD handles token parsing, alias resolution, name generation) |
| LOC reduction | **~70%** |
| Migration risk level | **Medium** |
| Verdict | **worth-doing — but not urgently.** SD handles the commodity 80% cleanly; the 20% (composite expansion, dark mode, tenant overlay, TS outputs) requires writing equivalent custom transforms/formats that will be smaller but still non-trivial. The token system is working and not a pain point today. Migrate when `build-tokens.mjs` needs a significant feature addition or when the team adds another platform target (iOS/Android) where SD's ecosystem value is immediate. |

---

## 2. Surface inventory

| Output file | Contents | SD approach | Classification |
|---|---|---|---|
| `src/styles/tokens.css` | Root CSS vars + dark mode block | `css/variables` format + `outputReferences: true` + custom composite format | **SD + custom format** |
| `src/styles/tokens.generated.css` | Identical copy of `tokens.css` | Second file target in same platform | **SD native** |
| `src/styles/tenants.css` | `[data-tenant="slug"]` scoped blocks per tenant | SD has no built-in "themes at attribute scope" concept | **needs plugin** (custom SD runner: one build per tenant slug, merge output) |
| `src/app/design-system/generated-tokens.ts` | Nested TS object of `var(--...)` strings (no composites) | `javascript/esm` format with custom serializer | **SD + custom format** |
| `src/app/design-system/generated-token-refs.ts` | Nested TS object including typography/motion/elevation composites | No built-in TS composite output | **SD + custom format** |
| `src/app/design-system/generated-token-vars.d.ts` | TypeScript `declare module 'react'` CSSProperties augmentation | Not an SD concern; purely mechanical | **needs out-of-band script** (or custom format that emits TS module augmentation) |
| `src/app/design-system/generated-token-values.ts` | Raw primitive values (not var() refs) | `javascript/esm` without outputReferences | **SD + custom format** |
| `src/app/design-system/generated-token-descriptions.ts` | `Record<dotPath, description>` | Custom format reading `$description` fields | **SD + custom format** |
| `public/hds-manifest.json` | Full component-spec manifest (merges existing manifest + token data) | Not a token output; reads `public/hds-manifest.json` as input and merges | **needs out-of-band script** (stays as `build-manifest.mjs`) |
| `tailwind.config.tokens.cjs` | Tailwind `theme.extend` with role colors + shadows + borderRadius | SD has no Tailwind format; role-to-Tailwind mapping is bespoke | **SD + custom format** (or thin out-of-band script) |

---

## 3. Token features mapped

Each non-trivial feature in `hirobius.tokens.json` against Style Dictionary v5 DTCG support:

### 3a. `$type` inheritance (group-level)
**build-tokens.mjs**: `walkTokens()` propagates `$type` from parent group to children via `inheritedType`.  
**SD native**: Yes — SD v5 (`usesDtcg: true`) walks the tree and inherits `$type` from ancestor groups identically to the DTCG spec. No transform needed.

### 3b. `$value` alias chains (`{primitive.color.neutral.white}`)
**build-tokens.mjs**: `resolveAlias()` recursively follows refs.  
**SD native**: Yes — SD resolves aliases natively. `outputReferences: true` preserves `var(--...)` chains in CSS output (critical: without this flag SD resolves to raw values, breaking the semantic→primitive dark-mode cascade). **Confirmed working in POC.**

### 3c. DTCG dimension `{value: N, unit: 'px'}` object format
**build-tokens.mjs**: `dimensionToCSS({value, unit})` → `Npx`.  
**SD**: Built-in `size/px` does NOT handle DTCG object format; it only converts unitless numbers to rem/px. A custom `value/hds-dimension-px` transform is required. **Implemented and proven in POC.**

### 3d. DTCG duration `{value: N, unit: 'ms'}` object format
**build-tokens.mjs**: `durationToCSS({value, unit})` → `Nms`.  
**SD**: Same gap as dimensions — same fix. Extend `value/hds-dimension-px` to also handle `duration` type.

### 3e. `cubicBezier` type (`[n, n, n, n]` array)
**build-tokens.mjs**: `cubicBezierToCSS(val)` → `cubic-bezier(n, n, n, n)`.  
**SD native**: Yes — SD has `cubicBezier/css` transform. No custom transform needed.

### 3f. Custom `spring` type (`{type: 'spring', stiffness, damping, mass}`)
**build-tokens.mjs**: Returns `spring(stiffness, damping, mass)` CSS string.  
**SD**: No built-in `spring` type support. SD emits `[object Object]`. A custom `value/hds-spring` transform is required:
```js
{ type: 'value', filter: t => (t.$type ?? t.type) === 'spring',
  transform: t => { const v = t.$value ?? t.value; return `spring(${v.stiffness}, ${v.damping}, ${v.mass})`; } }
```

### 3g. `fontFamily` array (`["Satoshi", "system-ui", ...]`)
**build-tokens.mjs**: `fontFamilyToCSS(val)` — quotes names containing spaces.  
**SD native**: `fontFamily/css` transform does the same. Note: SD uses single quotes, build-tokens.mjs uses double quotes. Cosmetic difference only.

### 3h. `shadow` type — pre-composed string passthrough
**build-tokens.mjs**: Passes through string shadows (the `hsl(var(--shadow-color) / α)` pattern) verbatim.  
**SD**: `shadow/css/shorthand` transform handles DTCG structured shadow objects. For string shadows, SD also passes through string values verbatim. This works correctly per the full-file test run above.

### 3i. Custom `motion` composite type
**build-tokens.mjs**: Expands one `motion` token into 2 CSS vars with a renamed prefix: `--hds-motion-{name}-duration` and `--hds-motion-{name}-easing` (note: `--hds-motion-` prefix, not `--semantic-motion-`).  
**SD**: No built-in support. SD's DTCG support writes the composite as a single var with a stringified value. A custom format hook is required that detects `motion` type tokens and emits the two-var expansion with the correct prefix.

### 3j. `typography` composite type (extended)
**build-tokens.mjs**: Expands one `typography` token into 5–7 CSS vars: `font-family`, `font-size`, `font-weight`, `letter-spacing`, `line-height`, plus optional `max-width` and `text-transform` (HDS extensions to DTCG schema).  
**SD**: SD's `typography/css/shorthand` generates a CSS `font` shorthand, which is NOT what HDS uses. HDS uses expanded individual vars. Additionally SD warns that `letterSpacing`, `maxWidth`, `textTransform` are not recognized CSS font shorthand properties. A custom format hook is required.

### 3k. `elevation` composite type (non-DTCG)
**build-tokens.mjs**: Expands one `elevation` token into 3 CSS vars: `-surface`, `-shadow`, `-border`.  
**SD**: No built-in `elevation` type. Emits the composite object as-is. A custom format hook is required.

### 3l. `$extensions.com.figma.variables.modes.Dark` (dark mode)
**build-tokens.mjs**: Collects `Dark` mode values per token and emits a separate `[data-theme="dark"]` block.  
**SD v5**: Has a `expand` option for DTCG modes, but it targets `$value` objects with named modes at the VALUE level (not `$extensions`). The Figma-specific `$extensions.com.figma.variables.modes` structure is non-standard. A custom format hook is required that reads extensions and emits the dark block after the `:root` block.

### 3m. V1–V5 token validation rules
**build-tokens.mjs**: `validateTokens()` — 5 structural rules (alias-only semantics, ref resolution, circular detection, extensions namespace, mode key capitalization).  
**SD**: SD validates broken references natively. V1 (alias-only semantics), V4 (namespace), V5 (capitalization) are HDS-specific business rules. These stay as `scripts/audit-tokens.mjs` (already exist).

---

## 4. Tenant overlay mapping

The tricky bit: `tenants/*/tokens.json` overlays override a subset of `semantic` tokens and are emitted as `[data-tenant="slug"]` scoped CSS blocks.

**SD's built-in theme support** uses `source` (base) + `include` (overrides) at the config level, but it merges token values globally — it does not produce separate per-tenant output blocks.

### Recommended approach: custom format plugin

```
sd-tenant-overlay-plugin (pseudocode):
  
  inputs:
    - baseBuild: the resolved dictionary from hirobius.tokens.json
    - tenantDir: tenants/{slug}/tokens.json
  
  for each tenant slug in tenants/:
    if slug starts with '_': skip
    load overlay = parse(tenants/{slug}/tokens.json)
    validate overlay (R1, R5, R8 checks — keep in audit-tenant-overlay.mjs)
    
    lightVars = []
    darkVars = []
    for each leaf token in overlay:
      cssVar = token.path.join('-')
      lightVal = token.$extensions?.modes?.Light ?? token.$value
      darkVal  = token.$extensions?.modes?.Dark
      
      emit:  --{cssVar}: {lightVal};   → lightVars
      if darkVal != lightVal:  emit: --{cssVar}: {darkVal};  → darkVars
    
    output:
      [data-tenant="{slug}"] { ...lightVars }
      [data-tenant="{slug}"][data-theme="dark"] { ...darkVars }  (if any)
  
  This can be implemented as:
    Option A: A custom SD format that receives a pre-merged per-tenant dictionary
              (requires running SD N times, once per tenant)
    Option B: A standalone post-process script that reads the SD base output
              and appends tenant blocks — simpler, no SD involvement
  
  Recommendation: Option B. The tenant overlay logic is ~120 lines of build-tokens.mjs
  and is well-tested. Extract it to scripts/build-tenant-css.mjs and call it after the
  SD CSS build. No SD learning curve, no multi-pass SD runs.
```

---

## 5. Migration steps (dependency order)

| Step | Description | Replaces build-tokens.mjs | Rough effort |
|---|---|---|---|
| 1 | Install `style-dictionary` as devDep | — | Done (already installed) |
| 2 | Write `sd.base.config.mjs` — handles primitive + semantic CSS vars for simple scalar tokens (`color`, `dimension`, `duration`, `cubicBezier`, `fontFamily`, `shadow`) | Lines 147–265, 1267–1321 | 1–2h |
| 3 | Add custom transforms: `value/hds-dimension-px`, `value/hds-spring`, `value/hds-duration`, `name/hds-preserve-camel` | Lines 58–70, 121–145 | 1h |
| 4 | Add custom composite format: handles `motion`, `typography`, `elevation` type expansion with correct var-name suffixes | Lines 191–265 | 2–3h |
| 5 | Add dark mode support in CSS format: collects `$extensions.com.figma.variables.modes.Dark` per token, emits `[data-theme="dark"]` block | Lines 255–262 | 1h |
| 6 | Write TypeScript platform formats: `generated-tokens.ts`, `generated-token-refs.ts`, `generated-token-vars.d.ts`, `generated-token-values.ts`, `generated-token-descriptions.ts` | Lines 267–421, 1322–1436 | 3–4h |
| 7 | Write Tailwind format: emit `tailwind.config.tokens.cjs` from role tokens + semantic.shadow | Lines 1023–1084 | 1h |
| 8 | Extract tenant overlay to `scripts/build-tenant-css.mjs` (standalone, not SD) | Lines 1086–1265 | 0.5h (extract, no logic change) |
| 9 | Verify byte-equivalence on all outputs via `diff` against current build | — | 2–3h (debugging expected format differences) |
| 10 | Cut over `package.json` `tokens` script; delete `build-tokens.mjs` | — | 0.5h |

**Total estimated effort**: 1.5–2 agent-sessions (sonnet-class)

---

## 6. Risks / unknowns

### R1 — Dark mode extension format is non-standard (HIGH)
`$extensions.com.figma.variables.modes.Dark` is a Figma-specific extension, not DTCG-standard.
SD's built-in modes expansion targets `$value` objects with named keys, not `$extensions`.
If SD v6 formalizes modes differently, the custom dark-mode format will need updating.
**Detection**: `pnpm typecheck` won't catch this; only visual regression testing would.

### R2 — Typography composite shorthand mismatch (HIGH)
SD's `typography/css/shorthand` generates a CSS `font:` shorthand, not individual vars.
HDS requires individual `--semantic-typography-X-font-family`, `--...-font-size`, etc.
A custom format is needed. If SD changes `typography/css/shorthand` behavior in a minor
version, it won't affect the custom format (which bypasses it), but it could cause confusion.
**Detection**: `pnpm audit:style-dictionary` catches this immediately.

### R3 — camelCase token keys (MEDIUM)
SD's name transforms default to kebab-case. HDS uses camelCase-preserved names like
`--primitive-color-projectBrand-microsoftGameDev-*`. The `name/hds-preserve-camel` transform
handles this, but any future token added with camelCase keys must be tested against the
transform.
**Detection**: `pnpm audit:style-dictionary` catches drift.

### R4 — TypeScript output semantic equivalence (MEDIUM)
The TS output files (`generated-token-refs.ts`, `generated-token-vars.d.ts`, etc.) have
bespoke serialization logic (`serialize()`, `serializeRaw()`, `buildTokenRefsTree()`).
These are ~200 lines of build-tokens.mjs. SD has no built-in TypeScript composite support.
Custom formats can replicate the output, but byte-level equivalence is hard to guarantee
without careful testing against `tsc --noEmit`.
**Detection**: `pnpm typecheck` catches import/type errors; runtime behavior requires usage tests.

### R5 — `hds-manifest.json` stays out-of-band (LOW)
`buildManifest()` (~400 lines) is heavily coupled to `componentSpecs`, `SYSTEM_MANIFEST`
read from `public/hds-manifest.json`, and HDS-specific metadata. This is NOT a token build
concern; it should stay as a separate script regardless of migration.
**Detection**: N/A — design choice.

### R6 — SD v5 API stability (LOW)
SD v5 was released in 2024 and is the current stable. The `hooks` API changed significantly
from v3/v4. Any upgrade to v6 may require revisiting custom transforms. Pin `style-dictionary`
in package.json to a minor range (`^5.x`) and review changelog on upgrade.
**Detection**: `pnpm audit:deps` or Renovate Bot.

---

## 7. Estimated payoff

| Metric | Current | Post-migration |
|---|---|---|
| `build-tokens.mjs` LOC | 1,494 | 0 (deleted) |
| SD config + plugins LOC | — | ~350–450 |
| Net LOC reduction | — | **~70% (~1,050 lines)** |
| Maintenance burden | High — every new composite type requires understanding the entire build | Lower — SD's DTCG parsing and alias resolution are upstream concerns; only custom formats need maintenance |
| New token types onboarding | Manual: add `case` to `valueToCSS()`, `expandX()`, update `buildTSTree()`, `buildTokenRefsTree()` | Lower: add a custom transform for the new type; DTCG-standard types (color, dimension, duration, cubicBezier) are handled for free |
| New platforms (iOS/Android) | Not supported without significant new code | **Free with SD** — iOS/Android/Flutter/Compose platforms are pre-built |
| DTCG conformance | Custom subset (mostly conformant, spring/motionEasing are extensions) | SD v5 is the reference DTCG implementation; better conformance for standard types |
| Ecosystem | Custom, no community plugins | SD has a growing plugin ecosystem (Figma Tokens, Token Studio, etc.) |

### What we gain immediately

1. **DTCG alias resolution is proven and tested** — no more custom `resolveAlias()` to maintain.
2. **Color handling for standard types** — SD handles hex/hsl/rgb/oklch passthrough correctly.
3. **~70% less code to read and debug** — the remaining 350 lines are high-signal custom logic.
4. **Platform extensibility** — adding a native iOS token export is a 10-line SD platform config.

### What we give up / accept

1. **Control over whitespace** — SD's output format is opinionated; byte-equivalence requires custom formats.
2. **Custom composite types** — `spring`, `motion`, `elevation` are not DTCG-standard; they stay custom.
3. **Validation rules V1–V5** — stay in `scripts/audit-tokens.mjs` (already separate).

---

## 8. POC details

The POC at `scripts/poc/style-dictionary-poc/` proves byte-equivalence for the simplest
and most voluminous token subset (primitive.color + space + radius, ~64 vars) using:

- `name/hds-preserve-camel` transform
- `value/hds-dimension-px` transform
- `hds/css-variables` custom format (no inline comments)

Run: `pnpm audit:style-dictionary`

**Result: PASS** — zero diff lines after comment normalization.

Documented gaps for the full migration are listed in `scripts/poc/style-dictionary-poc/README.md`.
