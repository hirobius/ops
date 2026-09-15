# Checks / Hooks / Triggers Inventory
<!-- unit: 10o-3-checks-hooks-triggers-audit | generated: 2026-05-02 | session: session:fresh-2026-05-02-w2-a7 -->

Audit of all validation scripts, sync flows, hooks, CI triggers, and
automations.  Predecessor unit `12i-quality-dormant-validators-triage`
(commit `20f351e`) covered the *dormant* check:* landscape; this document
covers the full pipeline including CI, hooks, and cross-surface gaps.

---

## 1. Local Git Hooks  (`.husky/`)

### pre-commit
Runs on every `git commit`. Sequential, blocking.

| Step | Script / command | Notes |
|------|-----------------|-------|
| 1 | `pnpm typecheck` | TypeScript noEmit |
| 2 | `node scripts/check-token-rebake-needed.mjs` | Detects generated-token drift |
| 3 | `pnpm lint --max-warnings=210` | Non-blocking (` \|\| true`) |
| 4 | `node scripts/check-manifest-drift.mjs` | |
| 5 | `node scripts/check-binding-drift.mjs` | |
| 6 | `node scripts/check-source-canon.mjs` | |
| 7 | `node scripts/validate-manifest.mjs` | |
| 8 | `node scripts/validate-orchestration.mjs` | |
| 9 | `node scripts/check-component-completeness.mjs` | |

**Installed via:** `pnpm prepare` → `node scripts/setup-hooks.mjs`

### pre-push
Runs on every `git push`. Heavier, blocking.

| Step | Script / command |
|------|-----------------|
| 1 | `pnpm check:full` (33 validators) |
| 2 | `pnpm test:a11y` (Playwright) |
| 3 | `pnpm run heal` (self-heal smoke) |
| 4 | `node scripts/visual-ingest.mjs --foundation-parity` |

---

## 2. `pnpm check:*` Alias Map

| Alias | Scripts invoked | Tier |
|-------|----------------|------|
| `check:fast` | 19 check scripts (no a11y/full-color/grids/motion) | Dev-loop gate |
| `check:full` | 33 check scripts (superset of fast + a11y/color/grids/security etc.) | Pre-push / CI |
| `check:release` | `check:full` + `check-inline-styles` + `check-route-smoke` + build + perf + all Playwright suites + size-limit | Release only — NEVER run in autonomous loop |
| `check` | Alias for `check:full` | |
| `check:docs` | `check-component-docs` + `check-frozen-demos` + `check-token-description-quality` | Subset; included in both fast + full |
| `check:ghost-tokens` | `audit-tokens.mjs --full` | Standalone token audit |
| `check:forbidden-overrides` | `audit-tokens.mjs --forbidden` | |
| `check:semantic-report` | `audit-tokens.mjs --report-only` + `record-health.mjs` | |
| `check:figma-snapshot` | `test-figma-masters-snapshot.mjs` | Manual / snapshot update |
| `check:knip` | `knip` | Dead-export scanner |

### Dormant / manual-only checks (documented in `package.json` `_comment` fields)
These aliases exist and are wired, but not included in `check:fast` or `check:full`.
Reason: pre-commit performance and/or CI stability risk.

| Alias | Script | Dormant reason |
|-------|--------|---------------|
| `check:contrast` | `check-contrast.mjs` | A11y — candidate for CI lane |
| `check:focus` | `check-focus-states.mjs` | Found 1 real violation; kept manual |
| `check:motion` | `check-reduced-motion.mjs` | A11y — candidate for CI lane |
| `check:aria` | `check-aria-labels.mjs` | A11y — candidate for CI lane |
| `check:semantic` | `check-semantic-html.mjs` | A11y — candidate for CI lane |
| `check:css-values` | `check-css-values.mjs` | Overlaps with check:fast token validators |
| `check:token-structure` | `check-token-structure.mjs` | Overlaps with check:fast |
| `check:doc-refs` | `check-doc-references.mjs` | Link integrity (doc surface) |
| `check:routes` | `check-route-links.mjs` | Link integrity (route surface) |
| `check:security` | `check-security-baseline.mjs` | Candidate for security CI lane |

> Note: `check:contrast`, `check:aria`, `check:semantic` (the first three a11y checks)
> are in `check:full` — they are not in `check:fast`, but are NOT fully dormant.
> The dormant tier above is what is excluded from both.

---

## 3. `pnpm pretest`

Runs automatically before `pnpm test` (vitest). Heavy overlap with pre-commit.

| Script | Also in pre-commit? |
|--------|-------------------|
| `validate-manifest.mjs` | Yes |
| `check-manifest-drift.mjs` | Yes |
| `check-component-completeness.mjs` | Yes |
| `check-source-canon.mjs` | Yes |
| `check-binding-drift.mjs` | Yes |
| `test-figma-masters-snapshot.mjs` | No |
| `test-doc-pages-snapshot.mjs` | No |
| `check-registry.mjs` | No |
| `validate-orchestration.mjs` | Yes |
| `knip --no-exit-code` | No |

**Overlap note:** 6 of 10 pretest scripts duplicate pre-commit gates.
This is intentional redundancy (CI runs `pnpm test` without hooks), not drift.

---

## 4. CI Workflows (`.github/workflows/`)

| File | Trigger | Required check? | Notes |
|------|---------|----------------|-------|
| `quality.yml` | push/PR → main | Yes (implied by name) | typecheck, manifest-drift, binding-drift, source-canon, layout Playwright |
| `a11y.yml` | PR → main | NOT YET — needs baseline run | continue-on-error pending |
| `collision.yml` | PR → main | NOT YET — needs baseline run | |
| `visual.yml` | PR → main | NOT YET — needs baseline run | |
| `responsive.yml` | PR → main | NOT YET — needs baseline run | |
| `hds-migration-audit.yml` | push feature/**, PR → main | Yes (fails on violations) | **DEAD PATH: `scripts/audit-component-source.js` does not exist** |
| `sync-figma-variables.yml` | push → main (hirobius.tokens.json path filter) | No | Build + commit back generated Figma vars |
| `llm-daily-synthetic.yml` | daily cron 08:00 UTC + workflow_dispatch | No | Prompt regression against 8 goldens |
| `strengths-audit.yml` | weekly Monday 13:00 UTC + workflow_dispatch | No | Audit documented differentiators |
| `token-scan.yml` | deployment_status (preview only) | No | Runs against live Vercel preview URL |

---

## 5. Scripts Inventory Summary

### Orphan scripts (exist in `/scripts/`, no `package.json` alias AND no CI/hook reference)

| Script | Assessment |
|--------|-----------|
| `build-llms-txt.mjs` | Possible superseded by `generate-llms-txt.mjs` (aliased as `llms:generate`) |
| `enrich-manifest.mjs` | No consumers found in repo |
| `setup-figma-canvas.mjs` | No consumers found |
| `update-commit-history.mjs` | Referenced only in `docs/ai/` (2 refs) — likely manual utility |

### Scripts with no `package.json` alias but referenced in CI / hooks / docs

| Script | Where used |
|--------|-----------|
| `check-token-rebake-needed.mjs` | `.husky/pre-commit` + docs (6 refs) |
| `check-font-files.mjs` | Referenced in docs (2 refs) — no alias |
| `check-token-renames.mjs` | Referenced in docs (3 refs) — no alias |
| `audit-claims.mjs` | `MULTI_AGENT_OVERNIGHT.md` + docs (4 refs) |
| `dispatch-pod.mjs` | Used by agents (8 refs) |
| `orchestration-watcher.mjs` | Autonomous build protocol (7 refs) |
| `run-validator-tests.mjs` | Referenced in docs (34 refs — validator test runner) |

---

## 6. Findings and Flags

### Dead path (high priority)
- **`hds-migration-audit.yml` invokes `scripts/audit-component-source.js` which does not exist.**
  The CI step will always fail if triggered. Path filters on `src/app/**` mean it runs on most PRs.
  Recommendation: either restore the script or disable/delete the workflow.
  Source: `.github/workflows/hds-migration-audit.yml:35` + `ls scripts/audit-component-source.js` → missing.

### Duplicated logic (low priority)
- `check-style-prop-values.mjs` appears in both `check:full` and `check:release` explicitly.
  In `check:release` the call is redundant because `check:release` starts with `pnpm check:full`.
  Source: `package.json` `check:release` value.

### Coverage gap
- `validate-manifest.mjs` and `validate-orchestration.mjs` are in pre-commit and pretest
  but NOT in `quality.yml` CI. Pre-push covers them (via `check:full`), but they are
  not exercised in the CI merge gate. Low risk; pre-push is a strong local gate.

### Dormant a11y checks not yet promoted to required CI
- `a11y.yml`, `collision.yml`, `visual.yml`, `responsive.yml` all carry `continue-on-error: true`
  and the comment "Not a required check for merge yet".
  Recommendation: wire smoke baseline and promote to required after first green run.

### `sync-asset-manifest.mjs` not in hooks
- `check:fast` and `check:full` both invoke `sync-asset-manifest.mjs` but it is not
  in `.husky/pre-commit`. The pre-commit hook relies on `check-manifest-drift.mjs`
  alone as the manifest gate — which is correct (sync is a build step, not a pre-commit check).
  No action required.

---

## 7. Recommended Next Units

Based on this audit, the following follow-on work is unblocked:

| Recommended unit | Scope |
|-----------------|-------|
| Restore or delete `hds-migration-audit.yml` / `audit-component-source.js` | Dead path fix |
| Promote a11y/visual/collision/responsive to required CI checks | Needs baseline run |
| Wire `check:focus` into pretest (or `check:fast`) | 1 known violation found |
| Add `check:font-files` alias pointing to `check-font-files.mjs` | Discovery gap |

---

*Grounded against: `package.json` (scripts section), `.husky/pre-commit`, `.husky/pre-push`,
`.github/workflows/*.yml`, `scripts/` directory listing, commit `20f351e` (prior dormant audit).*
