# Privacy policy — source template (ops#38)

> **Not legal advice.** Drafted from what the code actually does, for counsel to
> review before it is relied on (#35 asks for an attorney pass).

This file is the **source** for the public privacy policy. Only the text between
the `privacy-policy:begin` / `privacy-policy:end` markers is published. The
`{{TOKENS}}` are filled from `lib/compliance/identity.mjs` (entity, mailing
address, privacy contact email) and `lib/compliance/retention.mjs` (retention
window). **Never type those values into this file.** Change them in the module
and re-render:

```
node scripts/render-privacy-policy.mjs --effective-date 2026-09-16   # the page (Markdown)
node scripts/render-privacy-policy.mjs --footer                      # the CAN-SPAM email footer
```

Every factual statement in the policy must be true of the code today. The claim
ledger below the policy says which code makes each one true. If you change the
code behind a claim, update the claim in the same PR.

<!-- privacy-policy:begin -->

# Privacy Policy

**Effective date:** {{EFFECTIVE_DATE}}

{{LEGAL_ENTITY_NAME}} ("we", "us") builds websites for local service businesses.
To find businesses that may want a new website, we collect publicly available
information about local businesses and use it to contact them. This policy
explains what we collect for that purpose, where it comes from, how we use and
share it, how long we keep it, and how to make a request about it.

This policy covers information about businesses, and about the people who own or
work for them, that we collect for business-to-business prospecting and outreach.

## Information we collect

| Category                 | What it includes                                                                                                                                             | Where it comes from                                                       |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| Business contact details | Business name, phone number, email address, website, street address, city, state, postal code, map coordinates, and Google Maps link                         | Public business listings, and the business's own website                  |
| Business listing details | Business category, opening hours, description, star rating and number of reviews, price level, photos, logo, social media links, and whether it is operating | Public business listings                                                  |
| Contact person           | The name of an owner or contact person, if we learn it                                                                                                       | You, or our conversations with your business                              |
| Website measurements     | Page speed, search-engine and mobile-friendliness scores, and whether the site uses HTTPS                                                                    | Google PageSpeed Insights, which loads the business's public website      |
| Scores we calculate      | Internal scores estimating whether a business might benefit from a new or redesigned website                                                                 | Calculated by us from the information above                               |
| Sample website drafts    | Website text and settings we draft for the business, and the link to any sample site we build                                                                | Created by us, with the help of an AI service, from the information above |
| Contact history          | Whether, when and how we contacted the business, call outcomes, follow-up dates, who on our team is handling it, and notes about what was said               | Our own interactions with the business                                    |

We get public business listings through Outscraper, a data provider that gathers
business information from Google Maps. When a listing has no email address, we
may look for one on the business's own public website. We record only an address
that actually appears on that site. We never guess or construct one.

We do not ask for or look for sensitive personal information such as government
ID numbers, financial account details or health information.

## How we use it

- To find local businesses that may benefit from a new or improved website.
- To build a sample website for a business from its public listing information,
  to show the business what we could make for it.
- To contact businesses about our services by email or phone.
- To keep a record of our conversations, so we follow up when asked and do not
  keep contacting the same business.
- To honor requests to stop contacting a business or to delete its information.

We do not sell personal information, and we do not share it for cross-context
behavioral advertising.

## Who we share it with

We share this information with service providers that help us do the work
above:

- **Supabase**, which hosts the database where we store it.
- **Vercel**, which hosts our internal tools and the sample websites we build.
- **Anthropic**, whose AI service we use to draft sample website content from
  business listing information.
- **Google**, which measures a business's public website through PageSpeed
  Insights. We send it the website address.
- **Smartlead**, an email-sending service, when we contact businesses by email.
- **GitHub**, which stores the source code of the sample websites we build, and
  our notes about prospecting.

Some of what we store on GitHub can be seen by anyone. The source code of a
sample website includes the business information that website shows, such as
the business name, phone number, opening hours, service area and review rating.
Our prospecting notes can include a business's name, city, number of reviews
and the scores we calculated for it.

We may also disclose information when the law requires it.

## How long we keep it

- **Businesses we have not moved into outreach.** A business's record becomes due
  for deletion {{RETENTION_MONTHS}} months after we first collected it, unless by
  then we have moved it into our outreach pipeline (for example, queued it for
  outreach or recorded that we pitched it), it has become a client, or it has
  opted out. Records that are due are deleted the next time we run our retention
  cleanup. We currently run that cleanup by hand rather than on a fixed schedule,
  so a record can remain for some time after it becomes due.
- **Businesses in our outreach pipeline, or that became clients.** We do not
  currently apply a fixed time limit to these records. You can ask us to delete
  yours at any time.
- **Opt-outs.** When a business asks us to stop contacting it, we keep the record
  marked "do not contact" indefinitely, so we do not contact it again. If the
  business also asks us to delete its information, we reduce that record to the
  minimum described below.

## Your choices and rights

You can ask us to:

- **Stop contacting you.** We mark the business "do not contact" and remove it
  from any email sequence already sending to it. Our email lists, call lists and
  outreach queue exclude businesses marked this way. When new
  business listings come in, we do not add a business marked this way back to our
  prospect database, and we do not look for new email addresses for it.
- **Tell you what we have.** We will tell you what categories of information we
  hold about you and send you a copy of the specific information.
- **Delete your information.** We delete the information in the business's record
  and our notes about conversations with it. We keep only an internal ID and
  processing status, the business's Google Maps place identifier, the date we
  first collected it, the date you first asked us to stop contacting you or to
  delete your information, and a "do not contact" flag with the reason. We keep
  that minimum so we can recognize the business and avoid adding it back to our
  lists. We also take down any sample website we built for the business and
  remove the business from that website's source code and from our prospecting
  notes on GitHub. Earlier versions of that code and those notes can remain in
  their version history on GitHub.
- **Correct your information.** If something we hold about you is inaccurate, we
  will fix it.

We do not sell or share personal information, so there is nothing to opt out of
on that front, but you can ask us to stop contacting you at any time. We will not
treat you differently for making any of these requests.

California residents have these rights under the California Consumer Privacy Act,
as amended by the California Privacy Rights Act. We honor them for everyone,
wherever you are located.

## How to make a request

- **Email:** {{PRIVACY_CONTACT_EMAIL}}
- **Mail:** {{LEGAL_ENTITY_NAME}}, {{MAILING_ADDRESS}}
- **If we emailed you:** reply "unsubscribe" to that email.
- **If we called you:** tell us on the call that you do not want to be contacted.

Please tell us the business name and a phone number, email address or website we
might have on file, so we can find the record.

Before we share or delete information, we confirm that the request comes from the
business or from someone authorized to act for it, usually by replying to the
email address or calling the phone number in our records. We do not need to
verify a request to stop contacting you. You may use an authorized agent, and we
may ask for proof that the agent is authorized.

We act on requests to stop contacting you within 10 business days. We confirm
other requests within 10 business days and respond within 45 days. If we need
more time, we will tell you why, and we will take no more than 45 additional
days.

## Changes to this policy

If we change this policy, we will post the new version here and update the
effective date.

## Contact

{{LEGAL_ENTITY_NAME}} · {{MAILING_ADDRESS}} · {{PRIVACY_CONTACT_EMAIL}}

<!-- privacy-policy:end -->

---

## Claim ledger — what makes each statement true

| Policy statement                                                               | Backed by                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories collected                                                           | `leads` columns in `supabase/migrations/0001`, `0002`, `0005`, `0006`, `0007`, `0012` (`lead_notes`), `0013`                                                                                                                                                                                                                                                                        |
| Listings come through Outscraper, from Google Maps                             | `lib/lead-gen/index.mjs`, `scripts/outscraper-fetch.mjs`                                                                                                                                                                                                                                                                                                                            |
| Email found only if literally on the business's site, never guessed            | `scripts/crawl-lead-emails.mjs` (`NEVER GUESSES`), `lib/leads/email-extract.mjs`                                                                                                                                                                                                                                                                                                    |
| Contact person "if we learn it"                                                | `owner_name` has no automated writer; it is only entered by hand                                                                                                                                                                                                                                                                                                                    |
| Website measurements via PageSpeed Insights                                    | `scripts/audit-sites.mjs`                                                                                                                                                                                                                                                                                                                                                           |
| AI drafts sample site content                                                  | `lib/agent/enrich.mjs` sends the lead record to Anthropic                                                                                                                                                                                                                                                                                                                           |
| Sample sites hosted on Vercel                                                  | `lib/render/index.mjs` deploy commands (`vercel deploy`, preview is basic-auth gated)                                                                                                                                                                                                                                                                                               |
| Smartlead for email                                                            | `lib/outreach/smartlead.mjs`, `scripts/push-outreach.mjs` (not yet run live)                                                                                                                                                                                                                                                                                                        |
| GitHub stores sample-site source and prospecting notes, some publicly visible  | **Confirmed 2026-09-16:** `hirobius/site-engine` is a public repo and `apps/<slug>/client.config.ts` carries real lead facts (a header reads "Real lead facts used verbatim"); `lib/render/index.mjs` tells the operator to paste generated configs there. `hirobius/ops` is public and `docs/prospecting/run-log.md` names shortlisted leads with scores                           |
| Due for deletion at {{RETENTION_MONTHS}} months unless outreach/client/opt-out | `scripts/purge-stale-leads.mjs` filter: `created_at < cutoff`, `outreach_status is null`, `won_at is null`, `do_not_contact = false`; window from `retention.mjs`                                                                                                                                                                                                                   |
| Cleanup runs by hand                                                           | `scripts/purge-stale-leads.mjs` header: "Manual/passive trigger only — no cron"                                                                                                                                                                                                                                                                                                     |
| Opt-outs kept indefinitely                                                     | the purge filter never matches `do_not_contact = true`                                                                                                                                                                                                                                                                                                                              |
| Do-not-contact excluded from email list, call list, outreach queue             | `scripts/push-outreach.mjs`, `lib/leads/call-list.mjs`, `lib/supabase/leads.mjs` `listPitchQueue` + `lib/leads/pitch-actions.mjs`                                                                                                                                                                                                                                                   |
| Removed from an email sequence already sending                                 | **manual** — `privacy-request.mjs --type opt-out` prints a `MANUAL:` Smartlead step for any lead with an email; suppression alone only stops future pushes                                                                                                                                                                                                                          |
| Not added back to the prospect database; no new email lookups                  | `lib/supabase/leads.mjs` `upsertLeads` (every DB ingest path, matched on `place_id`; a failed suppression lookup upserts nothing), `scripts/crawl-lead-emails.mjs`. **Not claimed:** `scripts/audit-sites.mjs` and site generation (`lib/leads/pipeline.mjs`) do not check `do_not_contact`, and `scripts/outscraper-fetch.mjs` writes local batch files before suppression applies |
| Opt-out, know, delete handling; the minimal record kept after deletion         | `lib/compliance/privacy-request.mjs`, run by `scripts/privacy-request.mjs`                                                                                                                                                                                                                                                                                                          |
| Sample site taken down; removed from site source and prospecting notes         | **manual** — `privacy-request.mjs --type delete` prints `MANUAL:` steps for the Vercel project, `hirobius/site-engine` `apps/<slug>/` and `run-log.md`. Git history is not rewritten, hence the "version history" sentence                                                                                                                                                          |
| Verbal "don't call me" suppresses                                              | `scripts/log-call.mjs --outcome do-not-call`                                                                                                                                                                                                                                                                                                                                        |
| Correction                                                                     | **manual** — edit the row in Supabase; no tool yet                                                                                                                                                                                                                                                                                                                                  |
| Response times, identity verification, honoring everyone                       | **human process** — see "Handling a privacy request" in `compliance.md`                                                                                                                                                                                                                                                                                                             |
