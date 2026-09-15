# Component Doc Page Format Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all six HDS component doc pages to match the ActionsPage format exactly.

**Architecture:** Each page is an independent file edit — no shared components change. Simple pages (Navigation, Layout, Inputs, DocUtilities) get flag additions and minor cleanup. Complex pages (Feedback, Display) get a full structural migration from `DocSection`+`HdsComponentDoc` to `configs`+`CategoryComponentDocs`.

**Tech Stack:** React, TypeScript, `CategoryComponentDocs`, `ComponentDocPageShell`, `VariantStrip`, `DemoBlock`, `Stack`

---

### Task 1: NavigationPage — add three flags

**Files:**
- Modify: `src/app/pages/hds/components/NavigationPage.tsx`

- [ ] **Edit `CategoryComponentDocs` to add the three flags**

Replace:
```tsx
      <CategoryComponentDocs
        category="Navigation"
        isDark={isDark}
        preferredOrder={['NavGroup', 'NavItem', 'DocLinkCard', 'InlineLink']}
      />
```
With:
```tsx
      <CategoryComponentDocs
        category="Navigation"
        isDark={isDark}
        preferredOrder={['NavGroup', 'NavItem', 'DocLinkCard', 'InlineLink']}
        hideDetails
        hideVariantDeck
        hideHero
      />
```

- [ ] **Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/app/pages/hds/components/NavigationPage.tsx
git commit -m "style(hds-docs): standardize NavigationPage to Actions format"
```

---

### Task 2: LayoutPage — add three flags + fix blank line

**Files:**
- Modify: `src/app/pages/hds/components/LayoutPage.tsx`

- [ ] **Add blank line between last import and `export default`, add three flags**

Replace the entire file with:
```tsx
/**
 * LayoutPage - /hds/components/layout
 *
 * Components: Disclosure, Divider, Stack
 * Category validated against: Ant Design (Layout > Divider), Chakra UI (Layout > Stack/Divider),
 * Radix UI (Separator, Flex, Accordion) - structural layout primitives that define spatial
 * relationships between content regions or govern the reveal of optional supporting content
 * are grouped under "Layout".
 */

import { useTheme } from '../../../context/ThemeContext';
import { CategoryComponentDocs } from '../../../components/CategoryComponentDocs';
import { ComponentDocPageShell } from './ComponentDocPageShell';

export default function LayoutPage() {
  const { isDark } = useTheme();

  return (
    <ComponentDocPageShell
      title="Layout"
      isDark={isDark}
      intro="Structural primitives that define spatial relationships."
    >
        <CategoryComponentDocs
          category="Layout"
          isDark={isDark}
          preferredOrder={['Disclosure', 'Stack', 'Divider']}
          hideDetails
          hideVariantDeck
          hideHero
        />
    </ComponentDocPageShell>
  );
}
```

- [ ] **Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/app/pages/hds/components/LayoutPage.tsx
git commit -m "style(hds-docs): standardize LayoutPage to Actions format"
```

---

### Task 3: InputsPage — add three flags + fix satisfies type

**Files:**
- Modify: `src/app/pages/hds/components/InputsPage.tsx`

- [ ] **Fix the `satisfies` type**

Replace:
```tsx
  } satisfies Record<string, { matrix?: ReactNode }>;
```
With:
```tsx
  } satisfies Record<string, { matrix?: ReactNode; children?: ReactNode }>;
```

- [ ] **Add three flags to `CategoryComponentDocs`**

Replace:
```tsx
        <CategoryComponentDocs
          category="Inputs"
          isDark={isDark}
          preferredOrder={['Input', 'HdsSlider', 'HdsRadio', 'HdsToggle', 'SegmentedControl', 'StepperField', 'HdsSelect', 'Tag']}
          configs={configs}
        />
```
With:
```tsx
        <CategoryComponentDocs
          category="Inputs"
          isDark={isDark}
          preferredOrder={['Input', 'HdsSlider', 'HdsRadio', 'HdsToggle', 'SegmentedControl', 'StepperField', 'HdsSelect', 'Tag']}
          configs={configs}
          hideDetails
          hideVariantDeck
          hideHero
        />
```

- [ ] **Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/app/pages/hds/components/InputsPage.tsx
git commit -m "style(hds-docs): standardize InputsPage to Actions format"
```

---

### Task 4: DocUtilitiesPage — add JSDoc, flatten sections, add flags

**Files:**
- Modify: `src/app/pages/hds/components/DocUtilitiesPage.tsx`

- [ ] **Replace entire file**

```tsx
/**
 * DocUtilitiesPage - /hds/components/utilities
 *
 * Components: FoundationSwatch, MobiusLogo, CinematicLink, InfoPage,
 *   LegacyTokenDetail, LegacyTokenList, TokenCollectionList, TokenDetail
 * Category validated against: Material Design (Utilities), Ant Design (Other),
 * Chakra UI (Other) - storefront infrastructure, brand primitives, and token
 * governance helpers are grouped as maintenance utilities separate from product components.
 */

import { useTheme } from '../../../context/ThemeContext';
import { CategoryComponentDocs } from '../../../components/CategoryComponentDocs';
import { ComponentDocPageShell } from './ComponentDocPageShell';

export default function DocUtilitiesPage() {
  const { isDark } = useTheme();

  return (
    <ComponentDocPageShell
      title="Utilities"
      isDark={isDark}
      intro="Manifest-backed utilities and branding surfaces on one page."
    >
        <CategoryComponentDocs
          category="Utilities"
          isDark={isDark}
          preferredOrder={['FoundationSwatch']}
          defaultLayout="utility"
          hideDetails
          hideVariantDeck
          hideHero
        />
        <CategoryComponentDocs
          category="Branding"
          isDark={isDark}
          preferredOrder={['MobiusLogo', 'CinematicLink', 'InfoPage']}
          defaultLayout="utility"
          hideDetails
          hideVariantDeck
          hideHero
        />
        <CategoryComponentDocs
          category="Lab"
          isDark={isDark}
          preferredOrder={['LegacyTokenDetail', 'LegacyTokenList', 'TokenCollectionList', 'TokenDetail']}
          defaultLayout="utility"
          hideDetails
          hideVariantDeck
          hideHero
        />
    </ComponentDocPageShell>
  );
}
```

- [ ] **Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/app/pages/hds/components/DocUtilitiesPage.tsx
git commit -m "style(hds-docs): standardize DocUtilitiesPage to Actions format"
```

---

### Task 5: FeedbackPage — full migration to configs + CategoryComponentDocs

**Files:**
- Modify: `src/app/pages/hds/components/FeedbackPage.tsx`

- [ ] **Replace entire file**

```tsx
/**
 * FeedbackPage - /hds/components/feedback
 *
 * Components: Alert, Badge, Callout, ErrorPattern, NotFoundPattern
 * Category validated against: Material Design (Snackbar, Banner), Ant Design (Alert, Message),
 * Chakra UI (Alert, Toast) - components whose primary purpose is communicating system
 * or editorial status are consistently separated from passive display primitives.
 */

import { type ReactNode } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { CategoryComponentDocs } from '../../../components/CategoryComponentDocs';
import { Badge } from '../../../components/badge';
import { Callout } from '../../../components/callout';
import { VariantStrip } from '../../../components/variant-strip';
import { ComponentDocPageShell } from './ComponentDocPageShell';

export default function FeedbackPage() {
  const { isDark } = useTheme();

  const configs = {
    Badge: {
      matrix: (
        <VariantStrip
          label="Tones"
          variants={[
            { label: 'Neutral', node: <Badge tone="neutral">Neutral</Badge> },
            { label: 'Info',    node: <Badge tone="info">Info</Badge> },
            { label: 'Success', node: <Badge tone="success">Success</Badge> },
            { label: 'Warning', node: <Badge tone="warning">Warning</Badge> },
            { label: 'Danger',  node: <Badge tone="danger">Danger</Badge> },
          ]}
        />
      ),
    },
    Callout: {
      matrix: (
        <VariantStrip
          label="Tones"
          variants={[
            { label: 'Accent',  node: <Callout tone="accent">Pull-quotes and hypotheses.</Callout> },
            { label: 'Info',    node: <Callout tone="info">Background context.</Callout> },
            { label: 'Success', node: <Callout tone="success">All-clear confirmations.</Callout> },
            { label: 'Warning', node: <Callout tone="warning">Caution, not blocking.</Callout> },
            { label: 'Danger',  node: <Callout tone="danger">Blockers and failed states.</Callout> },
          ]}
        />
      ),
    },
  } satisfies Record<string, { matrix?: ReactNode; children?: ReactNode }>;

  return (
    <ComponentDocPageShell
      title="Feedback"
      isDark={isDark}
      intro="Components that communicate system state or editorial context."
    >
        <CategoryComponentDocs
          category="Feedback"
          isDark={isDark}
          preferredOrder={['Badge', 'Alert', 'Callout', 'ErrorPattern', 'NotFoundPattern']}
          configs={configs}
          hideDetails
          hideVariantDeck
          hideHero
        />
    </ComponentDocPageShell>
  );
}
```

- [ ] **Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/app/pages/hds/components/FeedbackPage.tsx
git commit -m "style(hds-docs): standardize FeedbackPage to Actions format"
```

---

### Task 6: DisplayPage — full migration to configs + CategoryComponentDocs

**Files:**
- Modify: `src/app/pages/hds/components/DisplayPage.tsx`

- [ ] **Replace entire file**

```tsx
/**
 * DisplayPage - /hds/components/display
 *
 * Components: Icon, TextLockup, Table, InlineCode, CodeBlock, Token, Stat, Field, StatusListItem, AssetImg, EmptyState, StatusTile, PhaseHeader, AgentTag
 * Category validated against: Ant Design (Data Display), Chakra UI (Data Display),
 * Radix UI (Card) - non-interactive components that present information
 * are grouped under "Display" or "Data Display".
 */

import { type ReactNode } from 'react';
import { useTheme } from '../../../context/ThemeContext';
import { CategoryComponentDocs } from '../../../components/CategoryComponentDocs';
import { TextLockup } from '../../../components/text-lockup';
import { Surface } from '../../../components/surface';
import { Badge } from '../../../components/badge';
import { VariantStrip } from '../../../components/variant-strip';
import { Stat } from '../../../components/stat';
import { Field } from '../../../components/field';
import { StatusListItem } from '../../../components/status-list-item';
import { AgentTag } from '../../../components/agent-tag';
import { EmptyState } from '../../../components/empty-state';
import { PhaseHeader } from '../../../components/phase-header';
import { StatusTile } from '../../../components/status-tile';
import { IconGallery } from './IconGallery';
import { ComponentDocPageShell } from './ComponentDocPageShell';

export default function DisplayPage() {
  const { isDark } = useTheme();

  const configs = {
    Icon: {
      matrix: (
        <Surface padding="component">
          <TextLockup
            size="section"
            title="Icon Registry"
            titleAs="h3"
          />
          <IconGallery />
        </Surface>
      ),
    },
    Stat: {
      matrix: (
        <VariantStrip
          label="Tones"
          variants={[
            { label: 'Default',  node: <Stat label="Open tasks" value="14" /> },
            { label: 'Success',  node: <Stat label="Done"       value="42" tone="success" /> },
            { label: 'Warning',  node: <Stat label="At risk"    value="3"  tone="warning" /> },
            { label: 'Danger',   node: <Stat label="Blockers"   value="2"  tone="danger" /> },
            { label: 'With sub', node: <Stat label="Retainer"   value="$1,500" sub="agreed-verbal" /> },
          ]}
        />
      ),
    },
    Field: {
      matrix: (
        <VariantStrip
          label="Variants"
          variants={[
            { label: 'Default',  node: <Field label="Source"         value="docs/ai/orchestration.json" /> },
            { label: 'Mono',     node: <Field label="Validation cmd" value="pnpm typecheck" mono /> },
            { label: 'Success',  node: <Field label="Outcome"        value="success" tone="success" /> },
            { label: 'Children', node: <Field label="Inputs"><span className="font-mono text-xs">{'src/app/components/*'}</span></Field> },
          ]}
        />
      ),
    },
    StatusListItem: {
      matrix: (
        <VariantStrip
          label="Tones"
          variants={[
            { label: 'Neutral', node: <StatusListItem tone="neutral" title="Draft retainer scope" notes={['Owner: Adrian']} /> },
            { label: 'Info',    node: <StatusListItem tone="info"    title="Evaluating EZLynx API" /> },
            { label: 'Warning', node: <StatusListItem tone="warning" title="Lead intake automation" notes={['In progress']} /> },
            { label: 'Success', node: <StatusListItem tone="success" title="Brand audit delivered" /> },
            { label: 'Danger',  node: <StatusListItem tone="danger"  title="EZLynx login pending" notes={['Blocked: credentials missing']} trailing={<Badge tone="danger">Blocked</Badge>} /> },
          ]}
        />
      ),
    },
    EmptyState: {
      matrix: (
        <VariantStrip
          label="Variants"
          variants={[
            { label: 'Title only',       node: <EmptyState title="No tasks scoped yet" /> },
            { label: 'With description', node: <EmptyState title="No automations scaffolded" description="Add a workflow to get started." /> },
          ]}
        />
      ),
    },
    StatusTile: {
      matrix: (
        <VariantStrip
          label="Tones"
          variants={[
            { label: 'Neutral',      node: <StatusTile title="Brand audit delivered" notes={['Owner: Adrian']} /> },
            { label: 'With trailing', node: <StatusTile title="EZLynx login pending" notes={['Blocked: credentials missing']} trailing={<Badge tone="danger">Blocked</Badge>} /> },
          ]}
        />
      ),
    },
    PhaseHeader: {
      matrix: (
        <VariantStrip
          label="Tones"
          variants={[
            { label: 'Default', node: <PhaseHeader name="Phase 1 — Foundation" done={3} total={5} /> },
            { label: 'Success', node: <PhaseHeader name="Phase 2 — Hardening" done={8} total={8} tone="success" trailing={<Badge tone="success">Done</Badge>} /> },
            { label: 'Warning', node: <PhaseHeader name="Phase 3 — Launch" done={2} total={6} tone="warning" budget={1500} /> },
          ]}
        />
      ),
    },
    AgentTag: {
      matrix: (
        <VariantStrip
          label="Tiers"
          variants={[
            { label: 'Local',    node: <AgentTag assignee="hermes3" modelTier="open-local" costCeiling={0} /> },
            { label: 'Frontier', node: <AgentTag assignee="sonnet-4-6" modelTier="closed-frontier" costSpent={0.45} costCeiling={2.00} /> },
          ]}
        />
      ),
    },
  } satisfies Record<string, { matrix?: ReactNode; children?: ReactNode }>;

  return (
    <ComponentDocPageShell
      title="Display"
      isDark={isDark}
      intro="Components that present information without triggering actions."
    >
        <CategoryComponentDocs
          category="Display"
          isDark={isDark}
          preferredOrder={['Icon', 'TextLockup', 'Table', 'InlineCode', 'CodeBlock', 'Token', 'Stat', 'Field', 'StatusListItem', 'AssetImg', 'EmptyState', 'StatusTile', 'PhaseHeader', 'AgentTag']}
          configs={configs}
          hideDetails
          hideVariantDeck
          hideHero
        />
    </ComponentDocPageShell>
  );
}
```

- [ ] **Run typecheck**

```bash
pnpm typecheck
```
Expected: no errors

- [ ] **Commit**

```bash
git add src/app/pages/hds/components/DisplayPage.tsx
git commit -m "style(hds-docs): standardize DisplayPage to Actions format"
```

---

### Task 7: Final validation

- [ ] **Run full test suite**

```bash
pnpm typecheck && pnpm test:layout
```
Expected: all green

- [ ] **Commit spec + plan**

```bash
git add docs/superpowers/specs/2026-05-09-component-doc-page-format-standardization.md docs/superpowers/plans/2026-05-09-component-doc-page-format-standardization.md
git commit -m "docs: component doc page format standardization spec + plan"
```
