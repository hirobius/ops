# Sketchbook Control Inventory

Updated during the sketchbook controls pass.

## Promoted to shared HDS controls

- `HdsSlider`
  - Existing shared control used for numeric tuning.
- `HdsToggle`
  - Existing shared control used for boolean on/off states.
- `HdsSelect`
  - Existing shared control used for fixed option picking.
- `SegmentedControl`
  - New shared control promoted from repeated sketch mode-switch rows.
  - Documented in `Components > Inputs`.

## Shared shell controls tightened this pass

- `SketchbookShell`
  - Back label now uses tokenized micro typography instead of a raw `10px` size.
  - Tech tags now use tokenized micro typography instead of a raw `10px` size.
  - Mobile controls chevron now uses token-based motion timing.
- `Controls`
  - `HdsSelect` dropdown now relies on HDS surface/border treatment instead of a bespoke box shadow.
- `ControlsPanel`
  - Shared panel chrome extracted from `SketchbookShell` so the sketch control surface is now a reusable composition instead of page-local layout.

## Sketches migrated onto shared HDS controls

- `Boids Flocking`
  - `HdsSlider`
  - `HdsToggle`
  - Bonus control: `Perception Radius`
  - Scene colors now respond to theme mode.
- `Particle Sandbox`
  - `SegmentedControl`
  - `HdsSlider`
  - Bonus control: `Link Distance`
  - Scene colors now respond to theme mode.
- `Meta Balls`
  - `SegmentedControl`
  - `HdsSlider`
  - `HdsButton`
  - Bonus control: `Cursor Radius`
  - Scene colors now respond to theme mode.
- `Physics Playground`
  - `SegmentedControl`
  - `HdsSlider`
  - Bonus control: `Interaction Radius`
  - Scene colors now respond to theme mode.
- `Cyberpunk Grid`
  - `HdsSlider`
  - `IconButton`
  - Bonus control: `Bar Scale`
  - Scene colors now respond to theme mode.
- `Shape Explorer`
  - `HdsSelect`
  - `SegmentedControl`
  - `HdsSlider`
  - `HdsToggle`
  - `HdsButton`
  - Bonus control: `Hue Shift`
  - Scene colors now respond to theme mode.
- `Wave Background`
  - `SegmentedControl`
  - `HdsSlider`
  - `HdsToggle`
  - `HdsButton`
  - Bonus control: `Tone`
  - Scene colors now respond to theme mode.

## Sketch-local patterns still pending review

- `SlidingControlRail`
  - Current use: `Cyberpunk Grid`
  - Notes: likely a reusable sketch pattern, but not yet broad enough to promote into main HDS.
- `CopyCodeButton`
  - Current use: `Cyberpunk Grid`
  - Notes: useful sketch utility, but still reads as sketch tooling rather than a core site control.
- `MaterialPickerCardGrid`
  - Current use: `Falling Sand`
  - Notes: strongest remaining custom control candidate if the sand/material studies keep growing.
- `ScenePanel`
  - Current use: repeated across several imported sketches as a glassy top overlay.
  - Notes: likely a pattern before it becomes a component.
- `PresetDrivenExplorerPanel`
  - Current use: `Shape Explorer`
  - Notes: currently composed entirely from existing HDS controls, so it is not a new shared component yet.

## Next likely promotions

- `MaterialPickerCardGrid` if more simulation sketches need a visual material/state picker.
- `SlidingControlRail` if more full-height canvas experiments need a docked control drawer.
