# Möbius Logo Lab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a production-quality 3D Möbius logo component in the Vibe Sketchbook, driven by a zustand store and dialed in through a Leva control panel, structured so it promotes to the main shell with zero rewrite.

**Architecture:** A zustand store holds all visual uniforms and 9 route-mapped presets. `MobiusScene` renders the R3F scene (mesh, shader deformation, post-processing, mouse/scroll influence) and reads only from the store. `MobiusLogo` wraps the R3F `<Canvas>` and handles mount-time setup (performance detection, CSS var reads, reduced-motion listener). `LogoLabSketch` is the only file that imports Leva — it syncs Leva controls into the store and resets on unmount.

**Tech Stack:** `@react-three/fiber`, `@react-three/drei`, `@react-three/postprocessing`, `leva`, `zustand`, Three.js (transitive), Vitest (jsdom)

---

## File Map

| File | Status | Responsibility |
|---|---|---|
| `src/app/stores/mobiusStore.ts` | **Create** | Zustand store: uniforms, presets, actions, reducedMotion init |
| `src/app/components/MobiusLogo.tsx` | **Create** | R3F Canvas, camera, mount-time setup, mouse tracking |
| `src/app/components/MobiusScene.tsx` | **Create** | Mesh, shader, post-FX, useFrame loop |
| `src/app/pages/sketches/LogoLabSketch.tsx` | **Create** | Leva panel, preset buttons, Copy Config, SketchbookShell |
| `src/app/routes.tsx` | **Modify** | Add `logo-lab` route under `vibe-sketchbook` |
| `tests/mobiusStore.test.ts` | **Create** | Unit tests: store actions, preset values, reducedMotion |
| `tests/mobiusCurve.test.ts` | **Create** | Unit tests: parametric curve math |

### Dependency direction (enforced — never reverse)
```
LogoLabSketch → MobiusLogo → MobiusScene → mobiusStore
```

---

## Preset Vocabulary

Nine presets. Each maps to a route or context. All defined in the store from day one.

| Key | Route / Context | Geometry concept |
|---|---|---|
| `home` | `/hds` | Full, smooth, glass — resting form |
| `tokens` | `/hds/tokens` | Compression Wave — pinch-swell wave in vertex shader |
| `foundations` | `/hds/color`, `/hds/typography`, etc. | Low-poly facets — structural skeleton exposed |
| `components` | `/hds/components/*` | Attentive, tighter, mouse-responsive |
| `content` | `/microsoft-design-systems`, `/visuals` | Receding ambient — smaller, slower |
| `hirobius` | Hirobius case study page | Prominent, purposeful — see promotion notes |
| `sketchbook` | `/vibe-sketchbook/*` | Store untouched — Leva in full control |
| `glitch` | `/404`, error boundary | Vertex displacement tears the surface |
| `lab` | `/vibe-sketchbook/logo-lab` | Store untouched — Leva in full control |

---

## Notes: Hirobius Case Study Integration

The Hirobius page is about how this design system came to be. The Möbius logo is the most appropriate visual anchor for that story.

**Preset `hirobius`**: Between `home` and `content` in presence. Larger scale than ambient, slower rotation than home, full glass material. The shape is centered and prominent — it's the subject of the page, not a background element.

**Scroll-narrative idea (promotion phase)**: As the user scrolls through the case study sections (Problem → Process → Token Pipeline → Outcome), the Möbius transitions through presets that mirror the narrative:
- Section 1 (Problem / Before): `glitch` or a low-poly `foundations` feel — rough, structural
- Section 2 (Token Pipeline): `tokens` — compression wave, data moving through topology
- Section 3 (Outcome / System): `home` — full, resolved, glass

This would use an IntersectionObserver per section heading, calling `store.setPreset()` as sections scroll into view. Wire this during the promotion-to-shell phase, not in v1.

---

## Task 1 — Install Dependencies

**Files:** `package.json` (modified by pnpm)

- [ ] **Install the five new packages**

```bash
cd "C:\Users\Adrian\Documents\adrian-milsap"
pnpm add @react-three/fiber @react-three/drei @react-three/postprocessing leva zustand
```

- [ ] **Verify Three.js is available as a transitive dep**

```bash
pnpm list three
```

Expected: `three` listed under `@react-three/fiber` dependencies.

- [ ] **Verify TypeScript types resolve**

```bash
pnpm list @types/three
```

`@react-three/fiber` ships its own types; `@types/three` is a peer dep pulled automatically. If missing: `pnpm add -D @types/three`.

- [ ] **Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add r3f, drei, postprocessing, leva, zustand"
```

---

## Task 2 — Zustand Store

**Files:**
- Create: `src/app/stores/mobiusStore.ts`
- Create: `tests/mobiusStore.test.ts`

### Step 1: Write failing tests

- [ ] Create `tests/mobiusStore.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';

// We import the store factory directly so each test gets a fresh instance.
// Do NOT import the singleton `useMobiusStore` here — tests share module state.
import { createMobiusStore, MOBIUS_DEFAULTS, PRESETS } from '@/app/stores/mobiusStore';

describe('mobiusStore', () => {
  let store: ReturnType<typeof createMobiusStore>;

  beforeEach(() => {
    store = createMobiusStore();
  });

  it('initializes with MOBIUS_DEFAULTS', () => {
    const state = store.getState();
    expect(state.tubeRadius).toBe(MOBIUS_DEFAULTS.tubeRadius);
    expect(state.activePreset).toBe('home');
  });

  it('reset() restores MOBIUS_DEFAULTS', () => {
    store.getState().setUniforms({ tubeRadius: 0.001, bloomIntensity: 99 });
    store.getState().reset();
    const state = store.getState();
    expect(state.tubeRadius).toBe(MOBIUS_DEFAULTS.tubeRadius);
    expect(state.bloomIntensity).toBe(MOBIUS_DEFAULTS.bloomIntensity);
  });

  it('setPreset("tokens") applies tokens preset values', () => {
    store.getState().setPreset('tokens');
    const state = store.getState();
    expect(state.activePreset).toBe('tokens');
    expect(state.tubeRadius).toBe(PRESETS.tokens.tubeRadius);
    expect(state.uWaveAmplitude).toBe(PRESETS.tokens.uWaveAmplitude);
  });

  it('setPreset("lab") does not change geometry uniforms', () => {
    store.getState().setUniforms({ tubeRadius: 0.07 });
    store.getState().setPreset('lab');
    expect(store.getState().tubeRadius).toBe(0.07); // unchanged
    expect(store.getState().activePreset).toBe('lab');
  });

  it('setPreset("sketchbook") does not change geometry uniforms', () => {
    store.getState().setUniforms({ tubeRadius: 0.07 });
    store.getState().setPreset('sketchbook');
    expect(store.getState().tubeRadius).toBe(0.07);
    expect(store.getState().activePreset).toBe('sketchbook');
  });

  it('setUniforms merges partial state', () => {
    const original = store.getState().pathRadius;
    store.getState().setUniforms({ tubeRadius: 0.09 });
    expect(store.getState().tubeRadius).toBe(0.09);
    expect(store.getState().pathRadius).toBe(original); // untouched
  });

  it('PRESETS covers all 9 preset keys', () => {
    const keys = ['home', 'tokens', 'foundations', 'components', 'content',
                  'hirobius', 'sketchbook', 'glitch', 'lab'] as const;
    keys.forEach(key => {
      expect(PRESETS).toHaveProperty(key);
    });
  });
});
```

- [ ] **Run tests — expect FAIL** (module doesn't exist yet)

```bash
pnpm vitest run tests/mobiusStore.test.ts
```

Expected: `Error: Cannot find module '@/app/stores/mobiusStore'`

### Step 2: Create the store

- [ ] Create `src/app/stores/mobiusStore.ts`:

```typescript
/**
 * mobiusStore — zustand store for MobiusLogo uniforms and presets.
 *
 * Architecture:
 *   - All visual parameters live here. MobiusScene reads from this store.
 *   - Leva (in LogoLabSketch) writes to this store via setUniforms.
 *   - reset() is called by LogoLabSketch on unmount.
 *   - 'lab' and 'sketchbook' presets do NOT overwrite uniforms — Leva owns them.
 *
 * @sketchbook-canvas
 * Canvas drawing code and shader uniforms here use values intrinsic to the
 * 3D effect. Exempt from check-hardcoded-colors — surrounding UI chrome uses tokens.
 */

import { create } from 'zustand';

// ── Types ─────────────────────────────────────────────────────────────────────

export type PresetKey =
  | 'home' | 'tokens' | 'foundations' | 'components'
  | 'content' | 'hirobius' | 'sketchbook' | 'glitch' | 'lab';

export type PerformanceTier = 'high' | 'medium' | 'low';

export type MobiusUniforms = {
  // Geometry (drives TubeGeometry rebuild via useMemo)
  tubeRadius: number;
  pathRadius: number;
  twistCount: number;
  tubularSegments: number;
  radialSegments: number;

  // Material (updated in place each frame)
  wireframe: boolean;
  transmission: number;
  roughness: number;
  thickness: number;
  metalness: number;
  color: string;

  // Deformation uniforms (GPU-side — no geometry rebuild)
  uWaveAmplitude: number;
  uWaveFrequency: number;
  uWaveSpeed: number;
  uGlitchIntensity: number;

  // Post-processing
  bloomIntensity: number;
  bloomThreshold: number;
  chromaticAberration: number;
  noiseOpacity: number;
  vignetteIntensity: number;

  // Transform / animation
  scale: number;
  rotationSpeed: number;
  mouseInfluence: number;
};

export type MobiusState = MobiusUniforms & {
  activePreset: PresetKey;
  performanceTier: PerformanceTier;
  reducedMotion: boolean;
  setUniforms: (partial: Partial<MobiusUniforms>) => void;
  setPreset: (preset: PresetKey) => void;
  setPerformanceTier: (tier: PerformanceTier) => void;
  reset: () => void;
};

// ── Defaults (mirrors `home` preset) ─────────────────────────────────────────

export const MOBIUS_DEFAULTS: MobiusUniforms = {
  tubeRadius:       0.14,
  pathRadius:       1.0,
  twistCount:       1,
  tubularSegments:  256,
  radialSegments:   12,
  wireframe:        false,
  transmission:     0.90,
  roughness:        0.05,
  thickness:        0.50,
  metalness:        0.10,
  color:            '#1e2efd', // overwritten from CSS var at mount
  uWaveAmplitude:   0.0,
  uWaveFrequency:   3,
  uWaveSpeed:       1.8,
  uGlitchIntensity: 0.0,
  bloomIntensity:   0.40,
  bloomThreshold:   0.10,
  chromaticAberration: 0.001,
  noiseOpacity:     0.03,
  vignetteIntensity: 0.35,
  scale:            1.0,
  rotationSpeed:    0.25,
  mouseInfluence:   0.50,
};

// ── Presets ───────────────────────────────────────────────────────────────────
// 'lab' and 'sketchbook' are intentionally absent from this map.
// setPreset() no-ops for those keys (Leva owns the values).

type PresetOverride = Partial<MobiusUniforms>;

export const PRESETS: Record<PresetKey, PresetOverride> = {
  home: {
    tubeRadius:       0.14,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  256,
    radialSegments:   12,
    wireframe:        false,
    transmission:     0.90,
    roughness:        0.05,
    thickness:        0.50,
    metalness:        0.10,
    uWaveAmplitude:   0.0,
    uGlitchIntensity: 0.0,
    bloomIntensity:   0.40,
    chromaticAberration: 0.001,
    scale:            1.0,
    rotationSpeed:    0.25,
    mouseInfluence:   0.50,
  },

  tokens: {
    tubeRadius:       0.05,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  256,
    radialSegments:   12,
    wireframe:        false,
    transmission:     0.50,
    roughness:        0.30,
    thickness:        0.20,
    metalness:        0.10,
    uWaveAmplitude:   0.70,
    uWaveFrequency:   3,
    uWaveSpeed:       1.80,
    uGlitchIntensity: 0.0,
    bloomIntensity:   0.30,
    chromaticAberration: 0.001,
    scale:            1.0,
    rotationSpeed:    0.60,
    mouseInfluence:   0.40,
  },

  foundations: {
    tubeRadius:       0.09,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  80,
    radialSegments:   6,
    wireframe:        false,
    transmission:     0.10,
    roughness:        0.15,
    thickness:        0.30,
    metalness:        0.85,
    uWaveAmplitude:   0.0,
    uGlitchIntensity: 0.0,
    bloomIntensity:   0.25,
    chromaticAberration: 0.001,
    scale:            1.0,
    rotationSpeed:    0.35,
    mouseInfluence:   0.40,
  },

  components: {
    tubeRadius:       0.10,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  200,
    radialSegments:   10,
    wireframe:        false,
    transmission:     0.75,
    roughness:        0.10,
    thickness:        0.40,
    metalness:        0.10,
    uWaveAmplitude:   0.0,
    uGlitchIntensity: 0.0,
    bloomIntensity:   0.35,
    chromaticAberration: 0.001,
    scale:            1.0,
    rotationSpeed:    0.40,
    mouseInfluence:   0.85,
  },

  content: {
    tubeRadius:       0.06,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  180,
    radialSegments:   10,
    wireframe:        false,
    transmission:     0.60,
    roughness:        0.20,
    thickness:        0.30,
    metalness:        0.10,
    uWaveAmplitude:   0.0,
    uGlitchIntensity: 0.0,
    bloomIntensity:   0.20,
    chromaticAberration: 0.001,
    scale:            0.65,
    rotationSpeed:    0.12,
    mouseInfluence:   0.25,
  },

  // The Hirobius case study page — the shape is the subject of the page.
  // Prominent, purposeful, full glass. Larger than ambient but not
  // as aggressive as home. Scroll-linked preset switching (glitch →
  // tokens → home) is a promotion-phase addition, wired via
  // IntersectionObserver on section headings.
  hirobius: {
    tubeRadius:       0.12,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  256,
    radialSegments:   12,
    wireframe:        false,
    transmission:     0.85,
    roughness:        0.08,
    thickness:        0.45,
    metalness:        0.10,
    uWaveAmplitude:   0.0,
    uGlitchIntensity: 0.0,
    bloomIntensity:   0.40,
    chromaticAberration: 0.0015,
    scale:            1.15,
    rotationSpeed:    0.20,
    mouseInfluence:   0.60,
  },

  glitch: {
    tubeRadius:       0.09,
    pathRadius:       1.0,
    twistCount:       1,
    tubularSegments:  120,
    radialSegments:   5,
    wireframe:        false,
    transmission:     0.30,
    roughness:        0.50,
    thickness:        0.20,
    metalness:        0.20,
    uWaveAmplitude:   0.0,
    uGlitchIntensity: 0.60,
    bloomIntensity:   0.50,
    chromaticAberration: 0.004,
    scale:            1.0,
    rotationSpeed:    6.0,
    mouseInfluence:   0.10,
  },

  // No-op presets — Leva owns the state for these.
  sketchbook: {},
  lab: {},
};

// ── Store factory (exported for testing) ─────────────────────────────────────

export function createMobiusStore() {
  const reducedMotion =
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return create<MobiusState>()((set) => ({
    ...MOBIUS_DEFAULTS,
    activePreset:    'home',
    performanceTier: 'high',
    reducedMotion,

    setUniforms: (partial) => set((s) => ({ ...s, ...partial })),

    setPreset: (preset) => {
      // 'lab' and 'sketchbook' are no-ops — Leva owns those values.
      if (preset === 'lab' || preset === 'sketchbook') {
        set({ activePreset: preset });
        return;
      }
      set((s) => ({ ...s, ...PRESETS[preset], activePreset: preset }));
    },

    setPerformanceTier: (tier) => set({ performanceTier: tier }),

    reset: () => set((s) => ({ ...s, ...MOBIUS_DEFAULTS, activePreset: 'home' })),
  }));
}

// ── Singleton (used by all app code) ─────────────────────────────────────────

export const useMobiusStore = createMobiusStore();
```

### Step 3: Run tests — expect PASS

- [ ] Run:

```bash
pnpm vitest run tests/mobiusStore.test.ts
```

Expected: all 7 tests pass.

### Step 4: Commit

```bash
git add src/app/stores/mobiusStore.ts tests/mobiusStore.test.ts
git commit -m "feat(mobius): zustand store with 9 presets and reducedMotion init"
```

---

## Task 3 — Möbius Parametric Curve

**Files:**
- Create: `src/app/stores/mobiusCurve.ts`
- Create: `tests/mobiusCurve.test.ts`

### Step 1: Write failing tests

- [ ] Create `tests/mobiusCurve.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { MobiusCurve } from '@/app/stores/mobiusCurve';

describe('MobiusCurve', () => {
  it('is a THREE.Curve subclass', () => {
    const curve = new MobiusCurve(1.0, 0.14, 1);
    expect(curve).toBeInstanceOf(THREE.Curve);
  });

  it('getPoint(0) and getPoint(1) are the same point (closed curve)', () => {
    const curve = new MobiusCurve(1.0, 0.14, 1);
    const p0 = curve.getPoint(0);
    const p1 = curve.getPoint(1);
    expect(p0.distanceTo(p1)).toBeLessThan(0.001);
  });

  it('getPoint(0.5) is on the opposite side of the ring', () => {
    const curve = new MobiusCurve(1.0, 0.14, 1);
    const p0 = curve.getPoint(0);
    const p05 = curve.getPoint(0.5);
    // At t=0: x ≈ R + r, y ≈ 0. At t=0.5: x ≈ -(R + r·cos(π/2)), y ≈ 0.
    // The x-coords should have opposite signs.
    expect(p0.x).toBeGreaterThan(0);
    expect(p05.x).toBeLessThan(0);
  });

  it('pathRadius scales the ring diameter', () => {
    const small = new MobiusCurve(0.5, 0.1, 1).getPoint(0);
    const large = new MobiusCurve(2.0, 0.1, 1).getPoint(0);
    expect(large.x).toBeGreaterThan(small.x);
  });
});
```

- [ ] **Run tests — expect FAIL**

```bash
pnpm vitest run tests/mobiusCurve.test.ts
```

Expected: `Cannot find module '@/app/stores/mobiusCurve'`

### Step 2: Create the curve

- [ ] Create `src/app/stores/mobiusCurve.ts`:

```typescript
/**
 * MobiusCurve — THREE.Curve subclass implementing the Möbius parametric equations.
 *
 * Parametric form (t ∈ [0, 1], mapped to [0, 2π]):
 *   angle = t * 2π
 *   x(t) = (R + r·cos(twistCount·angle/2)) · cos(angle)
 *   y(t) = (R + r·cos(twistCount·angle/2)) · sin(angle)
 *   z(t) = r·sin(twistCount·angle/2)
 *
 * R = pathRadius (ring size), r = tubeRadius (tube fatness)
 * twistCount = 1 → classic single-twist Möbius
 * twistCount = 2 → double twist (torus knot aesthetic)
 *
 * Used as the path argument to THREE.TubeGeometry.
 */

import * as THREE from 'three';

export class MobiusCurve extends THREE.Curve<THREE.Vector3> {
  constructor(
    private pathRadius: number,
    private tubeRadius: number,
    private twistCount: number,
  ) {
    super();
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const angle = t * Math.PI * 2;
    const halfTwist = (this.twistCount * angle) / 2;

    const x = (this.pathRadius + this.tubeRadius * Math.cos(halfTwist)) * Math.cos(angle);
    const y = (this.pathRadius + this.tubeRadius * Math.cos(halfTwist)) * Math.sin(angle);
    const z = this.tubeRadius * Math.sin(halfTwist);

    return target.set(x, y, z);
  }
}
```

### Step 3: Run tests — expect PASS

- [ ] Run:

```bash
pnpm vitest run tests/mobiusCurve.test.ts
```

Expected: all 4 tests pass.

### Step 4: Commit

```bash
git add src/app/stores/mobiusCurve.ts tests/mobiusCurve.test.ts
git commit -m "feat(mobius): MobiusCurve THREE.Curve subclass with parametric equations"
```

---

## Task 4 — MobiusScene: Basic Mesh

Get something visible before adding shaders and effects. Glass material + idle rotation + OrbitControls.

**Files:**
- Create: `src/app/components/MobiusScene.tsx`

- [ ] **Create `src/app/components/MobiusScene.tsx`** with basic mesh:

```tsx
/**
 * MobiusScene — R3F scene internals for the Möbius logo.
 *
 * Rendered inside MobiusLogo's <Canvas>. Reads all visual parameters
 * from useMobiusStore. Never imports Leva.
 *
 * @sketchbook-canvas
 * Shader uniforms and procedural geometry values are intrinsic to the 3D
 * effect and not mappable to design tokens. Exempt from check-hardcoded-colors.
 * The surrounding UI chrome in LogoLabSketch uses tokens normally.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { OrbitControls, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { MobiusCurve } from '@/app/stores/mobiusCurve';
import { useMobiusStore } from '@/app/stores/mobiusStore';

// ── Möbius Mesh ───────────────────────────────────────────────────────────────

function MobiusMesh() {
  const meshRef = useRef<THREE.Mesh>(null);

  // Read geometry params from store
  const tubeRadius     = useMobiusStore((s) => s.tubeRadius);
  const pathRadius     = useMobiusStore((s) => s.pathRadius);
  const twistCount     = useMobiusStore((s) => s.twistCount);
  const tubularSegments = useMobiusStore((s) => s.tubularSegments);
  const radialSegments  = useMobiusStore((s) => s.radialSegments);

  // Read material params
  const wireframe    = useMobiusStore((s) => s.wireframe);
  const transmission = useMobiusStore((s) => s.transmission);
  const roughness    = useMobiusStore((s) => s.roughness);
  const thickness    = useMobiusStore((s) => s.thickness);
  const metalness    = useMobiusStore((s) => s.metalness);
  const color        = useMobiusStore((s) => s.color);

  // Read animation params
  const rotationSpeed  = useMobiusStore((s) => s.rotationSpeed);
  const scale          = useMobiusStore((s) => s.scale);
  const reducedMotion  = useMobiusStore((s) => s.reducedMotion);

  // Rebuild geometry only when geometry params change
  const geometry = useMemo(() => {
    const curve = new MobiusCurve(pathRadius, tubeRadius, twistCount);
    return new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);
  }, [pathRadius, tubeRadius, twistCount, tubularSegments, radialSegments]);

  // Idle rotation
  useFrame((_, delta) => {
    if (!meshRef.current || reducedMotion) return;
    meshRef.current.rotation.y += rotationSpeed * delta;
  });

  return (
    <mesh ref={meshRef} scale={scale} geometry={geometry}>
      <meshPhysicalMaterial
        wireframe={wireframe}
        transmission={transmission}
        roughness={roughness}
        thickness={thickness}
        metalness={metalness}
        color={color}
        transparent
        side={THREE.DoubleSide}
        envMapIntensity={1.2}
      />
    </mesh>
  );
}

// ── Scene ─────────────────────────────────────────────────────────────────────

export function MobiusScene() {
  const bloomIntensity       = useMobiusStore((s) => s.bloomIntensity);
  const bloomThreshold       = useMobiusStore((s) => s.bloomThreshold);
  const chromaticAberration  = useMobiusStore((s) => s.chromaticAberration);
  const noiseOpacity         = useMobiusStore((s) => s.noiseOpacity);
  const vignetteIntensity    = useMobiusStore((s) => s.vignetteIntensity);
  const performanceTier      = useMobiusStore((s) => s.performanceTier);
  const reducedMotion        = useMobiusStore((s) => s.reducedMotion);

  // Effective post-FX values — zeroed when reducedMotion
  const effectiveBloom = reducedMotion ? 0 : bloomIntensity;
  const effectiveCA    = reducedMotion ? 0 : chromaticAberration;
  const effectiveNoise = reducedMotion ? 0 : noiseOpacity;

  return (
    <>
      <Environment preset="city" />
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 5, 5]} intensity={0.8} />
      <OrbitControls enablePan={false} enableZoom={false} />
      <MobiusMesh />
      {performanceTier !== 'low' && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={bloomThreshold}
            intensity={effectiveBloom}
            blendFunction={BlendFunction.ADD}
          />
          {performanceTier === 'high' && (
            <>
              <ChromaticAberration
                offset={new THREE.Vector2(effectiveCA, effectiveCA)}
                blendFunction={BlendFunction.NORMAL}
              />
              <Noise opacity={effectiveNoise} blendFunction={BlendFunction.OVERLAY} />
              <Vignette offset={0.3} darkness={vignetteIntensity} blendFunction={BlendFunction.NORMAL} />
            </>
          )}
        </EffectComposer>
      )}
    </>
  );
}
```

- [ ] **Commit**

```bash
git add src/app/components/MobiusScene.tsx
git commit -m "feat(mobius): MobiusScene basic mesh with physical material and post-FX"
```

---

## Task 5 — MobiusLogo: Canvas Wrapper

**Files:**
- Create: `src/app/components/MobiusLogo.tsx`

- [ ] **Create `src/app/components/MobiusLogo.tsx`**:

```tsx
/**
 * MobiusLogo — production R3F Canvas wrapper.
 *
 * Responsibilities (mount-time only):
 *   1. Auto-detect performance tier from navigator.hardwareConcurrency
 *   2. Read brand color from --semantic-color-surface-accent CSS var
 *   3. Read lerp duration from --hds-motion-expressive-duration CSS var
 *   4. Subscribe to prefers-reduced-motion media query
 *   5. Track mouse position for MobiusScene's magnetic influence
 *
 * MobiusScene is responsible for the frame loop and all rendering.
 * This file never imports Leva.
 */

import { useEffect, useRef, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import { MobiusScene } from './mobius-scene';
import { useMobiusStore } from '@/app/stores/mobiusStore';
import type { PerformanceTier } from '@/app/stores/mobiusStore';

// ── CSS var helpers ───────────────────────────────────────────────────────────

function readCssVar(varName: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function detectPerformanceTier(): PerformanceTier {
  const cores = navigator.hardwareConcurrency ?? 4;
  if (cores >= 8) return 'high';
  if (cores >= 4) return 'medium';
  return 'low';
}

// ── Component ─────────────────────────────────────────────────────────────────

type MobiusLogoProps = {
  style?: React.CSSProperties;
  className?: string;
};

export function MobiusLogo({ style, className }: MobiusLogoProps) {
  const setUniforms        = useMobiusStore((s) => s.setUniforms);
  const setPerformanceTier = useMobiusStore((s) => s.setPerformanceTier);
  const containerRef       = useRef<HTMLDivElement>(null);

  // ── Mount-time setup ─────────────────────────────────────────────────────

  useEffect(() => {
    // 1. Performance tier
    setPerformanceTier(detectPerformanceTier());

    // 2. Brand color from token cascade
    const color = readCssVar('--semantic-color-surface-accent') || '#1e2efd';
    setUniforms({ color });

    // 3. Reduced motion — initialize + live listener
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMqChange = (e: MediaQueryListEvent) => {
      useMobiusStore.setState({ reducedMotion: e.matches });
    };
    useMobiusStore.setState({ reducedMotion: mq.matches });
    mq.addEventListener('change', handleMqChange);

    return () => mq.removeEventListener('change', handleMqChange);
  }, [setUniforms, setPerformanceTier]);

  // ── Mouse tracking ────────────────────────────────────────────────────────
  // Normalized [-1, 1] mouse position stored in a ref on the store.
  // MobiusScene reads it each frame. We don't store it in zustand state
  // because that would cause per-move re-renders.

  const mouseRef = useRef({ x: 0, y: 0 });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  }, []);

  // ── Motion token lerp duration ────────────────────────────────────────────
  // Reads --hds-motion-expressive-duration at mount. The exponential lerp
  // factor derived from this value governs how fast presets morph — the same
  // token that controls sidebar and button transitions.
  const lerpDurationRef = useRef(0.35);

  useEffect(() => {
    const raw = readCssVar('--hds-motion-expressive-duration');
    // Value may be "0.3s", "300ms", or bare "0.3" — parseFloat handles all three.
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      // Convert ms to seconds if the value is > 2 (heuristic: tokens use ms)
      lerpDurationRef.current = parsed > 2 ? parsed / 1000 : parsed;
    }
  }, []);

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      style={{ width: '100%', height: '100%', ...style }}
      className={className}
    >
      <Canvas
        camera={{ position: [0, 0, 3.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <MobiusScene mouseRef={mouseRef} lerpDurationRef={lerpDurationRef} />
      </Canvas>
    </div>
  );
}
```

- [ ] **Update `MobiusScene` to accept `mouseRef` and `lerpDurationRef`, and add scroll-linked rotation**

In `src/app/components/MobiusScene.tsx`, update the signatures and add scroll impulse tracking:

```tsx
// Add to top of file imports:
import type { MutableRefObject } from 'react';

// Updated prop types:
type MouseRef = MutableRefObject<{ x: number; y: number }>;
type LerpDurationRef = MutableRefObject<number>;

function MobiusMesh({
  mouseRef,
  lerpDurationRef,
}: {
  mouseRef: MouseRef;
  lerpDurationRef: LerpDurationRef;
}) {
  // ... existing refs ...
  const mouseInfluence    = useMobiusStore((s) => s.mouseInfluence);
  const scrollImpulseRef  = useRef(0); // Z-axis impulse from scroll, decays each frame

  // Scroll-linked rotation — listen on window, feed impulse into useFrame
  useEffect(() => {
    let lastScrollY = window.scrollY;
    const handleScroll = () => {
      const delta = window.scrollY - lastScrollY;
      lastScrollY = window.scrollY;
      scrollImpulseRef.current += delta * 0.002; // scale to radians
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // Exponential lerp factor derived from motion token duration
    const lerpFactor = reducedMotion
      ? 1.0
      : 1 - Math.exp(-delta / lerpDurationRef.current);

    if (!reducedMotion) {
      meshRef.current.rotation.y += rotationSpeed * delta;

      // Scroll impulse — Z-axis roll, decays toward zero
      meshRef.current.rotation.z += scrollImpulseRef.current;
      scrollImpulseRef.current  *= 0.88; // decay

      // Magnetic mouse pull — uses motion-token lerp factor
      const targetX = mouseRef.current.x * mouseInfluence * 0.4;
      const targetY = mouseRef.current.y * mouseInfluence * 0.2;
      meshRef.current.position.x += (targetX - meshRef.current.position.x) * lerpFactor;
      meshRef.current.position.y += (targetY - meshRef.current.position.y) * lerpFactor;
      meshRef.current.rotation.x += (
        mouseRef.current.y * mouseInfluence * 0.3 - meshRef.current.rotation.x
      ) * lerpFactor;
    }
  });

  // ... rest of JSX unchanged ...
}

// Update MobiusScene signature:
export function MobiusScene({
  mouseRef,
  lerpDurationRef,
}: {
  mouseRef: MouseRef;
  lerpDurationRef: LerpDurationRef;
}) {
  return (
    <>
      {/* ... */}
      <MobiusMesh mouseRef={mouseRef} lerpDurationRef={lerpDurationRef} />
      {/* ... */}
    </>
  );
}
```

- [ ] **Commit**

```bash
git add src/app/components/MobiusLogo.tsx src/app/components/MobiusScene.tsx
git commit -m "feat(mobius): MobiusLogo Canvas wrapper with performance detection and mouse tracking"
```

---

## Task 6 — Vertex Shader Deformation (Wave + Glitch)

Add the `onBeforeCompile` hook to `meshPhysicalMaterial` for compression wave and glitch vertex displacement. Both effects share one shader injection.

**Files:**
- Modify: `src/app/components/MobiusScene.tsx`

- [ ] **Replace the `<meshPhysicalMaterial>` JSX in `MobiusMesh` with a ref-based approach**

Replace the entire `MobiusMesh` function body with the version below. The key change: `meshPhysicalMaterial` becomes a `useRef<THREE.MeshPhysicalMaterial>` with `onBeforeCompile`:

```tsx
function MobiusMesh({ mouseRef }: { mouseRef: MouseRef }) {
  const meshRef     = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshPhysicalMaterial>(null);
  const shaderRef   = useRef<THREE.WebGLProgramParametersWithUniforms | null>(null);

  const tubeRadius      = useMobiusStore((s) => s.tubeRadius);
  const pathRadius      = useMobiusStore((s) => s.pathRadius);
  const twistCount      = useMobiusStore((s) => s.twistCount);
  const tubularSegments = useMobiusStore((s) => s.tubularSegments);
  const radialSegments  = useMobiusStore((s) => s.radialSegments);
  const wireframe       = useMobiusStore((s) => s.wireframe);
  const transmission    = useMobiusStore((s) => s.transmission);
  const roughness       = useMobiusStore((s) => s.roughness);
  const thickness       = useMobiusStore((s) => s.thickness);
  const metalness       = useMobiusStore((s) => s.metalness);
  const color           = useMobiusStore((s) => s.color);
  const rotationSpeed   = useMobiusStore((s) => s.rotationSpeed);
  const scale           = useMobiusStore((s) => s.scale);
  const mouseInfluence  = useMobiusStore((s) => s.mouseInfluence);
  const reducedMotion   = useMobiusStore((s) => s.reducedMotion);

  const geometry = useMemo(() => {
    const curve = new MobiusCurve(pathRadius, tubeRadius, twistCount);
    return new THREE.TubeGeometry(curve, tubularSegments, tubeRadius, radialSegments, true);
  }, [pathRadius, tubeRadius, twistCount, tubularSegments, radialSegments]);

  // onBeforeCompile injects wave + glitch uniforms into the PBR vertex shader.
  // Called by Three.js once when the material compiles. We keep the shader
  // reference in shaderRef so useFrame can update uniform values each tick.
  const onBeforeCompile = useCallback((shader: THREE.WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uTime           = { value: 0 };
    shader.uniforms.uWaveAmplitude  = { value: 0 };
    shader.uniforms.uWaveFrequency  = { value: 3 };
    shader.uniforms.uWaveSpeed      = { value: 1.8 };
    shader.uniforms.uGlitchIntensity = { value: 0 };

    // Inject helper functions after #include <common>
    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `#include <common>

uniform float uTime;
uniform float uWaveAmplitude;
uniform float uWaveFrequency;
uniform float uWaveSpeed;
uniform float uGlitchIntensity;

// Compression wave: pinches the tube cross-section sinusoidally along path.
// uv.x is the normalized position along the tube length (0→1).
float mobius_wave(float pathPos) {
  float s = sin(uWaveFrequency * pathPos * 6.2831853 + uTime * uWaveSpeed);
  return uWaveAmplitude * s * s;
}

// Pseudo-random hash for glitch vertex displacement.
vec3 mobius_hash(vec3 p) {
  p = fract(p * vec3(443.8975, 397.2973, 491.1871));
  p += dot(p.zxy, p.yxz + 19.19);
  return fract(vec3(p.x * p.y, p.y * p.z, p.z * p.x));
}`,
    );

    // Apply deformations after #include <begin_vertex> (where 'transformed' exists)
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>

// Wave: pull vertex inward along surface normal
if (uWaveAmplitude > 0.0) {
  float pinch = mobius_wave(uv.x);
  transformed -= objectNormal * pinch;
}

// Glitch: pseudo-random per-vertex displacement
if (uGlitchIntensity > 0.0) {
  vec3 noise = mobius_hash(position + floor(uTime * 8.0) * 0.1);
  transformed += (noise - 0.5) * uGlitchIntensity * 0.12;
}`,
    );

    shaderRef.current = shader;
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    // Idle rotation + mouse influence
    if (!reducedMotion) {
      meshRef.current.rotation.y += rotationSpeed * delta;

      const targetX = mouseRef.current.x * mouseInfluence * 0.4;
      const targetY = mouseRef.current.y * mouseInfluence * 0.2;
      meshRef.current.position.x += (targetX - meshRef.current.position.x) * 0.06;
      meshRef.current.position.y += (targetY - meshRef.current.position.y) * 0.06;
      meshRef.current.rotation.x += (
        mouseRef.current.y * mouseInfluence * 0.3 - meshRef.current.rotation.x
      ) * 0.06;
    }

    // Update shader uniforms each frame
    if (shaderRef.current) {
      shaderRef.current.uniforms.uTime.value += delta;
      shaderRef.current.uniforms.uWaveAmplitude.value  = useMobiusStore.getState().uWaveAmplitude;
      shaderRef.current.uniforms.uWaveFrequency.value  = useMobiusStore.getState().uWaveFrequency;
      shaderRef.current.uniforms.uWaveSpeed.value      = useMobiusStore.getState().uWaveSpeed;
      shaderRef.current.uniforms.uGlitchIntensity.value = useMobiusStore.getState().uGlitchIntensity;
    }
  });

  return (
    <mesh ref={meshRef} scale={scale} geometry={geometry}>
      <meshPhysicalMaterial
        ref={materialRef}
        wireframe={wireframe}
        transmission={transmission}
        roughness={roughness}
        thickness={thickness}
        metalness={metalness}
        color={color}
        transparent
        side={THREE.DoubleSide}
        envMapIntensity={1.2}
        onBeforeCompile={onBeforeCompile}
        customProgramCacheKey={() => 'mobius-deform-v1'}
      />
    </mesh>
  );
}
```

Note: `customProgramCacheKey` is required when using `onBeforeCompile` so Three.js knows this material is distinct from stock `MeshPhysicalMaterial`.

- [ ] **Commit**

```bash
git add src/app/components/MobiusScene.tsx
git commit -m "feat(mobius): vertex shader wave compression and glitch displacement via onBeforeCompile"
```

---

## Task 7 — LogoLabSketch: Leva Panel

**Files:**
- Create: `src/app/pages/sketches/LogoLabSketch.tsx`

- [ ] **Create `src/app/pages/sketches/LogoLabSketch.tsx`**:

```tsx
/**
 * LogoLabSketch — /vibe-sketchbook/logo-lab
 *
 * The only file in the app that imports Leva. Wraps MobiusLogo in
 * SketchbookShell and provides a full parameter panel for real-time tuning.
 *
 * On unmount (navigating away), resets mobiusStore to MOBIUS_DEFAULTS so
 * other routes see the clean home preset.
 *
 * Copy Config: serializes all visual uniforms to JSON and copies to clipboard.
 * Paste the output directly as a new entry in PRESETS in mobiusStore.ts.
 */

import { useEffect, useCallback } from 'react';
import { useControls, button, folder, Leva } from 'leva';
import { SketchbookShell } from './SketchbookShell';
import { MobiusLogo } from '@/app/components/mobius-logo';
import { useMobiusStore, MOBIUS_DEFAULTS, type MobiusUniforms } from '@/app/stores/mobiusStore';

// ── Copy Config helper ────────────────────────────────────────────────────────

function copyConfigToClipboard() {
  const state = useMobiusStore.getState();
  const keys = Object.keys(MOBIUS_DEFAULTS) as (keyof MobiusUniforms)[];
  const config: Partial<MobiusUniforms> = {};
  keys.forEach((k) => { (config as Record<string, unknown>)[k] = state[k]; });
  navigator.clipboard.writeText(JSON.stringify(config, null, 2));
}

// ── Controls ──────────────────────────────────────────────────────────────────

function useMobiusControls() {
  const setUniforms        = useMobiusStore((s) => s.setUniforms);
  const setPreset          = useMobiusStore((s) => s.setPreset);
  const setPerformanceTier = useMobiusStore((s) => s.setPerformanceTier);
  const reducedMotion      = useMobiusStore((s) => s.reducedMotion);

  useControls({
    '── Presets': folder({
      Home:        button(() => setPreset('home')),
      Tokens:      button(() => setPreset('tokens')),
      Foundations: button(() => setPreset('foundations')),
      Components:  button(() => setPreset('components')),
      Content:     button(() => setPreset('content')),
      Hirobius:    button(() => setPreset('hirobius')),
      Glitch:      button(() => setPreset('glitch')),
    }, { collapsed: false }),

    '── Geometry': folder({
      tubeRadius:      { value: MOBIUS_DEFAULTS.tubeRadius,      min: 0.01,  max: 0.20,  step: 0.001, onChange: (v) => setUniforms({ tubeRadius: v }) },
      pathRadius:      { value: MOBIUS_DEFAULTS.pathRadius,      min: 0.4,   max: 2.0,   step: 0.01,  onChange: (v) => setUniforms({ pathRadius: v }) },
      twistCount:      { value: MOBIUS_DEFAULTS.twistCount,      min: 1,     max: 4,     step: 1,     onChange: (v) => setUniforms({ twistCount: v }) },
      tubularSegments: { value: MOBIUS_DEFAULTS.tubularSegments, min: 64,    max: 512,   step: 16,    onChange: (v) => setUniforms({ tubularSegments: v }) },
      radialSegments:  { value: MOBIUS_DEFAULTS.radialSegments,  min: 4,     max: 24,    step: 1,     onChange: (v) => setUniforms({ radialSegments: v }) },
    }, { collapsed: false }),

    '── Material': folder({
      wireframe:    { value: MOBIUS_DEFAULTS.wireframe,    onChange: (v) => setUniforms({ wireframe: v }) },
      transmission: { value: MOBIUS_DEFAULTS.transmission, min: 0, max: 1, step: 0.01, onChange: (v) => setUniforms({ transmission: v }) },
      roughness:    { value: MOBIUS_DEFAULTS.roughness,    min: 0, max: 1, step: 0.01, onChange: (v) => setUniforms({ roughness: v }) },
      thickness:    { value: MOBIUS_DEFAULTS.thickness,    min: 0, max: 2, step: 0.01, onChange: (v) => setUniforms({ thickness: v }) },
      metalness:    { value: MOBIUS_DEFAULTS.metalness,    min: 0, max: 1, step: 0.01, onChange: (v) => setUniforms({ metalness: v }) },
    }, { collapsed: true }),

    '── Deformation': folder({
      uWaveAmplitude:   { value: MOBIUS_DEFAULTS.uWaveAmplitude,   min: 0, max: 0.8, step: 0.01, onChange: (v) => setUniforms({ uWaveAmplitude: v }) },
      uWaveFrequency:   { value: MOBIUS_DEFAULTS.uWaveFrequency,   min: 1, max: 8,   step: 1,    onChange: (v) => setUniforms({ uWaveFrequency: v }) },
      uWaveSpeed:       { value: MOBIUS_DEFAULTS.uWaveSpeed,       min: 0, max: 4,   step: 0.1,  onChange: (v) => setUniforms({ uWaveSpeed: v }) },
      uGlitchIntensity: { value: MOBIUS_DEFAULTS.uGlitchIntensity, min: 0, max: 1,   step: 0.01, onChange: (v) => setUniforms({ uGlitchIntensity: v }) },
    }, { collapsed: true }),

    '── Post-FX': folder({
      bloomIntensity:      { value: MOBIUS_DEFAULTS.bloomIntensity,      min: 0, max: 0.5,   step: 0.01,   onChange: (v) => setUniforms({ bloomIntensity: v }) },
      bloomThreshold:      { value: MOBIUS_DEFAULTS.bloomThreshold,      min: 0, max: 1,     step: 0.01,   onChange: (v) => setUniforms({ bloomThreshold: v }) },
      chromaticAberration: { value: MOBIUS_DEFAULTS.chromaticAberration, min: 0, max: 0.003, step: 0.0001, onChange: (v) => setUniforms({ chromaticAberration: v }) },
      noiseOpacity:        { value: MOBIUS_DEFAULTS.noiseOpacity,        min: 0, max: 0.06,  step: 0.001,  onChange: (v) => setUniforms({ noiseOpacity: v }) },
      vignetteIntensity:   { value: MOBIUS_DEFAULTS.vignetteIntensity,   min: 0, max: 0.8,   step: 0.01,   onChange: (v) => setUniforms({ vignetteIntensity: v }) },
    }, { collapsed: true }),

    '── Transform': folder({
      scale:          { value: MOBIUS_DEFAULTS.scale,          min: 0.3, max: 2.0, step: 0.01, onChange: (v) => setUniforms({ scale: v }) },
      rotationSpeed:  { value: MOBIUS_DEFAULTS.rotationSpeed,  min: 0,   max: 8.0, step: 0.05, onChange: (v) => setUniforms({ rotationSpeed: v }) },
      mouseInfluence: { value: MOBIUS_DEFAULTS.mouseInfluence, min: 0,   max: 1.0, step: 0.01, onChange: (v) => setUniforms({ mouseInfluence: v }) },
    }, { collapsed: true }),

    '── System': folder({
      performanceTier: {
        value: 'high',
        options: { High: 'high', Medium: 'medium', Low: 'low' } as const,
        onChange: (v: string) => setPerformanceTier(v as PerformanceTier),
      },
      'reducedMotion (OS)': { value: reducedMotion, disabled: true },
    }, { collapsed: true }),

    'Copy Config': button(copyConfigToClipboard),
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function LogoLabSketch() {
  const reset = useMobiusStore((s) => s.reset);

  // Reset store on unmount — other routes see clean home preset
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // Wire Leva controls to store
  useMobiusControls();

  return (
    <SketchbookShell
      slug="logo-lab"
      title="Logo Lab"
      description="Real-time parameter explorer for the Hirobius Möbius logo. Dial in values, copy the config, paste into mobiusStore presets."
      tech={['@react-three/fiber', '@react-three/drei', '@react-three/postprocessing', 'leva', 'zustand']}
    >
      {/* Leva panel renders in its own fixed overlay — no DOM positioning needed */}
      <Leva collapsed={false} titleBar={{ title: 'Möbius Controls', drag: true }} />
      <div style={{ width: '100%', height: '100%', minHeight: 0 }}>
        <MobiusLogo style={{ width: '100%', height: '100%' }} />
      </div>
    </SketchbookShell>
  );
}
```

- [ ] **Commit**

```bash
git add src/app/pages/sketches/LogoLabSketch.tsx
git commit -m "feat(mobius): LogoLabSketch Leva panel with preset buttons and Copy Config"
```

---

## Task 8 — Route Registration

**Files:**
- Modify: `src/app/routes.tsx`

- [ ] **Check if Codex already added the logo-lab route**

```bash
grep "logo-lab" src/app/routes.tsx
```

If the route already exists, skip to the commit step and verify it matches the expected shape.

- [ ] **If missing, add the route** — in `src/app/routes.tsx`, find the `vibe-sketchbook` children array and add:

```diff
// At the top of the file, add the lazy import:
+const LogoLabSketch = lazy(() => import('./pages/sketches/LogoLabSketch'));

// Inside the vibe-sketchbook children:
 { index: true, element: <Navigate to="/vibe-sketchbook/cloth-simulation" replace /> },
 { path: 'cloth-simulation', element: <LazySketch Page={ImportedSketchRoute} /> },
+{ path: 'logo-lab', element: <LazySketch Page={LogoLabSketch} /> },
 { path: ':slug', element: <LazySketch Page={ImportedSketchRoute} /> },
```

Important: `logo-lab` must come **before** the `:slug` catch-all, otherwise the slug route intercepts it.

- [ ] **Commit**

```bash
git add src/app/routes.tsx
git commit -m "feat(mobius): add /vibe-sketchbook/logo-lab route"
```

---

## Task 9 — Quality Gate

- [ ] **Run the full check suite**

```bash
pnpm check:fast
```

The new files use the `@sketchbook-canvas` exemption comment so hardcoded-color and inline-style checks should pass. If they flag the new files:

- For color violations: add `// color-ok: shader uniform, not a design token` inline
- For spacing violations: add `// spacing-ok: canvas container, not a UI component` inline

- [ ] **Run unit tests**

```bash
pnpm vitest run tests/mobiusStore.test.ts tests/mobiusCurve.test.ts
```

Expected: all 11 tests pass.

- [ ] **Manual smoke test** — navigate to `/vibe-sketchbook/logo-lab` in dev

```bash
pnpm dev
```

Verify:
- [ ] Möbius ring renders and rotates
- [ ] Leva panel appears, sliders move the mesh
- [ ] "Home" preset button restores defaults
- [ ] "Tokens" preset activates compression wave (tube pinches and swells)
- [ ] "Foundations" preset shows low-poly faceted surface
- [ ] "Glitch" preset makes the surface visibly distort
- [ ] "Copy Config" copies JSON to clipboard (paste into a text editor to verify)
- [ ] Navigating away and back resets the panel to home values
- [ ] Mouse movement pulls the mesh subtly toward cursor
- [ ] Setting OS to `prefers-reduced-motion: reduce` stops rotation and zeroes effects

- [ ] **Final commit**

```bash
git add -A
git commit -m "chore(mobius): post-audit cleanup and smoke test sign-off"
```

---

## Promotion Path (Reference — Not Part of This Plan)

When lab values are locked:

1. Paste `Copy Config` JSON into the relevant preset in `PRESETS` inside `mobiusStore.ts`
2. Import `MobiusLogo` into `HDSLayout`
3. Add a `useLocation` watcher in `HDSLayout` that calls `useMobiusStore.getState().setPreset(routeToPreset(pathname))`
4. The `routeToPreset` map: `/hds` → `home`, `/hds/tokens` → `tokens`, `/hds/foundations` → `foundations`, etc.
5. For the Hirobius case study page: trigger `hirobius` preset + wire IntersectionObserver for scroll-narrative (glitch → tokens → home as sections scroll into view)
