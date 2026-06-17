# Bidirectional Figma Sync Plan v1

This note captures the intended workflow for moving between repo-first and design-first work without making Figma the source of truth.

## Goal

Support both directions:

- code-first -> Figma projection
- design-first -> repo ingestion

The repo remains canonical. Figma is a workspace and sync target.

## Tooling Boundary

Use the right Figma path for the job:

| Tooling | Best for | Mode notes |
|---|---|---|
| Official Figma MCP / Code Connect | Quick component-level code generation from specific links | Read-oriented bridge for code scaffolding |
| Figma Console MCP Remote | Read-only inspection, screenshots, variables, and project-wide context | Good for lightweight exploration and auditing |
| Figma Console MCP Cloud | Browser-based AI clients that need write access through the relay | Good for design-first workflows without local Node setup |
| Figma Console MCP Local / Desktop Bridge | Full read/write control, console monitoring, and deeper automation | Best for full-fidelity sync and plugin-aware workflows |

## Workflow Lanes

### Repo -> Figma

Inputs:

- `hirobius.tokens.json`
- `system.manifest.json`
- `src/app/data/component-api.json`
- `DESIGN.md`
- `DESIGN-HANDOFF.md`

Outputs:

- variables
- component metadata
- docs references
- project-wide structure in Figma

### Figma -> Repo

Inputs:

- exploratory Figma files
- variable edits
- component edits
- screenshots / inspection output

Outputs:

- diff report
- approved token changes
- manifest / API updates
- component or page code changes

## Implementation Order

1. Build a read-only audit path first.
2. Add a diff report that compares Figma state to repo truth.
3. Add approved write paths only after the audit is reliable.
4. Keep generated outputs and docs mirrors in sync after each approved change.

## Guardrails

- Figma changes do not become canonical until they are intentionally ingested.
- `DESIGN.md` stays lean.
- `DESIGN-HANDOFF.md` stays verbose.
- `hirobius.tokens.json` remains the source of truth for visual values.

