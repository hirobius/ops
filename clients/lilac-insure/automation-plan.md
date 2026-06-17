---
client: lilac-insure
lastUpdated: 2026-05-05
spec: This file is the single source of truth for every automation in scope across Phases 1–3. Each Phase 1 row has a sibling spec folder under `automations/<id>/`; Phase 2/3 rows live here only until they enter scope.
---

# Lilac Insure — Automation Plan

## Test-mode contract

Every automation in this directory ships in **test mode** by default. The contract:

- `automation-config.json` carries the global `mode` flag (`"test" | "production"`) and a `testRecipient` (`administration@lilacinsure.com`).
- `_shared/test-mode-guard.mjs` is called by every workflow before any outbound send (email, SMS, EZLynx write, DocuSign send). In test mode it short-circuits the send and logs the intended payload to `_log.jsonl`.
- Promotion to live is **per-workflow**: flip `mode: "production"` AND populate that workflow's `productionRecipients` AND check off the workflow's promotion checklist in its `README.md`. There is no "promote everything at once" path.
- Until `administration@lilacinsure.com` confirms a workflow's test runs look right end-to-end, we do not promote it.

## n8n role

n8n is the orchestration layer (replaces broken Zapier). Two patterns:

- **Pure n8n**: trigger + transform + dispatch all happen inside an n8n workflow. JSON exports live in `automations/<id>/n8n/`.
- **n8n + script**: n8n handles the trigger and HTTP fan-out, but calls a `run.mjs` for logic that needs more than n8n's expression engine (PII redaction, structured logging, custom EZLynx mapping). Used when the workflow benefits from version control + tests on the transform code.
- **Script-only**: local-AI workflows (Phase 2 email-triage-bot, call-transcription) bypass n8n because they must run on Conrad's trusted infra. n8n does not see PII.

Hosting is **deferred** — workflow JSON folders are scaffolded but empty until we pick self-hosted (Hetzner) vs. n8n Cloud.

## Phase 1 — Automation Sprint ($1,500, in-progress)

| id | name | bucket | trigger | input | process | output | systems | owner | status | blockers | n8n? | spec |
|----|------|--------|---------|-------|---------|--------|---------|-------|--------|----------|------|------|
| `lead-intake` | Gravity → EZLynx applicant | 1 (Ingestion) | Gravity webhook on form submit | Form payload (name, contact, line of business, notes) | Validate signature → normalize → POST EZLynx applicant | EZLynx applicant + ack to lead | WordPress, Gravity, EZLynx, n8n | EZLynx | scaffolded | `acc-1` (creds), `acc-2` (API), `acc-3` (WP) | n8n + script | [`automations/lead-intake/`](./automations/lead-intake/) |
| `email-triage` | Outlook bucket rules | 2 (Triage) | Inbox arrival | Email metadata + sender domain | Classify (renewal / commercial / billing / onboarding / noise) → tag | Outlook category applied | Outlook (Graph) | Outlook | scaffolded | `2-1` (categories w/ Conrad), `acc-3` access | n8n + script | [`automations/email-triage/`](./automations/email-triage/) |
| `auto-responder` | Lead acknowledgment within 5 min | 2 (Triage) | New `lead-intake` event | Lead name + line of business | Render template → send | Acknowledgment email to lead, copy to test recipient | Outlook (Graph) | Outlook | scaffolded | `2-3`, depends on `lead-intake` | pure n8n | [`automations/auto-responder/`](./automations/auto-responder/) |
| `renewal-reminder` | Renewal text/email replaces letters | 4 (Lifecycle) | EZLynx policy renewal date − 30 / 14 / 3 days | Policy id, customer contact, renewal date | Render template → send via Outlook + LightSpeed SMS | Reminder sent + EZLynx note | EZLynx, Outlook, LightSpeed | EZLynx | scaffolded | `4-1`, `acc-1`, `acc-6` | n8n + script | [`automations/renewal-reminder/`](./automations/renewal-reminder/) |
| `cancellation-winback` | Win-back follow-up on cancellation | 4 (Lifecycle) | EZLynx policy cancellation event | Policy id, customer contact, cancel reason | 3-touch sequence over 14 days | Win-back outreach + EZLynx note | EZLynx, Outlook | EZLynx | scaffolded | `4-2`, `acc-1` | n8n + script | [`automations/cancellation-winback/`](./automations/cancellation-winback/) |

## Phase 2 — AI & Intelligence Layer (planned)

| id | name | trigger | input | process | output | systems | privacy | status |
|----|------|---------|-------|---------|--------|---------|---------|--------|
| `email-triage-bot` | Local-LLM inbox classifier | Manual batch (cron candidate) | Inbox threads (no PII to disk) | Local Ollama/Hermes classify → tag | Outlook category applied | Outlook, local LLM | local-only, no external API | docs-only |
| `call-transcription` | Call → EZLynx note | Call ends in LightSpeed/Orbit | Recording | Local Whisper transcribe → local LLM extract action items → POST EZLynx note | Structured note in EZLynx client file | LightSpeed, EZLynx, local Whisper, local LLM | local-only | docs-only |
| `commercial-renewal-prefill` | Prior-year ACORD pre-fill | Renewal trigger | Prior-year ACORD PDF + EZLynx policy data | Extract → update dates → DocuSign send for review/sign | Pre-filled ACORD sent to client | EZLynx, DocuSign, Wonder Write | medium (ACORD financials) | docs-only |

## Phase 3 — Agentic Command Center (future)

| id | name | description | status |
|----|------|-------------|--------|
| `service-request-widget` | Client-facing intake widget on lilacinsure.com | Pre-sorted policy change / billing / claim requests routed to EZLynx | docs-only |
| `agentic-command-center` | Conrad's lightweight ops dashboard | Web-based, mobile-friendly. Status visibility, task queue, alerts. Mirrors Hirobius `/ops` surface. | docs-only |

## Promotion path (test → production)

For any Phase 1 workflow:

1. Adrian wires the workflow's `run.mjs` against real systems (no longer a stub).
2. Stub still runs in test mode — every action logs to `_log.jsonl` with `mode: "test"` and `intendedRecipient: "administration@lilacinsure.com"`.
3. Adrian + Conrad review the log against expected behavior (sample inputs in `fixtures/`).
4. Workflow's `README.md` "Promotion checklist" is checked off (specific to that workflow).
5. `productionRecipients` in `automation-config.json` populated for that workflow.
6. `mode` flipped to `"production"`. Run a small live batch. Watch logs.
7. Roll back to `"test"` instantly if anything looks off — single config flip.

## Open questions

- n8n hosting (self-host on Hetzner vs. n8n Cloud) — decide before first workflow promotes.
- Outlook task system replacement (`2-4`) — EZLynx tasks vs. Microsoft To Do vs. n8n-triggered task creation. Confirm with Conrad.
- Wonder Write API availability — affects `commercial-renewal-prefill` design.
