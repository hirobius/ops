# Architecture Decision Records (ADRs)

This directory holds Architecture Decision Records for the Hirobius Design System.
ADRs capture architectural decisions whose reversal would be costly, or whose
rationale future readers need to understand without re-deriving it.

For doctrine, conventions, and agent guidelines — see `docs/ai/AGENT_GUIDELINES.md`
(that is an operational doctrine doc, not an ADR).

---

## Naming convention

```
ADR-NNNN-<slug>.md
```

- `NNNN` — 4-digit, zero-padded, monotonic integer (e.g. `0001`, `0042`).
- `<slug>` — lowercase kebab-case summary (e.g. `multi-tenant-scope`).
- Numbers are **never reused**. Once assigned, a number stays attached to its
  decision forever — even if the decision is later superseded.

**Next number:** `ADR-0004` (highest existing = `ADR-0003`).

---

## Lifecycle

```
proposed  →  accepted  →  superseded
```

| Status | Meaning |
|---|---|
| `proposed` | Decision under discussion; not yet ratified. |
| `accepted` | Landed decision; in effect. Default state for shipped ADRs. |
| `superseded` | Replaced by a newer ADR. Populate the `superseded-by` field. |

---

## Frontmatter schema

Every ADR file must start with this YAML block:

```yaml
---
id: ADR-NNNN
title: <Human-readable title matching the file's H1>
status: proposed | accepted | superseded
date: YYYY-MM-DD
supersedes: []          # list of ADR ids this ADR replaces, e.g. [ADR-0001]
superseded-by: []       # list of ADR ids that replace this one
---
```

---

## When to write an ADR

Write an ADR when:

- The decision's reversal would require touching many files, breaking tenants,
  or retraining contributors (e.g. changing the CSS scope mechanism).
- Future readers (including AI agents) need the *why*, not just the *what*.
- Multiple options were seriously considered and the rejected paths matter.
- The decision propagates downstream into other units or systems.

You do **not** need an ADR for:

- Routine implementation choices within a single unit.
- Decisions that are trivially reversible with no downstream impact.
- Anything already captured in `docs/ai/AGENT_GUIDELINES.md` as a convention.

---

## Current ADRs

| ID | Title | Status | Date |
|---|---|---|---|
| [ADR-0001](ADR-0001-multi-tenant-scope.md) | Multi-Tenant CSS Scope Decision | accepted | 2026-05-01 |
| [ADR-0002](ADR-0002-hdslayout-split.md) | HDSLayout Split Plan | accepted | 2026-05-01 |
| [ADR-0003](ADR-0003-bundle-budget.md) | Bundle Budget Decision | accepted | 2026-05-01 |

---

## Other files in this directory

These files are reference docs, not ADRs (no ADR numbering):

- `tenant-token-overlay-format.md` — per-tenant token overlay format spec.
- `scorecard.md` — current quality % per surface area.
- `strengths-and-differentiators.md` — product differentiation notes.
- `ADR-template.md` — starter template for new ADRs.

---

## Process

1. Copy `ADR-template.md` to `ADR-NNNN-<slug>.md` using the next available number.
2. Fill in the frontmatter and all section headings.
3. Open as `status: proposed` until ratified.
4. On ratification, change `status` to `accepted`.
5. When superseded by a newer ADR, change `status` to `superseded` and populate
   `superseded-by`. Also update the newer ADR's `supersedes` field.
