# ADR-008: Slot Vocabulary Aligned to Radix

**Status:** Accepted (2026-05-01)

## Context
HDS pipeline binds Figma slot names (IconLeft, Label, Title, Body) to component state via token paths in the manifest. As component system grew, slot naming diverged — some components used leading/trailing, others used start/end, others used custom names. No coordination existed with Radix terminology.

## Decision
Align slot vocabulary to Radix UI conventions with Figma layer-name compatibility:
- **Radix canonical names:** `icon-start`, `icon-end`, `label`, `title`, `body`, `root`, `background`
- **Figma layer names (unchanged):** `IconLeft`, `IconRight`, `Label`, `Title`, `Body` (existing layer names in masters)
- **Mapping:** manifest `slots[].name` uses Radix semantic names; `slots[].figmaSlotName` preserves Figma layer names for plugin binding

## Rationale
- **Radix alignment reduces cognitive load.** Engineers familiar with Radix expect `icon-start` and `icon-end`, not `leading`/`trailing`
- **Figma layer names frozen.** Plugin already binds via layer names; renaming layers breaks existing master components. Decoupling via slot mapping preserves both systems.
- **Slot vocab reuse.** Shared semantic names (`label`, `body`, `icon-start`) across components (HdsButton, Input, Card) make patterns predictable
- **Future-proof.** If plugin evolves to use layer UUIDs instead of names, manifest slot mapping survives the layer rename

## Implications
- Manifest `slots[]` schema has `name` (Radix semantic) and `figmaSlotName` (Figma layer) fields
- Validation ensures every `figmaSlotName` appears in actual Figma master component layers
- Token binding references use semantic names (e.g., `slots[name='icon-start'].tokenBinding.fill`)

## Consequences
- Clear, consistent slot naming across all 94 specs
- Plugin binding unaffected (still uses layer names)
- Manifest easier to audit (shared semantic slot names reduce surprise)
- Slot vocab becomes documentation artifact (users learn 10 semantic names, apply everywhere)
