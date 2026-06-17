# Design Heuristics

Art-direction rules for layout decisions when the design system does not already dictate a single obvious answer.

## Reference Vs. Narrative

- Foundation pages such as Typography and Color default to `maxWidth="max"` so reference specimens can breathe and compare side by side.
- Case-study and prose-led pages default to `maxWidth="content"` so the reading measure stays controlled.

## The 320px Snap

- Never willingly compress a card below 320px wide.
- If the available width gets tight, reduce the column count instead of allowing cards to become narrow and brittle.

## Outer Inset

- The outermost page container must include `padding={hds.semantic.space.layout.inset}`.
- This 32px inset is mandatory so content never rides the browser edge.

## Visual Horizon

- When cards or content panels sit side by side, align their internal header/action rows horizontally.
- Use `align-items: stretch` on the parent layout and `justify-content: space-between` inside paired header rows so shared horizons stay clean.

## Component Promotion Protocol

Before a component moves from `src/app/pages/lab/` into `src/app/components/`, it must satisfy all of the following:

- **Prop Hardening**: Interfaces are restricted and typed; no loose `any`.
- **Theme Compliance**: Styling strictly uses `hirobius.tokens.json`.
- **Ref Forwarding**: The component implements `React.forwardRef`.
- **Visual Snapshot**: A "Gold Standard" baseline image has been captured.
