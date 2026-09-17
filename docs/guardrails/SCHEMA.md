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

| Field         | Type                               | Required | Description                                                                                          |
| ------------- | ---------------------------------- | -------- | ---------------------------------------------------------------------------------------------------- |
| `id`          | `string`                           | yes      | Kebab-case identifier, derived from the script filename minus `.mjs`                                 |
| `description` | `string`                           | yes      | First sentence from the script's leading JSDoc block. Use `"TODO: add description"` if missing.      |
| `severity`    | `"error" \| "warn" \| "info"`      | yes      | What a non-zero exit means to `run-gates.mjs` — see [Severity semantics](#severity-semantics-ops306) |
| `gateScript`  | `string`                           | yes      | Repo-relative path to the script, e.g. `scripts/check-focus-states.mjs`                              |
| `fixturePath` | `string \| null`                   | yes      | Path to a proof-of-firing fixture. `null` until 13g-3 wires fixtures.                                |
| `owner`       | `string`                           | yes      | Responsible party. Default: `"Adrian"`.                                                              |
| `source`      | `"human" \| "hermes-distillation"` | yes      | `"human"` for hand-authored gates; `"hermes-distillation"` for auto-generated gates.                 |

## Adding a new gate

1. Create `scripts/check-<name>.mjs` with a JSDoc block at the top.
2. Run `node scripts/validate-guardrail-registry.mjs --update` to auto-append a stub entry.
3. Fill in `description`, set `firingChannel` (the stub has none, so it runs on
   no channel), and **choose `severity` deliberately** (see below) — the stub's
   `warn` means the gate will never block anything. Putting a gate on
   `pre-commit` or `ci-pr` fails the curation lock in
   `scripts/__tests__/guardrail-core.test.mjs` until its severity is added to
   that test's `DECIDED` table and to the curation record below.
4. Commit both the script and the updated `registry.json`.

## Severity semantics (ops#306)

`scripts/run-gates.mjs` reads each gate's `severity` to decide what a non-zero
exit means. Before ops#306 it failed on any non-zero exit and ignored the
field, so severity was decorative and was never curated.

| Severity | Non-zero exit does                                                                  | Pick it when                                                                                  |
| -------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `error`  | Fails the run (exit 1). On `pre-commit`, stops fail-fast and **blocks the commit**. | A finding is always a defect in the change: correctness or safety, cheap to fix.              |
| `warn`   | Prints `⚠ run-gates: [id] … not blocking`; the run continues and can exit 0.        | A finding is often a state of the world (reporting, bookkeeping), not a defect in the commit. |
| `info`   | Same as `warn`.                                                                     | Pure telemetry.                                                                               |

- **Fails closed.** A missing or unrecognised severity is treated as `error`,
  so an uncurated gate keeps blocking rather than silently going advisory. The
  registry test also rejects such a value, but vitest runs on `pre-push`, not
  `pre-commit`, and sibling repos syncing `run-gates.mjs` have their own
  registries — the runner is the check that always runs.
- **Severity covers every non-zero exit**, including a crash (exit 2) — a
  crashed `warn` gate warns. If a gate must block when it cannot run, it is an
  `error` gate.
- **Fail-fast is severity-aware.** `pre-commit` stops at the first failing
  `error` gate; failing `warn` gates before it print and the run carries on.
  `--continue-on-failure` and `--emit-inventory` still run every gate.
- **Applies to every run-gates invocation** — `--channel` and `--gate` alike.
  `--emit-inventory` still exits 0 regardless. Gates invoked outside run-gates
  (e.g. `.husky/commit-msg` calling `check-commit-message-task-ref.mjs`
  directly) are unaffected; their own exit code is final.
- Classification lives in `scripts/lib/guardrail-core.mjs` (`gateOutcome`,
  `runGatesSerial`, `summarizeRun`), unit-tested in
  `scripts/__tests__/guardrail-core.test.mjs`.

### Curation record (Adrian, 2026-09-16)

Every gate on a blocking channel had its severity decided, not inherited.

**`pre-commit` — `error` (blocks):**

- Promoted by this pass: `check-security-baseline`, `check-hardcoded-colors`,
  `check-page-shell`, `check-unresponsive-grids`, `check-validator-wiring`.
- Already `error`, kept: `check-licenses`, `check-secrets`,
  `check-steering-budget`, `validate-fixture-proof-of-firing`,
  `validate-orchestration`, `check-schema-drift`.
- Was "unsure", resolved to `error` by Adrian: `check-exemptions`. It is the
  only check that an exemption marker carries a reason (CLAUDE.md rule 10). The
  `error` gates skip any line holding their marker, whatever follows the colon
  (`check-security-baseline` on `security-ok`, `check-hardcoded-colors` on
  `// color-ok:`), so as `warn` a reasonless marker would only print at commit
  and first be blocked by CI's "Full checks". As `error` it blocks the commit.
  It passes on the current tree and has a real fixture. This overrides the
  default of resolving "unsure" gates to `warn`, for this gate only.

**Stub fixtures do not demote a gate.** Four of the five promoted gates
(`check-security-baseline`, `check-hardcoded-colors`, `check-page-shell`,
`check-validator-wiring`) still have `// TODO` stub fixtures, and they stay
`error` on purpose. A fixture proves a gate _fires_; severity decides what a
firing _does_. A stub leaves the first unproven and says nothing about the
second. Demoting these gates to `warn` would not make their firing any more
provable. It would only stop them blocking whatever violations they do catch,
every one of which already blocked a commit before ops#306. Burning the stubs down is
`check-fixture-stubs-ratchet`'s job (`ci-pr`), not severity's.

**`pre-commit` — `warn` (informs):**

- Reporting / bookkeeping: `generate-strength-report`,
  `audit-batch-deliverables`, `audit-claims`, `audit-exceptions`.
- Were "unsure", resolved to `warn`: `check-route-coverage`, `check-og-meta`.
  Both stop blocking at **commit** only. Each still runs directly, outside
  run-gates, and still fails the PR in CI: `check-route-coverage` through
  `pnpm test:layout` (`quality.yml`), `check-og-meta` through
  `pnpm check:full` (`ci.yml` → "Full checks").
- `check-branch-ancestry` — exits 0 by design (ops#335), so `warn` changes
  nothing.

**`ci-pr`:** `check-fixture-stubs-ratchet` and `check-guardrail-drift` stay
`error`. `audit-gate-purity` and `audit-gates-supportjson` stay `warn` — both
exit 0 on findings unless passed `--strict` (run-gates does not), so `warn`
changes nothing.

**`commit-msg`:** `check-commit-message-task-ref` stays `warn`. The hook calls
it directly, not through run-gates; it is warn-only unless
`KANBAN_REF_ENFORCE=error`.

The six pre-commit gates now `warn` that can exit non-zero were previously
blocking **by accident of the runner, not by decision**. Making them advisory
is the explicit call above.

**The lock.** `scripts/__tests__/guardrail-core.test.mjs` pins the severity of
**every** gate on `pre-commit` and `ci-pr`, the two channels run-gates runs as
blocking (`.husky/pre-commit`, `.github/workflows/quality.yml`). Each channel's
table must match exactly, so the test fails in any of three cases: a row flips
severity, a gate is added to one of those channels, or a gate is moved off one.
Changing a row is a standards decision, so update that test and this record
together. The test runs in `pnpm test`, which `.husky/pre-push` runs.

## Validator

`scripts/validate-guardrail-registry.mjs` walks `scripts/check-*.mjs` and
`scripts/audit-*.mjs` and asserts every file is registered. Exit 1 with a
missing list if not. Exit 0 if clean.

Use `--update` to auto-append missing entries (stub fields, severity=warn, no
firingChannel — see [Adding a new gate](#adding-a-new-gate)).
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
