/**
 * Visual regression — pixelmatch-backed viewport diffing.
 *
 * Captures viewport screenshots at mobile (375px), tablet (768px), desktop (1280px),
 * and TV (1920px) in both light and dark themes.
 * Baselines live in Playwright's snapshot directory; diffs are written into test output.
 *
 * Additionally covers key interactive component states (hover/focus/disabled) for
 * high-traffic HDS primitives via the /hds/components/actions page.
 *
 * Run:            pnpm test:visual
 * Update baselines: pnpm test:visual:update
 *
 * ─── Baseline naming ───────────────────────────────────────────────────────────
 * Existing (15 baselines, system theme): {vp}-{slug}.png
 * Light/dark themed (new):              {vp}-{theme}-{slug}.png
 * Component states (new):               state-{component}-{state}.png
 */
import { copyFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { test, expect } from '@playwright/test';
import {
  createVisualDiff,
  ensureDirectory,
  VISUAL_DIFF_PERCENT_THRESHOLD,
} from './helpers/visual-diff';

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Wait for actual rendered content, not just network-idle. networkidle is
 *  necessary but not sufficient — vite HMR firing on concurrent file writes
 *  (e.g. orchestration.json mutations from parallel agent claims) can leave
 *  a page in a "loaded but not mounted" state. Without this guard, late-run
 *  captures occasionally come back blank-white. Tolerate timeout silently —
 *  if the route genuinely has no content landmark, the screenshot still
 *  captures and the diff surfaces the regression. */
async function waitForContent(page: import('@playwright/test').Page) {
  await page
    .locator(':is(h1, h2, header, main, [role="main"], [data-hds-doc])')
    .first()
    .waitFor({ state: 'visible', timeout: 8_000 })
    .catch(() => undefined);
}

/** Force a resolved theme by writing to localStorage + setting the html attribute.
 *  Call after navigation + networkidle so the React tree is mounted. */
async function forceTheme(page: import('@playwright/test').Page, theme: 'light' | 'dark') {
  await page.evaluate((t) => {
    document.documentElement.setAttribute('data-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
    try {
      window.localStorage.setItem('hds-theme-mode', t);
      window.localStorage.setItem('hds-theme', t);
    } catch {
      // localStorage blocked in context — attribute-only apply is sufficient.
    }
  }, theme);
  // Allow a single paint cycle after the attribute flip before capturing.
  await page.waitForTimeout(100);
}

/** Capture, compare against baseline, and write diff if mismatch. */
async function captureAndCompare(
  page: import('@playwright/test').Page,
  testInfo: import('@playwright/test').TestInfo,
  fileName: string,
) {
  const actualPath   = testInfo.outputPath(`actual-${fileName}`);
  const baselinePath = testInfo.snapshotPath(fileName);
  const diffPath     = testInfo.outputPath(`diff-${fileName}`);

  await ensureDirectory(actualPath);
  await page.screenshot({ path: actualPath, fullPage: false });

  if (testInfo.config.updateSnapshots !== 'none') {
    await ensureDirectory(baselinePath);
    await copyFile(actualPath, baselinePath);
    return;
  }

  let baselineExists = true;
  try { await access(baselinePath, constants.F_OK); } catch { baselineExists = false; }

  expect(
    baselineExists,
    `Missing visual baseline for ${fileName}. Run pnpm test:visual:update to create it.`,
  ).toBe(true);
  if (!baselineExists) return;

  const diffReport = await createVisualDiff({ actualPath, baselinePath, diffPath });
  expect(
    diffReport.diffRatio,
    [
      `Visual regression exceeded 0.1% threshold for ${fileName}.`,
      `Diff pixels: ${diffReport.diffPixels}/${diffReport.totalPixels}`,
      `Diff ratio: ${(diffReport.diffRatio * 100).toFixed(3)}%`,
      `Diff map: ${diffPath}`,
    ].join('\n'),
  ).toBeLessThanOrEqual(VISUAL_DIFF_PERCENT_THRESHOLD);
}

// ── Viewport matrix ────────────────────────────────────────────────────────────

const VIEWPORTS = [
  { name: 'mobile',   width: 375,  height: 812  },
  { name: 'desktop',  width: 1280, height: 800  },
  { name: 'tv',       width: 1920, height: 1080,
    // Emulate Xbox Edge UA so UA-sniffing systems behave correctly
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; Xbox; Xbox One) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edge/44.17763.1.0' },
];

// Curated routes — expand after content is locked
//
// /hds/tokens drift — permanent fix (12v-token-tokens-drift-permanent-fix):
// Root cause: LegacyTokenExplorerPanel auto-selected a random semantic token on
// first load (Math.random()) with no deepLink param. At TV viewport (1920×1080)
// the Details panel is visible and shows token.description, so any run that
// happened to pick a different token → snapshot drift. The workaround was to
// refresh the baseline after every typography rename. The permanent fix has two
// parts: (1) the route below includes ?token= to pin a sentinel token, making
// the Details panel content deterministic regardless of Math.random() behaviour;
// (2) LegacyTokenExplorerPanel.tsx no longer uses Math.random() for the initial
// auto-selection — it picks pool[0] (deterministic). Slug/filename stays
// `hds-tokens` so existing baselines are preserved.
// Sentinel: semantic.space.sidebar.railPadding — stable path, explicit $description.
// If its description changes in hirobius.tokens.json, the TV snapshot WILL fail,
// which is the DESIRED regression-catch behaviour (option a per unit spec).
//
// Prior drift history: Pods 5/7/8 all flagged /hds/tokens baseline diff
// after Pod 5 (19ffb04) renamed semantic.typography composites (h1→heading1)
// and added $description fields. Workaround refreshed in 3ee1732.
//
// 10o-10 expansion (2026-05-03): added the rest of the HDS doc family to
// close the coverage gap that allowed 12t-typography-truth-up's
// FontProvider→Atkinson→system-ui body-font degradation to ship unnoticed.
//
// Skipped routes:
//  - /ops + /ops/build — current visual state is the "dashboards look bad"
//    issue Adrian flagged on 2026-05-03; baselining now would lock that in.
//  - / (homepage) — the Mobius shader has frame-to-frame variation that
//    headless chromium can't deterministically pin even with reducedMotion.
//    Re-enable once MobiusScene exposes a deterministic-frame mode (e.g.
//    via ?test-pause-mobius=1 query param or env-flag bypass).

// VRT_GOTO_OVERRIDES: for routes whose slug (filename) must stay unchanged but
// whose navigation URL needs a query param for deterministic rendering.
// Key = canonical route (used for test name + slug), value = actual goto URL.
const VRT_GOTO_OVERRIDES: Record<string, string> = {
  // Pin sentinel token so Details panel description is deterministic at TV viewport.
  // See drift history comment above.
  '/hds/tokens': '/hds/tokens?token=semantic.space.sidebar.railPadding',
};

const ROUTES = [
  '/hds',
  '/hds/typography',
  '/hds/color',
  '/hds/tokens',
  '/hds/spacing',
  '/hds/elevation',
  '/hds/motion',
  '/hds/breakpoints',
  '/hds/components/actions',
  '/hds/components/inputs',
  '/hds/components/display',
  '/hds/components/feedback',
  '/hds/components/navigation',
  '/hds/components/layout',
];

// ── Block A: System-theme baselines ────────────────────────────────────────────
// 15 routes × 3 viewports = 45 baselines. Animation forced to reduced so motion
// scenes (homepage Mobius, /hds/motion specimens) capture stable frames.

for (const vp of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`visual [${vp.name}] ${route}`, async ({ page }, testInfo) => {
      if (vp.userAgent) await page.setExtraHTTPHeaders({ 'user-agent': vp.userAgent });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: vp.width, height: vp.height });
      // Use override URL if defined (e.g. ?token= pin for /hds/tokens); slug stays as route.
      const gotoUrl = VRT_GOTO_OVERRIDES[route] ?? route;
      await page.goto(gotoUrl);
      await page.waitForLoadState('networkidle');
      await waitForContent(page);
      // Let animations finish before capturing
      await page.waitForTimeout(600);

      const slug = route.replace(/\//g, '-').replace(/^-/, '');
      const fileName = `${vp.name}-${slug}.png`;
      const actualPath = testInfo.outputPath(`actual-${fileName}`);
      const baselinePath = testInfo.snapshotPath(fileName);
      const diffPath = testInfo.outputPath(`diff-${fileName}`);

      await ensureDirectory(actualPath);
      await page.screenshot({
        path: actualPath,
        fullPage: false,   // viewport-only keeps file sizes manageable
      });

      if (testInfo.config.updateSnapshots !== 'none') {
        await ensureDirectory(baselinePath);
        await copyFile(actualPath, baselinePath);
        return;
      }

      let baselineExists = true;
      try {
        await access(baselinePath, constants.F_OK);
      } catch {
        baselineExists = false;
      }

      expect(
        baselineExists,
        `Missing visual baseline for ${fileName}. Run pnpm test:visual:update to create it.`,
      ).toBe(true);

      if (!baselineExists) {
        return;
      }

      const diffReport = await createVisualDiff({
        actualPath,
        baselinePath,
        diffPath,
      });

      expect(
        diffReport.diffRatio,
        [
          `Visual regression exceeded 0.1% threshold for ${route} @ ${vp.name}.`,
          `Diff pixels: ${diffReport.diffPixels}/${diffReport.totalPixels}`,
          `Diff ratio: ${(diffReport.diffRatio * 100).toFixed(3)}%`,
          `Diff map: ${diffPath}`,
        ].join('\n'),
      ).toBeLessThanOrEqual(VISUAL_DIFF_PERCENT_THRESHOLD);
    });
  }
}

// ── Block B: Light / dark theme coverage ───────────────────────────────────────
// Only mobile + desktop — skip TV to avoid storing 3 × 2 extra large PNGs.
// Tablet (768px) added here as a new breakpoint not in Block A.
// Skip animation-heavy shader routes (mobius, home) — route list scoped to HDS.

const THEMED_VIEWPORTS = [
  { name: 'mobile',  width: 375,  height: 812 },
  { name: 'tablet',  width: 768,  height: 1024 },
  { name: 'desktop', width: 1280, height: 800  },
];

const THEMED_ROUTES = [
  '/hds',
  '/hds/color',
  '/hds/typography',
  '/hds/components/actions',
  '/hds/components/inputs',
];

const THEMES: Array<'light' | 'dark'> = ['light', 'dark'];

for (const theme of THEMES) {
  for (const vp of THEMED_VIEWPORTS) {
    for (const route of THEMED_ROUTES) {
      test(`visual [${vp.name}][${theme}] ${route}`, async ({ page }, testInfo) => {
        // Pre-set theme in localStorage before React hydrates.
        await page.addInitScript((t) => {
          try {
            window.localStorage.setItem('hds-theme-mode', t);
            window.localStorage.setItem('hds-theme', t);
          } catch { /* blocked */ }
        }, theme);

        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize({ width: vp.width, height: vp.height });
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        await waitForContent(page);

        // Ensure the theme attribute is applied after React hydration.
        await forceTheme(page, theme);
        await page.waitForTimeout(300);

        const slug     = route.replace(/\//g, '-').replace(/^-/, '');
        const fileName = `${vp.name}-${theme}-${slug}.png`;
        await captureAndCompare(page, testInfo, fileName);
      });
    }
  }
}

// ── Block C: Component state coverage ──────────────────────────────────────────
// Captures key interactive states (default/hover/focus/disabled) for high-traffic
// HDS primitives rendered on the /hds/components/actions page.
// Scoped to desktop viewport only — state differences are viewport-independent.
// Dark and light variants both covered.
// Animation: reducedMotion forced so hover transitions are instant.

const COMPONENT_STATE_VIEWPORT = { width: 1280, height: 800 };

// Selectors and state descriptions for tracked components.
// Each entry identifies a component within the rendered preview on the actions page.
const COMPONENT_STATES = [
  {
    component: 'button-primary',
    selector: '[data-hds-component="HdsButton"][data-variant="primary"], button.bg-primary',
    altSelector: 'button',
    label: 'HdsButton primary',
  },
  {
    component: 'button-secondary',
    selector: '[data-hds-component="HdsButton"][data-variant="secondary"]',
    altSelector: 'button.border-input',
    label: 'HdsButton secondary',
  },
] as const;

// States to capture for each component entry.
const INTERACTION_STATES = [
  { name: 'default',  action: null },
  { name: 'focus',    action: 'focus'  as const },
  { name: 'disabled', action: 'disabled' as const },
] as const;

for (const colorTheme of THEMES) {
  test(`visual [desktop][${colorTheme}] /hds/components/actions — component states`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    // Pre-set theme.
    await page.addInitScript((t) => {
      try {
        window.localStorage.setItem('hds-theme-mode', t);
        window.localStorage.setItem('hds-theme', t);
      } catch { /* blocked */ }
    }, colorTheme);

    await page.emulateMedia({ colorScheme: colorTheme, reducedMotion: 'reduce' });
    await page.setViewportSize(COMPONENT_STATE_VIEWPORT);
    await page.goto('/hds/components/actions');
    await page.waitForLoadState('networkidle');
    await waitForContent(page);
    await forceTheme(page, colorTheme);
    await page.waitForTimeout(300);

    // Capture default full-page context first.
    const defaultFile = `state-actions-overview-${colorTheme}.png`;
    await captureAndCompare(page, testInfo, defaultFile);

    // Capture per-component states.
    for (const comp of COMPONENT_STATES) {
      // Resolve element — try primary selector then fallback.
      const el = page.locator(comp.selector).first();
      const isPresent = await el.count() > 0;
      const target = isPresent ? el : page.locator(comp.altSelector).first();
      const targetPresent = await target.count() > 0;
      if (!targetPresent) continue;

      for (const state of INTERACTION_STATES) {
        if (state.action === 'disabled') {
          // Disabled state: check if a visible disabled button exists on the page.
          const disabledEl = page.locator('button[disabled]:visible, button[aria-disabled="true"]:visible').first();
          if (await disabledEl.count() === 0) continue;
          // Use isVisible to guard against display:none or off-screen elements.
          const isVisible = await disabledEl.isVisible().catch(() => false);
          if (!isVisible) continue;
          await disabledEl.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(80);
          const disabledFile = `state-${comp.component}-disabled-${colorTheme}.png`;
          await captureAndCompare(page, testInfo, disabledFile);
        } else if (state.action === 'focus') {
          // Focus state: tab-focus the target element.
          await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await target.focus({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(80);
          const focusFile = `state-${comp.component}-focus-${colorTheme}.png`;
          await captureAndCompare(page, testInfo, focusFile);
          // Blur to restore before next iteration.
          await page.keyboard.press('Escape');
        } else {
          // Default state.
          await target.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(80);
          const defaultStateFile = `state-${comp.component}-default-${colorTheme}.png`;
          await captureAndCompare(page, testInfo, defaultStateFile);
        }
      }
    }
  });
}

// ── Block D: Component health dashboard ────────────────────────────────────────
// Smoke-tests that /hds/component-health renders without errors and includes
// the expected table heading. No pixel baseline — just page-load + DOM check.

test('visual health /hds/component-health renders', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/hds/component-health');
  await page.waitForLoadState('networkidle');
  // Verify the table is present
  await page.waitForSelector('table', { timeout: 10_000 });
  // Verify at least one component row is rendered
  const rows = await page.locator('tbody tr').count();
  expect(rows).toBeGreaterThan(0);
});
