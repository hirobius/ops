# OPERATING_MAP

Short guide for where information should go.

## Use This File For

- deciding which canonical doc to update
- understanding the project's information flow

Do not use it as a second policy file.

## Where Things Go

| If you have...                                                 | Put it in...            |
| -------------------------------------------------------------- | ----------------------- |
| a new task or follow-up                                        | `TASKS.md`              |
| a page-review or docs-shell finding                            | `HDS_COMPLIANCE_LOG.md` |
| a process lesson or milestone Adrian explicitly wants archived | `PROCESS.md`            |
| a token-rule change                                            | `TOKEN_GOVERNANCE.md`   |
| a visual/brand rule change                                     | `DESIGN.md`             |
| a scripts/checks inventory update                              | `SYSTEMS_REGISTRY.md`   |
| a long-term memory item                                        | `claude-config/memory/` |

## Typical Flow

```text
task or finding
  -> implementation
  -> verification
  -> update the one canonical doc that owns the result
```

## Read Order

Default:

1. `CLAUDE.md`
2. open only the canon the task actually needs

Archived helper docs are not part of normal startup context.

## Drift Rule

If this file starts restating detailed policy, trim it and move the real rule back to the owning document.

## Surfaces: `/hds` (public) vs `/ops/atlas` (operator)

The HDS doc surface has two front doors. They share content; they do not duplicate it.

- **`/hds/*`** — the public-facing design-system reference. Used in recruiter/client demos. Canonical home of foundation pages (typography, color, spacing, shape, elevation, motion, breakpoints) and the component catalog. Owns visual presentation of those docs.
- **`/ops/atlas`** — the gated operator command center (sits behind `VITE_OPS_GATE_HASH`). Mirrors the design-system axes as tabs (Foundations / Components / Tokens / Pipeline) but route-throughs into `/hds/*` rather than duplicating the public layout. Atlas additionally surfaces operator-only views (component graph, token-hierarchy explorer, pipeline DAG).

Rule: a foundation/component doc page is authored once under `/hds`. Atlas may link to it, embed a summary, or build operator-only visualisations on top of the same data — but never fork the doc itself.
