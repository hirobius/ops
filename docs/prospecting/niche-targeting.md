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

| # | Niche | Website-penetration signal | Typical job ticket | Why they say yes | Caveat |
|---|---|---|---|---|---|
| 1 | **Fencing / deck builders** | Low; Facebook-only common | ~$3,300 avg fence install | One job funds the site 5–10×; project-based, Google-driven, low agency saturation | Seasonal/regional |
| 2 | **Tree services / arborists** | Low; trucks + Facebook + word-of-mouth | ~$750 avg, removals $10k+ | High ticket, urgent/storm-driven, owners rarely pitched | Licensing/insurance varies |
| 3 | **Septic / excavation / land clearing** | Very low; rural, often no site at all | pump ~$430; installs $5k–$25k+ | Almost no local online competition → "own the map"; high install ticket | Smaller universe per metro |
| 4 | **Pressure / soft washing** | Low; solo operators, IG/FB-only norm | $250–$600 house | New/hungry owners, before/afters sell a site, cheap to reach | Lower ticket → price-sensitive; seasonal |
| 5 | **Concrete / epoxy floor coating** | Low–moderate; many new operators | $1,500–$4,000+/garage | High ticket, aspirational visuals | Screen out franchisees with corporate sites |

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
   A switch-sell to a heavily-pitched, sophisticated buyer. *(Confirmed by our own
   WA test: 57/60 had custom sites.)*
2. **Restaurants** — thin margins (3–5% net), low budgets, and discovery lives on
   Google Maps/Yelp/Instagram/DoorDash, not their own site → low perceived value.
   Portfolio-builder only.
3. **HVAC / plumbing / roofing** — high ticket and lead-hungry, but *not*
   low-penetration (they have sites, just bad ones) and the **most agency-saturated**
   vertical. A redesign/SEO/ads play for experienced sellers, not a "you have no
   site" cold pitch.
4. **Med-spas / dental / injury law** — great LTV but high-competition, already
   have sites, gatekept, long sales cycles. Wrong shape for a fast one-page product.

## Sources
- [b2bleadfinder — Small businesses without a website (2024–26)](https://b2bleadfinder.io/blog/small-business-without-website-statistics)
- [Network Solutions — SMB website statistics (2026)](https://www.networksolutions.com/blog/small-business-website-statistics/)
- [CallRail — Home services marketing statistics (2026)](https://www.callrail.com/blog/home-services-marketing-statistics)
- Angi cost guides (2026): [fence](https://www.angi.com/articles/how-much-does-fence-installation-cost.htm) · [tree removal](https://www.angi.com/articles/how-much-does-tree-removal-cost.htm) · [septic](https://www.angi.com/articles/how-much-does-septic-tank-pumping-cost.htm)
- [Housecall Pro — Pressure washing pricing (2026)](https://www.housecallpro.com/resources/how-to-price-pressure-washing-jobs/) · [Forbes — Epoxy garage floor cost (2024)](https://www.forbes.com/home-improvement/garage/garage-floor-epoxy-cost/)
- [LeadsByLocation — Most profitable web-design niches (2026)](https://leadsbylocation.com/blog/best-niches-for-web-design/)
