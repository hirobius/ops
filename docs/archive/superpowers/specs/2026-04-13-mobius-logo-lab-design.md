# Möbius Logo Lab — Design Spec
**Date:** 2026-04-13
**Status:** Approved
**Scope:** Vibe Sketchbook — `/vibe-sketchbook/logo-lab`

---

## Overview

A production-quality 3D Möbius logo component built with react-three-fiber, driven by a zustand parameter store, and dialed in through a Leva control panel inside the Vibe Sketchbook. The lab is the production component — once values are locked via the Leva panel, moving the logo to the main shell is a single import and a route watcher.

---

## Design Philosophy — Geometry First

**The shape does the talking. The effects set the room.**

Preset transitions are communicated through geometry changes: tube radius, twist count, segment count, vertex deformation. Post-processing (bloom, chromatic aberration, noise, vignette) is atmosphere — it gives the canvas physical texture and cinematic weight, but it never carries the narrative.

Practical ceilings:
- `bloomIntensity` max: **0.5** across all presets
- `chromaticAberration` max: **0.003** — barely perceptible, lens-quality only
- `noiseOpacity`: **0.02–0.04** constant across all presets (film grain, not effect)
- `vignetteIntensity`: **0.35** constant — room tone, not drama

The vignette and noise are essentially fixed. They never animate between presets.

---

## Scope Boundary

The R3F canvas lives **inside the Vibe Sketchbook only** for this phase. It does not touch `HDSLayout`, `HdsWebGLTriangleLogo`, or the main nav. The architecture is designed for zero-rework promotion to the shell later.

---

## New Dependencies

| Package | Purpose |
|---|---|
| `@react-three/fiber` | Declarative Three.js renderer |
| `@react-three/drei` | OrbitControls, MeshTransmissionMaterial, Environment |
| `@react-three/postprocessing` | Bloom, ChromaticAberration, Noise, Vignette |
| `leva` | Dev-time parameter panel (sketchbook only) |
| `zustand` | Global uniform store |

---

## File Plan

### New files
```
src/app/stores/mobiusStore.ts            ← zustand store + presets + reset action
src/app/components/MobiusLogo.tsx     ← production R3F Canvas + scene + effects
src/app/components/MobiusScene.tsx    ← scene internals: mesh, material, post-FX
src/app/pages/sketches/LogoLabSketch.tsx ← Leva panel wrapper (sketchbook only)
```

### Modified files
```
src/app/routes.tsx                       ← add logo-lab route under vibe-sketchbook
```

### Dependency direction
```
LogoLabSketch → MobiusLogo → MobiusScene → mobiusStore
```
Leva never touches `MobiusLogo` or `MobiusScene` directly. The store is the only interface.

---

## Store — `mobiusStore.ts`

### Uniform groups

**Geometry** (drives TubeGeometry reconstruction via `useMemo`)
```ts
tubeRadius: number        // fatness of the tube — range [0.01, 0.20]
pathRadius: number        // radius of the ring — range [0.4, 2.0]
twistCount: number        // half-twists (1 = classic Möbius) — range [1, 4]
tubularSegments: number   // smoothness along path — range [64, 512]
radialSegments: number    // smoothness of cross-section — range [4, 24]
```

**Material** (updates in place each frame)
```ts
wireframe: boolean
transmission: number      // 0 = opaque, 1 = fully glass
roughness: number
thickness: number         // glass refraction depth
metalness: number
color: string             // initialized from --semantic-color-accent-primary CSS var
```

**Post-processing** (EffectComposer pass intensities)
```ts
bloomIntensity: number
bloomThreshold: number
chromaticAberration: number
noiseOpacity: number
vignetteIntensity: number
```

**Transform / animation**
```ts
scale: number
rotationSpeed: number     // idle spin — radians/sec
pulseEnabled: boolean     // data pulse animation (tokens preset)
pulseFrequency: number
mouseInfluence: number    // magnetic pull strength [0, 1]
```

**System**
```ts
performanceTier: 'high' | 'medium' | 'low'   // auto-detected at mount, Leva-overridable
reducedMotion: boolean                         // mirrors prefers-reduced-motion media query
activePreset: 'home' | 'tokens' | 'foundations' | 'components' | 'content' | 'sketchbook' | 'glitch' | 'lab'
```

**Additional uniforms** for geometry deformation effects:
```ts
uWaveAmplitude: number    // how much the tube pinches at compression points [0, 0.8]
uWaveFrequency: number    // how many compression nodes travel the path simultaneously
uWaveSpeed: number        // rate the wave travels the path [0, 4.0]
uGlitchIntensity: number  // random vertex displacement for glitch state [0, 1]
```

### Actions
```ts
setUniforms(partial: Partial<MobiusUniforms>): void
setPreset(preset: PresetKey): void
reset(): void   // spreads MOBIUS_DEFAULTS back onto state
```

### Presets

#### Core three (route-targeted, dialed in via lab)

| Preset | Visual concept | Key values |
|---|---|---|
| `home` | Full, smooth, glass — resting state of the form | tubeRadius 0.14, twistCount 1, tubularSegments 256, transmission 0.9, rotationSpeed 0.25, bloomIntensity 0.4 |
| `tokens` | **Compression Wave** — geometry pulses, data moves through topology | tubeRadius 0.05, twistCount 1, uWaveAmplitude 0.7, uWaveFrequency 3, uWaveSpeed 1.8, wireframe false, bloomIntensity 0.3 |
| `foundations` | Angular, structural — low segment count exposes the mesh | tubeRadius 0.09, twistCount 1, radialSegments 6, tubularSegments 80, metalness 0.85, roughness 0.15, bloomIntensity 0.25 |

#### Shell presets (defined now, consumed when logo promotes to HDSLayout)

| Preset | Visual concept | Key values |
|---|---|---|
| `components` | Attentive, interactive — slightly tighter form, mouse-responsive | tubeRadius 0.10, twistCount 1, transmission 0.75, mouseInfluence 0.85, rotationSpeed 0.4 |
| `content` | Receding — smaller, slower, ambient background presence | tubeRadius 0.06, twistCount 1, scale 0.65, transmission 0.6, rotationSpeed 0.12, bloomIntensity 0.2 |
| `sketchbook` | Full expressiveness — Leva in control, no constraints | Store is not overridden; whatever Leva currently holds |
| `glitch` | Broken topology — vertex displacement tears the surface | tubeRadius 0.09, uGlitchIntensity 0.6, rotationSpeed 6.0, radialSegments 5, chromaticAberration 0.004, bloomIntensity 0.5 |

#### Lab
`lab` — store is not reset on switch; Leva controls everything.

---

### `tokens` Preset — Compression Wave Detail

The goal is geometry-as-data. The tube remains readable; the surface itself carries the animation.

- `tubeRadius: 0.05` — visible, legible geometry
- `wireframe: false` — the mesh surface reads clearly
- `transmission: 0.5`, `roughness: 0.3` — semi-glass, you can see through it
- Vertex shader applies traveling sinusoidal compressions:
  `r_displaced = tubeRadius * (1 - uWaveAmplitude * sin(uWaveFrequency * pathPos + uTime * uWaveSpeed)²)`
- `uWaveFrequency: 3` — three compression nodes on the path simultaneously
- `uWaveSpeed: 1.8` — the compressions travel at a deliberate pace
- **Effect**: sections of the tube visibly pinch and swell as the wave moves around the Möbius topology. You watch information move through the shape, not light move over it.
- `bloomIntensity: 0.3` — polish only, the geometry tells the story
- Requires a custom `ShaderMaterial` or `onBeforeCompile` hook to inject wave deformation into the vertex shader

### `foundations` Preset — Low-Poly Structural Detail

- `radialSegments: 6` — the cross-section becomes a hexagon; individual faces visible
- `tubularSegments: 80` — reduced from default; the mesh reads as faceted, not smooth
- High `metalness`, low `roughness` — the faces catch light clearly, geometry is legible
- No deformation uniforms active — pure structural form
- **Effect**: the mathematical skeleton of the Möbius strip is legible in the face structure. Feels like a wireframe without actually being one.

### `glitch` Preset — Vertex Displacement Detail

- `uGlitchIntensity: 0.6` — random per-vertex displacement in the vertex shader, scaled by a noise function seeded from `uTime`
- The surface visibly tears and reforms — topology feels unstable
- `radialSegments: 5` — reduced cross-section accentuates the distortion
- `rotationSpeed: 6.0` — fast, erratic
- `chromaticAberration: 0.004` — a modest lens split, not aggressive
- `bloomIntensity: 0.5` — at the ceiling, but still within the geometry-first constraint
- **Effect**: the shape breaks. Not a light show — the mesh itself looks wrong.

### `MOBIUS_DEFAULTS`
Single exported constant. `reset()` spreads this back onto state. Mirrors the `home` preset.

---

## Geometry — Möbius Parametric Curve

Custom `THREE.Curve` subclass. Parametric equations:

```
t ∈ [0, 2π]
x(t) = (R + r·cos(twistCount·t/2)) · cos(t)
y(t) = (R + r·cos(twistCount·t/2)) · sin(t)
z(t) = r·sin(twistCount·t/2)
```

Where `R = pathRadius`, `r = tubeRadius`.

`TubeGeometry` is constructed from this curve and wrapped in `useMemo`. It only rebuilds when geometry params change — material, transform, and post-FX changes never trigger a rebuild.

Smooth transitions between geometry states: `useFrame` lerps `current` parameter values toward `target` values each frame. The geometry rebuilds only when the lerped value crosses a threshold, preventing per-frame reconstruction while still animating fluidly.

---

## Material

Three material modes, switched by `activePreset` and store flags:

**Glass** (default — `home`, `foundations`, `components`, `content`)
- `MeshPhysicalMaterial` with `transmission`, `roughness`, `thickness`, `metalness` driven by store
- `envMapIntensity` from `<Environment preset="city" />` (drei) — baked lighting, no per-frame cost
- `wireframe` flag available as a mode override

**Luminous Thread** (`tokens`)
- Custom `ShaderMaterial` (or `onBeforeCompile` hook on `MeshStandardMaterial`)
- Injects `uTracePosition` and `uTraceIntensity` uniforms into fragment shader emissive output
- Baseline emissive `+ spike at trace position` = traveling glow effect

**Matcap** (Leva-selectable in lab, optional shell override)
- `MeshMatcapMaterial` from drei + a dark studio/neon matcap texture
- Bakes complex lighting into a single texture sample — zero lighting setup cost
- Makes the glass look "expensive" on low-end hardware where `MeshPhysicalMaterial` transmission is disabled
- Texture file: `public/assets/matcaps/studio-dark.png` (to be sourced)

Performance tier override:
- **High**: `MeshPhysicalMaterial` with full transmission (or ShaderMaterial for tokens preset)
- **Medium**: `MeshPhysicalMaterial`, transmission disabled; matcap fallback available
- **Low**: `MeshMatcapMaterial` — single texture sample, no environment map, no transmission

---

## Post-Processing — `MobiusScene.tsx`

```tsx
<EffectComposer>
  <Bloom luminanceThreshold={bloomThreshold} intensity={bloomIntensity} />
  <ChromaticAberration offset={[chromaticAberration, chromaticAberration]} />
  <Noise opacity={noiseOpacity} />
  <Vignette offset={0.3} darkness={vignetteIntensity} />
</EffectComposer>
```

Performance tier override:
- **High**: all four passes active
- **Medium**: Bloom only
- **Low**: no post-processing

`reducedMotion: true` zeroes all intensities immediately (no lerp).

---

## Mouse Influence

`useFrame` reads a `mouseRef` (updated via `canvas onMouseMove`). Each frame:
1. Compute normalized cursor position relative to canvas center `[-1, 1]`
2. Apply damped lerp: `current += (target - current) * 0.08`
3. Add scaled offset to `mesh.position.x/y` and `mesh.rotation.x/y`
4. Strength controlled by `mouseInfluence` uniform from store

`reducedMotion: true` sets `mouseInfluence` to 0 immediately.

---

## Scroll-Linked Rotation

Within the sketchbook page, a `useEffect` listens to the page scroll container's `scroll` event. Delta is fed into a `scrollDeltaRef`. `useFrame` picks this up and adds a small Z-axis rotation impulse to the mesh, decaying toward zero each frame. Feels like the object is physically rolling with the page.

---

## Accessibility — `prefers-reduced-motion`

Store initializes `reducedMotion` from `window.matchMedia('(prefers-reduced-motion: reduce)').matches`. A `MediaQueryList` listener keeps it in sync if the user toggles system preferences mid-session.

When `reducedMotion: true`:
- Lerp duration → near-instant (effectively snaps)
- `rotationSpeed` → 0
- `pulseEnabled` → false
- All post-processing intensities → 0
- `mouseInfluence` → 0

---

## Performance Auto-Detection

At mount, `MobiusLogo` checks `navigator.hardwareConcurrency`. Sets initial `performanceTier`:
- `>= 8` → `'high'`
- `4–7` → `'medium'`
- `< 4` → `'low'`

Leva panel exposes manual override. Override persists in the store for the session.

---

## Motion Token Integration

Lerp speed reads from the computed CSS var `--semantic-motion-duration-moderate` at mount:

```ts
const duration = parseFloat(
  getComputedStyle(document.documentElement)
    .getPropertyValue('--semantic-motion-duration-moderate')
) || 0.35;

const lerpFactor = 1 - Math.exp(-deltaTime / duration);
```

This means the Möbius morph speed is governed by the same token that controls button hover transitions and sidebar animations.

`reducedMotion: true` bypasses this entirely, snapping immediately.

---

## Leva Panel — `LogoLabSketch.tsx`

Panel is organized into collapsible groups:

- **Geometry**: tubeRadius, pathRadius, twistCount, tubularSegments, radialSegments
- **Material**: wireframe, transmission, roughness, thickness, metalness
- **Post-FX**: bloomIntensity, bloomThreshold, chromaticAberration, noiseOpacity, vignetteIntensity
- **Transform**: scale, rotationSpeed, mouseInfluence
- **Pulse**: pulseEnabled, pulseFrequency
- **System**: performanceTier (select), reducedMotion (display-only, reflects OS)

**Preset buttons**: Home / Tokens / Foundations — each calls `store.setPreset()`.

**Copy Config button**: Serializes current store state (excluding system flags) to JSON, copies to clipboard. Output is paste-ready as a new preset definition.

---

## Snap to Defaults

```ts
// LogoLabSketch.tsx
useEffect(() => {
  return () => store.reset();
}, []);
```

Navigating away from `/vibe-sketchbook/logo-lab` resets all uniforms to `MOBIUS_DEFAULTS`. Other sketchbook routes and all main app routes see the clean default state.

---

## Route Addition

```ts
// routes.tsx — inside vibe-sketchbook children
{ path: 'logo-lab', element: <LazySketch Page={LogoLabSketch} /> }
```

---

## Promotion Path (Post-Lab)

When logo values are locked via Copy Config:

1. Paste JSON values into the preset definitions in `mobiusStore.ts`
2. Import `MobiusLogo` into `HDSLayout`
3. Add a `useLocation` watcher that calls `store.setPreset()` based on `pathname`
4. Optionally keep Leva panel available in dev mode via `process.env.NODE_ENV` guard

No rewrite. `MobiusLogo` has zero Leva dependency from the start.

---

## Out of Scope (This Phase)

- **SDF/raymarching metaball morphing** — requires replacing Three.js's renderer with a custom fragment shader. Right move after geometry shape is locked via the lab.
- **DOM layer refraction** — true per-pixel DOM distortion requires compositing page content into a WebGL texture (major architecture change). CSS `backdrop-filter` in the shell as a placeholder.
- **Persistent logo in `HDSLayout`** — promotion path documented above, not this phase.
