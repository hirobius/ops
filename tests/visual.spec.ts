/**
 * Visual smoke tests.
 *
 * Run:  pnpm test:visual
 *
 * (#54) This file used to pixel-diff a `/hds/*` route matrix (86 baselines,
 * 4 viewports, light/dark) against snapshots taken when this repo hosted the
 * design-system doc gallery. That gallery now lives in the standalone
 * hirobius-design-system repo (with its own visual-regression CI); in this
 * app `/hds/*` is a client-side redirect to /ops (src/app/routes.tsx), and
 * `/ops` itself renders OpsGate's password screen under the static
 * `vite preview` build these tests run against (no /api/ops-me in a static
 * preview → authed stays false). So every one of those 86 baselines was
 * diffing the SAME gate screen against stale pre-extraction snapshots —
 * spurious red on every ops PR, unrelated to the diff.
 *
 * There's no real /ops visual baseline to restore in its place yet either:
 * the dashboard's current visual state is a known-bad, not-yet-fixed issue
 * (see the route comment below), so baselining it now would lock that in.
 * Until that's resolved and a real baseline is captured in the pinned
 * Playwright container (build 1208 — see #122), this file only smoke-tests
 * that real routes render without erroring, no pixel comparison.
 */
import { test, expect } from '@playwright/test';

test('smoke /ops renders the auth gate', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/ops');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('form')).toBeVisible();
  await expect(page.getByRole('heading', { name: '/ops' })).toBeVisible();
});

test('smoke /info renders', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/info');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('body')).toBeVisible();
});
