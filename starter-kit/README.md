# HDS Starter Kit

Minimal Vite + React demo app that consumes `@hirobius/design-system` as an
external package — proving the design system is adoptable outside the main
monorepo.

## What's demonstrated

| Primitive | Notes |
|-----------|-------|
| `HdsButton` | All three variants (primary / secondary / tertiary), sizes, loading, disabled |
| `HdsBadge` | All five tones (neutral, info, success, warning, danger) |
| `HdsTag` | Click-to-toggle active state |
| `HdsInput` | Default, disabled, and error states |
| `HdsAlert` | All four variants (info, success, warning, error) |
| `HdsCard` | Compound-parts pattern (Header / Body / Footer) |
| `HdsDivider` | Semantic separator |

Light/dark toggle in the header flips `data-theme` and `.dark` on `<html>` —
the same pattern used internally.

---

## Install steps

```bash
# 1. From the repo root, install the monorepo
pnpm install

# 2. Enter the starter-kit and install its own deps
cd starter-kit
pnpm install

# 3. Start the dev server (port 3001)
pnpm dev
```

> **No separate build step needed.** The starter-kit imports the parent package
> via a `file:..` workspace dependency, so changes to the parent source are
> reflected on the next page reload.

---

## How tokens flow

```
hirobius.tokens.json          (W3C DTCG source)
       │
       ▼
pnpm tokens                   (build step in parent)
       │
       ▼
src/styles/tokens.generated.css   (CSS custom properties)
       │
       ▼
@hirobius/design-system/tokens.css  (exported subpath)
       │
       ▼
starter-kit/src/main.tsx      (import '@hirobius/design-system/tokens.css')
       │
       ▼
components read var(--semantic-color-*)  at runtime
```

Every color, spacing, radius, and motion value resolves through a CSS custom
property. No values are hard-coded inside components.

---

## How to override the theme

Override any token by reassigning its CSS variable on your own root:

```css
/* my-brand-overrides.css */
:root {
  /* Swap the brand accent to a teal hue */
  --semantic-color-brand-primary: #0d9488;
  --semantic-color-brand-primary-hover: #0f766e;
  --semantic-color-brand-on-primary: #ffffff;

  /* Custom radius */
  --semantic-radius-action: 4px;
}
```

Import this file after `@hirobius/design-system/tokens.css` and your overrides
take precedence via the CSS cascade.

For multi-tenant overrides (e.g. white-label clients) the parent repo also
ships `src/styles/tenants.css` as a pattern for scoped `[data-tenant="x"]`
overrides.

---

## Dark mode

Set `data-theme="dark"` and the class `dark` on `<html>` to activate dark mode:

```ts
document.documentElement.setAttribute('data-theme', 'dark');
document.documentElement.classList.add('dark');
```

Remove both to return to light mode. The starter-kit `App.tsx` does this in a
`useEffect` keyed to an `isDark` boolean — copy that pattern directly.

---

## File structure

```
starter-kit/
├── index.html          HTML entry point
├── package.json        Deps: @hirobius/design-system (file:..), react, vite
├── tsconfig.json       Extends parent tsconfig paths (@/ → ../src/)
├── vite.config.ts      Port 3001, deduped React, @/ alias
├── README.md           You are here
└── src/
    ├── main.tsx        Mounts root, imports tokens.css
    └── App.tsx         Demo page with theme toggle + component showcase
```
