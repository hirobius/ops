# SYSTEMS_REGISTRY

Last updated: 2026-04-19
Status: Central registry for scripts, checks, triggers, and follow-on actions

## Purpose

This is the easiest place to inspect the operational systems in the repo.

Use it to answer:

- what scripts exist
- what checks run
- what triggers fire
- what each system is supposed to protect
- what action to take when something fails
- what drift or blindspots are already known

## Core Commands

| Command | Purpose | Follow-on action |
|---|---|---|
| `pnpm dev` | Build tokens, then start local development | Preview changes locally |
| `pnpm build` | Build production bundle | Validate release readiness |
| `pnpm check:fast` | Run the fast commit-time guardrails | Fix drift before committing |
| `pnpm check` | Run the full guardrail suite | Fix violations before PR or shipping |
| `pnpm check:release` | Run full checks plus build | Use before release or publish moments |
| `pnpm check:assets` | Validate asset manifest coverage and alt metadata | Add or fix `public/assets/manifest.json` entries before populating visuals |
| `pnpm check:security` | Run the local security and dependency baseline lane | Remove risky files, secrets, CDN drift, or unsafe injection patterns |
| `pnpm check:attributions` | Validate attribution registry IDs and manifest source links | Fix `ATTRIBUTIONS.md` or manifest source IDs |
| `pnpm check:route-smoke` | Browser-smoke key built routes through Vite preview | Repair runtime route regressions before release |
| `pnpm check:exemptions` | Validate and summarize all repo escape hatches | Tighten weak exemptions or remove stale ones |
| `pnpm tokens` | Build token outputs and handoff artifacts | Review downstream token outputs |
| `pnpm tokens:verify` | Verify token pipeline integrity | Fix token or compiler issues before proceeding |
| `pnpm tokens:audit` | Audit component token compliance | Refactor components or add justified suppressions |
| `pnpm tokens:audit:pages` | Audit page surfaces for raw design values | Route page-level visual decisions through tokens or justify editorial exceptions |
| `pnpm figma:snapshot` | Normalize a raw Figma export into the stable snapshot shape used by the audit path | Inspect the normalized snapshot before running `pnpm figma:audit` |
| `pnpm figma:audit` | Compare repo truth against generated Figma variable exports and optional normalized Figma snapshots | Fix token/manifest/API drift before attempting write-back sync |

## Check Suite

### Fast tier

`pnpm check:fast` is the commit-time lane.

It currently includes:

- token build + verify
- component token audit
- hardcoded Tailwind color check
- semantic HTML check
- ref forwarding check
- spacing, breakpoint, and font drift checks
- tier-bypass check
- doc-reference check
- internal route-link check

### Full tier

`pnpm check` / `pnpm check:full` is the broader review lane.

It currently runs these:

| Script | Protects against | Follow-on action on failure |
|---|---|---|
| `build-tokens.mjs` | stale generated token outputs | fix token source or token compiler assumptions |
| `verify-tokens.mjs` | invalid token references or compile issues | repair token graph before continuing |
| `audit-components.mjs` | token-consumption drift in components | refactor component styling or justify suppression |
| `audit-pages.mjs` | raw design values on page surfaces | route page-level styling through tokens or document editorial exceptions |
| `check-tailwind-colors.mjs` | hardcoded Tailwind color drift | replace with token-driven colors |
| `check-component-docs.mjs` | undocumented components | add or update HDS docs coverage |
| `check-contrast.mjs` | contrast regressions | adjust token usage or semantics |
| `check-focus-states.mjs` | missing focus treatment | add accessible focus states |
| `check-reduced-motion.mjs` | reduced-motion noncompliance | wire motion preferences correctly |
| `check-aria-labels.mjs` | missing accessible names | add labels or aria attributes |
| `check-semantic-html.mjs` | poor semantic structure | use correct semantic elements |
| `check-ref-forwarding.mjs` | broken composability in form controls | add or repair ref forwarding |
| `check-hardcoded-spacing.mjs` | spacing drift | replace raw spacing with scale-driven values |
| `check-hardcoded-breakpoints.mjs` | brittle breakpoint logic | move to shared breakpoint system |
| `check-unresponsive-grids.mjs` | nonresponsive layouts | repair grid behavior |
| `check-motion.mjs` | inconsistent motion hygiene | remove ornamental or mismatched motion |
| `check-hardcoded-fonts.mjs` | typography drift | restore approved font usage |
| `check-inline-styles.mjs` | uncontrolled inline-style sprawl | refactor or justify intentional token-driven usage |
| `check-tier-bypass.mjs` | token-layer bypassing | route styling through correct token tier |
| `check-tailwind-arbitrary.mjs` | arbitrary-value creep | replace with tokens or standard utilities |
| `check-css-values.mjs` | raw authored CSS values | migrate toward tokenized or approved CSS values |
| `check-token-structure.mjs` | broken token hierarchy assumptions | repair token structure before shipping |
| `check-doc-references.mjs` | stale local file references in active docs | fix or trim stale documentation references |
| `check-route-links.mjs` | dead internal route targets in app code | repair route strings or route definitions |
| `check-asset-manifest.mjs` | asset metadata drift and missing manifest coverage | add manifest entries, alt text, and status metadata |
| `check-security-baseline.mjs` | committed secrets, blocked env files, unsafe injection, CDN drift | remove risky material or add intentional exemptions with justification |
| `check-attributions.mjs` | attribution registry drift | add registry IDs or repair manifest source links |
| `check-exemptions.mjs` | invisible or weak escape hatches | tighten exemption reasons and review accumulation |

### Release tier

`pnpm check:release` is the publish-time lane.

It currently adds:

| Script | Protects against | Follow-on action on failure |
|---|---|---|
| `build` | broken production bundle | repair build/runtime issues before shipping |
| `check-route-smoke.mjs` | routes that compile but fail in a real browser | fix live route rendering or runtime navigation regressions |

## Triggers

### Automated check tiers

Nothing runs manually. The full check system fires automatically across four tiers:

| Tier | Trigger | Command | What it catches |
|---|---|---|---|
| In-session | Claude Code hook — edit `hirobius.tokens.json` | `pnpm tokens:verify` | Token pipeline drift immediately during editing |
| In-session | Claude Code hook — edit `theme.css` | `pnpm check:css` | CSS bridge drift immediately during editing |
| Commit | `git commit` → `.githooks/pre-commit` | `pnpm check:fast` | Fast guardrails — token, doc, semantic, spacing, font, tier-bypass |
| Push | `git push` → `.githooks/pre-push` | `pnpm check:full` + `pnpm test:a11y` | Full suite — all fast checks plus contrast, motion, aria, grids, colors, security; then WCAG 2.1 AA audit |
| Deploy | GitHub Actions on Vercel preview | `pnpm scan` | Headless route/render token scan, posts PR comment |
| Deploy | GitHub Actions on push to main (token file changed) | Figma variable sync | Keeps Figma variables in sync with token source |

Hooks are activated via `core.hooksPath .githooks`. The `pnpm prepare` step (runs on `pnpm install`) sets this automatically.

### Prepare step

Command:

- `pnpm prepare`

Backed by:

- `scripts/setup-hooks.mjs`

Behavior:

- runs `git config core.hooksPath .githooks` to activate the committed hook files
- no files written to `.git/hooks/` — the committed `.githooks/` directory is the source of truth

### Token changes

Trigger:

- any meaningful change to `hirobius.tokens.json`

Expected follow-on actions:

1. run `pnpm tokens:verify`
2. inspect generated outputs
3. update `DESIGN.md` and `DESIGN-HANDOFF.md` if mirrored guidance changed
4. add a task or note only if follow-up work remains
5. update process/decision archive only if Adrian explicitly asks for that recordkeeping

### Audit findings

Trigger:

- issue found during HDS page review

Expected follow-on actions:

1. log it in `HDS_COMPLIANCE_LOG.md`
2. promote it to `TASKS.md` if follow-up work remains

### Process lessons

Trigger:

- meaningful workflow shift, systemic blindspot, or governance lesson

Expected follow-on action:

- record it in `PROCESS.md` only when Adrian explicitly asks for archive/history capture

## Launch-Mode Note

The current root-doc setup is intentionally slim:

- `TASKS.md` is active work only
- `HDS_COMPLIANCE_LOG.md` is active findings only
- `PROCESS.md` and `DECISIONS.md` are archive pointers, not day-to-day working docs

This does not remove automated checks or git hooks. It only removes extra root-context reading pressure.

## Supporting Scripts

| Script | Purpose |
|---|---|
| `build-handoff.mjs` | keeps the design handoff material in sync with token outputs |
| `build-design-md.mjs` | keeps the lean visual spec in sync with token outputs |
| `build-token-index.mjs` | builds token-index artifacts |
| `build-figma-variables.mjs` | creates Figma variable export artifacts |
| `normalize-figma-snapshot.mjs` | normalizes transport-specific Figma export JSON into the stable snapshot format |
| `audit-figma-system.mjs` | compares repo truth to Figma-facing exports and snapshots |
| `batch-scan.mjs` | scanning utility for broader inspection workflows |

## Token Scan Architecture

Current state:

- static enforcement now lives primarily in `pnpm check:fast`, `pnpm check:full`, and `pnpm check:release`
- preview scanning also exists in `.github/workflows/token-scan.yml`
- preview scanning now injects a headless browser script at scan time instead of depending on a product-bundle bridge
- the retired prototype files and stale inspector specs have been pruned; the remaining scanner surface is the headless path plus token-index metadata
- `scripts/batch-scan.mjs` is now the canonical route/render scan entrypoint
- `scripts/headless-scan.browser.js` owns the browser-only DOM scan runtime
- `scripts/build-token-index.mjs` and `src/app/design-system/token-usage-map.json` provide the static metadata used to enrich scan output

Target state:

- static checks are canonical
- route/render scanning remains as a secondary verification layer
- route/render scanning is headless-only and no longer mounted in the app UI or main bundle
- no user-facing HDS shell should carry scanner infrastructure in product chrome
- token-index artefacts should be retained only if they still improve scan output after the migration

Migration order:

1. document the target architecture
2. inventory which inspector capabilities are still uniquely valuable
3. design the replacement headless scan contract
4. rewire route scanning and GitHub preview scanning away from `window.__hds` / `?scan`
5. remove the in-app inspector UI and global bridge
6. prune leftover artefacts and stale token-scan docs

Current contract:

- `pnpm scan` scans the default deployed site or any explicit `--url=...`
- `pnpm scan:local` probes common localhost preview/dev ports instead of assuming a single fixed port
- the scanner injects `scripts/headless-scan.browser.js` into each route at runtime
- static metadata comes from local `src/app/design-system/token-usage-map.json`, so route-level findings still include handoff drift, dead tokens, and audit-ok context

## Known Gaps And Drift

### Historical protocol drift

Older agent guidance once assumed a modular protocol layer under a `_protocols/` subdirectory of `scripts/`. That directory no longer exists — protocols were folded into inline script documentation.

Status:

- resolved
- this repo's canonical model is now a flat `scripts/` directory plus the root operating docs:
  - `OPERATING_MAP.md`
  - `SYSTEMS_REGISTRY.md`
  - `TOKEN_GOVERNANCE.md`
  - `DESIGN.md`
  - `DESIGN-HANDOFF.md`

### Secondary-doc overlap

The root now keeps only active canon and lightweight entry docs.

Archived helper and historical docs are not treated as normal startup context.

### Check-suite overlap worth keeping

These are adjacent but not actually duplicates:

- `check-reduced-motion.mjs`
  system-level reduced-motion compliance
- `check-motion.mjs`
  broader motion hygiene and consistency

Keep both unless one becomes subsumed by a more capable implementation.

### Check-suite blindspots

Current notable blindspots:

- no connected vulnerability audit in the normal loop yet (`pnpm audit` or equivalent still needs a network-aware lane)
- no alt-text generator or staged-image automation yet
- no attribution check tied to non-asset third-party references in docs content yet
- no explicit check for hook/config drift between docs and actual repo structure

## Recommended Read Order For Operational Hygiene

1. `CLAUDE.md`
2. open only the canonical doc the task needs
