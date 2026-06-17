# Contributing to Hirobius Design System (HDS)

## Dev Setup

### Prerequisites

- **Node.js** `v25` (see `.nvmrc` if present, or match CI)
- **pnpm** `10.x` (`npm install -g pnpm@10`)

### Install and run

```bash
pnpm install
pnpm dev          # Vite dev server
```

### Key documents

| File | Purpose |
|---|---|
| `CLAUDE.md` | Agent operating instructions (read first) |
| `public/llms.txt` | AI entry point — generated, do not edit directly |
| `DESIGN.md` | Lean visual spec — generated from `DESIGN.source.md` |
| `public/hds-manifest.json` | Machine-readable component inventory — generated |
| `docs/ai/AGENT_GUIDELINES.md` | Sub-agent dispatch doctrine, token rules, commit hygiene |
| `docs/ai/orchestration.json` | Unit queue — 339+ build units, source of truth for work |

---

## Validator Gates Explained

`.husky/pre-commit` runs six hard-fail gates on every commit (plus a
warn-mode lint baseline). Understanding what each catches prevents wasted
cycles debugging a blocked commit.

Cross-reference: `docs/ai/AGENT_GUIDELINES.md` §5.

### 1. `pnpm typecheck`

TypeScript strict mode (5 of 10 flags enabled). Catches type errors across
all source files covered by `tsconfig.typecheck.json`.

**Common failure modes:** missing generic parameters, wrong prop types after a
refactor, importing a type at runtime.

### 2. `node scripts/check-manifest-drift.mjs`

Compares the generated `public/hds-manifest.json` against the source
component tree. Fails if a component exists in source but is missing from
(or stale in) the manifest.

**Common failure mode:** adding a new component `.tsx` without running
`pnpm manifest:generate` afterward.

### 3. `node scripts/check-binding-drift.mjs`

Verifies that token bindings in component CSS match the canonical token
paths in `hirobius.tokens.json`. Fails if a component references a token
path that no longer exists.

**Common failure mode:** renaming a semantic token without updating
component source files.

### 4. `node scripts/check-source-canon.mjs`

Enforces the raw-value ban. Components and page files must not contain raw
hex colors, hard-coded `px` font sizes, or `box-shadow` strings — all
visual values must come from tokens.

**Common failure mode:** copy-pasting a Figma inspect value into a style
prop instead of the corresponding token.

### 5. `node scripts/validate-manifest.mjs`

Schema-validates `public/hds-manifest.json`. All required fields must be
present and correctly typed (phase, status, Figma link format, etc.).

**Common failure mode:** a hand-edit to `hds-manifest.json` (never do
this — always regenerate) or a script regression that emits a bad field.

### 6. `node scripts/validate-orchestration.mjs`

Schema-validates `docs/ai/orchestration.json`. Every unit must have valid
`status`, `approval`, `priority`, and `sprint` values.

**Common failure modes:**
- `status: "pending"` — not a valid value; use `proposed`.
- `priority: 0` or `priority: 6` — must be 1–5.
- Missing required field (`dependsOn`, `description`, `validationCmd`).

### Lint (warn-mode)

`pnpm lint --max-warnings=210` runs but does **not** block commits. The cap
is lowered each burndown wave. Track progress via
`12i-quality-eslint-burndown` in `orchestration.json`.

---

## Unit-Driven Workflow

All work in this repo flows through **build units** defined in
`docs/ai/orchestration.json`.

### Finding eligible work

A unit is ready to execute when all three conditions hold:

```
"status": "proposed"    (or "approved")
"approval": "approved"
"dependsOn": [...]      all IDs in the list are "status": "done"
```

Search the file for `"approval": "approved"` and filter by `dependsOn`
satisfaction.

### Unit ID convention

```
{phase}{cluster}-{slug}

Examples:
  12n-api-changelog-automation
  12p-test-contract-tests-primitives
  12i-quality-eslint-burndown
```

- `{phase}` is the numeric phase prefix (`12-hds-refinement` → `12`).
- `{cluster}` is the cluster short-code (`n-api`, `p-test`, `i-quality`, …).
- `{slug}` is a kebab-case description of the deliverable.

### Marking a unit done

**In the same commit** as the deliverable:

1. Set `"status": "done"` on the unit.
2. Append an entry to `"agentNotes"`:

```json
"agentNotes": [
  "DONE 2026-05-01 (Window 1, Agent 1C): one-line description of what was done."
]
```

Never mark a unit `done` in a separate commit, and never mark it `done`
before the deliverable lands.

---

## Commit Format

```
<scope>(<area>): <unit-id> <one-line summary>

<body explaining the why>

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Examples:**

```
docs(ops): 12n-api-contributing-and-coc CONTRIBUTING.md + CODE_OF_CONDUCT.md
feat(hds): 12g-primitives-hds-button HdsButton v2 — compound variant system
fix(tokens): 12i-quality-binding-drift remove stale elevation.sticky references
```

**Hard rules (cross-ref `docs/ai/AGENT_GUIDELINES.md` §10):**

- **Never push to remote** without an explicit instruction from Adrian.
- **Never use `--no-verify`** to skip pre-commit gates.
- **Never `--amend` to hide breakage.** If a commit broke something, make a
  fix-up commit and document what went wrong in `agentNotes`.
- **Never `git reset --hard main`** without explicit instruction.

---

## PR Template

`.github/PULL_REQUEST_TEMPLATE.md` auto-populates when you open a PR on
GitHub. **Pasted validator output is mandatory** — run all six gates locally,
copy the terminal output, and paste it into the "Validator output" section
before requesting review.

---

## AI-Augmented Workflows

This repo uses autonomous sub-agent dispatch for bulk unit execution.
`docs/ai/AGENT_GUIDELINES.md` is the source of truth for:

- **Model selection** (haiku for mechanical edits, sonnet for most code and
  all deletions, opus for architectural reasoning) — §1.
- **Worktree isolation** and the required `git reset --hard fix/ui-pipeline`
  first action — §2.
- **No bulk `lint:fix`** — scope to one rule at a time with verification — §3.
- **Validate before claiming** — every `agentNotes` claim must include a
  grounding ref — §4.
- **Token discipline** and bypass markers — §8.
- **Auto-gen outputs** that must never be hand-edited — §9.

---

## Contact

- **Email:** adrian@hirobius.com
- **Issues:** open a GitHub issue on this repository for bugs, feature
  requests, or questions about the design system.
