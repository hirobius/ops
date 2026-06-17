---
title: Site Redeploy — Application-Ready (Track 1)
date: 2026-05-09
branch: fix/ui-pipeline
owner: adrian
status: draft
related:
  - 2026-04-13-mobius-logo-lab-design.md
  - 2026-05-09-component-doc-page-format-standardization.md
---

# Site Redeploy — Application-Ready (Track 1)

## 1. Goal

Ship a production deploy of the public portfolio that lands design-systems hiring-manager attention. **Applications start going out end of week (2026-05-09 + ~5 days).** Quality of life polish defers to Track 2 and iterates on a live site.

The bar for Track 1: a hiring manager at Stripe / Figma / Shopify / Atlassian / Vercel lands on the site, scans for 2–5 minutes, and walks away with a clear answer to _"can this person lead a design system?"_ Yes. Nothing more.

## 2. Two-track model

| Track                              | Scope                                                                                                                         | Ships                              | Status       |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ------------ |
| **Track 1** (this spec)            | Application-critical IA + content polish + new Ranch case study + clean deploy                                                | This week                          | Spec'd here  |
| **Track 2** (separate specs later) | Mobius restructure, horizontal scroll restore, sketchbook fold, more visuals, carousel fix, /info simplify, presentation deck | After Track 1 deploys, iteratively | Backlog only |

**Discipline:** anything that would slip Track 1 past end-of-week gets pushed to Track 2. We don't mix.

## 3. Public site shape after Track 1 ships

### Tile lineup on `/` (homepage)

| #   | Tile                     | Route                                | Status                   |
| --- | ------------------------ | ------------------------------------ | ------------------------ |
| 1   | Microsoft Design Systems | `/microsoft-design-systems`          | kept, copy tightened     |
| 2   | Visual Design            | `/visuals`                           | kept, no expansion in T1 |
| 3   | Ranch Foundation         | `/case-studies/the-ranch-foundation` | NEW                      |
| 4   | Vibe Sketchbook          | `/vibe-sketchbook`                   | kept (fold-in is T2)     |

Removed from main tiles: **Hirobius Design System** (HDS docs), **Hirobius Case Study**.

### Page status table

| Route                                | After T1                                               | Notes                                                             |
| ------------------------------------ | ------------------------------------------------------ | ----------------------------------------------------------------- |
| `/`                                  | Updated tile grid                                      | 4 tiles                                                           |
| `/info`                              | Unchanged                                              | Simplification is T2                                              |
| `/wet-paint`                         | **Hidden from nav, route 404'd**                       | Name signals WIP — not for hiring lens                            |
| `/portfolio/draft`                   | **Hidden from nav, route 404'd**                       | Same reason                                                       |
| `/lab/incubator`                     | Unchanged, audited                                     | Keep if it lands; remove if it doesn't                            |
| `/microsoft-design-systems`          | Tightened to ~300 lines                                | Strongest external case study                                     |
| `/visuals`                           | Audited, unchanged structurally                        | Expansion is T2                                                   |
| `/vibe-sketchbook/*`                 | Unchanged                                              | Fold-in is T2                                                     |
| `/case-studies/hirobius`             | Tightened to ~400 lines, **kept accessible (untiled)** | Direct-link from recruiters; still strongest DS-flavored artifact |
| `/case-studies/the-ranch-foundation` | **NEW**                                                | Full case study, real assets                                      |
| `/hds/*`                             | **Moved to `/ops/hds/*`**                              | Internal only                                                     |
| `/ops/*`                             | **Locked behind a gate**                               | All HDS docs + existing ops tooling                               |

## 4. Track 1 — work items

Each item below is a unit of work. Dependency arrows in section 4.11.

### 4.1 Working tree triage + clean baseline

Pre-condition for everything else. Single agent, sequential.

- Stash or commit-or-discard each modified file in current `git status`
- Decide untracked entries: ship-in-deploy / gitignore / delete
  - `0` (stray file at repo root) → **delete**
  - `.agents/`, `.claude/skills/` → **gitignore** (if not already)
  - `.worktrees/*` → already gitignored, leave alone
  - `docs/superpowers/plans/*.md` → **commit** (recent planning artifacts)
  - `docs/superpowers/specs/2026-05-09-component-doc-page-format-standardization.md` → **commit**
  - `public/assets/_incoming/clone-2026-05-03-...webp` → keep in incoming (intentional staging)
  - `scripts/classify-pillars.mjs`, `scripts/proposed-skills-middleware.mjs`, `skills-lock.json` → **commit** (referenced by staged vite.config.mjs change)
  - `src/app/pages/ops/agentic-os/PillarRail.tsx`, `SkillCreatorForm.tsx` → **commit** (referenced by staged ops page change)
- Commit baseline as `chore(prep): clean working tree before site redeploy`
- Run `pnpm typecheck && pnpm test:layout` to confirm baseline is green

**Files touched:** working-tree only. **Owner:** sonnet, single agent.

### 4.2 Move HDS routes under `/ops`

- In `src/app/routes.tsx`: relocate the entire `/hds/*` route subtree under `/ops/hds/*`
  - All ~32 HDS doc routes (Tokens, Color, Typography, Components/_, Foundations/_, etc.)
  - Update internal cross-links inside HDS pages from `/hds/...` to `/ops/hds/...`
  - Add 301-style React-Router redirects from old `/hds/...` paths to new `/ops/hds/...` paths so existing bookmarks don't 404 (the redirect target is gated, see 4.3)
- HDSLayout shell stays the same, just nested deeper
- `/portfolio/draft`, `/wet-paint` → redirect to `/404`

**Files touched:** `src/app/routes.tsx`, every page in `src/app/pages/hds/*` that hard-codes `/hds/` paths (grep first), navigation components.

**Validation:** `pnpm typecheck && pnpm exec vite build` clean. Visit each old `/hds/...` URL after build — verify redirect to `/ops/hds/...`.

**Owner:** sonnet, single agent. **Sequential** with 4.3 (gate must exist before HDS moves under it).

### 4.3 Lock `/ops` behind a gate

**Default decision: simple client-side password gate.** Not security; deterrence + signaling. The contents are public-source-code anyway.

Mechanism:

- Add `OpsGate.tsx` component that wraps `/ops/*` routes
- On first visit to any `/ops/*`, show a minimal password screen
- Match against an env-injected SHA-256 hash (`VITE_OPS_GATE_HASH`) — never the password itself in source
- On match, set a `localStorage` flag with 7-day TTL; subsequent visits within window pass through
- Also accept a `?key=<password>` URL param so Adrian can deep-link to a page (handy for sharing a specific HDS page with someone trusted)

**Why this and not real auth:** the source is on GitHub publicly. Real auth would be theatre. The gate's job is to keep `/ops` out of the casual-visitor experience and out of search-engine indexes. We pair it with `noindex` meta on all `/ops/*` pages.

**Alternates considered:**

- Basic auth via Vercel middleware → requires server function, more setup
- Just unlink + `noindex` + `Disallow: /ops` in robots.txt → no gate at all, easy to stumble into
- IP allowlist → maintenance burden, breaks on travel

**Files touched:** new `src/app/components/OpsGate.tsx`, new `src/lib/ops-gate.ts` (hash check), `src/app/routes.tsx` (wrap `/ops` routes), `index.html` (add noindex tag conditionally), `robots.txt`. Env: `VITE_OPS_GATE_HASH` documented in CLAUDE.md (Adrian sets locally + Vercel dashboard — per hard rules I never touch `.env*`).

**Owner:** sonnet, single agent.

> [DECIDE: confirm simple-password-with-localstorage. If you want server-enforced auth instead, flag now — it's bigger.]

### 4.4 Homepage tile updates

In `src/app/pages/hds/PortfolioHomePage.tsx`:

- Remove `Hirobius Design System` tile (entry 3 in `SHELL_ENTRY_CARDS`)
- Remove `Hirobius Case Study` tile (entry 5)
- Add `Ranch Foundation` tile pointing to `/case-studies/the-ranch-foundation`
- Re-balance tile color palette + Mobius hover colors
- 4 tiles: 2-col at md, 4-col at xl (or 2x2 — verify what works at the responsive breakpoints)

**Files touched:** `PortfolioHomePage.tsx` only. Need a `RanchFoundationLogo` SVG for `SHELL_ENTRY_LOGOS` — TRF uses an existing wordmark/logo on ranchfoundation.com; Adrian to provide a 1-color SVG version sized to match the other shell-entry logos. (Stub with a placeholder mark in T1 if not ready; swap in T2.)

**Owner:** sonnet, single agent. **Sequential** with 4.7 (Ranch case study route must exist before tile points to it — or land the tile change with a placeholder route).

### 4.5 Tighten Microsoft Design Systems case study

`src/app/pages/hds/MicrosoftDesignSystemsPage.tsx` — 797 lines → target ~300. (Line count is a rough proxy; the real criterion is read-time under 2 minutes for a hiring manager.)

- Cut narrative repetition; keep specific design decisions, scope, outcomes, before/afters
- Lead with a 2-line tl;dr ("What you'll see in 2 minutes") + role + dates
- Group sections under tighter H2s; collapse multi-paragraph passages into single tight paragraphs + visuals
- Preserve the strongest assets (visual examples) — assets are the real story for visual designers; copy is the framing
- Structure to scan: heading → 1-paragraph context → asset(s) → next heading. No prose runways.

**Validation:** read end-to-end on desktop + mobile, time-to-skim under 2 minutes.

**Owner:** sonnet, single agent. **Independent** of other items. Can run in parallel.

### 4.6 Tighten Hirobius case study

`src/app/pages/hds/HirobiusCaseStudyPage.tsx` — 1067 lines → target ~400.

Same editing principles as 4.5. Higher absolute target because this case study legitimately has more to say (it's about building this exact site + the design system that powers it — meta but real).

This page is **kept accessible at `/case-studies/hirobius`** so Adrian can link recruiters directly. It's just removed from the main tile grid. Defaults to `noindex` (see §7 D2) so it doesn't surface to casual Google searchers — Adrian sends a direct link to recruiters.

**Owner:** sonnet, single agent. **Independent**, parallelizable.

### 4.7 Ranch Foundation case study (new)

`src/app/pages/hds/RanchFoundationCaseStudyPage.tsx` (new file) + route in `routes.tsx`.

**Source material** (already in repo at `clients/the-ranch-foundation/`):

- `meta.json` — org info, contact, scope, engagement type
- `notes.md` — relationship history, current state, design decisions
- `goals.json` — micro/macro objectives
- `tasks.json`, `checklist.json` — work breakdown
- `retainer.json` — engagement specifics

**Story arc:**

1. Hook — veteran nonprofit, Tech Design Director since 2021 founding, 5-year ongoing engagement
2. Scope — what the engagement actually covers (site, Google Workspace, tech strategy, board role)
3. Constraint — Wix + AI editor constraint (not a from-scratch React build), volunteer photographers, 501(c)(3) compliance, donation platform verification
4. Design decisions surfaced — Harmony layout adopted, "wellness practices" naming, three-item nav, descriptive-naming-for-SEO, photo-volunteer process
5. Outcomes — current state of site rebuild, what's live, what's pending
6. Reflection — what working with a mission-driven nonprofit teaches about design systems thinking

**Format:** mirror the Hirobius case study's tightened structure (~400-line target). Image-led where assets exist; text-only where they don't (with notes that photography is in progress — that's part of the story).

**Asset gap:** unknown what visual assets exist for TRF. Default (§7 D3): ship structural draft with placeholder slots, fill real assets in T2 — don't block T1 deploy on photography.

**Owner:** sonnet, single agent (full creative discretion within structure above).

### 4.8 Hiring-bar audit + close gaps

Walk every public page that survives Track 1, score against the design-systems hiring lens. Produce a punch list of small fixes (broken images, weak copy, missing alt text, layout breakage at mobile widths, slow asset loads, etc.). Apply fixes in-place.

**Pages to audit (post-restructure):**

- `/` (4-tile homepage)
- `/info`
- `/microsoft-design-systems` (after 4.5)
- `/visuals`
- `/vibe-sketchbook` + each sketch
- `/case-studies/hirobius` (after 4.6)
- `/case-studies/the-ranch-foundation` (after 4.7)
- `/lab/incubator` — keep or delete based on quality bar

**Output:** per-page punch list committed as `docs/audits/hiring-bar-audit-2026-05-09.md`, then fixes applied.

**Owner:** opus or sonnet (judgment-heavy), single agent. **Last** before SEO + deploy.

### 4.9 SEO + meta + analytics

- Verify `<title>`, `<meta name="description">`, OG tags on every public page
- Verify `sitemap.xml` generation and `/ops/*` exclusion
- `robots.txt`: disallow `/ops/*`, `/portfolio/draft`, `/wet-paint` if those routes still resolve
- Open Graph image: confirm one exists per page or there's a fallback site-wide OG
- Favicon, apple-touch-icon present
- Analytics: confirm what's installed (or confirm intentional none)
- Prerender output: `pnpm build:prerender` produces a `dist/` with HTML for each public route (verify by inspecting `dist/`)

**Owner:** sonnet, single agent.

### 4.10 Deploy

This is the part Claude doesn't do. Adrian runs:

1. Final `pnpm typecheck && pnpm test:layout && pnpm build:prerender` locally — green
2. Verify Vercel project wiring in dashboard: production branch = `main`, framework = vite, build cmd = `pnpm build:prerender`, output = `dist`. (`vercel.json` is committed; the dashboard should mirror it.)
3. Set `VITE_OPS_GATE_HASH` in Vercel env vars (production scope)
4. Merge `fix/ui-pipeline` → `main` (PR or fast-forward — Adrian's call)
5. Push `main` (Adrian only — hard rule: I never push). Vercel auto-deploys on push to `main`.
6. Visit live URL, smoke-test the 4 tiles + each case study + verify `/ops/*` is gated + verify `/hds/...` redirects + verify `/wet-paint` and `/portfolio/draft` 404

**Rollback plan:** Vercel keeps prior deploys; promote previous one via dashboard if anything's broken.

### 4.11 Dependency graph

```
4.1 (clean working tree)
   ↓
   ├── 4.5 (MDS tighten)         ┐
   ├── 4.6 (Hirobius tighten)     │
   ├── 4.7 (Ranch case study)    ├── parallel
   └── 4.3 (ops gate)             │
        ↓                          │
        4.2 (move HDS to /ops)    ┘
            ↓
            4.4 (homepage tiles — depends on 4.7 for Ranch route)
                ↓
                4.8 (hiring-bar audit + fixes)
                    ↓
                    4.9 (SEO + meta + build verify)
                        ↓
                        4.10 (deploy — Adrian)
```

Parallelism opportunity: 4.5, 4.6, 4.7, 4.3 can all run simultaneously after 4.1 lands. 4.2 follows 4.3. 4.4 follows 4.7.

## 5. Track 2 backlog (deferred, separate specs later)

| Item                                         | Notes                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------------- |
| Restructure Mobius placement + interactivity | Creative-direction work, needs Adrian's eye                            |
| Bring back horizontal scroll                 | Where? Find prior version in git history                               |
| Expand Visual Design — fold sketchbook in    | New `Sketches`/`Playground` section in `/visuals`                      |
| Add more past-project visuals                | Adrian provides asset list                                             |
| Fix StackedCardRail interactivity            | Reproduce + fix; bug, not feature                                      |
| Simplify `/info` page                        | Audit current; strip to essentials                                     |
| Build interview presentation deck            | Format/distribution undecided                                          |
| Component docs page format standardization   | Existing spec: 2026-05-09-component-doc-page-format-standardization.md |
| HDSLayout 5-module split                     | Existing plan from commit 2c3f2d72                                     |

Each gets its own brainstorm → spec → plan → execute cycle, post-T1.

## 6. Out of scope (T1)

- Multi-tenant / brand-token theming (Hirobius LLC client-tier work)
- Lilac Insure / Phil prospect-001 case studies (T2 candidates, not committed)
- Adrian's other initiatives surfaced via memory: AI ingestion pipeline, hermes kanban, ops dashboard — those keep moving but are NOT part of this deploy
- Any change to internal `/ops` tooling beyond what 4.2 + 4.3 require

## 7. Open decisions

| #   | Decision                                    | Default                                                  | Why default                                                                 |
| --- | ------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------- |
| D1  | `/ops` gate mechanism                       | Client-side password + SHA-256 hash + 7-day localStorage | Simplest, no server, source is public anyway                                |
| D2  | `/case-studies/hirobius` indexing           | `noindex` (link-only)                                    | Stops it appearing in Google for casual searchers; Adrian sends direct link |
| D3  | Ranch case study assets                     | Placeholder slots OK in T1, real assets land via T2      | Don't block T1 deploy on photo collection                                   |
| D4  | Tile count after T1                         | 4 (MDS, Visuals, Ranch, Sketchbook)                      | Visuals + sketchbook stay separate in T1; merge is T2                       |
| D5  | `/lab/incubator` keep-or-cut                | **Audit (4.8) decides**                                  | Don't pre-judge                                                             |
| D6  | Sketches accessible from main nav after T1? | Yes — keep tile until T2 fold-in lands                   | Don't strip a working surface mid-flight                                    |

## 8. Risks

| Risk                                                  | Mitigation                                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Ranch case study can't be written without real assets | Default D3: ship structural draft with placeholder slots, fill assets in T2                   |
| Case study tightening loses Adrian's voice            | Adrian reviews 4.5 + 4.6 commits before they land; revert + iterate if voice is wrong         |
| `/ops` gate breaks dev workflow                       | Gate is conditional on `import.meta.env.PROD` only; dev mode stays open                       |
| Working tree triage discards something Adrian wanted  | 4.1 commits a baseline before any deletion; recoverable from git                              |
| Vercel deploy reveals env var gap                     | Pre-deploy checklist in 4.10 covers it; Adrian sets `VITE_OPS_GATE_HASH` before merge to main |
| Scope creep mid-week                                  | Anything not already in T1 goes to T2 — no exceptions                                         |

## 9. Success criteria

Track 1 is complete when:

- [ ] All 4 homepage tiles load to working pages
- [ ] `/ops/*` requires the password (confirmed in production)
- [ ] `/hds/*` redirects to `/ops/hds/*`
- [ ] `/wet-paint` and `/portfolio/draft` 404
- [ ] MDS case study reads end-to-end in <2 minutes
- [ ] Hirobius case study reads end-to-end in <3 minutes
- [ ] Ranch Foundation case study exists and reads cleanly
- [ ] `pnpm typecheck && pnpm test:layout && pnpm build:prerender` green
- [ ] `robots.txt` excludes `/ops/*`
- [ ] Live site at production URL shows all of the above
- [ ] Adrian has the live URL ready to paste into applications

## 10. After this spec is approved

I'll invoke the `writing-plans` skill to produce the implementation plan: agent dispatch order, prompts, gates, validation cmds. Track 2 items get their own brainstorm → spec → plan cycles after T1 deploys.
