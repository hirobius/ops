# Secrets Standard — Fleet Adoption Tracker

Tracks adoption of the [Hirobius Secrets Management Standard](./secrets-management.md)
across every Hirobius repo. Canonical doc lives here in `hirobius/ops`; each repo
has a tracking issue ("Adopt secrets standard: &lt;repo&gt;") linking back to it.

**Status legend:** `compliant` · `in-progress` · `not-started` · `n/a (no secrets)` · `excluded (legacy)`

_Inventory pass: 2026-07-06 (static scan of `.env.example` / tracked env files / `.gitignore` / CI config via GitHub API). **No leaked secrets or committed values found in any repo.** "History-scanned" = a full gitleaks/trufflehog history pass; only `ops` has had even a heuristic history scan so far._

## Active fleet

| Repo | Status | Owner | Owner-classified | History-scanned | Tracking issue | Notes |
|------|--------|-------|:--:|:--:|--|-------|
| `hirobius/lilac-insure` | **compliant** | client (Lilac) | ✅ | ✅ | — | Reference implementation — first client fully on the standard. Do not redo. |
| `hirobius/veteran-resource-navigator` | in-progress (near) | client / pro-bono | ✅ | ☐ | [#45](https://github.com/hirobius/veteran-resource-navigator/issues/45) | `.env.example` names-only ✅, `.gitignore` ✅. CI secret `PARTNERS_SHEET_CSV_URL`. Just needs Bitwarden classification + history scan. |
| `hirobius/job-hunt` | in-progress (near) | Internal | ✅ | ☐ | [#22](https://github.com/hirobius/job-hunt/issues/22) | `.env.example` uses `sk-ant-...` placeholder → change to bare name; broaden `.gitignore` to `.env*`. `ANTHROPIC_API_KEY` only. |
| `hirobius/ops` | in-progress | Internal | ✅ | ✅ (heuristic, clean) | [#32](https://github.com/hirobius/ops/issues/32) | Canonical home. `.gitignore` ✅. Needs names-only `.env.example` (paste-ready in #32). CI secrets: `FIGMA_FILE_KEY`, `FIGMA_PERSONAL_ACCESS_TOKEN`. |
| `hirobius/hirobius-design-system` | in-progress | Internal | ✅ | ☐ | [#86](https://github.com/hirobius/hirobius-design-system/issues/86) | No runtime secrets; CI-only `CHROMATIC_PROJECT_TOKEN`, `NPM_TOKEN`. Needs Bitwarden classification; `.env.example` optional. |
| `hirobius/clients` | in-progress | multi-client ⚠️ | ✅ | ☐ | [#27](https://github.com/hirobius/clients/issues/27) | **Highest cross-contamination risk** (multi-tenant monorepo). Needs `apps/_template/.env.example` + strict per-app owner split. `.gitignore` ✅. |
| `hirobius/concrete` | in-progress | client (Concrete) | ✅ | ☐ | [#7](https://github.com/hirobius/concrete/issues/7) | Needs names-only `.env.example` (`STRIPE_*`, `DISCORD_SALES_WEBHOOK_URL`, `VITE_SITE_URL`). `.gitignore` ✅. |
| `hirobius/lilac-bonds` | in-progress | client (Lilac) | ✅ | ☐ | [#21](https://github.com/hirobius/lilac-bonds/issues/21) | `.gitignore` ✅ (has `!.env.example` exception but file absent). Confirm `process.env` use, then add `.env.example` or mark `n/a`. |
| `hirobius/portfolio` | n/a (no secrets) | Internal | ✅ | ☐ | [#10](https://github.com/hirobius/portfolio/issues/10) | No `process.env` usage. `.gitignore` = Next default (`.env*.local`). Revisit if env vars added. |
| `hirobius/access-tech` | n/a (no secrets) | client | ✅ | ☐ | [#15](https://github.com/hirobius/access-tech/issues/15) | Static marketing site, no secrets surface. No `.gitignore` at all — issue recommends a preemptive one. |
| `hirobius/adrian-milsap` | not-started (deferred) | Internal | ☐ | ☐ | — | Older portfolio, likely retired — inventory deferred (low priority). |
| `hirobius/Hdshub` | not-started (deferred) | Internal | ☐ | ☐ | — | Figma Make experiment — inventory deferred (low priority). |
| `hirobius/ops-archive` | not-started (deferred) | Internal | ☐ | ☐ | — | Retired old ops tracker — likely `n/a`; confirm + archive. |
| `hirobius/dotfiles` | not-started (deferred) | Internal | ☐ | ☐ | — | Private personal config — review for embedded secrets before closing. |

## Excluded (legacy — pre-2026 bootcamp / practice repos, no active deployment or secrets)

`301-*`, `city-explorer`, `city-explorer-api`, `cookie-stand`, `bus-mall`,
`memory-game`, `data-structures-and-algorithms`, `best-books-front-end`, `horns`,
`kims`, `doAlong`, `about-me`, `wireframe-exercise`, `mc-exercise`, `lab14`,
`basic-express-server`, `server-deployment-practice`, `reading-notes`,
`portfolio-temp`, `portfolio-archive`, `Medford`, `Testclaude`.

Rationale: all created 2020–2021 as learning/lab projects, not deployed agency
work, no live credentials. Revisit only if any is reactivated.

## How the columns move

- **Owner-classified ✅** = the owner (Internal vs which client) is determined. Moving the secret into the right **Bitwarden collection** is the human step tracked in each issue.
- **History-scanned ✅** = a full gitleaks/trufflehog pass over all history came back clean (or leaks were rotated + purged). `ops` has a heuristic pass only; the rest are pending.
- A repo reaches **compliant** when its tracking-issue checklist is fully satisfied.

---

_Updated 2026-07-06. Agents don't create `.env*` files (Hirobius rule: keys/env files are human-managed); per-repo `.env.example` content is provided paste-ready in each tracking issue for a human to commit._
