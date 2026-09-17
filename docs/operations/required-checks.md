# GitHub Required Checks — Promotion Policy

This document inventories every workflow in `.github/workflows/`, tracks which are currently required for merging to `main`, and defines the criteria for promoting an optional workflow to a required branch-protection check.

---

## Current Workflow Inventory

| Workflow file              | Name                                 | Trigger                                                                        | Required for merge | Notes                                                                                                                 |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| `quality.yml`              | Quality gates                        | `push` + `pull_request` → `main`                                               | **YES**            | Build, then every `ci-pr` registry gate via `run-gates.mjs` (typecheck, type coverage, layout tests, …; #241).        |
| `responsive.yml`           | Responsive                           | `pull_request` → `main`                                                        | No                 | Wired in this commit (unit `12p-test-required-checks-promote`). Promote after first clean green run.                  |
| `collision.yml`            | Collision                            | `pull_request` → `main`                                                        | No                 | Wired in this commit (unit `12p-test-required-checks-promote`). Promote after first clean green run.                  |
| `hds-migration-audit.yml`  | HDS V1→V2 Migration Audit            | `push` + `pull_request` (path-filtered), `workflow_dispatch`                   | No                 | Advisory only — posts PR comment. Not a candidate for required-check promotion (path-filtered, informational).        |
| `sync-figma-variables.yml` | Sync Design Tokens → Figma Variables | `push` → `main` (path-filtered on `hirobius.tokens.json`), `workflow_dispatch` | No                 | Post-merge side-effect, not a PR gate. Not a candidate.                                                               |
| `token-scan.yml`           | HDS Token Scan                       | `deployment_status`                                                            | No                 | Runs on Vercel preview deployments only — not a PR check. Not a candidate.                                            |
| `secret-scan.yml`          | Secret scan                          | every `pull_request` + `push` → `main`, `workflow_dispatch`                    | No                 | gitleaks CLI over the changed commits only (ops#32). Candidate: job `gitleaks`, display `Gitleaks (changed commits)`. |

---

## Promotion Criteria

A workflow is eligible to become a required branch-protection check only when **all three** of the following are true:

1. **3 consecutive green merges.** The workflow has produced a passing result on 3 consecutive PRs that merged to `main`. This provides statistical confidence it isn't flaky and doesn't have an undetected baseline failure.

2. **No known blockers.** There are no open issues tagged with the workflow's name indicating a known intermittent failure, environmental drift, or unresolved baseline problem.

3. **Adrian approves.** Promotion to required is a deliberate team decision — it blocks merging, so it carries real cost. Confirm before flipping the setting.

---

## How to Promote a Workflow (GitHub UI)

1. Navigate to the repository on GitHub.
2. Go to **Settings → Branches**.
3. Under **Branch protection rules**, click **Edit** on the rule for `main`.
4. Scroll to **Require status checks to pass before merging**.
5. Enable the checkbox if not already checked.
6. In the search box, type the workflow's **job name** (the string after `name:` inside `jobs:` in the YAML, not the top-level `name:`):
   - `quality.yml` job: `gates` → display: `Typecheck, canon validators, and layout tests`
   - `responsive.yml` job: `responsive` → display: `Responsive tests`
   - `collision.yml` job: `collision` → display: `Collision tests`
7. Select the matching check from the autocomplete list.
8. Save changes.

Note: A workflow must have run at least once on a PR targeting `main` before it appears in the autocomplete list. If a newly added workflow is not yet visible, open a draft PR to trigger it, then return here.

---

## Promotion Roadmap

| Workflow         | Blocking condition                                     | Target state                           |
| ---------------- | ------------------------------------------------------ | -------------------------------------- |
| `responsive.yml` | None known — waiting on first CI run after this commit | Promote to required after 3 green runs |
| `collision.yml`  | None known — waiting on first CI run after this commit | Promote to required after 3 green runs |

---

## Notes on Collision vs. Responsive

`collision.spec.ts` and `responsive.spec.ts` are distinct suites with different failure modes and should remain separate workflows:

- **responsive** — validates layout reflow, text overflow, and scroll at multiple viewport widths (mobile-sm through desktop). Catches breakpoint regressions.
- **collision** — validates element overlap and z-index layering at each breakpoint. Catches stacking-context regressions (overlapping navs, modals, tooltips). These can pass responsive checks while still colliding.

Keeping them separate also means a responsive regression doesn't mask a collision failure (and vice versa) when scanning PR checks at a glance.
