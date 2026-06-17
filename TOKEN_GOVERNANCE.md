# TOKEN_GOVERNANCE

Last updated: 2026-03-18
Status: Canonical token-format and token-governance reference

## Purpose

This file defines the strict token rules for this repo in an agent-agnostic way.

Any human, AI agent, script, or design tool touching the token system should treat this as the canonical reference for:

- token format expectations
- hierarchy rules
- allowed and disallowed patterns
- update workflow
- verification expectations

## Core Rule

`hirobius.tokens.json` is the single source of truth for token values.

Everything else is downstream:

- `src/styles/tokens.css`
- `src/app/design-system/generated-tokens.ts`
- `DESIGN.md`
- `DESIGN-HANDOFF.md`
- HDS documentation pages
- Figma variable exports and sync artifacts

## Format Standard

The token file follows the W3C Design Tokens Community Group format:

- W3C DTCG 2025.10 structure
- `$type`
- `$value`
- `$description` where useful
- `$extensions` for Figma mode metadata

This is a standards decision, not a tool-specific preference.

## Required Hierarchy

```text
primitive.*   raw values
semantic.*    purpose aliases
component.*   scoped application tokens
```

Meaning:

- `primitive.*` stores raw values only
- `semantic.*` expresses intent
- `component.*` applies the system to concrete UI areas

## Strict Rules

1. Do not hardcode raw visual values into downstream component or semantic token definitions when an alias should exist.
2. Keep color tokens standards-compliant and Figma-compatible.
3. Do not put CSS functions like `clamp()` inside `hirobius.tokens.json` when they break portability.
4. Do not hand-edit generated files.
5. Do not treat Figma exports or CSS output as source of truth.
6. Any token-system change must preserve the primitive → semantic → component mental model.

## W3C / Portability Rules

### Allowed

- color values as hex strings like `"#1e2fff"`
- primitive refs like `{primitive.color.blue.500}`
- semantic refs like `{semantic.color.content.primary}`
- `$extensions.com.figma.variables.modes.Light`
- `$extensions.com.figma.variables.modes.Dark`

### Not allowed

- RGB component arrays as color `$value`
- CSS variable strings as token values
- `clamp()` directly in the token JSON
- downstream files becoming the authority over token values
- inline raw color values inside semantic or component color tokens

## Alias Rules

### Always true

- semantic and component layers should read as aliases or structured compositions, not random raw-value dumps
- color tokens must preserve the theming path cleanly
- component tokens should be understandable in terms of system intent, not just implementation convenience

### Practical interpretation

- `primitive.*` is where raw values belong
- `semantic.*` is where purpose belongs
- `component.*` is where scoped usage belongs

If a new token bypasses that model, stop and justify it before proceeding.

## Responsive Rules

Responsive expressions belong in implementation layers such as `theme.css` when needed for web behavior.

They do not belong in `hirobius.tokens.json` if that would break W3C/Figma compatibility.

Examples:

- allowed in CSS layer: `clamp()`
- not allowed in token JSON: `clamp(1rem, 4vw, 4rem)`

## Dark Mode Rules

Dark mode must remain portable and explicit.

Use:

- semantic token branches
- component token branches
- `$extensions.com.figma.variables.modes.Light/Dark`

Do not rely on ad hoc dark-mode-only overrides in places that bypass the token model unless that gap is explicitly documented.

## Generated Files

Do not edit these manually:

- `src/styles/tokens.css`
- `src/app/design-system/generated-tokens.ts`

If they are wrong, fix `hirobius.tokens.json` or the token build pipeline.

## Required Update Flow

When token values or token structure change:

1. update `hirobius.tokens.json`
2. run `pnpm tokens:verify`
3. confirm generated outputs updated correctly
4. update `DESIGN.md` and `DESIGN-HANDOFF.md` in the same commit when the mirrored visual guidance changed
5. if follow-up work remains, add it to `TASKS.md`
6. if the change exposes a docs or shell finding, log it in `HDS_COMPLIANCE_LOG.md`
7. update process/decision archive only if Adrian explicitly asks for that documentation

## Verification

Minimum expectation after token changes:

```bash
pnpm tokens:verify
```

Before broader completion claims:

```bash
pnpm check
```

## Agent Rule

Any agent working on tokens, token consumption, documentation of tokens, or tooling around tokens should read:

1. `TOKEN_GOVERNANCE.md`
2. `DESIGN.md`
3. `DESIGN-HANDOFF.md`
4. `CLAUDE.md`

in that order for token-related work.

## Relationship To Other Docs

- `TOKEN_GOVERNANCE.md`
  Canonical token standard and governance rules
- `DESIGN.md`
  Canonical lean visual system spec
- `DESIGN-HANDOFF.md`
  Canonical verbose mirror of token values and design constraints
- `CLAUDE.md`
  Canonical operating instructions for agents

If those files appear to disagree, resolve the conflict instead of guessing.
