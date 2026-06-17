# Reply templates — per-bucket policy + drafts

This library covers all 12 email-triage buckets. Each bucket has a policy
entry in `policy.json` declaring whether auto-reply happens, the SLA, the
template file, and Conrad's personal action. Three buckets actually send a
reply (lead, service, onboarding); the other nine map to "no auto-reply" with
a Conrad-action note explaining why.

## Why most buckets don't auto-reply

| Bucket | Reason |
|---|---|
| **claim** | URGENT — call within 30 min. Auto-reply on a claim could create wrong liability impression. |
| **retention** | Cancel/lapse intent needs a conversation, not a template. |
| **renewal** (inbound) | Personal reply. The renewal-reminder workflow handles outbound only. |
| **quoting** | Carrier-to-Conrad. Auto-reply to an underwriter is unprofessional. |
| **carrier-ops / vendor-ops** | Not customer-facing. |
| **compliance** | Regulatory — Conrad-only. Never automate. |
| **internal / noise** | Personal or junk. |

## File structure

```
reply-templates/
  README.md              — this file
  policy.json            — per-bucket reply policy (12 buckets)
  lead.md                — auto-reply for new leads, 5 min SLA
  service.md             — auto-reply for active client requests, 5 min SLA
  onboarding.md          — onboarding welcome, ~1 day after bind
```

## Template format

Each `*.md` is markdown with YAML frontmatter:

```yaml
---
bucket: <bucket-id>
status: draft | approved
approved: false | true
slaMinutes: <number>
sender: administration@lilacinsure.com
vars:
  - first_name
  - line_of_business
---
```

Variables use `{{var_name}}` and are substituted at render time. The
classifier feeds `first_name`, `last_name`, `line_of_business` from the
inbound message; static vars like `conrad_phone` come from
`automation-config.json`.

## Promotion checklist

Per template, before flipping `approved: true`:

- [ ] Conrad reads the copy out loud — does it sound like him?
- [ ] All `{{vars}}` are populated by the workflow (no missing-key fallbacks).
- [ ] `conrad_phone` populated in `automation-config.json`.
- [ ] Test send to `administration@lilacinsure.com` arrives in inbox (not spam).
- [ ] Spell-check + brand-name sanity (Lilac Insurance Group, not "Lilac Insurance").
- [ ] Set `approved: true` and bump `status: approved` in this file.
- [ ] Set `policy.json` → bucket → `approved: true`.

## Voice guidelines

- First-name greeting — never "Dear Customer."
- Plain English, not corporate. Short sentences.
- Conrad signs personally. Phone number for urgent.
- Never auto-reply on claim / cancel / compliance buckets.
- One ask per email. Don't pile up calls-to-action.

## Privacy

Templates contain no PII. Variable substitution happens at send time on
Conrad's infrastructure — Hirobius is never in the data path.
