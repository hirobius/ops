# Outscraper → prospect pipeline

Intake stage for the rapid-proposal consulting model. It scrapes local
businesses from Google Maps via **Outscraper**, scores each as a *mock-site
candidate*, and (optionally) scaffolds a per-prospect client folder that the
`/ops` dashboard already renders. It is **fully testable offline** — no API key
needed to exercise every code path except the live pull.

## Flow

```
Outscraper /maps/search-v3
  → raw place objects (one array per query)
  → normalize + score + dedupe   (pure, deterministic — no network, no LLM)
  → Prospect[] sorted by leadScore desc
  → [--out]              prospects/<runId>/{batch.json, prospects.csv}   (gitignored)
  → [--scaffold-clients] clients/<slug>/meta.json      (status:"prospect")
                       + clients/<slug>/prospect.json  (signals for the site build)
  → downstream: the Astro factory (hirobius/clients) swaps content from prospect.json
```

## Files

| File | What it is |
|---|---|
| `scripts/outscraper-fetch.mjs` | API client + CLI (network + filesystem shell) |
| `scripts/lib/outscraper-normalize.mjs` | Pure normalizer + lead scoring (`place → Prospect`) |
| `scripts/lib/query-presets.mjs` | Named query matrices (`--preset`), ported from clients `lead-gen/config.ts` |
| `src/app/pages/ops/prospectTypes.ts` | Types: `OutscraperPlace`, `Prospect`, `ProspectSignals`, `ProspectBatch` |
| `fixtures/outscraper-maps-search/response.json` | Synthetic sample response (no real PII) covering all 4 buckets |
| `scripts/__tests__/outscraper-normalize.test.mjs` | Vitest unit tests for the normalizer + scoring invariants |

## How to run

```bash
# No key, no network — see the exact request + a size/cost estimate:
node scripts/outscraper-fetch.mjs --query "dentists, Austin TX" --limit 20 --dry-run

# Size the full beachhead matrix (259 queries) before spending anything:
node scripts/outscraper-fetch.mjs --preset exterior-cleaning --limit 20 --dry-run

# Offline end-to-end against the fixture (normalize → score → rank):
node scripts/outscraper-fetch.mjs --fixture fixtures/outscraper-maps-search/response.json --json

# Live pull (the human sets the key; agents never read/write .env* — ops/CLAUDE.md #0):
export OUTSCRAPER_API_KEY=...
node scripts/outscraper-fetch.mjs \
  --query "roofers, Boise ID" --query "landscapers, Boise ID" \
  --limit 20 --out --scaffold-clients --top 5
# …or load a local env file without exporting it:
node --env-file=.env.local scripts/outscraper-fetch.mjs --query "..." --out
```

### Flags

| Flag | Meaning |
|---|---|
| `--query "<q>"` | Search query; **repeatable** for multiple queries |
| `--preset <name>` | Expand a built-in query matrix (e.g. `exterior-cleaning` = 259 queries) |
| `--limit <n>` | Results per query (default 20) |
| `--language <l>` / `--region <r>` | Outscraper locale params (default `en` / `us`) |
| `--async` | Use the async submit + poll flow instead of the blocking sync call |
| `--fixture <path>` | Normalize a saved response instead of calling the API |
| `--dry-run` | Print the request(s) and exit — no key, no network |
| `--out` | Write `prospects/<runId>/{batch.json,prospects.csv}` |
| `--scaffold-clients` | Scaffold `clients/<slug>/` folders for the top prospects |
| `--top <n>` | How many top prospects to scaffold (default 5) |
| `--out-dir <dir>` | Base dir for all output (default: repo root). Point at another repo to make it the data system-of-record. |
| `--json` | Print a machine-readable JSON summary |

## Outscraper API contract (as wired)

- **Base:** `https://api.app.outscraper.com` (override with `OUTSCRAPER_API_BASE`)
- **Auth:** header `X-API-KEY: <key>`
- **Search:** `GET /maps/search-v3?query=<q>&limit=<n>&language=<l>&region=<r>&async=<bool>`
- **Sync** (`async=false`, the default here): blocks, returns
  `{ status:"Success", data:[[...places]] }`.
- **Async** (`--async`): submit returns `{ id, status:"Pending", results_location }`;
  the script polls `GET /requests/{id}` until `status:"Success"`.
- `data` is **one array of places per submitted query**.

> ⚠️ **Verify the live contract before trusting at scale.** The base URL,
> endpoint, and async flow are wired from prior knowledge of Outscraper's API,
> not re-verified against a live key in this environment. Make one real keyed
> call and confirm the endpoint/params/field names before a large run.

## Lead scoring

**Thesis:** the best mock-site target is a **real, reachable business with a
weak or absent web presence.** The four levers (0–100 for an operating
business):

| Lever | Max | How |
|---|---|---|
| Web weakness | 45 | `none` 45 · `social-only` 34 · `builder` 20 · `custom` 4 |
| Social proof | 30 | `log10(reviews+1) × 10`, capped at 30 |
| Operational | 15 | flat bonus when not permanently closed |
| Owner verified | 10 | claimed listing ⇒ a contactable decision-maker |

**Closed-business gate:** a `CLOSED_PERMANENTLY` listing is worthless as a
prospect no matter how weak its site, so `operational` is a **gate, not just a
bonus** — a closed listing keeps only 20% of its base score and always sinks to
the bottom of the ranking.

**`sitePresence` buckets** are host-based (`SOCIAL_HOSTS` / `BUILDER_HOSTS` in
`outscraper-normalize.mjs`): `facebook`/`instagram`/`linktree`/`business.site`/…
→ `social-only`; `wix`/`squarespace`/`godaddy`/`weebly`/`shopify`/… → `builder`;
any other real domain → `custom`; no URL → `none`.

Fixture ranking (proves the thesis):

```
[93] Evergreen Yardworks     no-site, 214 reviews, verified, open   ← best
[67] Bluebird Lawn & Snow    social-only, 63 reviews
[56] Summit Grounds Co       custom domain, 512 reviews             ← real site, hard sell
[46] Clearout Junk Haulers   builder (squarespace), 12 reviews
[12] Old Town Hauling        no-site, 41 reviews, CLOSED_PERMANENTLY ← gated to the bottom
```

## Cost

Outscraper's Google Maps search bills pay-as-you-go: **500 records/month free
per service**, then **~$3 / 1,000** (volume discount past 100k/mo). `--dry-run`
prints a worst-case ceiling (`queries × limit`) so you can size a run before
spending. A `--limit 5` smoke test or a sub-500-record pass is **free**; the full
`exterior-cleaning` matrix (259 queries × limit 20) is ~$14 worst case. Only the
Maps service is called — email/socials enrichment is a separate service (its own
500-record tier + cost) and is **not** wired here. *Verify current pricing.*

## Data handling

- **Scraped records are unverified PII.** `prospects/` and `clients/*` (except
  `clients/_template/`) are **gitignored** — output stays local, never committed.
  Only the tooling, types, the synthetic fixture, and this doc are tracked.
- **Never treat scraped fields as business facts.** Names, phones, addresses,
  and hours must be confirmed with the business before any outreach or publish;
  the scaffolded `meta.json` carries a note to that effect.
- The scaffolded `meta.json` mirrors `clients/_template/meta.json` with
  `status:"prospect"`; `prospect.json` carries the full scored `Prospect` (incl.
  `signals`) for the downstream Astro site build.

## Downstream

Once a prospect converts, its `clients/<slug>/` folder graduates: flip
`meta.json` `status` from `prospect` to `active` and fill in real intake data.
The Astro factory in `hirobius/clients` (`pnpm new-client <slug> --preset <p>`)
consumes `prospect.json` as the single content source for the generated site.
