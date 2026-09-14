# <Epic name> — tasks

Status: draft
Last verified: YYYY-MM-DD

Dependency-ordered. Each row is one issue, one PR.

| # | Issue | Slice | Depends on | Queue posture |
|---|---|---|---|---|
| 1 | #… | … | — | `ralph-ready` |

**Queue posture** is one of: `ralph-ready` (loop picks it up, human approves the
merge) · `ralph-ready` + `ralph-auto` (self-merges on a green gate) · `blocked:
<reason>` (named blocker, not a shrug). Per the doctrine, an unqueued slice needs
a stated reason — never a default.
