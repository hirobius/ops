# PARKED — fixture: nothing due

**Next quarterly review: 2099-01-01.**

### An item whose trigger has not fired

- **origin:** ops#000 (closed 2026-09-15)
- **trigger:** `date: 2099-12-31`
- **why parked:** the date is far in the future, so the evaluator should report nothing due and exit 0.

### An item gated on a human-judged event

- **origin:** ops#001 (closed 2026-09-15)
- **trigger:** `event: a condition only a human can assess`
- **why parked:** event triggers are never auto-fired; they surface only at the quarterly review, which is not due here.
