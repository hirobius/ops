# Hidden UI Audit

Phase 8, Task 22.5 from `docs/AI_ORCHESTRATION.md`

Status: audit complete, no code changes applied.

## Scope

- Scanned `src/app/components/`
- Scanned `src/app/pages/lab/`
- Extended the sweep to route-level hidden UI hosts in `src/app/pages/hds/` and `src/app/pages/sketches/` where drawers, floating inspectors, lightboxes, and modal shells are implemented

## Summary

- Violating files found: 19
- Raw hex literals found in audited hidden UI files: 0
- Dominant failure modes:
  - raw `div` or `motion.div` layout wrappers with inline CSS
  - manual padding/margin instead of composition through `Stack` / `Grid` / `HdsSurface`
  - sketch-specific color helpers and overlay chrome not routed through semantic HDS surfaces/tokens

## Files With Violations

| File | Hidden UI Pattern | Violations | Evidence |
| --- | --- | --- | --- |
| `src/app/components/Tooltip.tsx` | cursor-following / centered tooltip | manual pill padding; raw fixed/absolute `div` wrappers | lines 37-46, 84-97, 108-121 |
| `src/app/components/ImageLightbox.tsx` | modal lightbox | raw fixed-position close-button wrapper; raw inline-grid modal shell instead of `Stack` / `Grid` | lines 68-75, 97-104 |
| `src/app/components/ShellControls.tsx` | mobile top bar / docked shell controls | manual padding on utility buttons and top bar; raw `div` wrappers with inline flex layout | lines 61-79, 139-170, 174-189, 218-244 |
| `src/app/components/SketchControls.tsx` | sketch control primitives | manual `marginBottom` / `padding`; native control chrome instead of HDS layout/surface primitives | lines 46-60, 82-105, 122-137, 149-165, 184-188 |
| `src/app/pages/hds/HDSLayout.tsx` | mobile drawer backdrop, acrylic shell controls, search modal | multiple raw fixed/absolute `div` shells; manual padding including raw `10vh`; modal/header/body layout not composed from HDS primitives | lines 1542-1580, 1678-1704, 2017-2113 |
| `src/app/pages/sketches/SketchbookShell.tsx` | desktop/mobile controls host portals | raw `div` portal shells; fixed mobile control dock; manual padding and width wrappers around controls | lines 94-113, 123-170, 175-189 |
| `src/app/pages/sketches/private/RippleDistortionLayout.tsx` | right-side floating drawer | raw `motion.div` drawer; manual padding; non-semantic sketch overlay chrome | lines 197-258 |
| `src/app/pages/sketches/private/MeshDeformationLayout.tsx` | right-side floating drawer | raw `motion.div` drawer; raw `div` groups; manual padding; non-semantic sketch overlay chrome | lines 200-288 |
| `src/app/pages/sketches/private/ElasticNodesLayout.tsx` | right-side floating drawer | raw `motion.div` drawer; raw `div` groups; manual padding; non-semantic sketch overlay chrome | lines 193-283 |
| `src/app/pages/sketches/private/MagneticParticlesLayout.tsx` | right-side floating drawer | raw `motion.div` drawer; raw `div` groups; manual padding; non-semantic sketch overlay chrome | lines 187-277 |
| `src/app/pages/sketches/private/SwarmAvoidanceLayout.tsx` | right-side floating drawer | raw `motion.div` drawer; manual padding; non-semantic sketch overlay chrome | lines 168-229 |
| `src/app/pages/sketches/private/ConstellationDrawerLayout.tsx` | right-side floating drawer | raw `motion.div` drawer; raw `div` groups; manual padding; non-semantic sketch overlay chrome | lines 203-293 |
| `src/app/pages/sketches/private/CyberpunkGridLayout.tsx` | floating controls panel | raw toggle wrapper and `motion.aside`; manual padding; raw flex column layout for controls | lines 242-300 |
| `src/app/pages/sketches/private/VerletRopeLayout.tsx` | floating top-center controls panel | raw `div` / `motion.div` panel shell; manual padding; raw button chrome | lines 254-302 |
| `src/app/pages/sketches/private/SoftBodyLayout.tsx` | floating top-center controls panel | raw `div` / `motion.div` panel shell; manual padding; raw button chrome | lines 239-287 |
| `src/app/pages/sketches/private/RigidBodyLayout.tsx` | floating top-center controls panel | raw `div` / `motion.div` panel shell; manual padding; raw button chrome | lines 249-300 |
| `src/app/pages/sketches/private/SandPhysicsLayout.tsx` | floating top-center controls panel | raw `div` / `motion.div` panel shell; manual padding; raw button grid/card layout | lines 216-287 |
| `src/app/pages/sketches/private/ParticleSandboxLayout.tsx` | floating top-center controls panel | raw `div` / `motion.div` panel shell; manual padding; raw flex column controls wrapper | lines 181-223 |
| `src/app/pages/sketches/private/PhysicsPlaygroundLayout.tsx` | floating left controls panel | raw `div` / `motion.div` panel shell; manual padding; raw flex column controls wrapper | lines 188-232 |

## Audited And Not Flagged

- `src/app/pages/lab/IncubatorPage.tsx`
- `src/app/components/ControlsPanel.tsx`

## Notes

- The biggest concentration of violations is in sketch-route drawers and floating inspector panels, not in `src/app/pages/lab/`.
- The core component layer already has several reusable hidden-UI offenders (`Tooltip`, `ImageLightbox`, `ShellControls`, `SketchControls`). Those should be treated as the first remediation targets before touching every sketch route individually.
- Waiting for approval before changing any source files.
