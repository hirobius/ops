# <Epic name>

Status: draft
Last verified: YYYY-MM-DD
Issues: #

## Outcome

One paragraph: what is true when this ships that isn't true today, in terms of the
business rather than the code.

**North-star test:** does this get a paying client site shipped sooner? Yes /
indirectly / no. If "no", the epic shouldn't exist — see `docs/ai/NORTH_STAR.md`.

## Acceptance criteria

- [ ] …

**Out of scope.** The adjacent things this deliberately does not do, so a slice
doesn't sprawl.

**Constraints that hold throughout.** Invariants this must not break (fabrication
bans, PII rules, money gates, schema contracts). Cite the enforcing gate where one
exists.

## Current state

What exists today, with `file:line` references. Be specific — this is the section
that saves an agent the most time.

## Target shape

The seams, the data flow, the contracts. A diagram if it earns its place.

## Alternatives rejected

**The section this document exists for.** A rejected option recorded here stops
the next session re-proposing it.

| Option | Why rejected |
| ------ | ------------ |
|        |              |

## Risks

| Risk | What catches it |
| ---- | --------------- |
|      |                 |

## Tasks

Dependency-ordered. Each row is one issue, one PR.

| #   | Issue | Slice | Depends on | Queue posture |
| --- | ----- | ----- | ---------- | ------------- |
| 1   | #…    | …     | —          | `ralph-ready` |

**Queue posture** is one of: `ralph-ready` (loop picks it up; a green gate merges
it, unless its diff touches a supervised revenue path, which waits for
`ralph-approved` — ops#238) · `ralph-ready` + `ralph-auto` (the engine arms
auto-merge at once, with NO path check yet — never for supervised-path slices) ·
`blocked: <reason>` (a named blocker, not a shrug). Per the doctrine, an unqueued slice
needs a stated reason — never a default.
