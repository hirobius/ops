# Secrets Standard — Fleet Adoption Tracker

Tracks adoption of the [Hirobius Secrets Management Standard](./secrets-management.md)
across every Hirobius repo. Canonical doc lives here in `hirobius/ops`; each repo
gets a tracking issue ("Adopt secrets standard: &lt;repo&gt;") linking back to it.

**Status legend:** `compliant` · `in-progress` · `not-started` · `n/a (no secrets)` · `excluded (legacy)`

## Active fleet

| Repo | Status | Owner-classification done | History-scanned | Tracking issue | Notes |
|------|--------|:--:|:--:|--|-------|
| `hirobius/ops` | in-progress | — | — | — | This repo — canonical home of the standard. Secrets are Hirobius-Internal (ops gate, Supabase, GITHUB_TOKEN, Outscraper, portal HMAC). Needs `.env.example` (names-only) authored. |
| `hirobius/lilac-insure` | **compliant** | ✅ | ✅ | — | Reference implementation — first client fully on the standard. Do not redo. |
| `hirobius/clients` | not-started | ☐ | ☐ | — | Astro site factory — likely holds build/deploy + per-client keys. |
| `hirobius/concrete` | not-started | ☐ | ☐ | — | Concrete Creations storefront — Stripe keys + Discord webhook (see concrete#4). |
| `hirobius/portfolio` | not-started | ☐ | ☐ | — | adrianmilsap.com (Next.js). |
| `hirobius/hirobius-design-system` | not-started | ☐ | ☐ | — | Publishable DS — CI likely uses Chromatic + npm publish tokens. |
| `hirobius/lilac-bonds` | not-started | ☐ | ☐ | — | Lilac bond microsite. Owner = Lilac. |
| `hirobius/access-tech` | not-started | ☐ | ☐ | — | Client site. |
| `hirobius/veteran-resource-navigator` | not-started | ☐ | ☐ | — | Client site. |
| `hirobius/job-hunt` | not-started | ☐ | ☐ | — | Internal tool. |
| `hirobius/adrian-milsap` | not-started | ☐ | ☐ | — | Older portfolio — low priority; may be retired. |
| `hirobius/Hdshub` | not-started | ☐ | ☐ | — | Figma Make experiment — low priority. |
| `hirobius/ops-archive` | not-started | ☐ | ☐ | — | Retired old ops tracker — likely `n/a`; confirm + archive. |
| `hirobius/dotfiles` | not-started | ☐ | ☐ | — | Private personal config — review for embedded secrets. |

## Excluded (legacy — pre-2026 bootcamp / practice repos, no active deployment or secrets)

`301-*`, `city-explorer`, `city-explorer-api`, `cookie-stand`, `bus-mall`,
`memory-game`, `data-structures-and-algorithms`, `best-books-front-end`, `horns`,
`kims`, `doAlong`, `about-me`, `wireframe-exercise`, `mc-exercise`, `lab14`,
`basic-express-server`, `server-deployment-practice`, `reading-notes`,
`portfolio-temp`, `portfolio-archive`, `Medford`, `Testclaude`.

Rationale: all created 2020–2021 as learning/lab projects, not deployed agency
work, no live credentials. Revisit only if any is reactivated.

---

_Updated as inventory + per-repo adoption proceeds. Each `not-started` row moves to
`in-progress` when its tracking issue is opened, then `compliant` when its
checklist is satisfied._
