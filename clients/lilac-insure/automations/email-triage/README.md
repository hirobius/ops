# email-triage

**Bucket 2 — Triage.** Lifecycle-aligned classifier that buckets every inbound
Outlook thread into one of 12 categories, then applies an Outlook category tag.

## Categories (v0 placeholders)

Mapped to insurance client lifecycle. Cull/refine with Conrad after the first
50-thread real-data audit.

| id | label | lifecycle | urgency |
|----|-------|-----------|---------|
| `lead` | New lead / quote request | prospect | high (5-min SLA) |
| `quoting` | Quote in progress | prospect | medium |
| `onboarding` | Onboarding / new policy bind | onboarding | high |
| `service` | Active client service request | active | medium |
| `claim` | Claim | active | URGENT |
| `renewal` | Renewal cycle | renewal | medium-high |
| `retention` | Cancellation / non-pay / win-back | off-boarding | medium |
| `carrier-ops` | Carrier / wholesaler operations | cross | low-medium |
| `vendor-ops` | Vendor / software operations | cross | low |
| `compliance` | Compliance / regulatory | cross | high when present |
| `internal` | Internal / personal / Hirobius | cross | variable (fallback) |
| `noise` | Marketing / newsletter / junk | cross | zero |

Rules + scoring live in [`categories.json`](./categories.json).

## How the classifier scores

For each category, sum:
- `from` exact match: **+10**
- `from` pattern (substring): **+5**
- subject keyword (substring, case-insensitive): **+3**
- body keyword (substring, case-insensitive): **+1**

Highest score wins. Tie or top score below threshold (3) → `internal` (manual review).

## Test

```bash
node clients/lilac-insure/automations/email-triage/test.mjs
```

15 synthetic fixtures (one per category + 3 edge cases). Currently passes 15/15.

## CLI modes

```bash
# Default — log dry-run intent
node clients/lilac-insure/automations/email-triage/run.mjs

# Classify a single fixture
node clients/lilac-insure/automations/email-triage/run.mjs --classify fixtures/lead.json

# Classify from stdin (used by n8n Execute Command node)
echo '{"from":"...", "subject":"...", "body":"..."}' | \
  node clients/lilac-insure/automations/email-triage/run.mjs --classify-stdin
```

## n8n workflow

[`n8n/email-triage.workflow.json`](./n8n/email-triage.workflow.json) is a draft
n8n workflow:

```
Outlook trigger (new unread)
  → Execute Command (run.mjs --classify-stdin)
  → Code (merge classification into thread payload)
  → Switch (12-way on category)
  → Outlook Update Message (apply category "lilac-<id>")
```

The classifier code stays in this repo (single source of truth); n8n calls out
via `Execute Command`. Import the JSON once n8n hosting is decided.

## Dependencies

- `tasks.json` `2-1` — Define email triage categories with Conrad. Treat the
  v0 list above as the **straw man** for that conversation. Items to confirm:
  do these 12 reflect Conrad's mental model? Should we add a `personal-conrad`
  bucket distinct from `internal`? Should `claim` split into `claim-fnol` vs.
  `claim-update`?
- `acc-3` — Microsoft Graph access. Required for live Outlook integration.

## Promotion checklist (test → live, per category)

For each of the 12 categories, in `rolloutOrder` from `config.json`:

- [ ] Audit run against ≥30 real threads in that category — false-positive < 5%.
- [ ] Conrad approves the category's rules + tag name.
- [ ] Outlook category created in his mailbox: `lilac-<id>`.
- [ ] First 7-day soft launch — n8n applies the tag but does not move the email.
- [ ] After 7 clean days, optionally enable folder-move rules in Outlook itself.

Start with `noise` and `vendor-ops` (low risk, high volume — proves the pipe).

## Privacy

Email body is read in-memory by the classifier but **never written to disk**.
The `_log.jsonl` records sender domain + subject keywords + bucket decision —
no body content. This matches the `scripts/sync-client-emails.mjs` pattern.
