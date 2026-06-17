# lead-intake

**Bucket 1 — Ingestion.** Replaces the broken Zapier bridge between WordPress
Gravity Forms and EZLynx.

## Spec

- **Trigger:** Gravity Forms webhook fires on form submission.
- **Input:** form payload (`first_name`, `last_name`, `email`, `phone`, `line_of_business`, `notes`, `referral_source`).
- **Process:** verify webhook signature → normalize via `mapGravityToApplicant()` → POST EZLynx applicant → emit lead-intake event for `auto-responder` to consume.
- **Output:** EZLynx applicant created, acknowledgment dispatched.
- **Systems:** `wordpress` (Gravity), `ezlynx`, `n8n`.

## Dependencies

- `acc-1` — EZLynx login (in-progress, sent 2026-05-01).
- `acc-2` — EZLynx API activation via BGI Agency.
- `acc-3` — WordPress + Gravity Forms backend access (todo).
- `tasks.json` `1-3` — Rebuild Zapier bridge (this workflow IS the rebuild).

## Test plan

1. Drop a sample Gravity payload at `fixtures/sample-gravity-lead.json` (already provided).
2. `node run.mjs` → expect a `dry-run` line in `_log.jsonl` describing the intended `POST /applicants` call.
3. Once `EZLYNX_API_KEY` lands: re-run, verify the live applicant lands in EZLynx sandbox.
4. From a real Gravity test form: end-to-end smoke test with `administration@lilacinsure.com` as the lead email.

## Promotion checklist (test → live)

- [ ] EZLynx API key + agency id present.
- [ ] EZLynx smoke test (`curl /applicants?limit=1`) returns 200.
- [ ] `ezlynx-field-map.json` validated against live sandbox response shape.
- [ ] WordPress webhook secret set (`WP_GRAVITY_WEBHOOK_SECRET`).
- [ ] Gravity test form submission produces correct `dry-run` log line.
- [ ] Conrad confirms test applicants look right in EZLynx.
- [ ] `productionRecipients` populated for this workflow's downstream notifications.
- [ ] `mode: "production"` flipped in `automation-config.json`.

## n8n workflow

Lives in `n8n/lead-intake.json` once we export it. Pattern: Gravity webhook
trigger → HTTP node → call this `run.mjs` → branch on success/failure.
