<!--
Thanks for contributing to the Hirobius Design System (HDS).

Before opening this PR, please confirm you've read CONTRIBUTING.md and
docs/ai/AGENT_GUIDELINES.md (if you used AI agents to produce this PR).

Required checks: see docs/operations/required-checks.md
-->

## Linked unit

<!-- Link to the unit in docs/ai/orchestration.json this PR closes (e.g. `12s-infra-foo`). -->
<!-- If this PR is not driven by a unit, briefly explain why. -->

Unit: `<unit-id>`

## Summary

<!-- 1–3 sentences. What changed and why. -->

## Validator output

<!-- Paste the output of the 6 pre-commit gates. Do not skip. -->

```
$ pnpm typecheck
<paste exit status + last lines>

$ node scripts/check-manifest-drift.mjs
<paste output>

$ node scripts/check-binding-drift.mjs
<paste output>

$ node scripts/check-source-canon.mjs
<paste output>

$ node scripts/validate-manifest.mjs
<paste output>

$ node scripts/validate-orchestration.mjs
<paste output>
```

Reference: `docs/operations/required-checks.md`

## Breaking change

- [ ] This PR introduces a breaking change to a public API surface
      (component prop, token alias, manifest schema, validator behavior, exported type).

If checked, please describe the migration path below.

<!-- migration notes -->

## Screenshots (if visual)

- [ ] If this PR changes UI, before/after screenshots are attached.
- [ ] N/A — this PR is non-visual.

<!-- attach images here -->

## Checklist

- [ ] Commit message follows `<scope>(<area>): <unit-id> <summary>` format
      with the `Co-Authored-By` trailer (see CONTRIBUTING.md).
- [ ] Orchestration entry status was updated in the SAME commit as the
      deliverable (per `docs/ai/AGENT_GUIDELINES.md` §6).
- [ ] No `--no-verify` was used to bypass gates.
