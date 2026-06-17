# HDS Recipes

Before generating layouts, check `src/app/components/` and `system.manifest.json` first to confirm the component exists and to verify its prop API. Strictly map to these wrappers/gaps only after inventory is confirmed.

If the component does not exist, follow the incubation protocol in `CLAUDE.md` before drafting anything new.

If a requested UI matches one of these patterns, the AI must strictly map the requested UI to the wrappers, gaps, and tokens defined here. Do not invent alternate wrappers, spacing values, divider treatments, or typography roles.

## Data Table / List View

Use for user lists, directories, token tables, audit rows, and any repeated tabular content.

Required structure:

```tsx
<HdsCard padding="none">
  <HdsStack
    direction="row"
    gap="px16"
    style={{
      padding: hds.space.px16,
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
      alignItems: 'center',
    }}
  >
    {/* Header cells: ui typography, content-secondary, semibold */}
  </HdsStack>

  {rows.map((row) => (
    <HdsStack
      key={row.id}
      direction="row"
      gap="px16"
      style={{
        padding: hds.space.px16,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto',
        alignItems: 'center',
      }}
    >
      {/* Row cells: body or technical typography */}
    </HdsStack>
  ))}
</HdsCard>
```

Rules:

- Container padding must be `none`; rows own internal padding.
- Columns must be fluid: use `minmax(0, 1fr)`, `auto`, or tokenized width constraints.
- Header and row gaps must be `px16`.
- Row padding must be `hds.space.px16`.
- Do not use `<HdsDivider>` or vertical dividers.
- Use hover state only through tokenized surface, border, or content colors.
- Wrap compound cell text in `<HdsStack direction="column" gap="px8">`.

## Modal / Dialog

Use for confirmations, edit forms, focused workflows, sheets with blocking context, and decision prompts.

Required structure:

```tsx
<HdsCard
  padding="none"
  style={{
    width: '100%',
    maxWidth: 'var(--semantic-layout-content-maxWidth)',
    maxHeight: 'min(720px, calc(100vh - var(--semantic-space-layout-gap)))',
    overflow: 'hidden',
  }}
>
  <HdsStack direction="row" align="center" justify="space-between" gap="px16" style={{ padding: hds.space.px24 }}>
    {/* heading2 title + close/action */}
  </HdsStack>

  <HdsStack direction="column" gap="px16" style={{ padding: hds.space.px24, overflowY: 'auto' }}>
    {/* body content only. This is the only scroll container. */}
  </HdsStack>

  <HdsStack direction="row" gap="px16" justify="flex-end" style={{ padding: hds.space.px24 }}>
    {/* footer actions */}
  </HdsStack>
</HdsCard>
```

Rules:

- Dialog max-width must use `var(--semantic-layout-content-maxWidth)`.
- Dialog root may hide overflow; only the body may scroll.
- Header, body, and footer padding must be `hds.space.px24`.
- Body and footer gaps must be `px16`.
- Use `heading2` for title, `body` for body copy, `ui` for field labels, and `caption` for helper or metadata text.
- Do not apply hardcoded pixel widths except tokenized max-width variables.

## Dashboard Card / Metric Widget

Use for metrics, status cards, analytics summaries, health panels, and compact operational widgets.

Required structure:

```tsx
<HdsCard padding="px24">
  <HdsStack direction="column" gap="px16">
    <HdsStack direction="row" align="flex-start" justify="space-between" gap="px16">
      {/* heading3 title + optional icon/action */}
    </HdsStack>

    <HdsStack direction="row" align="baseline" gap="px8">
      {/* display metric + ui unit/label */}
    </HdsStack>

    <HdsStack direction="column" gap="px8">
      {/* body summary, caption metadata, or badge trend */}
    </HdsStack>
  </HdsStack>
</HdsCard>
```

Rules:

- Card padding must be `px24` so it resolves to 24px.
- Primary internal stack gap must be `px16`.
- Metric value and unit gap must be `px8`.
- Metric value uses `display` or `heading1` depending on density.
- Labels and supporting copy use `ui`, `body`, or `caption`.
- Tags, categories, and relative timestamps use `ui` or `caption`, not `technical`.
- Use `badge` only for actual status chips.
- Do not use shadow unless using a named semantic shadow token; prefer borders.

## Activity Feed

Use for timelines, event streams, audit trails, updates, comments, and user activity.

Required structure:

```tsx
<HdsStack direction="column" gap="px48">
  {events.map((event) => (
    <HdsStack key={event.id} direction="row" align="flex-start" gap="px16">
      {/* Avatar, icon, or status marker */}

      <HdsStack direction="column" gap="px8" style={{ flex: 1, minWidth: 0 }}>
        <HdsStack direction="column" gap="px8">
          {/* title, actor, timestamp, metadata */}
        </HdsStack>

        {/* body copy, attachments, actions */}
      </HdsStack>
    </HdsStack>
  ))}
</HdsStack>
```

Rules:

- Feed item gap must be 48px. Use `gap="px48"` or `hds.semantic.space.layout.gap`.
- Do not use `<HdsDivider>`, border separators, or timeline rules for item separation.
- Each item must use an outer row with `gap="px16"`.
- Multi-line content must live in an inner vertical stack with `flex: 1` and `minWidth: 0`.
- Metadata clusters use `direction="row"` with `gap="px8"` only when they are tightly coupled.
- Body copy uses `body`; tags, categories, and relative timestamps use `ui` or `caption`.
- Reserve `technical` strictly for code/data payloads such as hashes, IDs, and exact readouts.

## Compound Text Block (Avatar + Title + Meta)

Use for feed items, list rows, search results, notification entries, and any pattern that pairs
a leading visual (avatar, icon, status dot) with stacked text.

Required structure:

```tsx
// Outer row: leading visual beside the content column
<div style={{
  display: 'flex',
  flexDirection: 'row',
  alignItems: 'flex-start',
  gap: hds.semantic.space.component.gap,      // 16px — avatar ↔ content
}}>

  {/* Leading visual — fixed size, never grows */}
  <img
    src={avatarUrl}
    alt=""
    aria-hidden="true"
    style={{
      width: 40, height: 40,
      borderRadius: hds.borderRadius.full,
      flexShrink: 0,
      marginTop: hds.semantic.space.subgrid.hairline, // 2px optical cap-height alignment
    }}
  />

  {/* Content column — fills remaining width */}
  <div style={{
    display: 'flex',
    flexDirection: 'column',
    gap: hds.semantic.space.subgrid.gap,        // 4px between title / action / meta
    flex: 1,
    minWidth: 0,                                // prevents flex overflow on long strings
  }}>
    <span style={{ ...hds.typeStyles.ui, fontWeight: 600, color: 'var(--semantic-color-content-primary)' }}>
      {name}
    </span>
    <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)' }}>
      {action}
    </span>
    <span style={{ ...hds.typeStyles.caption, color: 'var(--semantic-color-content-secondary)' }}>
      {timestamp}
    </span>
  </div>
</div>
```

Rules:

- The content column must always be `direction="column"`. Never render title/action/meta inline.
- `flex: 1` + `minWidth: 0` on the inner column are both required — omitting either causes overflow.
- Gap between lines within the content block: 4px (`subgrid.gap`) — they are tightly coupled.
- Gap between the avatar and content: 16px (`component.gap`) — they are distinct elements.
- `marginTop: 2px` on the leading visual aligns it to the cap-height of the first text line.
- For icon (not avatar): omit `borderRadius`; keep `flexShrink: 0` and the 2px margin nudge.

## Standard Form (8px label↔input · 24px group separation)

Use for settings panels, create/edit dialogs, onboarding flows, filter drawers, and any
collection of labeled inputs.

> Base-primitive fallback only. Use this pattern only when you are authoring a primitive or an incubated draft; do not copy it into ordinary app code when HdsInput, HdsSelect, HdsButton, and other inventory components exist.

Required structure:

```tsx
<form
  style={{
    display: 'flex',
    flexDirection: 'column',
    gap: hds.space.px24,                       // 24px between every form group
    padding: hds.semantic.space.component.padding,
    border: '1px solid var(--semantic-color-border-default)',
    borderRadius: hds.borderRadius[8],
    maxWidth: 560,
  }}
>
  {/* ── Text input group ──────────────────────────────────────── */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: hds.semantic.space.component.gap }}>
    <label htmlFor="field-id" style={{ ...hds.typeStyles.ui, fontWeight: 500, color: 'var(--semantic-color-content-primary)' }}>
      Field label
    </label>
    <input id="field-id" type="text" style={{ padding: '8px 12px', border: '1px solid var(--semantic-color-border-default)', borderRadius: hds.borderRadius.action, ...hds.typeStyles.ui, backgroundColor: 'var(--semantic-color-surface-page)', color: 'var(--semantic-color-content-primary)', width: '100%', boxSizing: 'border-box' }} />
    <span style={{ ...hds.typeStyles.caption, fontWeight: 400, color: 'var(--semantic-color-content-secondary)' }}>
      Hint text — still inside the group at 8px.
    </span>
  </div>

  {/* ── Group with validation error ───────────────────────────── */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: hds.semantic.space.component.gap }}>
    <label htmlFor="email" style={{ ...hds.typeStyles.ui, fontWeight: 500, color: 'var(--semantic-color-content-primary)' }}>
      Email address
    </label>
    <input id="email" type="email" aria-invalid="true" aria-describedby="email-error"
      style={{ padding: '8px 12px', border: '1px solid var(--semantic-color-feedback-error)', borderRadius: hds.borderRadius.action, ...hds.typeStyles.ui, backgroundColor: 'var(--semantic-color-surface-page)', color: 'var(--semantic-color-content-primary)', width: '100%', boxSizing: 'border-box' }} />
    <span id="email-error" role="alert" style={{ ...hds.typeStyles.caption, fontWeight: 500, color: 'var(--semantic-color-feedback-error)' }}>
      Enter a valid email address.
    </span>
  </div>

  {/* ── Select group ──────────────────────────────────────────── */}
  <div style={{ display: 'flex', flexDirection: 'column', gap: hds.semantic.space.component.gap }}>
    <label htmlFor="select-id" style={{ ...hds.typeStyles.ui, fontWeight: 500, color: 'var(--semantic-color-content-primary)' }}>
      Select label
    </label>
    <select id="select-id" style={{ padding: '8px 12px', border: '1px solid var(--semantic-color-border-default)', borderRadius: hds.borderRadius.action, ...hds.typeStyles.ui, backgroundColor: 'var(--semantic-color-surface-page)', color: 'var(--semantic-color-content-primary)', width: '100%', cursor: 'pointer' }}>
      <option value="a">Option A</option>
      <option value="b">Option B</option>
    </select>
  </div>

  {/* ── Checkbox group ────────────────────────────────────────── */}
  <fieldset style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: hds.semantic.space.component.gap }}>
    <legend style={{ ...hds.typeStyles.ui, fontWeight: 500, color: 'var(--semantic-color-content-primary)', marginBottom: hds.semantic.space.component.gap }}>
      Checkbox group label
    </legend>
    {options.map(({ id, label }) => (
      <label key={id} htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', ...hds.typeStyles.ui, fontWeight: 500, color: 'var(--semantic-color-content-primary)' }}>
        <input id={id} type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--semantic-accent-rest)', flexShrink: 0 }} />
        {label}
      </label>
    ))}
  </fieldset>

  {/* ── Footer actions ────────────────────────────────────────── */}
  <div style={{ display: 'flex', gap: hds.semantic.space.component.gap }}>
    <button type="submit" style={{ padding: '8px 20px', backgroundColor: 'var(--semantic-accent-rest)', color: '#fff', border: 'none', borderRadius: hds.borderRadius.action, ...hds.typeStyles.ui, fontWeight: 600, cursor: 'pointer' }}>
      Save changes
    </button>
    <button type="button" style={{ padding: '8px 20px', backgroundColor: 'transparent', color: 'var(--semantic-color-content-primary)', border: '1px solid var(--semantic-color-border-default)', borderRadius: hds.borderRadius.action, ...hds.typeStyles.ui, cursor: 'pointer' }}>
      Cancel
    </button>
  </div>
</form>
```

Rules:

- Top-level form gap: always 24px (`component.padding`) — separates distinct groups.
- Within each group (label + input + hint/error): always 8px (`component.gap`).
- Validation error: use `var(--semantic-color-feedback-error)` + `aria-invalid="true"` + `role="alert"`.
- Checkbox/radio groups use `<fieldset>`/`<legend>` for proper screen-reader semantics.
- Never use `<HdsDivider>` between form groups — 24px gap is the separator.
- All labels use `ui` token, `fontWeight: 500`, `content-primary` color.
- Input border-radius always `hds.borderRadius.action` (4px).

## Form Group Architecture

Use this exact nesting pattern whenever a form feels like a flat list:

```tsx
<HdsStack as="form" direction="column" gap="px24" style={{ width: '100%' }}>
  <HdsStack direction="column" gap="px8">
    <Text variant="ui" weight="500" color="content-primary">Display name</Text>
    <Input placeholder="e.g. Adrian Milsap" />
    <Text variant="caption" weight="500" color="feedback-error">Display name is required.</Text>
  </HdsStack>

  <HdsStack direction="column" gap="px8">
    <Text variant="ui" weight="500" color="content-primary">Default theme</Text>
    <Select />
    <Text variant="caption" weight="400" color="content-secondary">Follows your OS setting when "System default" is selected.</Text>
  </HdsStack>

  <HdsStack direction="column" gap="px8">
    <Text variant="ui" weight="500" color="content-primary">Notifications</Text>
    <HdsStack direction="column" gap="px8">
      {/* checkbox rows */}
    </HdsStack>
  </HdsStack>

  <HdsStack direction="row" gap="px16" justify="flex-start" align="center">
    <HdsButton variant="primary" size="md">Save preferences</HdsButton>
    <HdsButton variant="secondary" size="md">Cancel</HdsButton>
  </HdsStack>
</HdsStack>
```

Rules:

- The outer form stack is always `direction="column"` with `gap="px24"`.
- Every field group is its own `direction="column"` stack with `gap="px8"`.
- Action rows are always `direction="row"` with `gap="px16"`, `justify="flex-start"`, and `align="center"`.
- Never collapse the groups into one vertical list without nested wrappers.
- Use `caption` for helper/error metadata and `ui` for group labels.

## Responsive Card Grid (auto-fit, no fixed column counts)

Use for metric dashboards, component galleries, feature grids, and any collection of
equally-weighted repeated cards.

Required structure:

```tsx
// Grid container — collapses to 1 column automatically, no media queries
<div style={{
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(300px, 100%), 1fr))',
  gap: hds.semantic.space.component.gap,       // 16px between cards
}}>
  {items.map((item) => (
    <div
      key={item.id}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: hds.semantic.space.subgrid.gap,   // 4px between card internals
        padding: hds.semantic.space.component.padding, // 24px card padding
        border: '1px solid var(--semantic-color-border-default)',
        borderRadius: hds.borderRadius[8],
        backgroundColor: 'var(--semantic-color-surface-raised)',
      }}
    >
      {/* heading3 or ui label */}
      <span style={{ ...hds.typeStyles.ui, color: 'var(--semantic-color-content-secondary)', fontWeight: 600 }}>
        {item.label}
      </span>

      {/* Primary metric — display-scale */}
      <span style={{ fontSize: '2.5rem', fontWeight: 700, lineHeight: 1, color: 'var(--semantic-color-content-primary)' }}>
        {item.value}
      </span>

      {/* Delta / description — technical, monospace */}
      <span style={{ ...hds.typeStyles.technical, fontFamily: 'monospace', color: item.positive ? 'var(--semantic-color-feedback-success)' : 'var(--semantic-color-feedback-error)' }}>
        {item.delta}
      </span>
    </div>
  ))}
</div>

// Shorthand: use the CSS class instead of the inline grid-template-columns declaration
// <div className="hds-grid-auto" style={{ gap: hds.semantic.space.component.gap }}>
```

Rules:

- Never hardcode `repeat(3, 1fr)` or any fixed column count. Always use `auto-fit`.
- `min(300px, 100%)` prevents overflow when the container is narrower than 300px.
- Use `className="hds-grid-auto"` as shorthand — resolves to the same `auto-fit` declaration.
- Gap between cards: always 16px (`component.gap`) — not layout gap (48px).
- Card internal gap: 4px (`subgrid.gap`) for tightly related label/value pairs within one card.
- Card padding: always 24px (`component.padding`).
- No `box-shadow` unless using a named token. Use `border: 1px solid border-default` instead.

## Form Typography Hierarchy

Use within any form, settings panel, or dialog. These are the only three roles for form metadata text. Do not invent new sizes, weights, or colors.

| Role | Token | Weight | Color token | When to use |
|---|---|---|---|---|
| Label | `ui` (14px / 1.5) | `500` (Medium) | `content-primary` | Field labels, fieldset legends, checkbox group headings |
| Helper text | `caption` (12px / 1.5) | `400` (Regular) | `content-secondary` | Hints, descriptions, contextual guidance below an input |
| Error text | `caption` (12px / 1.5) | `500` (Medium) | `feedback-error` | Validation messages — always paired with `aria-invalid="true"` and `role="alert"` |

Form hierarchy is expressed through `ui` for labels and `caption` for helper/error metadata. The distinction comes through **weight and color only** — never font size.

```tsx
{/* Label */}
<label style={{ ...hds.typeStyles.ui, fontWeight: 500, color: 'var(--semantic-color-content-primary)' }}>
  Display name
</label>

{/* Helper text */}
<span style={{ ...hds.typeStyles.caption, fontWeight: 400, color: 'var(--semantic-color-content-secondary)' }}>
  Follows your OS setting when "System default" is selected.
</span>

{/* Error text */}
<span id="field-error" role="alert" style={{ ...hds.typeStyles.caption, fontWeight: 500, color: 'var(--semantic-color-feedback-error)' }}>
  Display name is required.
</span>
```

Rules:

- Never use `technical` (12px) or `badge` (10px) for any form metadata.
- Labels stay on `ui` with `fontWeight: 500` and `content-primary`.
- Helper and error text move to `caption`; helper text uses `400`, error text uses `500`.

## Ingestion Checklist

When a draft component proves useful enough to keep:

1. Move it to `src/app/components/`.
2. Replace hardcoded values with semantic tokens from `hirobius.tokens.json`.
3. Document the API in `system.manifest.json`.
- Checkbox option labels use `ui + weight:500 + content-primary` so they read as labels, not values.

## Quick Reference — Gap Tiers

| Context | Token | Value | When to use |
|---|---|---|---|
| Between text lines within one block | `subgrid.gap` | 4px | Title + subtitle, label + value in same card |
| Label ↔ input (same form group) | `component.gap` | 8px | Label, input, hint/error are one unit |
| Between form groups | `component.padding` | 24px | Distinct labeled fields |
| Between grid cards | `component.gap` | 16px | Repeated card items in a grid |
| Avatar ↔ content column | `component.gap` | 16px | Leading visual + text block |
| Card internal padding | `component.padding` | 24px | All card/container surfaces |
| Between page sections | `layout.gap` | 48px | Major content blocks on a page |
| Between feed items | `layout.gap` | 48px | Activity/timeline item separation |
