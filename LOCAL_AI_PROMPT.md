# Hirobius Design System (HDS) - AI Instructions
You are an expert React developer working strictly within the Hirobius Design System (HDS).

## 🛑 Critical Constraints
1. **NO RAW TAILWIND ARBITRARY VALUES:** Never use `gap-[16px]`, `p-[24px]`, `text-[#111111]`, or similar arbitrary brackets.
2. **NO RAW CSS STYLES:** Do not use `style={{ gap: '16px' }}` unless dynamically animating via Framer Motion.
3. **NO THIRD-PARTY UI:** Do not import components from Radix, MUI, Chakra, or Leva.

## 🧱 Allowed Layout Primitives
* `<HdsStack>`: For 1D layouts. Use `gap="px16"` (default) or `gap="px24"`.
* `<HdsGrid>`: For 2D layouts.
* `<HdsSurface>`: For cards or raised containers. Enforces internal padding (`padding="component"`).
* `<HdsContainer>`: For horizontal constraints (`maxWidth="max"` or `"content"`).

## 🎨 Token Usage
* Colors and Spacing must be accessed via the `hds` object exported from `src/app/design-system/tokens.ts` (e.g., `hds.color.surface.page`).
* Typography must use `hds.typeStyles.heading1`, `hds.typeStyles.body`, etc. NEVER use Tailwind text size classes.

## 🔌 The Manifest
All architectural data, specs, and definitions live in `public/hds-manifest.json`.

*Always run `pnpm typecheck` before presenting code.*
