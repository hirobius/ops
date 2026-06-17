---
client: lilac-insure
purpose: Discover what's actually in Conrad's inbox before we lock automation categories or priorities.
runners:
  preferred: M365 Copilot (in Conrad's tenant) — fastest, requires $30/user/mo license + Conrad consent on cloud AI
  alternative: Local Ollama + Graph API (Phase 2 email-triage-bot) — strictly within Conrad's local-AI rule
  fallback: Conrad runs Outlook advanced search by hand — free, slow
output: each answer feeds a downstream decision (category tuning, Phase 1 priority, Phase 2 seed data, Phase 3 dashboard widget)
---

# Inbox Discovery Prompts

The 12 categories in `automations/email-triage/categories.json` are **placeholder
hypotheses** based on industry conventions. The fastest way to validate them is
to ask the actual inbox. Each prompt below is a question we want answered; the
runner is whichever tool we end up using.

For each prompt:
- **Q:** the question we want answered
- **Copilot prompt:** copy-paste text for Microsoft 365 Copilot
- **Output shape:** what success looks like
- **Decision it informs:** how the answer changes our build

---

## A. Inbox composition (validates the 12 categories)

### A1 — How does the inbox actually break down?

- **Q:** What categories of email does Conrad receive, and in what proportions?
- **Copilot prompt:**
  > Group my last 90 days of received emails into 8–12 topical buckets. For each bucket, give me: (1) a short label, (2) a one-sentence definition, (3) the approximate % of my inbox it represents, (4) 3 representative subject lines. Don't include personal emails or newsletters in the count separately — flag those as their own bucket.
- **Output shape:** a table of buckets × (% of inbox, definition, 3 example subjects).
- **Decision it informs:** keep / merge / split our 12 categories. If "claim" is 0.5% of his inbox, we don't need a dedicated workflow for it yet. If "renewal" is 35%, we prioritize `renewal-reminder` over everything else.

### A2 — Top sender domains

- **Q:** Who's actually emailing him, by domain?
- **Copilot prompt:**
  > List the top 30 sender domains in my inbox over the last 6 months. For each: (1) the domain, (2) total message count, (3) one-sentence description of who they are (carrier, wholesaler, software vendor, client, etc.), (4) the typical subject patterns they send.
- **Output shape:** ranked list, 30 rows, four columns each.
- **Decision it informs:** sharpens `from-pattern` rules in `categories.json`. We've guessed at carriers (Liberty, Travelers, Progressive, Safeco, Nationwide) and wholesalers (RT, RPS, Burns & Wilcox) — this confirms or replaces.

### A3 — Threads where the inbox is acting as task manager

- **Q:** How much of the inbox is actually a to-do list vs. correspondence?
- **Copilot prompt:**
  > Identify emails I've pinned, flagged, or marked unread despite having opened them, in the last 12 months. Group them by what action they represent (waiting on a response, owe someone something, unfinished task, reference for later). Give me counts per group.
- **Output shape:** 4-bucket counts.
- **Decision it informs:** shape of `tasks.json` `2-4` ("Replace pinned email task system"). If "waiting on a response" is the dominant pattern, the right replacement is a follow-up tracker, not a generic task list.

---

## B. Client lifecycle audit (segments contacts by stage)

### B1 — Active prospects (in flight, not bound)

- **Copilot prompt:**
  > Find every distinct person/contact I've exchanged emails with in the last 30 days where the conversation references a quote, indication, submission, or proposal but I cannot find a follow-up confirming a binder or policy issuance. List them with: name, last email date, what line of business they're asking about, and what the last action item appears to be.
- **Output:** ranked list (newest first).
- **Decision:** seeds the `quoting` workflow's MVP — these are the people we'd auto-nudge.

### B2 — Newly-onboarded clients (last 90 days)

- **Copilot prompt:**
  > Find every contact where I have a DocuSign-completed email or a "welcome to lilac" / "policy issued" event in the last 90 days. List them with: name, policy type if mentioned, effective date if mentioned, and any pending items I owe them (initial payment confirmation, ID cards, etc.).
- **Decision:** seeds an onboarding follow-up workflow we haven't scoped yet — probably a phase-1.5 add.

### B3 — Renewal window (next 60 days)

- **Copilot prompt:**
  > Look for renewal proposals, expiration notices, or carrier renewal communications referencing a policy that expires in the next 60 days. List the client name (when present), policy type, expiration date, and which carrier sent the notice.
- **Decision:** test data for `renewal-reminder` workflow before we wire EZLynx webhooks. We can run the workflow against this list as if EZLynx had fired the events.

### B4 — Recent cancellations / NSFs (last 6 months)

- **Copilot prompt:**
  > Find every cancellation notice, non-payment notice, or NSF email in the last 6 months. For each: client name, policy type, reason if mentioned, date of cancellation/notice. Separate "cancelled by client" from "cancelled by carrier" if you can tell.
- **Decision:** test set for `cancellation-winback`. Also reveals whether retention is a real bleed (volume) or noise (handful per quarter).

---

## C. Engagement metrics

### C1 — Lead response time

- **Copilot prompt:**
  > For every email in the last 6 months that came from `forms@lilacinsure.com`, `gravityforms`, or contained "quote request" / "new lead" in the subject, find my first outbound reply (if any) and measure elapsed time from receipt to reply. Give me: count of leads, % I replied to, median response time, p90 response time, count of leads I never replied to.
- **Decision:** baseline for the auto-responder SLA. If median is currently 4 hours, the 5-min SLA we put in `auto-responder/config.json` is a real improvement; if median is already 5 minutes, the auto-responder is just a safety net, not a primary value driver.

### C2 — Stale active clients

- **Copilot prompt:**
  > List every contact where (a) I have evidence of an active policy in the last 18 months, AND (b) I have not sent or received an email from them in 90+ days. Sort by longest gap.
- **Decision:** the original list for a "client check-in" sequence. Could become a Phase 1.5 workflow (very cheap automation, high relationship value).

### C3 — Top contacts by volume

- **Copilot prompt:**
  > Top 30 individuals (not domains) I've exchanged emails with in the last 12 months, sorted by total message count both directions. For each: their name, role if I can infer it (client / carrier rep / wholesaler / vendor / personal), total messages.
- **Decision:** identifies the actual high-touch relationships. These are the contacts where automation must NEVER feel automated.

---

## D. Stale / risk signals

### D1 — Conversations where I owe a reply

- **Copilot prompt:**
  > Find threads where the most recent message is from someone other than me, was received 7+ days ago, contains an explicit question or request directed at me, and where I've previously replied at least once (so it's a real conversation, not cold outreach). List them with: who, subject, ask, days waiting.
- **Decision:** immediate action queue for Conrad. Also: shows whether this should be a separate "follow-up overdue" automation in Phase 2.

### D2 — Life events mentioned in passing

- **Copilot prompt:**
  > Scan client emails from the last 18 months for mentions of life events (marriage, divorce, new baby, new home, new business, new vehicle, retirement, a death in the family, a move out of state). List the contact, the date the event was mentioned, the event type, and whether I appear to have followed up about insurance implications.
- **Decision:** these are the relationship gold. If Conrad missed insurance implications on any, that's a Phase 2 alerting opportunity (and a quick pro-bono win we can show him).

### D3 — Carrier silence

- **Copilot prompt:**
  > Among the carriers and wholesalers I appear to do business with (RT Specialty, RPS, Burns & Wilcox, Liberty Mutual, Progressive, Safeco, Travelers, Nationwide — and any others you spot), which ones have I had no email contact with in 90+ days? Could indicate a dormant appointment, a relationship to revive, or a carrier we no longer use.
- **Decision:** input for `acc-5` (Wonder Write API clarify) and `stack.json` validation.

---

## E. Cross-sell / opportunity discovery

### E1 — Single-line clients

- **Copilot prompt:**
  > Identify clients where I see evidence of one line of business (auto only, home only, or commercial only) but no mention of the others. List them with the line they have and any signals about whether they might benefit from another line (e.g., they mentioned moving = home opp; mentioned a new vehicle = auto opp).

### E2 — Commercial signals from personal-line clients

- **Copilot prompt:**
  > Find personal-lines clients who mentioned anything that suggests they own or run a business (LLC, sole proprietor, side hustle, contractor work, rental property, Airbnb, side income). List them with the signal you spotted.

- **Decision (E1 + E2):** Phase 2 candidate — "expansion list" Conrad reviews monthly, not an auto-send. Pure sales aid.

---

## How to use this document

**Path 1 — Copilot path (if Conrad has the license + green-lights cloud AI):**
1. Conrad opens Microsoft 365 Copilot in Outlook on the web.
2. Walks the prompts top-to-bottom (or any subset). Each prompt is one chat turn.
3. We capture answers as `clients/lilac-insure/inbox-discovery-results.md` (no PII to disk — just aggregates and patterns).
4. Tune `categories.json`, reorder `automation-plan.md` priorities, draft Phase 1.5 workflows.

**Path 2 — Local path (Conrad's stated preference, more engineering):**
1. We build a one-shot Node script: `clients/lilac-insure/automations/email-triage/discovery-local.mjs`.
2. It pulls 12 months of message metadata via Graph API (fields: `from`, `subject`, `bodyPreview`, `receivedDateTime`, `categories`, `from->emailAddress->address`).
3. Aggregates locally (top domains, time-to-reply, stale threads, lifecycle stage inference). Sends the body through local Ollama for the L1/L2 questions that need semantic understanding (life events, business signals).
4. Writes results to `inbox-discovery-results.md`. No bodies persisted; only aggregates.
5. Run-once or scheduled monthly.

**Path 3 — Hybrid (probably the actual answer):**
- Use Copilot for the **A** and **C** questions (composition, response-time metrics) — they're well-defined, low-PII-risk, and Conrad sees the value immediately.
- Use local Ollama for **D2** and **E1/E2** (life events, business signals) — they need semantic reasoning over message bodies, which is exactly the privacy-sensitive case Conrad called out.
- Manual Outlook search for **A3** (pinned emails — Conrad knows what's there better than any AI).

## Recommendation

Show Conrad **A1 and C1 first**. Both produce concrete numbers in 5 minutes that change how we build. If A1 shows our 12 categories are way off, we re-do `categories.json` before any further investment. If C1 shows his current lead response time is 30 minutes (not 4 hours), the 5-min auto-responder SLA is a marginal improvement — not the headline win — and we re-prioritize Phase 1.

Save the deeper prompts (B, D, E) for after we have the basics validated. Otherwise we end up with too much data and no decision criteria.
