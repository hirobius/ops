# AGENTS.md

Project-level operating notes for code agents working in this repo.

## Canonical Docs

Read these first, depending on the task:

- [CLAUDE.md](./CLAUDE.md)
  Primary machine-readable entrypoint for HDS implementation work.
- [DESIGN.md](./DESIGN.md)
  Lean agent-facing visual system guidance.
- [DESIGN-HANDOFF.md](./DESIGN-HANDOFF.md)
  Verbose visual system mirror for brand, tokens, layout language, and design constraints.
- [BACKLOG.md](./BACKLOG.md)
  Active backlog and work status. (Supersedes the former `TASKS.md`.)
- [TOKEN_GOVERNANCE.md](./TOKEN_GOVERNANCE.md)
  Token governance expectations and usage rules.
- [SYSTEMS_REGISTRY.md](./SYSTEMS_REGISTRY.md)
  System-level inventory and registry context.
- [HDS_COMPLIANCE_LOG.md](./HDS_COMPLIANCE_LOG.md)
  Compliance and audit trail for the design system.
- [PROCESS.md](./PROCESS.md)
  Project process/history context when workflow questions come up.
- [README.md](./README.md)
  General project setup and overview.

## Source Of Truth

- Use [public/hds-manifest.json](./public/hds-manifest.json) for component inventory, categories, Figma links, and machine-readable docs metadata.
- Use [src/app/data/component-api.json](./src/app/data/component-api.json) for generated prop tables and API reflection.
- Use [hirobius.tokens.json](./hirobius.tokens.json) for token names and values.
- Use [DESIGN.md](./DESIGN.md) for the lean agent-facing visual spec.
- Use [DESIGN-HANDOFF.md](./DESIGN-HANDOFF.md) for the verbose human-readable mirror of the token and brand system.

## Script Reality

This repo currently uses a flat `scripts/` toolchain.

Do not assume a domain-based `scripts/<area>/SCRIPT.md` structure exists unless it has actually been added to the repo.

Common script groups that do exist:

- Build and generation:
  - `scripts/build-tokens.mjs`
  - `scripts/build-handoff.mjs`
  - `scripts/build-design-md.mjs`
  - `scripts/build-llms-txt.mjs`
  - `scripts/generate-manifest.mjs`
  - `scripts/generate-component-api.mjs`
- Verification and checks:
  - `scripts/verify-tokens.mjs`
  - `scripts/check-route-links.mjs`
  - `scripts/check-component-docs.mjs`
  - `scripts/check-doc-structure.mjs`
  - `scripts/check-hardcoded-colors.mjs`
  - `scripts/check-hardcoded-spacing.mjs`
  - `scripts/check-unresponsive-grids.mjs`
- Registry and sync:
  - `scripts/sync-hds-registry.mjs`
  - `scripts/sync-icons.mjs`
  - `scripts/sync-system-health.mjs`

## Asset Intake Workflow

Portfolio image-led pages use explicit slot ids like `hero-01` and `asset-07`.

- Drop new loose assets into [public/assets/_incoming](./public/assets/_incoming)
- Treat that folder as a staging area only
- Use `pnpm assets:convert` to batch-convert `_incoming` images to WebP before slotting when appropriate
- Use `--keep-png <file>` for transparency-sensitive or explicitly preserved PNG assets
- Move final mapped assets into permanent folders under [public/assets](./public/assets)
- Move replaced live assets into [public/assets/_archive](./public/assets/_archive) instead of hard-deleting them
- Update page slot manifests to assign assets to slots
- Do not hardcode ad hoc inline image paths throughout page markup

Example instructions users may give:

- `put this in hero-01 on /microsoft-design-systems`
- `map these to asset-07 through asset-10 on /visuals`
- `swap asset-03 and asset-04 on /visuals`

Publishing behavior:

- Public pages hide assigned slot badges by default
- Draft slot visibility is available via `?slots=show`
- Empty slots should continue to render visible slot ids

## Guidance Hygiene

- Prefer updating this file and [CLAUDE.md](./CLAUDE.md) only with stable, repo-wide rules.
- Do not reference missing docs, folders, or workflows as if they already exist.
- When the repo structure changes, update this file to match reality instead of preserving aspirational architecture.
