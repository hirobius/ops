# cancellation-winback

**Bucket 4 — Lifecycle.** Three-touch follow-up sequence after a policy
cancellation. Goal: surface why they left, offer a path back.

## Spec

- **Trigger:** EZLynx `policy.cancelled` webhook.
- **Input:** policy id, customer contact, cancel reason (if captured).
- **Process:** schedule 3-touch sequence over 14 days. Touch 1 = empathetic check-in. Touch 2 = win-back offer (if reason was price). Touch 3 = closing courtesy + door open.
- **Output:** outreach delivered + EZLynx note per touch.
- **Systems:** `ezlynx`, `outlook`, `n8n`.

## Dependencies

- `tasks.json` `4-2` — Build cancellation win-back follow-up.
- `acc-1`, `acc-2` — EZLynx access + API.

## Test plan

1. Sample cancellation event at `fixtures/sample-cancellation-event.json`.
2. `node run.mjs` → log a `dry-run` line per touchpoint.
3. Once EZLynx access lands: trigger from a sandbox cancellation, walk the 14-day sequence in compressed time.

## Promotion checklist (test → live)

- [ ] EZLynx webhook subscription confirmed for `policy.cancelled`.
- [ ] Conrad approves all 3 touch templates (tone matters here — empathetic, not desperate).
- [ ] DKIM/SPF on `lilacinsure.com` confirmed.
- [ ] First live test: a single recently-cancelled policy with explicit Conrad opt-in.
- [ ] EZLynx note POST confirmed for each touch.
- [ ] `mode: "production"` flipped only after the first single-policy run looks right.

## Sequence

| Touch | Channel | Day | Purpose |
|-------|---------|-----|---------|
| 1 | Email | Day 1 | Empathetic check-in: "Sorry to see you go. Is there anything we missed?" |
| 2 | Email | Day 7 | Win-back offer (conditional on reason = price) |
| 3 | Email | Day 14 | Closing courtesy: "Door's open if anything changes." |
