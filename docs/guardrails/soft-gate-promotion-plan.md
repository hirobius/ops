# Soft-Gate Promotion Plan
> Generated 2026-05-06T21:36:19.863Z

## Summary

**Total soft gates audited:** 12 (of 65 registered)

| Recommendation | Count |
|---|---|
| promote-to-pre-commit | 4 |
| promote-to-pre-push | 0 |
| promote-to-ci-pr | 0 |
| baseline-then-promote | 1 |
| investigate-broken | 5 |
| stay-soft | 2 |

## Promotable now (clean + fast)

These gates exited 0 on the current tree and are fast enough to promote without a baseline.

| id | current channel | severity | duration (ms) | target channel |
|---|---|---|---|---|
| check-link-integrity | pnpm-meta | warn | 57 | pre-commit |
| check-style-discipline | pnpm-meta | warn | 28 | pre-commit |
| check-token-descriptions | pnpm-meta | warn | 25 | pre-commit |
| audit-gate-replaceability | manual | warn | 35 | pre-commit |

## Promotable after baseline

These gates found violations on the current tree. Record a baseline, burn down the violations, then promote.

| id | current channel | severity | violations | duration (ms) |
|---|---|---|---|---|
| audit-deps | pnpm-meta | warn | 2 | 526 |

## Investigate

These gates crashed, timed out, or returned an unexpected exit code. Fix before considering promotion.

| id | current channel | severity | exit code | error |
|---|---|---|---|---|
| audit-figma-system | manual | warn | 1 |  |
| audit-pages | pnpm-meta | warn | 1 |  |
| check-route-smoke | pnpm-meta | warn | null | timed out |
| check-tier-bypass | pnpm-meta | warn | 1 |  |
| check-unit-overlap | manual | error | 2 |  |

## Stay soft

These gates are slow (>5s), info-severity, or are artifact-generators — appropriate as manual / ci-scheduled only.

| id | current channel | severity | duration (ms) |
|---|---|---|---|
| audit-sbom | manual | warn | 57692 |
| audit-bundle | manual | warn | 15898 |

## Estimated A4 score lift

Current A4 (Strict Gating): **34/100** (25/74 strict).
If Adrian accepts all 4 "Promotable now" recommendations, strict count rises to **29/74** → A4 score **39/100** (+5 points).

> This plan is advisory only. No firingChannel values have been changed.
> Run `pnpm audit:soft-gates` again after any promotions to verify the updated baseline.
