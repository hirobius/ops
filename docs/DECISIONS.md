# The paper trail — where decisions live

Start here when you need to know **why** something is the way it is, or before
re-litigating a choice someone already made.

There are four distinct records and they are not interchangeable. Knowing which
one a question belongs to is most of the work.

---

## 1. `docs/adr/` — design-system decisions (`001`–`008`)

Numbered `NNN-slug.md`, three digits. Decisions about the **design system**:
shadcn baseline, Tailwind reintegration, DTCG tokens as source, tier
classification, slot vocabulary.

Ops **consumes** `@hirobius/design-system`; it does not author it. These records
explain inherited constraints — they are history here, and live in the DS repo.

## 2. `docs/architecture/ADR-*` — ops architecture decisions (`0002`–`0004`)

Numbered `ADR-NNNN-slug.md`, four digits. Decisions about **this repo**: the
HDSLayout split, the bundle budget, the serverless handler wrappers.

> ⚠️ **The two namespaces collide.** `docs/adr/002-tailwind-reintegration.md` and
> `docs/architecture/ADR-0002-hdslayout-split.md` are unrelated decisions that
> both read as "ADR 2". Always cite the full path, never a bare number.
>
> They are not renumbered because ADR numbers are permanent by convention — a
> reused or shifted number breaks every citation that already exists. The fix is
> this index, not a migration.

`docs/architecture/README.md` describes the directory as holding design-system
ADRs. That is inaccurate — the files in it are ops decisions. Left as-is rather
than silently rewritten, because the README's _conventions_ section (naming,
numbering, immutability) is correct and worth keeping.

## 3. `docs/logs/AI_DECISION_LEDGER.md` — self-heal records

Timestamped root-cause/resolution entries for resolved test failures and layout
bugs. **Last written 2026-07-12** — the loop that appended to it stopped, the
same way `run-log.jsonl`, `events.jsonl` and `learned-rules.jsonl` did.

It is kept because eleven live documents cite it. Read it as history, not as a
current record, and do not assume a recent fix is in it.

## 4. `docs/ai/DONE-LOG.md` — what shipped, and what was retired

Session-level history: what was built, what was removed and why. This is the one
that is actually current — every session that does real work appends to it.

The `## Decisions` section of `docs/ai/HANDOFF.md` carries the newest few
decisions inline; older ones move here.

---

## Where a new decision goes

| The decision is about                                      | Write it                                |
| ---------------------------------------------------------- | --------------------------------------- |
| This repo's architecture, and reversing it would be costly | a new `docs/architecture/ADR-NNNN-*.md` |
| The design system                                          | the DS repo, not here                   |
| How we work (process, gates, metrics)                      | `docs/ai/FRONTIER-DOCTRINE.md`          |
| Something settled in a session                             | `docs/ai/HANDOFF.md` § Decisions        |
| Something deliberately NOT being done                      | `docs/ai/PARKED.md`, with a trigger     |

## What is NOT a decision record

`docs/archive/` holds superseded plans, specs and session captures. They record
what was _intended_ at a moment, which is not the same as what was decided or
what shipped. Do not cite them as precedent.

---

_Adrian's portfolio repo (`adr-eng/adrian-milsap`) is reported to hold further
decision history. It is outside this repo's session scope and has not been
audited — a session started against that repo could fold anything durable back
into this index._
