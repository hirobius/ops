# Guardrail Registry Schema

`docs/guardrails/registry.json` is the machine-readable inventory of every
automated quality gate in the Hirobius repo.

## Top-level shape

```json
{
  "version": "1.0.0",
  "generated": "<ISO 8601 timestamp>",
  "gates": [ <GateEntry>, ... ]
}
```

## GateEntry fields

| Field         | Type                               | Required | Description                                                                                     |
| ------------- | ---------------------------------- | -------- | ----------------------------------------------------------------------------------------------- |
| `id`          | `string`                           | yes      | Kebab-case identifier, derived from the script filename minus `.mjs`                            |
| `description` | `string`                           | yes      | First sentence from the script's leading JSDoc block. Use `"TODO: add description"` if missing. |
| `severity`    | `"error" \| "warn"`                | yes      | `"warn"` by default; Adrian promotes to `"error"` after manual triage                           |
| `gateScript`  | `string`                           | yes      | Repo-relative path to the script, e.g. `scripts/check-focus-states.mjs`                         |
| `fixturePath` | `string \| null`                   | yes      | Path to a proof-of-firing fixture. `null` until 13g-3 wires fixtures.                           |
| `owner`       | `string`                           | yes      | Responsible party. Default: `"Adrian"`.                                                         |
| `source`      | `"human" \| "hermes-distillation"` | yes      | `"human"` for hand-authored gates; `"hermes-distillation"` for auto-generated gates.            |

## Adding a new gate

1. Create `scripts/check-<name>.mjs` with a JSDoc block at the top.
2. Run `node scripts/validate-guardrail-registry.mjs --update` to auto-append a stub entry.
3. Fill in `description` and adjust `severity` as needed.
4. Commit both the script and the updated `registry.json`.

## Validator

`scripts/validate-guardrail-registry.mjs` walks `scripts/check-*.mjs` and
`scripts/audit-*.mjs` and asserts every file is registered. Exit 1 with a
missing list if not. Exit 0 if clean.

Use `--update` to auto-append missing entries (stub fields, severity=warn).
It also rejects any entry carrying `lastFiringAt` or `lastViolationAt` (see
below) — those fields cannot return to `registry.json`.

Note: `--warn-only` mode is not implemented. The pre-commit hook runs the
validator directly; unregistered scripts are a hard gate. This keeps the
registry honest without a second bypass mechanism.

## Source of truth for firing telemetry (issue #330)

`registry.json` carries **no firing telemetry** — no `lastFiringAt`, no
`lastViolationAt`. It is config-only, edited by humans/agents, and cannot
observe a gate actually running.

Telemetry lives in two files, neither of them `registry.json`:

- `docs/guardrails/firing-log.jsonl` — gitignored, append-only, one line per
  gate run (`{ts, channel, gate, exitCode, durationMs, commitSha}`). Written
  by `scripts/run-gates.mjs --emit-jsonl`, invoked from both
  `.husky/pre-commit` (so a failing gate is logged before the commit aborts)
  and `.husky/post-commit` (a full unscoped re-run, to catch `--no-verify`
  bypasses). This is the raw record.
- `docs/guardrails/firing-stats.json` — gitignored, derived. `pnpm
guardrail:firing-stats` (`scripts/refresh-firing-stats.mjs`) folds the log
  into per-gate `{ lastFiringAt, lastViolationAt }`. **This is the answer to
  "has this gate ever caught anything."**

A registry.json copy of these fields was tried once (issue #205's
`--bake` step) and removed: it only ever reflected whenever someone last ran
the bake, not live firings — 24 of 52 gates carried a `lastFiringAt` frozen on
one of two bake dates, and `lastViolationAt` was structurally unfillable
because a failing pre-commit gate aborted the commit before the old
post-commit-only logger ever ran. Read `firing-stats.json`, not
`registry.json`, for this question.
