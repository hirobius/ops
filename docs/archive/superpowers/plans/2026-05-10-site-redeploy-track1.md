# Site Redeploy Track 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public portfolio at production-ready quality for design-systems role applications. Hide HDS docs + Hirobius case study under a locked `/ops/*`, tighten existing case studies, add a Ranch Foundation case study, audit and close hiring-bar gaps, then merge to `main` for Vercel deploy.

**Architecture:** React Router 7 single-page app, Vite + prerender for static deploy on Vercel. HDS doc subtree relocates from `/hds/*` to `/ops/hds/*` and gains a client-side password gate. Old `/hds/*` URLs redirect to new locations. Editorial work (case study tightening) is judgment-heavy and reviewed by Adrian, not unit-tested.

**Tech Stack:** TypeScript, React 19, React Router 7, Vite 6, Tailwind 4 + HDS tokens, vitest, Playwright (smoke), Vercel.

**Spec:** `docs/superpowers/specs/2026-05-09-site-redeploy-application-ready.md`

---

## File Structure

**New files:**

- `src/lib/ops-gate.ts` — SHA-256 hash check + localStorage TTL helpers (pure logic, unit-testable)
- `src/lib/ops-gate.test.ts` — vitest tests for `ops-gate.ts`
- `src/app/components/OpsGate.tsx` — gate UI wrapper component for `/ops/*` routes
- `src/app/pages/hds/RanchFoundationCaseStudyPage.tsx` — new case study page
- `docs/audits/hiring-bar-audit-2026-05-10.md` — hiring-bar audit punch list

**Modified files:**

- `.gitignore` — append local-only paths (already partially staged)
- `src/app/routes.tsx` — relocate `/hds/*` under `/ops/hds/*`, add redirects, wrap `/ops/*` in `<OpsGate>`, route Ranch case study, 404 wet-paint + portfolio/draft
- `src/app/pages/hds/PortfolioHomePage.tsx` — tile lineup: remove 2, add Ranch tile
- `src/app/pages/hds/MicrosoftDesignSystemsPage.tsx` — tighten copy
- `src/app/pages/hds/HirobiusCaseStudyPage.tsx` — tighten copy + add `<Helmet>`-style noindex
- `src/app/components/doc-shell.tsx` — `to="/hds"` → `to="/ops/hds"`
- `src/app/pages/hds/HdsDocPrimitives.tsx` — `=== '/hds/tokens'` → `=== '/ops/hds/tokens'`
- `index.html` — sitewide noindex hint conditional? OG fallback verified
- `public/robots.txt` — disallow `/ops/*`, draft, wet-paint
- `CLAUDE.md` — document `VITE_OPS_GATE_HASH` env var

---

## Task 1: Working tree triage + clean baseline

**Pre-condition for everything else.** Single agent, sequential, no parallelism here.

**Files:**

- Modify: `.gitignore`, working-tree miscellaneous

- [ ] **Step 1: Snapshot current state**

```bash
git status --short > /tmp/pre-triage-status.txt
cat /tmp/pre-triage-status.txt
```

- [ ] **Step 2: Delete stray garbage files**

```bash
rm -f 0
ls -la 0 2>/dev/null && echo "STILL THERE" || echo "removed"
```

Expected: `removed`.

- [ ] **Step 3: Append local-only paths to `.gitignore`**

Read current `.gitignore` first to find the right section. Then add (at the end of the local-tooling block):

```
# Local agent state — never committed
.agents/
.claude/skills/
```

(`.worktrees/` is already gitignored — verify with `grep -F '.worktrees' .gitignore` before adding.)

- [ ] **Step 4: Stage the staged-already files (already in index from prior session)**

These are already in the index per `git diff --staged`:

- `.gitignore` (proposed-skills.jsonl line)
- `scripts/proposed-skills-middleware.mjs`
- `src/app/pages/ops/agentic-os/SkillCreatorForm.tsx`
- `vite.config.mjs` (proposed-skills middleware mount)

Add the new gitignore lines from Step 3:

```bash
git add .gitignore
git diff --staged .gitignore
```

Expected: shows both the `proposed-skills.jsonl` line and the new `.agents/` + `.claude/skills/` lines.

- [ ] **Step 5: Stage referenced-but-untracked files**

```bash
git add src/app/pages/ops/agentic-os/PillarRail.tsx
git add scripts/classify-pillars.mjs
git add skills-lock.json
git status --short
```

Expected: those three files now staged.

- [ ] **Step 6: Stage modified docs + data files**

```bash
git add DESIGN.md docs/SYSTEMS-LOG.md docs/ai/TIER_AUDIT.md \
        docs/ai/orchestration.json docs/ai/routing-log.jsonl \
        docs/audits/exceptions-audit.md docs/guardrails/SYSTEM_OVERVIEW.md \
        docs/guardrails/strength-report.json docs/guardrails/strength-report.md \
        llms.txt public/llms.txt public/assets/manifest.json public/hds-manifest.json \
        src/app/data/commit-history.json src/app/data/component-api.json \
        src/app/data/roadmap.json src/app/data/token-audit-report.json \
        src/app/data/used-icons.json
git add docs/superpowers/plans/2026-05-07-intake-drive-widget.md \
        docs/superpowers/plans/2026-05-07-services-bar-process-info.md \
        docs/superpowers/plans/2026-05-07-skills-cleanup-intake-widget.md \
        docs/superpowers/plans/2026-05-09-component-doc-page-format-standardization.md \
        docs/superpowers/specs/2026-05-09-component-doc-page-format-standardization.md \
        docs/superpowers/specs/2026-05-09-site-redeploy-application-ready.md \
        docs/superpowers/plans/2026-05-10-site-redeploy-track1.md
```

- [ ] **Step 7: Stage the modified ops page edits**

```bash
git add src/app/pages/ops/agentic-os/AgenticOSPage.tsx \
        src/app/pages/ops/agentic-os/data.ts
git add src/app/pages/hds/components/InputsPage.tsx \
        src/app/pages/hds/components/LayoutPage.tsx \
        src/app/pages/hds/components/NavigationPage.tsx
```

- [ ] **Step 8: Final review of staged changes**

```bash
git diff --staged --stat | tail -30
git status --short
```

Expected:

- All 23+ tracked-modified files staged
- All targeted untracked files staged
- `.agents/`, `.claude/skills/`, `.worktrees/`, `public/assets/_incoming/clone-2026-05-03-...` should remain unstaged (gitignored or intentionally left alone)
- Nothing in working tree that wasn't intentional

- [ ] **Step 9: Commit baseline**

```bash
git commit -m "$(cat <<'EOF'
chore(prep): clean working tree before site redeploy

Stage current data drift (manifests, audits, routing log), recent ops
component additions (PillarRail, SkillCreatorForm, classify-pillars
script + middleware), and superpowers planning docs for the
application-ready redeploy.

Refs: site-redeploy-track1
EOF
)"
```

- [ ] **Step 10: Verify build still green**

```bash
pnpm typecheck 2>&1 | tail -10
pnpm test:layout 2>&1 | tail -20
```

Expected: typecheck passes, layout tests pass.

- [ ] **Step 11: Confirm clean tree**

```bash
git status --short
```

Expected: only `.agents/`, `.claude/skills/`, `.worktrees/`, `public/assets/_incoming/clone-...webp` remain (gitignored or intentionally untracked).

---

## Task 2: OpsGate hash util (TDD)

**Files:**

- Create: `src/lib/ops-gate.ts`
- Test: `src/lib/ops-gate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ops-gate.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  hashPassword,
  verifyPassword,
  getStoredAccess,
  setStoredAccess,
  clearStoredAccess,
  OPS_GATE_TTL_MS,
} from './ops-gate';

describe('hashPassword', () => {
  it('returns a 64-character lowercase hex SHA-256', async () => {
    const hash = await hashPassword('hello');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns different hashes for different inputs', async () => {
    expect(await hashPassword('a')).not.toBe(await hashPassword('b'));
  });
});

describe('verifyPassword', () => {
  it('returns true when password hashes to expected', async () => {
    const expected = await hashPassword('open-sesame');
    expect(await verifyPassword('open-sesame', expected)).toBe(true);
  });

  it('returns false on mismatch', async () => {
    const expected = await hashPassword('open-sesame');
    expect(await verifyPassword('wrong', expected)).toBe(false);
  });

  it('returns false when expected is empty', async () => {
    expect(await verifyPassword('open-sesame', '')).toBe(false);
  });
});

describe('localStorage helpers', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-10T00:00:00Z'));
  });

  it('setStoredAccess writes timestamp; getStoredAccess returns true within TTL', () => {
    setStoredAccess();
    expect(getStoredAccess()).toBe(true);
  });

  it('getStoredAccess returns false when nothing stored', () => {
    expect(getStoredAccess()).toBe(false);
  });

  it('getStoredAccess returns false after TTL expires', () => {
    setStoredAccess();
    vi.advanceTimersByTime(OPS_GATE_TTL_MS + 1);
    expect(getStoredAccess()).toBe(false);
  });

  it('clearStoredAccess removes the key', () => {
    setStoredAccess();
    clearStoredAccess();
    expect(getStoredAccess()).toBe(false);
  });

  it('getStoredAccess returns false on malformed value', () => {
    localStorage.setItem('ops-gate-access', 'not-a-number');
    expect(getStoredAccess()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/lib/ops-gate.test.ts 2>&1 | tail -20
```

Expected: tests fail with "Cannot find module './ops-gate'" or similar.

- [ ] **Step 3: Implement `src/lib/ops-gate.ts`**

```typescript
/**
 * /ops gate — client-side password check.
 *
 * NOT security. The source is public. This deters casual visitors and
 * keeps /ops out of the casual-browse experience and out of search-engine
 * indexes (paired with noindex meta + robots.txt).
 *
 * The stored hash comes from `import.meta.env.VITE_OPS_GATE_HASH` (set
 * locally + in Vercel dashboard). On a successful match, set a 7-day
 * localStorage flag so subsequent /ops visits pass through.
 */

export const OPS_GATE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const STORAGE_KEY = 'ops-gate-access';

/** SHA-256 hex digest of the input. */
export async function hashPassword(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** True iff `hashPassword(input) === expectedHash` and `expectedHash` non-empty. */
export async function verifyPassword(input: string, expectedHash: string): Promise<boolean> {
  if (!expectedHash) return false;
  return (await hashPassword(input)) === expectedHash;
}

/** Returns true if a non-expired access timestamp exists in localStorage. */
export function getStoredAccess(): boolean {
  const raw = typeof window === 'undefined' ? null : localStorage.getItem(STORAGE_KEY);
  if (!raw) return false;
  const ts = Number.parseInt(raw, 10);
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts < OPS_GATE_TTL_MS;
}

/** Stores current timestamp as the access flag. */
export function setStoredAccess(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

/** Clears the access flag (manual sign-out). */
export function clearStoredAccess(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(STORAGE_KEY);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/lib/ops-gate.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ops-gate.ts src/lib/ops-gate.test.ts
git commit -m "$(cat <<'EOF'
feat(ops-gate): SHA-256 password util + 7-day localStorage TTL

Pure client-side gate logic. Not security — source is public.
Deters casual visitors + pairs with noindex/robots to keep /ops
out of search engines.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 3: OpsGate component

**Files:**

- Create: `src/app/components/OpsGate.tsx`

- [ ] **Step 1: Read the existing HDSLayout pattern for style consistency**

```bash
sed -n '1,40p' src/app/pages/hds/HDSLayout.tsx
```

This component is a peer to layouts — match the styling conventions (use HDS tokens, no inline arbitrary values).

- [ ] **Step 2: Create `src/app/components/OpsGate.tsx`**

```tsx
import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { getStoredAccess, setStoredAccess, verifyPassword } from '../../lib/ops-gate';

const EXPECTED_HASH = import.meta.env.VITE_OPS_GATE_HASH ?? '';
const DEV_BYPASS = import.meta.env.DEV;

interface OpsGateProps {
  children: ReactNode;
}

/**
 * Wraps `/ops/*` routes with a client-side password gate.
 *
 * - In dev mode, always renders children (DEV_BYPASS).
 * - On first prod visit, shows a password screen.
 * - Successful password sets a 7-day localStorage flag.
 * - `?key=<password>` URL param accepted for shareable deep links.
 */
export default function OpsGate({ children }: OpsGateProps) {
  const [searchParams] = useSearchParams();
  const [unlocked, setUnlocked] = useState<boolean>(() => DEV_BYPASS || getStoredAccess());
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // ?key=<password> deep link — verify on mount.
  useEffect(() => {
    if (unlocked) return;
    const keyParam = searchParams.get('key');
    if (!keyParam) return;
    let cancelled = false;
    (async () => {
      const ok = await verifyPassword(keyParam, EXPECTED_HASH);
      if (cancelled) return;
      if (ok) {
        setStoredAccess();
        setUnlocked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, unlocked]);

  if (unlocked) return <>{children}</>;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setChecking(true);
    setError(null);
    const ok = await verifyPassword(input, EXPECTED_HASH);
    setChecking(false);
    if (ok) {
      setStoredAccess();
      setUnlocked(true);
    } else {
      setError('Incorrect.');
      setInput('');
    }
  }

  return (
    <main
      style={{
        minHeight: '60vh',
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--hds-space-2xl)',
      }}
    >
      <form
        onSubmit={handleSubmit}
        style={{
          display: 'grid',
          gap: 'var(--hds-space-md)',
          width: '100%',
          maxWidth: '320px',
          textAlign: 'center',
        }}
      >
        <h1
          style={{
            font: 'var(--semantic-typography-h2)',
            color: 'var(--semantic-color-content-primary)',
            margin: 0,
          }}
        >
          /ops
        </h1>
        <p
          style={{
            font: 'var(--semantic-typography-body)',
            color: 'var(--semantic-color-content-subdued)',
            margin: 0,
          }}
        >
          Internal area. Enter the key to continue.
        </p>
        <input
          type="password"
          autoFocus
          value={input}
          onChange={(e) => setInput(e.target.value)}
          aria-label="Ops gate key"
          style={{
            font: 'var(--semantic-typography-body)',
            padding: 'var(--hds-space-sm) var(--hds-space-md)',
            border: '1px solid var(--semantic-color-border-subdued)',
            borderRadius: 'var(--semantic-radius-action)',
            background: 'var(--semantic-color-surface-base)',
            color: 'var(--semantic-color-content-primary)',
          }}
        />
        {error && (
          <p
            role="alert"
            style={{
              font: 'var(--semantic-typography-small)',
              color: 'var(--semantic-color-feedback-error)',
              margin: 0,
            }}
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={checking || input.length === 0}
          style={{
            font: 'var(--semantic-typography-ui)',
            padding: 'var(--hds-space-sm) var(--hds-space-lg)',
            border: '1px solid var(--semantic-color-border-strong)',
            borderRadius: 'var(--semantic-radius-action)',
            background: 'var(--semantic-color-surface-overlay)',
            color: 'var(--semantic-color-content-primary)',
            cursor: checking || input.length === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {checking ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/components/OpsGate.tsx
git commit -m "$(cat <<'EOF'
feat(ops-gate): OpsGate component with password screen + URL key

Wraps /ops/* with a minimal password screen. Accepts ?key=<password>
for shareable deep links. Dev mode bypasses (DEV flag).

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 4: Wire OpsGate into routes + document env var

**Files:**

- Modify: `src/app/routes.tsx`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add OpsGate import + wrap `/ops` element**

In `src/app/routes.tsx`:

After the existing imports near the top, add:

```tsx
import OpsGate from './components/OpsGate';
```

Then find the `/ops` route (around line 231) and wrap its element. The current element is:

```tsx
element: (
  <Suspense fallback={<HDSFallback />}>
    <OpsShell />
  </Suspense>
),
```

Replace with:

```tsx
element: (
  <OpsGate>
    <Suspense fallback={<HDSFallback />}>
      <OpsShell />
    </Suspense>
  </OpsGate>
),
```

- [ ] **Step 2: Document the env var in CLAUDE.md**

Append to `CLAUDE.md` under the §0 HARD RULES section, as a new bullet:

```
- **`/ops` is gated in production** by `VITE_OPS_GATE_HASH` (SHA-256 hex). Adrian sets this locally in `.env.local` AND in Vercel dashboard env vars (production scope). Computing the hash: `echo -n "<password>" | shasum -a 256`. Claude must never read or write `.env*` files.
```

- [ ] **Step 3: Typecheck + dev-server smoke**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: clean. (Don't start dev server here — defer browser smoke to Task 13.)

- [ ] **Step 4: Commit**

```bash
git add src/app/routes.tsx CLAUDE.md
git commit -m "$(cat <<'EOF'
feat(ops-gate): wrap /ops/* in OpsGate

Production /ops/* requires VITE_OPS_GATE_HASH match. Dev bypasses.
Document env var setup in CLAUDE.md.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 5: Move HDS routes under `/ops/hds` + add redirects + update internal links

**Files:**

- Modify: `src/app/routes.tsx`
- Modify: `src/app/components/doc-shell.tsx` (line 187)
- Modify: `src/app/pages/hds/HdsDocPrimitives.tsx` (line ~446)

**Note:** This is a single-file-heavy task. One agent, sequential.

- [ ] **Step 1: In `src/app/routes.tsx`, restructure**

Find the `path: 'hds'` block (around line 173-229). It currently sits as a child of `/`.

Move that entire block to be a child of `/ops` (which sits around line 231). Inside the `/ops` `children:` array, add the `hds` block as a sibling alongside `staging`, `briefing`, etc.

Inside the moved `hds` block, **rewrite all internal `Navigate to="/hds/..."` strings to `Navigate to="/ops/hds/..."`**. Specifically these lines (per current file):

- Line 176: `Navigate to="/hds/color"` → `Navigate to="/ops/hds/color"`
- Line 177: same
- Line 188: `Navigate to="/hds/color"` → `Navigate to="/ops/hds/color"`
- Line 191: same
- Line 193: `Navigate to="/hds/shape"` → `Navigate to="/ops/hds/shape"`
- Line 194: `Navigate to="/hds/color"` → `Navigate to="/ops/hds/color"`
- Line 201: `Navigate to="/hds/components/actions"` → `Navigate to="/ops/hds/components/actions"`
- Line 205: `Navigate to="/hds/components/doc-utilities"` → `Navigate to="/ops/hds/components/doc-utilities"`
- Line 211: `Navigate to="/hds/components/display"` → `Navigate to="/ops/hds/components/display"`
- Line 214: same
- Line 215: same
- Lines 224-227: all `Navigate to="/hds/color"` → `Navigate to="/ops/hds/color"`

**`case-studies/hirobius` stays accessible** — keep it under the `/ops/hds` parent, and ALSO add a top-level public route to the same component (see Step 3).

- [ ] **Step 2: Add legacy-redirect block under `/`**

Where the old `path: 'hds'` block used to live (now empty), add a redirect-only block so old `/hds/...` URLs go to `/ops/hds/...`:

```tsx
{
  path: 'hds',
  children: [
    { index: true, element: <Navigate to="/ops/hds/color" replace /> },
    { path: ':rest/*', element: <Navigate to="/ops/hds/color" replace /> },
    // Specific redirects for the most-visited paths:
    { path: 'color', element: <Navigate to="/ops/hds/color" replace /> },
    { path: 'tokens', element: <Navigate to="/ops/hds/tokens" replace /> },
    { path: 'typography', element: <Navigate to="/ops/hds/typography" replace /> },
    { path: 'spacing', element: <Navigate to="/ops/hds/spacing" replace /> },
    { path: 'motion', element: <Navigate to="/ops/hds/motion" replace /> },
    { path: 'elevation', element: <Navigate to="/ops/hds/elevation" replace /> },
    { path: 'shape', element: <Navigate to="/ops/hds/shape" replace /> },
    { path: 'breakpoints', element: <Navigate to="/ops/hds/breakpoints" replace /> },
    { path: 'components', element: <Navigate to="/ops/hds/components/actions" replace /> },
    { path: 'components/actions', element: <Navigate to="/ops/hds/components/actions" replace /> },
    { path: 'components/inputs', element: <Navigate to="/ops/hds/components/inputs" replace /> },
    { path: 'components/display', element: <Navigate to="/ops/hds/components/display" replace /> },
    { path: 'components/feedback', element: <Navigate to="/ops/hds/components/feedback" replace /> },
    { path: 'components/navigation', element: <Navigate to="/ops/hds/components/navigation" replace /> },
    { path: 'components/layout', element: <Navigate to="/ops/hds/components/layout" replace /> },
    { path: 'components/doc-utilities', element: <Navigate to="/ops/hds/components/doc-utilities" replace /> },
    { path: 'sandbox', element: <Navigate to="/ops/hds/sandbox" replace /> },
    { path: 'system-contract', element: <Navigate to="/ops/hds/system-contract" replace /> },
    { path: 'brand-theming', element: <Navigate to="/ops/hds/brand-theming" replace /> },
    { path: 'contribution-guide', element: <Navigate to="/ops/hds/contribution-guide" replace /> },
    { path: 'architecture-snapshot', element: <Navigate to="/ops/hds/architecture-snapshot" replace /> },
    { path: 'component-health', element: <Navigate to="/ops/hds/component-health" replace /> },
    { path: 'typography-test', element: <Navigate to="/ops/hds/typography-test" replace /> },
    { path: 'spacing-test', element: <Navigate to="/ops/hds/spacing-test" replace /> },
    { path: 'case-studies/hirobius', element: <Navigate to="/case-studies/hirobius" replace /> },
  ],
},
```

(Note: the catch-all `:rest/*` after the `index` is a fallback; specific routes above match first in React Router 7.)

- [ ] **Step 3: Add top-level Hirobius case study route**

In the `/` children, alongside existing case studies (around line 124), the route `case-studies/hirobius` already exists pointing to `HirobiusCaseStudyPage`. **Verify it's still there after the move** — if it was inside the `/hds` block, ensure the top-level one outside also points to `HirobiusCaseStudyPage`. If duplicated, keep the top-level one at `/case-studies/hirobius` so the page stays accessible from outside `/ops`.

(This is the only HDS-flavored case study we keep public-but-untiled.)

- [ ] **Step 4: Update `src/app/components/doc-shell.tsx:187`**

```bash
grep -n 'to="/hds"' src/app/components/doc-shell.tsx
```

Change `to="/hds"` → `to="/ops/hds/color"` (point to a real landing page rather than the index redirect).

- [ ] **Step 5: Update `src/app/pages/hds/HdsDocPrimitives.tsx:446`**

```bash
grep -n "fromParam === '/hds/tokens'" src/app/pages/hds/HdsDocPrimitives.tsx
```

Change `fromParam === '/hds/tokens'` → `fromParam === '/ops/hds/tokens'`.

- [ ] **Step 6: Find any remaining hardcoded `/hds/` references**

```bash
grep -rn "['\"]/hds[/\"']" src/ --include="*.tsx" --include="*.ts" | grep -v "ops/hds" | grep -v "src/app/routes.tsx"
```

Update each match by replacing `'/hds/...'` with `'/ops/hds/...'`. If any are intentional (e.g., a redirect-from path), leave them but add a `// route-ok: legacy redirect source` comment.

- [ ] **Step 7: Typecheck + build**

```bash
pnpm typecheck 2>&1 | tail -5
pnpm exec vite build 2>&1 | tail -15
```

Expected: clean typecheck, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/routes.tsx src/app/components/doc-shell.tsx src/app/pages/hds/HdsDocPrimitives.tsx
git commit -m "$(cat <<'EOF'
refactor(routes): move /hds/* under /ops/hds/* + add redirects

- All HDS doc routes now nest under /ops/hds (gated by OpsGate)
- /hds/* paths redirect to /ops/hds/* equivalents (compatibility)
- /case-studies/hirobius stays public at the top level
- Update internal /hds links in doc-shell + HdsDocPrimitives

HDS docs are now an internal artifact for ops; the case study
remains accessible to recruiters via direct link.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 6: 404 `/wet-paint` and `/portfolio/draft`

**Files:**

- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Replace `/wet-paint` route**

Find around line 113:

```tsx
{ path: 'wet-paint', element: <LazyHDS Page={WetPaintPage} /> },
```

Replace with:

```tsx
{ path: 'wet-paint', element: <Navigate to="/404" replace /> },
```

- [ ] **Step 2: Replace `/portfolio/draft` route**

Find around line 158:

```tsx
{ path: 'draft', element: <LazyHDS Page={PortfolioDraftPage} /> },
```

Replace with:

```tsx
{ path: 'draft', element: <Navigate to="/404" replace /> },
```

- [ ] **Step 3: Remove now-unused lazy imports (optional but clean)**

If `WetPaintPage` and `PortfolioDraftPage` are no longer referenced anywhere else in `routes.tsx`, remove their `lazy(...)` imports. Verify with:

```bash
grep -n "WetPaintPage\|PortfolioDraftPage" src/app/routes.tsx
```

Expected: zero matches after removal.

(The `.tsx` source files stay in `src/app/pages/` — we're not deleting source, just unrouting them. T2 may do further cleanup.)

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/routes.tsx
git commit -m "$(cat <<'EOF'
refactor(routes): 404 /wet-paint and /portfolio/draft

Both routes signal WIP and shouldn't appear under hiring-manager
review. Source files retained for future T2 work.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 7: Ranch Foundation case study scaffold + route

**Files:**

- Create: `src/app/pages/hds/RanchFoundationCaseStudyPage.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Read the Hirobius case study for style/structure**

```bash
sed -n '1,60p' src/app/pages/hds/HirobiusCaseStudyPage.tsx
```

The Ranch case study mirrors this file's structure: imports, `@category`, the same set of HDS doc primitives (`TextLockup`, etc.), motion wrapper, TOC registration.

- [ ] **Step 2: Create skeleton at `src/app/pages/hds/RanchFoundationCaseStudyPage.tsx`**

```tsx
// @doc-exempt: portfolio case study, not a consumer-facing HDS component
/**
 * RanchFoundationCaseStudyPage
 * Case study for The Ranch Foundation — veteran nonprofit, ongoing engagement
 * since 2021 (Tech Design Director, board role + web/tech consulting).
 * @category Portfolio
 */
import { useLayoutEffect } from 'react';
import { motion } from 'motion/react';
import hds from '../../design-system/tokens';
import { TextLockup } from './HdsDocPrimitives';
import { slugify, useToc } from './HdsTocContext';

const SECTION_GAP = hds.semantic.space.section.stack;
const LAYOUT_GAP = hds.semantic.space.layout.gap;

const SR_ONLY = {
  position: 'absolute',
  width: hds.space.px1,
  height: hds.space.px1,
  padding: 0,
  margin: `calc(${hds.space.px1} * -1)`,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
} as const;

function CaseStudySection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const id = slugify(title);
  const { register, unregister } = useToc();

  useLayoutEffect(() => {
    register({ id, title });
    return () => unregister(id);
  }, [id, title, register, unregister]);

  return (
    <section id={id} style={{ display: 'grid', gap: LAYOUT_GAP }}>
      <h2 style={SR_ONLY}>{title}</h2>
      <TextLockup size="section" title={title} description={description ?? ''} />
      {children}
    </section>
  );
}

export default function RanchFoundationCaseStudyPage() {
  return (
    <motion.article
      className="hds-page-enter"
      style={{
        display: 'grid',
        gap: SECTION_GAP,
        paddingBlockStart: hds.semantic.space.section.stack,
      }}
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: hds.motion.spatial.duration, ease: hds.motion.spatial.easing }}
    >
      <header>
        <h1 style={SR_ONLY}>The Ranch Foundation case study</h1>
        <TextLockup
          size="hero"
          title="The Ranch Foundation"
          description="Tech Design Director and ongoing technology partner for a veteran-focused holistic-healing nonprofit. Five-year engagement, board role, web + tooling work."
        />
      </header>

      {/* Sections filled in Task 8. */}
    </motion.article>
  );
}
```

- [ ] **Step 3: Add the route in `src/app/routes.tsx`**

Add lazy import near the other case studies:

```tsx
const RanchFoundationCaseStudyPage = lazy(() => import('./pages/hds/RanchFoundationCaseStudyPage'));
```

Add the route as a sibling to `case-studies/hirobius` (top-level under `/`):

```tsx
{ path: 'case-studies/the-ranch-foundation', element: <LazyHDS Page={RanchFoundationCaseStudyPage} /> },
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/hds/RanchFoundationCaseStudyPage.tsx src/app/routes.tsx
git commit -m "$(cat <<'EOF'
feat(case-study): scaffold Ranch Foundation case study + route

Skeleton page at /case-studies/the-ranch-foundation. Sections
filled in follow-up commit using clients/the-ranch-foundation/ data.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 8: Ranch Foundation case study content

**Files:**

- Modify: `src/app/pages/hds/RanchFoundationCaseStudyPage.tsx`

This is editorial work. Owner: sonnet, full creative discretion within the structure below.

- [ ] **Step 1: Read source material**

```bash
cat clients/the-ranch-foundation/meta.json
cat clients/the-ranch-foundation/notes.md
cat clients/the-ranch-foundation/goals.json
cat clients/the-ranch-foundation/retainer.json 2>/dev/null
cat clients/the-ranch-foundation/checklist.json 2>/dev/null
cat clients/the-ranch-foundation/tasks.json 2>/dev/null
```

Internalize: 5-year engagement since founding (2021), Tech Design Director board role, primary contact Daniel Litzenberger (CEO/Army Ranger), Spokane WA, 501(c)(3), holistic healing for combat veterans, Wix-based current site rebuild in progress, Harmony layout adopted, "wellness practices" (renamed from services), three-item nav, donation platform blocked on EIN+Stripe verification.

- [ ] **Step 2: Write the case study sections**

Inside the `<motion.article>`, after `<header>`, add `<CaseStudySection>` components. Aim for ~400 lines total in this file. Sections to write:

1. **At a glance** — 4-line metadata (role, dates, scope, status), no narrative
2. **Why this exists** — what TRF does, who it serves, why a small veteran nonprofit needed sustained design + tech help
3. **The role** — Tech Design Director board seat + ongoing engagement; what that means in practice (strategy, web, tooling, decisions)
4. **Constraints** — Wix-based stack (not React rebuild), volunteer photographers, 501(c)(3) compliance, donation-platform verification gate, CEO is field-experienced veteran not tech-trained
5. **Decisions surfaced** — Harmony layout adoption, "wellness practices" naming, three-item nav, descriptive image naming for SEO/screen-readers, no sign-in / no blog by design, CTA copy ("Learn More" not "Book Now"), Cal.com for veteran scheduling
6. **What's live / what's pending** — current state of the Wix rebuild, Google Workspace adoption, donation platform status, Cal.com evaluation
7. **What working with TRF teaches** — short reflection: design systems thinking applied beyond enterprise; constraint-shaped decisions; why sustained engagement beats one-shot rebuilds

**Voice:** Adrian's voice — direct, declarative, uses concrete details. No filler ("It was clear that…", "We worked together to…"). Cite the year, the practice name, the constraint. Show the decision; don't narrate the deliberation.

**Visuals:** placeholder slots only in T1 (ship-fast). For each section that would benefit from a visual, add an inline `<div>` placeholder with a subtle dashed border and a comment `{/* T2: replace with TRF asset */}`. Real assets land in T2.

- [ ] **Step 3: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 4: Read the rendered page in source**

```bash
wc -l src/app/pages/hds/RanchFoundationCaseStudyPage.tsx
```

Expected: ~300-450 lines.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/hds/RanchFoundationCaseStudyPage.tsx
git commit -m "$(cat <<'EOF'
feat(case-study): write Ranch Foundation case study content

Full narrative draft sourced from clients/the-ranch-foundation/.
Visual slots are placeholders; real assets land in T2.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 9: Update homepage tile lineup

**Files:**

- Modify: `src/app/pages/hds/PortfolioHomePage.tsx`

- [ ] **Step 1: Read the current `SHELL_ENTRY_CARDS` array**

```bash
sed -n '159,210p' src/app/pages/hds/PortfolioHomePage.tsx
```

- [ ] **Step 2: Update `SHELL_ENTRY_CARDS`**

Replace the `SHELL_ENTRY_CARDS` array (currently 5 entries) with this 4-entry version:

```tsx
const SHELL_ENTRY_CARDS: ShellEntryCard[] = [
  {
    title: 'Microsoft Design Systems',
    caption: 'DS showcase',
    meta: ['Portfolio'],
    href: '/microsoft-design-systems',
    logo: SHELL_ENTRY_LOGOS.msGameDev,
    logoIdleScale: 0.9,
    logoHoverScale: 1.02,
    hoverColor: tokenValues.primitive.color.projectBrand.microsoftGameDev['500'],
    mobiusColor: tokenValues.primitive.color.projectBrand.microsoftGameDev['500'],
  },
  {
    title: 'Visual Design',
    caption: 'Work samples',
    meta: ['Portfolio'],
    href: '/visuals',
    logo: SHELL_ENTRY_LOGOS.aMark,
    logoIdleScale: 0.98,
    logoHoverScale: 1.08,
    mobiusColor: tokenValues.primitive.color.amber['400'],
  },
  {
    title: 'The Ranch Foundation',
    caption: 'Nonprofit case study',
    meta: ['Portfolio'],
    href: '/case-studies/the-ranch-foundation',
    logo: SHELL_ENTRY_LOGOS.plus, // Placeholder — Adrian to provide TRF mark in T2
    logoIdleScale: 0.92,
    logoHoverScale: 1.0,
    mobiusColor: tokenValues.primitive.color.green['500'],
  },
  {
    title: 'Vibe Sketchbook',
    caption: 'Playground',
    meta: ['Portfolio'],
    href: '/vibe-sketchbook',
    logo: SHELL_ENTRY_LOGOS.plus,
    mobiusColor: tokenValues.primitive.color.green['400'],
  },
];
```

- [ ] **Step 3: Update `TILE_HOVER_COLORS` to drop hds + hirobius keys (now unused)**

Find around line 221-226. Replace with a leaner version:

```tsx
const TILE_HOVER_COLORS = {
  visual: 'var(--semantic-color-feedback-bg-warning)',
  ranch: 'var(--semantic-color-feedback-bg-success)',
  vibe: 'var(--semantic-color-feedback-bg-success)',
} as const;
```

- [ ] **Step 4: Update the `hoverColor` switch in the JSX**

Find the `hoverColor=` prop on `<MorphCard>` (around line 353). Replace the chained ternary with:

```tsx
hoverColor={
  card.title === 'Microsoft Design Systems'
    ? mdsTileHoverColor
    : card.title === 'Visual Design'
      ? TILE_HOVER_COLORS.visual
      : card.title === 'The Ranch Foundation'
        ? TILE_HOVER_COLORS.ranch
        : card.title === 'Vibe Sketchbook'
          ? TILE_HOVER_COLORS.vibe
          : ('hoverColor' in card ? card.hoverColor : undefined)
}
```

- [ ] **Step 5: Verify the grid layout still works for 4 tiles**

The current `resolveHomeTileColumns` returns 1 / 2 / 3 columns. With 4 tiles: at xl (3 cols) → 3+1; at md (2 cols) → 2+2; at mobile (1 col) → stacked. The 3+1 layout at xl might feel uneven — if it does after Task 13's smoke test, change `resolveHomeTileColumns` to return `2` at xl as well (creating a 2x2). Decide visually.

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/hds/PortfolioHomePage.tsx
git commit -m "$(cat <<'EOF'
feat(home): update tile lineup for application-ready deploy

- Remove Hirobius Design System tile (HDS docs hidden under /ops)
- Remove Hirobius Case Study tile (still accessible via direct link)
- Add The Ranch Foundation tile (placeholder logo; real mark in T2)
- 4-tile lineup: MDS, Visual Design, Ranch, Vibe Sketchbook

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 10: Tighten Microsoft Design Systems case study

**Files:**

- Modify: `src/app/pages/hds/MicrosoftDesignSystemsPage.tsx`

Editorial work. Owner: sonnet, single agent. Independent, parallelizable with Tasks 8, 11.

- [ ] **Step 1: Read the current page top to bottom**

```bash
wc -l src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
sed -n '1,200p' src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
sed -n '200,400p' src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
sed -n '400,600p' src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
sed -n '600,800p' src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
```

(Read in chunks to keep within tool limits.)

- [ ] **Step 2: Identify the structure**

Note each `<TextLockup>` heading and section. Build a mental ToC. Identify:

- Filler paragraphs (multi-paragraph passages saying the same thing)
- Sections that could collapse to bullet lists or short paragraphs + image
- Repeated context (e.g., re-introducing the role twice)
- Sections that read as inside-baseball (won't land for an external hiring manager)

- [ ] **Step 3: Edit in place — target read-time under 2 minutes**

Apply these edits across the file:

1. **Lead with a 2-line tl;dr.** First paragraph after the hero: role + dates + one-sentence outcome. Example shape:

   > Lead Visual Designer on Xbox Design Lab v2 (2018–2020). Designed a customizable web component system for personalized Xbox controllers, adopted across XDL marketing surfaces and re-used by adjacent Xbox programs.

2. **Cut multi-paragraph runways** — any section that says something in 3 paragraphs that could say it in 2 sentences.

3. **Keep specific decisions, scope, outcomes.** A hiring manager scans for: scope of ownership, specific decisions made, measurable outcome or visible result. Keep these. Cut framing language ("In this section we explore…").

4. **Preserve every visual asset reference.** Visuals do most of the work; copy is the framing.

5. **Tighten section transitions.** No "Now that we've covered X, let's turn to Y" — let headings do the work.

6. **Target file length: ~300 lines** (down from 797). Line count is a proxy; the real criterion is read-time under 2 minutes from hero to last heading.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Verify line count**

```bash
wc -l src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
```

Expected: ~280-340 lines. If still >400, do a second editing pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/hds/MicrosoftDesignSystemsPage.tsx
git commit -m "$(cat <<'EOF'
refactor(case-study): tighten Microsoft Design Systems page

Cut filler narrative; lead with role+outcome tl;dr; preserve all
visual asset references; target hiring-manager read-time under 2
minutes.

797 → ~300 lines.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 11: Tighten Hirobius case study + add noindex

**Files:**

- Modify: `src/app/pages/hds/HirobiusCaseStudyPage.tsx`

Editorial work. Independent, parallelizable with Tasks 8, 10.

- [ ] **Step 1: Read the page**

```bash
wc -l src/app/pages/hds/HirobiusCaseStudyPage.tsx
sed -n '1,200p' src/app/pages/hds/HirobiusCaseStudyPage.tsx
sed -n '200,400p' src/app/pages/hds/HirobiusCaseStudyPage.tsx
sed -n '400,600p' src/app/pages/hds/HirobiusCaseStudyPage.tsx
sed -n '600,800p' src/app/pages/hds/HirobiusCaseStudyPage.tsx
sed -n '800,1067p' src/app/pages/hds/HirobiusCaseStudyPage.tsx
```

- [ ] **Step 2: Apply the same editing rules as Task 10, Step 3**

Target file length: ~400 lines (down from 1067). This case study legitimately has more to say (it's about building this exact site + the design system that powers it) — so the absolute target is higher than MDS, but the tightening discipline is identical.

- [ ] **Step 3: Add a noindex hint**

This page is link-only — Adrian sends to recruiters, not surfaced to Google. Add a `useEffect` in the page component that sets a `<meta name="robots" content="noindex">` tag at runtime:

Inside the component body (top of the function, before the return), add:

```tsx
useEffect(() => {
  const meta = document.createElement('meta');
  meta.name = 'robots';
  meta.content = 'noindex';
  document.head.appendChild(meta);
  return () => {
    document.head.removeChild(meta);
  };
}, []);
```

(Add `useEffect` to the existing imports if not already there.)

For the prerendered version, this only runs client-side post-hydration — search engines that respect runtime meta updates (Google does) will pick it up. T2 candidate: emit it during prerender directly. Acceptable for T1.

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

- [ ] **Step 5: Verify line count**

```bash
wc -l src/app/pages/hds/HirobiusCaseStudyPage.tsx
```

Expected: ~350-450 lines.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/hds/HirobiusCaseStudyPage.tsx
git commit -m "$(cat <<'EOF'
refactor(case-study): tighten Hirobius case study + noindex

Cut filler; preserve specific decisions/outcomes/visuals; target
hiring-manager read-time under 3 minutes. Page kept accessible
via direct link; noindex meta added so it doesn't surface in
casual Google searches.

1067 → ~400 lines.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 12: Hiring-bar audit + close gaps

**Files:**

- Create: `docs/audits/hiring-bar-audit-2026-05-10.md`
- Modify: any pages where the audit surfaces fixable issues

Owner: sonnet or opus (judgment-heavy). Last work item before SEO/build.

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

(Run in background; capture URL — typically `http://localhost:5173`.)

- [ ] **Step 2: Walk every public page**

Visit each in a browser (or via Playwright headless if Adrian is hands-off):

| Route                                | What to check                                                                                                                                        |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/`                                  | 4 tiles render, hover colors work, Mobius color shifts on hover, no console errors, mobile layout intact                                             |
| `/info`                              | Loads without error; copy is coherent (don't simplify here — that's T2)                                                                              |
| `/microsoft-design-systems`          | Read end-to-end in <2 min; assets all load; no broken images; mobile-readable                                                                        |
| `/visuals`                           | Carousel loads; bento sections render; assets load; "broken carousel" symptom from spec §5 surfaces here — note its symptom for T2 (don't fix in T1) |
| `/vibe-sketchbook`                   | Index loads; each sketch (cloth-sim, logo-lab, particle-tunnel, morph-tiles, kinetic-type, three-scene) loads without console errors                 |
| `/case-studies/hirobius`             | Read end-to-end in <3 min; assets load; noindex meta present (Inspector → `<head>`)                                                                  |
| `/case-studies/the-ranch-foundation` | Loads; sections render; placeholder visuals visible but not broken                                                                                   |
| `/lab/incubator`                     | Loads; decide if it stays or 404s — flag for §3 D5 decision in audit doc                                                                             |
| `/wet-paint`, `/portfolio/draft`     | Both 404 (verify the redirect lands on `NotFoundPage`)                                                                                               |
| `/hds/color`, `/hds/tokens`          | Both redirect to `/ops/hds/color`, `/ops/hds/tokens` (gated)                                                                                         |
| `/ops/*`                             | Password screen renders; correct password unlocks; localStorage persists across page reloads; `?key=<wrong>` does nothing                            |

- [ ] **Step 3: Write the audit document**

Create `docs/audits/hiring-bar-audit-2026-05-10.md`:

```markdown
# Hiring-Bar Audit — 2026-05-10

Run pre-deploy as part of Track 1. Each finding categorized as **fix-now** (T1 blocker), **fix-later** (T2 backlog), or **decide** (needs Adrian).

## Method

Walked every public route. Lens: would a design-systems hiring manager (Stripe / Figma / Shopify / Atlassian / Vercel) form a positive-or-negative impression in 2-5 minutes?

## Findings

### `/`

- _findings here_

### `/microsoft-design-systems`

- _findings here_

### `/visuals`

- _findings here_

### `/vibe-sketchbook`

- _findings here_

### `/case-studies/hirobius`

- _findings here_

### `/case-studies/the-ranch-foundation`

- _findings here_

### `/lab/incubator`

- Decision: keep or 404? Notes: …

### `/info`

- _findings here_

### Cross-cutting

- Mobile responsiveness on each above
- Asset load times
- Console errors / warnings
- Accessibility quick scan (heading order, alt text, focus visible)

## Fix-now actions

- _list here, with file:line references_

## Fix-later (T2 backlog appended)

- _list here_

## D5 verdict on `/lab/incubator`

- Keep / 404 / move-to-ops: **<choice>**
```

Fill in real findings. Be specific: "image at `/case-studies/hirobius` section 'Tokens' renders 404 in Network tab — file at `/assets/...png` missing" beats "broken images."

- [ ] **Step 4: Apply fix-now items**

For each fix-now finding, edit the file directly, commit per-fix or bundle related fixes. Each fix should have its own clear commit message.

Cap fix-now scope: anything that takes more than ~15 minutes to fix → T2. The audit _finds_ problems; it doesn't _solve_ large ones.

- [ ] **Step 5: Stop dev server**

```bash
# If running in background:
pkill -f "vite" 2>/dev/null || true
```

- [ ] **Step 6: Commit the audit doc + any in-T1 fixes**

```bash
git add docs/audits/hiring-bar-audit-2026-05-10.md
# plus any files changed during fix-now passes
git commit -m "$(cat <<'EOF'
docs(audits): hiring-bar audit pre-deploy

Walk all public routes, categorize findings as fix-now/fix-later/decide.
Fix-now items committed alongside this doc.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 13: SEO + meta + robots + build verify

**Files:**

- Modify: `index.html`
- Modify: `public/robots.txt`

- [ ] **Step 1: Update `public/robots.txt`**

Replace existing content with:

```
User-agent: *
Allow: /
Disallow: /ops
Disallow: /ops/
Disallow: /portfolio/draft
Disallow: /wet-paint

Sitemap: https://adrianmilsap.com/sitemap.xml
```

- [ ] **Step 2: Verify `index.html` head meta**

Read `index.html` end-to-end:

```bash
cat index.html
```

Confirm presence of:

- `<title>Adrian Milsap</title>` ✓ (already there)
- `<meta name="description" content="...">` — if missing, add `<meta name="description" content="Adrian Milsap — design systems, interaction, and visual design.">`
- `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:type">`, `<meta property="og:url">` — add any missing
- `<meta property="og:image">` ✓ (already there at /assets/xds-overview.webp — confirm the file exists)
- `<meta name="twitter:card" content="summary_large_image">` — add if missing
- Favicon `<link rel="icon">` and apple-touch-icon — verify

- [ ] **Step 3: Verify favicon + OG image present**

```bash
ls public/favicon.ico public/apple-touch-icon.png 2>/dev/null
ls public/assets/xds-overview.webp 2>/dev/null
```

If any are missing, flag in audit doc as fix-later (T1 ships without changes, T2 fixes).

- [ ] **Step 4: Run prerender build end-to-end**

```bash
pnpm build:prerender 2>&1 | tail -40
```

Expected: success, `dist/` populated.

- [ ] **Step 5: Verify each public route was prerendered**

```bash
ls dist/index.html dist/microsoft-design-systems/index.html \
   dist/visuals/index.html dist/vibe-sketchbook/index.html \
   dist/case-studies/the-ranch-foundation/index.html \
   dist/case-studies/hirobius/index.html 2>&1
```

Expected: all files exist. If any are missing, check `scripts/prerender.mjs` route list.

- [ ] **Step 6: Verify `/ops` is NOT prerendered (gate would prerender empty content)**

```bash
ls dist/ops/ 2>/dev/null
```

If `/ops/*` prerendered files exist with the gate's password screen as their content, that's actually fine (the prerendered shell shows the gate, the SPA hydrates). If `/ops/*` is excluded entirely from prerender, also fine. Either is acceptable. Note which behavior is current.

- [ ] **Step 7: Verify `dist/robots.txt` is correct**

```bash
cat dist/robots.txt
```

Expected: matches the version from Step 1.

- [ ] **Step 8: Run typecheck + layout tests as final gate**

```bash
pnpm typecheck 2>&1 | tail -5
pnpm test:layout 2>&1 | tail -20
```

Expected: both green.

- [ ] **Step 9: Commit SEO + build-verify changes**

```bash
git add public/robots.txt index.html
git commit -m "$(cat <<'EOF'
chore(seo): robots.txt disallow /ops + WIP routes; verify meta

robots.txt now blocks /ops, /portfolio/draft, /wet-paint from
crawlers. Verify index.html has full OG + Twitter meta.

Refs: site-redeploy-track1
EOF
)"
```

---

## Task 14: Pre-deploy checklist (Adrian runs this — Claude does NOT push)

This is a runbook for Adrian. **Claude does not execute these steps** (hard-rule: never push, never deploy).

- [ ] **A: Compute the OPS gate hash locally**

```bash
echo -n "<your-password>" | shasum -a 256
```

Copy the 64-char hex output.

- [ ] **B: Set in `.env.local`** (Adrian does this — Claude never touches `.env*`)

```
VITE_OPS_GATE_HASH=<paste-hash-here>
```

- [ ] **C: Run final local build**

```bash
pnpm typecheck && pnpm test:layout && pnpm build:prerender
```

All green.

- [ ] **D: Smoke-test the prerendered build locally**

```bash
pnpm exec vite preview --outDir dist
```

Open `http://localhost:4173` and verify:

- All 4 home tiles work
- `/ops` shows password screen, correct password unlocks
- `/ops/hds/color` accessible after unlock
- `/case-studies/hirobius` and `/case-studies/the-ranch-foundation` render
- `/wet-paint`, `/portfolio/draft` 404
- `/hds/color` redirects to `/ops/hds/color`

- [ ] **E: Set `VITE_OPS_GATE_HASH` in Vercel dashboard**

Production environment scope. (If using Vercel CLI: `vercel env add VITE_OPS_GATE_HASH production`.)

- [ ] **F: Merge `fix/ui-pipeline` → `main`**

Adrian's call: PR + merge, or fast-forward. (Per CLAUDE.md hard-rule, Claude does not push.)

- [ ] **G: Push `main`**

```bash
git checkout main
git push origin main
```

Vercel auto-deploys.

- [ ] **H: Smoke-test the live site**

Visit production URL. Confirm everything from step D works on the live URL. If broken: in Vercel dashboard → Deployments → previous deploy → "Promote to Production" to roll back.

- [ ] **I: Confirm Track 1 done**

Update `docs/superpowers/specs/2026-05-09-site-redeploy-application-ready.md` §9 success-criteria checkboxes. Then this plan is complete; T2 work begins separately.

---

## Parallel-dispatch guidance

After Task 1 (working tree clean) commits, the remaining tasks have these dependencies:

```
Task 1 (clean working tree)
   ↓
   ├── Task 2 + 3 + 4 (OpsGate util + component + wiring) — sequential within itself, parallel to others
   ├── Task 7 (Ranch case study scaffold)
   │     ↓
   │     Task 8 (Ranch case study content)
   ├── Task 10 (MDS case study tighten) — independent
   └── Task 11 (Hirobius case study tighten) — independent
        ↓
        Task 5 (move HDS to /ops/hds — depends on Task 4 because new routes nest under gated /ops)
        ↓
        Task 6 (404 wet-paint + draft) — depends on Task 5 (same file: routes.tsx)
        ↓
        Task 9 (homepage tile updates — depends on Task 8 because tile points to Ranch route)
        ↓
        Task 12 (hiring-bar audit — last)
        ↓
        Task 13 (SEO + build verify)
        ↓
        Task 14 (Adrian runs deploy)
```

Parallelism opportunity: Tasks 8, 10, 11 can run concurrently after Task 4 lands (file-isolated). Tasks 5+6 must be serial because both modify `routes.tsx`. Tasks 7+9 must be serial for the same reason. Task 2 can run anywhere from the start (file-isolated, only affects new files).

For **subagent-driven dispatch**, suggest these waves:

**Wave 1 (after Task 1 commit):**

- Agent A: Tasks 2 + 3 (sonnet, OpsGate util + component, file-isolated)
- Agent B: Task 10 (sonnet, MDS tighten, file-isolated, editorial)
- Agent C: Task 11 (sonnet, Hirobius tighten, file-isolated, editorial)

**Wave 2 (after Wave 1):**

- Agent D: Task 4 (sonnet, wire OpsGate into routes.tsx)
- Agent E: Tasks 7 + 8 (sonnet, Ranch scaffold + content, sequential within agent)

**Wave 3 (after Wave 2):**

- Agent F: Tasks 5 + 6 (sonnet, sequential routes.tsx edits)

**Wave 4 (after Wave 3):**

- Agent G: Task 9 (sonnet, homepage tile updates — depends on Ranch route from Task 7)

**Wave 5 (sequential, single agent — judgment-heavy):**

- Adrian or sonnet: Task 12 (audit + fixes)
- Adrian or sonnet: Task 13 (SEO + build verify)

**Wave 6:**

- Adrian only: Task 14 (deploy)

---

## Self-review pass

**Spec coverage:** every Track 1 work item from spec §4 maps to a task above:

- Spec 4.1 → Task 1 ✓
- Spec 4.2 → Task 5 ✓
- Spec 4.3 → Tasks 2, 3, 4 ✓
- Spec 4.4 → Task 9 ✓
- Spec 4.5 → Task 10 ✓
- Spec 4.6 → Task 11 ✓
- Spec 4.7 → Tasks 7, 8 ✓
- Spec 4.8 → Task 12 ✓
- Spec 4.9 → Task 13 ✓
- Spec 4.10 → Task 14 ✓
- 404'ing wet-paint/draft (called out in spec §3) → Task 6 ✓

**Decisions D1–D6 from spec §7:**

- D1 (gate mechanism: client-side + SHA-256 + 7-day TTL) → implemented in Task 2 ✓
- D2 (Hirobius noindex) → Task 11 Step 3 ✓
- D3 (Ranch placeholder slots) → Task 8 Step 2 ✓
- D4 (4 tiles) → Task 9 Step 2 ✓
- D5 (lab/incubator audit-decides) → Task 12 Step 3 (audit doc captures the verdict) ✓
- D6 (Sketchbook stays as own tile) → Task 9 Step 2 ✓

**Out-of-scope items (spec §6):** none added; T2 backlog preserved in spec §5 ✓

**Type consistency check:** `OPS_GATE_TTL_MS`, `hashPassword`, `verifyPassword`, `getStoredAccess`, `setStoredAccess`, `clearStoredAccess` exported from `ops-gate.ts` (Task 2 Step 3) and consumed in `OpsGate.tsx` (Task 3) — all names match. `VITE_OPS_GATE_HASH` referenced consistently across Tasks 3, 4, 14.
