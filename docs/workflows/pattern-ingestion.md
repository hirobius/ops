# WORKFLOW: Pattern Ingestion Engine

## Trigger

Use this workflow when a screenshot is dropped into `public/assets/_incoming/patterns/`.

## Execution Protocol

1. Analyze `public/assets/_incoming/patterns/ingested-reference.png` if it exists; otherwise analyze the latest screenshot in `public/assets/_incoming/patterns/`.
2. Map visual design to our W3C tokens (semantic theme, gaps, 9-style type ramp).
3. Draft the component in `src/app/components/` named `Draft[Name].tsx`, add the tag `// @hds-incubation: Pending extraction`, and use strictly `Grid/Stack/HdsSurface`.
4. Mount the Draft component in `src/app/pages/lab/IncubatorPage.tsx` for review.
5. Run `pnpm typecheck`.
6. Delete the screenshot from the folder.
