# Token Migration Log

Track every renamed or removed token path here. Used by
`scripts/check-token-renames.mjs` to gate token-breaking changes in PR.

## Format

    semantic.old.path -> semantic.new.path     (renamed YYYY-MM-DD)
    primitive.dropped.thing -> removed          (removed YYYY-MM-DD, no replacement)

## Entries

component.button.fontSize -> removed      (removed 2026-05-02, superseded by component.button.size.{sm,md,lg}.fontSize; HdsButton uses Tailwind font-size classes, not this CSS var)
component.button.fontWeight -> removed    (removed 2026-05-02, superseded by component.button.size.{sm,md,lg} typography; HdsButton uses Tailwind font-medium class, not this CSS var)
component.button.minWidth -> removed      (removed 2026-05-02, no live source consumer; HdsButton uses Tailwind sizing classes, not this CSS var)
semantic.typography.small -> semantic.typography.ui        (renamed 2026-05-04)
semantic.typography.caption -> semantic.typography.eyebrow (renamed 2026-05-04)
