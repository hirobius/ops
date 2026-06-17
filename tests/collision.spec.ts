/**
 * Layout collision + overflow audit — full route sweep.
 *
 * Checks every major route at mobile, narrow-desktop, and desktop viewports
 * for grid item collisions (Gap Mandate) and text overflow (Containment Rule).
 *
 * Run:  pnpm test:collision
 * CI:   included in check:release
 */

import { test, expect } from '@playwright/test';
import { auditPageLayout } from './helpers/layout-audit';

const VIEWPORTS = [
  { name: 'mobile',          width: 375,  height: 812 },
  { name: 'narrow-desktop',  width: 1024, height: 768 },
  { name: 'desktop',         width: 1280, height: 800 },
] as const;

const ROUTES = [
  '/hds',
  '/hds/typography',
  '/hds/color',
  '/hds/spacing',
  '/hds/tokens',
  '/hds/components/actions',
  '/hds/components/inputs',
  '/hds/components/display',
  '/hds/components/navigation',
  '/hds/components/layout',
] as const;

for (const viewport of VIEWPORTS) {
  for (const route of ROUTES) {
    test(`integrity [${viewport.name}] ${route}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);

      const report = await page.evaluate(auditPageLayout);

      expect(
        report.gridCollisions,
        `UI COLLISION DETECTED: Sibling grid items are overlapping on ${route} @ ${viewport.name}\n`
          + report.gridCollisions.map((i) => `  - ${i.target}: ${i.detail}`).join('\n'),
      ).toEqual([]);

      expect(
        report.textOverflows,
        `OVERFLOW DETECTED: Content is bleeding out of its container on ${route} @ ${viewport.name}\n`
          + report.textOverflows.map((i) => `  - ${i.target}: ${i.detail}`).join('\n'),
      ).toEqual([]);
    });
  }
}
