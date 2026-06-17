# HDS Compliance Log

Active docs and shell findings only.

Historical entries were moved to [`docs/archive/compliance/HDS_COMPLIANCE_HISTORY.md`](C:\Users\Adrian\Documents\New%20project\adrian-milsap\docs\archive\compliance\HDS_COMPLIANCE_HISTORY.md) so this file stays useful during launch work.

## Current Focus

- portfolio shell visual bugs
- foundations page standardization
- component docs presentation consistency

## Open Findings

### Shell

- [ ] Review left-nav hover, active, focus, and spacing states across desktop and mobile.
- [ ] Review shell chrome consistency: dividers, panel spacing, scrollbar treatment, modal alignment, and responsive edge cases.

### Foundations

- [ ] Typography, Color, Spacing, and Motion should follow a consistent section pattern where that improves readability.
- [ ] Token references should render through `<Token>` instead of raw code styling.
- [ ] Prefer generated token data over hardcoded arrays/constants when the source already exists.

### Components Docs

- [ ] Keep component sections visually consistent after the recent `ComponentBlock` simplification.
- [ ] Remove stale labels, duplicated framing, or inconsistent specimen spacing when found.

## Logging Rule

- Keep only current open findings here.
- Once a finding is fixed and no follow-up remains, move the historical note to archive instead of expanding this root file.
- If a finding becomes a real work item, mirror it in [`TASKS.md`](C:\Users\Adrian\Documents\New%20project\adrian-milsap\TASKS.md).
