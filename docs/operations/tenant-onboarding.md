# Tenant Onboarding Runbook

Goal: contract signed → live Vercel preview in under 30 minutes.

---

## Prerequisites

- Node 18+ with pnpm installed
- Access to the hirobius/design-system repo (`fix/ui-pipeline` or later)
- A Vercel account + team with permission to create new projects
- Client's brand hex (6-digit, e.g. `#2563EB`) and display name

---

## Step 1 — Scaffold the tenant directory (< 2 min)

```bash
pnpm scaffold:tenant \
  --slug=<client-slug> \
  --primary-color=<#RRGGBB> \
  --display-name="Client Brand Name" \
  --tier=<1|2|3>
```

**Slug rules:** lowercase kebab-case, matches directory name and `data-tenant` attribute (e.g. `acme-co`).

**Tier guide:**
| Tier | Description |
|------|-------------|
| 1 | Brand presence — marketing site only |
| 2 | E-commerce — Stripe Checkout, requires legal entity |
| 3 | Product — custom auth, dashboards, advanced integrations |

This command creates `tenants/<slug>/` with three files:

| File | Purpose |
|------|---------|
| `tokens.json` | DTCG-format color overlay — auto-derives hover/pressed/subtle from primary hex |
| `metadata.json` | Tenant identity, deployment targets, legal info |
| `README.md` | Quick-reference card for humans and agents |

Use `--dry-run` to preview the writes without touching disk.

---

## Step 2 — Refine brand tokens (2–5 min)

Open `tenants/<slug>/tokens.json`.

The auto-derived shades are mathematically safe but rarely match the brand exactly.
Adjust `semantic.accent.hover`, `semantic.accent.pressed`, and `semantic.accent.subtle`
to match any brand guide the client provides.

**Scope rule:** only override `semantic.*`, `component.*`, or `role.*`.
Never touch `primitive.*` — those are the design system's abstraction boundary.

---

## Step 3 — Fill metadata (2 min)

Open `tenants/<slug>/metadata.json` and update:

```jsonc
{
  "deployment": {
    "vercelProject": "<vercel-project-slug>",   // set after Step 5
    "primaryDomain": "client.com",              // set once DNS is ready
    "previewDomain": "client.vercel.app"
  },
  "brand": {
    "primaryHex": "#RRGGBB",
    "accentName": "brand-accent",               // optional human label
    "logoPath": "public/assets/clients/<slug>/logo.svg"
  },
  "legal": {
    "entity": "Client LLC",                     // required for tier >= 2
    "jurisdiction": "WA, USA",
    "stripeAccountKind": "platform-checkout"    // tier 2 only
  }
}
```

---

## Step 4 — Compile the token CSS (1 min)

```bash
pnpm tokens
```

This writes the compiled `[data-tenant="<slug>"]` CSS selector block into
`src/styles/tokens.css`. Verify with:

```bash
grep 'data-tenant="<slug>"' src/styles/tokens.css
```

If the grep returns nothing, check:
- `tokens.json` has no leading `_` on the top-level group keys
- `pnpm tokens` exited 0 (no DTCG validation errors)

---

## Step 5 — Wire the data-tenant attribute (5 min)

In the tenant's app entry point (or SSR root), set:

```html
<html data-tenant="<slug>" lang="en">
```

For a React app using Next.js, this goes in `app/layout.tsx`:

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-tenant="<slug>">
      <body>{children}</body>
    </html>
  );
}
```

The CSS cascade picks up the `[data-tenant="<slug>"]` override block automatically
— no JS token injection required.

---

## Step 6 — Set VITE_TENANT_SLUG (1 min)

In the tenant's `.env.local` (created by the human, never by agents):

```
VITE_TENANT_SLUG=<slug>
```

This allows build-time tenant-scoped imports and any conditional logic that
references the current tenant slug.

---

## Step 7 — Build for the tenant (2 min)

```bash
pnpm build:tenants
```

Or to build only one tenant:

```bash
VITE_TENANT_SLUG=<slug> pnpm build
```

The output lands in `dist/` or a tenant-specific output directory depending on
your Vercel project configuration.

---

## Step 8 — Deploy to Vercel (5 min)

1. Create a new Vercel project linked to this repo.
2. Set the root directory to the tenant's app folder (if it's a separate app)
   or to the monorepo root with the correct build command.
3. Add environment variable `VITE_TENANT_SLUG=<slug>` in the Vercel project settings.
4. Trigger a deployment. Vercel generates a preview URL immediately.
5. Record the preview URL in `metadata.json` under `deployment.previewDomain`.

---

## Step 9 — Smoke test the preview (2 min)

Open the preview URL and check:

- [ ] Brand accent color renders on CTAs and links (not the HDS default blue)
- [ ] No `primitive.*` tokens leaked as unresolved CSS vars
- [ ] `document.documentElement.dataset.tenant` returns the correct slug in the browser console
- [ ] Responsive layout passes at 375px, 768px, 1280px

---

## Step 10 — Commit and mark ready (1 min)

```bash
git add tenants/<slug>/
git commit -m "feat(tenants): scaffold <slug> tenant overlay"
```

Update `tenants/<slug>/metadata.json` status from `"scaffold"` to `"active"` once
the client approves the preview.

---

## Ledger — Workflow steps and tradeoffs

This section exists so Adrian can evaluate and redirect the approach.

### Why `pnpm scaffold:tenant` instead of manual copy?

Manual copy of `tenants/_template` requires filling several nested JSON fields by hand
and risks leaving placeholder `_` prefixes that silently emit no CSS. The script
validates slug format, derives hover/pressed/subtle shades automatically (saving
~10 minutes of hex math per tenant), and prints explicit next-steps. The tradeoff:
auto-derived shades use simple lightness scaling, which works for most brand colors
but can produce low-contrast results on very desaturated or near-white primaries —
a manual review pass in Step 2 catches this.

### Why `[data-tenant=]` CSS scoping instead of CSS custom property injection via JS?

The `[data-tenant=]` selector approach is SSR-safe (no flash of unstyled content),
works without JavaScript, and keeps the override cascade in one compiled CSS file
that is fully auditable. The tradeoff: every compiled CSS file includes all tenant
blocks, increasing bundle size linearly with tenant count. For the current scale
(< 10 tenants) this is negligible. At ~20+ tenants, consider splitting per-tenant
CSS into separate files loaded only for that tenant. See
`docs/architecture/ADR-0001-multi-tenant-scope.md` for the original decision.

### Why compile with `pnpm tokens` rather than import tokens.json at runtime?

Build-time compilation turns the DTCG JSON into static CSS variables, giving
the browser zero-cost resolution. Runtime import would require a JS bridge that
fires after hydration, producing visible FOUC and adding a network round-trip.
The tradeoff: any token change requires a redeploy (not just a config update).
For brand color tweaks this is acceptable — token changes are infrequent and
always warrant a deploy for QA anyway.

### Why tier-based metadata instead of feature flags?

Tier is a coarse gating mechanism that maps cleanly to the three service
packages in the Hirobius agency model (brand, e-commerce, product). It drives
which legal fields are required (tier >= 2 needs entity + jurisdiction) and
which integrations are scaffolded (Stripe only for tier 2+). The tradeoff:
a tier-1 client who wants a single Stripe button needs to be bumped to tier 2
even if they don't need the full e-commerce stack. If that pattern emerges
often, replace `tier` with a `features: string[]` array.

### 30-minute target: where time goes

| Step | Typical time |
|------|-------------|
| scaffold-tenant.mjs | 1 min |
| Token refinement | 2–5 min |
| metadata.json fill | 2 min |
| pnpm tokens | 1 min |
| data-tenant attribute | 2 min |
| env var + build | 3 min |
| Vercel project setup | 5 min |
| Smoke test | 2 min |
| Commit | 1 min |
| **Total** | **~20–22 min** |

Buffer of ~8 minutes exists for DNS propagation, Stripe account linking,
or any token iteration the client requests during the onboarding call.

---

## Reference

| Resource | Path |
|----------|------|
| Template directory | `tenants/_template/` |
| Scaffold script | `scripts/scaffold-tenant.mjs` |
| Token overlay format spec | `docs/architecture/tenant-token-overlay-format.md` |
| CSS scoping ADR | `docs/architecture/ADR-0001-multi-tenant-scope.md` |
| Base tokens | `hirobius.tokens.json` |
| Compiled CSS | `src/styles/tokens.css` |
| Existing tenants | `tenants/concrete-creations/` |
