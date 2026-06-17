# HDS Token Migration Audit Report

**Generated:** 2026-05-01T08:11:21.768Z

## Summary

**Total Violations:** 62

**Files Affected:** 26

---

## Migration Checklist

- [ ] **src/app/components/CategoryComponentDocs.tsx** (1 violations)
- [ ] **src/app/components/Grid.tsx** (1 violations)
- [ ] **src/app/components/HeadingStack.tsx** (1 violations)
- [ ] **src/app/components/PreviewFrame.tsx** (1 violations)
- [ ] **src/app/components/HdsSidebarNav.tsx** (1 violations)
- [ ] **src/app/components/lab/LegacyTokenDetail.tsx** (7 violations)
- [ ] **src/app/pages/docs/templates/HdsSystemDocLayout.tsx** (1 violations)
- [ ] **src/app/pages/hds/ColorPage.tsx** (2 violations)
- [ ] **src/app/pages/hds/FoundationDocPage.tsx** (2 violations)
- [ ] **src/app/pages/hds/GettingStartedPage.tsx** (1 violations)
- [ ] **src/app/pages/hds/HDSLayout.tsx** (4 violations)
- [ ] **src/app/pages/hds/HdsDocPrimitives.tsx** (5 violations)
- [ ] **src/app/pages/hds/HdsSystemDocLayout.tsx** (2 violations)
- [ ] **src/app/pages/hds/IconsPage.tsx** (4 violations)
- [ ] **src/app/pages/hds/LegacyTokenExplorerPanel.tsx** (2 violations)
- [ ] **src/app/pages/hds/MotionPage.tsx** (1 violations)
- [ ] **src/app/pages/hds/OverviewPage.tsx** (9 violations)
- [ ] **src/app/pages/hds/PortfolioAssetSlot.tsx** (1 violations)
- [ ] **src/app/pages/hds/PortfolioHomePage.tsx** (2 violations)
- [ ] **src/app/pages/hds/SandboxPage.tsx** (3 violations)
- [ ] **src/app/pages/hds/SpacingPage.tsx** (1 violations)
- [ ] **src/app/pages/hds/TokensPage.tsx** (4 violations)
- [ ] **src/app/pages/hds/TypographyPage.tsx** (1 violations)
- [ ] **src/app/pages/hds/VisualsPage.tsx** (2 violations)
- [ ] **src/app/pages/hds/components/ComponentDocPageShell.tsx** (2 violations)
- [ ] **src/app/pages/hds/components/IconGallery.tsx** (1 violations)

---

## Detailed Violations by File

### src/app/components/CategoryComponentDocs.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 57 | Primitive Spacing Banned | `gap="px24"` |

### src/app/components/Grid.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 139 | Manual Grid Layout | `display: 'grid'` |

### src/app/components/HeadingStack.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 18 | Primitive Spacing Banned | `gap="px4"` |

### src/app/components/PreviewFrame.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 49 | Manual Grid Layout | `display: 'grid'` |

### src/app/components/HdsSidebarNav.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 94 | Primitive Spacing Banned | `gap="px24"` |

### src/app/components/lab/LegacyTokenDetail.tsx

**Total violations: 7**

| Line | Rule | Issue |
|------|------|-------|
| 472 | Manual Grid Layout | `display: 'grid'` |
| 557 | Manual Grid Layout | `display: 'grid'` |
| 602 | Manual Grid Layout | `display: 'grid'` |
| 612 | Manual Surface Styling | `<div style={{ display: 'grid', gap: hds.semantic.space.component.padding, minWidth: 0 }}` |
| 612 | Manual Grid Layout | `display: 'grid'` |
| 749 | Manual Grid Layout | `display: 'grid'` |
| 751 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/docs/templates/HdsSystemDocLayout.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 40 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/ColorPage.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 158 | Primitive Spacing Banned | `gap="px24"` |
| 256 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/FoundationDocPage.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 61 | Manual Grid Layout | `display: 'grid'` |
| 92 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/GettingStartedPage.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 64 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/HDSLayout.tsx

**Total violations: 4**

| Line | Rule | Issue |
|------|------|-------|
| 812 | Primitive Spacing Banned | `gap="px24"` |
| 815 | Primitive Spacing Banned | `gap="px24"` |
| 1046 | Primitive Spacing Banned | `gap="px24"` |
| 1084 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/HdsDocPrimitives.tsx

**Total violations: 5**

| Line | Rule | Issue |
|------|------|-------|
| 261 | Primitive Spacing Banned | `gap="px24"` |
| 340 | Primitive Spacing Banned | `gap="px24"` |
| 449 | Primitive Spacing Banned | `gap="px24"` |
| 594 | Primitive Spacing Banned | `gap="px24"` |
| 811 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/HdsSystemDocLayout.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 25 | Manual Grid Layout | `display: 'grid'` |
| 55 | Manual Surface Styling | `<div className="hds-page-enter" style={{ marginTop: 0, paddingTop: 0 }}` |

### src/app/pages/hds/IconsPage.tsx

**Total violations: 4**

| Line | Rule | Issue |
|------|------|-------|
| 45 | Primitive Spacing Banned | `gap="px24"` |
| 75 | Primitive Spacing Banned | `gap="px24"` |
| 91 | Primitive Spacing Banned | `gap="px24"` |
| 108 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/LegacyTokenExplorerPanel.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 316 | Manual Grid Layout | `display: 'grid'` |
| 361 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/MotionPage.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 245 | Primitive Spacing Banned | `gap="px24"` |

### src/app/pages/hds/OverviewPage.tsx

**Total violations: 9**

| Line | Rule | Issue |
|------|------|-------|
| 246 | Manual Grid Layout | `display: 'grid'` |
| 255 | Manual Grid Layout | `display: 'grid'` |
| 359 | Manual Grid Layout | `display: 'grid'` |
| 401 | Manual Grid Layout | `display: 'grid'` |
| 447 | Manual Grid Layout | `display: 'grid'` |
| 458 | Manual Grid Layout | `display: 'grid'` |
| 483 | Manual Grid Layout | `display: 'grid'` |
| 558 | Manual Grid Layout | `display: 'grid'` |
| 610 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/PortfolioAssetSlot.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 96 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/PortfolioHomePage.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 86 | Primitive Spacing Banned | `gap="px96"` |
| 96 | Hardcoded maxWidth | `maxWidth: '660px'` |

### src/app/pages/hds/SandboxPage.tsx

**Total violations: 3**

| Line | Rule | Issue |
|------|------|-------|
| 92 | Primitive Spacing Banned | `gap="px16"` |
| 99 | Legacy Density Override | `gap="px8"` |
| 99 | Primitive Spacing Banned | `gap="px8"` |

### src/app/pages/hds/SpacingPage.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 72 | Manual Grid Layout | `display:       'grid'` |

### src/app/pages/hds/TokensPage.tsx

**Total violations: 4**

| Line | Rule | Issue |
|------|------|-------|
| 130 | Manual Surface Styling | `<div style={{ display: 'grid', gap: hds.semantic.space.component.padding, minWidth: 0 }}` |
| 130 | Manual Grid Layout | `display: 'grid'` |
| 158 | Manual Surface Styling | `<div style={{ display: 'grid', gap: hds.semantic.space.component.padding, minWidth: 0 }}` |
| 158 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/TypographyPage.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 284 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/VisualsPage.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 67 | Manual Grid Layout | `display: 'grid'` |
| 89 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/components/ComponentDocPageShell.tsx

**Total violations: 2**

| Line | Rule | Issue |
|------|------|-------|
| 54 | Primitive Spacing Banned | `gap="px24"` |
| 82 | Manual Grid Layout | `display: 'grid'` |

### src/app/pages/hds/components/IconGallery.tsx

**Total violations: 1**

| Line | Rule | Issue |
|------|------|-------|
| 137 | Manual Grid Layout | `display: 'grid'` |

