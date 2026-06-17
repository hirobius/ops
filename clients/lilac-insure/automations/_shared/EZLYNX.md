# EZLynx integration reference

EZLynx is the mandatory hub for Lilac. Every Phase 1 automation reads from or
writes to it. This file is the working reference — keep it close to the code.

## Status

- **API access:** pending. EZLynx Support ticket #1943345 confirmed 2 concurrent logins. Need BGI Agency to add the additional user seat that unlocks API. (`acc-2`)
- **Credentials:** Conrad sent EZLynx login from `administration@lilacinsure.com` on 2026-05-01. (`acc-1`)
- **Postman docs:** https://documenter.getpostman.com/view/17108315/UVXjHahb

## Env keys

Set in `.env.local` (handled by Adrian only — NEVER touched by automation code):

- `EZLYNX_API_KEY`
- `EZLYNX_AGENCY_ID`

## Surface we'll touch (Phase 1)

| Operation | Method/Path | Used by |
|-----------|-------------|---------|
| Create applicant | `POST /applicants` | `lead-intake` |
| Read applicant | `GET /applicants/{id}` | most workflows |
| Create policy | `POST /applicants/{id}/policies` | `lead-intake` (post-quote) |
| Patch policy | `PATCH /policies/{id}` | `renewal-reminder` log-back, `cancellation-winback` |
| Attach document | `POST /applicants/{id}/documents` | `lead-intake` (form export), Phase 2 ACORD pre-fill |
| Create task | `POST /tasks` | `email-triage` (when bucket = commercial), Phase 3 service-request-widget |
| Webhook | `POST /webhooks` | `renewal-reminder` (renewal_due), `cancellation-winback` (policy.cancelled) |

## Smoke test (run as soon as the key arrives)

```bash
# Replace EZLYNX_BASE_URL with the actual base from EZLynx onboarding.
curl -sS -H "Authorization: Bearer $EZLYNX_API_KEY" \
     -H "X-Agency-Id: $EZLYNX_AGENCY_ID" \
     "$EZLYNX_BASE_URL/applicants?limit=1" | jq .
```

Expected: HTTP 200, JSON envelope, at least one applicant record (or empty array if sandbox).

If 401: re-confirm activation status with EZLynx Support.
If 403: confirm BGI Agency added the additional user seat.

## Field map

Sketched in `ezlynx-field-map.json`. Open questions tracked there. Validate
against the live sandbox before promoting `lead-intake` to production.

## Webhook plan (later)

When we move from polling to event-driven:
1. Subscribe to `policy.renewal_due` (drives `renewal-reminder`).
2. Subscribe to `policy.cancelled` (drives `cancellation-winback`).
3. Verify signing secret on every inbound webhook.
4. Idempotency key on every handler — EZLynx may retry.

## What lives where

- `ezlynx-client.mjs` — REST client stub. Routes every call through `guardOutbound`. Replace dryRun branch with `fetch()` once the key is active.
- `ezlynx-field-map.json` — Gravity → EZLynx applicant field map + operation reference.
- This file — surface, status, smoke test, open questions.
