# Outscraper → proposal-site prospecting pipeline

Intake stage of the rapid-proposal consulting model: scrape local businesses
from Google Maps (via Outscraper), score them as mock-site candidates, and
scaffold a per-prospect `clients/<slug>/` folder that the /ops dashboard and
the site-build step already know how to read.

This is the "where do the client sites come from" question from the research
handoff (Astro / Tailwind / shadcn rapid-build stack). This pipeline produces
the **target list + the data each mock site is built from**; the build stack
consumes it.

```
Outscraper /maps/search-v3        ← scripts/outscraper-fetch.mjs (live | --fixture)
      │  raw places (JSON)
      ▼
normalize + score + dedupe        ← scripts/lib/outscraper-normalize.mjs
      │  Prospect[] (leadScore desc)
      ▼
prospects/<run>/batch.json,csv    ← --out         (gitignored, local-only)
      │
      ▼
clients/<slug>/meta.json          ← --scaffold-clients   (status:"prospect")
   + clients/<slug>/prospect.json (raw signals for the build step)
      │
      ▼
mock proposal site                ← Astro/shadcn build reads meta + prospect.json,
                                     swaps content via the single data file
```

## Files

| File | Role |
|------|------|
| `scripts/outscraper-fetch.mjs` | API client + CLI (dry-run, fixture, live async/sync, scaffold) |
| `scripts/lib/outscraper-normalize.mjs` | Pure place→Prospect normalizer + lead scoring |
| `src/app/pages/ops/prospectTypes.ts` | Types: `OutscraperPlace`, `Prospect`, `ProspectSignals` |
| `fixtures/outscraper-maps-search/response.json` | Synthetic response (offline testing; no PII) |
| `scripts/__tests__/outscraper-normalize.test.mjs` | Normalizer/scoring unit tests |

## Credentials

`OUTSCRAPER_API_KEY` — required only for a **live** pull. Export it in your
shell or `.env.local`. Per the hard rule, Hirobius/agents never read or write
`.env*` files; only the key **name** is referenced here and in code.

`--dry-run` and `--fixture` need no key and touch no network.

## Outscraper API contract (as wired)

- Base: `https://api.app.outscraper.com` (override with `OUTSCRAPER_API_BASE`)
- Auth: header `X-API-KEY: <key>`
- Search: `GET /maps/search-v3?query=<q>&limit=<n>&language=<l>&region=<r>&async=<bool>`
- Sync (`async=false`, default here): blocks, returns `{ status:"Success", data:[[…places]] }`
- Async (`--async`): a `202` returns `{ id, status:"Pending", results_location }`;
  the script polls `GET /requests/{id}` (same header) until `status:"Success"`.
- `data` is one array of places **per submitted query**.

## Lead scoring (why a prospect ranks)

Deterministic, from the raw place only (no LLM). Higher = better mock-site
candidate — the pitch is strongest for a **real, reachable business with a
weak or absent web presence**.

| Signal | Max | Rationale |
|--------|-----|-----------|
| Web weakness | 45 | `none` 45 · `social-only` 34 · `builder` 20 · `custom` 4 — no site is the whole pitch; a real custom domain is the hardest sell |
| Social proof | 30 | `log10(reviews)` scaled — enough demand to be worth pitching |
| Operational | 15 | not permanently closed |
| Owner verified | 10 | claimed listing ⇒ a contactable decision-maker |

`sitePresence` buckets are host-based (`scripts/lib/outscraper-normalize.mjs`):
social/link-in-bio hosts → `social-only`; Wix/Squarespace/GoDaddy/etc →
`builder`; anything else with a host → `custom`; empty → `none`.

## Usage

```bash
# Preview the exact request — no key, no network:
node scripts/outscraper-fetch.mjs --query "dentists, Austin TX" --limit 20 --dry-run

# Exercise the full normalize/score/scaffold path offline:
node scripts/outscraper-fetch.mjs --fixture fixtures/outscraper-maps-search/response.json --json

# Live pull (needs OUTSCRAPER_API_KEY), write prospects/<run>/{batch.json,prospects.csv}:
node scripts/outscraper-fetch.mjs --query "roofers, Boise ID" --limit 20 --out

# ...and scaffold the top-5 into clients/<slug>/ (local-only, gitignored):
node scripts/outscraper-fetch.mjs --query "roofers, Boise ID" --out --scaffold-clients --top 5
```

Flags: `--query` (repeatable), `--limit`, `--language`, `--region`, `--async`,
`--fixture`, `--dry-run`, `--out`, `--scaffold-clients`, `--top`, `--json`.

## Data handling

Scraped output (`prospects/`) and scaffolded `clients/*` folders are
**gitignored** — they carry business names, phones and addresses, so they stay
local, consistent with commit `d2c26c0` (client PII removed from the repo).
Only the tooling, types, the synthetic fixture, and this doc are committed.

## Where the mock-site build picks up

Each scaffolded `clients/<slug>/` gets:

- `meta.json` — `status:"prospect"`, identity/contact/location/category from the
  listing, `referredBy:"outscraper"`, and a `notes` line with the score signals.
  Renders at `/ops/clients/<slug>` with no code change (manifest-driven registry).
- `prospect.json` — the full normalized record (signals, rating, reviews, maps
  link). This is the single data file the Astro/shadcn build swaps content from
  ("edit content, don't touch layouts").

## Open threads (from the research handoff)

- Point the site-build step at `prospect.json` as its content source.
- Optional Outscraper enrichment (emails/socials) before scaffolding.
- Promote a scaffolded prospect to a real engagement by filling the remaining
  `<<placeholder>>` fields in `meta.json` and flipping `status`.
