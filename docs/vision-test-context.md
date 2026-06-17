# Vision Test Context

Prepared from the repo on 2026-04-23.

## 1. Playwright Config

Source: `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5200',
    trace: 'on-first-retry',
  },
  // Starts a dedicated test dev server on port 5200.
  // reuseExistingServer: true — if already running (e.g. during local dev), reuse it.
  webServer: {
    command: 'node scripts/build-tokens.mjs && npx vite --port 5200',
    url: 'http://localhost:5200',
    reuseExistingServer: true,
    timeout: 60_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

## 2. Representative Existing Playwright Test

Source: `tests/visual.spec.ts`

```ts
/**
 * Visual regression — Playwright toHaveScreenshot()
 *
 * Captures viewport screenshots at mobile (375px), desktop (1280px), and TV (1920px).
 * On first run, baselines are created in tests/__screenshots__/.
 * On subsequent runs, any visual diff above threshold fails the test.
 *
 * ⚠ HOLD BASELINE CAPTURE until content is locked.
 *    Run `pnpm test:visual:update` once to commit baselines, then
 *    `pnpm test:visual` protects against regressions going forward.
 *
 * Run:            pnpm test:visual
 * Update baselines: pnpm test:visual:update
 */
import { test, expect } from '@playwright/test';

const VIEWPORTS = [
  { name: 'mobile',   width: 375,  height: 812  },
  { name: 'desktop',  width: 1280, height: 800  },
  { name: 'tv',       width: 1920, height: 1080,
    // Emulate Xbox Edge UA so UA-sniffing systems behave correctly
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/44.17763.1.0' },
];

// Curated routes — expand after content is locked
const ROUTES = [
  '/hds',
  '/hds/typography',
  '/hds/color',
  '/hds/tokens',
  '/hds/spacing',
];

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`visual [${vp.name}] ${route}`, async ({ page }) => {
      if (vp.userAgent) await page.setExtraHTTPHeaders({ 'user-agent': vp.userAgent });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      // Let animations finish before capturing
      await page.waitForTimeout(600);

      const slug = route.replace(/\//g, '-').replace(/^-/, '');
      await expect(page).toHaveScreenshot(`${vp.name}-${slug}.png`, {
        fullPage: false,   // viewport-only keeps file sizes manageable
        threshold: 0.08,   // 8% per-pixel tolerance for antialiasing/font rendering variance
        maxDiffPixels: 200,
      });
    });
  }
}
```

## 3. CI/CD Pipeline Context

### Finding

No workflow in `.github/workflows/` currently runs `playwright test` or the repo’s `test:a11y`, `test:responsive`, or `test:visual` scripts.

Workflows present in the repo:

- `.github/workflows/hds-migration-audit.yml`
- `.github/workflows/sync-figma-variables.yml`
- `.github/workflows/token-scan.yml`

The closest Playwright-related CI workflow is `token-scan.yml`, which installs Playwright Chromium and runs `pnpm scan` against preview deployments.

Source: `.github/workflows/token-scan.yml`

```yml
name: HDS Token Scan

on:
  deployment_status:

env:
  SCAN_FAIL_THRESHOLD: 0   # raise this while fixing existing violations

jobs:
  token-scan:
    if: github.event.deployment_status.state == 'success' && contains(toLower(github.event.deployment_status.environment), 'preview')
    concurrency:
      group: token-scan-${{ github.event.deployment.id || github.sha }}
      cancel-in-progress: true
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - name: Validate preview URL
        run: |
          if [ -z "${{ github.event.deployment_status.target_url }}" ]; then
            echo "Error: deployment_status event fired but target_url is empty."
            echo "       Vercel may not have set the preview URL yet. Re-run when the deployment is ready."
            exit 1
          fi

      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: latest

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'pnpm'

      - run: pnpm install --frozen-lockfile

      - run: pnpm exec playwright install chromium --with-deps

      - name: Run headless batch scan
        run: pnpm scan --url=${{ github.event.deployment_status.target_url }}

      - name: Read summary
        id: summary
        run: |
          echo "json=$(cat scans/summary.json | jq -c .)" >> $GITHUB_OUTPUT

      - name: Find associated PR
        id: pr
        uses: actions/github-script@v7
        with:
          script: |
            const prs = await github.rest.repos.listPullRequestsAssociatedWithCommit({
              owner: context.repo.owner,
              repo: context.repo.repo,
              commit_sha: context.payload.deployment?.sha ?? context.sha,
            });
            return prs.data[0]?.number ?? null;

      - name: Post PR comment
        if: steps.pr.outputs.result != 'null'
        uses: actions/github-script@v7
        env:
          SUMMARY_JSON: ${{ steps.summary.outputs.json }}
          PREVIEW_URL: ${{ github.event.deployment_status.target_url }}
          FAIL_THRESHOLD: ${{ env.SCAN_FAIL_THRESHOLD }}
        with:
          script: |
            const summary = JSON.parse(process.env.SUMMARY_JSON);
            const previewUrl = process.env.PREVIEW_URL;
            const threshold = parseInt(process.env.FAIL_THRESHOLD, 10);
            const prNumber = ${{ steps.pr.outputs.result }};

            const totalOffenders = summary.totals.offenders;
            const routeCount = summary.routes.length;
            const dirtyRoutes = summary.routes.filter(r => r.offenders > 0);

            let body;
            if (totalOffenders === 0) {
              body = [
                '<!-- hds-token-scan -->',
                '## 🔍 HDS Token Scan',
                '',
                `✅ All ${routeCount} routes clean — no token violations found.`,
                '',
                `Scanned on [preview](${previewUrl})`,
              ].join('\n');
            } else {
              const dirtyCount = dirtyRoutes.length;
              const tableRows = summary.routes.map(r => {
                const b = r.breakdown;
                if (r.status === 'error') {
                  return `| ${r.route} | ✗ error | — | — | — |`;
                }
                if (r.offenders === 0) {
                  return `| ${r.route} | ✓ | ✓ | ✓ | ✓ |`;
                }
                const hc  = b?.hardcoded     ?? 0;
                const sv  = b?.staleVars     ?? 0;
                const ui  = b?.uninventoried ?? 0;
                const tot = r.offenders;
                return `| ${r.route} | ${hc || '✓'} | ${sv || '✓'} | ${ui || '✓'} | **${tot}** |`;
              }).join('\n');

              body = [
                '<!-- hds-token-scan -->',
                '## 🔍 HDS Token Scan',
                '',
                `Scanned ${routeCount} routes on [preview](${previewUrl}) — **${totalOffenders} offenders across ${dirtyCount} route${dirtyCount === 1 ? '' : 's'}**`,
                '',
                '| Route | Hardcoded | Stale Vars | Uninventoried | Total |',
                '|-------|-----------|------------|---------------|-------|',
                tableRows,
                '',
                '<details>',
                '<summary>How to fix</summary>',
                '',
                'Run `pnpm scan:local` locally to auto-detect your preview/dev server, or pass `--url=` explicitly, then paste the relevant `scans/<route>.litcoffee` into your coding agent.',
                '</details>',
              ].join('\n');
            }

            // Find existing comment to update (dedup by marker)
            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: prNumber,
            });
            const existing = comments.data.find(c => c.body.includes('<!-- hds-token-scan -->'));

            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber,
                body,
              });
            }

      - name: Fail if violations exceed threshold
        run: |
          OFFENDERS=$(cat scans/summary.json | jq '.totals.offenders')
          if [ "$OFFENDERS" -gt "$SCAN_FAIL_THRESHOLD" ]; then
            echo "✗ $OFFENDERS token violations exceed threshold of $SCAN_FAIL_THRESHOLD"
            exit 1
          fi
```

Supplemental local test script context from `package.json`:

```json
{
  "test": "vitest run --passWithNoTests",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit -p tsconfig.typecheck.json",
  "test:a11y": "playwright test tests/a11y.spec.ts",
  "test:responsive": "playwright test tests/responsive.spec.ts",
  "test:visual": "playwright test tests/visual.spec.ts",
  "test:visual:update": "playwright test tests/visual.spec.ts --update-snapshots",
  "check:release": "pnpm check:full && node scripts/check-inline-styles.mjs && node scripts/check-style-prop-values.mjs && pnpm build && node scripts/check-route-smoke.mjs && pnpm test:a11y && pnpm test:responsive"
}
```

## 4. Motion Handling Context

### Brief Summary

- Global `motion/react` handling is OS-preference-driven via `<MotionConfig reducedMotion="user">` in `src/app/App.tsx`.
- CSS also respects reduced motion in two places:
  - `src/styles/index.css` disables broad global transitions.
  - `src/styles/theme.css` zeros the primitive and semantic HDS motion duration vars to `0s` and disables `.hds-page-enter`.
- Motion tokens are centralized in `src/app/design-system/tokens.ts`, where design-token durations are converted from ms to seconds for `motion/react`.
- Components generally apply motion through `hds.motion.*` token values instead of raw literals.
- I did not find a repo-wide user-facing reduced-motion toggle. The only global switch is the OS/browser `prefers-reduced-motion` signal. There is also a Mobius-specific store path that mirrors that media query into Zustand state for scene behavior.

### Global MotionConfig

Source: `src/app/App.tsx`

```tsx
import { Component, type ReactNode } from 'react';
import { RouterProvider } from 'react-router';
import { MotionConfig } from 'motion/react';
import { IconContext } from '@phosphor-icons/react';
import hds from './design-system/tokens';
import { LanguageProvider } from './context/LanguageContext';
import { router } from './routes';

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    const { error } = this.state;
    if (error) return (
      <div style={{ padding: 32, fontFamily: hds.monoFamily, whiteSpace: 'pre-wrap', color: 'red' }}> {/* spacing-ok: error boundary fallback, not a UI component */}
        <strong>Runtime error:</strong>{'\n'}{(error as Error).message}{'\n\n'}{(error as Error).stack}
      </div>
    );
    return this.props.children;
  }
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <IconContext.Provider
        value={{
          weight: 'bold',
          mirrored: false,
          size: hds.iconSize.small,
          className: 'hds-phosphor-icon',
          style: {
            display: 'block',
            flexShrink: 0,
            aspectRatio: '1 / 1',
          },
        }}
      >
        <LanguageProvider>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </LanguageProvider>
      </IconContext.Provider>
    </MotionConfig>
  );
}
```

### CSS Reduced-Motion Handling

Source: `src/styles/index.css`

```css
@import './fonts.css';
@import './theme.css';
@import './utilities.css';

/* Smooth theme switching */
body,
*,
*::before,
*::after {
  transition:
    background-color 0.3s ease-out,
    color 0.3s ease-out,
    border-color 0.3s ease-out,
    fill 0.3s ease-out,
    stroke 0.3s ease-out;
}

@media (prefers-reduced-motion: reduce) {
  body,
  *,
  *::before,
  *::after {
    transition: none;
  }
}

svg[data-hds-icon],
svg.hds-phosphor-icon,
svg.lucide {
  display: block;
  flex-shrink: 0;
  aspect-ratio: 1 / 1;
  max-width: 100%;
  max-height: 100%;
}

svg.hds-phosphor-icon:not([width]):not([height]),
svg.lucide:not([width]):not([height]) {
  width: 1em;
  height: 1em;
}
```

Source: `src/styles/theme.css` excerpt

```css
/* --- Page enter animation ---------------------------------------------------
 * Replaces <motion.div initial={{ opacity: 0, y: 2 }} ...> page wrappers.
 * Same values: 300ms, cubic-bezier(0.42, 0, 0.58, 1) (easing.standard), y 2px.
 * Respects prefers-reduced-motion via the existing @media block at the bottom. */
@keyframes hds-page-enter {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}
.hds-page-enter {
  animation: hds-page-enter var(--hds-motion-spatial-duration) var(--hds-motion-spatial-easing) both;
}

/* --- Audit overlay --------------------------------------------------------- */
@media (prefers-reduced-motion: reduce) {
  .hds-page-enter { animation: none; }
  :root {
    --primitive-duration-instant: 0s;
    --primitive-duration-short: 0s;
    --primitive-duration-medium: 0s;
    --primitive-duration-long: 0s;
    --hds-motion-productive-duration: 0s;
    --hds-motion-expressive-duration: 0s;
    --hds-motion-spatial-duration: 0s;
    --hds-motion-exit-duration: 0s;
  }
}

/* -- Reduced motion — WCAG 2.3.3 --------------------------------------------
 * Zeroes all HDS duration tokens when the user has requested reduced motion.
 * CSS transitions resolve to instant; Motion animations are handled separately
 * via <MotionConfig reducedMotion="user"> in Root.tsx.
 *
 * Inspired by: IBM Carbon (motion.duration tokens mapped to 0ms),
 * Apple HIG (legal accessibility requirement in many jurisdictions),
 * Adobe Spectrum (MotionContext with reducedMotion flag).
 *
 * "Never assume a user wants animation." — IBM Carbon motion guidelines.
 * --------------------------------------------------------------------------- */
```

### Motion Tokens

Source: `src/app/design-system/tokens.ts` excerpt

```ts
import React from 'react';
import { tokenValues } from './generated-token-values';
import { tokenRefs } from './generated-token-refs';

const FONT_FAMILY_PRIMARY = 'var(--primitive-typography-family-primary)';
const FONT_FAMILY_MONO = 'var(--primitive-typography-family-mono)';
const msToSeconds = (value: string) => parseFloat(value) / 1000;

const motion = {
  productive: {
    duration: msToSeconds(tokenValues.primitive.duration.short),
    easing: [0, 0, 0.2, 1] as [number, number, number, number],
  },
  expressive: {
    duration: msToSeconds(tokenValues.primitive.duration.medium),
    easing: { type: 'spring', stiffness: 300, damping: 20, mass: 1 } as const,
  },
  spatial: {
    duration: msToSeconds(tokenValues.primitive.duration.long),
    easing: [0.4, 0, 0.2, 1] as [number, number, number, number],
  },
  exit: {
    duration: msToSeconds(tokenValues.primitive.duration.instant),
    easing: [0.4, 0, 1, 1] as [number, number, number, number],
  },
} as const;
```

Source: `src/app/pages/hds/MotionPage.tsx` excerpt

```tsx
function ProductivePreview() {
  const visible = useToggleCycle(1400, 500);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="p"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: hds.motion.productive.duration, ease: hds.motion.productive.easing }}
            style={ASSET_STYLE}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function ExpressivePreview() {
  const visible = useToggleCycle(1800, 700);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="e"
            initial={{ opacity: 0, scale: 0.84 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.84 }}
            transition={hds.motion.expressive.easing}
            style={ASSET_STYLE}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function SpatialPreview() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%', overflow: 'hidden' }}>
      <motion.div
        animate={{ x: [-56, 56] }}
        transition={{
          duration: hds.motion.spatial.duration,
          ease: hds.motion.spatial.easing,
          repeat: Infinity,
          repeatType: 'reverse',
          repeatDelay: 0.4,
        }}
        style={ASSET_STYLE}
      />
    </div>
  );
}

function ExitPreview() {
  const visible = useToggleCycle(1400, 700);
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            key="x"
            initial={{ opacity: 1, y: 0 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: hds.motion.exit.duration, ease: hds.motion.exit.easing }}
            style={ASSET_STYLE}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

### Mobius-Specific Reduced-Motion Path

Source: `src/app/stores/mobiusStore.ts` excerpt

```ts
export function createMobiusStore() {
  const reducedMotion =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;

  return create<MobiusState>()((set) => ({
    ...MOBIUS_DEFAULTS,
    ...HIDDEN_LAYOUT,
    ...DEFAULT_ROUTE_SPLASH,
    activePreset:    'home',
    performanceTier: 'high',
    reducedMotion,
    navScrollVisible: true,
    navScrollProgress: 0,
    navAcrylicHovered: false,
  }));
}
```

Source: `src/app/components/MobiusLogo.tsx` excerpt

```tsx
  useEffect(() => {
    // 1. Brand color from token cascade
    const color = readCssVar('--semantic-color-surface-accent') || tokenValues.primitive.color.blue['500'];
    setUniforms({ color });

    // 2. Reduced motion — initialize + live listener
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleMqChange = (e: MediaQueryListEvent) => {
      useMobiusStore.setState({ reducedMotion: e.matches });
    };
    useMobiusStore.setState({ reducedMotion: mq.matches });
    mq.addEventListener('change', handleMqChange);

    return () => mq.removeEventListener('change', handleMqChange);
  }, [setUniforms, setPerformanceTier]);
```
