# docs/specs — epic specs

Canonical home for **spec-driven development** artifacts. Contract and rationale:
`docs/ai/FRONTIER-DOCTRINE.md` §2.

## Shape

**One file per epic: `docs/specs/<epic-slug>.md`.** Sections, in order:

| Section | What it carries |
|---|---|
| Outcome | What's true when this ships, in business terms + the north-star test |
| Acceptance criteria | The checklist, plus out-of-scope and the invariants that hold throughout |
| Current state | What exists today, with `file:line` references |
| Target shape | Seams, data flow, contracts |
| **Alternatives rejected** | **The section the document exists for** |
| Risks | What could go wrong, and what catches it |
| Tasks | Dependency-ordered slices, each one issue / one PR, with queue posture |

`_template.md` is the skeleton. Cross-repo epics live here in **ops** and link out.

Kiro's triad splits this across `requirements.md` / `design.md` / `tasks.md`. We
tried that on 2026-09-14 and collapsed it the same day: this repo's proven failure
mode is documents outliving their truth, and three files per epic is three things
to go stale. **What was load-bearing in the triad was the design step** — the
rejected-alternatives record we historically skipped — not the file count.

## When a spec is required

An epic that **spans more than three issues**, *or* **touches client-facing
output, client PII, or money**.

## When a spec is forbidden

Chores, bugs, single-issue work. Those keep the light issue → Ralph path. A spec
for a one-file fix is pure overhead.

## Keeping them honest

- Every spec carries `Status:` (`draft` / `active` / `shipped` / `abandoned`) and
  `Last verified:`.
- The PR closing an epic's last issue flips the spec to `shipped`. A `shipped`
  spec is history, not instruction.
- Issue scope changes ⇒ the Tasks table changes in the same PR (same lockstep rule
  as `docs/ARCHITECTURE.md` ⇄ `docs/pipeline-walkthrough.html`).
- A spec never gates the queue. Slices get `ralph-ready` when written; the spec is
  agent context, not a human approval step.

## Not here

`docs/archive/superpowers/specs/` is **archive** (a 2026-03→05 skill convention). No new
files there.
