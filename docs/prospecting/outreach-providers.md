# Cold-outreach tooling — provider exploration (#9)

_2026-07-07. Which sending stack for the lead → site → **outreach** → invoice pipeline._

## The core finding: transactional ESPs are the wrong category

**Resend and Postmark (and SES) all prohibit cold outreach.** Postmark suspends
cold-email accounts within days; Resend routes through Amazon SES and carries the
same transactional-only AUP. They're built for password resets / receipts, and
their deliverability model depends on *not* letting cold email touch their IPs.
Using either for our scraped-lead outreach = account ban.

The right category is a **cold-email platform**: it gives you many dedicated
sending inboxes, automated warmup, domain/inbox rotation, sequences, a unified
reply inbox, and an API to push leads + read replies. That's what actually fits
our stack (Node/Vercel + a Supabase `leads` table + generated preview sites).

## The three that matter (2026)

| | Smartlead | Instantly | Lemlist |
|---|---|---|---|
| **Positioning** | API-first infra, agency-grade | All-in-one growth engine + built-in lead DB | Personalization + multi-channel |
| **Deliverability** (8k/day test) | **88% inbox** (best) | 81% | 74% |
| **API + webhooks** | **Deep** (leads, campaigns, `/webhooks` on campaign+lead events) | Good, more UI-driven | Weaker, per-seat |
| **Warmup** | Unlimited, granular (SmartServers add-on) | Shared pool (Reddit reports 30–40% open-rate drop) | Standard |
| **Pricing** | $39 base / **$94 Pro (API+webhooks)** / $174 unlimited | $37 / $97 / $358 | $39–$109 **per seat** |
| **Best for** | Multi-client agencies, custom dashboards, raw API control | Solo founders wanting lead DB + UI | Sophisticated multi-channel sequences |

## Recommendation for Hirobius: **Smartlead**

It's the best fit for *our* situation specifically:
- **We already own lead sourcing** (Outscraper) + **generated preview sites** — so Instantly's built-in lead database (its main draw) is redundant for us. We need API push + webhook-back, which is Smartlead's core strength.
- **API-first** → clean integration with our existing stack (below).
- **Best deliverability** (88%) + granular warmup — cold outreach lives or dies on inbox placement.
- **Agency workspace isolation** — if we later run outbound *per client*, Smartlead separates them cleanly.

Runner-up: **Instantly** if you'd rather a UI-driven all-in-one and care less about deep API control. Lemlist only if dynamic-image/video personalization becomes central.

## How it wires into our stack (provider-agnostic adapter)

The integration shape is the same for any of them, so build an **outreach adapter**
(`lib/outreach/`) with a Smartlead implementation behind it — swappable later:

1. **Push** — a script/endpoint reads *qualified, non-`do_not_contact`* leads from
   Supabase `leads` (the #36 suppression already gates this) → POSTs them into a
   Smartlead campaign via its API, mapping custom variables: `{{first_name}}`,
   `{{trade}}`, `{{city}}`, `{{preview_url}}` (our generated site link — the hook).
2. **Send** — Smartlead owns warmup + sequences + sending from dedicated inboxes.
   We never send cold mail through our transactional infra.
3. **Webhook back** — a Smartlead webhook → a small `api/` handler → writes the
   **#36 lifecycle columns** on the lead: `outreach_status` (sent/replied/bounced),
   `sent_at`, `replied_at`. Replies/opt-outs flip `do_not_contact` → never
   re-contacted or re-scraped (suppression already enforced on ingest).
4. **Approval gate** — sends queue for Adrian's click first (ties directly into the
   orchestration **approvals inbox #8** — nice synergy: outreach approvals ARE the
   inbox's first real use). Hard daily cap regardless.

This is exactly the `#9` outreach engine, minus the "which ESP" dead-end.

## Human setup + cost (the real commitment — not just an API key)

Cold email deliverability requires operational setup Smartlead automates *around*
but can't replace:
- **Separate sending domains** — NOT `hirobius.com` (protect the primary). Buy 2–3
  lookalikes (e.g. `try-hirobius.com`, `gethirobius.com`), each with a few Google
  Workspace inboxes. ~$6/inbox/mo + domain cost.
- **Warmup 2–4 weeks** before real sends; ramp volume slowly.
- **SPF/DKIM/DMARC** on each sending domain.
- **`SMARTLEAD_API_KEY`** as a server-only Vercel env (Adrian-set; agents never touch `.env*`).

## Legal (already ~90% covered)
- **B2B cold email is legal in the US under CAN-SPAM** (we email *businesses*, not
  consumers) — needs a physical mailing address + working unsubscribe in every email.
- Our **#36 suppression** (do_not_contact) + **#37 retention purge** + `compliance.md`
  already cover opt-outs + data retention. Remaining: the CAN-SPAM footer (address +
  unsubscribe) in the email template, and the privacy policy page (#38).

## Decision needed
Pick the platform (recommend **Smartlead**). Then the build is: outreach adapter →
Supabase push → webhook-back → approval-gated send, respecting the compliance
already in place. The domain/inbox warmup is a parallel human track that should
start early (it's the 2–4 week long pole).

## Adapter (scaffolded, 2026-07-08)

The provider-agnostic adapter from "How it wires into our stack" above is built,
with Smartlead as the implementation. **Sending stays gated — no live API calls
happen without `--apply` + a human-set `SMARTLEAD_API_KEY`.**

**Files:**
- `lib/outreach/types.mjs` — the `OutreachProvider` interface + normalized
  `OutreachEvent` shape (JSDoc typedefs). Nothing else in the codebase talks to
  a vendor SDK directly — swapping providers later means one new file.
- `lib/outreach/map.mjs` — pure, fully unit-tested: `leadToOutreachLead(lead)` /
  `leadsToOutreachLeads(leads)` map a Supabase `leads` row → Smartlead's lead
  shape (skips no-email rows); `webhookEventToPatch(event)` maps a normalized
  event → the #36 lifecycle patch (`sent`/`replied`/`bounced`/`unsubscribed`).
- `lib/outreach/smartlead.mjs` — `makeSmartleadProvider({ apiKey, fetch })`
  (the real client, contract verified against Smartlead's docs — see file
  header) and `normalizeWebhook(body)` (Smartlead webhook payload → our
  `OutreachEvent`, coded defensively with `// VERIFY` notes where the sources
  disagreed on field/event names).
- `scripts/push-outreach.mjs` — the CLI. `--dry-run` is the **default**
  (prints who WOULD be pushed, sends nothing); `--apply` performs the real
  push. Enforces the compliance eligibility filter (below) in the Supabase
  query. `--help` for usage.
- `scripts/__tests__/outreach-map.test.mjs` — full coverage of the mapping
  functions + the Smartlead client against a **stub fetch** (no live network).

**Env vars (server-only, Adrian-set — never touched by an agent):**
- `SMARTLEAD_API_KEY` — from `app.smartlead.ai` → Settings → API Keys.
- `SMARTLEAD_CAMPAIGN_ID` — the target campaign id (or pass `--campaign <id>`
  on each run instead).

Set both in Vercel (Production + Preview scopes):
https://vercel.com/adrian-6234s-projects/hirobius-ops/settings/environment-variables

**Compliance eligibility (enforced in `push-outreach.mjs`, ALL must hold):**
`lead_score >= 60` (qualified) AND `email` present AND `do_not_contact` is not
true (#36 suppression) AND `outreach_status` is `null` (never contacted — this
script never re-sends).

**Dry-run → apply flow:**
```
NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign <id>            # dry-run (default)
NODE_USE_ENV_PROXY=1 node scripts/push-outreach.mjs --campaign <id> --apply    # real push
```

**CAN-SPAM footer + unsubscribe link:** authored in the **Smartlead email
template** (not in this code) — the physical mailing address + working
unsubscribe link required by CAN-SPAM live in the campaign's sequence steps,
configured in the Smartlead UI. `webhookEventToPatch`'s `unsubscribed` case is
already wired to flip `do_not_contact` the moment Smartlead reports an
unsubscribe click, once the webhook route below exists.

**Deferred — next step:** the inbound webhook route (`api/outreach-webhook.ts`)
that Smartlead POSTs events to. Not built yet because (a) it must be
**ungated** (external caller, no `/ops` session cookie — needs a
`SMARTLEAD_WEBHOOK_SECRET` shared-secret check instead) and (b) it would push
us to **12/12 Vercel serverless functions** (the Hobby-plan cap), which needs
either the free 12th slot or a route-consolidation decision first. The pure
`normalizeWebhook` + `webhookEventToPatch` are already built and tested, so
wiring the route later is: add the file, verify the secret, call
`updateLead(sb, leadId, webhookEventToPatch(normalizeWebhook(req.body)))`.
