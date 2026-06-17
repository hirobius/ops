# STANDARDS.md

Exception-only standards reference.

This file is no longer a broad pre-read. Open it only when:

- token naming is disputed
- component naming/category placement is disputed
- a structural change needs a quick consistency check

The full historical version lives at [`docs/archive/context/STANDARDS_FULL.md`](C:\Users\Adrian\Documents\adrian-milsap\docs\archive\context\STANDARDS_FULL.md).

## Keep These Intact

- token tiers stay `primitive -> semantic -> component`
- token JSON stays W3C/Figma compatible
- visual code consumes tokens, not hardcoded colors
- naming should follow common DS conventions before inventing project-specific terms

## Naming Baselines

Use industry defaults unless there is a strong reason not to.

| Type | Prefer | Avoid |
|---|---|---|
| icon-only action | `IconButton` | `ClickableIcon` |
| inline text link | `InlineLink` | `TextLink` |
| floating selection surface | `Popover` | `FloatingMenu` |
| destructive confirm modal | `AlertDialog` | `ConfirmModal` |
| slide-in panel | `Drawer` | `SlidePanel` |
| switch control | `Switch` | `Toggle` |

## Token Sanity Check

Before changing token structure or naming:

- keep raw values in `primitive.*`
- keep purpose aliases in `semantic.*`
- keep scoped usage in `component.*`
- do not add raw values to semantic/component color tokens
- update [`DESIGN.md`](C:\Users\Adrian\Documents\adrian-milsap\DESIGN.md) and [`DESIGN-HANDOFF.md`](C:\Users\Adrian\Documents\adrian-milsap\DESIGN-HANDOFF.md) if token-facing guidance changed
- run `pnpm tokens:verify`

## Finish Check

Before calling structural work done:

- update affected HDS docs in the same pass
- run `pnpm check:fast`
- if a rationale is worth preserving long-term, note it only if Adrian explicitly asks for archive/history capture
- [ ] If any doc page shows a visual example that no longer matches reality: fix the example
- [ ] The definition of done includes accurate documentation — "done but docs are stale" is not done

### Before removing a token

- [ ] Grep for `--the-var-name` in all `src/` — is it actually unused?
- [ ] Check `token-usage-map.json` for usage records
- [ ] If the removal needs durable rationale, note it in `TASKS.md`; only create a decision entry if Adrian explicitly asks
- [ ] Run `pnpm tokens:verify` after removal — broken references throw errors

### Before renaming a utility class

- [ ] Does the new name collide with a Tailwind v4 auto-generated class? (See `@theme inline {}` gotcha)
- [ ] Grep for all usages of the old name before renaming
- [ ] After renaming, move the definition outside `@layer base` if it matches a Tailwind color slot

---

## 7. WCAG 2.1 Quick Reference

Relevant contrast rules for this project:

| Rule | Requirement | Applies to |
|---|---|---|
| 1.4.3 (AA) | ≥4.5:1 for normal text, ≥3:1 for large text | All text in active UI |
| 1.4.6 (AAA) | ≥7:1 for normal text | Target for headings where feasible |
| 1.4.3 exception | No contrast requirement | **Disabled/inactive UI components** — this is why `text.disabled` uses neutral.400 |
| 1.4.11 (AA) | ≥3:1 for UI components and graphical objects | Borders, icons, input outlines |

**Key exception (§1.4.3):** "Text or images of text that are part of an inactive user interface component... have no contrast requirement." This covers disabled inputs, placeholder text, and inactive nav items in their resting state.

---

*Last updated: March 2026*
*Maintained by: Claude Code (auto-memory) + Adrian Milsap*
