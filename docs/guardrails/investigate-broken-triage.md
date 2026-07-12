# Investigate-broken triage — soft-gates audit

> Triage for ops#65. Source: `pnpm audit:soft-gates` (`scripts/audit-soft-gates.mjs`),
> re-run 2026-07-12. The committed `docs/guardrails/soft-gate-promotion-plan.md` is
> stale (generated 2026-05-06, lists a different 5-gate set — several since fixed,
> others newly broken); it is left as-is here since refreshing it is a separate,
> unrelated change (it also re-scores every promotable/baseline gate, not just the
> broken ones). This doc only covers the `investigate-broken` bucket.

The audit's `investigate-broken` bucket only means "non-zero exit + no parseable
`--json` violation count" — it does **not** mean the gate crashed. Two of the six
below are false positives of that classification (the gate runs fine and found a
real, working violation; it just doesn't emit `--json`, so the auditor can't tell
"working, found a violation" from "broken").

| #   | gate                   | disposition                     |
| --- | ---------------------- | ------------------------------- |
| 1   | `audit-tiers`          | retire — #175                   |
| 2   | `check-contrast`       | retire — #175                   |
| 3   | `check-link-integrity` | fix now — #176                  |
| 4   | `check-focus-states`   | fix now — #177                  |
| 5   | `check-route-smoke`    | needs-investigation — #178      |
| 6   | `audit-sites`          | no action — working as designed |

## 1. `audit-tiers` — retire

Crashes: `ENOENT public/hds-manifest.json`. `hds-manifest.json` is a
DS-authoring-gallery artifact (a manifest of `Hds*.tsx` components) — this repo
has zero `Hds*.tsx` files; that manifest is built and owned by the
`hirobius-design-system` repo, not generated here. Same class of gate as the ones
already separated out in #39/#54 (ops consumes the design system, it does not
author it).

Note: `hds-manifest.json` is referenced by several other scripts too
(`watch-roadmap.mjs`, `build-roadmap-data.mjs`, `check-snapshot-staleness.mjs`,
`scaffold-component.mjs`, `check-component-docs.mjs`, `audit-strengths.mjs`,
`audit-gate-replaceability.mjs`) — whether those also need retiring/repointing is
a bigger question than this one gate, out of scope here.

Filed as #175 (covers both `audit-tiers` and `check-contrast` — same root
cause, same call).

## 2. `check-contrast` — retire

Crashes: `ENOENT hirobius.tokens.json`. Same story — a DS design-token file this
repo doesn't own or generate. #39 already reclassified this gate `pre-commit →
manual`, but its target artifact still doesn't exist here, so even the soft
manual channel can't run it.

## 3. `check-link-integrity` — fix now

Not actually broken — it ran clean and found one real violation:
`src/app/routes.tsx:78` (`<Navigate to="/ops/tasks" replace />`), flagged as an
"invalid route." It isn't invalid: `path: 'tasks'` is a real child route under
the `path: 'ops'` parent. Root cause: the route-links sub-check validates hrefs
against a **hardcoded** `EXACT_ROUTES` allowlist in the script (not derived from
`routes.tsx`), and that list has drifted —

- missing several current routes as exact entries: `/ops/tasks`, `/ops/leads`,
  `/ops/digest`, `/ops/projects`, `/ops/clients` (only the `/ops/clients/` prefix
  is allowed, not the index route) — these are false-positive candidates.
- still lists routes that no longer exist: `/ops/sessions`, `/ops/briefing`,
  `/ops/atlas`, `/ops/build` — these would silently pass if anything still
  linked to them (false negative).

Also: the gate has no `--json` output, which is why the soft-gates auditor can't
tell "ran fine, found a violation" from "crashed" — that's the second, smaller
fix. Filed as #176 rather than patched inline here since it touches a shared
gate script (blast radius: anything else this repo cross-references routes
with) and deserves the smallest-slice/test-first treatment, not a same-PR
side-fix in a triage-only PR.

## 4. `check-focus-states` — fix now

Also not actually broken, same `--json`-less misclassification as #3. It found
7 real missing-focus violations across 4 ops-authored files: `LeadsPage.tsx`,
`PullLeadsForm.tsx`, `RalphPanel.tsx`, `TaskRow.tsx` (raw `<button>`/`<a>`
elements missing `className="hds-focus"` or the focus-carrying
Button/IconButton/Input primitives). This is real a11y debt, not a broken gate.
Filed as #177 — it's a UI change (CLAUDE.md's UI auto-validate rule applies:
typecheck + `test:layout` after), not a triage-doc change.

## 5. `check-route-smoke` — needs investigation

Fails with `browserType.launch: Executable doesn't exist at
.../chrome-headless-shell-1208/...` — the Playwright browser binary isn't
installed in this execution environment. CLAUDE.md notes Chromium is
preinstalled at `/opt/pw-browsers` in _remote_ sessions; this run didn't have
that path. Unclear whether this gate is genuinely broken in the channels it
actually fires from (`pnpm-meta`) or only fails in environments without the
browser install step — needs confirming from an environment where it's known to
have run before deciding fix vs. environment-only. Filed as #178.

## 6. `audit-sites` — no action, working as designed

Fails with two explicit, actionable errors: missing `PAGESPEED_API_KEY` and
missing `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, each naming the variable and
the fix — exactly the "fail loud and actionable" pattern CLAUDE.md mandates for
secret-backed features. This gate requires env only Adrian has set (Vercel/
production); it isn't defective, just env-gated. The auditor has no way to
distinguish "needs secrets" from "crashed," so it lands in `investigate-broken`
by construction. No fix needed — noting here so it isn't re-triaged next audit.
