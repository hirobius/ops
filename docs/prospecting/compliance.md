# Compliance checklist — lead-prospecting pipeline (#21)

> **Not legal advice.** This is a practical working checklist for an internal
> team, not a substitute for an attorney. See "Before scaling outreach" below.

Tracking issues: **#35** (umbrella) · **#36** (lifecycle + suppression) ·
**#37** (retention) · **#38** (privacy policy). Companion docs:
`outscraper-pipeline.md` (scrape mechanics), `outreach-playbook.md` (how we
sell), `../../standards/secrets-management.md` (no PII in git/chat/logs).

## Current posture: low risk

What we do today and why it's not a violation of anything:

- [x] We scrape **public business-listing data** only — name, phone, address,
      category, review count/rating, and sometimes a public email. This is
      information the business itself published (Google Business Profile,
      its own site).
- [x] Storage is a **private, service-role-only Supabase** — no public read
      access, no anon key exposure.
- [x] Scraped PII never touches git: `prospects/*` and `clients/*` (except
      `clients/_template/`) are **gitignored**.
- [x] **Nobody has been contacted yet.** No emails sent, no calls made, no
      texts sent. Scrape-and-score is data collection, not outreach.

**Bottom line:** nothing done under #21 so far triggers CAN-SPAM, TCPA, or
CCPA obligations — those all attach at the point of *contact*, not collection.
The moment we send the first cold email or make the first cold call, that
changes. This doc exists so we don't cross that line unprepared.

## Obligations that activate at outreach

### CAN-SPAM (email — federal, applies to any commercial email to US recipients)

- [ ] Every outreach email includes a **valid physical postal address**
      (business or registered PO box) in the body or footer.
- [ ] Every email offers a **clear, working opt-out** (reply "unsubscribe,"
      a link, etc.) and opt-outs are **honored within 10 business days**.
- [ ] **No deceptive subject lines or "From" headers** — subject must reflect
      content; sender must be identifiable and real.
- [ ] Commercial email is **identifiable as an advertisement** if it's
      primarily promotional (a simple disclosure line is enough).
- [ ] Once someone opts out, they move to `do_not_contact` (#36) — never
      re-scraped or re-emailed under any campaign.

### TCPA (calls/texts — federal, higher risk than email)

- [ ] **Prefer email over calls/texts** for cold outreach — TCPA exposure
      (statutory damages, class-action history) is materially higher than
      CAN-SPAM's.
- [ ] If/when calls or texts are added: scrub numbers against the **National
      Do Not Call Registry** before any campaign.
- [ ] No autodialed/prerecorded calls or texts to a cell phone without prior
      express consent — this is the core TCPA trigger.

### CCPA / CPRA (California business owners specifically)

- [ ] Know that the **B2B exemption expired January 1, 2023** — a California
      business owner's contact info scraped in a B2B context is now treated
      as **personal information** under CCPA/CPRA, same as a consumer's.
- [ ] Publish a **privacy policy** describing what we collect, why, and how
      to exercise rights (#38).
- [ ] Be able to **honor** a California resident's request to: know what we
      hold on them, delete it, and opt out of "sale/share" (we don't sell
      data, but the request-handling process should exist regardless).
- [ ] This applies **only to CA-domiciled business owners** in our scrape —
      not a blanket obligation, but our pipeline doesn't currently filter by
      owner state, so treat it as live for any CA lead until it does.

### GDPR — not applicable

- [ ] Confirmed: outreach targets are **Washington State only**, no EU data
      subjects. Re-check this box if the geographic scope ever changes.

## Retention policy — 12 months

**Decision (Adrian, 2026-07-07):** ref #37.

- [ ] **Purge** any lead that is neither `won` nor `do_not_contact` /
      `unsubscribed` after **12 months** from first scrape/contact.
- [ ] **Keep indefinitely**: `won` leads (active client relationship) and
      suppression tombstones (`do_not_contact`, `unsubscribed`) — these must
      survive purge so we never re-contact someone who opted out.
- [ ] Purge runs as a job, not manual cleanup (#37).
- [ ] Purge job logs *what was deleted and why* (counts + reason), not the
      PII itself.

## Technical controls (build tracker)

| Control | Purpose | Issue |
|---|---|---|
| `do_not_contact` / suppression list | Never re-contact opt-outs or bounces | #36 |
| CRM lifecycle columns (`sourced`→`contacted`→`won`/`do_not_contact`) | Know contact state per lead | #36 |
| Retention purge job (12mo) | Enforce the retention policy automatically | #37 |
| Privacy policy page + CCPA request intake | CCPA/CPRA disclosure + rights requests | #38 |
| CAN-SPAM footer (address + unsubscribe) | Legal requirement on every outreach email | folds into #9 |
| Supabase RLS / service-role-only | No public or anon read path to PII | verify on every new table |
| No PII in git/chat/logs | Don't leak what we're obligated to protect | `standards/secrets-management.md` |

## Before scaling outreach

This covers the practical ~90% for a small WA-based outreach operation. Before
real volume (hundreds of contacts/month) or before adding calls/texts:

- [ ] **Have an attorney review** this checklist and our actual email/call
      templates against current CAN-SPAM, TCPA, and CCPA/CPRA rules.
- [ ] Re-confirm the WA-only / no-EU assumption before opening new geographies.
