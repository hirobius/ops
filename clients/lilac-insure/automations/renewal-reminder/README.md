# renewal-reminder

**Bucket 4 — Lifecycle.** Replaces physical mail renewal letters with text +
email reminders triggered by EZLynx renewal dates.

## Spec

- **Trigger:** EZLynx `policy.renewal_due` webhook (or polled query while we wait for webhook subscription) at T-30, T-14, and T-3 days before policy expiration.
- **Input:** policy id, customer name + contact info, renewal date.
- **Process:** render template → send via Outlook (email) and LightSpeed (SMS) → POST EZLynx note recording the touch.
- **Output:** reminder delivered + EZLynx note logged.
- **Systems:** `ezlynx`, `outlook`, `lightspeed`, `n8n`.

## Dependencies

- `tasks.json` `4-1` — Build renewal reminder sequence.
- `acc-1`, `acc-2` — EZLynx access + API.
- `acc-6` — LightSpeed Voice / Orbit API for SMS send.

## Test plan

1. Sample renewal payload at `fixtures/sample-policy-renewal.json`.
2. `node run.mjs` → log a `dry-run` line per touchpoint (T-30, T-14, T-3).
3. Once EZLynx + LightSpeed access lands: dry-run against a real test policy in EZLynx sandbox.
4. With Conrad: pick one policy near renewal, opt-in to live for that policy only, watch the touch sequence end-to-end.

## Promotion checklist (test → live)

- [ ] EZLynx webhook subscription confirmed for `policy.renewal_due`.
- [ ] LightSpeed SMS send confirmed (test SMS to Adrian's phone).
- [ ] Template copy approved by Conrad (email + SMS).
- [ ] Opt-out language in SMS meets WA state requirements (Conrad to verify).
- [ ] EZLynx note POST confirmed (so Conrad can see the audit trail in the client file).
- [ ] `productionRecipients` not used — recipients come from the EZLynx policy record per event.
- [ ] `mode: "production"` flipped after a single-policy live test passes.

## Sequence

| Touch | Channel | Timing |
|-------|---------|--------|
| 1 | Email + SMS | T-30 days |
| 2 | Email | T-14 days |
| 3 | SMS | T-3 days |

Email-only at T-14 to reduce SMS volume; SMS-only at T-3 for last-mile urgency.
