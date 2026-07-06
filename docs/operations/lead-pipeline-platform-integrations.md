# Lead pipeline — downstream platforms (Duda build · GHL CRM)

Where the lead pipeline goes after sourcing + scoring. Two **complementary**
(not competing) layers:

```
pull (Places) → generate (agent: config + eval) → [BUILD a real site] → [CRM + outreach] → won/lost
                                                    └── Duda ───────┘    └── GHL or in-house ┘
```

- **Duda** fills the _build_ gap: turn the agent's `ClientConfig` into a real,
  published website and capture its `preview_url`. → **roadmap below (Part A)**.
- **GoHighLevel (GHL)** is a _candidate_ for the _CRM/outreach_ gap. It's in flux,
  so this is a **trade-offs memo, not a commitment (Part B)**.

The `leads` table already anticipates both: `preview_url`, `sent_at`, and the
`sourced → generating → scored → sent → won/lost` lifecycle.

Pricing/feature facts below are mid-2026 from vendor + third-party pages; **confirm
on the vendor pricing pages before committing budget.**

---

## Part A — Duda integration roadmap

### Why Duda fits this pipeline cleanly

Duda's **Content Injection API** is a near-1:1 match for our agent output: you
build a template once with `data-inject` attributes, then push a JSON content
object (business name, hours, address, images, copy) to populate it — exactly the
shape `runPipeline` already returns as `config`. Sites can be created from a
template or AI-generated, then published via a single API call.
([API overview](https://www.duda.co/features/api),
[content injection setup](https://developer.duda.co/docs/how-to-setup-pages-for-content-injection),
[generate a complete site via API](https://www.duda.co/product-updates/generate-a-complete-site-via-api-plus-more-updates))

### The same four-part pattern (mirrors the leads integration)

1. **Data model** — extend `leads` (or add a `sites` table):
   `duda_site_name text unique`, `editor_url text`, `preview_url` (exists),
   `site_status text` (`none → building → built → published → publish_failed`).
   `duda_site_name` is the idempotency key — re-runs update the same Duda site.
2. **Trigger** — per-lead **"Build site"** button on `/ops/leads` (enabled once
   `status='scored'`), and later a bulk action.
3. **Runner** — `api/build-site.ts` (+ dev mirror in `scripts/leads-middleware.mjs`),
   importing a ported `lib/duda/` adapter. Steps: create-from-template → inject the
   `config` → publish → store `duda_site_name`, `preview_url`, `editor_url`.
4. **Render** — board shows site status + a "Preview" / "Open editor" link.

### API surface needed (Duda Partner REST API)

- Create from template (or AI-generate) — `POST /api/sites/multiscreen/create`.
- Inject content — Content Injection API against `data-inject` targets.
- Publish — `POST https://api.duda.co/api/sites/multiscreen/publish/{site_name}`.
- Editor SSO link — for "Open in editor" (human polish before send).
- Webhooks — publish/edit events → flip `site_status` without polling.

### Decisions baked in (consistent with the brief's Part 1)

- **Timeouts.** Create+inject+publish can exceed a serverless window → use the
  **status-queue pattern**: the button sets `site_status='building'`; a worker/cron
  drains `building → published`. The board shows live status.
- **Secrets server-only.** `DUDA_API_USER` / `DUDA_API_PASSWORD` (Partner API
  credentials, Basic auth) live in Vercel env, used only in `api/`/worker code.
- **Idempotency.** Upsert on `duda_site_name`; re-running edits the existing site.
- **Preview before publish (recommended).** Inject → leave unpublished → store the
  preview/editor URL → a human reviews → then publish. Keeps a quality gate on the
  client-facing artifact.

### Cost model — billing is per _published_ site (previews are free)

Duda bills **per published site beyond your plan's included count** — **unpublished
sites do not bill**, and unpublishing stops the charge.
([site subscription / billing](https://support.duda.co/hc/en-us/articles/26518336119063-Site-Management-Subscription-and-Deletion))
API + white-label are on the **Agency ($52/mo)** and **White Label ($149/mo)**
tiers; both include **4 published sites**, extras ~**$17/published-site/mo**. A
14-day White-Label trial covers all features.
([pricing](https://www.duda.co/pricing), [G2](https://www.g2.com/products/duda/pricing))

→ Implication: **previews are ~free; you pay on conversion.** Create unpublished
spec sites for as many leads as you're pitching (no per-site charge), share their
preview links, and only **publish** on a yes (subdomain, or a custom domain at
sale). Leave-unpublished / delete the ones that don't convert. Cost then scales
with **wins**, not outreach volume. (Confirm any account cap on the number of
_unpublished_ drafts before scaling to hundreds.)

### Client previews (the spec-site play)

Duda supports exactly the "build it → send a link → sell it → go live" motion:

- **Unpublished sites get a shareable preview URL.** The editor's _Preview Link_
  (All Devices / Desktop / Mobile) shows the site including unpublished changes and
  can be copied + sent.
  ([site settings / preview](https://support.duda.co/hc/en-us/articles/26519963676695-Site-Settings))
- **Built-in approval** via **Site Comments** — share the preview, let clients leave
  inline comments, with email notifications (Team / Agency / White Label).
  ([Site Comments](https://www.duda.co/features/site-comments))
- **Free until you publish** (see the cost model above).

Pipeline flow: `build-site` creates the unpublished site + injects `config` →
stores the preview URL in `leads.preview_url` → outreach sends the link → on a yes,
a separate `publish-site` action goes live and flips `site_status='published'`.

⚠️ **Verify before cold-outreach at scale:** confirm the plain _Preview Link_ is
viewable **without a Duda login** (the Site-Comments collaborator flow is auth'd;
the preview link should be open — test one in an incognito window). If previews
turn out to need auth, fall back to publishing to a throwaway
`*.multiscreensite.com` subdomain (public, but counts as a published/billed site).

### Field mapping (Places → `leads` → Duda) — capture at scrape time

Captured now (migration `0002_lead_site_fields.sql`) so a lead never needs
re-scraping to build its site. Most map straight from one Google Places **Place
Details** call — mind the field tiers (phone + hours are "Contact", editorial
summary is "Atmosphere"), so request them once.
([Places data fields](https://developers.google.com/maps/documentation/places/web-service/data-fields),
[Duda business data](https://support.duda.co/hc/en-us/articles/26519957137687-Business-Data))

| Duda business-data field         | `leads` column                                                | Places source                                                  |
| -------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------- |
| Business name                    | `name`                                                        | `displayName`                                                  |
| Category / types                 | `category`, `types`                                           | `primaryType` / `types`                                        |
| Description / about              | `description`                                                 | `editorialSummary`                                             |
| Street address                   | `street_address`                                              | `addressComponents` (number + route)                           |
| City / region / postal / country | `city` / `region` / `postal_code` / `country`                 | `addressComponents`                                            |
| Geo (map + schema)               | `latitude`, `longitude`                                       | `location`                                                     |
| Phone                            | `phone`                                                       | `nationalPhoneNumber`                                          |
| Email                            | `email`                                                       | enrichment (not in Places)                                     |
| Hours                            | `hours`                                                       | `regularOpeningHours`                                          |
| Photos / gallery                 | `photos`                                                      | `photos` (Place Photos)                                        |
| Logo                             | `logo_url`                                                    | enrichment / site favicon                                      |
| Social accounts                  | `social`                                                      | enrichment                                                     |
| Maps link / schema               | `google_maps_url`                                             | `googleMapsUri`                                                |
| Service area                     | `service_area`                                                | derived from metro                                             |
| Signals                          | `rating` / `review_count` / `price_level` / `business_status` | `rating` / `userRatingCount` / `priceLevel` / `businessStatus` |

`lib/duda` → `toDudaContent(lead)` is the code-level source of truth for this
mapping. Anything Places can't supply (email, logo, socials, a clean description)
is filled by the agent's enrich step (`lib/agent/enrich.mjs`), which
`generate-site` persists back onto the lead (coalesced — existing values win).

### Scaffold status (shipped on this branch)

v1 is scaffolded (stubs): `lib/duda/index.mjs` (`buildSite`/`publishSite`/`toDudaContent`),
`api/build-site.ts` + `api/publish-site.ts` (dev-mirrored in
`scripts/leads-middleware.mjs`), the `0002` schema columns, and Build/Preview/
Publish/Live actions on the board. `build-site` creates an **unpublished** site +
injects content and stores `preview_url`; `publish-site` goes live and sets
`live_url` + `published_at`. Going live = drop the real Duda Partner REST calls
into `lib/duda` (env: `DUDA_API_USER` / `DUDA_API_PASSWORD`).

### Phased delivery

- **v1** — `lib/duda` adapter + `POST /api/build-site` for one scored lead
  (create → inject → **leave as preview**). Board shows preview/editor links.
- **v2** — per-lead "Build site" button + "Publish" as a separate explicit action.
- **v3** — bulk build via the status-queue worker; publish webhooks; delete-on-lost
  to control spend.

### Open questions

- One reusable injection-ready template, or per-niche templates? (Drives template
  prep work — the `data-inject` wiring is a one-time human/design task.)
- Subdomain (`*.multiscreensite.com`) for previews vs custom domain at sale.
- Who owns the published site post-sale — our account (recurring per-site cost) or
  transferred to the client?

---

## Part B — GoHighLevel: trade-offs (in flux, no commitment)

### What GHL could do here

GHL is an all-in-one agency platform: **CRM/pipelines, conversations (email/SMS),
calendars, workflows/automation, sub-accounts per client, and SaaS-mode resale.**
For this pipeline it's a candidate for the **CRM + outreach** stage (and,
separately, a possible white-label resale business). API 2.0 is OAuth-based with
Contacts + Opportunities/Pipelines + Webhooks.
([API docs](https://marketplace.gohighlevel.com/docs/),
[OAuth](https://marketplace.gohighlevel.com/docs/Authorization/OAuth2.0/index.html))

### The core tension

`/ops` **already has** a leads pipeline (Supabase `leads` + the board I built).
GHL is _also_ a system of record for leads/contacts/pipelines. Adopting it raises
the classic question: **who is the source of truth?** Two CRMs = sync drift unless
one is clearly authoritative.

### Integration options (low → high coupling)

| Option                                               | What                                                                       | Pros                                                                      | Cons                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| **1. Thin one-way push** _(recommended if adopting)_ | Scored/qualified lead → create GHL **contact + opportunity** in a pipeline | Supabase stays SoR; low coupling; swappable; outreach automation for free | One-way (GHL stage changes don't flow back)                            |
| **2. Two-way sync**                                  | Option 1 + GHL **webhooks** → update `leads.status`                        | Board reflects real outreach progress                                     | Conflict resolution; webhook reliability; more code                    |
| **3. GHL as SoR**                                    | Ops just triggers; GHL owns the pipeline                                   | Less to build/maintain in-house                                           | Throws away the board; deep lock-in; the `/ops` UX fragments           |
| **4. White-label SaaS resale**                       | Resell GHL to clients (SaaS mode)                                          | New revenue line                                                          | A **business-model** decision, not a pipeline one; needs the $497 tier |

### Costs & lock-in

- Tiers: **Starter $97** (3 sub-accounts, **location** API only, no SaaS),
  **Unlimited $297** (unlimited sub-accounts + API, no SaaS),
  **Agency/SaaS Pro $497** (SaaS resale + **agency API keys + full OAuth 2.0 for
  public apps**). Annual ≈ 17% off.
  ([pricing breakdown](https://netpartners.marketing/gohighlevel-pricing-plans-explained-features-value-cost-comparison-2026/),
  [vendor](https://www.gohighlevel.com/pricing))
- **Usage billed on top:** SMS, email, calls, AI actions (e.g. Conversation AI
  ~$0.02/msg) — real per-lead variable cost for outreach.
- **API limits:** 100 req / 10s and 200k/day per app per resource — fine for our
  volume. ([rate limits](https://ecosire.com/blog/gohighlevel-webhooks-api-integration))
- **Lock-in / "in flux":** full OAuth app dev needs the **$497** tier; GHL's
  product + pricing move frequently. Don't hard-couple to it.

### Alternatives to weigh before buying

- **In-house outreach** on the existing Supabase model + a focused sender
  (Resend/SES for email, Twilio for SMS). Keeps one SoR; most control; most build.
- **Cold-email tools** (Instantly / Smartlead) — cheaper, deliverability-tuned for
  _outbound_ specifically, but not a CRM.
- **Lightweight CRM** (Close / Pipedrive) — cleaner CRM than GHL, no white-label
  resale story.
- **GHL** — widest surface (CRM + multichannel + resale) but heaviest and priciest.

### Recommendation (given it's in flux)

1. **Keep Supabase `leads` as the system of record.** The board stays the hub.
2. **If/when GHL is chosen, integrate as a thin adapter** behind the same
   `lib/<tool>/` + `api/` pattern as everything else (`lib/ghl/`, `api/push-to-ghl.ts`):
   push contact + opportunity on `scored`/intent; optionally one inbound webhook →
   `leads.status`. Put it behind a feature flag so it's swappable.
3. **Defer SaaS-mode / white-label resale** — that's a separate business decision
   (and the $497 tier), independent of the lead pipeline.
4. **Decision checklist before committing:** Do we need multichannel (SMS+email) or
   just email? Resell to clients, or internal use only? Is GHL the long-term CRM, or
   a stopgap? Each "just email / internal / stopgap" answer argues for in-house or a
   lighter tool over GHL.

---

## Duda vs GHL — they're different layers

|                     | Duda                                    | GoHighLevel                                 |
| ------------------- | --------------------------------------- | ------------------------------------------- |
| Role in pipeline    | Build + publish the **website**         | **CRM + outreach** (+ optional resale)      |
| Maps to             | `config` → live site, `preview_url`     | `scored` lead → contact/opportunity, `sent` |
| Recommended posture | **Build it** (Part A roadmap)           | **Adapter-only, deferred** (Part B)         |
| Cost shape          | per _published_ site/mo (previews free) | per-tier/mo + usage                         |

They can both ship: Duda produces the site that becomes a lead's `preview_url`;
GHL (or in-house) drives the outreach that moves it to `sent → won`.

---

## Part A.1 — Duda delivery handoff (authoritative, 2026-06-18)

The `hirobius/clients` Duda-delivery handoff (`docs/DUDA-DELIVERY.md` +
`OPSHANDOFFDUDA.md`) is the authoritative spec for this layer; decision recorded in
[ARCHITECTURE.md](../ARCHITECTURE.md). It refines the roadmap above — key points +
how the scaffold here reconciles to it.

### Lifecycle + contract

- Lifecycle gains a **`rendered`** state: `sourced → generating → scored →
rendered → sent → won/lost`.
- The render target consumes the **`ClientConfig`** contract (`hirobius/clients` →
  `packages/schema`); the agent emits it. Public surface:
  - `renderToDuda(config) → { dudaSiteName, previewUrl }` — creates an UNPUBLISHED
    site from the per-preset template + injects content.
  - `publishDudaSite(dudaSiteName, domain)` — flips live + attaches the domain
    (the billed-on-"yes" step).
- Per-preset template ids are env, not hardcoded — `DUDA_TPL_LANDSCAPING`,
  `DUDA_TPL_JUNK`, `DUDA_TPL_PRESSURE`, `DUDA_TPL_CONCRETE`, keyed on
  `config.brand.palettePreset`.

### ClientConfig → Duda mapping (condensed; full table in clients `docs/DUDA-DELIVERY.md`)

| `ClientConfig`                               | Duda mechanism                                                              |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `business.{name,phone,email,address?}`       | Business data fields                                                        |
| `business.hours[]`                           | Business data schedule (verify strings vs structured)                       |
| `business.serviceAreas[]`                    | Business data areas + LocalBusiness `areaServed`                            |
| `brand.palettePreset`                        | Selects the pre-built Duda template                                         |
| `brand.cssVarOverrides` (`--brand-*`)        | Site global colors via API — ⚠ risk #1                                      |
| `brand.font`                                 | Site global font (map 5 font ids → Duda fonts)                              |
| `brand.radius`                               | Template CSS — ⚠ likely not per-site via API                                |
| `layout.variant` (A/B)                       | Template choice (A image hero / B video hero)                               |
| `layout.sectionOrder[]`                      | Frozen to canonical order in the template — ⚠                               |
| `services[]`                                 | Duda Collection `services` (upload image, map icon)                         |
| `gallery[]` {src,alt}                        | Duda Collection / gallery (upload + alt)                                    |
| `reviews[]`                                  | Duda Collection `reviews`                                                   |
| `copy.{heroHeadline,heroSub,ctaLabel,about}` | Content injection into named regions                                        |
| `hero.{image,videoSrc,videoPoster}`          | Upload assets → hero widget                                                 |
| `map.{staticImage?,embedQuery?}`             | Duda native map widget                                                      |
| `form.*`                                     | **Drop** → Duda native form + spam protection; recipient = `business.email` |
| `seo.{title,description,ogImage?}`           | Per-page SEO + OG                                                           |
| `seo.{city,region,siteUrl}`                  | LocalBusiness schema + custom domain                                        |
| LocalBusiness JSON-LD                        | Duda auto-schema, else header custom-code — ⚠ risk #2                       |

### ⚠ Spike first (gate before wiring for real)

Before relying on `renderToDuda`, the handoff requires a spike against the demo
config to resolve: (1) per-site colors/font via API; (2) custom JSON-LD injection;
(3) `sectionOrder` frozen on Duda; (4) collection binding incl. images + alt;
(5) form notifications + redirect. Acceptance criteria live in clients
`docs/DUDA-DELIVERY.md`. **Gate this before scaling the board step.**

### Reconciliation: current scaffold ↔ handoff

The data model + flow already match (one Duda site per lead, unpublished preview →
publish-on-yes, `duda_site_name` natural key). The deltas are naming + signature:

| Handoff                                     | Scaffolded here                                   | Action to align                                                                  |
| ------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| `renderToDuda(config)`                      | `buildSite(lead)` + `toDudaContent(lead)`         | rename → `renderToDuda` taking `ClientConfig` (when the real agent/schema lands) |
| `publishDudaSite(name, domain)`             | `publishSite(name)`                               | add `domain` param                                                               |
| `app/api/render-site/route.ts` (App Router) | `api/build-site.ts` (Vercel fn)                   | keep our function shape; rename file → `api/render-site.ts`                      |
| `/api/publish-site`                         | `api/publish-site.ts`                             | matches                                                                          |
| `status='rendered'` → `'sent'`              | separate `site_status` col (none→built→published) | **decision needed** — fold into `status` per handoff, keep extra cols as data    |
| `duda_site_name text unique`                | shipped in `0002` ✓                               | none                                                                             |
| `DUDA_TPL_*` preset ids                     | not yet                                           | add the 4 env vars when templates exist                                          |

**Net:** small deltas, applied when the real engine is ported
(`ops-lead-pipeline-go-live`) and gated by the spike — not a rebuild.
