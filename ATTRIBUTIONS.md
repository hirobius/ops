# ATTRIBUTIONS

Last updated: 2026-03-18
Status: Canonical attribution registry

## Purpose

This is the single source for outside references, licensed inclusions, and acknowledged inspiration used across the project.

Use this file to track:

- licensed third-party assets
- code or component libraries that require attribution
- documentation or design-system references that materially informed the work
- visual references used for major direction-setting passes
- stable registry IDs used by asset metadata and automated checks

## Rules

1. If a third-party asset, library, or visual reference materially influences shipped work, add it here.
2. If a doc mentions a reference for reasoning only, it can stay in that doc, but the canonical attribution should still live here when the influence is durable.
3. This file is a registry, not the place for policy or backlog.
4. Every durable entry should have a unique `Registry ID` so manifests and checks can refer to it without guessing.

## Licensed Assets And Libraries

### shadcn/ui

- Registry ID: library-shadcn-ui
- Type: Component/library reference
- Usage: Included components in the Figma Make file
- License: MIT
- Source: [shadcn/ui](https://ui.shadcn.com/)
- License link: [MIT license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md)

### Unsplash

- Registry ID: asset-unsplash
- Type: Photography source
- Usage: Photos included in the Figma Make file
- License: Unsplash License
- Source: [Unsplash](https://unsplash.com)
- License link: [Unsplash license](https://unsplash.com/license)

## Design-System And Documentation References

These are not copied implementations. They are reference points used for structure, conventions, or quality baseline.

### Material Design

- Registry ID: reference-material-design
- Type: Design-system convention reference
- Usage: component categorization and DS baseline comparison
- Source: [Material Design](https://m3.material.io/)

### IBM Carbon

- Registry ID: reference-ibm-carbon
- Type: Design-system convention reference
- Usage: DS governance, accessibility, and system-quality comparisons
- Source: [Carbon Design System](https://carbondesignsystem.com/)

### Adobe Spectrum

- Registry ID: reference-adobe-spectrum
- Type: Design-system convention reference
- Usage: licensing and accessibility baseline comparisons
- Source: [Adobe Spectrum](https://spectrum.adobe.com/)

### Atlassian Design System

- Registry ID: reference-atlassian-design-system
- Type: Design-system convention reference
- Usage: token and system-structure comparisons
- Source: [Atlassian Design System](https://atlassian.design/)

### Chakra UI

- Registry ID: reference-chakra-ui
- Type: Token-system and component-system reference
- Usage: token-driven theming comparisons and component classification checks
- Source: [Chakra UI](https://chakra-ui.com/)

### Radix UI

- Registry ID: reference-radix-ui
- Type: component primitive reference
- Usage: accessibility and component primitive baseline
- Source: [Radix UI](https://www.radix-ui.com/)

## Visual Direction References

### Sevalla Docs

- Registry ID: visual-sevalla-docs
- Type: Documentation-shell visual reference
- Usage: right-rail TOC and premium docs-shell inspiration for the HDS portfolio pass
- Source: [Sevalla Docs](https://docs.sevalla.com/)

### Wall of Portfolios / Kshitij Suri

- Registry ID: visual-wall-of-portfolios
- Type: Portfolio-shell visual reference
- Usage: docs-style portfolio structure inspiration
- Source: [Wall of Portfolios](https://www.wallofportfolios.in/portfolios/kshitij-suri/)

## Operational References

### Zeroheight

- Registry ID: operational-zeroheight
- Type: documentation platform reference
- Usage: external DS documentation integration planning
- Source: [Zeroheight](https://zeroheight.com/)

### Figma

- Registry ID: operational-figma
- Type: design tooling platform
- Usage: token import/export, component documentation, audit source material
- Source: [Figma](https://www.figma.com/)

## Maintenance

When a new third-party dependency, visual reference, or outside DS reference becomes materially important:

1. add it here
2. link to the official source when possible
3. note how it is being used

If a reference stops mattering, remove it here instead of letting the registry drift.
