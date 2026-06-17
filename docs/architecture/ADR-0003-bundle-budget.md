---
id: ADR-0003
title: Bundle Budget Decision
status: accepted
date: 2026-05-01
supersedes: []
superseded-by: []
---

# Bundle Budget Decision

**Date:** 2026-05-01  
**Unit:** 12o-perf-per-route-bundle-budget  
**Status:** implemented — warn-mode budgets active in CI

---

## Problem

The main JS entry chunk was **1,344 kB raw / 347 kB gzip** — all downloaded before
first paint. Root cause: `HDSLayout` (the root route shell, loaded eagerly) imported
`MobiusShellLayer` → `MobiusLogo` → `MobiusScene`, pulling the entire
three.js stack synchronously into the entry chunk.

Secondary contributors:
- `vendor-motion` (125 kB) was already split but still large
- `_virtual_hds-manifest` (220 kB) is inlined by the virtual module plugin
- `hds-registry.json`, `token-audit-report.json`, `health-history.json` are
  synchronous static imports inside `HDSLayout` (data; not changed in this unit)

---

## Pre-split sizes (2026-05-01 baseline)

| Chunk | Raw | Gzip |
|---|---|---|
| `index-*.js` (main entry) | 1,344 kB | 347 kB |
| `vendor-react-*.js` | 237 kB | 78 kB |
| `vendor-motion-*.js` | 126 kB | 41 kB |
| `_virtual_hds-manifest-*.js` | 220 kB | 37 kB |
| `vendor-radix-*.js` | 35 kB | 12 kB |

---

## Top 3 offending imports (by contribution to main chunk)

1. **three.js stack** (`three`, `@react-three/fiber`, `@react-three/drei`,
   `@react-three/postprocessing`, `postprocessing`) — pulled in eagerly via the
   `HDSLayout → MobiusShellLayer → MobiusLogo → MobiusScene` chain.
   Estimated contribution: ~900 kB raw.

2. **`_virtual_hds-manifest`** — 324 kB JSON inlined as a virtual module at build
   time. Moving to a runtime fetch would eliminate it from the bundle entirely but
   requires an API boundary change. Deferred — marked in roll-out plan.

3. **`token-audit-report.json` + `health-history.json`** — synchronous JSON imports
   in `HDSLayout` (144 kB + 112 kB). These are only consumed by the health dashboard
   sidebar widgets. Deferring to route-level fetch is follow-up work.

---

## Splits applied in this unit

### 1. Lazy-loaded MobiusShellLayer in HDSLayout

**Change:** `MobiusShellLayer` is now loaded via `React.lazy()` + `Suspense`
inside `HDSLayout`. The three.js transitive dependencies move out of the entry chunk.

**Why safe:** The Möbius canvas is a `position: fixed`, `aria-hidden`, decorative
layer. `Suspense fallback={null}` means the shell renders immediately; the canvas
appears ~100-200 ms later after chunk download. No functional route content is gated
on it.

**Constants extraction:** `NAV_MOBIUS_ANCHOR`, `MOBIUS_SCROLL_HIDE_Y`,
`MOBIUS_SCROLL_EASING` were extracted to `MobiusConstants.ts` (no three.js deps)
so `HDSLayout` can import them without pulling in the three.js graph. `MobiusShellLayer`
re-exports them for backward compat.

### 2. Manual chunks for three.js stack and lucide-react

Added to `vite.config.mjs` `build.rollupOptions.output.manualChunks`:

```js
// three.js stack
if (
  id.includes('node_modules/three/') ||
  id.includes('node_modules/@react-three/') ||
  id.includes('node_modules/postprocessing/') ||
  id.includes('node_modules/troika-') ||
  id.includes('node_modules/meshline/')
) {
  return 'vendor-three';
}
// lucide-react
if (id.includes('node_modules/lucide-react/')) {
  return 'vendor-icons';
}
```

`vendor-three` is deferred to after first paint. `vendor-icons` makes icon
tree-shaking cacheable across route chunks.

### 3. Fixed BOM on check-component-docs.mjs

`scripts/check-component-docs.mjs` had a UTF-8 BOM prefix (`EF BB BF`) before the
shebang, causing Node.js ESM to fail parsing. This broke `pnpm build` via the
`sync:health` pre-step. Removed the BOM.

### 4. Fixed encoding corruption in hds-registry.json

`src/app/data/hds-registry.json` had smart-quote characters (`"`) used as JSON
property delimiters (likely pasted from an AI response), plus double-encoded em
dashes. Fixed by byte-replacing all smart quotes and double-encoded sequences, then
re-serialising with `json.dump`.

---

## Post-split sizes (2026-05-01)

| Chunk | Raw | Gzip | Budget |
|---|---|---|---|
| `index-*.js` (main entry) | 319 kB | 67 kB | 75 kB ✓ |
| `vendor-react-*.js` | 237 kB | 78 kB | 86 kB ✓ |
| `vendor-three-*.js` *(lazy)* | 984 kB | 267 kB | 295 kB ✓ |
| `vendor-motion-*.js` | 126 kB | 41 kB | 46 kB ✓ |
| `vendor-icons-*.js` | 24 kB | 5 kB | 6 kB ✓ |
| `_virtual_hds-manifest-*.js` | 220 kB | 37 kB | 41 kB ✓ |

**Main entry reduction: 1,344 kB → 319 kB (-76% raw), 347 kB → 67 kB (-81% gzip)**

---

## Per-budget rationale

| Budget | Rationale |
|---|---|
| main entry 75 kB | P75 mobile network can fetch 75 kB in ~1 s on 3G. Shell renders; canvas arrives async. |
| vendor-react 86 kB | React 18 + router; no tree-shaking possible. Accept this floor. |
| vendor-three 295 kB | Decorative only. Lazy — doesn't block FCP. 267 kB is near three.js minimum for fiber+drei+postprocessing. |
| vendor-motion 46 kB | Motion/react is used across many routes. Splitting further not worth the complexity. |
| vendor-icons 6 kB | Lucide is already tree-shaken. Budget is generous for drift. |
| virtual manifest 41 kB | JSON inlined by vite plugin. Could be runtime-fetched; deferred to follow-up. |

---

## Roll-out plan

| Phase | Action | When |
|---|---|---|
| **Now** | Warn-mode budgets in CI (`continue-on-error: true`) | Active |
| **+2 PRs** | Remove `continue-on-error` — hard-fail CI on budget breach | After baseline confirmed stable |
| **Follow-up** | Move `_virtual_hds-manifest` to runtime fetch via `useEffect` | Unit 12o-perf-manifest-runtime-fetch (proposed) |
| **Follow-up** | Defer `token-audit-report.json` + `health-history.json` to route-level | Unit 12o-perf-json-lazy (proposed) |
| **Separate unit** | FPS/memory budgets for three.js (12o-perf-three-js-budget-per-tier) | Unchanged — different concern |
