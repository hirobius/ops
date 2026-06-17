---
id: ADR-0004
title: Typography Application Strategy — Class System vs Prop Variant vs Status Quo
status: accepted
date: 2026-05-02
supersedes: []
superseded-by: []
---

# Typography Application Strategy

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-02 |
| **Author** | Adrian Milsap (orchestrated; sonnet-class) |
| **Unit** | `12v-token-composite-class-system` |
| **Supersedes** | — |
| **Superseded by** | — |

---

## Context

Every consumer of HDS typography spreads composite token objects directly into
React inline `style` props:

```tsx
<h3 style={{ ...hds.typeStyles.heading3, color: 'var(--semantic-color-content-primary)' }}>
```

The `typeStyles` map in `src/app/design-system/tokens.ts` currently exposes
~25 named keys (8 canonical Swiss-canon composites + ~17 backward-compat
aliases). There are **395 spread call sites** across `src/` as of 2026-05-02.

### Coupling problems with the status quo

1. **Rename fragility.** Every token-path rename (`heading3` → `h3`, already
   done in the composites) must be hunted across all 395 call sites. The alias
   layer in `tokens.ts` masks this today but the alias list is itself a growing
   liability.
2. **No static guarantees.** `hds.typeStyles.heading3` is a plain JavaScript
   object; a typo (`heading33`) is a silent runtime `undefined` spread.
   TypeScript catches it only because the `typeStyles` object is typed — but
   the spread itself (`{ ...undefined }`) produces no visible error.
3. **Over-spread pattern.** Consumers routinely add unrelated overrides inline
   alongside the spread (margin, color, textTransform, letterSpacing). The
   composite intent — "use this style preset as-is" — is undermined, and the
   merged object is not inspectable as "this element uses heading3."
4. **Tree-shaking surface.** Every file that imports `hds` for a single
   `typeStyles.caption` reference pulls the entire token object into the module
   graph. Rollup tree-shakes object properties only when they are accessed on
   an imported name at the top level, not when re-spread into inline styles.

### Existing alternative: `Text` component

`src/app/components/Text.tsx` already exists as a typed variant-prop wrapper.
It accepts a `variant` prop from the `TextVariant` union and spreads the
correct `typeStyles` entry internally. However:
- Adoption is uneven: the component exists but most of the 395 call sites
  predate it or were added without checking for it.
- `Text` wraps a DOM element; it cannot be used where only a style object
  (no element) is needed (e.g., inside a canvas, a motion value, or a
  `StyleSheet.create()` call in React Native).
- It adds a component boundary that sometimes causes layout/flexbox surprises
  when consumers expect a plain `<p>` or `<span>` with no wrapper semantics.

---

## Options evaluated

### Option A — Generated CSS class system (`.hds-text--heading3`)

A build step (extending `build-tokens.mjs` or a new `build-typography-classes.mjs`)
generates one CSS class per composite:

```css
.hds-text--heading3 {
  font-family: var(--semantic-typography-h3-fontFamily);
  font-size: var(--semantic-typography-h3-fontSize);
  font-weight: var(--semantic-typography-h3-fontWeight);
  line-height: var(--semantic-typography-h3-lineHeight);
  letter-spacing: var(--semantic-typography-h3-letterSpacing);
}
```

Consumers apply `className="hds-text--heading3"` and override only what
differs via inline style or a utility class.

| Axis | Verdict |
|---|---|
| **Rename safety** | Class names are stable contracts. Rename `heading3` → `h3` in tokens; old class `.hds-text--heading3` stays as a generated alias. No call-site churn. |
| **Static guarantees** | Typos produce no visual result (class simply doesn't match), but TypeScript cannot catch them without a typed classname utility. |
| **SSR / hydration** | Classes resolve at parse time; no JS needed. Reduces hydration surface. |
| **Override ergonomics** | Clean: `className="hds-text--heading3"` plus an inline style for color. No spread needed. |
| **Bundle size** | Removes runtime token-object references from call sites; CSS classes are static load from the stylesheet. |
| **Migration cost** | HIGH. 395 call sites must be converted. Requires a codemod (or a patient series of targeted PRs). |
| **Tooling cost** | MEDIUM. New generator pass + generated CSS file must be committed and validated. |
| **Composability** | Classes apply to any HTML element regardless of component boundary. Fully flexible. |

### Option B — `Text` variant prop (expand existing component coverage)

Migrate all 395 inline-spread call sites to `<Text variant="heading3">`.
No class generation needed; the component already exists.

| Axis | Verdict |
|---|---|
| **Rename safety** | `TextVariant` union + `variantStyleMap` are the single update point. |
| **Static guarantees** | TypeScript enforces `variant` at the call site. Typos are compile errors. |
| **SSR / hydration** | No change vs current (still inline style via React). |
| **Override ergonomics** | `<Text variant="heading3" style={{ color: '...' }}>` — clean for most cases. |
| **Bundle size** | No improvement; runtime token lookup is now inside Text instead of at the call site, but still runs. |
| **Migration cost** | HIGH. 395 call sites. Not all are element-replaceable (canvas, motion values). Requires fallback strategy for non-element contexts. |
| **Tooling cost** | LOW. No new build step. |
| **Composability** | Limited to DOM element contexts. Non-element usages (inline style objects passed to motion libraries, canvas `fillText` pre-render, etc.) cannot use the component. |

### Option C — Status quo (keep inline spread, improve lint)

Add an ESLint rule that flags `...hds.typeStyles.*` spread usage and nudges
toward `Text` where possible. No structural change.

| Axis | Verdict |
|---|---|
| **Rename safety** | No improvement. Alias layer in `tokens.ts` still needed indefinitely. |
| **Static guarantees** | No improvement. |
| **Migration cost** | Near-zero. |
| **Drift risk** | Alias list grows as new names are introduced; coupling increases over time. |

---

## Decision

**Option A (generated CSS class system) is the architectural target.**
Option B (`Text` full migration) is the preferred delivery vehicle for
element-replacement contexts during the migration.

These two are not mutually exclusive: the migration is a **two-track rollout**:

1. **Track 1 — CSS class generation (new build step):**
   Generate `.hds-text--<name>` classes for all 8 canonical composites plus
   any aliases still in active use. Classes emit from the token compiler so
   they stay in sync with the DTCG source; no hand-maintained CSS.

2. **Track 2 — Call-site migration (codemod-assisted):**
   Replace `style={{ ...hds.typeStyles.heading3, ... }}` with either:
   - `<Text variant="heading3">` when the element is replaceable.
   - `className="hds-text--heading3"` (+ residual inline style for overrides)
     when wrapping in a component boundary is undesirable or when the target
     is a non-component context (canvas string metrics excluded; those remain
     as token lookups).

### Rationale

- **CSS classes are the correct primitive.** Typography presets are styling
  contracts, not data. They belong in the stylesheet, not in a JS object
  spread at runtime. ADR-0001 established that HDS uses CSS custom properties
  as the token delivery mechanism; generating classes from those same custom
  properties is the natural next layer.
- **Adrian's standing directive (2026-05-02)** confirms this: "codegen
  composite-token classes (h3, body, caption); migrate consumers off inline
  spread." The ADR formalises that direction.
- **`Text` survives.** The component adds semantic element selection
  (via `defaultTagMap`) and typed variants; it is not made redundant by the
  class system. After migration, `Text` internally applies the generated
  class rather than spreading `variantStyleMap`. This removes the one
  remaining inline-style spread in the component itself.
- **Option C is rejected** because the alias liability only grows. Deferral
  here is a compounding cost.

### What is NOT decided here

- The exact codemod strategy (AST transform vs manual batch PRs). Tracked as a
  follow-up migration unit.
- Whether `Text` gets a `className`-only mode (no element emitted) for
  non-element contexts. That is a separate API discussion.
- Timing of alias deprecation. Aliases stay in `typeStyles` until the migration
  unit marks all 395 call sites converted.

---

## Consequences

### Build pipeline

- `build-tokens.mjs` (or a new `build-typography-classes.mjs`) gains a pass
  that walks `semantic.typography.*` and emits `.hds-text--<name> { … }` blocks
  into a generated CSS file (e.g., `src/styles/typography-classes.css`).
- The generated file is committed. `check-manifest-drift.mjs` or a new
  validator confirms it stays in sync with the token source.
- Class names follow the `hds-text--<canonical-name>` pattern (dash-case,
  no numeric suffixes). Alias names may also receive a class for the migration
  window but are deprecated at the same time.

### `Text` component

- After the migration unit ships, `variantStyleMap` in `Text.tsx` is
  replaced with a `variantClassMap: Record<TextVariant, string>` that
  applies the generated class name.
- The `style` prop overlay remains for caller overrides.

### Call-site contract (post-migration)

- Preferred: `<Text variant="heading3">…</Text>` — typed, semantic element, class applied internally.
- Acceptable for non-component contexts: `className="hds-text--heading3"` on a plain element.
- Deprecated: `style={{ ...hds.typeStyles.heading3 }}` — flagged by lint rule, removed over time.

### `tokens.ts` alias layer

- Aliases (`heading1`, `heading2`, `heading3`, `ui`, `technical`, `badge`, …)
  remain in `typeStyles` until the migration unit is done. They are not removed
  in this unit. A lint rule (`no-legacy-typestyle-alias`) will be added as a
  soft warning to surface remaining usage.

---

## Migration path

| Step | Unit | Scope |
|---|---|---|
| 1 | This ADR (`12v-token-composite-class-system`) | Decision only |
| 2 | Follow-up: `12v-token-class-generator` (TBD) | Add build step, generate CSS, add validator |
| 3 | Follow-up: `12v-typestyle-callsite-migration` (TBD) | Codemod 395 call sites, update `Text` internally |
| 4 | Follow-up: `12v-typestyle-alias-deprecation` (TBD) | Remove alias keys from `typeStyles`, enforce lint rule |

---

## Open questions

1. **Non-element contexts (canvas, motion libraries).** A small number of call
   sites pass a `typeStyles` object to non-DOM targets. These cannot use a CSS
   class. They may retain the `hds.typeStyles.*` lookup or switch to direct
   token-var references. Inventory needed in the migration unit.
2. **Generated class scope.** Classes are global (no CSS module scope). If HDS
   is later consumed as an external package, global class names could collide.
   Prefix (`hds-text--`) is chosen to minimise risk; revisit if HDS becomes
   multi-tenant consumable.
3. **`className`-only `Text`.** A future `as={null}` or `unstyled` mode
   that returns only a `className` string rather than an element would close
   the non-element gap. Deferred — out of scope for this ADR.
