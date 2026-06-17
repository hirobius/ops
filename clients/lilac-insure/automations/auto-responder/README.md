# auto-responder

**Bucket 2 — Triage.** Lead acknowledgment email within 5 minutes of form
submission. Buys Conrad time to make his personal first call.

## Spec

- **Trigger:** `lead-intake` workflow emits a "lead-created" event.
- **Input:** lead first name + line of business.
- **Process:** render template → send via Microsoft Graph (Outlook) using `administration@lilacinsure.com` as sender.
- **Output:** acknowledgment email delivered to lead; copy to test recipient in test mode.
- **Systems:** `outlook` (Graph), `n8n`.

## Dependencies

- `tasks.json` `2-3` — Set up auto-responder lead acknowledgment.
- Depends on `lead-intake` event shape (defined in this scaffold).

## Test plan

1. Sample lead-event at `fixtures/sample-lead-event.json`.
2. `node run.mjs` → log a `dry-run` line describing the rendered email + recipient (always `testRecipient` in test mode).
3. Send a real Gravity test form with `administration@lilacinsure.com` as the lead email — confirm the acknowledgment arrives within 5 minutes.

## Promotion checklist (test → live)

- [ ] Microsoft Graph credentials provisioned (`MS_GRAPH_*`).
- [ ] Conrad approves the template copy + signature block.
- [ ] DKIM/SPF on `lilacinsure.com` confirmed (Conrad — verify via mxtoolbox).
- [ ] 3 test sends to `administration@lilacinsure.com` land in inbox (not spam).
- [ ] `productionRecipients` is intentionally empty (this workflow sends to the *lead's* email address — not an allowlist, it's per-event). Document this in promotion notes.
- [ ] `mode: "production"` flipped.

## Template (draft)

> Subject: Thanks for reaching out to Lilac Insurance
>
> Hi {{first_name}},
>
> Thanks for getting in touch about your {{line_of_business}} coverage. I'll
> review what you sent and reach out personally within the next business day.
>
> If anything urgent, you can reach me directly at (509) XXX-XXXX.
>
> — Conrad Milsap, Lilac Insurance Group
