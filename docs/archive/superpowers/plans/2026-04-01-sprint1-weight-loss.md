# Sprint 1: "Weight Loss" Pass â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce codebase noise and eliminate technical debt by removing dead code, merging the ghost variant into tertiary, and verifying the neon revert â€” all before new infrastructure is built in Sprint 2.

**Architecture:** Three independent workstreams executed sequentially. The ghost-removal and neon-verification tasks touch TypeScript/JSON source files directly; Knip operates as a new toolchain layer that reports on orphaned files which are then manually removed.

**Tech Stack:** React 18 + TypeScript, pnpm, Knip (to be installed), Vite build pipeline, existing `pnpm manifest:generate` + `pnpm docs:llms` regeneration scripts.

---

## Scope map â€” files touched

| File | Workstream | Change |
|---|---|---|
| `src/app/components/HdsButton.tsx` | Ghost removal | Remove `ghost` from type union + delete ghost styling branch |
| `src/app/pages/hds/components/ActionsPage.tsx` | Ghost removal | Remove `ghost` from local `ButtonVariant` type + update IconButton demo |
| `src/app/data/component-api.json` | Ghost removal | Remove `"ghost"` from variant type strings (lines 772, 1216) |
| `system.manifest.json` | Ghost removal | Update HdsButton description text |
| `public/hds-manifest.json` | Ghost removal | Update HdsButton description text (or regenerate) |
| `llms.txt` / `public/llms.txt` | Ghost removal | Auto-regenerated â€” do not hand-edit |
| `hirobius.tokens.json` | Neon verify | Read-only audit â€” expect no changes |
| `src/app/design-system/tokens.ts` | Neon verify | Read-only audit â€” expect no changes |
| `package.json` | Knip | Add knip devDependency + `check:knip` / `knip` scripts |
| `knip.config.ts` (new) | Knip | Create Knip configuration file |
| Various orphaned files | Knip | Remove after reviewing Knip report |

---

## Task 1: Verify the Neon Revert Is Complete

Status: complete. The audit found no remaining `neon`, `glow`, or `text-shadow` references in the audited files.

**Files:**
- Read: `src/app/design-system/tokens.ts`
- Read: `hirobius.tokens.json` (primitive + semantic sections)
- Read: `src/styles/theme.css`

The git log shows `revert(hds): remove neonDisplay type style` was already committed. This task confirms nothing leaked.

- [x] **Step 1: Audit tokens.ts for neon**

Run:
```bash
grep -n "neon\|glow" src/app/design-system/tokens.ts
```
Expected: no output. If any matches, note the line numbers â€” they are out-of-scope for Sprint 1 and should be filed as a follow-up.

- [x] **Step 2: Audit hirobius.tokens.json for neon**

Run:
```bash
grep -n "neon\|glow" hirobius.tokens.json
```
Expected: no output.

- [x] **Step 3: Audit theme.css for neon**

Run:
```bash
grep -n "neon\|glow\|text-shadow" src/styles/theme.css
```
Expected: no output. (Canvas sketch files in `src/app/pages/sketches/private/` are intentional and carry `// color-ok` comments â€” do not flag those.)

- [x] **Step 4: Confirm and commit**

If all three greps return empty, the revert is clean. Commit the verification:

```bash
git add -A
git commit -m "chore: verify neon revert complete â€” no residual tokens or styles"
```

If grep returns hits, open the file, inspect the line, and remove the offending value. Then run `pnpm tokens:verify` before committing.

---

## Task 2: Remove the `ghost` Variant from HdsButton

Status: complete. `ghost` no longer appears in the button surface or docs-facing button variants.

**Note on JSCodeshift:** Sprint 1 spec listed automated codemods (JSCodeshift) for this migration. At 12 instances across 6 files, the setup overhead exceeds the edit cost. Direct edits are used here. JSCodeshift remains appropriate for future migrations with 50+ instances (e.g., a global prop rename across every component file).

**Context:** Both `ghost` and `tertiary` exist as separate variants with distinct interaction styles. The Sprint 1 goal is to consolidate low-emphasis actions under `tertiary` alone (Neutral rest â†’ Surface-raised hover â†’ 1px border + Accent text pressed). The `ghost` styling branch in HdsButton uses `accentSubtle` fill on hover with no border â€” this behavior is superseded by tertiary. All `variant="ghost"` usages get migrated to `variant="tertiary"` and the ghost branch is deleted.

**Files:**
- Modify: `src/app/components/HdsButton.tsx` lines 36, 52, 207â€“217
- Modify: `src/app/pages/hds/components/ActionsPage.tsx` lines 37, 111

- [ ] **Step 1: Remove ghost from HdsButtonVariant type (HdsButton.tsx line 36)**

Change:
```ts
export type HdsButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost';
```
To:
```ts
export type HdsButtonVariant = 'primary' | 'secondary' | 'tertiary';
```

- [ ] **Step 2: Remove ghost from HdsButtonProps interface (HdsButton.tsx line 52)**

Change:
```ts
  variant?: 'primary' | 'secondary' | 'tertiary' | 'ghost';
```
To:
```ts
  variant?: 'primary' | 'secondary' | 'tertiary';
```

- [ ] **Step 3: Delete the ghost styling branch (HdsButton.tsx lines 207â€“217)**

Delete this entire block (the `else if (variant === 'ghost')` arm and its style object):
```ts
    } else if (variant === 'ghost') {
      variantStyle = {
        background: showPressed || showHover
          ? 'var(--semantic-color-surface-accentSubtle)'
          : 'transparent',
        borderWidth: 0,
        borderStyle: 'none',
        color: showPressed || showHover
          ? 'var(--semantic-color-content-accent)'
          : 'var(--semantic-color-content-primary)',
      };
    }
```

The `else if (variant === 'primary')` block that follows it should now connect directly to the `tertiary` branch.

- [ ] **Step 4: Update ButtonVariant local type in ActionsPage.tsx (line 37)**

Change:
```ts
type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'ghost';
```
To:
```ts
type ButtonVariant = 'primary' | 'secondary' | 'tertiary';
```

- [ ] **Step 5: Migrate the IconButton demo usage (ActionsPage.tsx line 111)**

Change:
```tsx
<IconButton icon={CaretRight} size="lg" variant="ghost" label="Ghost large icon button" />
```
To:
```tsx
<IconButton icon={CaretRight} size="lg" variant="tertiary" label="Tertiary large icon button" />
```

- [ ] **Step 6: Typecheck**

Run:
```bash
pnpm typecheck
```
Expected: zero errors. If TypeScript complains about `ghost` being used elsewhere, grep for remaining instances:
```bash
grep -rn "ghost" src/app/ --include="*.tsx" --include="*.ts"
```
Fix any stragglers.

- [ ] **Step 7: Build check**

Run:
```bash
pnpm build
```
Expected: clean build, zero warnings about ghost.

> **Known limitation (Sprint 2 will fix this):** `src/app/data/component-api.json` is currently
> hand-maintained. In this task, ghost was removed manually (Steps 1â€“2). Once
> **Section 4 â€” Automated API Tables** is implemented in Sprint 2, `src/app/data/component-api.json`
> becomes a generated artifact. Changing a TypeScript type union (e.g. removing a variant
> from `HdsButtonVariant`) will automatically cascade to the docs matrix â€” no manual
> JSON edits, no risk of drift. See also **Section 6 â€” AST Gatekeeper** which enforces
> the pipeline runs on every build.


- [ ] **Step 8: Commit**

```bash
git add src/app/components/HdsButton.tsx src/app/pages/hds/components/ActionsPage.tsx
git commit -m "feat(hds): remove ghost variant â€” merge low-emphasis actions into tertiary"
```

---

## Task 3: Scrub ghost from Data / Manifest Files

Status: complete. The manifest and generated docs no longer reference `ghost`.

**Context:** `src/app/data/component-api.json` is the data source that `ComponentInstanceMatrix` reads to render variant columns in the docs matrix. Removing `ghost` here drops the ghost column from all rendered matrices automatically. The manifest files carry a prose description that still references ghost.

**Files:**
- Modify: `src/app/data/component-api.json` lines 772, 1216
- Modify: `system.manifest.json` line 44
- Modify: `public/hds-manifest.json` line 72

- [ ] **Step 1: Update HdsButton variant type in src/app/data/component-api.json (line 772)**

Change:
```json
"type": "\"primary\" | \"secondary\" | \"tertiary\" | \"ghost\"",
```
To:
```json
"type": "\"primary\" | \"secondary\" | \"tertiary\"",
```

- [ ] **Step 2: Update IconButton variant type in src/app/data/component-api.json (line 1216)**

Exact same change â€” same string at line 1216:
```json
"type": "\"primary\" | \"secondary\" | \"tertiary\" | \"ghost\"",
```
To:
```json
"type": "\"primary\" | \"secondary\" | \"tertiary\"",
```

- [ ] **Step 3: Update HdsButton description in system.manifest.json (line 44)**

Change:
```json
"description": "Primary, secondary, tertiary, and ghost action primitive for page and inline actions.",
```
To:
```json
"description": "Primary, secondary, and tertiary action primitive for page and inline actions.",
```

- [ ] **Step 4: Update HdsButton description in public/hds-manifest.json (line 72)**

Same change:
```json
"description": "Primary, secondary, tertiary, and ghost action primitive for page and inline actions.",
```
To:
```json
"description": "Primary, secondary, and tertiary action primitive for page and inline actions.",
```

- [ ] **Step 5: Regenerate derived artifacts**

Run the manifest and llms pipelines to regenerate `llms.txt` and `public/llms.txt` from the updated source:
```bash
pnpm manifest:generate && pnpm docs:llms
```
Expected: no errors. The generated files will no longer reference ghost.

- [ ] **Step 6: Verify llms.txt no longer mentions ghost**

```bash
grep "ghost" llms.txt public/llms.txt
```
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/app/data/component-api.json system.manifest.json public/hds-manifest.json llms.txt public/llms.txt
git commit -m "chore(hds): remove ghost variant from data layer and manifests"
```

---

## Task 4: Install and Configure Knip

Status: complete. Knip is installed, configured, and wired into `package.json`.

**Context:** Knip is a dead-code scanner that identifies unused files, exports, and dependencies. It does not exist in this project yet. `--production` mode skips test files; the `@internal` JSDoc tag marks test-only exports so Knip ignores them.

**Files:**
- Modify: `package.json` (add devDependency + scripts)
- Create: `knip.config.ts`

- [ ] **Step 1: Install Knip**

```bash
pnpm add -D knip
```
Expected: knip appears in `devDependencies` in `package.json`.

- [ ] **Step 2: Create knip.config.ts**

Create the file at the repo root:

```ts
import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  entry: [
    'src/main.tsx',
    'src/app/App.tsx',
    'scripts/**/*.mjs',
  ],
  project: [
    'src/**/*.{ts,tsx}',
    'scripts/**/*.mjs',
  ],
  ignore: [
    // Canvas sketches are intentional experiments â€” treat as live
    'src/app/pages/sketches/**',
    // Generated files â€” knip should not report these as orphans
    'src/styles/tokens.css',
    'src/app/design-system/generated-tokens.ts',
  ],
  ignoreDependencies: [
    // Peer deps required by other packages but not directly imported
    'typescript',
  ],
};

export default config;
```

- [ ] **Step 3: Add scripts to package.json**

In the `"scripts"` section of `package.json`, add:
```json
"knip": "knip",
"check:knip": "knip --production"
```

Place them near the other `check:*` scripts for discoverability.

- [ ] **Step 4: Run Knip in production mode and capture output**

```bash
pnpm check:knip 2>&1 | tee /tmp/knip-report.txt
```

Review the report. Knip output has three sections:
- **Unused files** â€” files not imported anywhere
- **Unused exports** â€” exported symbols nobody imports
- **Unused dependencies** â€” packages in package.json not used in source

- [ ] **Step 5: Commit the Knip config before acting on results**

```bash
git add knip.config.ts package.json
git commit -m "chore: add Knip dead-code scanner with production config"
```

---

## Task 5: Act on the Knip Report

Status: complete. The known orphaned files were removed or archived, and Knip is clean.

**Context:** Based on pre-run exploration, the likely orphans are demo pages and old HDS doc pages that routes.tsx redirects away from rather than imports. Verify each file before deleting â€” it may be imported by a script or test even if not in the router.

**Files (expected candidates):**
- `src/app/pages/demos/ButtonPlaygroundDemo.tsx`
- `src/app/pages/demos/CascadeTextDemo.tsx`
- `src/app/pages/demos/CinematicLinkDemo.tsx`
- `src/app/pages/demos/InteractiveDemoPage.tsx`
- `src/app/pages/demos/TriangleDemoPage.tsx`
- `src/app/pages/demos/DemoShell.tsx`
- `src/app/pages/hds/ArchitecturePage.tsx`
- `src/app/pages/hds/GettingStartedPage.tsx`
- `src/app/pages/hds/GuidancePage.tsx`
- `src/app/pages/hds/LicensePage.tsx`
- `src/app/pages/hds/HirobiusCaseStudyPage.tsx`
- `src/app/pages/hds/MicrosoftDSCaseStudyPage.tsx`

- [ ] **Step 1: For each file Knip flags as unused â€” verify with a reverse-import check**

Before deleting any file, run:
```bash
grep -rn "FileName" src/ scripts/ --include="*.tsx" --include="*.ts" --include="*.mjs"
```
Replace `FileName` with the actual component name. If zero results, the file is safe to delete. If results exist, leave the file and note it for manual review.

- [ ] **Step 2: Delete confirmed orphans**

For each confirmed orphan (example below â€” repeat for each file from the Knip report that passes the Step 1 check):
```bash
git rm src/app/pages/demos/ButtonPlaygroundDemo.tsx
git rm src/app/pages/demos/CascadeTextDemo.tsx
# ... continue for each confirmed orphan
```

Only remove files confirmed unused in Step 1. Do not blindly delete everything Knip reports â€” Knip's `entry` config may miss script-only consumers.

- [ ] **Step 3: Verify build is clean after deletions**

```bash
pnpm build
```
Expected: clean. If the build errors on a missing import, that file was used â€” restore it with `git checkout HEAD -- <path>` and exclude it from deletion.

- [ ] **Step 4: Run Knip again to confirm report is now clean**

```bash
pnpm check:knip
```
Unused dependencies flagged by Knip should be reviewed separately â€” do not remove dependencies without confirming they are truly unused (some are required by build tools or peer deps).

- [ ] **Step 5: Commit dead-file removals**

```bash
git add -A
git commit -m "chore: remove orphaned demo and redirected doc pages flagged by Knip"
```

---

## Verification

Run the full check suite after all five tasks are complete:

```bash
pnpm typecheck && pnpm build && pnpm check:fast
```

Expected: zero TypeScript errors, clean Vite build, and all `check:fast` audits pass.

Spot-check the live docs:
1. Start dev server: `pnpm dev`
2. Navigate to `/hds/components/actions`
3. Confirm the `HdsButton` and `IconButton` variant matrices no longer show a "ghost" column
4. Confirm all tertiary buttons render correctly at rest, hover, and pressed states
5. Confirm no 404s on pages that were not deleted

---

## Definition of Done

- [ ] `grep -rn "ghost" src/app/ --include="*.tsx" --include="*.ts"` returns zero results
- [ ] `grep -n "neon\|glow" src/app/design-system/tokens.ts hirobius.tokens.json` returns zero results
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] `pnpm check:knip` reports a smaller set of issues than the initial run (or clean)
- [ ] `/hds/components/actions` renders with no ghost column in matrices
- [ ] 4 commits on main: neon-verify, ghost-removal, data-scrub, knip-setup + dead-files

