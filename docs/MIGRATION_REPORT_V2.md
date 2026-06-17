# Migration Report V2

Date: 2026-04-23
Branch: `migration/hds-v2`

## Summary

This report records the HDS V2 architecture lock-in captured by the safe-save branch and commit. The snapshot preserves three recent system wins that materially changed how layout, documentation, and foundation specimen rendering behave.

## 1. Grid Engine Unification

The grid system is now governed through [`src/app/components/Grid.tsx`](/home/adrian/projects/adrian-milsap/src/app/components/Grid.tsx), rather than page-level one-off math. The current engine standardizes:

- responsive fixed-column behavior with a 12-column desktop base
- semantic gap tokens instead of ad hoc spacing
- `alignItems: 'stretch'` as a first-class default for shared visual horizons
- sanctioned escape hatches for `auto-fit` and `subgrid`

This reduces layout drift, removes repeated grid logic from page code, and makes future audits enforceable at the primitive layer.

## 2. DocLayout Extraction

Documentation shell behavior is now centralized in [`src/app/layouts/DocLayout.tsx`](/home/adrian/projects/adrian-milsap/src/app/layouts/DocLayout.tsx), with downstream usage in [`src/app/pages/hds/HDSLayout.tsx`](/home/adrian/projects/adrian-milsap/src/app/pages/hds/HDSLayout.tsx). The extraction consolidated:

- nav and toc rail widths
- responsive rail breakpoints
- shell max-width math through `getDocLayoutShellMaxWidth(...)`
- the reading-width rule that defaults documentation content to `content`

The result is a reusable documentation chassis instead of route-specific shell duplication.

## 3. "Morphing Horizon" Foundation Swatch Fix

Foundation swatches were stabilized in [`src/app/components/FoundationSwatch.tsx`](/home/adrian/projects/adrian-milsap/src/app/components/FoundationSwatch.tsx). The flex math now keeps the specimen body and token node aligned across varying content states by:

- using a column surface with a flex-growing preview region
- computing placement from `previewPosition`
- pinning bottom-left specimens with explicit preview padding instead of brittle manual offsets
- preserving a consistent lower token horizon under mixed note, value, and specimen combinations

This resolved the visible baseline drift in the Foundation Swatches and made the layout behavior deterministic.

## Outcome

HDS V2 now has a cleaner primitive stack, a reusable documentation shell, and more stable foundation specimen math. This branch exists as the protected save point for that architecture state.
