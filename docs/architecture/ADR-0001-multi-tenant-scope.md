---
id: ADR-0001
title: Multi-Tenant CSS Scope Decision
status: accepted
date: 2026-05-01
supersedes: []
superseded-by: []
---

# Multi-Tenant CSS Scope Decision

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-01 |
| **Author** | Adrian Milsap (orchestrated; opus-class) |
| **Unit** | `12m-mt-css-scope-architecture` |
| **Supersedes** | — |
| **Superseded by** | — |

---

## Context

Hirobius is becoming an agency platform: HDS is the reusable foundation, and each
client (Tier 1 brand presence, Tier 2 e-commerce, Tier 3 product) consumes HDS
as a dependency and overrides a small set of brand tokens (accent color,
typography, sometimes radius/shadow language). Concrete Creations (WA State
LLC) is the first external pilot.

The architectural question this document settles: **what CSS mechanism scopes
per-tenant token overrides?** The decision propagates into every downstream
multi-tenant unit — token overlay format (`12m-mt-token-overlay-format`),
build pipeline (`12m-mt-build-pipeline`), tenant onboarding workflow
(`12m-mt-onboarding-workflow`), per-tenant Figma masters
(`12m-mt-figma-master-per-tenant`). Getting this wrong now compounds across
every future client.

Constraints that shaped the choice:

- One Vercel project per tenant (separate deploys; no shared runtime).
- HDS already uses `[data-theme="dark"]` for theme switching — established
  pattern in `src/styles/theme.css` and `src/styles/tokens.css`.
- Solo founder, lean stack — minimize moving parts and contributor cognitive
  load.
- Onboarding budget: 30 minutes from contract signed to live preview build.
- Browser audience: modern (design / dev professionals); but `@layer` baseline
  (Mar 2022) still excludes long-tail clients we don't control.
- Token graph is DTCG with three tiers (primitive → semantic → component →
  role). Tenant overrides must integrate cleanly with the existing
  `build-tokens.mjs` compiler (~1280 LOC, not the 130 the prompt assumed).

---

## Decision

**Adopt Option A: `[data-tenant="<slug>"]` attribute-selector scoping for
per-tenant token overrides, applied at the `<html>` root, layered on top of
the existing `[data-theme="dark"]` mechanism.**

The CSS contract:

```css
:root {
  --semantic-accent-rest: var(--primitive-color-blue-500);
  /* …all base tokens… */
}

[data-tenant="concrete-creations"] {
  --semantic-accent-rest: #8B6F47;
  /* …only the overrides this tenant declares… */
}

[data-theme="dark"] {
  --semantic-accent-rest: var(--primitive-color-blue-500);
  /* …base dark overrides… */
}

[data-tenant="concrete-creations"][data-theme="dark"] {
  --semantic-accent-rest: #6B5235;
  /* …tenant + dark combination, only when both axes diverge from base… */
}
```

The app sets `<html data-tenant="concrete-creations" data-theme="light">` at
SSR (or hydration). The cascade resolves: tenant beats base via specificity
(0,1,0 vs 0,0,1 for `:root`), and tenant-and-dark beats tenant-only
(0,2,0 vs 0,1,0).

**`@layer` is the planned successor.** When `@layer` baseline becomes
non-negotiable across the entire client portfolio (mid-to-late 2027 by current
trajectory), we migrate the generator to emit `@layer base, tenants;` with
per-tenant sub-layers. The token-overlay file format (see
`tenant-token-overlay-format.md`) is intentionally cascade-mechanism-neutral so
the migration is a build-script swap, not a token-source rewrite.

---

## Reasoning — the four options

### Option A — `[data-tenant="X"]` attribute selectors *(chosen)*

```css
:root { --semantic-accent-rest: #1E2EFD; }
[data-tenant="concrete-creations"] { --semantic-accent-rest: #8B6F47; }
[data-tenant="concrete-creations"][data-theme="dark"] { --semantic-accent-rest: #6B5235; }
```

| Axis | Verdict |
|---|---|
| **Cascade** | Specificity-driven, predictable. `:root` (0,0,1) → `[data-tenant]` (0,1,0) → `[data-tenant][data-theme]` (0,2,0). |
| **Baseline** | Universal — works in IE9+ (irrelevant lower bound; we don't support pre-evergreen anyway). |
| **Authoring ergonomics** | Identical to `[data-theme="dark"]` — contributors already know this pattern. |
| **Debugging** | DevTools shows the cascade plainly; the active selector wins, the others are struck through. No mental model unlock needed. |
| **Migration cost** | ~Zero. `build-tokens.mjs` adds a single emit pass per tenant overlay; no architectural change to the generator. |
| **Risk** | Specificity bloat into per-tenant component overrides if a contributor writes `[data-tenant=X] .deeply-nested` at component scope — caught by the existing `check-source-canon.mjs` discipline (token-driven only). |

**Why this wins:** mirrors the precedent the team already has working
(`[data-theme="dark"]`), zero baseline risk, contributor-friendly, the
migration to `@layer` later is mechanical. For a solo founder running
per-tenant deploys, this is the lowest-friction path to a working pilot.

### Option B — `@layer tenants.<slug>` CSS cascade layers

```css
@layer base, tenants;
@layer base { :root { --semantic-accent-rest: #1E2EFD; } }
@layer tenants { :root { --semantic-accent-rest: #8B6F47; } }
```

| Axis | Verdict |
|---|---|
| **Cascade** | Layer-driven, decoupled from selector specificity. `tenants` always beats `base` regardless of how deep base selectors get. Cleanest model in the abstract. |
| **Baseline** | Chrome 99 / Firefox 97 / Safari 15.4 (Mar 2022). Modern, but excludes long-tail iOS WebViews and any embedded surfaces with frozen Safari. Clients we don't control may have stricter analytics tails. |
| **Authoring ergonomics** | Excellent in isolation — partial files just declare the layer name and write `:root`. But contributors unfamiliar with `@layer` read it as black magic. |
| **Debugging** | DevTools cascade-layer support is real but historically the weakest of the three options. Improving fast. |
| **Migration cost** | Higher than A. `build-tokens.mjs` has to wrap every emit in `@layer base { … }`, refactor `[data-theme="dark"]` into `@layer base.themes.dark`, and the static `theme.css` `@layer base { … }` reset block must be reconciled (it's the same name; layers merge by name, which is *probably* fine but needs verification). |
| **Risk** | One latent: existing third-party CSS (Tailwind preflight, motion libraries, doc-page CSS) lands in the unnamed/anonymous layer, which is *highest* priority — breaking the assumption that `tenants` always wins. Audit needed before flipping the switch. |

**Why this didn't win now:** the prize (clean cascade) is real, but the cost
to extract it (re-architect tokens.css emit, audit every imported CSS source
for layer assumptions, re-train contributors) is disproportionate to the
delta over A for a single-tenant-per-deploy world. **A is good enough until
multi-tenant preview environments become a hard requirement.**

### Option C — Shadow DOM isolation

Each HDS component mounts inside a Shadow Root; tenants pass theme tokens via
CSS custom properties at the host element.

| Axis | Verdict |
|---|---|
| **Cascade** | Hermetic — by design, nothing crosses the shadow boundary except CSS custom properties. |
| **Baseline** | Solid (Shadow DOM v1 is universal). |
| **Authoring ergonomics** | Disruptive. Every primitive needs a shadow-host wrapper. `:has()` and descendant selectors stop at the boundary. Form/a11y interactions (autofill, label-for, focus rings, accessible name) have edge cases. |
| **Debugging** | Inspector tools work but the mental model (separate trees, slot projection, host-vs-shadow specificity) is heavy. |
| **Migration cost** | High. Every component in `src/app/components/` needs a wrapper; the documentation site (which heavily uses descendant selectors and `:has()`) needs an audit. |
| **Risk** | The wrong primitive for the use case. Shadow DOM isolates **trust boundaries** — embeddable widgets crossing different sites' CSS. Tenants are NOT trust boundaries; they're cooperative deployments built from the same source. We'd be paying a heavy cost for protection we don't need. |

**Why this didn't win:** Shadow DOM is for embeddable widgets. We ship sites,
not widgets. The existing CSS-var token system already provides the leakage
protection clients need (only declared overrides apply). Adding Shadow DOM
buys isolation we don't have a use case for, at significant cost to the
component tree and accessibility surface.

### Option D — Build-time per-tenant CSS file

`build-tokens.mjs` runs once per tenant, emits `tokens.<slug>.css`. Each
tenant's app loads its own file. No scope attribute or layer at runtime.

| Axis | Verdict |
|---|---|
| **Cascade** | Simplest possible — one file, base selectors only. |
| **Baseline** | Universal. |
| **Authoring ergonomics** | Easiest for tenant authors; no scope vocabulary needed. |
| **Debugging** | No cascade reasoning needed at all. |
| **Migration cost** | Moderate. `build-tokens.mjs` forks per-tenant (build matrix), generated artifacts multiply, and the multi-output story has to land in CI. |
| **Risk** | **One-tenant-per-deploy only.** Preview environments showing all clients side-by-side (a near-term stakeholder/agency-pitch use case Adrian flagged) would require ALSO implementing A or B. |

**Why this didn't win — but it's the closest second:** D is appealing for
production deploys but loses the moment we want a single deploy serving
multiple tenants (e.g., agency portfolio page, "preview your brand here"
sales tool, Figma plugin tenant-switcher backed by a live URL). Choosing A
keeps that door open at zero extra cost.

---

## Consequences

### Token files (`hirobius.tokens.json` + `tenants/<slug>/tokens.json`)

- Base tokens stay where they are. No restructuring required.
- Per-tenant overlays live at `tenants/<slug>/tokens.json` (DTCG-shape partial).
  Format spec: `docs/architecture/tenant-token-overlay-format.md`.
- Overrides are **semantic-tier or higher** only (not primitive). See format
  spec for rationale.

### Build pipeline (`scripts/build-tokens.mjs`)

- Out of scope for this commit. Tracked as `12m-mt-build-pipeline`. The
  pipeline will:
  1. Walk `tenants/*/tokens.json`.
  2. For each, shallow-merge with base, run the existing token compiler.
  3. Emit a tenant block to `src/styles/tokens.css`:
     - `[data-tenant="<slug>"] { …overridden vars… }`
     - `[data-tenant="<slug>"][data-theme="dark"] { …dark-mode-tenant overrides… }`
  4. Validate the overlay against the partial-DTCG schema before emitting
     (fail-fast on unknown paths or primitive-tier overrides).

### App entry / runtime

- Set `data-tenant` on `<html>` at SSR (one line in the root layout).
- For the HDS doc site, leave `data-tenant` unset → base palette applies.
- Per-tenant deploys read the slug from a build-time env var
  (`TENANT_SLUG=concrete-creations`), set the attribute, and deploy.

### Contribution model

- New tenants: copy `tenants/_template/` → fill `tokens.json` + `metadata.json`
  → run `pnpm tokens` → deploy.
- The `_template/` always reflects the supported override surface (semantic +
  component + role tier paths). Contributors discover what's overridable by
  reading the template, not by guessing.

### Validators

- New: `scripts/check-tenant-tokens.mjs` (planned with build pipeline) — DTCG
  schema validator that also enforces the semantic-or-higher rule.
- Existing: `scripts/check-css-integrity.mjs` and `check-css-values.mjs` will
  need a tenant-block awareness pass when the build pipeline lands. Tracked
  in `12m-mt-build-pipeline`.

---

## Migration path

This decision is **additive** — no existing code changes required to land it.

1. **Now (this commit):** Decision doc + token overlay format spec +
   `tenants/_template/` and `tenants/concrete-creations/` scaffold. No
   compiler changes yet.
2. **Next (`12m-mt-build-pipeline`):** Extend `build-tokens.mjs` to walk
   `tenants/*` and append `[data-tenant="<slug>"]` blocks to the generated
   `tokens.css`. Add `scripts/check-tenant-tokens.mjs`.
3. **Then (`12m-mt-onboarding-workflow`):** Scaffold script
   (`scripts/scaffold-tenant.mjs`) + onboarding doc. 30-min onboarding budget.
4. **Later (post-12m):** Concrete Creations external repo consumes
   `@hirobius/design-system` as a dependency, sets `data-tenant`, deploys
   to its own Vercel project.
5. **Future migration to `@layer`:** When baseline is universal AND we have
   a multi-tenant-preview use case, the build script swaps emit format.
   Token overlays don't move. Doc site flips a feature flag. The
   `[data-theme="dark"]` selector graduates into `@layer themes.dark`.

---

## Decision log

| Axis | Choice | Why |
|---|---|---|
| **Cascade mechanism** | `[data-tenant="X"]` attribute selector | Mirrors `[data-theme="dark"]` precedent already in use; specificity is predictable; no contributor onboarding cost. |
| **Baseline support** | Universal (no `@layer` dependency) | Ships today across every browser HDS targets. `@layer` migration earmarked for when baseline is non-issue. |
| **Authoring ergonomics** | Partial DTCG overlay at `tenants/<slug>/tokens.json` | Same shape as base tokens.json, semantic-and-higher tier only. |
| **Debugging** | Standard CSS DevTools cascade view | Specificity columns reveal active rule; no special tooling. |
| **Migration cost** | Low | One additional pass in `build-tokens.mjs`; no refactor of base CSS. |
| **Isolation** | Per-deploy (one Vercel project per tenant) | Sufficient for current portfolio. Shadow DOM isolation rejected — wrong primitive. |
| **Multi-tenant preview future** | Preserved | A keeps the door open for future preview environments without architectural rework; D would have closed it. |
| **Component-tier overrides** | Allowed | Tenants may override `--component-button-primary-*` if brand demands. Primitive-tier overrides forbidden by overlay validator. |
| **Dark + tenant combination** | `[data-tenant="X"][data-theme="dark"]` | Specificity correctly stacks; tested against current dark-mode emit path. |

---

## Open questions / flagged risks

1. **Component-CSS scope leak.** If a contributor writes
   `[data-tenant="concrete-creations"] .hds-button` somewhere downstream,
   they sidestep the token system. The Swiss-canon validator needs a rule
   that disallows tenant-scoped selectors *outside* the generated tokens.css.
   Tracked: see follow-ups.
2. **`@layer` migration timing.** Decision is "later, when baseline allows."
   "Later" is intentionally not a date — it's gated on portfolio
   composition. Review every two sprints.
3. **Multi-tenant preview environment.** If/when this becomes a real ask,
   either (a) route preview deploys through a single Next.js app that
   reads `?tenant=X` and swaps the attribute, OR (b) implement Option D in
   parallel as `tokens.<slug>.css` build artifacts and let the preview app
   load the right one per route. Option A handles (a) natively.
4. **Tenant slug collision with `<html data-theme>` polyfills.** None
   detected today. If a future `data-theme="<custom>"` lands (e.g.
   sepia-mode), the per-tenant×per-theme combination grows by one factor.
   Manageable.
