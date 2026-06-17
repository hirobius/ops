# Tenant Template

Canonical starter for onboarding a new HDS tenant.

## What lives here

| File | Purpose |
|---|---|
| `tokens.json` | DTCG-shape **partial** — only the brand tokens this tenant overrides. Inactive in the template (top-level group keys are prefixed with `_` so the build emits nothing). |
| `metadata.json` | Tenant identity, deployment target, brand basics, legal info. |
| `README.md` | This file. Describes the tenant for humans + agents. |

## Onboarding a new tenant

```bash
# 1. Copy the template, rename to your slug (lowercase kebab-case)
cp -r tenants/_template tenants/<slug>

# 2. Fill metadata.json
$EDITOR tenants/<slug>/metadata.json
#   - slug           → must equal the directory name
#   - displayName    → human brand name
#   - tier           → 1 (brand) / 2 (e-commerce) / 3 (product)
#   - deployment     → Vercel project + domains
#   - brand.primaryHex → quick-reference brand color
#   - legal          → entity + jurisdiction (required for tier ≥ 2)

# 3. Fill tokens.json
$EDITOR tenants/<slug>/tokens.json
#   - Remove leading `_` from any group key you want to activate
#   - Replace placeholder hexes with brand values
#   - Override semantic / component / role tier ONLY (NEVER primitive.*)
#   - Each leaf must end in $value (DTCG)

# 4. Build (lands in 12m-mt-build-pipeline)
pnpm tokens

# 5. Verify
rg 'data-tenant="<slug>"' src/styles/tokens.css

# 6. Tenant repo: set <html data-tenant="<slug>"> at SSR; deploy.
```

## Override scope

Tenants override **semantic-tier or higher**:

- `semantic.*` — color roles, typography, motion, spacing
- `component.*` — component-specific token slots
- `role.*` — shadcn-vocabulary role aliases

Tenants do **NOT** override `primitive.*`. Primitives are the abstraction
the design system protects. To shift brand color, override
`semantic.accent.rest` to a new hex (or alias to a new primitive added at
the BASE level — but that's a system change, not a tenant change).

## Reference

- Format spec: `docs/architecture/tenant-token-overlay-format.md`
- Scope decision (why `[data-tenant=]`): `docs/architecture/ADR-0001-multi-tenant-scope.md`
- Base tokens: `hirobius.tokens.json`
- Generated CSS: `src/styles/tokens.css`
