# Prospecting run log

Durable record of every Outscraper prospecting run — spend, yield, and what
we learned — so hard data survives past the session that generated it.
Companion to `outscraper-pipeline.md` (mechanics), `niche-targeting.md`
(which niches, and why), `outreach-playbook.md` (how we sell), and
`compliance.md` (retention/suppression rules for the leads this produces).

Append a new `## Run NN` section per run; never edit past runs except to fix
a factual error (note the correction inline).

---

## Run 01 — 2026-07-07 (WA trades metro sampler)

### Spend

| Batch | Records |
|---|---|
| Smoke test | 20 |
| Fencing | 57 |
| Tree service / septic | 112 |
| Pressure washing / concrete | 80 |
| **Total pulled** | **~269** |
| **Reserve remaining** | **~231** |

### Result table

- **249 leads** landed in the table.
- **25 qualified** (`lead_score >= 60`).
- Site-presence mix across all 249: `none: 25` · `custom: 223` · `builder: 1`.
- **Every one of the 25 qualified leads has no website.** Meanwhile **90% of
  all scraped businesses are already on custom sites** — the addressable
  no-site population is a thin slice of what gets scraped.

### Finding 1 — geography beats niche

Spokane + Olympia produced **~20 of the 25 qualified leads**; Seattle produced
**~5**. Smaller/eastern-WA metros yielded **~4×** the qualified rate of
Seattle. Seattle reads as picked-over — high site-penetration, likely years of
agency/freelancer coverage already.

### Finding 2 — niche ranking was inverted from the pre-run guess

**Fencing** (ranked #1 in `niche-targeting.md`'s pre-run shortlist) was the
**worst performer**: only 2 qualified, both tiny Olympia operators. Actual
yield, best to worst: **excavation > septic > tree > pressure-washing >
fencing**. Excavation leads clustered geographically — worth targeting as a
cluster, not a scatter.

### Finding 3 — the 58–59 near-miss cluster (motivated a 3rd score)

A cluster scored **58–59** — just under the 60 qualify threshold — despite
**very high review counts** on **custom sites** (busy, established businesses):

- **A Advanced Septic** — 2,872 reviews, scored 59.
- **Bob Oates** — 760 reviews, scored 58.

`lead_score` is blind to these because it scores site-*weakness*, and these
businesses have real sites. But a well-reviewed business on a dated/weak site
is a plausible rebuild target. This gap motivated the **3rd "site-quality"
score** (`scripts/lib/site-audit.mjs`) — need vs. redesign-worthiness are two
different axes.

### Top outreach shortlist (score = need/build)

| Business | Score | Metro | Reviews |
|---|---|---|---|
| Monroe Street Power Wash | 95/95 | Spokane | 335 |
| PNW Arborist Consulting | 94/95 | Olympia | 233 |
| Septic Response | 94/80 | Kirkland | 228 |
| Paradigm Tree Works | 86/76 | Spokane | — |
| Northwest Excavators | 82/60 | Spokane | — |
| Armstrong Tree Works | 79/68 | Spokane | — |

### Decisions made from this run

- **Dropped realtors** — confirmed low-yield avoid niche; the prior realtor
  batch's data was lost, not worth re-scraping to recover.
- **Hold further Outscraper spend** until the site-quality score is validated
  against this run's data.
- **Build the site-quality (3rd) score** and use it to **audit the 223
  custom-site leads already in hand at zero additional cost** — a bigger pool
  than the 25 `lead_score`-qualified leads, already paid for.
- **Next paid run** targets Spokane/Olympia + the underserved trades this run
  surfaced (excavation, septic, tree, pressure-washing); skip fencing unless
  the site-quality pass changes the picture.

---

## Run 02 — TEMPLATE (fill in and rename on next run)

### Spend

| Batch | Records |
|---|---|
| | |
| **Total pulled** | |
| **Reserve remaining** | |

### Queries / presets used

-

### Result table

- **N leads** landed; **N qualified** (note which score + threshold).
- Site-presence mix:

### Findings

1.
2.

### Top outreach shortlist

| Business | Score | Metro | Reviews |
|---|---|---|---|
| | | | |

### Decisions made from this run

-
