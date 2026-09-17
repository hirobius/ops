# Re-assessment: the "7 investigate-broken gates" — 2026-09-16

Re-scope of ops#226. The original ask ("scope the 7 broken gates surfaced by
the soft-gates audit") pointed at a phrase — `investigate-broken` — that only
survives in two archived handoffs from **before** this repo's `ops` split
(`docs/ai/archive/handoff-2026-05-06-evening.md` line 136,
`handoff-2026-05-06-late.md` line 101). This repo's actual history starts at
`b26b328` ("chore: initial import — Hirobius Ops", 2026-06-17) — a root
commit with no parents. Everything before that date describes a different,
larger (portfolio + design-system + ops) codebase that `ops` was split out
of. That matters for reading the table below: "deleted" below means _not
present anywhere in this repo's real history_, not that a commit on `main`
removed it.

## The 7, recovered and checked against current `main`

| #   | Gate                       | Status on current `main`                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --- | -------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `check-route-smoke`        | **Present, registered — still genuinely broken**                | `scripts/check-route-smoke.mjs` `DEFAULT_ROUTES` is unchanged pre-split content: `/`, `/vibe-sketchbook`, `/hds`, `/hds/case-studies/hirobius`, `/microsoft-design-systems`, `/visuals`, `/portfolio/draft` — these were the _portfolio_ repo's routes (matches `docs/audits/hiring-bar-audit-2026-05-10.md`, also pre-split). None of them exist as content routes in `src/app/routes.tsx` today — `/hds/*` is now a bare `<Navigate to="/ops" replace />`, and everything else 404s via the catch-all. `docs/guardrails/registry.json`'s own entry says so: `"wiringTodo": "should be ci-pr or ci-scheduled — not yet wired into a workflow that actually triggers it"`. It is also one of the 33 current `validate-fixture-proof-of-firing` stub-fixture gates (never proven to fire). Real route coverage for `ops`'s actual routes is already handled by `check-route-coverage.mjs` + `tests/layout-integrity.spec.ts` (pre-commit, wired, passing) — this gate is dead weight, not a gap. |
| 2   | `check-unit-overlap`       | **Absent — never existed in this repo's real history**          | Zero commits on `main`'s ancestry touch `scripts/check-unit-overlap.mjs` (`git log --follow` on `main` returns nothing). The only commit anywhere that creates it, `c57f80a` ("Fleet dispatch safety layer … #47"), sits on branch `claude/issue-47-20260708-2105` and is **not an ancestor of `main`** (`git merge-base --is-ancestor` fails) — issue #47 is closed but was never merged. So the May-2026 report describes a pre-split file that didn't carry into `ops`'s initial import, and a later, unrelated attempt to "revive" a same-named file (for fleet-dispatch file-overlap checking, not the original purpose) also never landed.                                                                                                                                                                                                                                                                                                                                                |
| 3   | `check-token-descriptions` | **Deleted — correctly, as part of the ops/design-system split** | Present at the initial import (`b26b328`), deleted the same day in `662d94c` ("feat(ops): adopt cleaned dashboard … fix deploy") along with its fixture. This is a token-authoring gate; `CLAUDE.md` states plainly that `ops` "does not author the design system." Superseded by nothing — it doesn't apply here.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | `check-tier-bypass`        | **Present, registered, passing**                                | `node scripts/check-tier-bypass.mjs` → exit 0 today. Also one of the 33 `validate-fixture-proof-of-firing` stub gates (unproven fixture, but the gate itself runs and passes).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5   | `check-link-integrity`     | **Present, registered, passing**                                | `node scripts/check-link-integrity.mjs` → exit 0 today (doc-refs, external, route-links all green). Not in the stub-fixture list — has a real fixture.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 6   | `audit-figma-system`       | **Deleted — correctly, as part of the ops/design-system split** | Same commit (`662d94c`) as #3, same reason: Figma-sync machinery belongs to the design-system repo, not `ops`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 7   | `audit-pages`              | **Present, registered, passing**                                | `node scripts/audit-pages.mjs` → exit 0 today. Also one of the 33 stub-fixture gates.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Still genuinely broken today

Only **#1, `check-route-smoke`**. It is present, registered, and would fail
if pointed at real content (it asserts markers that don't exist on this
app's routes) — but because it's unwired, that failure never fires, so it
sits as silent dead weight rather than a visible red gate. Filed as a
follow-up: **#357** ("check-route-smoke.mjs tests routes that don't exist in
this app — delete or rewrite it").

The other 6 are either passing today (#4, #5, #7) or not applicable to this
repo (#2 never existed here; #3, #6 correctly removed when `ops` stopped
authoring the design system).

## Overlap with the 32 (now 33) stub-fixture gates

`validate-fixture-proof-of-firing` currently reports **33** stub-fixture
gates (drifted from the 32 the issue was scoped against two days ago — a
gate was added or a fixture regressed in between; not chased further here,
out of scope). Of the 7 above, three are current stub-fixture gates:
`check-route-smoke`, `check-tier-bypass`, `audit-pages`. `check-link-integrity`
has a real fixture. This is the live thread `#226` pointed at — the stub
list is tracked by its own gate and doesn't need duplicate tracking here.

## #229 / #230 — status

- **#230** (B6 OSV/audit 100→95 drift): already closed 2026-09-16 as a
  duplicate of #67 (closed via merged PR #183) — B6 reflects live
  npm/OSV-advisory reachability, not a code regression. Confirmed still
  correct; nothing to add.
- **#229** (B2 OWASP SAMM 88→75 regression): this is a **re-filed duplicate
  of #66**, which was root-caused and fixed in merged PR #181
  (2026-07-12): two stale gate-id detectors in `computeB2()`
  (`scripts/generate-strength-report.mjs`) — `license` was hardcoded
  `false`, and `deps` matched retired design-token-drift gate ids instead of
  `audit-deps`. Verified the fix is still present on current `main`
  (`scripts/generate-strength-report.mjs:365-394`, `license` and `deps`
  detectors match today's registry ids) — B2 still computes to 88. Closed
  #229 as a duplicate with this evidence, mirroring how #230 was closed.

## Follow-ups filed

- **#357** — delete or rewrite `check-route-smoke.mjs` (the one real,
  remaining item from the original 7).
