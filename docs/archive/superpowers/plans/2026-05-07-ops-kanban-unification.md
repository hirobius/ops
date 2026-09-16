# Ops Kanban Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rearrange AgenticOSPage for better information hierarchy, add a /ops/knowledge hub, and write a migration script to push outstanding orchestration units into Hermes Kanban as the single source of truth.

**Architecture:** Pure UI reordering of existing components in AgenticOSPage + one new page (KnowledgePage) + one new SurfacesRail tile. Migration script is a standalone Node.js script that calls the `hermes` CLI — dry-run by default, `--execute` to live-fire. No changes to KanbanPage, no lane classification system.

**Tech Stack:** React 18, React Router 7, TypeScript, inline HDS tokens, `hermes` CLI (for migration script)

---

## File Map

| Action | File | What changes |
|---|---|---|
| Modify | `src/app/pages/ops/agentic-os/SurfacesRail.tsx` | Add Build + Knowledge tiles |
| Create | `src/app/pages/ops/KnowledgePage.tsx` | New hub page — three pillar tiles |
| Modify | `src/app/routes.tsx` | Add `/ops/knowledge` route |
| Modify | `src/app/pages/ops/agentic-os/AgenticOSPage.tsx` | Reorder sections, drop Lanes + Knowledge, collapse Clients + Gates |
| Delete | `src/app/pages/ops/agentic-os/LanesGrid.tsx` | Orphaned — no longer imported |
| Delete | `src/app/pages/ops/agentic-os/lanes.ts` | Orphaned — only used by LanesGrid |
| Create | `scripts/migrate-orchestration-to-hermes.mjs` | Migration script |

---

## Task 1: Add Build + Knowledge tiles to SurfacesRail

**Files:**
- Modify: `src/app/pages/ops/agentic-os/SurfacesRail.tsx`

- [ ] **Step 1: Replace the TILES array**

Open `src/app/pages/ops/agentic-os/SurfacesRail.tsx`. Replace lines 23–27 (the `TILES` const) with:

```tsx
const TILES: readonly SurfaceTile[] = [
  { to: '/ops/atlas',     label: 'Atlas',     description: 'Components · tokens · pipeline · strength' },
  { to: '/ops/kanban',    label: 'Kanban',    description: 'Live unit board — claim, track, ship' },
  { to: '/ops/build',     label: 'Build',     description: 'Pipeline stats · cost burn · agent audit' },
  { to: '/ops/knowledge', label: 'Knowledge', description: 'Build · Grow · Run — ops pillar hub' },
  { to: '/ops/staging',   label: 'Staging',   description: 'Specimen catalog — filter, promote to HDS' },
] as const;
```

No other changes to this file.

- [ ] **Step 2: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/pages/ops/agentic-os/SurfacesRail.tsx
git commit -m "feat(ops): add Build + Knowledge tiles to SurfacesRail"
```

---

## Task 2: Create KnowledgePage and add route

**Files:**
- Create: `src/app/pages/ops/KnowledgePage.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Create KnowledgePage.tsx**

Create `src/app/pages/ops/KnowledgePage.tsx` with the full content below:

```tsx
/* hds-bypass: ops-internal page. Inline styles intentional for standalone ops surface. */

import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { Page } from '../../components/page';
import { PageHeader } from './PageHeader';
import hds from '../../design-system/tokens';

const PILLARS = [
  {
    to:          '/ops/build',
    label:       'Build',
    description: 'Autonomous-build pipeline · cost burn · agent audit',
  },
  {
    to:          '/ops/clients',
    label:       'Grow',
    description: 'Client pipeline · retainers · prospects',
  },
  {
    to:          '/ops/atlas',
    label:       'Run',
    description: 'Guardrail registry · routes · component inventory',
  },
] as const;

export default function KnowledgePage() {
  return (
    <Page>
      <div style={s.root}>
        <PageHeader title="Knowledge" />
        <nav aria-label="Operational pillars" style={s.grid}>
          {PILLARS.map((p) => (
            <Link key={p.to} to={p.to} className="hds-focus" style={s.tile}>
              <div style={s.text}>
                <span style={s.label}>{p.label}</span>
                <span style={s.desc}>{p.description}</span>
              </div>
              <ArrowRight size={14} color="var(--semantic-color-content-secondary)" aria-hidden="true" />
            </Link>
          ))}
        </nav>
      </div>
    </Page>
  );
}

const s = {
  root: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           hds.space.px24,
  },
  grid: {
    display:             'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
    gap:                 hds.space.px12,
  },
  tile: {
    display:        'flex',
    alignItems:     'center',
    justifyContent: 'space-between',
    gap:            hds.space.px16,
    padding:        `${hds.space.px12} ${hds.space.px16}`,
    background:     'var(--semantic-color-surface-raised)',
    borderRadius:   hds.borderRadius[8],
    textDecoration: 'none' as const,
    color:          'inherit',
    minWidth:       0,
  },
  text: {
    display:       'flex',
    flexDirection: 'column' as const,
    gap:           hds.space.px2,
    minWidth:      0,
  },
  label: {
    ...hds.typeStyles.body,
    color: 'var(--semantic-color-content-primary)',
  },
  desc: {
    ...hds.typeStyles.ui,
    fontSize:     hds.fontSize.xs,
    color:        'var(--semantic-color-content-secondary)',
    overflow:     'hidden',
    textOverflow: 'ellipsis',
    whiteSpace:   'nowrap' as const,
  },
} satisfies Record<string, CSSProperties>;
```

- [ ] **Step 2: Add the route to routes.tsx**

Open `src/app/routes.tsx`. Add the lazy import near the other ops imports (around line 74):

```tsx
const KnowledgePage = lazy(() => import('./pages/ops/KnowledgePage'));
```

Then inside the `/ops` children array (after the `build` route, around line 200), add:

```tsx
{ path: 'knowledge', element: <LazyHDS Page={KnowledgePage} /> },
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Run layout tests**

```bash
pnpm test:layout
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/ops/KnowledgePage.tsx src/app/routes.tsx
git commit -m "feat(ops): add /ops/knowledge hub page with Build/Grow/Run tiles"
```

---

## Task 3: Rearrange AgenticOSPage

**Files:**
- Modify: `src/app/pages/ops/agentic-os/AgenticOSPage.tsx`

The goal is to:
- Remove the Lanes and Knowledge sections (and their imports)
- Move StrengthFooter up (directly after KpiCards)
- Move Services / Skills / Inbox / Trace Disclosures up (before Routes)
- Convert Clients and Gates from `<Section>` to `<Disclosure>` (collapsed by default)

- [ ] **Step 1: Remove orphaned imports**

In `AgenticOSPage.tsx`, delete these two import lines (lines 39 and 46 approximately):

```tsx
// DELETE these two lines:
import KnowledgeTab   from '../atlas/knowledge-tab';
import { LanesGrid }       from './LanesGrid';
```

- [ ] **Step 2: Replace the entire return block**

Replace everything from `return (` through the closing `)` of the component with:

```tsx
  return (
    <Page>
      <div style={s.root}>
        <PageHeader title="Agentic OS" />

        <SurfacesRail />

        <StrengthFooter snapshot={strength} />

        <StatusBanner triage={triage} />

        <KpiCards triage={triage} units={UNITS} />

        <Disclosure id="agentic-os.services" label="Services" hint="local dev daemons">
          <ServicesBar />
        </Disclosure>

        <Disclosure id="agentic-os.skills" label="Skills" hint="whitelisted scripts">
          <SkillsBar />
        </Disclosure>

        <Disclosure id="agentic-os.inbox" label="Inbox" hint={`${proposals.length} proposed · not yet approved`}>
          <ProposedUnitsRail entries={PROPOSED_UNITS} />
        </Disclosure>

        <Disclosure id="agentic-os.trace" label="Trace" hint={`last ${events.length} events`}>
          <TraceTable events={events} />
        </Disclosure>

        <Section label="Routes" hint="all /app routes — clickable">
          <RoutesTree />
        </Section>

        <Disclosure id="agentic-os.clients" label="Clients" hint="active retainers + prospects">
          <ClientsTab />
        </Disclosure>

        <Disclosure id="agentic-os.gates" label="Gates" hint="guardrail registry — severity, fixture, owner">
          <ValidatorsTab />
        </Disclosure>

      </div>
    </Page>
  );
```

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors. If TypeScript warns about unused imports (`RoutesTree`, `ClientsTab`, etc.), they are all still used — double-check the return block above uses each one.

- [ ] **Step 4: Run layout tests**

```bash
pnpm test:layout
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/ops/agentic-os/AgenticOSPage.tsx
git commit -m "feat(ops): rearrange AgenticOSPage — strength top, collapse clients/gates, drop lanes"
```

---

## Task 4: Delete orphaned files

**Files:**
- Delete: `src/app/pages/ops/agentic-os/LanesGrid.tsx`
- Delete: `src/app/pages/ops/agentic-os/lanes.ts`

- [ ] **Step 1: Delete the files**

```bash
rm src/app/pages/ops/agentic-os/LanesGrid.tsx
rm src/app/pages/ops/agentic-os/lanes.ts
```

- [ ] **Step 2: Run typecheck to confirm no broken imports**

```bash
pnpm typecheck
```

Expected: no errors. These files were only referenced from `AgenticOSPage.tsx` which was already cleaned up in Task 3.

- [ ] **Step 3: Commit**

```bash
git rm src/app/pages/ops/agentic-os/LanesGrid.tsx src/app/pages/ops/agentic-os/lanes.ts
git commit -m "chore(ops): delete orphaned LanesGrid + lanes — replaced by Kanban link"
```

---

## Task 5: Migration script

**Files:**
- Create: `scripts/migrate-orchestration-to-hermes.mjs`

This script pushes the 39 outstanding orchestration units (`approved`, `parked`, `needs-grilling`) into Hermes as real Kanban tasks. Dry-run by default; `--execute` to live-fire.

- [ ] **Step 1: Create the script**

Create `scripts/migrate-orchestration-to-hermes.mjs`:

```js
#!/usr/bin/env node
/**
 * scripts/migrate-orchestration-to-hermes.mjs
 *
 * Pushes outstanding orchestration.json units into the Hermes Kanban board.
 *
 * Status mapping:
 *   approved       → ready   (dispatcher can pick up immediately)
 *   parked         → todo    (acknowledged, not yet prioritized)
 *   needs-grilling → triage  (needs review before work starts)
 *
 * Usage:
 *   node scripts/migrate-orchestration-to-hermes.mjs          # dry-run (safe)
 *   node scripts/migrate-orchestration-to-hermes.mjs --execute # create tasks in Hermes
 *
 * Requires: hermes CLI on PATH with kanban plugin running locally.
 * Hard rules: never push, never touch .env*.
 */

import { readFileSync } from 'node:fs';
import { execSync }     from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const ROOT       = join(dirname(__filename), '..');
const EXECUTE    = process.argv.includes('--execute');

const orchestration = JSON.parse(
  readFileSync(join(ROOT, 'docs/ai/orchestration.json'), 'utf8'),
);
const units = orchestration.units;

const STATUS_MAP = {
  'approved':       'ready',
  'parked':         'todo',
  'needs-grilling': 'triage',
};

const targets = units.filter((u) => u.status in STATUS_MAP);

console.log(`\nOrchestration → Hermes migration`);
console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'dry-run'}`);
console.log(`Units to migrate: ${targets.length}\n`);

const results = [];

for (const unit of targets) {
  const hermesStatus = STATUS_MAP[unit.status];
  const title        = (unit.name ?? unit.title ?? unit.id).trim();

  // Build body — store unit ID so the UI can cross-reference if needed later.
  const bodyParts = [`Orch-Unit: ${unit.id}`];
  if (unit.description)         bodyParts.push('', unit.description);
  if (unit.validationCmd)       bodyParts.push('', `Validation: ${unit.validationCmd}`);
  if (unit.agentNotes?.length) {
    bodyParts.push('', 'Agent notes:');
    for (const note of unit.agentNotes) bodyParts.push(`- ${note}`);
  }
  if (unit.dependsOn?.length) {
    bodyParts.push('', `Depends on: ${unit.dependsOn.join(', ')}`);
  }
  const body = bodyParts.join('\n').trim();

  if (!EXECUTE) {
    console.log(`  [dry-run] ${unit.status.padEnd(15)} → ${hermesStatus.padEnd(7)} ${title}`);
    results.push({ unitId: unit.id, hermesStatus, title, taskId: null });
    continue;
  }

  // Step 1: create in triage (only safe creation status)
  let createOut;
  try {
    createOut = execSync(
      `hermes kanban create ${q(title)} --triage --created-by adrian --body ${q(body)}`,
      { cwd: ROOT, encoding: 'utf8' },
    ).trim();
  } catch (err) {
    console.error(`  ✖ create failed for ${unit.id}: ${err.stderr ?? err.message}`);
    results.push({ unitId: unit.id, hermesStatus, title, taskId: null, error: 'create-failed' });
    continue;
  }

  const match = createOut.match(/Created\s+(t_[a-z0-9]+)/);
  if (!match) {
    console.error(`  ✖ could not parse task ID for ${unit.id}:\n    ${createOut}`);
    results.push({ unitId: unit.id, hermesStatus, title, taskId: null, error: 'parse-failed' });
    continue;
  }
  const taskId = match[1];

  // Step 2: move to target status if not triage
  if (hermesStatus !== 'triage') {
    try {
      execSync(`hermes kanban move ${taskId} ${hermesStatus}`, { cwd: ROOT, encoding: 'utf8' });
    } catch (err) {
      console.warn(`  ⚠ created ${taskId} but move to ${hermesStatus} failed: ${err.stderr ?? err.message}`);
    }
  }

  console.log(`  ✓ ${unit.id.padEnd(50)} → ${taskId} (${hermesStatus})`);
  results.push({ unitId: unit.id, hermesStatus, title, taskId });
}

console.log('');
if (!EXECUTE) {
  console.log(`Dry-run complete. Run with --execute to create ${targets.length} tasks in Hermes.`);
  console.log('Requires: hermes CLI on PATH + kanban plugin running locally (default port 7717).');
} else {
  const ok  = results.filter((r) => r.taskId).length;
  const err = results.filter((r) => r.error).length;
  console.log(`Done. ${ok} created, ${err} failed.`);
  if (ok > 0) {
    console.log('\nMapping (unit_id → hermes_task_id):');
    for (const r of results.filter((r) => r.taskId)) {
      console.log(`  ${r.unitId.padEnd(50)} ${r.taskId}`);
    }
  }
}

function q(s) {
  return `'${String(s).replace(/'/g, "'\\''")}'`;
}
```

- [ ] **Step 2: Verify dry-run works**

```bash
node scripts/migrate-orchestration-to-hermes.mjs
```

Expected output: prints 39 lines like:
```
  [dry-run] approved         → ready   HDSLayout architectural split: ...
  [dry-run] parked           → todo    Enforce strict TypeScript polymorphism ...
  ...
Dry-run complete. Run with --execute to create 39 tasks in Hermes.
```

If the count is not 39, check that `docs/ai/orchestration.json` still has the expected distribution of `approved` (26), `parked` (12), `needs-grilling` (1).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-orchestration-to-hermes.mjs
git commit -m "feat(ops): migration script — push outstanding orchestration units to Hermes kanban"
```

---

## Running the live migration

> **Only run this when Hermes is running locally.** Verify first:
> ```bash
> curl -s http://localhost:7717/api/hermes/board?tenant=hds | head -c 100
> ```
> Should return JSON. If not, start Hermes before proceeding.

```bash
node scripts/migrate-orchestration-to-hermes.mjs --execute
```

Then open `/ops/kanban` and verify tasks appear in the `ready`, `todo`, and `triage` columns.

---

## Validation checklist

- [ ] `pnpm typecheck` — zero errors
- [ ] `pnpm test:layout` — all pass
- [ ] `/ops` — StrengthFooter visible near top; Services/Skills/Inbox/Trace come before Routes; Clients and Gates are collapsed disclosures
- [ ] `/ops/knowledge` — renders three tiles (Build → /ops/build, Grow → /ops/clients, Run → /ops/atlas); all three links navigate correctly
- [ ] `/ops/atlas` — unaffected (SurfacesRail change doesn't touch Atlas internals)
- [ ] `/ops/kanban` — unaffected
- [ ] `SurfacesRail` — five tiles visible: Atlas, Kanban, Build, Knowledge, Staging
- [ ] No references to `LanesGrid` or `lanes.ts` remain in source (run `grep -r LanesGrid src/`)
