# Release Tagging Protocol

> Recurring discipline for fix/* branches and main. Cross-reference: `12s-infra-pre-merge-squash-protocol`.

---

## When to Tag

| Moment | Tag Name | Who Creates It |
|---|---|---|
| Before squash-merge of a `fix/*` branch to `main` | `vMAJOR.MINOR.PATCH-pre-merge` | Agent or developer executing the merge |
| After squash-merge lands on `main` | `vMAJOR.MINOR.PATCH` | Same operator |

The pre-merge tag is a rescue point. If the rebase or squash loses anything, this tag lets you recover the branch tip without hunting through the reflog.

---

## Naming Convention

```
vMAJOR.MINOR.PATCH-pre-merge   # fix/* tip, before squash-merge
vMAJOR.MINOR.PATCH             # main, after squash-merge lands
```

Examples:
- `v0.2.0-pre-merge` — fix/ui-pipeline tip before Phase 12 squash-merge
- `v0.2.0` — main after fix/ui-pipeline merges

Increment rules (semantic versioning):
- **PATCH** — bug fixes, docs, infra, tooling changes with no API impact
- **MINOR** — new components, new scripts, new features, backwards-compatible schema changes
- **MAJOR** — breaking API changes, token renames, component removals

---

## Tag Message Requirements

Every annotated tag MUST include a multi-line message body covering:

1. **Branch tip commit hash** — `Tagging commit <hash>` (helps audit when tags were created)
2. **Session net delta** — bullet summary of what changed since the previous release tag
3. **Key decisions made** — architectural or process decisions ratified this cycle
4. **CI status** — whether all gates pass at the tagged commit

Example message (v0.2.0-pre-merge):

```
fix/ui-pipeline tip pre-squash-merge to main

Session delta (Phase 12 autonomous build):
- Multi-tenant token overlay architecture decided (scope: CSS custom properties per tenant)
- CI hardened: pnpm build added (Pod X), size-limit added warn-mode (Pod B1)
- Phase 5 + Phase 6 feature flags promoted to ON
- Bundle reduced ~80% via code-splitting + lazy routes
- Pre-commit gates promoted to hard-fail: validate-manifest, validate-orchestration

All validation gates pass at this commit.
```

---

## How to Create the Tag

```bash
# Pre-merge baseline (run on the fix/* branch, BEFORE rebase/squash):
git tag -a v0.2.0-pre-merge -m "$(cat <<'EOF'
fix/ui-pipeline tip pre-squash-merge to main

Session delta:
- <bullet 1>
- <bullet 2>

All validation gates pass at this commit.
EOF
)"

# Post-merge release tag (run on main, AFTER squash-merge lands):
git tag -a v0.2.0 -m "Release v0.2.0 — <one-line summary>"
```

---

## Squash-Merge Protocol (abbreviated)

Full protocol: `docs/operations/squash-merge-protocol.md` (created by `12s-infra-pre-merge-squash-protocol`).

Summary of the 6-step sequence:

1. **Tag baseline** — `git tag -a vX.Y.Z-pre-merge` on `fix/*` tip (THIS document).
2. **Rebase squash** — `git rebase -i` to fold `chore(history): post-commit auto-update` noise commits into their parents.
3. **Squash-merge** — `git merge --squash fix/ui-pipeline` onto main; single coherent commit per logical landing.
4. **Tag main** — `git tag -a vX.Y.Z` on the squash-merge commit.
5. **Push tags** — `git push --tags` (requires explicit Adrian instruction; never in autonomous runs).
6. **Delete branch** — locally + remote after tags are verified.

> **NEVER push tags in autonomous / agent runs.** Push only on explicit Adrian instruction.

---

## Tie-in to Orchestration Units

| Unit | Role |
|---|---|
| `12s-infra-tag-baseline-pre-merge` | Creates the pre-merge tag; documents this protocol |
| `12s-infra-pre-merge-squash-protocol` | Full squash-merge automation + `pnpm merge:squash` script |
| `12s-infra-done-status-validator` | Audits every `done` unit's validationCmd post-tag |

---

*Last updated: 2026-05-01 by agent executing 12s-infra-tag-baseline-pre-merge.*
