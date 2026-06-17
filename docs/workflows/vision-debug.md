# WORKFLOW: Vision-Agent UI Debugging

## Trigger

Use this workflow when a user drops a screenshot of a UI bug into `public/assets/_incoming/bugs/`.

## Execution Protocol

1. Analyze the latest screenshot in `public/assets/_incoming/bugs/`.
2. Locate the UI code.
3. Audit against `/CLAUDE.md` and the `@ai-rules` JSDoc tags in our primitives.
4. Diagnose and fix the code (enforce flush-content rule).
5. Run `pnpm typecheck`.
6. Delete the screenshot from the folder to reset the workflow.
