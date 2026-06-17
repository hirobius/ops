# Per-Tenant Token Overlay Format

| Field | Value |
|---|---|
| **Status** | Accepted |
| **Date** | 2026-05-01 |
| **Author** | Adrian Milsap (orchestrated; opus-class) |
| **Unit** | `12m-mt-token-overlay-format` |
| **Depends on** | `12m-mt-css-scope-architecture` (decision: `[data-tenant="X"]` selectors) |

---

## Purpose

Define the **source format** for per-tenant token overrides — independent of
the CSS cascade mechanism (which is already settled in
`ADR-0001-multi-tenant-scope.md`). The build pipeline
(`12m-mt-build-pipeline`) consumes overlays in this format and emits scoped
CSS into `src/styles/tokens.css`.

A tenant overlay says, in essence: "I'm Concrete Creations. Use the HDS base,
but override these specific semantic tokens to express my brand."

---

## Directory layout

```
tenants/
  _template/                       # the canonical starter — copy this for new tenants
    tokens.json                    # DTCG-shape partial: ONLY the overridden paths
    metadata.json                  # slug, displayName, brand metadata, deploy info
    README.md                      # what this tenant overrides + why
  concrete-creations/
    tokens.json
    metadata.json
    README.md
  <slug>/
    …
```

**Slug rules:**

- Lowercase, kebab-case, ASCII only: `[a-z0-9-]+`.
- Must NOT start with `_` (reserved — `_template/` is the only underscore
  directory permitted).
- Becomes the `data-tenant="<slug>"` attribute value verbatim. No mapping.

---

## `tokens.json` — overlay format

A **partial DTCG file** mirroring the structure of `hirobius.tokens.json`.
Tenants only declare the leaf paths they override. Everything else inherits
from base.

### Minimal example — Concrete Creations

```json
{
  "$schema": "../../hirobius.tokens.schema.json",
  "semantic": {
    "color": {
      "$type": "color",
      "surface": {
        "accent": {
          "$value": "#8B6F47",
          "$description": "Warm stone — Concrete Creations primary accent (placeholder)",
          "$extensions": {
            "com.figma.variables": {
              "modes": {
                "Light": "#8B6F47",
                "Dark": "#6B5235"
              }
            }
          }
        }
      }
    }
  },
  "semantic": {
    "accent": {
      "$type": "color",
      "rest": {
        "$value": "#8B6F47",
        "$extensions": {
          "com.figma.variables": {
            "modes": { "Light": "#8B6F47", "Dark": "#6B5235" }
          }
        }
      }
    }
  }
}
```

### Compiled output

The build pipeline emits the following block into `src/styles/tokens.css`
(below the existing `:root` and `[data-theme="dark"]` blocks):

```css
[data-tenant="concrete-creations"] {
  --semantic-color-surface-accent: #8B6F47;
  --semantic-accent-rest: #8B6F47;
}
[data-tenant="concrete-creations"][data-theme="dark"] {
  --semantic-color-surface-accent: #6B5235;
  --semantic-accent-rest: #6B5235;
}
```

The override applies whenever `<html data-tenant="concrete-creations">`. With
the dark theme also active, both selectors match and the second wins by
specificity (0,2,0 > 0,1,0).

---

## Override resolution rules

### R1 — Tier scope

Tenants may override:

- **Semantic tier** (`semantic.*`) — yes, this is the intended override
  surface.
- **Component tier** (`component.*`) — yes, when brand demands a
  component-specific deviation that the semantic tier can't capture.
- **Role tier** (`role.*`) — yes, the shadcn-vocabulary role aliases.
- **Primitive tier** (`primitive.*`) — **NO.** Primitives are the abstraction.
  A tenant that needs a brown accent does NOT redefine
  `primitive.color.blue.500` to brown — that breaks every other consumer of
  blue. Instead, override `semantic.accent.rest` to point at a tenant-
  specific value (or define a new primitive at the BASE tier and re-alias
  semantic to it).

The validator enforces R1 fail-fast.

### R2 — Path-leaf merge

Overrides apply at the **leaf token level** (the path with `$value`). A
tenant cannot redefine a category (e.g., add a brand-new `semantic.color.brand`
group that didn't exist in base). The merge is path-precise: tenant leaf
beats base leaf, all other base leaves are unchanged.

### R3 — Conflict resolution

If two paths in a single tenant `tokens.json` end up resolving to the same
CSS variable (impossible in well-formed DTCG, but theoretical via duplicate
JSON keys), JSON parse-order wins (last-key-wins). The validator warns on
duplicate keys.

### R4 — Mode-aware overrides

Tenant overrides MAY include `$extensions.com.figma.variables.modes.{Light,
Dark}`. If present, the build pipeline emits both the base
`[data-tenant="X"]` selector (using the `$value` or the `Light` mode) AND
the combined `[data-tenant="X"][data-theme="dark"]` selector (using the
`Dark` mode value).

If only `$value` is present (no modes), the override applies in light AND
dark — common for tenant overrides where the brand color is mode-invariant.

### R5 — Unknown paths

A tenant `tokens.json` referencing a path that does NOT exist in base is a
**hard error**. Tenants override; they don't extend. (If a tenant truly
needs a new token, the path goes into the BASE tokens first.)

### R6 — Composite overrides

Composite tokens (typography, transition, motion, shadow, elevation) can be
overridden. Tenants may override the entire composite `$value` object, or
individual sub-keys are NOT supported (the DTCG composite is atomic). To
override only one slot of a typography composite, the tenant must redeclare
the full composite.

### R7 — Alias values are honored

A tenant override may use an alias (`{primitive.color.neutral.white}`) just
like base tokens. Alias resolution happens against the BASE token graph
augmented by tenant overrides — i.e., if a tenant adds an override that
itself aliases another semantic (also overridden by the tenant), the
resolution chain stays internally consistent.

### R8 — No primitive aliases unless they exist in base

A tenant alias to `{primitive.color.brand.500}` only resolves if that path
already exists in base. Tenants cannot smuggle new primitives in via aliases.

---

## `metadata.json` — tenant identity

```json
{
  "slug": "concrete-creations",
  "displayName": "Concrete Creations",
  "tagline": "Handmade concrete and stone goods, made in WA.",
  "tier": 2,
  "deployment": {
    "vercelProject": "concrete-creations",
    "primaryDomain": "concretecreations.com",
    "previewDomain": "preview.concretecreations.com"
  },
  "brand": {
    "primaryHex": "#8B6F47",
    "accentName": "warm-stone",
    "logoPath": "/assets/concrete-creations-logo.svg"
  },
  "legal": {
    "entity": "Concrete Creations LLC",
    "jurisdiction": "WA, USA",
    "stripeAccountKind": "platform-checkout"
  },
  "createdAt": "2026-05-01",
  "status": "scaffold"
}
```

| Field | Required | Purpose |
|---|---|---|
| `slug` | yes | Verbatim `data-tenant` attribute value. Must match directory name. |
| `displayName` | yes | UI-facing brand name; rendered in tenant-aware screens. |
| `tagline` | no | Short brand line; used by previews, sales tooling. |
| `tier` | yes | 1 (brand presence), 2 (e-commerce), 3 (product). Drives infra defaults. |
| `deployment.*` | yes | Where this tenant ships. Required for the future `pnpm deploy:tenant` script. |
| `brand.*` | yes | Quick-reference brand info. Source of truth is `tokens.json`; this is for tooling that wants brand metadata without parsing the DTCG. |
| `legal.*` | yes for tier ≥ 2 | Entity + jurisdiction. Drives legal-page generation, Stripe wiring, attribution requirements. |
| `status` | yes | One of: `scaffold`, `active`, `archived`. Drives validator strictness. |

---

## JSON schema (delta on base DTCG)

A tenant `tokens.json` is a **proper subset** of the base DTCG schema with
these additional rules enforced by `scripts/check-tenant-tokens.mjs`
(planned as part of `12m-mt-build-pipeline`):

```
TenantTokens := DTCGObject

ValidationRules:
  R1.tier   : NO leaf token whose path[0] === "primitive"
  R2.leaf   : Every override MUST end in $value (no group-only declarations)
  R5.path   : Every override path MUST exist in hirobius.tokens.json
  R6.atomic : Composite types are replaced atomically (no sub-key merging)
  R8.alias  : All {ref} values resolve to a base path or a tenant override
```

---

## Adding a new tenant

```bash
# 1. Copy the template
cp -r tenants/_template tenants/<slug>

# 2. Edit metadata.json — fill slug, displayName, tier, deployment, brand
$EDITOR tenants/<slug>/metadata.json

# 3. Edit tokens.json — declare the brand overrides (semantic-tier or higher)
$EDITOR tenants/<slug>/tokens.json

# 4. Build (planned: 12m-mt-build-pipeline)
pnpm tokens

# 5. Verify the tenant block landed in src/styles/tokens.css
rg 'data-tenant="<slug>"' src/styles/tokens.css

# 6. (Tenant repo) Set <html data-tenant="<slug>"> at SSR root, deploy.
```

The full onboarding workflow (with scaffold script and `<30 min` budget) is
unit `12m-mt-onboarding-workflow`.

---

## Why semantic-only overrides

A tenant who wants a brown accent has two paths conceptually:

**Wrong:** override `primitive.color.blue.500` to brown. Breaks every
component that uses blue for non-accent purposes (focus rings, info
feedback, link colors, brand-blue-only doc-page elements). Loses the
ability to refer to "real" blue at the primitive layer.

**Right:** override `semantic.accent.rest` (and the few related semantic
accent paths) to brown. Every consumer of `semantic.accent.*` shifts; every
consumer of `primitive.color.blue.*` is unaffected. The abstraction holds.

This is the *whole point* of the three-tier token system. Overlays exist to
shift the semantic meaning of tokens for a specific brand, NOT to redefine
the underlying palette.

---

## Validation flow

When the build pipeline lands (`12m-mt-build-pipeline`):

1. `scripts/check-tenant-tokens.mjs` runs as a pre-commit gate.
2. For each `tenants/*/tokens.json`:
   - Parse as JSON; fail on syntax errors.
   - Walk the token tree; collect leaf paths.
   - Reject if any leaf path is `primitive.*` (R1).
   - Reject if any leaf path doesn't exist in base (R5).
   - Resolve aliases (R7, R8) — fail on unresolvable refs.
   - Check `metadata.json` matches the schema above.
   - Check directory slug matches `metadata.slug`.
3. On pass: `build-tokens.mjs` emits the tenant block into `tokens.css`.

---

## Future extensions (out of scope for this commit)

- **Per-tenant typography licensing** (`12m-mt-typography-licensing`): tenant
  may override `primitive.font.family.primary` IF the licensing layer
  approves. Schema gets a `licensingApproved: true` flag at the metadata
  level. This is the only carve-out to R1 — and it requires explicit human
  sign-off in metadata.json.
- **Per-tenant Figma masters** (`12m-mt-figma-master-per-tenant`): the
  Figma plugin reads tenant metadata + overlays to swap component-set
  colors before publishing.
- **Tenant-aware preview tool**: a route in the doc site
  (`/preview/<slug>`) that sets `data-tenant` at runtime so designers can
  see tenant theming without leaving the HDS doc app.
