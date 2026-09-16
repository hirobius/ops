# Niche targeting — which local businesses to prospect

Which US local-service niches to scrape for cold-outreach spec sites, and which to
avoid. Evidence-based; sources cited. Companion to `outscraper-pipeline.md` (the
scraper) and `outreach-playbook.md` (how to sell). Pairs with the pipeline's two
scores: `leadScore` (how much they NEED a site) × `buildScore` (how compelling a
site we can build from their existing info).

> **Data-quality caveat:** there is **no authoritative dataset** of "no-website
> rate" by narrow trade. Aggregate small-business figures (SCORE/GoDaddy) are
> reliable; the per-niche penetration splits below trace to secondary aggregators
> and are **directional signal, not a census**. Ticket-size figures are well
> sourced (Angi/Housecall Pro/Jobber, 2024–2026). The most reliable filter is
> **operational, not statistical** — scrape and target businesses whose website
> field is empty or points to Facebook. Our scorer does exactly this.

## The winning profile

A **local trade, owner-operated, with a high-enough job ticket that ONE closed job
pays for the site, discovered via Google/word-of-mouth (not a third-party
platform), currently on Facebook / a Google Business Profile / nothing.**

Baseline: ~27–28% of US small businesses had no website in 2024 (SCORE), and the
no-website population is heavily concentrated in local trades. Demand backdrop is
strong: 98% of consumers search online before hiring a home-services business; 72%
of home-services businesses plan to raise marketing spend in 2026.

## Ranked shortlist (best fit first)

| #   | Niche                                   | Website-penetration signal             | Typical job ticket             | Why they say yes                                                                  | Caveat                                      |
| --- | --------------------------------------- | -------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------- |
| 1   | **Fencing / deck builders**             | Low; Facebook-only common              | ~$3,300 avg fence install      | One job funds the site 5–10×; project-based, Google-driven, low agency saturation | Seasonal/regional                           |
| 2   | **Tree services / arborists**           | Low; trucks + Facebook + word-of-mouth | ~$750 avg, removals $10k+      | High ticket, urgent/storm-driven, owners rarely pitched                           | Licensing/insurance varies                  |
| 3   | **Septic / excavation / land clearing** | Very low; rural, often no site at all  | pump ~$430; installs $5k–$25k+ | Almost no local online competition → "own the map"; high install ticket           | Smaller universe per metro                  |
| 4   | **Pressure / soft washing**             | Low; solo operators, IG/FB-only norm   | $250–$600 house                | New/hungry owners, before/afters sell a site, cheap to reach                      | Lower ticket → price-sensitive; seasonal    |
| 5   | **Concrete / epoxy floor coating**      | Low–moderate; many new operators       | $1,500–$4,000+/garage          | High ticket, aspirational visuals                                                 | Screen out franchisees with corporate sites |

**Secondary "volume tier"** — strong on reach + no-site rate, weaker on ticket
(sell a cheaper templated one-pager, win on volume): **junk removal** ($150–350;
but 1-800-GOT-JUNK/College Hunks dominate SEO), **gutter install/guards**
($1k–4k installs), **chimney sweep / dryer-vent cleaning** (seasonal, older owner
base), **mobile car detailing** (very low penetration, IG/FB-only, but low ticket &
churn), **hardscaping / paver patios** (push landscapers toward the $5k–20k build
side, away from race-to-the-bottom mowing).

**The five that hit all three criteria hardest** (low penetration × ticket ×
reachable): **Fencing/decks → Tree services → Septic/excavation → Pressure washing
→ Epoxy/concrete coating.** These are the WA presets shipped in
`scripts/lib/query-presets.mjs` (`fencing-wa`, `tree-service-wa`, `septic-wa`,
`pressure-washing-wa`, `concrete-coating-wa`).

## Niches to AVOID

1. **Realtors** — effectively website-saturated (~95%; brokerages supply IDX sites).
   A switch-sell to a heavily-pitched, sophisticated buyer. _(Confirmed by our own
   WA test: 57/60 had custom sites.)_
2. **Restaurants** — thin margins (3–5% net), low budgets, and discovery lives on
   Google Maps/Yelp/Instagram/DoorDash, not their own site → low perceived value.
   Portfolio-builder only.
3. **HVAC / plumbing / roofing** — high ticket and lead-hungry, but _not_
   low-penetration (they have sites, just bad ones) and the **most agency-saturated**
   vertical. A redesign/SEO/ads play for experienced sellers, not a "you have no
   site" cold pitch.
4. ~~**Med-spas / dental / injury law**~~ — **superseded 2026-09-16.** See
   "The high-ticket tier" below. The original objection was "they already have
   sites", which our own scorer stopped treating as a disqualifier when the
   2026-09-15 reweight made a _proven buyer_ outrank a proven need. The other
   objections (saturation, gatekeepers, cycle length) still stand and are now
   priced in rather than used to rule the tier out.

## The high-ticket tier (added 2026-09-16)

A **second thesis**, not a correction of the first. The shortlist above optimises
for the **cheapest close**: low website penetration means the pitch is "you have
no site", the product is one templated page, and the owner answers his own phone.
This tier optimises for **client budget** instead.

| Niche                                       | Typical build  | Recurring                 | Why they say yes                                       | What it costs us                           |
| ------------------------------------------- | -------------- | ------------------------- | ------------------------------------------------------ | ------------------------------------------ |
| **Personal injury / family / criminal law** | $8k–15k        | SEO + content retainer    | One signed case dwarfs the fee; they already buy leads | Most agency-saturated vertical there is    |
| **Cosmetic / implant dental**               | $4k–18k        | Ads management            | Elective, cash-pay, patient chooses on the website     | Office manager gatekeeps the owner         |
| **Elective medical specialists**            | ~$9k + monthly | Yes                       | Same shape as dental; higher procedure value           | Accessibility-lawsuit exposure (see below) |
| **Financial advisors**                      | Mid            | Compliance-driven content | Trust is the product and the site is the proof         | FINRA/SEC review on marketing copy         |
| **Custom home builders**                    | Mid–high       | Photo/project updates     | Six-figure ticket **and** an owner who picks up        | Screen out production builders             |

### The pitch is a different pitch

Nobody in this tier needs a website. The claim is **"your site costs you money"**,
and it is only credible with evidence attached. The strongest framings:

- **Ad-spend math.** Dentist cost-per-lead runs ~$84. "Your site converts worse
  than it should, so you're paying for clicks you don't close" beats any
  aesthetic argument, because it is their money and they already spend it.
- **Speed as revenue.** `scripts/lib/site-audit.mjs` already returns mobile
  performance and a plain-English `issues[]` list. Lead with the number.
- **Accessibility exposure.** The same audit returns `accessibilityScore` and
  nothing currently pitches it. ADA web suits against medical practices rose ~27%
  in 2025. For this tier that is a risk line, not a design nicety.

### The mechanical prerequisite — this tier is INERT without it

Every business here has a custom domain, which scores
`4 + 30 + 10 + 15 = 59` against `QUALIFIED_LEAD_SCORE` **60**. An unaudited custom
site is deliberately unqualifiable (`scripts/lib/outscraper-normalize.mjs`: "we do
not know, so we do not email"). So **without a PageSpeed audit, not one lead in
this tier can ever be contacted** — scrape spend on these presets is wasted until
`PAGESPEED_API_KEY` is set and `scripts/audit-sites.mjs` has run. Audit first,
then outreach; never the other way round.

### Buying signals — who is _eager_, not merely rich

Budget alone is not eagerness. The signals that separate them:

1. **Currently running Google Ads** ([Ads Transparency Center](https://adstransparency.google.com))
   — the single best one. They are already paying for leads, so conversion is a
   live P&L line, not a hypothetical. Not captured by any column we have today.
2. **Hiring** (Indeed/LinkedIn) — growth, therefore budget.
3. **New location or recent rebrand** — the site is already on the list.
4. **Many recent reviews + a visibly dated site** — demand outrunning the
   storefront. This one our scorer _does_ see (`review_count` × `site_quality_score`).

### Known gap: `buildScore` is trades-shaped

`scoreBuildability` weights photos at 25 and reviews at 20 — right for a fencing
company, wrong for a law firm, which has neither a gallery nor before/afters. The
spec-site play ("here is your own site, already built") will produce weak mockups
in this tier until those weights are vertical-aware. Fix before a real run, not
after.

## Sources

- [b2bleadfinder — Small businesses without a website (2024–26)](https://b2bleadfinder.io/blog/small-business-without-website-statistics)
- [Network Solutions — SMB website statistics (2026)](https://www.networksolutions.com/blog/small-business-website-statistics/)
- [CallRail — Home services marketing statistics (2026)](https://www.callrail.com/blog/home-services-marketing-statistics)
- Angi cost guides (2026): [fence](https://www.angi.com/articles/how-much-does-fence-installation-cost.htm) · [tree removal](https://www.angi.com/articles/how-much-does-tree-removal-cost.htm) · [septic](https://www.angi.com/articles/how-much-does-septic-tank-pumping-cost.htm)
- [Housecall Pro — Pressure washing pricing (2026)](https://www.housecallpro.com/resources/how-to-price-pressure-washing-jobs/) · [Forbes — Epoxy garage floor cost (2024)](https://www.forbes.com/home-improvement/garage/garage-floor-epoxy-cost/)
- [LeadsByLocation — Most profitable web-design niches (2026)](https://leadsbylocation.com/blog/best-niches-for-web-design/)
