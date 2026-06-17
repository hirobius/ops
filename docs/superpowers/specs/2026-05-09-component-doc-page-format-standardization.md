# Component Doc Page Format Standardization

**Date:** 2026-05-09  
**Scope:** Six HDS component doc pages  
**Reference format:** `ActionsPage.tsx`

---

## Goal

All component doc pages must match the ActionsPage format exactly: `ComponentDocPageShell` wrapper, `CategoryComponentDocs` with `hideDetails hideVariantDeck hideHero`, a `configs` object (where custom demos exist), and a JSDoc header.

---

## Reference Format (ActionsPage)

```tsx
/**
 * <PageName>Page - /hds/components/<route>
 *
 * Components: ...
 * Category validated against: ...
 */

import { type ReactNode } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { CategoryComponentDocs } from '../../../components/CategoryComponentDocs';
// component imports used in matrix...
import { ComponentDocPageShell } from './ComponentDocPageShell';

export default function <PageName>Page() {
  const { isDark } = useTheme();

  const configs = {
    ComponentName: {
      matrix: (<.../>),
    },
  } satisfies Record<string, { matrix?: ReactNode; children?: ReactNode }>;

  return (
    <ComponentDocPageShell title="..." isDark={isDark} intro="...">
      <CategoryComponentDocs
        category="..."
        isDark={isDark}
        preferredOrder={[...]}
        configs={configs}
        hideDetails
        hideVariantDeck
        hideHero
      />
    </ComponentDocPageShell>
  );
}
```

---

## Changes Per Page

### NavigationPage
- Add `hideDetails`, `hideVariantDeck`, `hideHero` to `CategoryComponentDocs`
- No configs needed (manifest defaults are sufficient)

### LayoutPage
- Add `hideDetails`, `hideVariantDeck`, `hideHero` to `CategoryComponentDocs`
- Add blank line between last import and `export default`
- No configs needed

### InputsPage
- Add `hideDetails`, `hideVariantDeck`, `hideHero` to `CategoryComponentDocs`
- Change `satisfies Record<string, { matrix?: ReactNode }>` → `satisfies Record<string, { matrix?: ReactNode; children?: ReactNode }>`

### DocUtilitiesPage
- Add JSDoc header (category: Utilities/Branding/Lab; validated against Material Design / Ant Design)
- Remove three `<section>` wrappers and `TextLockup` headings — render three `CategoryComponentDocs` flat
- Remove `TextLockup` import from `'../HdsDocPrimitives'`
- Add `hideDetails`, `hideVariantDeck`, `hideHero` to all three `CategoryComponentDocs`

### FeedbackPage
- Drop imports: `DocSection`, `HdsComponentDoc` from `'../HdsDocPrimitives'`
- Add: `import { type ReactNode } from 'react'`
- Build `configs` object:
  - `Badge`: matrix = `<VariantStrip label="Tones" variants={[neutral, info, success, warning, danger]} />`
  - `Callout`: matrix = `<VariantStrip label="Tones" variants={[accent, info, success, warning, danger]} />`
  - `Alert`, `ErrorPattern`, `NotFoundPattern`: no entry (manifest defaults)
- Replace all `DocSection` + `HdsComponentDoc` blocks with single `CategoryComponentDocs category="Feedback"` with `preferredOrder`, `configs`, and three flags
- Keep imports: `Badge`, `Callout`, `VariantStrip` (used in configs)

### DisplayPage
- Drop imports: `DocSection`, `DocSubsection`, `HdsComponentDoc` from `'../HdsDocPrimitives'`
- Drop import: `InlineLink` (custom Icon description is removed to match Actions format)
- Add: `import { type ReactNode } from 'react'`
- Build `configs` object:
  - `Icon`: matrix = `<Surface padding="component"><TextLockup size="section" title="Icon Registry" titleAs="h3" /><IconGallery /></Surface>`
  - `Stat`: matrix = existing `VariantStrip` (tones: default, success, warning, danger, with-sub)
  - `Field`: matrix = existing `VariantStrip` (variants: default, mono, success, children)
  - `StatusListItem`: matrix = existing `VariantStrip` (tones: neutral, info, warning, success, danger)
  - `EmptyState`: matrix = existing `VariantStrip` (title-only, with-description)
  - `StatusTile`: matrix = existing `VariantStrip` (neutral, with-trailing)
  - `PhaseHeader`: matrix = existing `VariantStrip` (default, success, warning)
  - `AgentTag`: matrix = existing `VariantStrip` (local, frontier)
  - `TextLockup`, `Table`, `InlineCode`, `CodeBlock`, `Token`, `AssetImg`: no entry
- Replace all `DocSection` blocks with single `CategoryComponentDocs category="Display"` with `preferredOrder`, `configs`, and three flags
- `preferredOrder`: `['Icon', 'TextLockup', 'Table', 'InlineCode', 'CodeBlock', 'Token', 'Stat', 'Field', 'StatusListItem', 'AssetImg', 'EmptyState', 'StatusTile', 'PhaseHeader', 'AgentTag']`
- Keep imports: `Surface`, `TextLockup`, `VariantStrip`, `Badge`, `Stat`, `Field`, `StatusListItem`, `AgentTag`, `EmptyState`, `PhaseHeader`, `StatusTile`, `IconGallery`

---

## Validation

After each page: `pnpm typecheck && pnpm test:layout`  
All six must pass before marking done.

---

## Out of Scope

- No changes to `CategoryComponentDocs`, `ComponentDocPageShell`, or any shared component
- No new abstractions or helper components
- No changes to manifest, tokens, or routing
