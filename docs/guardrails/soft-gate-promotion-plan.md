# Soft-Gate Promotion Plan

> Generated 2026-09-19T22:34:35.305Z

## Summary

**Total soft gates audited:** 35 (of 63 registered)

| Recommendation        | Count |
| --------------------- | ----- |
| promote-to-pre-commit | 18    |
| promote-to-pre-push   | 3     |
| promote-to-ci-pr      | 2     |
| baseline-then-promote | 6     |
| investigate-broken    | 3     |
| stay-soft             | 3     |

## Promotable now (clean + fast)

These gates exited 0 on the current tree and are fast enough to promote without a baseline.

| id                            | current channel | severity | duration (ms) | target channel |
| ----------------------------- | --------------- | -------- | ------------- | -------------- |
| check-circular-deps           | manual          | error    | 59            | pre-commit     |
| check-skills-lock             | manual          | error    | 52            | pre-commit     |
| audit-gate-replaceability     | manual          | warn     | 54            | pre-commit     |
| audit-pages                   | pnpm-meta       | warn     | 63            | pre-commit     |
| check-attributions            | manual          | warn     | 46            | pre-commit     |
| check-code-connect            | manual          | warn     | 51            | pre-commit     |
| check-commit-message-task-ref | commit-msg      | warn     | 53            | pre-commit     |
| check-doc-structure           | manual          | warn     | 45            | pre-commit     |
| check-focus-states            | manual          | warn     | 57            | pre-commit     |
| check-frozen-demos            | manual          | warn     | 44            | pre-commit     |
| check-handoff-freshness       | manual          | warn     | 46            | pre-commit     |
| check-motion                  | manual          | warn     | 46            | pre-commit     |
| check-reduced-motion          | manual          | warn     | 44            | pre-commit     |
| check-registry                | manual          | warn     | 45            | pre-commit     |
| check-snapshot-staleness      | manual          | warn     | 44            | pre-commit     |
| check-tier-bypass             | pnpm-meta       | warn     | 52            | pre-commit     |
| check-parked-triggers         | ci-scheduled    | warn     | 49            | pre-commit     |
| check-migration-ledger        | manual          | warn     | 54            | pre-commit     |
| check-dom-node-budgets        | manual          | error    | 585           | pre-push       |
| check-editorconfig            | pnpm-meta       | warn     | 841           | pre-push       |
| check-link-integrity          | pnpm-meta       | warn     | 511           | pre-push       |
| audit-orphan-modules          | pnpm-meta       | warn     | 3667          | ci-pr          |
| audit-sites                   | ci-dispatch     | warn     | 2571          | ci-pr          |

## Promotable after baseline

These gates found violations on the current tree. Record a baseline, burn down the violations, then promote.

| id                       | current channel | severity | violations | duration (ms) |
| ------------------------ | --------------- | -------- | ---------- | ------------- |
| check-production-health  | manual          | error    | 2          | 46            |
| audit-deps               | pnpm-meta       | warn     | 86         | 1066          |
| check-spec-freshness     | manual          | warn     | 1          | 172           |
| harvest-park-signals     | manual          | warn     | 1          | 176           |
| reconcile-ralph-closures | manual          | warn     | 1          | 158           |
| check-sev1-visibility    | pnpm-meta       | warn     | 1          | 51            |

## Investigate

These gates crashed, timed out, or returned an unexpected exit code. Fix before considering promotion.

| id                        | current channel | severity | exit code | error |
| ------------------------- | --------------- | -------- | --------- | ----- |
| audit-strengths           | ci-scheduled    | warn     | 1         |       |
| metric-north-star-share   | manual          | warn     | 1         |       |
| metric-human-gate-latency | manual          | warn     | 1         |       |

## Stay soft

These gates are slow (>5s), info-severity, or are artifact-generators — appropriate as manual / ci-scheduled only.

| id               | current channel | severity | duration (ms) |
| ---------------- | --------------- | -------- | ------------- |
| audit-sbom       | manual          | warn     | 17847         |
| audit-bundle     | manual          | warn     | 14200         |
| audit-orphan-wip | manual          | info     | 60            |

## Estimated A4 score lift

Current A4 (Strict Gating): **34/100** (25/74 strict).
If Adrian accepts all 23 "Promotable now" recommendations, strict count rises to **48/74** → A4 score **65/100** (+31 points).

> This plan is advisory only. No firingChannel values have been changed.
> Run `pnpm audit:soft-gates` again after any promotions to verify the updated baseline.
