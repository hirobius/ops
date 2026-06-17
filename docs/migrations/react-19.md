# React 19 Migration Plan

> **Status:** OPUS-CLASS planning document  
> **Scope:** Full stack upgrade from React 18.3.1 → React 19, including R3F major-version cluster bump.  
> **Last updated:** 2026-05-03

---

## 1. Current State

| Package | Current | Target |
|---------|---------|--------|
| `react` | `18.3.1` | `^19.0.0` |
| `react-dom` | `18.3.1` | `^19.0.0` |
| `@types/react` | `^18.3.0` | `^19.0.0` |
| `@types/react-dom` | `^18.3.0` | `^19.0.0` |
| `@react-three/fiber` | `^8.18.0` | `^9.0.0` |
| `@react-three/drei` | `^9.122.0` | `^10.0.0` |
| `@react-three/postprocessing` | `^2.19.1` | `^3.0.0` |
| `three` | `^0.183.2` | keep (verify compatibility) |

---

## 2. Breaking Changes Inventory

### 2.1 React 19 Breaking Changes

| Change | Risk Level | Present in repo? |
|--------|------------|------------------|
| Removal of `ReactDOM.render` | High | **No** — grep returned zero hits |
| Removal of string refs (`ref="foo"`) | High | **No** — none detected in source |
| Removal of legacy context API (`contextTypes`, `childContextTypes`, `getChildContext`) | High | **No** — only modern `createContext` usage detected |
| `forwardRef` semantics change (ref is now a regular prop) | Medium | **Yes** — 22 source files |
| `useRef` requires argument (no more implicit `undefined`) | Low | Audit required |
| `useDeferredValue` initial value change | Low | Audit required |
| `useId` stable when dehydrated | Low | Audit required |

### 2.2 R3F v9 Breaking Changes

`@react-three/fiber` v9 was built specifically for React 19. Key breaking changes that affect this repo:

| Change | Impact |
|--------|--------|
| React 19 required | Blocks upgrade until React 19 is installed |
| `args` prop behavior tightened | All `<geometry args={[…]} />` must be arrays; no rest-spread flattening |
| `attach` behavior changes | `<color attach="background" args={[color]} />` still supported, but verify lifecycle |
| `ref` forwarding on primitives | R3F v9 now uses React 19 ref-as-prop semantics internally |
| `useFrame` callback signature | Verify no deprecated `state, delta` ordering issues |

### 2.3 drei v10 / postprocessing v3 Breaking Changes

| Change | Impact |
|--------|--------|
| React 19 peer dependency | Must be upgraded together with fiber |
| `Bloom` / `EffectComposer` prop renames | Verify `intensity`, `mipmapBlur`, `luminanceThreshold` still valid |
| `Environment` presets | Verify `preset` string values if used |

---

## 3. Call-Site Inventories

### 3.1 `forwardRef` Call Sites — 22 files

**Component library (21 files):**

1. `src/app/components/Alert.tsx`
2. `src/app/components/ApprovalCard.tsx`
3. `src/app/components/Badge.tsx`
4. `src/app/components/HdsButton.tsx`
5. `src/app/components/HdsButtonGroup.tsx`
6. `src/app/components/Card.tsx`
7. `src/app/components/Controls.tsx`
8. `src/app/components/Dialog.tsx`
9. `src/app/components/Disclosure.tsx`
10. `src/app/components/Grid.tsx`
11. `src/app/components/HeadingStack.tsx`
12. `src/app/components/IconButton.tsx`
13. `src/app/components/Input.tsx`
14. `src/app/components/SegmentedControl.tsx`
15. `src/app/components/Stack.tsx`
16. `src/app/components/HdsSurface.tsx`
17. `src/app/components/Tag.tsx`
18. `src/app/components/Text.tsx`
19. `src/app/components/TextLockup.tsx`
20. `src/app/data/hdsEditorial.tsx`
21. `src/app/lab/shadcn-spike/Button.tsx`

**Tooling scripts (3 files):**

22. `scripts/check-ref-forwarding.mjs`
23. `scripts/generate-system-atlas.mjs`
24. `scripts/promote.mjs`

> **Migration pattern:** Replace `React.forwardRef<T, P>((props, ref) => …)` with `({ ref, ...props }: P & { ref?: React.Ref<T> })` or adopt the new `ComponentProps` pattern. In React 19, `ref` is no longer a hidden second argument; it is passed through `props`. Many call sites can be simplified to plain functions.

### 3.2 R3F Primitive Usage Inventory

**Files using `@react-three/*`:**

- `src/app/components/MobiusLogo.tsx`
- `src/app/components/MobiusScene.tsx`
- `src/app/pages/hds/HDSLayout.tsx`
- `src/app/pages/sketches/LogoLabSketch.tsx`
- `src/app/pages/sketches/ThreeScenePage.tsx`

**Primitives & props detected:**

| Primitive | Props used | Fiber 9 status |
|-----------|-----------|----------------|
| `<Canvas>` | `camera`, `gl`, `onCreated`, `children` | ✅ Supported |
| `<group>` | `ref`, `position`, `rotation`, `scale` | ✅ Supported |
| `<mesh>` | `ref`, `geometry`, `children` | ✅ Supported |
| `<meshStandardMaterial>` | `ref`, `color`, `emissive`, `roughness`, `metalness`, `wireframe` | ✅ Supported |
| `<ambientLight>` | `intensity` | ✅ Supported |
| `<pointLight>` | `position`, `intensity` | ✅ Supported |
| `<color>` | `attach`, `args` | ⚠️ Verify `attach` lifecycle in v9 |
| `<sphereGeometry>` | `args` | ✅ Supported (array required) |
| `<torusGeometry>` | `args` | ✅ Supported (array required) |
| `<EffectComposer>` | `children` | ⚠️ Verify in postprocessing v3 |
| `<Bloom>` | `intensity`, `mipmapBlur`, `luminanceThreshold` | ⚠️ Verify prop names in drei v10 |

**Ref patterns in R3F files:**

All refs are `useRef` hooks (object refs). No string refs, no callback refs passed as strings. R3F v9 explicitly supports React 19 ref-as-prop semantics, so imperative handles on `<mesh>` / `<group>` should continue working.

### 3.3 Legacy API Audit

| API | Count | Files |
|-----|-------|-------|
| `ReactDOM.render` | 0 | — |
| String refs | 0 | — |
| Legacy context (`contextTypes`, etc.) | 0 | — |
| `findDOMNode` | 0 | — |
| `PropTypes` | 0 | — |
| `defaultProps` on function components | 0 | — |

---

## 4. Migration Sequence

Each step is isolated and reversible. **Do not combine steps in a single commit.**

### Step 1 — R3F Cluster Bump
**Unit ID:** `12n-api-react-19-step-1-r3f`

```bash
# Target versions (verify latest at runtime)
pnpm add @react-three/fiber@^9.0.0 @react-three/drei@^10.0.0 @react-three/postprocessing@^3.0.0
```

- **Pre-condition:** repo builds and tests pass on current React 18.
- **Validation:** `pnpm typecheck && pnpm test` must pass.
- **Blast radius:** 5 files (all 3D scenes). No UI component breakage.
- **Rollback:** revert `package.json` + `pnpm-lock.yaml`; one commit.

### Step 2 — Type Definition Bump
**Unit ID:** `12n-api-react-19-step-2-types`

```bash
pnpm add -D @types/react@^19.0.0 @types/react-dom@^19.0.0
```

- **Pre-condition:** Step 1 passed.
- **Validation:** `pnpm typecheck` must pass with zero errors.
- **Blast radius:** All `.tsx` files. Expect errors around `forwardRef`, `React.ReactNode` narrowing, and `JSX.Element` changes.
- **Rollback:** revert `package.json` + `pnpm-lock.yaml`; one commit.

### Step 3 — React + React-DOM Bump
**Unit ID:** `12n-api-react-19-step-3-react`

```bash
pnpm add react@^19.0.0 react-dom@^19.0.0
```

- **Pre-condition:** Step 2 passed.
- **Validation:** `pnpm typecheck && pnpm test && pnpm lint` must pass.
- **Blast radius:** Entire application runtime.
- **Rollback:** revert `package.json` + `pnpm-lock.yaml`; one commit.

### Step 4 — `forwardRef` Call-Site Modernization
**Unit ID:** `12n-api-react-19-step-4-forwardref`

- Update all 22 files listed in §3.1.
- **Pattern A (simple components):** Convert `React.forwardRef` to a plain function that destructures `ref` from props.
- **Pattern B (polymorphic / compound components):** Keep `forwardRef` wrapper if the component is consumed by libraries expecting it, but update the type import to `React.ForwardRefRenderFunction` if needed.
- **Validation:** `pnpm typecheck && pnpm test && pnpm lint` must pass.
- **Blast radius:** Public component API surface (29+ call sites across 22 files).
- **Rollback:** revert the single commit for this step.

### Step 5 — Runtime Audit & E2E Smoke Test
**Unit ID:** `12n-api-react-19-step-5-audit`

- Run full Playwright suite (`test:a11y`, `test:layout`, `test:collision`, `test:responsive`, `test:visual`).
- Verify no console errors related to:
  - `ReactDOM.render is no longer supported`
  - `ref` warnings on DOM elements
  - R3F canvas errors (`Canvas is not a constructor`, etc.)
- **Validation:** All Playwright tests pass; zero new console errors.
- **Rollback:** Not a code change; if failures are found, file follow-up units.

---

## 5. Rollback Decision Tree

```
Did the step's validation command fail?
├── YES → Is the failure localized to a single file?
│   ├── YES → Revert the step commit; fix in isolation; retry.
│   └── NO  → Revert the step commit; escalate to a new OPUS-CLASS plan.
└── NO  → Did CI or Playwright post-merge fail?
    ├── YES → Revert immediately; do not layer fixes on top.
    └── NO  → Step is complete; proceed to next step.
```

**Rollback rules:**
- Each step is exactly **one commit** on `fix/ui-pipeline`.
- If a step fails, revert that commit before attempting a fix. Never leave a broken step in history.
- If `pnpm-lock.yaml` conflicts on revert, regenerate with `pnpm install --frozen-lockfile` from the prior commit's `package.json`.

---

## 6. Blast Radius Summary

| System | Risk | Mitigation |
|--------|------|------------|
| Component library (`src/app/components/*`) | Medium | Step 4 modernization is mechanical; extensive test coverage exists. |
| R3F scenes (`MobiusScene`, `LogoLabSketch`, etc.) | High | Step 1 isolates R3F changes; verify Canvas and EffectComposer in Playwright. |
| Build / Vite / Storybook | Medium | Verify `vite.config.mjs` and `.storybook/main.ts` use `@vitejs/plugin-react` v4+, which supports React 19. |
| Type checker | Low | Step 2 isolates type changes; fix before runtime bump. |
| Playwright E2E | Medium | Step 5 smoke test catches runtime regressions. |
| Token pipeline / scripts | Low | Scripts using React only for JSX compilation (`scripts/hds-jsx-compiler.mjs`) need audit for `jsx-runtime` compatibility. |

---

## 7. Preconditions Before Starting Step 1

- [ ] All CI checks on `fix/ui-pipeline` are green.
- [ ] `pnpm typecheck` passes with zero errors.
- [ ] `pnpm test` passes with zero failures.
- [ ] Playwright baseline snapshots are up-to-date.
- [ ] `CHANGELOG.md` has a pending `Unreleased` section for React 19.

---

## 8. Post-Completion Checklist

- [ ] All 5 steps committed and green.
- [ ] `docs/migrations/react-19.md` updated with final versions and any deviations.
- [ ] `CHANGELOG.md` entry: `### Migrated — React 19 + R3F v9 cluster`.
- [ ] `AGENTS.md` updated if any agent constraints changed (e.g., `forwardRef` patterns).

---

*Plan author: autonomous build unit `12n-api-react-19-migration-path`*  
*Co-Authored-By: Kimi-K2 <noreply@moonshot.ai>*
