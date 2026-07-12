# File-these issues — design-skills session follow-ups (2026-07-12)

The session GitHub connector was unauthenticated, so these seven follow-ups
could not be filed directly. Each block below is paste-ready (title → repo →
labels → body). File them, then delete this doc (it's a bridge, not a board).

---

## 1. ops — Dispatch a catalog invocation as an @claude task

Labels: `backlog`

The `/ops/skills` catalog (ExternalSkillsBar) is copy-only by design (Adrian,
2026-07-12). Add a per-invocation "dispatch" action that queues a task carrying
the invocation via the existing tasks-board write path
(`lib/tasks/actions.mjs` dispatch action → `@claude` issue), riding the
epic-#41 approvals inbox (`dispatch_status='queued'`). Acceptance: clicking
dispatch on `/impeccable critique <target>` creates a queued task whose body
contains the invocation + target; approve → issue opens.

## 2. ops — Fleet skills-lock installer (`scripts/install-skills.mjs`)

Labels: `backlog`

Depends on: nothing. Unblocks hds fresh clones (`.claude/skills/` gitignored).
One shared script (vendored to hds/site-engine like the ralph kit or run from
ops): reads `skills-lock.json` (now with optional `pinnedCommit`, `paths`,
`hashAlgorithm` fields — see hds/site-engine locks), fetches each path from
`raw.githubusercontent.com/<source>/<pinnedCommit>/<path>`, verifies
`computedHash` (sha256 of SKILL.md bytes at the pin — documented in the new
entries' `hashAlgorithm` field), installs under `.claude/skills/<id>/`.
Must also: define the canonical hash algorithm in one place and reconcile the
legacy `extract-design` entry (its hash predates the documented algorithm and
doesn't match sha256-of-raw-SKILL.md@main — recompute or annotate).

## 3. hds — check-impeccable-detect: consider ci-scheduled promotion + triage first findings

Labels: `backlog`

The gate landed with REAL proof-of-firing fixtures (violating: Inter +
bounce-easing; passing: clean) — the stub burn-down step is already done.
Remaining: (a) consider promoting `firingChannel` manual → `ci-scheduled`
once network-in-CI policy is settled (the wrapper exits 78 cleanly when npx
is unavailable, so it's safe to wire); (b) triage the 3 findings the first
src/ run surfaced: `card.tsx:351` width transition (layout-prop animation),
`tabs.tsx:54` border-accent-on-rounded, `fonts.css:37` Geist Mono
(deliberate brand choice — add `/* impeccable-disable-line overused-font */`).

## 4. hds — Decide: minimal components.json for shadcn skill project-awareness

Labels: `needs-adrian`

The shadcn skill (pinned in skills-lock.json per Adrian's "HDS stays
shadcn-oriented", ADR-001) reads `components.json` to inject project context
(`npx shadcn@latest info --json`). hds has none, so those features are inert.
Decide whether to add a minimal `components.json` (aliases → hds paths,
tailwind config pointer) or leave the skill as composition-pattern guidance
only. Small config, but it shapes how agents route component work — Adrian's
call.

## 5. ops — SkillUI vs extract-design bake-off

Labels: `backlog`

Run both extractors against ONE real prospect site (e.g. Monroe):
`npx skillui --url <site>` vs the pinned `extract-design` skill. Compare
token fidelity, font capture, screenshot usefulness, and Claude-consumability
of the output skill. Fold the verdict into `docs/ai/DESIGN_EXTRACT_GAP.md`
(addendum section already stubs this) and make the winner the documented
client-onboarding default.

## 6. site-engine — Retro-pin the 9 vendored Pocock skills in skills-lock.json

Labels: `backlog`

`skills-lock.json` landed with only the `impeccable` entry. For consistency
with the shared-pin schema, add entries (source, skillPath, pinnedCommit,
computedHash, paths) for the 9 committed engineering skills (code-review,
codebase-design, diagnosing-bugs, grill-me, implement,
improve-codebase-architecture, tdd, to-tickets, triage). Depends on #2's
hash-algorithm decision (file the dependency as "Depends on ops#<n>").

## 7. ops — Mobbin Pro subscription decision

Labels: `needs-adrian`

The Mobbin MCP catalog entry (`/ops/skills`) needs a paid Mobbin plan
(Pro, ~$10/mo) before `claude mcp add mobbin --scope user --transport http
https://api.mobbin.com/mcp` is usable. Decide subscribe / skip. Note:
interactive OAuth only — it will never serve Ralph/headless runs; value is
design-reference search (620k+ real app screens) in interactive HDS /
site-engine design sessions. Pricing: https://mobbin.com/pricing
