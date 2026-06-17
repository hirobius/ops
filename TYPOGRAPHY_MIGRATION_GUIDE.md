# Typography Refactor: Migration Guide

## Overview

**Old System:** 15 semantic typography styles  
**New System:** 8 functional typography roles + 1 special-case badge style  
**Goal:** Reduce cognitive load, eliminate false choices, and improve vertical rhythm breathability.

---

## The 8 Core Roles

| Role | Size | Weight | Use Case | Replaced |
|---|---|---|---|---|
| **display** | 48px | Bold | Hero headlines, landing pages | displayXl, display2 |
| **heading1** | 36px | Bold | Primary section headings | heading1 |
| **heading2** | 30px | Bold | Secondary section headings | heading2 |
| **heading3** | 24px | Semibold | Component headers, card titles | title, heading3 |
| **body** | 16px | Regular | Long-form prose, default text | body |
| **ui** | 14px | Regular | Sidebars, labels, tooltips, navigation | body2, caption, label |
| **technical** | 12px | Medium Mono | Code, tokens, metrics, state names | labelTechnical, monoSm, monoXs |
| **badge** | 10px | Medium | Status badges, tags (space-constrained) | micro |

---

## Migration Path by Old Style

### Headings & Display

- `displayXl` (80px) → **Delete.** Use `display` (48px) instead. 80px is unnecessarily large.
- `display2` (36px) → **Replace with** `heading1` (36px). Same size, clearer intent.
- `heading3` (20px) → **Replace with** `heading3` (24px). Moved up slightly; semibold instead of bold.

### Body Text

- `body` → **No change.** Line-height upgraded to `normal` (1.5) for breathability.
- `body2` → **Rename to** `ui`. Still 14px, but signals "interface text," not "secondary body."

### Interface Labels & Captions

- `label` (14px, medium) → **Replace with** `ui` (14px, regular). Labels in UI rarely need medium weight.
- `caption` (12px, medium) → **Replace with** `ui` (14px, regular). Bump up one size to improve readability in sidebars and metadata.
- `micro` (10px, medium) → **Move to** `badge` (10px, medium). Only use when space is severely constrained.

### Technical & Code

- `labelTechnical` (12px Mono, medium) → **Merge into** `technical` (12px Mono, medium). Same style, clearer name.
- `monoXs` (12px Mono, medium) → **Replace with** `technical` (12px Mono, medium).
- `monoSm` (14px Mono, medium) → **Replace with** `ui` (14px regular) OR `technical` (12px mono). 
  - If the text is *code or tokens*, use `technical`.
  - If the text is *interface copy in monospace context*, consider using `ui` instead (switch to primary font).

---

## Decision Trees for Developers

### "What typography should I use for this text?"

```
Is it a hero / landing-page headline?
├─ Yes → display (48px)
└─ No
   ├─ Is it a page section heading? → heading1 (36px)
   ├─ Is it a subsection heading? → heading2 (30px)
   ├─ Is it a component / card header? → heading3 (24px)
   ├─ Is it a paragraph or long-form text? → body (16px)
   └─ Is it UI copy (sidebar, nav, tooltip, label)?
      └─ Use ui (14px)
         └─ Space is severely constrained? → badge (10px)
         └─ Is this code or a token name? → technical (12px mono)
```

### "I'm building a component. What typography token should it use?"

| Component | Typical Tokens |
|---|---|
| Button labels | `ui` (14px) |
| Sidebar nav items | `ui` (14px) |
| Card headers | `heading3` (24px) |
| Form labels | `ui` (14px) |
| Tooltips | `ui` (14px) |
| Badges / status tags | `badge` (10px) if truly constrained; otherwise `ui` |
| Code blocks | `technical` (12px mono) |
| Token explorer | `technical` (12px mono) |
| Table row labels | `ui` (14px) |
| Page h1 | `heading1` (36px) |
| Page h2 | `heading2` (30px) |
| Page h3 | `heading3` (24px) |

---

## Line-Height Changes

All body and UI text now defaults to `lineHeight.normal` (1.5) for improved breathing room.

| Style | Old Line-Height | New Line-Height | Rationale |
|---|---|---|---|
| display | 1.0 | 1.0 | No change—large display text doesn't need extra breathing. |
| heading1 | 1.25 | 1.25 | No change—headings remain compact. |
| heading2 | 1.25 | 1.25 | No change. |
| heading3 | 1.5 | 1.5 | No change—already at normal. |
| body | 1.5 | 1.5 | No change—optimal for prose. |
| ui | 1.5 (body2) | 1.5 | **Upgraded from 1.25 (caption/label).** Improves readability in sidebars and UI. |
| technical | 1.0 | 1.0 | No change—code and tokens need compact lines. |
| badge | 1.0 | 1.0 | No change—minimal space required. |

---

## Spacing & Component Density

With improved line-heights, ensure component-level spacing uses a minimum `primitive.space.1` (4px) increment to avoid crowding.

**Example: Sidebar item spacing**

```tsx
// OLD (caption style, 1.25 line-height, felt cramped with 2px gap)
<div style={{ gap: "primitive.space.px2" }}>
  <Typography variant="caption">Item label</Typography>
</div>

// NEW (ui style, 1.5 line-height, breathing room built in)
<div style={{ gap: "primitive.space.1" }}>
  <Typography variant="ui">Item label</Typography>
</div>
```

---

## Removed Styles (Not Migrating)

These styles are **deleted entirely**. Do not add new uses of them:

- `displayXl` — consolidated into `display`
- `display2` — consolidated into `heading1`
- `heading3` (old 20px) — consolidated into `heading3` (new 24px)
- `caption` — absorbed into `ui`
- `label` — absorbed into `ui`
- `micro` — moved to `badge` (minimal use)
- `labelTechnical` — merged into `technical`
- `monoXs` — merged into `technical`
- `monoSm` — split between `ui` and `technical`

---

## Implementation Checklist

- [ ] Update `hirobius.tokens.json`: Replace `semantic.typography` block with the consolidated 8 styles.
- [ ] Audit all component code for old style names and replace:
  - Search `caption` → replace with `ui`
  - Search `label` (as a typography variant) → replace with `ui`
  - Search `labelTechnical` → replace with `technical`
  - Search `monoSm` → replace with `technical` or `ui` (context-dependent)
  - Search `micro` → replace with `badge` or `ui`
- [ ] Update `DESIGN.md` and `DESIGN-HANDOFF.md` to reflect the new 8-style system.
- [ ] Update Figma typography styles to match the 8-role system.
- [ ] Test responsive `clamp()` overrides in `src/styles/theme.css` to ensure new sizes respond correctly.
- [ ] Run `pnpm manifest:generate` to regenerate docs and ensure component prop tables reflect the new typography tokens.
- [ ] Audit HDS component docs pages (TypographyPage, ColorPage, etc.) for stale references.

---

## FAQ

**Q: Can I use `body` for UI text?**  
A: No. `body` (16px) is for prose and long-form content. UI text uses `ui` (14px).

**Q: What if I need a size between `ui` (14px) and `heading3` (24px)?**  
A: The system intentionally removed intermediate sizes to reduce decision fatigue. If you truly need a mid-range size, use `heading3` (24px) with `fontWeight.regular` (instead of semibold) to lighten its visual weight. Do not add a new typography style.

**Q: Should badges always use the `badge` style?**  
A: Only if space is severely constrained (e.g., a tiny status indicator). Most badges can use `ui` (14px) and still fit comfortably. `badge` (10px) is a last resort.

**Q: My component currently uses `monoSm` for a label. What do I do?**  
A: Depends on context:
  - If the label is *code or a token name*, use `technical` (12px mono).
  - If the label is *regular interface text*, use `ui` (14px primary font).

**Q: Do all headings have to use the new sizes?**  
A: Yes, for consistency. If your current design uses a 20px heading, bump it to `heading3` (24px) or drop it to `ui` (14px) depending on hierarchy.

**Q: Where do I find the old line-height values?**  
A: They're still in `primitive.typography.lineHeight`. The refactor only changes *which* styles use which line-heights. Primitives remain stable.

---

## Next Steps

1. **Review this guide** with the team and flag any context-specific concerns.
2. **Merge the refactored token structure** into `hirobius.tokens.json`.
3. **Run the migration** across the codebase (use your IDE's find-and-replace for old style names).
4. **Visual QA** across key pages (shell, HDS docs, portfolio cards) to ensure the new spacing feels right.
5. **Update documentation** (DESIGN.md, component docs, Figma styles).

---

## Rationale

This consolidation was driven by:

- **Cognitive Load:** 15 choices → 8 roles means easier decisions on what to use.
- **False Choices:** `caption`, `label`, and `body2` were nearly identical (14px, medium/regular weight). Merged into `ui`.
- **Vertical Rhythm:** Upgrading default line-heights from 1.25 to 1.5 for body and UI text opens up the visual density and improves readability.
- **Hierarchy Clarity:** Removing intermediate sizes (displayXl, display2, heading3 old) forces intentional choices: headings are headings, body is body, UI is UI.
- **Maintainability:** Fewer styles = fewer tokens to sync with Figma, fewer theme overrides, and clearer design intent.
