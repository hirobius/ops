---
client: lilac-insure
deliverable: 'Phase 1 #5 — Tool & access review'
audience: Conrad Milsap
date: 2026-05-05
source-files: stack.json, checklist.json, automation-config.json
---

# Lilac Insure — Tool & Access Review

## System Access Status

| System                    | Vendor        | Role in agency                                                    | Access state                                                                      | Credential holder    | Blocked on                                                                        | Who owns the unblock                                                         |
| ------------------------- | ------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| EZLynx                    | BGI / EZLynx  | Agency management — central hub for all client/policy data        | **Pending** — login credentials sent 2026-05-01; API activation not yet confirmed | Conrad               | BGI Agency needs to add admin user seat; EZLynx ticket #1943345 open              | Conrad (follow up with BGI); Adrian (verify credentials received)            |
| Microsoft Outlook         | Microsoft     | Email + task management; inbox is the de-facto work queue         | **Pending** — Microsoft Graph API requires M365 app registration (Azure AD)       | Conrad (M365 tenant) | M365 dev tenant not yet provisioned; Azure AD app creds not issued                | Adrian (provision dev tenant per `docs/operations/m365-dev-tenant-setup.md`) |
| WordPress + Gravity Forms | Conrad's host | Lead intake — primary form-to-agency entry point                  | **Pending** — admin backend access not yet shared                                 | Conrad               | No blocker on Conrad's side; needs to share WP admin credentials or create a user | Conrad                                                                       |
| DocuSign                  | DocuSign      | Client document signing — onboarding and commercial renewals      | **Pending** — integrator key and account IDs not yet shared                       | Conrad               | No blocker on Conrad's side; needs to share integrator key                        | Conrad                                                                       |
| LightSpeed Voice / Orbit  | LightSpeed    | VoIP phone system; pulls EZLynx file on inbound calls             | **Unknown** — API surface unconfirmed; no credentials requested yet               | Conrad               | API availability needs to be confirmed with LightSpeed                            | Adrian (investigate API docs); Conrad (if support call needed)               |
| Wonder Write              | Wonder Write  | Digitizes ACORD 125/126/140 forms; pulls contact info from EZLynx | **Unknown** — API availability unconfirmed                                        | Conrad               | API availability needs to be confirmed with Wonder Write                          | Adrian (investigate); Conrad (if vendor contact needed)                      |
| Zapier                    | Zapier        | Previous automation bridge (WordPress → EZLynx, Outlook → EZLynx) | **Replaced** — broken and not being repaired                                      | N/A                  | N/A — replaced by n8n                                                             | No action needed                                                             |
| n8n                       | Self-hosted   | Automation orchestration layer (replaces Zapier)                  | **Deferred** — not yet installed; workflow files are staged                       | Adrian               | n8n hosting decision not yet made (Conrad's PC vs. VPS)                           | Adrian + Conrad (resolve hosting, then Adrian installs)                      |

---

## Narrative Summary

### Live and ready

None of the systems are live and fully wired for automation yet. EZLynx, Outlook, WordPress, and DocuSign are all active as software Conrad uses daily — they work fine for him manually. What's missing is the programmatic access layer (API keys, webhooks, Graph credentials) that lets the automation code talk to them. That gap is what Phase 1 is closing.

### Pending action

**EZLynx** is the most critical unblock. Conrad sent login credentials on 2026-05-01 — Adrian needs to confirm receipt. Beyond the login, EZLynx API activation requires a separate step: BGI Agency (the EZLynx reseller) needs to add an API/admin user seat. EZLynx support ticket #1943345 is already open and points at BGI. Conrad needs to follow up with BGI directly, or Adrian can draft that message for him.

**Outlook (Microsoft Graph)** is the second most important unblock. Email triage, auto-responder, and renewal reminders all require it. The path forward is Adrian provisioning an M365 developer tenant and registering an Azure AD application — this takes about 20 minutes and is documented in `docs/operations/m365-dev-tenant-setup.md`. No action needed from Conrad for this step.

**WordPress + Gravity Forms** needs Conrad to share admin access (a WP admin login or a new user with editor/admin role is fine). This is a 5-minute ask on Conrad's end and unblocks the lead-intake workflow going live.

**DocuSign** access is needed for Phase 2 work primarily (commercial renewals), but getting the integrator key now avoids a delay later. Conrad's DocuSign account settings page has the API credentials section.

**LightSpeed Voice / Orbit** and **Wonder Write** are lower priority — neither is required for Phase 1 delivery. The open question for both is whether they expose an API at all. Adrian will investigate vendor docs; if a support call is needed Conrad would initiate it.

### Known broken / replaced

**Zapier** is not being fixed. The Zapier bridges (WordPress → EZLynx and Outlook → EZLynx) failed and the decision was made to replace Zapier with n8n, which runs locally on Conrad's infrastructure rather than routing data through a third-party cloud. Zapier account access (checklist item acc-4) is intentionally abandoned — there is nothing to retrieve from it. The equivalent workflows are already staged as n8n JSON files under each automation folder; they go live once n8n is installed and Conrad's hosting location is confirmed.

---

## What changes when each access lands

- **EZLynx login confirmed** → Adrian can verify the field mapping used by lead-intake and renewal-reminder; dev/test work unblocked.
- **EZLynx API activation (BGI seat added)** → lead-intake, renewal-reminder, and cancellation-winback can be promoted from test to production.
- **Microsoft Graph credentials (M365 dev tenant)** → email-triage can be tested against a real mailbox; auto-responder send path unblocked.
- **WordPress + Gravity Forms access** → Gravity Forms webhook can be wired; lead-intake goes fully live (end-to-end: form submission → EZLynx record, no manual re-entry).
- **DocuSign integrator key** → onboarding document workflows can be automated; Phase 2 commercial renewal pre-fill path opened.
- **LightSpeed API confirmed** → Phase 2 call transcription POC can be scoped and started.
- **n8n hosting decision** → INSTALL.md can be written; Conrad gets a concrete setup checklist; all automation workflows can be deployed for real.
