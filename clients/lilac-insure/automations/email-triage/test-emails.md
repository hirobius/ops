# Test emails for the M365 dev tenant live test

Send each of these to your test mailbox (`MS_GRAPH_TEST_MAILBOX`). One email
per category. Vary the **From** address per the guidance to exercise the
`from-pattern` rules in `categories.json`.

After sending all 12, run:
```bash
node clients/lilac-insure/automations/email-triage/live-graph.mjs --read
```

Expected: each lands in the matching `lilac-<id>` bucket. Then run with `--apply` to set the Outlook category tag.

> **Tip on senders:** if you only have one Gmail account, you can still
> exercise the from-pattern rules by spoofing the **subject** to be
> aggressively keyword-rich. The classifier weights `subject (+3 each)`
> heavily — most fixtures pass on subject alone. Use real-looking sender
> addresses where you can (a friend's Gmail, an alias, a different account)
> to stress-test.

---

## 1. lead

**From (ideal):** `forms@lilacinsure.com` (or any address)
**Subject:** `New lead: Quote request from website`
**Body:**
```
Name: Jane Doe
Email: jane@example.com
Phone: 509-555-0100
Looking for a quote on auto and home.
Best contact method: email.
```

## 2. quoting

**From (ideal):** `underwriter@rtspecialty.com` (or anything; subject keywords carry it)
**Subject:** `Submission #88421 — quote indication ready for review`
**Body:**
```
Please review the attached indication. Rate is locked through Friday.
Please bind by EOD if accepting.
```

## 3. onboarding

**From (ideal):** spoof `dse_NA4@docusign.net` if possible (or anything)
**Subject:** `Completed: Lilac Insurance — Auto Application Signed`
**Body:**
```
All parties have completed the document. Welcome aboard!
Your policy is now in effect.
```

## 4. service

**From:** any client-shaped sender (your personal Gmail works)
**Subject:** `Need a copy of my insurance card`
**Body:**
```
Hi Conrad, can you send me a proof of insurance for my auto policy?
I need it for the DMV today.
```

## 5. claim

**From (ideal):** `claims@progressive.com` (or any)
**Subject:** `FNOL — Auto claim filed for policy 99-AUTO-123`
**Body:**
```
First notice of loss received. Insured reports a rear-end collision on I-90.
Please assist with documentation.
```

## 6. renewal

**From:** any
**Subject:** `Renewal proposal ready — policy expires 2026-06-15`
**Body:**
```
Your client's home policy is up for renewal.
Renewal effective 2026-06-15. Please review attached proposal.
```

## 7. retention

**From (ideal):** `billing@libertymutual.com`
**Subject:** `Notice of intent to cancel — non-payment / NSF on policy 44-HO-7788`
**Body:**
```
Returned check received. Policy is scheduled for cancellation in 10 days
unless payment is received.
```

## 8. carrier-ops

**From (ideal):** `agent-bulletin@travelers.com`
**Subject:** `April commission statement + 1099 reminder`
**Body:**
```
Your April commission report is attached.
Reminder: 1099 forms available in agent portal.
```

## 9. vendor-ops

**From (ideal):** `no-reply@ezlynx.com`
**Subject:** `Scheduled maintenance window — Saturday 2026-05-09 02:00 PT`
**Body:**
```
EZLynx will be unavailable for scheduled downtime from 02:00–04:00 PT on
Saturday. Release notes attached.
```

## 10. compliance

**From (ideal):** `licensing@oic.wa.gov`
**Subject:** `Producer license renewal due — CE credit required`
**Body:**
```
Your producer license is expiring 2026-08-30. Continuing education credits
required before renewal.
```

## 11. internal

**From (ideal):** `adrian@hirobius.com`
**Subject:** `Status check on this week's deliverables`
**Body:**
```
Hey Conrad — quick check-in on the EZLynx login + brand audit deck.
Let me know what's blocking.
```

## 12. noise

**From (ideal):** `newsletter@insurancemarketingweekly.com`
**Subject:** `Limited time: save 20% on your agent CRM upgrade`
**Body:**
```
Exclusive offer for independent agents. View in browser.
Unsubscribe from this list.
```

---

## Optional — stress-test fixtures

Send these AFTER the basic 12 to see how the classifier handles ambiguity:

### Edge: renewal-from-carrier-domain (should classify as `renewal`, not `quoting`)

**From:** `submissions@rpsins.com`
**Subject:** `Renewal proposal — expires 2026-07-01, please review`
**Body:**
```
Policy renews on 2026-07-01. Up for renewal. Please review attached proposal.
```

### Edge: client-reports-accident-not-from-carrier (should classify as `claim`)

**From:** any client-shaped sender
**Subject:** `I was in an accident — need to file a claim`
**Body:**
```
Hi Conrad, I was in an accident on Division St. No injuries.
Need to report a loss / file a claim ASAP.
```

### Edge: ambiguous "Question" (should fall back to `internal`)

**From:** any
**Subject:** `Question`
**Body:**
```
Hey, got a sec?
```

These three have known correct answers in the fixtures suite — `node test.mjs` confirms the classifier handles them. The live test confirms Graph API delivers the same shape we expect.
