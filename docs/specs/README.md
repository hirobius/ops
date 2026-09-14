# docs/specs — the epic spec triad

Canonical home for **spec-driven development** artifacts. Contract and rationale:
`docs/ai/FRONTIER-DOCTRINE.md` §2.

## Shape

```
docs/specs/<epic-slug>/
  requirements.md   outcome, user-visible behaviour, acceptance criteria
  design.md         technical shape, seams touched, alternatives REJECTED and why
  tasks.md          dependency-ordered slices, each mapping 1:1 to an issue
```

Cross-repo epics live here in **ops** and link out. `_template/` holds skeletons.

## When a spec is required

An epic that **spans more than three issues**, *or* **touches client-facing
output, client PII, or money**.

## When a spec is forbidden

Chores, bugs, single-issue work. Those keep the light issue → Ralph path. A spec
for a one-file fix is pure overhead.

## Keeping them honest

- Every file carries `Status:` (`draft` / `active` / `shipped` / `abandoned`) and
  `Last verified:`.
- The PR closing an epic's last issue flips the spec to `shipped`. A `shipped`
  spec is history, not instruction.
- Issue scope changes ⇒ `tasks.md` changes in the same PR (same lockstep rule as
  `docs/ARCHITECTURE.md` ⇄ `docs/pipeline-walkthrough.html`).
- A spec never gates the queue. Slices get `ralph-ready` when written; the spec is
  agent context, not a human approval step.

## Not here

`docs/superpowers/specs/` is **archive** (a 2026-03→05 skill convention). No new
files there.
